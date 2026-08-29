import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import {
  resolveAnalysisWindow,
  resolveSourceStartFrame,
  selectAnalysisOverlay,
  type AnalysisFrameRange,
  type AnalysisOverlayCoordinates,
} from '@/lib/editron/agent/chat-analysis-coordinate-space';
import { buildChatProjectRevision } from '@/lib/editron/agent/chat-edit-postconditions';
import {
  assertNativeMediaTimestampPreviewClassificationLeaseV1,
  type NativeMediaTimestampPreviewClassificationLeaseV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1,
  type NativeMediaTimestampAnalysisReceiptV1,
} from './native-media-timestamp-analysis-consumer-v1';
import { analysisSameRevision } from './native-media-timestamp-analysis-validation-v1';
import { NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1 } from './native-media-timestamp-analysis-sample-plan-v1';
import { NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1 } from './native-media-timestamp-preview-materializer-v1';
import type { ProjectRevisionV1 } from './project-service';

export const CHAT_DEEP_ANALYSIS_JOB_VERSION = 'editron-chat-deep-analysis-job-v1' as const;
export const CHAT_DEEP_ANALYSIS_MAX_ATTEMPTS = 2;

const MAX_ANALYSIS_SECONDS = 120;
const JOB_LEASE_MS = 5 * 60 * 1000;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export type ChatDeepAnalysisModality = 'audio' | 'video';
export type ChatDeepAnalysisTargetMode = 'overlay' | 'asset' | 'timeline' | 'search' | 'all';
export type ChatDeepAnalysisRangeSpace = 'timeline' | 'source';
export type ChatDeepAnalysisJobStatus =
  | 'resolved'
  | 'dispatching'
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'dispatch_failed'
  | 'failed'
  | 'stale';

export interface ResolveChatDeepAnalysisRequest {
  projectId: string;
  userId: string;
  modality: ChatDeepAnalysisModality;
  targetMode: ChatDeepAnalysisTargetMode;
  overlayId?: string | number;
  assetId?: string;
  target?: string;
  rangeSpace?: ChatDeepAnalysisRangeSpace;
  startSeconds?: number;
  endSeconds?: number;
  windowSeconds?: number;
}

export interface ChatDeepAnalysisCoordinateContract {
  overlayId: string;
  overlayType: string;
  assetId: string;
  displayName: string | null;
  fps: number;
  timeline: AnalysisFrameRange;
  source: AnalysisFrameRange;
}

export interface ChatDeepAnalysisJob {
  _id: string;
  version: typeof CHAT_DEEP_ANALYSIS_JOB_VERSION;
  status: ChatDeepAnalysisJobStatus;
  projectId: string;
  userId: string;
  projectRevision: string;
  modality: ChatDeepAnalysisModality;
  targetMode: ChatDeepAnalysisTargetMode;
  target: ChatDeepAnalysisCoordinateContract;
  attemptCount: number;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  dispatchMessageId?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  expiresAt: Date;
}

export interface ResolveChatDeepAnalysisResult {
  status: 'resolved';
  batch: boolean;
  jobs: Array<{
    jobId: string;
    created: boolean;
    status: ChatDeepAnalysisJobStatus;
    target: ChatDeepAnalysisCoordinateContract;
  }>;
}

export interface QueueChatDeepAnalysisResult {
  status: 'queued' | 'already-queued' | 'completed' | 'failed' | 'stale';
  jobId: string;
  messageId?: string;
  reason?: string;
}

export interface RunChatDeepAnalysisResult {
  status: 'completed' | 'retrying' | 'failed' | 'stale' | 'skipped';
  jobId: string;
  result?: Record<string, unknown>;
  reason?: string;
}

interface AnalysisProject {
  fps?: number;
  overlays?: AnalysisOverlayCoordinates[];
}

export interface ChatDeepAnalysisJobStore {
  createOrGet(job: ChatDeepAnalysisJob): Promise<{ created: boolean; job: ChatDeepAnalysisJob }>;
  find(jobId: string, userId: string): Promise<ChatDeepAnalysisJob | null>;
  claimDispatch(jobId: string, userId: string, now: Date): Promise<boolean>;
  markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  claimRun(jobId: string, userId: string, leaseId: string, now: Date): Promise<ChatDeepAnalysisJob | null>;
  markCompleted(jobId: string, userId: string, result: Record<string, unknown>, now: Date): Promise<void>;
  markRetry(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  markFailed(jobId: string, userId: string, status: 'failed' | 'stale', error: string, now: Date): Promise<void>;
}

interface ResolutionDependencies {
  store: ChatDeepAnalysisJobStore;
  loadProject(userId: string, projectId: string): Promise<AnalysisProject | null>;
  buildProjectRevision(project: unknown): string | null;
  now(): Date;
}

interface QueueDependencies {
  store: ChatDeepAnalysisJobStore;
  loadProject(userId: string, projectId: string): Promise<AnalysisProject | null>;
  buildProjectRevision(project: unknown): string | null;
  publish(payload: { jobId: string; projectId: string; userId: string }): Promise<{ messageId?: string }>;
  now(): Date;
}

interface RunDependencies {
  store: ChatDeepAnalysisJobStore;
  loadProject(userId: string, projectId: string): Promise<AnalysisProject | null>;
  buildProjectRevision(project: unknown): string | null;
  execute(job: ChatDeepAnalysisJob): Promise<Record<string, unknown>>;
  now(): Date;
}

type ChatTimestampAnalysisMaterializerInputV1 = Readonly<{
  userId: string;
  projectId: string;
  sequenceId: 'main';
  overlayId: string;
  expectedProjectRevision: ProjectRevisionV1;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  deliveryContract: 'ANALYSIS_RECEIPT_V1';
}>;

interface ChatDeepAnalysisProviderDependencies {
  loadProjectForMutation(userId: string, projectId: string): Promise<Readonly<{
    project: AnalysisProject & Readonly<{ projectId?: string }>;
    revision: ProjectRevisionV1;
  }>>;
  materializeTimestampAnalysis(input: ChatTimestampAnalysisMaterializerInputV1): Promise<unknown>;
}

export async function resolveChatDeepAnalysisJobs(
  raw: ResolveChatDeepAnalysisRequest,
  overrides: Partial<ResolutionDependencies> = {},
): Promise<ResolveChatDeepAnalysisResult> {
  const request = normalizeResolutionRequest(raw);
  const deps = await resolveResolutionDependencies(overrides);
  const project = await deps.loadProject(request.userId, request.projectId);
  if (!project) throw new Error('Project not found or not owned by the current user.');
  const projectRevision = deps.buildProjectRevision(project);
  if (!projectRevision) throw new Error('Canonical project revision could not be computed.');
  const fps = positiveFinite(project.fps ?? 30, 'project fps');
  const overlays = analyzableOverlays(project, request.modality);
  if (overlays.length === 0) throw new Error(`No ${request.modality}-capable timeline overlays were found.`);

  const selected = request.targetMode === 'all'
    ? overlays
    : [selectOneOverlay(request, project, overlays, fps)];
  const now = deps.now();
  const jobs: ResolveChatDeepAnalysisResult['jobs'] = [];
  for (const overlay of selected) {
    const target = buildCoordinateContract(request, overlay, fps);
    const jobId = buildJobId(request, projectRevision, target);
    const proposed: ChatDeepAnalysisJob = {
      _id: jobId,
      version: CHAT_DEEP_ANALYSIS_JOB_VERSION,
      status: 'resolved',
      projectId: request.projectId,
      userId: request.userId,
      projectRevision,
      modality: request.modality,
      targetMode: request.targetMode,
      target,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + JOB_TTL_MS),
    };
    const stored = await deps.store.createOrGet(proposed);
    if (!sameResolvedContract(stored.job, proposed)) {
      throw new Error(`Analysis job collision for ${jobId}.`);
    }
    jobs.push({
      jobId,
      created: stored.created,
      status: stored.job.status,
      target: stored.job.target,
    });
  }
  return { status: 'resolved', batch: request.targetMode === 'all', jobs };
}

export async function queueChatDeepAnalysisJob(
  input: { jobId: string; projectId: string; userId: string },
  overrides: Partial<QueueDependencies> = {},
): Promise<QueueChatDeepAnalysisResult> {
  const deps = await resolveQueueDependencies(overrides);
  const job = await deps.store.find(requiredIdentifier(input.jobId, 'jobId'), input.userId);
  if (!job || job.projectId !== input.projectId) {
    return { status: 'failed', jobId: input.jobId, reason: 'analysis-job-not-found-or-not-owned' };
  }
  if (job.status === 'completed') return { status: 'completed', jobId: job._id };
  if (job.status === 'queued' || job.status === 'dispatching' || job.status === 'running') {
    return { status: 'already-queued', jobId: job._id, messageId: job.dispatchMessageId ?? undefined };
  }

  const project = await deps.loadProject(job.userId, job.projectId);
  const revision = project ? deps.buildProjectRevision(project) : null;
  if (!revision || revision !== job.projectRevision) {
    await deps.store.markFailed(job._id, job.userId, 'stale', 'project-revision-changed-before-analysis', deps.now());
    return { status: 'stale', jobId: job._id, reason: 'project-revision-changed-before-analysis' };
  }
  const claimed = await deps.store.claimDispatch(job._id, job.userId, deps.now());
  if (!claimed) return { status: 'already-queued', jobId: job._id };

  try {
    const published = await deps.publish({ jobId: job._id, projectId: job.projectId, userId: job.userId });
    await deps.store.markPublished(job._id, job.userId, published.messageId, deps.now());
    return { status: 'queued', jobId: job._id, ...(published.messageId ? { messageId: published.messageId } : {}) };
  } catch (error) {
    const message = errorMessage(error);
    await deps.store.markDispatchFailed(job._id, job.userId, message, deps.now());
    return { status: 'failed', jobId: job._id, reason: `analysis-dispatch-failed:${message}` };
  }
}

export async function runChatDeepAnalysisJob(
  input: { jobId: string; projectId: string; userId: string },
  overrides: Partial<RunDependencies> = {},
): Promise<RunChatDeepAnalysisResult> {
  const deps = await resolveRunDependencies(overrides);
  const leaseId = randomUUID();
  const job = await deps.store.claimRun(input.jobId, input.userId, leaseId, deps.now());
  if (!job) return { status: 'skipped', jobId: input.jobId, reason: 'job-not-claimable' };
  if (job.projectId !== input.projectId) {
    await deps.store.markFailed(job._id, job.userId, 'failed', 'worker-project-scope-mismatch', deps.now());
    return { status: 'failed', jobId: job._id, reason: 'worker-project-scope-mismatch' };
  }
  const project = await deps.loadProject(job.userId, job.projectId);
  const revision = project ? deps.buildProjectRevision(project) : null;
  if (!revision || revision !== job.projectRevision) {
    await deps.store.markFailed(job._id, job.userId, 'stale', 'project-revision-changed-before-provider-run', deps.now());
    return { status: 'stale', jobId: job._id, reason: 'project-revision-changed-before-provider-run' };
  }

  try {
    const result = await deps.execute(job);
    const completedProject = await deps.loadProject(job.userId, job.projectId);
    const completedRevision = completedProject
      ? deps.buildProjectRevision(completedProject)
      : null;
    if (!completedRevision || completedRevision !== job.projectRevision) {
      await deps.store.markFailed(
        job._id,
        job.userId,
        'stale',
        'project-revision-changed-during-provider-run',
        deps.now(),
      );
      return {
        status: 'stale',
        jobId: job._id,
        reason: 'project-revision-changed-during-provider-run',
      };
    }
    await deps.store.markCompleted(job._id, job.userId, result, deps.now());
    return { status: 'completed', jobId: job._id, result };
  } catch (error) {
    const message = errorMessage(error);
    if (job.attemptCount < CHAT_DEEP_ANALYSIS_MAX_ATTEMPTS) {
      await deps.store.markRetry(job._id, job.userId, message, deps.now());
      return { status: 'retrying', jobId: job._id, reason: message };
    }
    await deps.store.markFailed(job._id, job.userId, 'failed', message, deps.now());
    return { status: 'failed', jobId: job._id, reason: message };
  }
}

export async function executeChatDeepAnalysisProvider(
  job: ChatDeepAnalysisJob,
  overrides: Partial<ChatDeepAnalysisProviderDependencies> = {},
): Promise<Record<string, unknown>> {
  const target = job.target;
  if (job.modality === 'audio') {
    const { analyzeClipAudioService } = await import('@/lib/editron/services/media');
    const result = await analyzeClipAudioService({
      projectId: job.projectId,
      userId: job.userId,
      source: 'asset',
      assetId: target.assetId,
      startFrame: target.source.startFrame,
      endFrame: target.source.endFrame,
      timelineStartFrame: target.timeline.startFrame,
      fps: target.fps,
    });
    return {
      modality: 'audio',
      target,
      summary: result.summary,
      silenceGapsFrames: result.silenceGapsFrames,
      fillers: result.fillers,
      problematicFrames: result.problematicFrames,
    };
  }

  const deps = resolveProviderDependencies(overrides);
  const snapshot = await deps.loadProjectForMutation(job.userId, job.projectId);
  const currentTarget = validateCurrentVideoAnalysisTarget(job, snapshot.project);
  const timestampResult = await deps.materializeTimestampAnalysis({
    userId: job.userId,
    projectId: job.projectId,
    sequenceId: 'main',
    overlayId: target.overlayId,
    expectedProjectRevision: snapshot.revision,
    windowLocalStartFrame: currentTarget.windowLocalStartFrame,
    windowDurationInFrames: currentTarget.windowDurationInFrames,
    deliveryContract: 'ANALYSIS_RECEIPT_V1',
  });
  const disposition = objectRecord(timestampResult, 'CHAT_DEEP_ANALYSIS_TIMESTAMP_RESULT_INVALID')
    .disposition;
  if (disposition === 'ANALYSIS_MATERIALIZED') {
    return exactTimestampVideoResult(
      job,
      snapshot.revision,
      assertExactTimestampMaterialization(timestampResult, job, snapshot.revision),
    );
  }
  if (disposition !== 'NOT_APPLICABLE') {
    if (disposition === 'UNVERIFIABLE') {
      const reason = cleanString(
        objectRecord(timestampResult, 'CHAT_DEEP_ANALYSIS_TIMESTAMP_RESULT_INVALID').reason,
      ) ?? 'UNKNOWN';
      throw new Error(`CHAT_DEEP_ANALYSIS_EXACT_MEDIA_UNVERIFIABLE:${reason}`);
    }
    throw new Error('CHAT_DEEP_ANALYSIS_TIMESTAMP_RESULT_INVALID');
  }
  const classificationLease = assertOrdinaryTimestampClassification(
    timestampResult,
    job,
    snapshot.revision,
  );
  return executeLegacyVideoAnalysis(job, classificationLease);
}

async function executeLegacyVideoAnalysis(
  job: ChatDeepAnalysisJob,
  classificationLease: NativeMediaTimestampPreviewClassificationLeaseV1,
): Promise<Record<string, unknown>> {
  const target = job.target;
  const { sampleVideoClip, sendVideoToGemini } = await import('@/lib/editron/services/media/analysis-service');
  const sampledPath = await sampleVideoClip({
    projectId: job.projectId,
    userId: job.userId,
    source: 'asset',
    assetId: target.assetId,
    startFrame: target.source.startFrame,
    endFrame: target.source.endFrame,
    fps: target.fps,
    targetSampleFps: 1,
    maxDurationSec: MAX_ANALYSIS_SECONDS,
  });
  const provider = await sendVideoToGemini({ filePath: sampledPath, prompt: '' });
  const maximumSampleIndex = Math.ceil((target.timeline.endFrame - target.timeline.startFrame) / target.fps);
  const mapIndex = (value: unknown) => {
    const index = Number(value);
    if (!Number.isFinite(index) || index < 0 || index > maximumSampleIndex) return null;
    return target.timeline.startFrame + Math.round(index * target.fps);
  };
  const sceneChanges = provider.sceneChanges
    .map(mapIndex)
    .filter((frame): frame is number => frame !== null);
  const deadVisualRanges = provider.deadVisualRanges.flatMap((range) => {
    if (!Array.isArray(range) || range.length !== 2) return [];
    const startFrame = mapIndex(range[0]);
    const endFrame = mapIndex(range[1]);
    return startFrame !== null && endFrame !== null && endFrame > startFrame
      ? [[startFrame, endFrame]]
      : [];
  });
  return {
    modality: 'video',
    target,
    evidenceAuthority: 'LEGACY_RATE_SAMPLED_NOT_MUTATION_AUTHORITY',
    coordinateEvidence: {
      authority: 'LEGACY_RATE_SAMPLED_NOT_MUTATION_AUTHORITY',
      classificationLease,
      sampleRateFramesPerSecond: 1,
      mutationAuthority: false,
    },
    vision: {
      sceneChanges,
      deadVisualRanges,
      gestures: provider.gestures.filter((value): value is string => typeof value === 'string'),
      onScreenText: provider.onScreenText.filter((value): value is string => typeof value === 'string'),
      summary: provider.summary,
      theme: provider.theme,
    },
  };
}

function resolveProviderDependencies(
  overrides: Partial<ChatDeepAnalysisProviderDependencies>,
): ChatDeepAnalysisProviderDependencies {
  return {
    loadProjectForMutation: overrides.loadProjectForMutation ?? (async (userId, projectId) => {
      const { projectService } = await import('./project-service');
      return projectService.loadProjectForMutation(userId, projectId);
    }),
    materializeTimestampAnalysis: overrides.materializeTimestampAnalysis ?? (async (input) => {
      const { materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1 } = await import(
        './native-media-timestamp-preview-materializer-v1'
      );
      return materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(input);
    }),
  };
}

function validateCurrentVideoAnalysisTarget(
  job: ChatDeepAnalysisJob,
  project: AnalysisProject & Readonly<{ projectId?: string }>,
) {
  const target = job.target;
  if (cleanString(project.projectId) !== job.projectId) {
    throw new Error('CHAT_DEEP_ANALYSIS_PROJECT_SCOPE_MISMATCH');
  }
  const fps = positiveFinite(project.fps, 'current project fps');
  if (fps !== target.fps) throw new Error('CHAT_DEEP_ANALYSIS_PROJECT_RATE_CHANGED');
  const overlay = (project.overlays ?? []).find(
    (candidate) => String(candidate.id ?? '') === target.overlayId,
  );
  if (!overlay || overlay.type?.toLowerCase() !== 'video') {
    throw new Error('CHAT_DEEP_ANALYSIS_VIDEO_OVERLAY_CHANGED');
  }
  if (cleanString(overlay.assetId) !== target.assetId) {
    throw new Error('CHAT_DEEP_ANALYSIS_VIDEO_ASSET_CHANGED');
  }
  const overlayFrom = nonNegativeSafeInteger(overlay.from, 'current overlay start frame');
  const overlayDuration = positiveSafeInteger(
    overlay.durationInFrames,
    'current overlay duration',
  );
  const timelineStart = nonNegativeSafeInteger(
    target.timeline.startFrame,
    'analysis timeline start frame',
  );
  const timelineEnd = positiveSafeInteger(
    target.timeline.endFrame,
    'analysis timeline end frame',
  );
  const overlayEnd = overlayFrom + overlayDuration;
  if (!Number.isSafeInteger(overlayEnd)
    || timelineStart < overlayFrom
    || timelineEnd > overlayEnd
    || timelineEnd <= timelineStart) {
    throw new Error('CHAT_DEEP_ANALYSIS_VIDEO_RANGE_CHANGED');
  }
  const sourceStart = resolveSourceStartFrame(overlay) + timelineStart - overlayFrom;
  const sourceEnd = sourceStart + timelineEnd - timelineStart;
  if (!Number.isSafeInteger(sourceStart) || !Number.isSafeInteger(sourceEnd)
    || sourceStart !== target.source.startFrame
    || sourceEnd !== target.source.endFrame) {
    throw new Error('CHAT_DEEP_ANALYSIS_SOURCE_RANGE_CHANGED');
  }
  return Object.freeze({
    windowLocalStartFrame: timelineStart - overlayFrom,
    windowDurationInFrames: timelineEnd - timelineStart,
  });
}

function assertOrdinaryTimestampClassification(
  value: unknown,
  job: ChatDeepAnalysisJob,
  revision: ProjectRevisionV1,
): NativeMediaTimestampPreviewClassificationLeaseV1 {
  const record = objectRecord(value, 'CHAT_DEEP_ANALYSIS_TIMESTAMP_CLASSIFICATION_INVALID');
  if (record.disposition !== 'NOT_APPLICABLE'
    || record.reason !== 'ASSET_NOT_TIMESTAMP_MANAGED') {
    throw new Error('CHAT_DEEP_ANALYSIS_TIMESTAMP_CLASSIFICATION_INVALID');
  }
  let lease: NativeMediaTimestampPreviewClassificationLeaseV1;
  try {
    lease = assertNativeMediaTimestampPreviewClassificationLeaseV1(record.classificationLease);
  } catch {
    throw new Error('CHAT_DEEP_ANALYSIS_TIMESTAMP_CLASSIFICATION_INVALID');
  }
  if (lease.projectId !== job.projectId || lease.sequenceId !== 'main'
    || lease.overlayId !== job.target.overlayId || lease.assetId !== job.target.assetId
    || !analysisSameRevision(lease.projectRevision, revision)) {
    throw new Error('CHAT_DEEP_ANALYSIS_TIMESTAMP_CLASSIFICATION_SCOPE_MISMATCH');
  }
  return lease;
}

type ExactTimestampMaterializationV1 = Readonly<{
  samplePlan: Record<string, unknown>;
  analysisReceipt: NativeMediaTimestampAnalysisReceiptV1;
  samplePlanSha256: string;
  analysisReceiptSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  transformSha256: string;
  materializedPictureCount: number;
  materializationSha256: string;
}>;

function assertExactTimestampMaterialization(
  value: unknown,
  job: ChatDeepAnalysisJob,
  revision: ProjectRevisionV1,
): ExactTimestampMaterializationV1 {
  const record = objectRecord(value, 'CHAT_DEEP_ANALYSIS_EXACT_RESULT_INVALID');
  const samplePlan = objectRecord(record.samplePlan, 'CHAT_DEEP_ANALYSIS_EXACT_PLAN_INVALID');
  const receipt = objectRecord(record.analysisReceipt, 'CHAT_DEEP_ANALYSIS_EXACT_RECEIPT_INVALID');
  const samplePlanSha256 = sha256(record.samplePlanSha256);
  const analysisReceiptSha256 = sha256(record.analysisReceiptSha256);
  const sourcePtsCadenceMapStateSha256V3 = sha256(
    record.sourcePtsCadenceMapStateSha256V3,
  );
  const transformSha256 = sha256(record.transformSha256);
  const materializedPictureCount = positiveSafeInteger(
    record.materializedPictureCount,
    'materialized picture count',
  );
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1
    || samplePlan.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1
    || samplePlan.samplePlanSha256 !== samplePlanSha256
    || samplePlan.timelineStartFrame !== String(job.target.timeline.startFrame)
    || samplePlan.timelineEndExclusiveFrame !== String(job.target.timeline.endFrame)
    || !Array.isArray(samplePlan.samples)
    || samplePlan.samples.length !== materializedPictureCount
    || receipt.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1
    || receipt.projectId !== job.projectId
    || receipt.sequenceId !== 'main'
    || receipt.overlayId !== job.target.overlayId
    || receipt.transformSha256 !== transformSha256
    || receipt.receiptSha256 !== analysisReceiptSha256
    || !analysisSameRevision(receipt.projectRevision as ProjectRevisionV1, revision)
    || !Array.isArray(receipt.frameMap)
    || receipt.frameMap.length !== materializedPictureCount
    || !Array.isArray(receipt.observations)) {
    throw new Error('CHAT_DEEP_ANALYSIS_EXACT_RESULT_SCOPE_MISMATCH');
  }
  const materializationSha256 = sha256(record.materializationSha256);
  const material = {
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1,
    samplePlanSha256,
    analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3,
    transformSha256,
    materializedPictureCount,
  };
  if (materializationSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('CHAT_DEEP_ANALYSIS_EXACT_RESULT_HASH_MISMATCH');
  }
  return Object.freeze({
    samplePlan,
    analysisReceipt: receipt as unknown as NativeMediaTimestampAnalysisReceiptV1,
    samplePlanSha256,
    analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3,
    transformSha256,
    materializedPictureCount,
    materializationSha256,
  });
}

function exactTimestampVideoResult(
  job: ChatDeepAnalysisJob,
  revision: ProjectRevisionV1,
  materialization: ExactTimestampMaterializationV1,
): Record<string, unknown> {
  return {
    modality: 'video',
    target: job.target,
    evidenceAuthority: 'EXACT_V3_TIMESTAMP_BOUND',
    coordinateEvidence: {
      authority: 'EXACT_V3_TIMESTAMP_BOUND',
      mutationAuthority: 'REQUIRES_MUTATION_OWNER_PREREQUISITE_VALIDATION',
      projectRevision: revision,
      samplePlan: materialization.samplePlan,
      analysisReceipt: materialization.analysisReceipt,
      samplePlanSha256: materialization.samplePlanSha256,
      analysisReceiptSha256: materialization.analysisReceiptSha256,
      sourcePtsCadenceMapStateSha256V3:
        materialization.sourcePtsCadenceMapStateSha256V3,
      transformSha256: materialization.transformSha256,
      materializationSha256: materialization.materializationSha256,
    },
    vision: mapExactTimestampVision(materialization.analysisReceipt, job.target),
  };
}

function mapExactTimestampVision(
  receipt: NativeMediaTimestampAnalysisReceiptV1,
  target: ChatDeepAnalysisCoordinateContract,
) {
  const sceneChanges: number[] = [];
  const deadVisualRanges: Array<[number, number]> = [];
  const gestures: string[] = [];
  const onScreenText: string[] = [];
  let summary: string | null = null;
  let theme: string | null = null;
  for (const candidate of receipt.observations) {
    const observation = objectRecord(candidate, 'CHAT_DEEP_ANALYSIS_EXACT_OBSERVATION_INVALID');
    const signal = cleanString(observation.signal);
    const detail = cleanString(observation.detail);
    if (!signal || !detail) throw new Error('CHAT_DEEP_ANALYSIS_EXACT_OBSERVATION_INVALID');
    if (observation.kind === 'POINT') {
      const frame = exactTimelineFrame(observation.timelineFrame, target, false);
      if (signal === 'SCENE_CHANGE') sceneChanges.push(frame);
    } else if (observation.kind === 'RANGE') {
      const startFrame = exactTimelineFrame(observation.timelineStartFrame, target, false);
      const endFrame = exactTimelineFrame(observation.timelineEndExclusiveFrame, target, true);
      if (endFrame <= startFrame) {
        throw new Error('CHAT_DEEP_ANALYSIS_EXACT_OBSERVATION_RANGE_INVALID');
      }
      if (signal === 'DEAD_VISUAL_RANGE') deadVisualRanges.push([startFrame, endFrame]);
    } else if (observation.kind === 'GLOBAL') {
      if (observation.coordinateDisposition !== 'NO_RANGE_COORDINATE') {
        throw new Error('CHAT_DEEP_ANALYSIS_EXACT_OBSERVATION_INVALID');
      }
      if (signal === 'GESTURE_UNLOCATED') gestures.push(detail);
      if (signal === 'ON_SCREEN_TEXT_UNLOCATED') onScreenText.push(detail);
      if (signal === 'SUMMARY') summary = detail;
      if (signal === 'THEME') theme = detail;
    } else {
      throw new Error('CHAT_DEEP_ANALYSIS_EXACT_OBSERVATION_INVALID');
    }
  }
  return { sceneChanges, deadVisualRanges, gestures, onScreenText, summary, theme };
}

function exactTimelineFrame(
  value: unknown,
  target: ChatDeepAnalysisCoordinateContract,
  allowEnd: boolean,
): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('CHAT_DEEP_ANALYSIS_EXACT_FRAME_INVALID');
  }
  const integer = BigInt(value);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('CHAT_DEEP_ANALYSIS_EXACT_FRAME_INVALID');
  }
  const frame = Number(integer);
  if (frame < target.timeline.startFrame
    || (allowEnd ? frame > target.timeline.endFrame : frame >= target.timeline.endFrame)) {
    throw new Error('CHAT_DEEP_ANALYSIS_EXACT_FRAME_SCOPE_MISMATCH');
  }
  return frame;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('CHAT_DEEP_ANALYSIS_SHA256_INVALID');
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  const integer = nonNegativeSafeInteger(value, label);
  if (integer < 1) throw new Error(`${label} must be greater than zero.`);
  return integer;
}

export class MongoChatDeepAnalysisJobStore implements ChatDeepAnalysisJobStore {
  async createOrGet(job: ChatDeepAnalysisJob) {
    const collection = await jobsCollection();
    const result = await collection.updateOne({ _id: job._id }, { $setOnInsert: job }, { upsert: true });
    const stored = await collection.findOne({ _id: job._id });
    if (!stored) throw new Error(`Analysis job ${job._id} disappeared after upsert.`);
    return { created: result.upsertedCount === 1, job: stored };
  }

  async find(jobId: string, userId: string) {
    return (await jobsCollection()).findOne({ _id: jobId, userId });
  }

  async claimDispatch(jobId: string, userId: string, now: Date) {
    const result = await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: { $in: ['resolved', 'dispatch_failed'] } },
      { $set: { status: 'dispatching', updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'dispatching' },
      { $set: { status: 'queued', dispatchMessageId: messageId ?? null, updatedAt: now } },
    );
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'dispatching' },
      { $set: { status: 'dispatch_failed', error, updatedAt: now } },
    );
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    return (await jobsCollection()).findOneAndUpdate(
      {
        _id: jobId,
        userId,
        $or: [
          { status: 'queued' },
          { status: 'retry_wait' },
          { status: 'running', leaseExpiresAt: { $lt: now } },
        ],
        attemptCount: { $lt: CHAT_DEEP_ANALYSIS_MAX_ATTEMPTS },
      },
      {
        $set: {
          status: 'running',
          leaseId,
          leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
          updatedAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: 'after' },
    );
  }

  async markCompleted(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'running' },
      {
        $set: { status: 'completed', result, completedAt: now, updatedAt: now },
        $unset: { leaseId: '', leaseExpiresAt: '', error: '' },
      },
    );
  }

  async markRetry(jobId: string, userId: string, error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'running' },
      {
        $set: { status: 'retry_wait', error, updatedAt: now },
        $unset: { leaseId: '', leaseExpiresAt: '' },
      },
    );
  }

  async markFailed(jobId: string, userId: string, status: 'failed' | 'stale', error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId },
      {
        $set: { status, error, completedAt: now, updatedAt: now },
        $unset: { leaseId: '', leaseExpiresAt: '' },
      },
    );
  }
}

function normalizeResolutionRequest(raw: ResolveChatDeepAnalysisRequest): ResolveChatDeepAnalysisRequest {
  const request = {
    projectId: requiredIdentifier(raw.projectId, 'projectId'),
    userId: requiredIdentifier(raw.userId, 'userId'),
    modality: raw.modality,
    targetMode: raw.targetMode,
    ...(raw.overlayId !== undefined ? { overlayId: raw.overlayId } : {}),
    ...(cleanString(raw.assetId) ? { assetId: cleanString(raw.assetId) } : {}),
    ...(cleanString(raw.target) ? { target: cleanString(raw.target) } : {}),
    ...(raw.rangeSpace ? { rangeSpace: raw.rangeSpace } : {}),
    ...(Number.isFinite(raw.startSeconds) ? { startSeconds: Number(raw.startSeconds) } : {}),
    ...(Number.isFinite(raw.endSeconds) ? { endSeconds: Number(raw.endSeconds) } : {}),
    ...(Number.isFinite(raw.windowSeconds) ? { windowSeconds: Number(raw.windowSeconds) } : {}),
  } as ResolveChatDeepAnalysisRequest;
  if (!['audio', 'video'].includes(request.modality)) throw new Error('modality must be audio or video.');
  if (!['overlay', 'asset', 'timeline', 'search', 'all'].includes(request.targetMode)) {
    throw new Error('targetMode must be overlay, asset, timeline, search, or all.');
  }
  validateTargetMode(request);
  return request;
}

function validateTargetMode(request: ResolveChatDeepAnalysisRequest): void {
  const hasRange = request.startSeconds !== undefined || request.endSeconds !== undefined;
  if (hasRange && (request.startSeconds === undefined || request.endSeconds === undefined)) {
    throw new Error('startSeconds and endSeconds must be supplied together.');
  }
  if (request.targetMode === 'overlay' && request.overlayId === undefined) {
    throw new Error('overlay targetMode requires overlayId from the current editor selection or timeline evidence.');
  }
  if (request.targetMode === 'asset' && !request.assetId) throw new Error('asset targetMode requires assetId.');
  if (request.targetMode === 'search' && !request.target) throw new Error('search targetMode requires target.');
  if (request.targetMode === 'timeline' && !hasRange) throw new Error('timeline targetMode requires startSeconds and endSeconds.');
  if (request.targetMode !== 'overlay' && request.overlayId !== undefined) {
    throw new Error('overlayId is valid only for overlay targetMode.');
  }
  if (request.targetMode !== 'asset' && request.assetId) throw new Error('assetId is valid only for asset targetMode.');
  if (request.targetMode !== 'search' && request.target) throw new Error('target is valid only for search targetMode.');
  if (!['asset', 'timeline'].includes(request.targetMode) && hasRange) {
    throw new Error('Explicit ranges are valid only for asset or timeline targetMode.');
  }
  if (request.targetMode === 'timeline' && request.rangeSpace === 'source') {
    throw new Error('timeline targetMode cannot use source coordinate space.');
  }
  if (request.targetMode === 'all' && request.windowSeconds !== undefined) {
    throw new Error('all targetMode uses the bounded default window for every clip.');
  }
}

function analyzableOverlays(project: AnalysisProject, modality: ChatDeepAnalysisModality) {
  return (project.overlays ?? []).filter((overlay) => {
    const type = overlay.type?.toLowerCase();
    const typeMatches = modality === 'video' ? type === 'video' : ['audio', 'sound', 'video'].includes(type ?? '');
    return typeMatches && Boolean(cleanString(overlay.assetId));
  });
}

function selectOneOverlay(
  request: ResolveChatDeepAnalysisRequest,
  project: AnalysisProject,
  overlays: AnalysisOverlayCoordinates[],
  fps: number,
) {
  const requestedTimelineRange = request.targetMode === 'timeline'
    ? secondsRange(request.startSeconds, request.endSeconds, fps)
    : request.targetMode === 'asset' && request.rangeSpace !== 'source' && request.startSeconds !== undefined
      ? secondsRange(request.startSeconds, request.endSeconds, fps)
      : null;
  const overlayCandidates = request.targetMode === 'overlay'
    ? overlays.filter((overlay) => String(overlay.id) === String(request.overlayId))
    : overlays;
  if (request.targetMode === 'overlay' && overlayCandidates.length === 0) {
    throw new Error(`Requested overlay ${String(request.overlayId)} is not an analyzable ${request.modality} target.`);
  }
  return selectAnalysisOverlay({
    overlays: overlayCandidates,
    assetId: request.targetMode === 'asset' ? request.assetId : undefined,
    target: request.targetMode === 'search' ? request.target : undefined,
    requestedTimelineRange,
    selectedOverlayId: request.targetMode === 'overlay' ? request.overlayId : null,
  });
}

function buildCoordinateContract(
  request: ResolveChatDeepAnalysisRequest,
  overlay: AnalysisOverlayCoordinates,
  fps: number,
): ChatDeepAnalysisCoordinateContract {
  const maximumFrames = Math.round(MAX_ANALYSIS_SECONDS * fps);
  const preferredFrames = Math.min(
    maximumFrames,
    Math.max(1, Math.round((request.windowSeconds ?? MAX_ANALYSIS_SECONDS) * fps)),
  );
  let requestedTimelineRange: AnalysisFrameRange | null = null;
  if (request.startSeconds !== undefined && request.endSeconds !== undefined) {
    if (request.rangeSpace === 'source') {
      const full = resolveAnalysisWindow({
        overlay,
        preferredWindowFrames: Math.max(1, Math.round(overlay.durationInFrames ?? 1)),
        maxWindowFrames: Math.max(1, Math.round(overlay.durationInFrames ?? 1)),
      });
      const requestedSource = secondsRange(request.startSeconds, request.endSeconds, fps);
      requestedTimelineRange = {
        startFrame: full.timeline.startFrame + requestedSource.startFrame - full.source.startFrame,
        endFrame: full.timeline.startFrame + requestedSource.endFrame - full.source.startFrame,
      };
    } else {
      requestedTimelineRange = secondsRange(request.startSeconds, request.endSeconds, fps);
    }
  }
  const window = resolveAnalysisWindow({
    overlay,
    requestedTimelineRange,
    preferredWindowFrames: preferredFrames,
    maxWindowFrames: maximumFrames,
  });
  const assetId = cleanString(overlay.assetId);
  if (!assetId) throw new Error(`Overlay ${String(overlay.id)} has no durable assetId for deep analysis.`);
  return {
    overlayId: String(overlay.id ?? ''),
    overlayType: String(overlay.type ?? ''),
    assetId,
    displayName: cleanString(overlay.name),
    fps,
    timeline: window.timeline,
    source: window.source,
  };
}

function secondsRange(startSeconds: number | undefined, endSeconds: number | undefined, fps: number): AnalysisFrameRange {
  const start = nonNegativeFinite(startSeconds, 'startSeconds');
  const end = nonNegativeFinite(endSeconds, 'endSeconds');
  if (end <= start) throw new Error('endSeconds must be greater than startSeconds.');
  return { startFrame: Math.round(start * fps), endFrame: Math.round(end * fps) };
}

function buildJobId(
  request: ResolveChatDeepAnalysisRequest,
  projectRevision: string,
  target: ChatDeepAnalysisCoordinateContract,
) {
  const source = JSON.stringify({
    version: CHAT_DEEP_ANALYSIS_JOB_VERSION,
    userId: request.userId,
    projectId: request.projectId,
    projectRevision,
    modality: request.modality,
    target,
  });
  return `chat_analysis_${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}

function sameResolvedContract(left: ChatDeepAnalysisJob, right: ChatDeepAnalysisJob) {
  return left.version === right.version
    && left.userId === right.userId
    && left.projectId === right.projectId
    && left.projectRevision === right.projectRevision
    && left.modality === right.modality
    && JSON.stringify(left.target) === JSON.stringify(right.target);
}

async function resolveResolutionDependencies(overrides: Partial<ResolutionDependencies>): Promise<ResolutionDependencies> {
  const shared = await sharedDependencies(overrides);
  return { ...shared, store: overrides.store ?? new MongoChatDeepAnalysisJobStore() };
}

async function resolveQueueDependencies(overrides: Partial<QueueDependencies>): Promise<QueueDependencies> {
  const shared = await sharedDependencies(overrides);
  return {
    ...shared,
    store: overrides.store ?? new MongoChatDeepAnalysisJobStore(),
    publish: overrides.publish ?? publishChatDeepAnalysisJob,
  };
}

async function resolveRunDependencies(overrides: Partial<RunDependencies>): Promise<RunDependencies> {
  const shared = await sharedDependencies(overrides);
  return {
    ...shared,
    store: overrides.store ?? new MongoChatDeepAnalysisJobStore(),
    execute: overrides.execute ?? executeChatDeepAnalysisProvider,
  };
}

async function sharedDependencies(overrides: Partial<ResolutionDependencies>) {
  const loadProject = overrides.loadProject ?? (async (userId: string, projectId: string) => {
    const { projectService } = await import('@/lib/editron/services/project-service');
    return projectService.loadProject(userId, projectId) as Promise<AnalysisProject | null>;
  });
  const buildProjectRevision = overrides.buildProjectRevision ?? buildChatProjectRevision;
  return { loadProject, buildProjectRevision, now: overrides.now ?? (() => new Date()) };
}

async function publishChatDeepAnalysisJob(payload: { jobId: string; projectId: string; userId: string }) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable chat deep analysis.');
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/chat-deep-analysis`,
    body: payload,
    retries: CHAT_DEEP_ANALYSIS_MAX_ATTEMPTS - 1,
    headers: { 'Upstash-Timeout': '280s' },
  });
  return { messageId: (result as { messageId?: string }).messageId };
}

async function jobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatDeepAnalysisJob>(COLLECTIONS.CHAT_DEEP_ANALYSIS_JOBS);
}

function requiredIdentifier(value: unknown, label: string): string {
  const identifier = cleanString(value);
  if (!identifier || !/^[A-Za-z0-9:_-]{1,200}$/.test(identifier)) throw new Error(`${label} is invalid.`);
  return identifier;
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveFinite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function nonNegativeFinite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
