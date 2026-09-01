/**
 * Chapter-Based Rendering Service
 *
 * Phase D W6: For videos longer than 3 minutes, splits the composition
 * into chapters at scene boundaries, renders each chapter independently
 * on separate Lambda invocations, then concatenates the results.
 *
 * This enables rendering of 5-minute, 10-minute, or even 1-hour videos
 * that would timeout on a single Lambda invocation (max 10 minutes).
 *
 * Architecture:
 *   Long video → detect chapter boundaries → N independent renders
 *   → each chapter has its own Vercel timeout → concatenate via FFmpeg
 *   → single output MP4
 */

import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import {
  REMOTION_AUDIO_CODEC,
  REMOTION_COMPOSITION_ID,
  REMOTION_FRAMES_PER_LAMBDA,
} from './remotion-constants';
import { getDatabase } from '@/lib/editron/db/mongodb';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';
import { isChapterConcatConfigured, enqueueChapterConcat } from './chapter-concat-client';
import {
  assertProjectChapterConcatTargetV1,
  createProjectChapterConcatTargetV1,
  type ProjectChapterConcatSourceV1,
  type ProjectChapterConcatTargetV1,
} from './chapter-concat-contract-v1';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import { assertRemotionSiteFresh } from './remotion-site-version';
import {
  ProjectRenderJobAuthorizationSchema,
  type ProjectRenderJobAuthorizationV1,
} from './render-job-service';
import type { RenderJobChapterOrchestrationStateV1 } from '@/lib/editron/schemas/render-job';
import {
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from './project-render-snapshot-binding-v1';
import { sameProjectArtifactRevisionV1 } from './project-artifact-invalidation-v1';
import {
  assertChapterChildDispatchV1,
  ChapterChildProviderTupleSchemaV1,
  createChapterChildDispatchV1,
  markChapterChildDispatchAttemptingV1,
  bindChapterChildDispatchV1,
  quarantineChapterChildDispatchV1,
  fenceChapterChildProjectRevisionV1,
  reconcileChapterChildTerminalCallbackV1,
  type ChapterChildProjectRevisionReaderV1,
  type ChapterChildTerminalEventV1,
  type ChapterChildDispatchV1,
} from './chapter-render-dispatch-v1';
import {
  createChapterLayoutManifestV1,
  parseChapterLayoutManifestV1,
  type ChapterLayoutManifestV1,
  type ChapterLayoutPolicyV1,
  type ChapterLayoutProjectTimebaseV1,
} from './chapter-layout-contract-v1';
import { readCanonicalFrameRateV1 } from '../contracts/canonical-media-time-v1';

// ─── Configuration ────────────────────────────────────────────────

/**
 * Chapter policy is a duration policy, not a 30-fps frame-count policy.  The
 * caller still supplies a numeric render FPS today; rational/VFR source
 * identity belongs to the later canonical-media spine.
 */
const CHAPTER_SPLIT_THRESHOLD_SECONDS = 15 * 60;
const TARGET_CHAPTER_SECONDS = 2.5 * 60;
const MIN_CHAPTER_SECONDS = 30;

/**
 * AWS Lambda concurrent-execution budget to spend on chapter renders at once.
 *
 * Each chapter fans out into ~ceil(durationFrames / REMOTION_FRAMES_PER_LAMBDA) renderer Lambdas.
 * startPendingChapters() admits pending chapters while the estimated in-flight renderer Lambdas stay
 * under this budget; the progress poller admits more as chapters finish. This replaces the old fixed
 * "1 chapter at a time" cap, which was correct only on a ~10-concurrency AWS account. The Insturix
 * account is at the 1000 concurrent-execution quota, so we spend up to 800 and leave ~200 headroom for
 * the per-chapter orchestrator functions, progress polls, and other Lambda traffic.
 */
const LAMBDA_CONCURRENCY_BUDGET = 800;

export const CHAPTERS_COLLECTION = 'editron_render_chapters';

// ─── Types ────────────────────────────────────────────────────────

interface Chapter {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  /** Render ID from Lambda (set after render starts) */
  renderId?: string;
  /** Real Remotion bucket for this chapter render. */
  bucketName?: string;
  /** Exact AWS region returned to the child provider invocation. */
  region?: string;
  /** Exact provider output size, persisted when progress reports completion. */
  outputSize?: number;
  /** Deterministic handoff linkage for a later child-cleanup owner. */
  parentAdmissionId?: string;
  /** Strict per-child provider dispatch ledger; absent only on legacy rows. */
  dispatch?: ChapterChildDispatchV1;
  /** Render status */
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  /** Output URL (set after render completes) */
  outputUrl?: string;
  /** Error message if failed */
  error?: string;
}

interface ChapterRenderJob {
  _id: string; // render job ID
  projectId: string;
  userId: string;
  chapters: Chapter[];
  status: 'splitting' | 'rendering' | 'concatenating' | 'completed' | 'failed';
  totalFrames: number;
  /** Full absolute composition overlays. Chapters crop by frameRange instead of rebasing overlay time. */
  overlays: Overlay[];
  fps: number;
  width: number;
  height: number;
  /** Full server-owned PROJECT_SNAPSHOT binding for strict chapter jobs. */
  projectRenderSnapshotBinding?: ProjectRenderSnapshotBindingV1;
  /** Immutable frame layout identity for strict chapter jobs. */
  chapterLayoutManifest?: ChapterLayoutManifestV1;
  /** Exact project owner from the snapshot binding; legacy rows may omit it. */
  ownerId?: string;
  /** Selected AWS region for this job; legacy rows may omit it. */
  region?: string;
  /** Public child callback endpoint; the secret is never persisted. */
  chapterWebhookUrl?: string;
  /** Final concatenated video URL */
  outputUrl?: string;
  /** Immutable strict concat input/output identity, persisted before QStash dispatch. */
  concatTarget?: ProjectChapterConcatTargetV1;
  /** Lease fencing prevents duplicate concat deliveries from running concurrently. */
  concatLease?: {
    claimToken: string;
    claimedAt: Date;
    leaseExpiresAt: Date;
  };
  concatAttempts?: number;
  /** Exact Modal result identity retained for finalization and delivery audits. */
  concatResult?: {
    generation: string;
    sourceManifestHash: string;
    outputBucket: string;
    outputRegion: string;
    outputKey: string;
    url: string;
    sizeBytes: number;
    chapters: number;
    completedAt: Date;
  };
  concatStatus?: 'queued' | 'running' | 'done' | 'failed';
  concatError?: string;
  /** Explicit lifecycle fence; rows without it require the legacy migration owner. */
  artifactLifecycleVersion: 1;
  /** Transient chapter outputs may be mutated only while this row is active. */
  artifactState: 'ACTIVE' | 'STALE';
  /** Cleanup must finish before the later retention owner may delete this row. */
  retentionState: 'RETAINED' | 'CLEANUP_PENDING';
  artifactInvalidatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** Earliest retirement time; cleanup receipts and a transactional tombstone are still required. */
  expiresAt?: Date;
}

// ─── Chapter Detection ────────────────────────────────────────────

/**
 * Detect natural chapter boundaries from overlay positions.
 * Splits at scene transitions (gaps between video overlays on row 2)
 * or at transition overlays (row 1).
 */
export function detectChapterBoundaries(
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
): { startFrame: number; endFrame: number }[] {
  const chapterPolicy = chapterFramePolicy(fps);
  if (totalFrames <= chapterPolicy.splitThresholdFrames) {
    // Short video — single chapter, no splitting needed
    return [{ startFrame: 0, endFrame: totalFrames }];
  }

  // Find all scene boundaries (where video overlays start/end on row 2)
  const videoOverlays = overlays
    .filter(o => o.type === 'video' && o.row === ROW.VIDEO)
    .sort((a, b) => a.from - b.from);

  if (videoOverlays.length === 0) {
    return [{ startFrame: 0, endFrame: totalFrames }];
  }

  // Collect potential split points (between video overlays)
  const splitPoints: number[] = [];
  for (let i = 1; i < videoOverlays.length; i++) {
    const prevEnd = videoOverlays[i - 1].from + videoOverlays[i - 1].durationInFrames;
    const nextStart = videoOverlays[i].from;
    // Use the midpoint of the gap (or the start of the next clip)
    splitPoints.push(Math.round((prevEnd + nextStart) / 2));
  }

  // Build chapters using split points, targeting the same duration at every numeric render FPS.
  const chapters: { startFrame: number; endFrame: number }[] = [];
  let chapterStart = 0;

  for (const splitPoint of splitPoints) {
    const chapterLength = splitPoint - chapterStart;

    if (chapterLength >= chapterPolicy.targetFrames) {
      chapters.push({ startFrame: chapterStart, endFrame: splitPoint });
      chapterStart = splitPoint;
    }
  }

  // Final chapter: everything from last split to end
  if (chapterStart < totalFrames) {
    const lastChapterLength = totalFrames - chapterStart;

    if (lastChapterLength < chapterPolicy.minimumFrames && chapters.length > 0) {
      // Too short — merge with previous chapter
      chapters[chapters.length - 1].endFrame = totalFrames;
    } else {
      chapters.push({ startFrame: chapterStart, endFrame: totalFrames });
    }
  }

  // If no chapters were created (no good split points), fall back to even splits
  if (chapters.length === 0) {
    const numChapters = Math.ceil(totalFrames / chapterPolicy.targetFrames);
    const framesPerChapter = Math.ceil(totalFrames / numChapters);
    for (let i = 0; i < numChapters; i++) {
      const start = i * framesPerChapter;
      const end = Math.min((i + 1) * framesPerChapter, totalFrames);
      chapters.push({ startFrame: start, endFrame: end });
    }
  }

  return chapters;
}

// ─── Render Orchestration ─────────────────────────────────────────

/**
 * Check if a composition should use chapter-based rendering.
 */
export function shouldUseChapterRendering(totalFrames: number, fps: number): boolean {
  return totalFrames > chapterFramePolicy(fps).splitThresholdFrames;
}

function chapterFramePolicy(fps: number): Readonly<{
  splitThresholdFrames: number;
  targetFrames: number;
  minimumFrames: number;
}> {
  const normalizedFps = assertChapterFps(fps);
  return {
    splitThresholdFrames: framesForDurationSeconds(CHAPTER_SPLIT_THRESHOLD_SECONDS, normalizedFps),
    targetFrames: framesForDurationSeconds(TARGET_CHAPTER_SECONDS, normalizedFps),
    minimumFrames: framesForDurationSeconds(MIN_CHAPTER_SECONDS, normalizedFps),
  };
}

function framesForDurationSeconds(seconds: number, fps: number): number {
  return Math.ceil(seconds * fps);
}

function assertChapterFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Chapter rendering requires a positive finite FPS');
  }
  return fps;
}

const CHAPTER_LAYOUT_POLICY_ID_V1 = 'chapter-layout-scene-gap-v1';
const CHAPTER_LAYOUT_POLICY_VERSION_V1 = '1';

/**
 * Expose the existing chapter policy owner for the immutable layout contract.
 * This returns the same duration-derived values used by boundary detection;
 * the manifest does not introduce a second policy implementation.
 */
export function getChapterLayoutPolicyV1(fps: number): ChapterLayoutPolicyV1 {
  const policy = chapterFramePolicy(fps);
  return {
    policyId: CHAPTER_LAYOUT_POLICY_ID_V1,
    policyVersion: CHAPTER_LAYOUT_POLICY_VERSION_V1,
    splitThresholdFrames: policy.splitThresholdFrames,
    targetFrames: policy.targetFrames,
    minimumFrames: policy.minimumFrames,
  };
}

/**
 * Materialize the current project timeline identity without pretending a
 * legacy numeric FPS is a native exact project timebase. Numeric project FPS
 * is reduced from its decimal spelling and marked read-compatibility-only by
 * the canonical-media-time owner.
 */
export function createChapterProjectTimebaseV1(
  projectId: string,
  fps: number,
): ChapterLayoutProjectTimebaseV1 {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId || normalizedProjectId !== projectId) {
    throw new Error('CHAPTER_RENDER_PROJECT_TIMEBASE_ID_INVALID');
  }
  const frameRate = readCanonicalFrameRateV1(assertChapterFps(fps));
  return {
    timebaseId: `${normalizedProjectId}:timeline`,
    version: `${frameRate.provenance}:${frameRate.writeEligibility}`,
    rate: frameRate.rate,
  };
}

/**
 * Build one provider-free immutable layout manifest from the exact boundaries
 * already selected by this renderer. The route supplies boundaries; policy and
 * timebase identity remain owned here.
 */
export function createChapterLayoutManifestForRenderV1(input: {
  parentAdmissionId: string;
  bindingHash: string;
  projectId: string;
  totalFrames: number;
  fps: number;
  boundaries: readonly { startFrame: number; endFrame: number }[];
}): ChapterLayoutManifestV1 {
  const normalizedFps = assertChapterFps(input.fps);
  return createChapterLayoutManifestV1({
    parentAdmissionId: input.parentAdmissionId,
    bindingHash: input.bindingHash,
    totalFrames: input.totalFrames,
    projectTimebase: createChapterProjectTimebaseV1(input.projectId, normalizedFps),
    policy: getChapterLayoutPolicyV1(normalizedFps),
    chapters: input.boundaries.map((boundary, index) => ({
      index,
      startFrame: boundary.startFrame,
      endFrame: boundary.endFrame,
      durationFrames: boundary.endFrame - boundary.startFrame,
    })),
  });
}

function chapterProgressErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isTerminalChapterProgressError(message: string): boolean {
  return /specified bucket does not exist|NoSuchBucket/i.test(message);
}

export type ChapterRenderStartOptionsV1 = {
  region: string;
  authorization: ProjectRenderJobAuthorizationV1;
  binding: ProjectRenderSnapshotBindingV1;
  chapterWebhook: ChapterChildWebhookConfigV1;
  chapterLayoutManifest: ChapterLayoutManifestV1;
};

export type ChapterRenderStartResultV1 = {
  jobId: string;
  chapterCount: number;
  chapterLayoutManifestHash: string;
};

/**
 * Strict progress callers carry the parent identity into this owner. The
 * renderer validates its own persisted chapter snapshot before it can poll a
 * child provider or enqueue concat; legacy callers intentionally omit this
 * contract and retain their compatibility behavior.
 */
export type ChapterRenderProgressOptionsV1 = {
  authorization: ProjectRenderJobAuthorizationV1;
  selectedRegion: string;
  chapterCount: number;
  chapterLayoutManifestHash: string;
  parentState: Extract<
    RenderJobChapterOrchestrationStateV1,
    'RUNNING' | 'CONCATENATING'
  >;
  /** Optional test/worker port; production defaults to ProjectService. */
  projectRevisionReader?: ChapterChildProjectRevisionReaderV1;
};

type LegacyChapterRenderStartResultV1 = {
  jobId: string;
  chapters: number;
};

type ChapterChildWebhookConfigV1 = {
  url: string;
  secret: string;
};

function assertChapterRegion(region: string): string {
  const normalized = region.trim();
  if (!normalized) throw new Error('Chapter rendering requires a selected AWS region');
  return normalized;
}

function isStrictChapterRenderJob(job: Partial<ChapterRenderJob>): boolean {
  return job.projectRenderSnapshotBinding !== undefined;
}

function assertStrictChapterRenderJobForProgress(
  job: unknown,
  input: ChapterRenderProgressOptionsV1,
): asserts job is ChapterRenderJob {
  const record = asRecord(job);
  const binding = record?.projectRenderSnapshotBinding;
  const manifestValue = record?.chapterLayoutManifest;
  if (!record || !binding || !manifestValue) {
    throw new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_MANIFEST_MISSING');
  }
  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    throw new Error('CHAPTER_RENDER_PROGRESS_BINDING_INVALID');
  }
  if (
    record._id !== input.authorization.jobId
    || record.projectId !== input.authorization.projectId
    || record.userId !== input.authorization.requestedByUserId
    || record.ownerId !== input.authorization.ownerId
    || record.region !== input.selectedRegion
    || binding.artifactId !== input.authorization.jobId
    || binding.ownerId !== input.authorization.ownerId
    || binding.projectId !== input.authorization.projectId
    || binding.bindingHash !== input.authorization.bindingHash
    || !sameProjectArtifactRevisionV1(
      binding.projectRevision,
      input.authorization.projectRevision,
    )
  ) {
    throw new Error('CHAPTER_RENDER_PROGRESS_BINDING_SCOPE_MISMATCH');
  }

  let manifest: ChapterLayoutManifestV1;
  try {
    manifest = parseChapterLayoutManifestV1(manifestValue);
    if (
      typeof record.totalFrames !== 'number'
      || typeof record.fps !== 'number'
      || !Number.isSafeInteger(record.totalFrames)
    ) {
      throw new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_FIELDS_INVALID');
    }
    assertChapterLayoutManifestForStart({
      manifest,
      jobId: input.authorization.jobId,
      projectId: input.authorization.projectId,
      binding,
      totalFrames: record.totalFrames,
      fps: record.fps,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('CHAPTER_RENDER_PROGRESS_')) {
      throw error;
    }
    throw new Error(
      error instanceof Error ? error.message : 'CHAPTER_RENDER_PROGRESS_LAYOUT_MANIFEST_INVALID',
    );
  }
  if (
    manifest.chapterCount !== input.chapterCount
    || manifest.layoutManifestHash !== input.chapterLayoutManifestHash
  ) {
    throw new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_MANIFEST_IDENTITY_MISMATCH');
  }
  if (!Array.isArray(record.chapters) || record.chapters.length !== manifest.chapterCount) {
    throw new Error('CHAPTER_RENDER_PROGRESS_CHAPTER_COUNT_MISMATCH');
  }
  for (const [index, expected] of manifest.chapters.entries()) {
    const chapter = asRecord(record.chapters[index]);
    if (
      !chapter
      || chapter.index !== expected.index
      || chapter.startFrame !== expected.startFrame
      || chapter.endFrame !== expected.endFrame
      || chapter.durationFrames !== expected.durationFrames
      || chapter.parentAdmissionId !== input.authorization.jobId
      || chapter.region !== input.selectedRegion
    ) {
      throw new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_CHAPTER_MISMATCH');
    }
    try {
      assertChapterChildDispatchV1(chapter.dispatch);
    } catch {
      throw new Error('CHAPTER_RENDER_PROGRESS_DISPATCH_LEDGER_INVALID');
    }
    if (
      chapter.dispatch.parentAdmissionId !== input.authorization.jobId
      || chapter.dispatch.childIndex !== expected.index
      || chapter.dispatch.bindingHash !== input.authorization.bindingHash
    ) {
      throw new Error('CHAPTER_RENDER_PROGRESS_DISPATCH_LEDGER_SCOPE_MISMATCH');
    }
  }
  if (
    input.parentState !== 'RUNNING'
    && input.parentState !== 'CONCATENATING'
  ) {
    throw new Error('CHAPTER_RENDER_PROGRESS_PARENT_STATE_INVALID');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function resolveChapterChildWebhook(
  job: Partial<ChapterRenderJob>,
  supplied?: ChapterChildWebhookConfigV1,
): ChapterChildWebhookConfigV1 | undefined {
  if (!isStrictChapterRenderJob(job)) return supplied;
  const persistedUrl = typeof job.chapterWebhookUrl === 'string'
    ? job.chapterWebhookUrl.trim()
    : '';
  if (!persistedUrl) return undefined;
  if (supplied && supplied.url.trim() !== persistedUrl) {
    throw new Error('CHAPTER_RENDER_CHILD_WEBHOOK_URL_MISMATCH');
  }
  const secret = supplied?.secret.trim() || process.env.REMOTION_WEBHOOK_SECRET?.trim();
  if (!secret || !isHttpsUrl(persistedUrl)) return undefined;
  return { url: persistedUrl, secret };
}

function readChapterBoundariesFromBinding(
  binding: ProjectRenderSnapshotBindingV1,
  totalFrames: number,
): readonly { startFrame: number; endFrame: number }[] {
  const renderContract = asRecord(binding.renderContract);
  if (renderContract?.routeMode !== 'chapter') {
    throw new Error('CHAPTER_RENDER_LAYOUT_ROUTE_MODE_MISMATCH');
  }
  const chapterPolicy = asRecord(renderContract?.chapterPolicy);
  const rawBoundaries = chapterPolicy?.boundaries;
  if (!Array.isArray(rawBoundaries) || rawBoundaries.length === 0) {
    throw new Error('CHAPTER_RENDER_LAYOUT_BOUNDARIES_MISSING');
  }
  const boundaries = rawBoundaries.map((value) => {
    const boundary = asRecord(value);
    const startFrame = boundary?.startFrame;
    const endFrame = boundary?.endFrame;
    if (
      !boundary
      || typeof startFrame !== 'number'
      || typeof endFrame !== 'number'
      || !Number.isSafeInteger(startFrame)
      || !Number.isSafeInteger(endFrame)
      || startFrame < 0
      || endFrame <= startFrame
      || endFrame > totalFrames
    ) {
      throw new Error('CHAPTER_RENDER_LAYOUT_BOUNDARIES_INVALID');
    }
    return {
      startFrame,
      endFrame,
    };
  });
  let expectedStartFrame = 0;
  for (const boundary of boundaries) {
    if (boundary.startFrame !== expectedStartFrame) {
      throw new Error('CHAPTER_RENDER_LAYOUT_BOUNDARIES_INVALID');
    }
    expectedStartFrame = boundary.endFrame;
  }
  if (expectedStartFrame !== totalFrames) {
    throw new Error('CHAPTER_RENDER_LAYOUT_BOUNDARIES_INVALID');
  }
  return boundaries;
}

function assertChapterLayoutManifestForStart(input: {
  manifest: ChapterLayoutManifestV1;
  jobId: string;
  projectId: string;
  binding: ProjectRenderSnapshotBindingV1;
  totalFrames: number;
  fps: number;
}): void {
  const { manifest, binding, totalFrames, fps } = input;
  if (
    manifest.parentAdmissionId !== input.jobId
    || manifest.bindingHash !== binding.bindingHash
    || manifest.totalFrames !== totalFrames
    || binding.durationInFrames !== totalFrames
    || binding.fps !== fps
    || binding.projectId !== input.projectId
  ) {
    throw new Error('CHAPTER_RENDER_LAYOUT_MANIFEST_SCOPE_MISMATCH');
  }

  const expectedTimebase = createChapterProjectTimebaseV1(input.projectId, fps);
  if (
    manifest.projectTimebase.timebaseId !== expectedTimebase.timebaseId
    || manifest.projectTimebase.version !== expectedTimebase.version
    || manifest.projectTimebase.rate.numerator !== expectedTimebase.rate.numerator
    || manifest.projectTimebase.rate.denominator !== expectedTimebase.rate.denominator
  ) {
    throw new Error('CHAPTER_RENDER_LAYOUT_MANIFEST_TIMEBASE_MISMATCH');
  }

  const expectedPolicy = getChapterLayoutPolicyV1(fps);
  if (
    manifest.policy.policyId !== expectedPolicy.policyId
    || manifest.policy.policyVersion !== expectedPolicy.policyVersion
    || manifest.policy.splitThresholdFrames !== expectedPolicy.splitThresholdFrames
    || manifest.policy.targetFrames !== expectedPolicy.targetFrames
    || manifest.policy.minimumFrames !== expectedPolicy.minimumFrames
  ) {
    throw new Error('CHAPTER_RENDER_LAYOUT_MANIFEST_POLICY_MISMATCH');
  }

  const expectedBoundaries = readChapterBoundariesFromBinding(binding, totalFrames);
  if (
    manifest.chapterCount !== expectedBoundaries.length
    || manifest.chapters.length !== expectedBoundaries.length
    || manifest.chapters.some((chapter, index) => {
      const boundary = expectedBoundaries[index]!;
      return chapter.index !== index
        || chapter.startFrame !== boundary.startFrame
        || chapter.endFrame !== boundary.endFrame
        || chapter.durationFrames !== boundary.endFrame - boundary.startFrame;
    })
  ) {
    throw new Error('CHAPTER_RENDER_LAYOUT_MANIFEST_CHAPTERS_MISMATCH');
  }
}

function chapterProviderIdentityIsComplete(chapter: Partial<Chapter>): boolean {
  return typeof chapter.renderId === 'string'
    && chapter.renderId.trim().length > 0
    && typeof chapter.bucketName === 'string'
    && chapter.bucketName.trim().length > 0
    && typeof chapter.region === 'string'
    && chapter.region.trim().length > 0;
}

function chapterProviderTupleMatchesDispatch(
  chapter: Partial<Chapter>,
  dispatch: ChapterChildDispatchV1,
): boolean {
  return chapterProviderIdentityIsComplete(chapter)
    && typeof dispatch.providerRenderId === 'string'
    && typeof dispatch.providerBucketName === 'string'
    && typeof dispatch.providerRegion === 'string'
    && chapter.renderId!.trim() === dispatch.providerRenderId
    && chapter.bucketName!.trim() === dispatch.providerBucketName
    && chapter.region!.trim() === dispatch.providerRegion;
}

function readChapterOutputSize(value: unknown): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : undefined;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function buildChapterChildWebhook(
  config: ChapterChildWebhookConfigV1,
  input: {
  parentAdmissionId: string;
  childIndex: number;
  attemptToken: string;
  bindingHash: string;
  region: string;
  },
) {
  if (!config.secret.trim() || !isHttpsUrl(config.url)) {
    throw new Error('CHAPTER_RENDER_CHILD_WEBHOOK_CONFIG_INVALID');
  }
  return {
    url: config.url,
    secret: config.secret,
    customData: {
      editronChapterParentAdmissionId: input.parentAdmissionId,
      editronChapterIndex: String(input.childIndex),
      editronChapterAttemptToken: input.attemptToken,
      editronChapterBindingHash: input.bindingHash,
      editronChapterRegion: input.region,
    },
  };
}

function buildProjectChapterConcatTargetV1(
  job: ChapterRenderJob,
  statuses: ReadonlyArray<{ index: number; outputUrl?: unknown; outputSize?: unknown }>,
): ProjectChapterConcatTargetV1 {
  if (!job.projectRenderSnapshotBinding) {
    throw new Error('CHAPTER_CONCAT_PROJECT_SNAPSHOT_BINDING_MISSING');
  }
  const orderedStatuses = [...statuses].sort((left, right) => left.index - right.index);
  const sources: ProjectChapterConcatSourceV1[] = orderedStatuses.map((status, index) => {
    const chapter = job.chapters.find((candidate) => candidate.index === status.index);
    if (
      !chapter
      || chapter.index !== index
      || !chapterProviderIdentityIsComplete(chapter)
      || !isHttpsUrl(status.outputUrl)
      || !readChapterOutputSize(status.outputSize)
      || readChapterOutputSize(status.outputSize)! <= 0
    ) {
      throw new Error('CHAPTER_CONCAT_SOURCE_IDENTITY_MISSING');
    }
    return {
      index,
      providerRenderId: chapter.renderId!.trim(),
      bucketName: chapter.bucketName!.trim(),
      region: chapter.region!.trim(),
      sourceUrl: status.outputUrl,
      sourceSizeBytes: readChapterOutputSize(status.outputSize)!,
    };
  });
  return createProjectChapterConcatTargetV1({
    parentAdmissionId: job._id,
    projectRenderSnapshotBinding: job.projectRenderSnapshotBinding,
    sources,
  });
}

async function failChapter(
  db: Awaited<ReturnType<typeof getDatabase>>,
  jobId: string,
  chapter: Chapter,
  error: string,
  options: {
    binding?: ProjectRenderSnapshotBindingV1;
    projectRevisionReader?: ChapterChildProjectRevisionReaderV1;
  } = {},
): Promise<void> {
  const filter = options.binding
    ? {
        _id: jobId,
        'projectRenderSnapshotBinding.scope': 'PROJECT_SNAPSHOT',
        'projectRenderSnapshotBinding.artifactId': jobId,
        'projectRenderSnapshotBinding.ownerId': options.binding.ownerId,
        'projectRenderSnapshotBinding.projectId': options.binding.projectId,
        'projectRenderSnapshotBinding.bindingHash': options.binding.bindingHash,
        'projectRenderSnapshotBinding.projectRevision.schemaVersion':
          options.binding.projectRevision.schemaVersion,
        'projectRenderSnapshotBinding.projectRevision.value': options.binding.projectRevision.value,
        'projectRenderSnapshotBinding.projectRevision.compatibilityUpdatedAt':
          options.binding.projectRevision.compatibilityUpdatedAt,
        'chapters.index': chapter.index,
      }
    : { _id: jobId, 'chapters.index': chapter.index };
  if (options.binding) {
    await assertChapterChildProjectRevisionCurrentV1(
      options.binding,
      options.projectRevisionReader,
    );
  }
  await db.collection(CHAPTERS_COLLECTION).updateOne(
    filter as any,
    {
      $set: {
        'chapters.$.status': 'failed',
        'chapters.$.error': error,
        updatedAt: new Date(),
      },
    },
  );
}

function chapterProgressRevisionFenceError(reason: string): Error {
  if (reason === 'BINDING_INVALID') {
    return new Error('CHAPTER_RENDER_PROGRESS_BINDING_INVALID');
  }
  if (reason === 'PROJECT_REVISION_STALE') {
    return new Error('CHAPTER_RENDER_PROGRESS_PROJECT_REVISION_STALE');
  }
  return new Error('CHAPTER_RENDER_PROGRESS_PROJECT_REVISION_UNAVAILABLE');
}

function isChapterProgressRevisionFenceError(error: unknown): boolean {
  return error instanceof Error
    && error.message.startsWith('CHAPTER_RENDER_PROGRESS_PROJECT_REVISION_');
}

async function assertChapterChildProjectRevisionCurrentV1(
  binding: ProjectRenderSnapshotBindingV1,
  projectRevisionReader?: ChapterChildProjectRevisionReaderV1,
): Promise<void> {
  const fence = await fenceChapterChildProjectRevisionV1({
    binding,
    projectRevisionReader,
  });
  if (!fence.ok) throw chapterProgressRevisionFenceError(fence.reason);
}

async function reconcilePolledChapterTerminalV1(input: {
  jobId: string;
  chapter: Chapter;
  binding: ProjectRenderSnapshotBindingV1;
  dispatch: ChapterChildDispatchV1;
  event: ChapterChildTerminalEventV1;
  projectRevisionReader?: ChapterChildProjectRevisionReaderV1;
}): Promise<void> {
  if (!chapterProviderIdentityIsComplete(input.chapter)) {
    throw new Error('CHAPTER_RENDER_PROVIDER_IDENTITY_MISSING');
  }
  const result = await reconcileChapterChildTerminalCallbackV1({
    parentAdmissionId: input.jobId,
    childIndex: input.chapter.index,
    bindingHash: input.binding.bindingHash,
    attemptToken: input.dispatch.attemptToken,
    providerRenderId: input.chapter.renderId!.trim(),
    bucketName: input.chapter.bucketName!.trim(),
    region: input.chapter.region!.trim(),
    event: input.event,
    projectRevisionReader: input.projectRevisionReader,
  });
  if (!result.ok) {
    if (result.reason === 'CHAPTER_CHILD_CALLBACK_PROJECT_REVISION_STALE') {
      throw chapterProgressRevisionFenceError('PROJECT_REVISION_STALE');
    }
    if (result.reason === 'CHAPTER_CHILD_CALLBACK_PROJECT_REVISION_UNAVAILABLE') {
      throw chapterProgressRevisionFenceError('PROJECT_REVISION_UNAVAILABLE');
    }
    throw new Error(result.reason);
  }
}

/**
 * Start a chapter-based render job.
 * Splits the composition, starts parallel Lambda renders,
 * and returns a job ID for progress tracking.
 */
/**
 * Start ONE pending chapter on Lambda, atomically claimed so two overlapping progress polls can't
 * double-start it. Flips the chapter pending → rendering first, then triggers the render and records the
 * renderId; a start failure marks it 'failed'.
 */
async function startSingleChapterRender(
  db: Awaited<ReturnType<typeof getDatabase>>,
  jobId: string,
  chapter: Chapter,
  ctx: {
    serveUrl: string;
    functionName: string;
    region: string;
    fps: number;
    width: number;
    height: number;
    totalFrames: number;
    overlays: Overlay[];
    binding?: ProjectRenderSnapshotBindingV1;
    chapterWebhook?: ChapterChildWebhookConfigV1;
  },
): Promise<void> {
  const strictBinding = ctx.binding;
  if (strictBinding) {
    const dispatch = chapter.dispatch;
    try {
      if (!dispatch) throw new Error('CHAPTER_RENDER_DISPATCH_LEDGER_MISSING');
      assertChapterChildDispatchV1(dispatch);
      if (
        dispatch.parentAdmissionId !== jobId
        || dispatch.childIndex !== chapter.index
        || dispatch.bindingHash !== strictBinding.bindingHash
      ) {
        throw new Error('CHAPTER_RENDER_DISPATCH_LEDGER_SCOPE_MISMATCH');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failChapter(db, jobId, chapter, message);
      return;
    }

    if (!ctx.chapterWebhook) {
      await failChapter(db, jobId, chapter, 'CHAPTER_RENDER_CHILD_WEBHOOK_CONFIG_MISSING');
      return;
    }

    try {
      const attempted = await markChapterChildDispatchAttemptingV1({
        parentAdmissionId: jobId,
        childIndex: chapter.index,
        binding: strictBinding,
        attemptToken: dispatch.attemptToken,
        now: new Date(),
        collection: db.collection(CHAPTERS_COLLECTION),
      });
      if (!attempted.ok) {
        console.warn(
          `[ChapterRenderer] Chapter ${chapter.index} dispatch was not claimed: ${attempted.reason}`,
        );
        return;
      }
    } catch (err: unknown) {
      console.error(`[ChapterRenderer] Chapter ${chapter.index} attempt marker was uncertain:`, err);
      try {
        await quarantineChapterChildDispatchV1({
          parentAdmissionId: jobId,
          childIndex: chapter.index,
          binding: strictBinding,
          attemptToken: dispatch.attemptToken,
          error: err,
          now: new Date(),
          collection: db.collection(CHAPTERS_COLLECTION),
        });
      } catch (quarantineError: unknown) {
        console.error(
          `[ChapterRenderer] Chapter ${chapter.index} could not be quarantined after marker uncertainty:`,
          quarantineError,
        );
      }
      return;
    }

    let providerTuple: {
      providerRenderId: string;
      bucketName: string;
      region: string;
    } | undefined;
    try {
      await setAWSCredentials();
      const inputProps = buildLambdaRenderInputProps({
        overlays: ctx.overlays,
        durationInFrames: ctx.totalFrames,
        fps: ctx.fps,
        width: ctx.width,
        height: ctx.height,
        // Use OffthreadVideo (ffmpeg, robust) not Html5Video for server render -- without this flag the
        // composition defaults isRendering=false and a large/slow-proxied clip hangs delayRender -> timeout.
        isRendering: true,
      });
      const { renderId, bucketName } = await renderMediaOnLambda({
        region: ctx.region as any,
        functionName: ctx.functionName,
        serveUrl: ctx.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps,
        codec: 'h264',
        maxRetries: 1,
        framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
        privacy: 'public',
        timeoutInMilliseconds: 600000, // 10 min per chapter
        audioCodec: REMOTION_AUDIO_CODEC,
        frameRange: [chapter.startFrame, Math.max(chapter.startFrame, chapter.endFrame - 1)],
        metadata: {
          editronChapterParentAdmissionId: jobId,
          editronChapterIndex: String(chapter.index),
          editronChapterAttemptToken: dispatch.attemptToken,
          editronChapterBindingHash: strictBinding.bindingHash,
          editronChapterRegion: ctx.region,
        },
        webhook: buildChapterChildWebhook(ctx.chapterWebhook, {
          parentAdmissionId: jobId,
          childIndex: chapter.index,
          attemptToken: dispatch.attemptToken,
          bindingHash: strictBinding.bindingHash,
          region: ctx.region,
        }),
      });
      const parsedTuple = ChapterChildProviderTupleSchemaV1.safeParse({
        providerRenderId: typeof renderId === 'string' ? renderId.trim() : '',
        bucketName: typeof bucketName === 'string' ? bucketName.trim() : '',
        region: ctx.region,
      });
      if (!parsedTuple.success) throw new Error('CHAPTER_RENDER_PROVIDER_IDENTITY_INVALID');
      providerTuple = parsedTuple.data;

      const bound = await bindChapterChildDispatchV1({
        parentAdmissionId: jobId,
        childIndex: chapter.index,
        binding: strictBinding,
        attemptToken: dispatch.attemptToken,
        ...providerTuple,
        now: new Date(),
        collection: db.collection(CHAPTERS_COLLECTION),
      });
      if (!bound.ok) {
        throw new Error(`CHAPTER_RENDER_DISPATCH_BIND_NOT_CURRENT:${bound.reason}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ChapterRenderer] Chapter ${chapter.index} dispatch is uncertain: ${message}`);
      try {
        await quarantineChapterChildDispatchV1({
          parentAdmissionId: jobId,
          childIndex: chapter.index,
          binding: strictBinding,
          attemptToken: dispatch.attemptToken,
          error: message,
          ...(providerTuple
            ? {
                providerRenderId: providerTuple.providerRenderId,
                bucketName: providerTuple.bucketName,
                region: providerTuple.region,
              }
            : {}),
          now: new Date(),
          collection: db.collection(CHAPTERS_COLLECTION),
        });
      } catch (quarantineError: unknown) {
        console.error(
          `[ChapterRenderer] Chapter ${chapter.index} could not be quarantined after dispatch uncertainty:`,
          quarantineError,
        );
      }
    }
    return;
  }

  // Atomic claim: only proceed if this chapter is still pending (prevents a racing poll double-starting it).
  const claim = await db.collection(CHAPTERS_COLLECTION).updateOne(
    { _id: jobId, chapters: { $elemMatch: { index: chapter.index, status: 'pending' } } } as any,
    {
      $set: {
        'chapters.$.status': 'rendering',
        'chapters.$.region': ctx.region,
        updatedAt: new Date(),
      },
    },
  );
  if (claim.modifiedCount === 0) return; // a concurrent poll already claimed it

  try {
    await setAWSCredentials();
    const inputProps = buildLambdaRenderInputProps({
      overlays: ctx.overlays,
      durationInFrames: ctx.totalFrames,
      fps: ctx.fps,
      width: ctx.width,
      height: ctx.height,
      // Use OffthreadVideo (ffmpeg, robust) not Html5Video for server render -- without this flag the
      // composition defaults isRendering=false and a large/slow-proxied clip hangs delayRender -> timeout.
      isRendering: true,
    });
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: ctx.region as any,
      functionName: ctx.functionName,
      serveUrl: ctx.serveUrl,
      composition: REMOTION_COMPOSITION_ID,
      inputProps,
      codec: 'h264',
      maxRetries: 1,
      framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
      privacy: 'public',
      timeoutInMilliseconds: 600000, // 10 min per chapter
      audioCodec: REMOTION_AUDIO_CODEC,
      frameRange: [chapter.startFrame, Math.max(chapter.startFrame, chapter.endFrame - 1)],
    });
    const providerRenderId = typeof renderId === 'string' ? renderId.trim() : '';
    const providerBucketName = typeof bucketName === 'string' ? bucketName.trim() : '';
    if (!providerRenderId || !providerBucketName) {
      throw new Error('CHAPTER_RENDER_PROVIDER_IDENTITY_INVALID');
    }
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId, 'chapters.index': chapter.index } as any,
      {
        $set: {
          'chapters.$.renderId': providerRenderId,
          'chapters.$.bucketName': providerBucketName,
          'chapters.$.region': ctx.region,
          updatedAt: new Date(),
        },
      },
    );
  } catch (err: any) {
    console.error(`[ChapterRenderer] Chapter ${chapter.index} failed to start: ${err.message}`);
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId, 'chapters.index': chapter.index } as any,
      { $set: { 'chapters.$.status': 'failed', 'chapters.$.error': err.message, updatedAt: new Date() } },
    );
  }
}

/**
 * Start pending chapters while their estimated renderer Lambdas fit under LAMBDA_CONCURRENCY_BUDGET,
 * keeping total renderer Lambdas under the AWS account quota. Called once when the job starts and again on
 * every progress poll, so the next chapter begins as soon as a running one finishes. Idempotent; safe to
 * call repeatedly.
 */
async function startPendingChapters(
  jobId: string,
  opts?: {
    serveUrl?: string;
    functionName?: string;
    region?: string;
    chapterWebhook?: ChapterChildWebhookConfigV1;
  },
): Promise<void> {
  const db = await getDatabase();
  const job = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId as any }) as any;
  if (!job || !Array.isArray(job.chapters)) return;

  // Admit pending chapters while the estimated in-flight renderer Lambdas stay under the budget. Each
  // chapter needs ~ceil(durationFrames / REMOTION_FRAMES_PER_LAMBDA) renderer Lambdas; the per-chapter
  // atomic claim in startSingleChapterRender() makes a momentary over-admit from racing polls harmless.
  const lambdasForChapter = (c: Chapter) =>
    Math.max(1, Math.ceil(c.durationFrames / REMOTION_FRAMES_PER_LAMBDA));
  let remaining =
    LAMBDA_CONCURRENCY_BUDGET -
    (job.chapters as Chapter[])
      .filter((c) => c.status === 'rendering')
      .reduce((sum, c) => sum + lambdasForChapter(c), 0);

  const pending: Chapter[] = [];
  for (const chapter of (job.chapters as Chapter[]).filter((c) => c.status === 'pending')) {
    const need = lambdasForChapter(chapter);
    // Always admit at least one chapter even if it alone exceeds the budget, else the job deadlocks.
    if (pending.length > 0 && need > remaining) break;
    pending.push(chapter);
    remaining -= need;
  }
  if (pending.length === 0) return;

  // A strict chapter job is bound to the region selected at admission. Never
  // repair a missing strict region from current process configuration: doing
  // so could poll or start a child in a different provider account/region.
  const strictJob = isStrictChapterRenderJob(job);
  let chapterWebhook: ChapterChildWebhookConfigV1 | undefined;
  try {
    chapterWebhook = resolveChapterChildWebhook(job, opts?.chapterWebhook);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    for (const chapter of pending) await failChapter(db, jobId, chapter, message);
    return;
  }
  const persistedRegion = typeof job.region === 'string' && job.region.trim()
    ? job.region.trim()
    : undefined;
  const region = strictJob
    ? persistedRegion
    : persistedRegion || (opts?.region ? assertChapterRegion(opts.region) : undefined)
      || assertChapterRegion(process.env.REMOTION_AWS_REGION || 'us-east-1');
  if (!region) {
    for (const chapter of pending) {
      await failChapter(db, jobId, chapter, 'CHAPTER_RENDER_PROVIDER_REGION_MISSING');
    }
    return;
  }

  const serveUrl = opts?.serveUrl || process.env.REMOTION_LAMBDA_SERVE_URL;
  const functionName = opts?.functionName || process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  if (!serveUrl || !functionName) {
    console.warn('[ChapterRenderer] cannot start pending chapters: REMOTION_LAMBDA_SERVE_URL / FUNCTION_NAME unset');
    return;
  }
  const freshness = assertRemotionSiteFresh({ serveUrl, env: process.env });
  if (freshness.reason === 'unverified_no_app_commit') {
    console.warn('[ChapterRenderer] Remotion site version could not be verified because app commit metadata is missing');
  }

  const ctx = {
    serveUrl,
    functionName,
    region,
    fps: job.fps,
    width: job.width,
    height: job.height,
    totalFrames: job.totalFrames,
    overlays: (job.overlays ?? []) as Overlay[],
    ...(strictJob
      ? {
          binding: job.projectRenderSnapshotBinding,
          chapterWebhook,
        }
      : {}),
  };
  for (const chapter of pending) {
    await startSingleChapterRender(db, jobId, chapter, ctx);
  }
}

export function startChapterRender(
  jobId: string,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
  width: number,
  height: number,
  serveUrl: string,
  functionName: string,
  options: ChapterRenderStartOptionsV1,
): Promise<ChapterRenderStartResultV1>;

export function startChapterRender(
  jobId: string,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
  width: number,
  height: number,
  serveUrl: string,
  functionName: string,
  options?: undefined,
): Promise<LegacyChapterRenderStartResultV1>;

export async function startChapterRender(
  jobId: string,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
  width: number,
  height: number,
  serveUrl: string,
  functionName: string,
  options?: ChapterRenderStartOptionsV1,
): Promise<ChapterRenderStartResultV1 | LegacyChapterRenderStartResultV1> {
  if (!/^chr_[A-Za-z0-9_-]{12}$/.test(jobId)) {
    throw new Error('Chapter rendering requires a caller-owned chr_ admission ID');
  }
  const selectedRegion = options
    ? assertChapterRegion(options.region)
    : assertChapterRegion(process.env.REMOTION_AWS_REGION || 'us-east-1');
  let projectRenderSnapshotBinding: ProjectRenderSnapshotBindingV1 | undefined;
  let chapterLayoutManifest: ChapterLayoutManifestV1 | undefined;
  if (options) {
    const authorization = ProjectRenderJobAuthorizationSchema.safeParse(options.authorization);
    if (!authorization.success) {
      throw new Error('CHAPTER_RENDER_PROJECT_RENDER_AUTHORIZATION_INVALID');
    }
    assertProjectRenderSnapshotBindingV1(options.binding);
    if (
      authorization.data.jobId !== jobId
      || authorization.data.projectId !== projectId
      || authorization.data.requestedByUserId !== userId
      || authorization.data.bindingHash !== options.binding.bindingHash
      || options.binding.artifactId !== jobId
      || options.binding.projectId !== projectId
      || options.binding.ownerId !== authorization.data.ownerId
      || !sameProjectArtifactRevisionV1(options.binding.projectRevision, authorization.data.projectRevision)
    ) {
      throw new Error('CHAPTER_RENDER_PROJECT_RENDER_BINDING_SCOPE_MISMATCH');
    }
    if (!options.chapterWebhook
      || !isHttpsUrl(options.chapterWebhook.url)
      || !options.chapterWebhook.secret.trim()) {
      throw new Error('CHAPTER_RENDER_CHILD_WEBHOOK_CONFIG_INVALID');
    }
    if (options.chapterLayoutManifest === undefined) {
      throw new Error('CHAPTER_RENDER_LAYOUT_MANIFEST_REQUIRED');
    }
    const parsedChapterLayoutManifest = parseChapterLayoutManifestV1(options.chapterLayoutManifest);
    const normalizedFps = assertChapterFps(fps);
    assertChapterLayoutManifestForStart({
      manifest: parsedChapterLayoutManifest,
      jobId,
      projectId,
      binding: options.binding,
      totalFrames,
      fps: normalizedFps,
    });
    chapterLayoutManifest = parsedChapterLayoutManifest;
    projectRenderSnapshotBinding = structuredClone(options.binding);
  }
  const normalizedFps = assertChapterFps(fps);
  const db = await getDatabase();

  // Strict calls use the exact, already-bound immutable layout. Legacy calls
  // retain explicit renderer-owned boundary recomputation.
  const boundaries = chapterLayoutManifest
    ? chapterLayoutManifest.chapters.map(({ startFrame, endFrame }) => ({ startFrame, endFrame }))
    : detectChapterBoundaries(overlays, totalFrames, normalizedFps);

  const compactRenderProps = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: totalFrames,
    fps: normalizedFps,
    width,
    height,
    isRendering: true,
  });
  const renderOverlays = Array.isArray(compactRenderProps.overlays)
    ? compactRenderProps.overlays as Overlay[]
    : [];
  // Create chapter records
  const chapters: Chapter[] = chapterLayoutManifest
    ? chapterLayoutManifest.chapters.map((chapter) => ({
        ...chapter,
        region: selectedRegion,
        parentAdmissionId: jobId,
        dispatch: createChapterChildDispatchV1({
          parentAdmissionId: jobId,
          childIndex: chapter.index,
          bindingHash: projectRenderSnapshotBinding!.bindingHash,
        }),
        status: 'pending' as const,
      }))
    : boundaries.map((b, i) => ({
        index: i,
        startFrame: b.startFrame,
        endFrame: b.endFrame,
        durationFrames: b.endFrame - b.startFrame,
        region: selectedRegion,
        status: 'pending' as const,
      }));

  // Plan-based retention: stamp the earliest retirement time. The retention
  // owner still requires every provider-cleanup receipt before deleting the
  // aggregate and atomically writes an audit tombstone. Unknown plan → base.
  let planType: string | undefined;
  try {
    const { getUserPlanWithServiceLimits } = await import('@/lib/services/planService');
    const plan: any = await getUserPlanWithServiceLimits(userId);
    planType = plan?.type ?? plan?.planType ?? plan?.name; // currentPlan stores the key in `name`
  } catch { /* plan not resolvable → base retention */ }
  const { renderChapterExpiresAt } = await import('@/lib/editron/services/render-chapter-retention');
  const createdAt = new Date();

  // Store job in MongoDB
  const job: ChapterRenderJob = {
    _id: jobId,
    projectId,
    userId,
    chapters,
    status: 'rendering',
    totalFrames,
    overlays: renderOverlays,
    fps: normalizedFps,
    width,
    height,
    region: selectedRegion,
    ...(projectRenderSnapshotBinding ? { projectRenderSnapshotBinding } : {}),
    ...(chapterLayoutManifest ? { chapterLayoutManifest } : {}),
    ...(projectRenderSnapshotBinding ? { ownerId: projectRenderSnapshotBinding.ownerId } : {}),
    ...(projectRenderSnapshotBinding && options?.chapterWebhook
      ? { chapterWebhookUrl: options.chapterWebhook.url }
      : {}),
    artifactLifecycleVersion: 1,
    artifactState: 'ACTIVE',
    retentionState: 'RETAINED',
    createdAt,
    updatedAt: createdAt,
    expiresAt: renderChapterExpiresAt(createdAt, planType),
  };

  await db.collection(CHAPTERS_COLLECTION).insertOne(job as any);


  // Start chapters under a concurrency cap. The rest stay 'pending' and are started by
  // getChapterRenderProgress() as each running chapter finishes — keeping total renderer Lambdas under
  // the AWS account limit instead of firing every chapter at once (which throttled the chunks and timed
  // out the per-chapter main function after 600s).
  await startPendingChapters(jobId, {
    serveUrl,
    functionName,
    region: selectedRegion,
    ...(options?.chapterWebhook ? { chapterWebhook: options.chapterWebhook } : {}),
  });

  return chapterLayoutManifest
    ? {
        jobId,
        chapterCount: chapterLayoutManifest.chapterCount,
        chapterLayoutManifestHash: chapterLayoutManifest.layoutManifestHash,
      }
    : { jobId, chapters: chapters.length };
}

/**
 * Get chapter render job progress.
 * Returns per-chapter progress + overall aggregated progress.
 */
export async function getChapterRenderProgress(
  jobId: string,
  options?: ChapterRenderProgressOptionsV1,
): Promise<{
  status: string;
  overallProgress: number;
  chapters: Array<{
    index: number;
    status: string;
    progress: number;
    outputUrl?: string;
    outputSize?: number;
    error?: string;
  }>;
  outputUrl?: string;
  outputSize?: number;
  error?: string;
} | null> {
  const db = await getDatabase();
  const job = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId as any }) as any;
  if (!job) return null;
  const strictJob = isStrictChapterRenderJob(job);
  if (strictJob && !options) {
    throw new Error('CHAPTER_RENDER_PROGRESS_AUTHORIZATION_REQUIRED');
  }
  if (options) {
    assertStrictChapterRenderJobForProgress(job, options);
  }
  const strictBinding = strictJob
    ? job.projectRenderSnapshotBinding as ProjectRenderSnapshotBindingV1
    : undefined;
  if (strictBinding) {
    await assertChapterChildProjectRevisionCurrentV1(
      strictBinding,
      options?.projectRevisionReader,
    );
  }
  const strictWriteOptions = strictBinding
    ? {
        binding: strictBinding,
        projectRevisionReader: options?.projectRevisionReader,
      }
    : undefined;

  let totalProgress = 0;
  let computedStatus = job.status;
  let completedOutputUrl = typeof job.outputUrl === 'string' ? job.outputUrl : undefined;
  let completedError: string | undefined;
  const chapterStatuses = [];

  for (const chapter of job.chapters) {
    let progress = 0;
    let chapterStatus = chapter.status;
    let chapterOutputUrl = chapter.outputUrl;
    let chapterOutputSize = chapter.outputSize;
    let chapterError = chapter.error;
    let strictDispatch: ChapterChildDispatchV1 | undefined;
    let strictDispatchInvalid = false;

    if (strictJob) {
      try {
        const binding = job.projectRenderSnapshotBinding;
        if (!binding) throw new Error('CHAPTER_RENDER_PROJECT_SNAPSHOT_BINDING_MISSING');
        if (!chapter.dispatch) throw new Error('CHAPTER_RENDER_DISPATCH_LEDGER_MISSING');
        assertChapterChildDispatchV1(chapter.dispatch);
        if (
          chapter.dispatch.parentAdmissionId !== jobId
          || chapter.dispatch.childIndex !== chapter.index
          || chapter.dispatch.bindingHash !== binding.bindingHash
        ) {
          throw new Error('CHAPTER_RENDER_DISPATCH_LEDGER_SCOPE_MISMATCH');
        }
        strictDispatch = chapter.dispatch;
      } catch (err: unknown) {
        strictDispatchInvalid = true;
        chapterStatus = 'failed';
        chapterError = err instanceof Error ? err.message : String(err);
        await failChapter(db, jobId, chapter, chapterError, strictWriteOptions);
      }
    }

    if (
      strictJob
      && !strictDispatchInvalid
      && strictDispatch?.phase === 'UNKNOWN'
      && chapterProviderTupleMatchesDispatch(chapter, strictDispatch)
    ) {
      const binding = job.projectRenderSnapshotBinding!;
      const repairTime = new Date();
      try {
        await assertChapterChildProjectRevisionCurrentV1(
          binding,
          options?.projectRevisionReader,
        );
        const repaired = await bindChapterChildDispatchV1({
          parentAdmissionId: jobId,
          childIndex: chapter.index,
          binding,
          attemptToken: strictDispatch.attemptToken,
          providerRenderId: chapter.renderId!.trim(),
          bucketName: chapter.bucketName!.trim(),
          region: chapter.region!.trim(),
          now: repairTime,
          collection: db.collection(CHAPTERS_COLLECTION),
        });
        if (repaired.ok) {
          strictDispatch = {
            ...strictDispatch,
            phase: 'BOUND',
            providerBoundAt: repairTime,
            unknownAt: undefined,
            unknownReason: undefined,
          };
          chapter.dispatch = strictDispatch;
        } else {
          console.warn(
            `[ChapterRenderer] Chapter ${chapter.index} UNKNOWN tuple was not rebound: ${repaired.reason}`,
          );
        }
      } catch (err: unknown) {
        console.warn(
          `[ChapterRenderer] Chapter ${chapter.index} UNKNOWN tuple recovery was uncertain:`,
          err,
        );
      }
    }

    if (strictDispatchInvalid) {
      progress = 0;
    } else if (chapter.status === 'completed') {
      if (
        !strictJob
        || (
          strictDispatch?.phase === 'BOUND'
          && chapterProviderTupleMatchesDispatch(chapter, strictDispatch)
        )
      ) {
        progress = 1;
      } else if (strictJob) {
        chapterStatus = 'rendering';
        chapterError = 'CHAPTER_RENDER_DISPATCH_NOT_BOUND';
      }
    } else if (chapter.status === 'failed') {
      progress = 0;
    } else if (
      strictJob
      && strictDispatch?.phase === 'BOUND'
      && !chapterProviderTupleMatchesDispatch(chapter, strictDispatch)
    ) {
      chapterStatus = 'failed';
      chapterError = 'CHAPTER_RENDER_DISPATCH_TUPLE_MISMATCH';
      await failChapter(db, jobId, chapter, chapterError, strictWriteOptions);
    } else if (strictJob && strictDispatch && strictDispatch.phase !== 'BOUND') {
      // ATTEMPTING and UNKNOWN are durable uncertainty, not provider failures.
      // Leave them visible as in-progress; the recovery owner must resolve them.
      chapterStatus = chapter.status === 'pending' ? 'pending' : 'rendering';
    } else if (
      isStrictChapterRenderJob(job)
      && chapter.status !== 'pending'
      && !chapterProviderIdentityIsComplete(chapter)
    ) {
      chapterStatus = 'failed';
      chapterError = 'CHAPTER_RENDER_PROVIDER_IDENTITY_MISSING';
      await failChapter(db, jobId, chapter, chapterError, strictWriteOptions);
    } else if (chapter.renderId) {
      // Poll Lambda for this chapter's progress
      try {
        await setAWSCredentials();
        const chapterBucketName = strictJob
          ? chapter.bucketName!.trim()
          : typeof chapter.bucketName === 'string' && chapter.bucketName.trim()
            ? chapter.bucketName
            : `remotionlambda-${process.env.REMOTION_AWS_REGION || 'us-east-1'}-vqv91tlyik`;
        const chapterRegion = strictJob
          ? chapter.region!.trim()
          : process.env.REMOTION_AWS_REGION || 'us-east-1';

        const renderProgress = await getRenderProgress({
          renderId: chapter.renderId,
          bucketName: chapterBucketName,
          region: chapterRegion as any,
          functionName: process.env.REMOTION_LAMBDA_FUNCTION_NAME || '',
          skipLambdaInvocation: true,
        });

        progress = renderProgress.overallProgress || 0;

        if (renderProgress.done) {
          const outputSize = readChapterOutputSize(renderProgress.outputSizeInBytes);
          if (strictJob && (!isHttpsUrl(renderProgress.outputFile) || outputSize === undefined)) {
            chapterStatus = 'failed';
            chapterError = 'CHAPTER_RENDER_OUTPUT_IDENTITY_MISSING';
            await reconcilePolledChapterTerminalV1({
              jobId,
              chapter,
              binding: strictBinding!,
              dispatch: strictDispatch!,
              event: { type: 'error', error: chapterError },
              projectRevisionReader: options?.projectRevisionReader,
            });
          } else {
            // Chapter completed — persist the exact provider output identity for
            // the later child-cleanup materializer. Concat output is separate.
            if (strictJob) {
              await reconcilePolledChapterTerminalV1({
                jobId,
                chapter,
                binding: strictBinding!,
                dispatch: strictDispatch!,
                event: {
                  type: 'success',
                  outputUrl: renderProgress.outputFile!,
                  outputSize,
                },
                projectRevisionReader: options?.projectRevisionReader,
              });
            } else {
              await db.collection(CHAPTERS_COLLECTION).updateOne(
                { _id: jobId, 'chapters.index': chapter.index } as any,
                {
                  $set: {
                    'chapters.$.status': 'completed',
                    'chapters.$.outputUrl': renderProgress.outputFile,
                    ...(outputSize === undefined ? {} : { 'chapters.$.outputSize': outputSize }),
                    updatedAt: new Date(),
                  },
                },
              );
            }
            chapterStatus = 'completed';
            chapterOutputUrl = renderProgress.outputFile;
            chapterOutputSize = outputSize;
            progress = 1;
          }
        } else if (renderProgress.fatalErrorEncountered) {
          chapterStatus = 'failed';
          chapterError = renderProgress.errors?.[0]?.message || 'Render failed';
          if (strictJob) {
            await reconcilePolledChapterTerminalV1({
              jobId,
              chapter,
              binding: strictBinding!,
              dispatch: strictDispatch!,
              event: { type: 'error', error: chapterError },
              projectRevisionReader: options?.projectRevisionReader,
            });
          } else {
            await db.collection(CHAPTERS_COLLECTION).updateOne(
              { _id: jobId, 'chapters.index': chapter.index } as any,
              {
                $set: {
                  'chapters.$.status': 'failed',
                  'chapters.$.error': chapterError,
                  updatedAt: new Date(),
                },
              },
            );
          }
        }
      } catch (err: unknown) {
        if (isChapterProgressRevisionFenceError(err)) throw err;
        const message = chapterProgressErrorMessage(err);
        if (isTerminalChapterProgressError(message)) {
          console.warn('[ChapterRenderer] progress check failed (terminal):', message);
          chapterStatus = 'failed';
          chapterError = message;
          if (strictJob) {
            await reconcilePolledChapterTerminalV1({
              jobId,
              chapter,
              binding: strictBinding!,
              dispatch: strictDispatch!,
              event: { type: 'error', error: message },
              projectRevisionReader: options?.projectRevisionReader,
            });
          } else {
            await db.collection(CHAPTERS_COLLECTION).updateOne(
              { _id: jobId, 'chapters.index': chapter.index } as any,
              {
                $set: {
                  'chapters.$.status': 'failed',
                  'chapters.$.error': message,
                  updatedAt: new Date(),
                },
              },
            );
          }
        } else {
          console.warn('[ChapterRenderer] progress check failed (non-fatal):', message);
        }
      }
    }

    totalProgress += progress;
    chapterStatuses.push({
      index: chapter.index,
      status: chapterStatus,
      progress,
      outputUrl: chapterOutputUrl,
      outputSize: chapterOutputSize,
      error: chapterError,
    });
  }

  if (strictBinding) {
    await assertChapterChildProjectRevisionCurrentV1(
      strictBinding,
      options?.projectRevisionReader,
    );
  }

  // Advance the chapter queue: finished chapters have freed slots, so start the next pending one(s).
  // This is what carries the bounded-concurrency render past the first chapter.
  if (!options || options.parentState === 'RUNNING') {
    await startPendingChapters(jobId);
  }

  const overallProgress = job.chapters.length > 0
    ? totalProgress / job.chapters.length
    : 0;

  // Check if all chapters are done
  const allDone = chapterStatuses.every(c => c.status === 'completed' || c.status === 'failed');
  const allCompleted = chapterStatuses.every(c => c.status === 'completed');

  if (allDone && !allCompleted) {
    // Some chapters failed
    computedStatus = 'failed';
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId } as any,
      { $set: { status: 'failed', updatedAt: new Date() } },
    );
  }

  // When all chapters complete, the per-chapter MP4s must be stitched into one file:
  //  - single chapter → its one output IS the whole video; completes as-is.
  //  - multi-chapter  → reassemble (in chapter order) via the async concat worker when configured;
  //                     otherwise FAIL LOUD — never ship a truncated chapter 0 reported as "done".
  if (allCompleted) {
    if (chapterStatuses.length <= 1) {
      const onlyOutput = chapterStatuses.find(c => c.outputUrl)?.outputUrl;
      computedStatus = 'completed';
      completedOutputUrl = onlyOutput;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'completed', outputUrl: onlyOutput, updatedAt: new Date() } },
      );
    } else if (job.concatStatus === 'done' && typeof job.outputUrl === 'string') {
      // Concat worker finished and wrote the assembled URL.
      computedStatus = 'completed';
      completedOutputUrl = job.outputUrl;
    } else if (job.concatStatus === 'failed') {
      computedStatus = 'failed';
      completedError =
        typeof job.concatError === 'string' && job.concatError ? job.concatError : 'Chapter concatenation failed.';
      completedOutputUrl = undefined;
    } else if (
      (job.concatStatus === 'queued' || job.concatStatus === 'running') &&
      job.updatedAt &&
      Date.now() - new Date(job.updatedAt).getTime() > 20 * 60 * 1000 // 20 min ← Modal 900s timeout + QStash retries
    ) {
      // Concat was dispatched but the worker never reported back (bad QStash signature, Modal down
      // past retries, …). Fail loud instead of hanging in-progress forever.
      computedStatus = 'failed';
      completedError = 'Chapter concatenation timed out — the stitching worker did not report back.';
      completedOutputUrl = undefined;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'failed', concatStatus: 'failed', error: completedError, updatedAt: new Date() } },
      );
    } else if (isChapterConcatConfigured()) {
      // Strict rows persist one immutable target before the durable dispatch. The
      // worker reads that target rather than reconstructing it from mutable child
      // rows, so every retry uses the same generation and output key.
      if (isStrictChapterRenderJob(job)) {
        let concatTarget: ProjectChapterConcatTargetV1 | undefined;
        try {
          if (job.concatTarget) {
            assertProjectChapterConcatTargetV1(job.concatTarget);
            concatTarget = job.concatTarget;
          } else {
            concatTarget = buildProjectChapterConcatTargetV1(job, chapterStatuses);
          }
        } catch (err: unknown) {
          computedStatus = 'failed';
          completedError = err instanceof Error ? err.message : String(err);
          completedOutputUrl = undefined;
          await db.collection(CHAPTERS_COLLECTION).updateOne(
            { _id: jobId } as any,
            {
              $set: {
                status: 'failed',
                concatStatus: 'failed',
                concatError: completedError,
                updatedAt: new Date(),
              },
            },
          );
        }

        if (concatTarget) {
          // The target is written in the same atomic claim that changes the
          // status. A racing poll can observe either the old state or the full
          // target, never a queued job without its immutable input identity.
          const claim = await db.collection(CHAPTERS_COLLECTION).updateOne(
            {
              _id: jobId,
              concatStatus: { $exists: false },
              $or: [
                { concatTarget: { $exists: false } },
                { 'concatTarget.generation': concatTarget.generation },
              ],
            } as any,
            {
              $set: {
                concatTarget,
                concatStatus: 'queued',
                updatedAt: new Date(),
              },
            },
          );
          if (claim.modifiedCount === 1) {
            try {
              await enqueueChapterConcat(jobId, concatTarget.generation);
            } catch (err: unknown) {
              // Preserve the target: the next poll can re-queue the exact same
              // generation instead of making a new destination identity.
              await db.collection(CHAPTERS_COLLECTION).updateOne(
                {
                  _id: jobId,
                  concatStatus: 'queued',
                  'concatTarget.generation': concatTarget.generation,
                } as any,
                { $unset: { concatStatus: '' }, $set: { updatedAt: new Date() } },
              );
              console.warn(
                `[ChapterRenderer] Job ${jobId}: concat enqueue failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
      } else {
        // Genuine legacy rows have no PROJECT_SNAPSHOT binding. Do not enqueue
        // a raw URL job just to have the worker reject it: destination identity,
        // source revision and owner scope cannot be recovered safely. Keep the
        // row explicit for migration and stop before any provider dispatch.
        const legacyError = 'CHAPTER_CONCAT_LEGACY_REQUIRES_PROJECT_SNAPSHOT_MIGRATION';
        computedStatus = 'failed';
        completedError = legacyError;
        completedOutputUrl = undefined;
        const quarantine = await db.collection(CHAPTERS_COLLECTION).updateOne(
          { _id: jobId, concatStatus: { $exists: false } } as any,
          {
            $set: {
              status: 'failed',
              concatStatus: 'failed',
              concatError: legacyError,
              updatedAt: new Date(),
            },
          },
        );
        if (quarantine.modifiedCount !== 1) {
          console.warn(`[ChapterRenderer] Job ${jobId}: legacy concat quarantine was not claimed`);
        }
      }
      // Strict queued/running jobs remain in progress; legacy rows above are
      // terminal migration failures and are surfaced immediately.
    } else {
      // No concat worker configured → fail loud rather than ship a truncated chapter 0.
      computedStatus = 'failed';
      completedError =
        `This video was split into ${chapterStatuses.length} render chapters that cannot yet be ` +
        `stitched into a single file (multi-chapter assembly is not available). The full video ` +
        `could not be produced — re-render at a shorter length for now.`;
      completedOutputUrl = undefined;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'failed', error: completedError, updatedAt: new Date() } },
      );
    }
  }

  return {
    status: computedStatus,
    overallProgress,
    chapters: chapterStatuses,
    outputUrl: completedOutputUrl,
    outputSize: readChapterOutputSize(
      job.concatResult?.sizeBytes
        ?? (chapterStatuses.length === 1 ? chapterStatuses[0]?.outputSize : undefined),
    ),
    error: completedError,
  };
}
