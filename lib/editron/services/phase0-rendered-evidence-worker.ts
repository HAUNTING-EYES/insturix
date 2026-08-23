import { createHash } from 'crypto';

import { Client } from '@upstash/qstash';
import {
  getRenderProgress,
  renderMediaOnLambda,
  renderStillOnLambda,
  type RenderStillOnLambdaOutput,
} from '@remotion/lambda/client';

import { REMOTION_COMPOSITION_ID, REMOTION_FRAMES_PER_LAMBDA } from './remotion-constants';
import {
  buildPhase0FixtureManifest,
  type Phase0FixtureProject,
  type Phase0OverlayLike,
  type Phase0RenderedAestheticReportLike,
  type Phase0RenderedQualityEvidencePayload,
} from './phase0-fixture-manifest';
import {
  buildPhase0RenderArtifactPack,
  type Phase0RenderInput,
} from './phase0-render-artifact-pack';
import {
  buildPhase0RenderedAestheticEvidence,
  type ReadRenderedStillImage,
} from './phase0-rendered-aesthetic-scoring';
import { buildPhase0RenderedQualityGate } from './editron-learning-gate';
import { buildPhase0LiveTruthSnapshot, type Phase0LiveTruthSnapshot } from './phase0-live-truth';
import { isInternalQStashWorkerAuthConfigured } from '@/lib/editron/security/internal-worker-auth';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';
import { resolveRemotionSiteFreshness } from './remotion-site-version';
import {
  inspectMediaAudioTrack,
  type InspectMediaAudioTrack,
  type MediaAudioTrackInspection,
} from './media-audio-track-service';
import { verifyRenderAudioRightsAuthority } from './render-audio-rights-authority';
import {
  buildLambdaRenderInputProps,
  isCanonicalMusicOverlay,
} from '@/lib/editron/shared/render-request-payload';
import type {
  ProjectMutationReceiptV1,
  ProjectPhase0RenderedEvidenceFactsV1,
} from './project-service';

export const PHASE0_RENDERED_STILL_EVIDENCE_VERSION = 'editron-phase0-rendered-still-evidence-v1' as const;
const PHASE0_RENDER_STILL_TIMEOUT_MS = 90_000;
const PHASE0_RENDER_STILL_TRANSIENT_REPAIR_BUDGET = 2;
const PHASE0_RENDER_STILL_LAMBDA_RETRIES = 0;
const AUDIO_FINGERPRINT_TARGET_HZ = 2_000;
const AUDIO_CONTINUITY_CHUNK_SECONDS = 0.2;
const AUDIO_CONTINUITY_MAX_ALIGNMENT_SECONDS = 0.01;
const AUDIO_CONTINUITY_MIN_SIMILARITY = 0.985;
const AUDIO_CONTINUITY_MIN_LOCAL_SIMILARITY = 0.94;
const AUDIO_CONTINUITY_MAX_RMS_DELTA_DB = 0.25;
const AUDIO_CONTINUITY_MAX_PEAK_DELTA_DB = 0.5;
const AUDIO_SILENCE_FLOOR = 1e-5;

type Phase0RenderedStillEvidenceStatus = 'completed' | 'partial' | 'failed' | 'skipped';

type EnvLike = Record<string, string | undefined>;

export interface Phase0RenderedEvidenceDispatchPayload {
  projectId: string;
  userId: string;
  requestedAt?: string;
  /** Required for the generic Director path; chat verification is migrated separately. */
  targetReceipt?: ProjectMutationReceiptV1;
  chatEditVerification?: ChatEditRenderVerificationRequest;
}

export type ChatEditRenderVerificationModality = 'visual' | 'audio';
export type ChatEditRenderVerificationExpectation =
  | 'mutation-delta'
  | 'continuity-preserved';

export interface ChatEditRenderVerificationTarget {
  overlayId: string;
  overlayType: string;
  state: 'created' | 'updated' | 'deleted';
  from: number | null;
  endFrame: number | null;
}

export interface ChatEditRenderVerificationMutationRange {
  startFrame: number;
  endFrame: number;
  toolName: string;
}

export interface ChatEditRenderVerificationRequest {
  version: 'editron-chat-render-verification-v1';
  operationId: string;
  sessionId: string;
  beforeCheckpointId: string;
  afterCheckpointId: string;
  /**
   * ProjectService receipt for the exact mutation this proof request describes.
   * It is optional only while independent legacy chat producers are migrated.
   */
  subjectReceipt?: ProjectMutationReceiptV1;
  requestedAt: string;
  modalities: ChatEditRenderVerificationModality[];
  expectedEffect?: ChatEditRenderVerificationExpectation;
  expectationsByModality?: Partial<
    Record<ChatEditRenderVerificationModality, ChatEditRenderVerificationExpectation>
  >;
  targets: ChatEditRenderVerificationTarget[];
  mutationRanges?: ChatEditRenderVerificationMutationRange[];
  inheritedRenderEligibilityOverlayIds?: string[];
  sampleFrames: number[];
}

export function normalizeChatEditInheritedRenderEligibilityOverlayIds(
  value: unknown,
): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) return null;

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return null;
    const overlayId = entry.trim();
    if (
      overlayId.length < 1
      || overlayId.length > 180
      || /[\u0000-\u001F\u007F]/.test(overlayId)
    ) return null;
    if (!normalized.includes(overlayId)) normalized.push(overlayId);
  }
  return normalized;
}

export function omitInheritedRenderDebtFromChatDeltaProject(
  project: Phase0FixtureProject,
  overlayIds: readonly string[] = [],
): Phase0FixtureProject {
  if (overlayIds.length === 0 || !Array.isArray(project.overlays)) return project;
  const omittedIds = new Set(overlayIds);
  return {
    ...project,
    overlays: project.overlays.filter((overlay) => !omittedIds.has(String(overlay.id ?? ''))),
  };
}

export interface ChatEditRenderedAudioWindowEvidence {
  startFrame: number;
  endFrame: number;
  beforeUrl: string | null;
  afterUrl: string | null;
  beforePcmSha256: string | null;
  afterPcmSha256: string | null;
  beforeRms: number | null;
  afterRms: number | null;
  beforePeak: number | null;
  afterPeak: number | null;
  comparisonMethod?: 'exact-pcm' | 'aligned-waveform-v1' | 'hash-fallback' | 'stream-presence';
  similarity?: number | null;
  worstLocalSimilarity?: number | null;
  rmsDeltaDb?: number | null;
  peakDeltaDb?: number | null;
  changed: boolean;
  error: string | null;
}

export interface ChatEditRenderedAudioEvidence {
  version: 'editron-chat-rendered-audio-v1';
  status: 'pass' | 'fail' | 'missing';
  capturedAt: string;
  windows: ChatEditRenderedAudioWindowEvidence[];
  skippedWindows?: ChatEditRenderedAudioSkippedWindow[];
  reason: string | null;
}

export interface ChatEditRenderedAudioSkippedWindow {
  startFrame: number;
  endFrame: number;
  beforeStatus: MediaAudioTrackInspection['status'];
  afterStatus: MediaAudioTrackInspection['status'];
  reason: string;
}

export interface Phase0RenderedEvidenceDispatchResult {
  dispatched: boolean;
  reason?: string;
  messageId?: string;
}

export interface Phase0RenderedStillFrameEvidence {
  frame: number;
  url: string;
  outKey: string;
  bucketName: string;
  renderId: string;
  sizeInBytes: number;
  baselineUrl?: string;
  baselineOutKey?: string;
  baselineBucketName?: string;
  baselineRenderId?: string;
  baselineSizeInBytes?: number;
  aestheticBaselineUrl?: string;
  aestheticBaselineOutKey?: string;
  aestheticBaselineBucketName?: string;
  aestheticBaselineRenderId?: string;
  aestheticBaselineSizeInBytes?: number;
}

export interface Phase0RenderedStillEvidence {
  version: typeof PHASE0_RENDERED_STILL_EVIDENCE_VERSION;
  status: Phase0RenderedStillEvidenceStatus;
  statusReason: string | null;
  source: 'phase0-rendered-evidence-worker';
  projectId: string;
  capturedAt: string;
  completedAt: string | null;
  functionName: string | null;
  serveUrl: string | null;
  region: string;
  sampleLimit: number;
  requestedSampleFrames: number[];
  renderedFrames: Phase0RenderedStillFrameEvidence[];
  failedFrames: Array<{ frame: number; error: string; renderKind?: 'full' | 'baseline' | 'aesthetic-baseline' | 'worker' }>;
  artifactPackStatus: 'ready' | 'not-renderable';
  artifactPackIssues: string[];
  renderedAestheticReport?: Phase0RenderedAestheticReportLike;
  renderedQualityEvidence?: Phase0RenderedQualityEvidencePayload;
  phase0LiveTruth?: Phase0LiveTruthSnapshot;
}

type RenderStill = typeof renderStillOnLambda;

export function resolvePhase0RenderedEvidenceConfig(env: EnvLike = process.env) {
  const enabled = !isExplicitlyFalse(env.EDITRON_PHASE0_RENDERED_EVIDENCE_AUTO);
  const functionName = env.REMOTION_PHASE0_LAMBDA_FUNCTION_NAME
    || env.REMOTION_LAMBDA_FUNCTION_NAME
    || '';
  const serveUrl = env.REMOTION_LAMBDA_SERVE_URL || '';
  const region = env.REMOTION_AWS_REGION || 'us-east-1';
  const sampleLimit = clampSampleLimit(env.EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES);
  const remotionSiteFreshness = serveUrl
    ? resolveRemotionSiteFreshness({ serveUrl, env })
    : null;
  const remotionSiteReady = !serveUrl || remotionSiteFreshness?.ok === true;

  return {
    enabled,
    functionName,
    serveUrl,
    region,
    sampleLimit,
    remotionSiteFreshness,
    configured: enabled && Boolean(functionName && serveUrl) && remotionSiteReady,
    reason: !enabled
      ? 'disabled'
      : !functionName
        ? 'missing_remotion_lambda_function_name'
        : !serveUrl
          ? 'missing_remotion_lambda_serve_url'
          : !remotionSiteReady
            ? `remotion_site_${remotionSiteFreshness?.reason ?? 'unverified'}`
            : null,
  };
}
export async function dispatchPhase0RenderedEvidenceJob(
  payload: Phase0RenderedEvidenceDispatchPayload,
  env: EnvLike = process.env,
): Promise<Phase0RenderedEvidenceDispatchResult> {
  const config = resolvePhase0RenderedEvidenceConfig(env);
  if (!config.configured) {
    return { dispatched: false, reason: config.reason ?? 'not_configured' };
  }

  const token = env.QSTASH_TOKEN?.trim();
  if (!token) return { dispatched: false, reason: 'missing_qstash_token' };
  if (!isInternalQStashWorkerAuthConfigured(env)) {
    return { dispatched: false, reason: 'missing_qstash_signing_keys' };
  }

  const baseUrl = env.VERCEL_URL
    ? `https://${env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/internal/workers/phase0-rendered-evidence`;
  const failureCallback = `${url}?qstashFailure=1`;
  const qstash = new Client({ token, baseUrl: env.QSTASH_URL || undefined });
  const result = await qstash.publishJSON({
    url,
    failureCallback,
    body: {
      ...payload,
      requestedAt: payload.requestedAt ?? new Date().toISOString(),
    },
    retries: 2,
    headers: {
      'Upstash-Timeout': '600s',
    },
  });

  return {
    dispatched: true,
    messageId: (result as { messageId?: string })?.messageId,
  };
}

export async function buildPhase0RenderedStillEvidence(
  project: Phase0FixtureProject,
  options: {
    capturedAt?: string;
    renderStill?: RenderStill;
    prepareCredentials?: () => Promise<void>;
    readImage?: ReadRenderedStillImage;
    env?: EnvLike;
    requestedSampleFrames?: number[];
    baselineProject?: Phase0FixtureProject;
    auditedOverlayIds?: Array<string | number>;
    comparisonMode?: 'mutation-delta' | 'continuity-preserved';
  } = {},
): Promise<Phase0RenderedStillEvidence> {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const config = resolvePhase0RenderedEvidenceConfig(options.env);
  const manifest = buildPhase0FixtureManifest(project, {
    capturedAt,
    source: 'phase0-rendered-evidence-worker',
  });
  const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
    artifactDir: `.calibration-temp/phase0-live/${safeSegment(manifest.projectId)}/${safeSegment(capturedAt)}`,
    maxSamples: config.sampleLimit,
  });
  const operationDurationInFrames = options.baselineProject
    ? Math.max(
        1,
        finitePositiveNumber(project.durationInFrames) ?? 1,
        finitePositiveNumber(options.baselineProject.durationInFrames) ?? 1,
        ...(options.requestedSampleFrames ?? []).map((frame) => Number.isFinite(frame) ? Math.round(frame) + 1 : 1),
      )
    : Math.max(1, Math.round(finitePositiveNumber(project.durationInFrames) ?? 1));
  const requestedSampleFrames = resolveRequestedSampleFrames({
    requested: options.requestedSampleFrames,
    fallback: artifactPack.samplePlan.sampledFrames,
    durationInFrames: operationDurationInFrames,
    sampleLimit: config.sampleLimit,
  });
  const operationRenderReady = Boolean(options.baselineProject)
    && hasUsableOperationalRenderInput(artifactPack.renderInput);
  const effectiveArtifactPackStatus: Phase0RenderedStillEvidence['artifactPackStatus'] = operationRenderReady
    ? 'ready' : artifactPack.status;

  if (!config.configured) {
    return baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status: 'skipped',
      statusReason: config.reason ?? 'not_configured',
    });
  }

  if (effectiveArtifactPackStatus !== 'ready') {
    return baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: effectiveArtifactPackStatus,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status: 'skipped',
      statusReason: 'artifact_pack_not_renderable',
    });
  }

  await (options.prepareCredentials ?? setAWSCredentials)();

  const renderStill = options.renderStill ?? renderStillOnLambda;
  const renderedFrames: Phase0RenderedStillFrameEvidence[] = [];
  const failedFrames: Phase0RenderedStillEvidence['failedFrames'] = [];
  const operationBaselinePack = options.baselineProject
    ? buildPhase0RenderArtifactPack(
        options.baselineProject,
        buildPhase0FixtureManifest(options.baselineProject, {
          capturedAt,
          source: 'phase0-rendered-evidence-worker',
        }),
        {
          artifactDir: `.calibration-temp/phase0-live/${safeSegment(manifest.projectId)}/${safeSegment(capturedAt)}-before`,
          maxSamples: config.sampleLimit,
        },
      )
    : null;
  const overlayOnlyInputProps = options.baselineProject
    ? {
        ...artifactPack.renderInput,
        durationInFrames: operationDurationInFrames,
        isRendering: true,
      }
    : {
        ...artifactPack.renderInput,
        overlays: buildOverlayOnlyRenderOverlays(
          artifactPack.renderInput.overlays,
          artifactPack.renderInput.width,
          artifactPack.renderInput.height,
        ),
        isRendering: true,
      };
  const baselineInputProps = operationBaselinePack
    ? {
        ...operationBaselinePack.renderInput,
        durationInFrames: operationDurationInFrames,
        isRendering: true,
      }
    : {
        ...artifactPack.renderInput,
        overlays: buildBaselineOverlays(
          artifactPack.renderInput.overlays,
          artifactPack.renderInput.width,
          artifactPack.renderInput.height,
        ),
        isRendering: true,
      };
  const aestheticBaselineOverlays = options.baselineProject
    ? buildAestheticBaselineOverlays(
        artifactPack.renderInput.overlays,
        options.auditedOverlayIds,
      )
    : null;
  const aestheticBaselineInputProps = aestheticBaselineOverlays
    ? {
        ...artifactPack.renderInput,
        overlays: aestheticBaselineOverlays,
        durationInFrames: operationDurationInFrames,
        isRendering: true,
      }
    : null;
  const frameConcurrency = aestheticBaselineInputProps ? 2 : 3;

  const frameResults = await mapWithConcurrency(
    requestedSampleFrames,
    frameConcurrency,
    async (frame) => {
      const renderPromises: [
        Promise<RenderStillOnLambdaOutput>,
        Promise<RenderStillOnLambdaOutput>,
        Promise<RenderStillOnLambdaOutput | null>,
      ] = [
        renderStillForEvidence(renderStill, {
          region: config.region as any,
          functionName: config.functionName,
          serveUrl: config.serveUrl,
          composition: REMOTION_COMPOSITION_ID,
          inputProps: overlayOnlyInputProps,
          imageFormat: 'png',
          privacy: 'public',
          frame,
          maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
        }),
        renderStillForEvidence(renderStill, {
          region: config.region as any,
          functionName: config.functionName,
          serveUrl: config.serveUrl,
          composition: REMOTION_COMPOSITION_ID,
          inputProps: baselineInputProps,
          imageFormat: 'png',
          privacy: 'public',
          frame,
          maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
        }),
        aestheticBaselineInputProps
          ? renderStillForEvidence(renderStill, {
              region: config.region as any,
              functionName: config.functionName,
              serveUrl: config.serveUrl,
              composition: REMOTION_COMPOSITION_ID,
              inputProps: aestheticBaselineInputProps,
              imageFormat: 'png',
              privacy: 'public',
              frame,
              maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
            })
          : Promise.resolve(null),
      ];
      const [fullResult, baselineResult, aestheticBaselineResult] =
        await Promise.allSettled(renderPromises);
      return { frame, fullResult, baselineResult, aestheticBaselineResult };
    },
  );

  // A transient failure must not retry while the initial Lambda fan-out is
  // still consuming render capacity. Preserve every successful still, then
  // repair only failed transient calls sequentially under a global budget.
  let transientRepairBudget = PHASE0_RENDER_STILL_TRANSIENT_REPAIR_BUDGET;
  for (const frameResult of frameResults) {
    if (
      transientRepairBudget > 0
      && frameResult.fullResult.status === 'rejected'
      && isTransientRenderedStillFailure(frameResult.fullResult.reason)
    ) {
      transientRepairBudget -= 1;
      frameResult.fullResult = await settleRenderedStillForEvidence(renderStill, {
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps: overlayOnlyInputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame: frameResult.frame,
        maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
      });
    }
    if (
      transientRepairBudget > 0
      && frameResult.baselineResult.status === 'rejected'
      && isTransientRenderedStillFailure(frameResult.baselineResult.reason)
    ) {
      transientRepairBudget -= 1;
      frameResult.baselineResult = await settleRenderedStillForEvidence(renderStill, {
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps: baselineInputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame: frameResult.frame,
        maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
      });
    }
    if (
      transientRepairBudget > 0
      && aestheticBaselineInputProps
      && frameResult.aestheticBaselineResult.status === 'rejected'
      && isTransientRenderedStillFailure(frameResult.aestheticBaselineResult.reason)
    ) {
      transientRepairBudget -= 1;
      frameResult.aestheticBaselineResult = await settleRenderedStillForEvidence(renderStill, {
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps: aestheticBaselineInputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame: frameResult.frame,
        maxRetries: PHASE0_RENDER_STILL_LAMBDA_RETRIES,
      });
    }
  }

  for (const { frame, fullResult, baselineResult, aestheticBaselineResult } of frameResults) {
    if (fullResult.status === 'rejected') {
      failedFrames.push({
        frame,
        renderKind: 'full',
        error: settledError(fullResult.reason),
      });
      continue;
    }
    if (baselineResult.status === 'fulfilled') {
      if (aestheticBaselineInputProps) {
        if (aestheticBaselineResult.status === 'rejected' || !aestheticBaselineResult.value) {
          failedFrames.push({
            frame,
            renderKind: 'aesthetic-baseline',
            error: aestheticBaselineResult.status === 'rejected'
              ? settledError(aestheticBaselineResult.reason)
              : 'aesthetic baseline render returned no artifact',
          });
          continue;
        }
      }
      renderedFrames.push(toFrameEvidence(
        frame,
        fullResult.value,
        baselineResult.value,
        aestheticBaselineResult.status === 'fulfilled'
          ? aestheticBaselineResult.value ?? undefined
          : undefined,
      ));
      continue;
    }
    failedFrames.push({
      frame,
      renderKind: 'baseline',
      error: settledError(baselineResult.reason),
    });
    renderedFrames.push(toFrameEvidence(frame, fullResult.value));
  }

  const pairedFrameCount = renderedFrames.filter((frame) => frame.baselineUrl).length;
  const status: Phase0RenderedStillEvidenceStatus = pairedFrameCount === requestedSampleFrames.length && failedFrames.length === 0
    ? 'completed'
    : renderedFrames.length > 0
      ? 'partial'
      : 'failed';
  const statusReason = status === 'completed'
    ? null
    : status === 'partial'
      ? 'rendered_still_partial'
      : 'rendered_still_failed';

  let evidence: Phase0RenderedStillEvidence = {
    ...baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: effectiveArtifactPackStatus,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status,
      statusReason,
    }),
    completedAt: new Date().toISOString(),
    renderedFrames,
    failedFrames,
  };

  if (renderedFrames.length > 0) {
    try {
      const aestheticEvidence = await buildPhase0RenderedAestheticEvidence(
        manifest,
        artifactPack,
        { renderedFrames },
        {
          readImage: options.readImage,
          auditedOverlayIds: options.auditedOverlayIds,
          comparisonMode: options.comparisonMode
            ?? (options.baselineProject ? 'mutation-delta' : 'overlay-visibility'),
        },
      );
      if (aestheticEvidence) {
        const phase0LiveTruth = buildPhase0LiveTruthSnapshot(project, {
          capturedAt,
          source: 'phase0-rendered-evidence-worker',
          artifactDir: artifactPack.artifactDir,
          artifactPack,
          renderedAestheticReport: aestheticEvidence.report,
        });
        const renderedQualityEvidence = markWorkerLocalRenderedAestheticArtifacts(aestheticEvidence.qualityEvidence);
        const workerPhase0LiveTruth: Phase0LiveTruthSnapshot = {
          ...phase0LiveTruth,
          qualityEvidence: renderedQualityEvidence,
        };
        evidence = {
          ...evidence,
          renderedAestheticReport: aestheticEvidence.report,
          renderedQualityEvidence,
          phase0LiveTruth: workerPhase0LiveTruth,
        };
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      evidence = {
        ...evidence,
        status: evidence.status === 'completed' ? 'partial' : evidence.status,
        failedFrames: [
          ...evidence.failedFrames,
          { frame: -1, renderKind: 'worker', error: `rendered-aesthetic-scoring:${error}` },
        ],
      };
    }
  }

  return evidence;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maximumConcurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(items.length, Math.floor(maximumConcurrency)));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  }));
  return results;
}

function settledError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function renderStillForEvidence(
  renderStill: RenderStill,
  input: Parameters<RenderStill>[0],
): Promise<RenderStillOnLambdaOutput> {
  return renderStill({
    ...input,
    timeoutInMilliseconds: PHASE0_RENDER_STILL_TIMEOUT_MS,
  });
}

async function settleRenderedStillForEvidence(
  renderStill: RenderStill,
  input: Parameters<RenderStill>[0],
): Promise<PromiseSettledResult<RenderStillOnLambdaOutput>> {
  try {
    return {
      status: 'fulfilled',
      value: await renderStillForEvidence(renderStill, input),
    };
  } catch (reason: unknown) {
    return {
      status: 'rejected',
      reason,
    };
  }
}

function isTransientRenderedStillFailure(error: unknown): boolean {
  const message = settledError(error).toLowerCase();
  return [
    'timeout',
    'timed out',
    'econnreset',
    'etimedout',
    'socket hang up',
    'stream prematurely closed',
    'service unavailable',
    'internal server error',
    'throttl',
  ].some((token) => message.includes(token));
}

interface RenderedAudioArtifact {
  url: string;
  renderId: string;
  bucketName: string;
  pcmSha256: string;
  rms: number;
  peak: number;
  fingerprint?: RenderedAudioFingerprint;
}

interface RenderedAudioFingerprint {
  sampleRate: number;
  samplesPerPoint: number;
  waveform: number[];
}

interface RenderedAudioComparison {
  method: ChatEditRenderedAudioWindowEvidence['comparisonMethod'];
  changed: boolean;
  similarity: number | null;
  worstLocalSimilarity: number | null;
  rmsDeltaDb: number | null;
  peakDeltaDb: number | null;
}

type RenderAudioWindow = (input: {
  inputProps: Record<string, unknown>;
  startFrame: number;
  endFrame: number;
  config: ReturnType<typeof resolvePhase0RenderedEvidenceConfig>;
}) => Promise<RenderedAudioArtifact>;

type AudioWindow = {
  startFrame: number;
  endFrame: number;
};

type AudioWindowTrackState = {
  status: MediaAudioTrackInspection['status'];
  reason: string | null;
};

type ClassifiedAudioWindow = AudioWindow & {
  before: AudioWindowTrackState;
  after: AudioWindowTrackState;
};

const EMPTY_AUDIO_PCM_SHA256 = createHash('sha256').update(Buffer.alloc(0)).digest('hex');

export async function buildChatEditRenderedAudioEvidence(
  project: Phase0FixtureProject,
  baselineProject: Phase0FixtureProject,
  request: ChatEditRenderVerificationRequest,
  options: {
    capturedAt?: string;
    env?: EnvLike;
    prepareCredentials?: () => Promise<void>;
    renderAudioWindow?: RenderAudioWindow;
    inspectAudioTrack?: InspectMediaAudioTrack;
  } = {},
): Promise<ChatEditRenderedAudioEvidence> {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const config = resolvePhase0RenderedEvidenceConfig(options.env);
  const fps = finitePositiveNumber(project.fps) ?? 30;
  const durationInFrames = Math.max(
    1,
    Math.round(finitePositiveNumber(project.durationInFrames) ?? 1),
    Math.round(finitePositiveNumber(baselineProject.durationInFrames) ?? 1),
    ...request.targets.map((target) => Math.max(target.from == null ? 0 : target.from + 1, target.endFrame ?? 0)),
  );
  const windows = buildChatEditAudioVerificationWindows({
    targets: request.targets,
    mutationRanges: request.mutationRanges,
    durationInFrames,
    fps,
    sampleLimit: config.sampleLimit,
  });
  const inspectAudioTrack = memoizeAudioTrackInspection(
    options.inspectAudioTrack ?? inspectMediaAudioTrack,
  );
  const classifiedWindows = await Promise.all(
    windows.map(async (window): Promise<ClassifiedAudioWindow> => ({
      ...window,
      before: await resolveAudioWindowTrackState(
        baselineProject.overlays,
        window,
        inspectAudioTrack,
      ),
      after: await resolveAudioWindowTrackState(
        project.overlays,
        window,
        inspectAudioTrack,
      ),
    })),
  );
  const unknownWindow = classifiedWindows.find(
    (window) => window.before.status === 'unknown' || window.after.status === 'unknown',
  );
  const skippedWindows = classifiedWindows
    .filter((window) => window.before.status === 'absent' && window.after.status === 'absent')
    .map((window): ChatEditRenderedAudioSkippedWindow => ({
      startFrame: window.startFrame,
      endFrame: window.endFrame,
      beforeStatus: window.before.status,
      afterStatus: window.after.status,
      reason: 'no_audio_stream_in_requested_window',
    }));

  if (unknownWindow) {
    return {
      version: 'editron-chat-rendered-audio-v1',
      status: 'missing',
      capturedAt,
      windows: [],
      skippedWindows,
      reason: `audio_stream_presence_unknown:${
        unknownWindow.before.reason
        ?? unknownWindow.after.reason
        ?? 'unresolved_media_track'
      }`,
    };
  }

  const applicableWindows = classifiedWindows.filter(
    (window) => window.before.status === 'present' || window.after.status === 'present',
  );
  if (applicableWindows.length === 0) {
    const hasExplicitAudioTarget = request.targets.some((target) =>
      ['audio', 'sound'].includes(target.overlayType.toLowerCase()),
    );
    return {
      version: 'editron-chat-rendered-audio-v1',
      status: hasExplicitAudioTarget ? 'fail' : 'pass',
      capturedAt,
      windows: [],
      skippedWindows,
      reason: hasExplicitAudioTarget
        ? 'expected_audio_stream_missing_in_requested_windows'
        : 'no_audio_stream_in_requested_windows',
    };
  }

  if (!config.configured) {
    return {
      version: 'editron-chat-rendered-audio-v1',
      status: 'missing',
      capturedAt,
      windows: [],
      skippedWindows,
      reason: config.reason ?? 'audio_render_not_configured',
    };
  }

  const afterManifest = buildPhase0FixtureManifest(project, {
    capturedAt,
    source: 'phase0-rendered-evidence-worker',
  });
  const beforeManifest = buildPhase0FixtureManifest(baselineProject, {
    capturedAt,
    source: 'phase0-rendered-evidence-worker',
  });
  const afterPack = buildPhase0RenderArtifactPack(project, afterManifest, {
    artifactDir: `.calibration-temp/chat-edit/${safeSegment(request.operationId)}/after`,
    maxSamples: config.sampleLimit,
  });
  const beforePack = buildPhase0RenderArtifactPack(baselineProject, beforeManifest, {
    artifactDir: `.calibration-temp/chat-edit/${safeSegment(request.operationId)}/before`,
    maxSamples: config.sampleLimit,
  });
  if (
    !hasUsableOperationalRenderInput(afterPack.renderInput)
    || !hasUsableOperationalRenderInput(beforePack.renderInput)
  ) {
    return {
      version: 'editron-chat-rendered-audio-v1',
      status: 'missing',
      capturedAt,
      windows: [],
      skippedWindows,
      reason: `audio_artifact_pack_not_renderable:${[
        ...afterPack.issues,
        ...beforePack.issues,
      ].slice(0, 4).join('|')}`,
    };
  }

  const beforeInputProps = {
    ...beforePack.renderInput,
    durationInFrames,
    isRendering: true,
    renderMediaMode: 'audio-only',
  };
  const afterInputProps = {
    ...afterPack.renderInput,
    durationInFrames,
    isRendering: true,
    renderMediaMode: 'audio-only',
  };
  const musicOverlays = [
    ...beforeInputProps.overlays,
    ...afterInputProps.overlays,
  ].filter(isCanonicalMusicOverlay);
  if (musicOverlays.length > 0) {
    const projectId = readNonEmptyString(project.projectId);
    const baselineProjectId = readNonEmptyString(baselineProject.projectId);
    const userId = readNonEmptyString(project.userId)
      ?? readNonEmptyString(baselineProject.userId);
    if (!projectId || !userId || (baselineProjectId && baselineProjectId !== projectId)) {
      throw new Error('Phase-0 audio rights authority requires one authenticated project identity.');
    }
    await verifyRenderAudioRightsAuthority({
      projectId,
      userId,
      overlays: musicOverlays,
    });
  }
  const authorizedBeforeInputProps = buildLambdaRenderInputProps(beforeInputProps);
  const authorizedAfterInputProps = buildLambdaRenderInputProps(afterInputProps);

  await (options.prepareCredentials ?? setAWSCredentials)();
  const renderAudioWindow = options.renderAudioWindow ?? renderLambdaAudioWindow;
  const evidenceWindows: ChatEditRenderedAudioWindowEvidence[] = [];
  for (const window of applicableWindows) {
    try {
      const [before, after] = await Promise.all([
        window.before.status === 'present'
          ? renderAudioWindow({
              inputProps: authorizedBeforeInputProps,
              startFrame: window.startFrame,
              endFrame: window.endFrame,
              config,
            })
          : Promise.resolve(null),
        window.after.status === 'present'
          ? renderAudioWindow({
              inputProps: authorizedAfterInputProps,
              startFrame: window.startFrame,
              endFrame: window.endFrame,
              config,
            })
          : Promise.resolve(null),
      ]);
      const beforePcmSha256 = before?.pcmSha256 ?? EMPTY_AUDIO_PCM_SHA256;
      const afterPcmSha256 = after?.pcmSha256 ?? EMPTY_AUDIO_PCM_SHA256;
      const comparison = compareRenderedAudioArtifacts(before, after);
      evidenceWindows.push({
        ...window,
        beforeUrl: before?.url ?? null,
        afterUrl: after?.url ?? null,
        beforePcmSha256,
        afterPcmSha256,
        beforeRms: before?.rms ?? 0,
        afterRms: after?.rms ?? 0,
        beforePeak: before?.peak ?? 0,
        afterPeak: after?.peak ?? 0,
        comparisonMethod: comparison.method,
        similarity: comparison.similarity,
        worstLocalSimilarity: comparison.worstLocalSimilarity,
        rmsDeltaDb: comparison.rmsDeltaDb,
        peakDeltaDb: comparison.peakDeltaDb,
        changed: comparison.changed,
        error: null,
      });
    } catch (error: unknown) {
      evidenceWindows.push({
        ...window,
        beforeUrl: null,
        afterUrl: null,
        beforePcmSha256: null,
        afterPcmSha256: null,
        beforeRms: null,
        afterRms: null,
        beforePeak: null,
        afterPeak: null,
        comparisonMethod: 'hash-fallback',
        similarity: null,
        worstLocalSimilarity: null,
        rmsDeltaDb: null,
        peakDeltaDb: null,
        changed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const expectsContinuity = (
    request.expectationsByModality?.audio
    ?? request.expectedEffect
  ) === 'continuity-preserved';
  const failed = evidenceWindows.filter((window) =>
    Boolean(window.error) || (expectsContinuity ? window.changed : !window.changed),
  );
  return {
    version: 'editron-chat-rendered-audio-v1',
    status: evidenceWindows.length > 0 && failed.length === 0 ? 'pass' : 'fail',
    capturedAt,
    windows: evidenceWindows,
    skippedWindows,
    reason: failed.length === 0
      ? null
      : failed[0]?.error
        ?? (expectsContinuity
          ? 'rendered_audio_changed_across_continuity_preserving_edit'
          : 'rendered_audio_did_not_change_in_the_requested_window'),
  };
}

function memoizeAudioTrackInspection(
  inspect: InspectMediaAudioTrack,
): InspectMediaAudioTrack {
  const cache = new Map<string, Promise<MediaAudioTrackInspection>>();
  return (url) => {
    const existing = cache.get(url);
    if (existing) return existing;
    const pending = inspect(url);
    cache.set(url, pending);
    return pending;
  };
}

async function resolveAudioWindowTrackState(
  overlays: Phase0FixtureProject['overlays'],
  window: AudioWindow,
  inspect: InspectMediaAudioTrack,
): Promise<AudioWindowTrackState> {
  const active = (Array.isArray(overlays) ? overlays : []).filter(
    (overlay) => overlayIntersectsAudioWindow(overlay, window) && overlayCanProduceAudio(overlay),
  );
  if (active.length === 0) return { status: 'absent', reason: null };

  const explicitAudio = active.find((overlay) =>
    ['audio', 'sound'].includes(String(overlay.type ?? '').toLowerCase()),
  );
  if (explicitAudio) return { status: 'present', reason: null };

  const videoUrls = Array.from(new Set(
    active
      .filter((overlay) => String(overlay.type ?? '').toLowerCase() === 'video')
      .map(mediaUrlOf)
      .filter((url): url is string => Boolean(url)),
  ));
  const hasVideoWithoutUrl = active.some(
    (overlay) =>
      String(overlay.type ?? '').toLowerCase() === 'video'
      && !mediaUrlOf(overlay),
  );
  const inspections = await Promise.all(videoUrls.map(inspect));
  if (inspections.some((result) => result.status === 'present')) {
    return { status: 'present', reason: null };
  }
  const unknown = inspections.find((result) => result.status === 'unknown');
  if (unknown || hasVideoWithoutUrl) {
    return {
      status: 'unknown',
      reason: unknown?.reason ?? 'video_audio_source_url_missing',
    };
  }
  return { status: 'absent', reason: null };
}

function overlayIntersectsAudioWindow(
  overlay: Phase0OverlayLike,
  window: AudioWindow,
): boolean {
  const from = numberValue(overlay.from) ?? 0;
  const duration = Math.max(1, numberValue(overlay.durationInFrames) ?? 1);
  return from < window.endFrame && from + duration > window.startFrame;
}

function overlayCanProduceAudio(overlay: Phase0OverlayLike): boolean {
  const type = String(overlay.type ?? '').toLowerCase();
  if (!['video', 'audio', 'sound'].includes(type)) return false;
  const styles = recordValue(overlay.styles);
  const muted = overlay.muted === true || styles?.muted === true;
  const volume = numberValue(styles?.volume) ?? numberValue(overlay.volume) ?? 1;
  return !muted && volume > 0;
}

function mediaUrlOf(overlay: Phase0OverlayLike): string | null {
  for (const value of [overlay.src, overlay.content]) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
    } catch {
      // Asset IDs and display labels are not media URLs.
    }
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildChatEditAudioVerificationWindows(input: {
  targets: ChatEditRenderVerificationTarget[];
  mutationRanges?: ChatEditRenderVerificationMutationRange[];
  durationInFrames: number;
  fps: number;
  sampleLimit: number;
}): Array<{ startFrame: number; endFrame: number }> {
  const duration = Math.max(1, Math.round(input.durationInFrames));
  const maxWindowFrames = Math.max(1, Math.round(input.fps * 6));
  const candidates: Array<{ startFrame: number; endFrame: number }> = [];
  const mutationContextFrames = Math.max(1, Math.round(input.fps * 2));

  for (const range of input.mutationRanges ?? []) {
    const start = clampFrame(range.startFrame, duration);
    const end = Math.max(start + 1, Math.min(duration, Math.round(range.endFrame)));
    candidates.push({
      startFrame: Math.max(0, start - mutationContextFrames),
      endFrame: Math.min(duration, end + mutationContextFrames),
    });
  }

  if (candidates.length > 0) {
    return dedupeAudioVerificationWindows(candidates, input.sampleLimit);
  }

  const audioTargets = input.targets.filter((target) =>
    ['audio', 'sound', 'video'].includes(target.overlayType.toLowerCase()),
  );

  for (const target of audioTargets) {
    const start = clampFrame(target.from ?? 0, duration);
    const end = Math.max(start + 1, Math.min(duration, Math.round(target.endFrame ?? duration)));
    const length = end - start;
    if (length <= maxWindowFrames) {
      candidates.push({ startFrame: start, endFrame: end });
      continue;
    }
    const midpoint = Math.round((start + end) / 2);
    candidates.push(
      { startFrame: start, endFrame: Math.min(end, start + maxWindowFrames) },
      boundedWindowAround(midpoint, maxWindowFrames, duration),
      { startFrame: Math.max(start, end - maxWindowFrames), endFrame: end },
    );
  }

  if (candidates.length === 0) {
    candidates.push({ startFrame: 0, endFrame: Math.min(duration, maxWindowFrames) });
  }
  return dedupeAudioVerificationWindows(candidates, input.sampleLimit);
}

function dedupeAudioVerificationWindows(
  candidates: Array<{ startFrame: number; endFrame: number }>,
  sampleLimit: number,
): Array<{ startFrame: number; endFrame: number }> {
  const unique = new Map<string, { startFrame: number; endFrame: number }>();
  for (const candidate of candidates) {
    unique.set(`${candidate.startFrame}:${candidate.endFrame}`, candidate);
  }
  return Array.from(unique.values()).slice(0, Math.max(1, Math.min(12, sampleLimit)));
}

async function renderLambdaAudioWindow(input: {
  inputProps: Record<string, unknown>;
  startFrame: number;
  endFrame: number;
  config: ReturnType<typeof resolvePhase0RenderedEvidenceConfig>;
}): Promise<RenderedAudioArtifact> {
  const { renderId, bucketName } = await renderMediaOnLambda({
    region: input.config.region as any,
    functionName: input.config.functionName,
    serveUrl: input.config.serveUrl,
    composition: REMOTION_COMPOSITION_ID,
    inputProps: input.inputProps,
    codec: 'wav',
    audioCodec: 'pcm-16',
    privacy: 'public',
    maxRetries: 1,
    framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
    timeoutInMilliseconds: 600_000,
    frameRange: [input.startFrame, Math.max(input.startFrame, input.endFrame - 1)],
  });
  const deadline = Date.now() + 8 * 60_000;
  let outputFile = '';
  while (Date.now() < deadline) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      region: input.config.region as any,
      functionName: input.config.functionName,
      skipLambdaInvocation: true,
    });
    if (progress.fatalErrorEncountered) {
      throw new Error(progress.errors?.[0]?.message ?? `Audio render ${renderId} failed.`);
    }
    if (progress.done) {
      outputFile = String(progress.outputFile ?? '');
      break;
    }
    await delay(1_500);
  }
  if (!outputFile) throw new Error(`Audio render ${renderId} did not finish before the verification deadline.`);

  const response = await fetch(outputFile);
  if (!response.ok) throw new Error(`Audio artifact download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pcm = inspectPcm16Wav(bytes);
  return {
    url: outputFile,
    renderId,
    bucketName,
    ...pcm,
  };
}

function inspectPcm16Wav(bytes: Buffer): {
  pcmSha256: string;
  rms: number;
  peak: number;
  fingerprint: RenderedAudioFingerprint;
} {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Rendered audio artifact is not a valid WAV file.');
  }
  let offset = 12;
  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let data: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(bytes.length, start + size);
    if (id === 'fmt ' && end - start >= 16) {
      format = bytes.readUInt16LE(start);
      channelCount = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      blockAlign = bytes.readUInt16LE(start + 12);
      bitsPerSample = bytes.readUInt16LE(start + 14);
    }
    if (id === 'data') {
      data = bytes.subarray(start, end);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (
    format !== 1
    || bitsPerSample !== 16
    || channelCount < 1
    || sampleRate < 1
    || blockAlign < channelCount * 2
    || !data
    || data.length < blockAlign
  ) {
    throw new Error('Rendered audio artifact is not PCM-16 WAV data.');
  }

  let energy = 0;
  let peak = 0;
  const sampleCount = Math.floor(data.length / 2);
  for (let index = 0; index < sampleCount; index++) {
    const normalized = data.readInt16LE(index * 2) / 32768;
    energy += normalized * normalized;
    peak = Math.max(peak, Math.abs(normalized));
  }
  return {
    pcmSha256: createHash('sha256').update(data).digest('hex'),
    rms: Math.sqrt(energy / sampleCount),
    peak,
    fingerprint: buildRenderedAudioFingerprint({
      data,
      channelCount,
      sampleRate,
      blockAlign,
    }),
  };
}

function buildRenderedAudioFingerprint(input: {
  data: Buffer;
  channelCount: number;
  sampleRate: number;
  blockAlign: number;
}): RenderedAudioFingerprint {
  const sourceFrameCount = Math.floor(input.data.length / input.blockAlign);
  const samplesPerPoint = Math.max(1, Math.floor(input.sampleRate / AUDIO_FINGERPRINT_TARGET_HZ));
  const waveform: number[] = [];
  for (let frameStart = 0; frameStart < sourceFrameCount; frameStart += samplesPerPoint) {
    const frameEnd = Math.min(sourceFrameCount, frameStart + samplesPerPoint);
    let sum = 0;
    let count = 0;
    for (let frame = frameStart; frame < frameEnd; frame++) {
      const frameOffset = frame * input.blockAlign;
      for (let channel = 0; channel < input.channelCount; channel++) {
        sum += input.data.readInt16LE(frameOffset + channel * 2) / 32768;
        count++;
      }
    }
    waveform.push(count > 0 ? sum / count : 0);
  }
  return {
    sampleRate: input.sampleRate,
    samplesPerPoint,
    waveform,
  };
}

function compareRenderedAudioArtifacts(
  before: RenderedAudioArtifact | null,
  after: RenderedAudioArtifact | null,
): RenderedAudioComparison {
  if (!before || !after) {
    return {
      method: 'stream-presence',
      changed: Boolean(before) !== Boolean(after),
      similarity: null,
      worstLocalSimilarity: null,
      rmsDeltaDb: null,
      peakDeltaDb: null,
    };
  }
  if (before.pcmSha256 === after.pcmSha256) {
    return {
      method: 'exact-pcm',
      changed: false,
      similarity: 1,
      worstLocalSimilarity: 1,
      rmsDeltaDb: 0,
      peakDeltaDb: 0,
    };
  }
  const beforeFingerprint = before.fingerprint;
  const afterFingerprint = after.fingerprint;
  if (
    !beforeFingerprint
    || !afterFingerprint
    || beforeFingerprint.sampleRate !== afterFingerprint.sampleRate
    || beforeFingerprint.samplesPerPoint !== afterFingerprint.samplesPerPoint
  ) {
    return {
      method: 'hash-fallback',
      changed: true,
      similarity: null,
      worstLocalSimilarity: null,
      rmsDeltaDb: decibelDelta(before.rms, after.rms),
      peakDeltaDb: decibelDelta(before.peak, after.peak),
    };
  }

  const pointRate = beforeFingerprint.sampleRate / beforeFingerprint.samplesPerPoint;
  const local = compareAlignedWaveforms(
    beforeFingerprint.waveform,
    afterFingerprint.waveform,
    Math.max(32, Math.round(pointRate * AUDIO_CONTINUITY_CHUNK_SECONDS)),
    Math.max(1, Math.round(pointRate * AUDIO_CONTINUITY_MAX_ALIGNMENT_SECONDS)),
  );
  const rmsDeltaDb = decibelDelta(before.rms, after.rms);
  const peakDeltaDb = decibelDelta(before.peak, after.peak);
  const equivalent = local.similarity >= AUDIO_CONTINUITY_MIN_SIMILARITY
    && local.worstLocalSimilarity >= AUDIO_CONTINUITY_MIN_LOCAL_SIMILARITY
    && rmsDeltaDb <= AUDIO_CONTINUITY_MAX_RMS_DELTA_DB
    && peakDeltaDb <= AUDIO_CONTINUITY_MAX_PEAK_DELTA_DB;
  return {
    method: 'aligned-waveform-v1',
    changed: !equivalent,
    similarity: local.similarity,
    worstLocalSimilarity: local.worstLocalSimilarity,
    rmsDeltaDb,
    peakDeltaDb,
  };
}

function compareAlignedWaveforms(
  before: number[],
  after: number[],
  chunkSize: number,
  maxLag: number,
): { similarity: number; worstLocalSimilarity: number } {
  const length = Math.min(before.length, after.length);
  if (length === 0) return { similarity: 0, worstLocalSimilarity: 0 };

  let weightedScore = 0;
  let totalWeight = 0;
  let worstLocalSimilarity = 1;
  for (let start = 0; start < length; start += chunkSize) {
    const end = Math.min(length, start + chunkSize);
    const score = bestLocalWaveformSimilarity(before, after, start, end, maxLag);
    const weight = Math.max(score.weight, AUDIO_SILENCE_FLOOR);
    weightedScore += score.similarity * weight;
    totalWeight += weight;
    worstLocalSimilarity = Math.min(worstLocalSimilarity, score.similarity);
  }
  return {
    similarity: totalWeight > 0 ? weightedScore / totalWeight : 1,
    worstLocalSimilarity,
  };
}

function bestLocalWaveformSimilarity(
  before: number[],
  after: number[],
  start: number,
  end: number,
  maxLag: number,
): { similarity: number; weight: number } {
  let bestSimilarity = -1;
  let bestWeight = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0;
    let beforeEnergy = 0;
    let afterEnergy = 0;
    let compared = 0;
    for (let index = start; index < end; index++) {
      const shifted = index + lag;
      if (shifted < 0 || shifted >= after.length) continue;
      const beforeSample = before[index] ?? 0;
      const afterSample = after[shifted] ?? 0;
      dot += beforeSample * afterSample;
      beforeEnergy += beforeSample * beforeSample;
      afterEnergy += afterSample * afterSample;
      compared++;
    }
    if (compared === 0) continue;
    const beforeRms = Math.sqrt(beforeEnergy / compared);
    const afterRms = Math.sqrt(afterEnergy / compared);
    const weight = Math.max(beforeRms, afterRms) * compared;
    const bothSilent = beforeRms <= AUDIO_SILENCE_FLOOR && afterRms <= AUDIO_SILENCE_FLOOR;
    const oneSilent = beforeRms <= AUDIO_SILENCE_FLOOR || afterRms <= AUDIO_SILENCE_FLOOR;
    const similarity = bothSilent
      ? 1
      : oneSilent
        ? 0
        : Math.max(-1, Math.min(1, dot / Math.sqrt(beforeEnergy * afterEnergy)));
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestWeight = weight;
    }
  }
  return {
    similarity: Math.max(0, bestSimilarity),
    weight: bestWeight,
  };
}

function decibelDelta(before: number, after: number): number {
  if (before <= AUDIO_SILENCE_FLOOR && after <= AUDIO_SILENCE_FLOOR) return 0;
  if (before <= AUDIO_SILENCE_FLOOR || after <= AUDIO_SILENCE_FLOOR) return Number.POSITIVE_INFINITY;
  return Math.abs(20 * Math.log10(after / before));
}


function markWorkerLocalRenderedAestheticArtifacts(
  evidence: Phase0RenderedQualityEvidencePayload,
): Phase0RenderedQualityEvidencePayload {
  if (evidence.qualityEvidenceSource !== 'rendered-aesthetic') return evidence;
  return {
    ...evidence,
    renderedAestheticArtifactAccess: 'worker-local',
    renderedAestheticArtifactNote: 'Rendered aesthetic report paths were created inside the Phase0 worker filesystem; use persisted rendered still URLs for durable visual evidence.',
  };
}

export function buildPhase0RenderedStillEvidenceFailure(input: {
  projectId: string;
  error: string;
  capturedAt?: string;
  env?: EnvLike;
}): Phase0RenderedStillEvidence {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const config = resolvePhase0RenderedEvidenceConfig(input.env);
  return {
    ...baseEvidence({
      projectId: input.projectId,
      capturedAt,
      config,
      artifactPackStatus: 'not-renderable',
      artifactPackIssues: [`worker-error:${input.error}`],
      requestedSampleFrames: [],
      status: 'failed',
      statusReason: 'worker_error',
    }),
    completedAt: new Date().toISOString(),
    failedFrames: [{ frame: -1, renderKind: 'worker', error: input.error }],
  };
}

function buildMissingPhase0RenderedQualityEvidence(
  evidence: Phase0RenderedStillEvidence,
): Phase0RenderedQualityEvidencePayload {
  const firstFailure = evidence.failedFrames[0]?.error;
  const firstIssue = evidence.artifactPackIssues[0];
  const reason = evidence.statusReason ?? firstFailure ?? firstIssue ?? `phase0-worker-status:${evidence.status}`;
  return {
    qualityEvidenceSource: 'metadata-only',
    renderedAestheticStatus: 'missing',
    renderedQualityStatus: 'missing',
    artifactStatus: 'missing',
    qualityScore: null,
    renderedAestheticScore: null,
    renderedAestheticIssueCount: 0,
    renderedAestheticFailFrameCount: 0,
    renderedAestheticWarnFrameCount: 0,
    renderedAestheticSampledFrames: 0,
    renderedAestheticJson: null,
    renderedAestheticHtml: null,
    renderedAestheticArtifactAccess: 'missing',
    renderedAestheticArtifactNote: `Rendered aesthetic report artifacts are missing; ${reason}`.slice(0, 240),
    renderedAestheticIssueSamples: [],
  };
}

/**
 * Converts render output into the narrow fact set ProjectService is allowed
 * to persist. The worker produces facts; it never owns a project write.
 */
export function toProjectPhase0RenderedEvidenceFacts(
  evidence: Phase0RenderedStillEvidence,
): ProjectPhase0RenderedEvidenceFactsV1 {
  const renderedQualityEvidence = evidence.renderedQualityEvidence
    ?? buildMissingPhase0RenderedQualityEvidence(evidence);
  const renderedQualityGate = buildPhase0RenderedQualityGate({
    qualityEvidence: renderedQualityEvidence,
    evaluatedAt: evidence.completedAt ?? evidence.capturedAt,
    hasQualityReview: renderedQualityEvidence.qualityEvidenceSource === 'rendered-aesthetic',
  });

  return {
    renderedStillEvidence: evidence,
    fixtureArtifact: {
      materialization: evidence.renderedFrames.length > 0
        ? 'lambda-stills-rendered'
        : 'lambda-stills-missing',
      renderedStillEvidenceStatus: evidence.status,
      renderedStillEvidenceReason: evidence.statusReason,
      renderedStillFrameCount: evidence.renderedFrames.length,
      renderedStillFailedFrameCount: evidence.failedFrames.length,
      renderedStillCompletedAt: evidence.completedAt,
      renderedAestheticStatus: renderedQualityEvidence.renderedAestheticStatus,
      renderedAestheticScore: renderedQualityEvidence.renderedAestheticScore,
      renderedAestheticIssueCount: renderedQualityEvidence.renderedAestheticIssueCount,
      renderedAestheticFailFrameCount: renderedQualityEvidence.renderedAestheticFailFrameCount,
      renderedAestheticWarnFrameCount: renderedQualityEvidence.renderedAestheticWarnFrameCount,
      renderedAestheticSampledFrames: renderedQualityEvidence.renderedAestheticSampledFrames,
    },
    renderedQualityEvidence,
    renderedQualityGate,
    ...(evidence.renderedAestheticReport ? { renderedAestheticReport: evidence.renderedAestheticReport } : {}),
    ...(evidence.phase0LiveTruth ? { liveTruth: evidence.phase0LiveTruth } : {}),
    ...(renderedQualityGate.status === 'needs_review' ? {
      reviewDisposition: {
        autoEditStatus: 'needs_review',
        projectStatus: 'needs-attention',
        autoEditHealth: 'needs_review',
        autoEditWarning: renderedQualityGate.warning,
      },
    } : {}),
  };
}

function baseEvidence(input: {
  projectId: string;
  capturedAt: string;
  config: ReturnType<typeof resolvePhase0RenderedEvidenceConfig>;
  artifactPackStatus: Phase0RenderedStillEvidence['artifactPackStatus'];
  artifactPackIssues: string[];
  requestedSampleFrames: number[];
  status: Phase0RenderedStillEvidenceStatus;
  statusReason?: string | null;
}): Phase0RenderedStillEvidence {
  return {
    version: PHASE0_RENDERED_STILL_EVIDENCE_VERSION,
    status: input.status,
    statusReason: input.statusReason ?? null,
    source: 'phase0-rendered-evidence-worker',
    projectId: input.projectId,
    capturedAt: input.capturedAt,
    completedAt: null,
    functionName: input.config.functionName || null,
    serveUrl: input.config.serveUrl || null,
    region: input.config.region,
    sampleLimit: input.config.sampleLimit,
    requestedSampleFrames: input.requestedSampleFrames,
    renderedFrames: [],
    failedFrames: [],
    artifactPackStatus: input.artifactPackStatus,
    artifactPackIssues: input.artifactPackIssues.slice(0, 20),
  };
}

function toFrameEvidence(
  frame: number,
  still: RenderStillOnLambdaOutput,
  baselineStill?: RenderStillOnLambdaOutput,
  aestheticBaselineStill?: RenderStillOnLambdaOutput,
): Phase0RenderedStillFrameEvidence {
  return {
    frame,
    url: still.url,
    outKey: still.outKey,
    bucketName: still.bucketName,
    renderId: still.renderId,
    sizeInBytes: still.sizeInBytes,
    ...(baselineStill ? {
      baselineUrl: baselineStill.url,
      baselineOutKey: baselineStill.outKey,
      baselineBucketName: baselineStill.bucketName,
      baselineRenderId: baselineStill.renderId,
      baselineSizeInBytes: baselineStill.sizeInBytes,
    } : {}),
    ...(aestheticBaselineStill ? {
      aestheticBaselineUrl: aestheticBaselineStill.url,
      aestheticBaselineOutKey: aestheticBaselineStill.outKey,
      aestheticBaselineBucketName: aestheticBaselineStill.bucketName,
      aestheticBaselineRenderId: aestheticBaselineStill.renderId,
      aestheticBaselineSizeInBytes: aestheticBaselineStill.sizeInBytes,
    } : {}),
  };
}

function buildAestheticBaselineOverlays(
  overlays: Phase0FixtureProject['overlays'],
  auditedOverlayIds: Array<string | number> | undefined,
): Phase0FixtureProject['overlays'] | null {
  const auditedIds = new Set((auditedOverlayIds ?? []).map(String));
  if (auditedIds.size === 0) return null;
  const source = Array.isArray(overlays) ? overlays : [];
  const filtered = source.filter((overlay) => !auditedIds.has(String(overlay.id)));
  return filtered.length === source.length ? null : filtered;
}

function buildBaselineOverlays(
  overlays: Phase0FixtureProject['overlays'],
  width: number,
  height: number,
) {
  return (Array.isArray(overlays) ? overlays : []).filter((overlay) => {
    const type = String(overlay.type ?? '');
    if (type === 'video' || type === 'sound' || type === 'audio') return false;
    return isLikelyBackgroundOverlay(overlay, width, height);
  });
}

function buildOverlayOnlyRenderOverlays(
  overlays: Phase0FixtureProject['overlays'],
  width: number,
  height: number,
) {
  return (Array.isArray(overlays) ? overlays : []).filter((overlay) => {
    const type = String(overlay.type ?? '');
    if (type === 'video' || type === 'sound' || type === 'audio') return false;
    return isAuditedVisualOverlay(type) || isLikelyBackgroundOverlay(overlay, width, height);
  });
}

function isAuditedVisualOverlay(type: string): boolean {
  return [
    'motion-graphic',
    'text',
    'caption',
    'shape',
    'sticker',
    'image',
    'html-scene',
    'html-sticker',
    'transition',
  ].includes(type);
}

function isLikelyBackgroundOverlay(
  overlay: NonNullable<Phase0FixtureProject['overlays']>[number],
  width: number,
  height: number,
): boolean {
  const type = String(overlay.type ?? '');
  if (type !== 'image' && type !== 'html-scene') return false;
  const left = numberValue(overlay.left);
  const top = numberValue(overlay.top);
  const overlayWidth = numberValue(overlay.width);
  const overlayHeight = numberValue(overlay.height);
  if (left === undefined || top === undefined || overlayWidth === undefined || overlayHeight === undefined) return false;
  const frameArea = Math.max(1, width * height);
  return left <= width * 0.05
    && top <= height * 0.05
    && overlayWidth * overlayHeight >= frameArea * 0.72;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampSampleLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(24, Math.floor(parsed)));
}

function hasUsableOperationalRenderInput(input: Phase0RenderInput): boolean {
  return finitePositiveNumber(input.width) !== null
    && finitePositiveNumber(input.height) !== null
    && finitePositiveNumber(input.fps) !== null
    && finitePositiveNumber(input.durationInFrames) !== null
    && Array.isArray(input.overlays);
}

function resolveRequestedSampleFrames(input: {
  requested?: number[];
  fallback: number[];
  durationInFrames: number;
  sampleLimit: number;
}): number[] {
  const duration = Math.max(1, Math.round(Number.isFinite(input.durationInFrames) ? input.durationInFrames : 1));
  const source = input.requested?.length ? input.requested : input.fallback;
  const frames = source
    .filter((frame) => Number.isFinite(frame))
    .map((frame) => clampFrame(frame, duration));
  return Array.from(new Set(frames)).slice(0, input.sampleLimit);
}

function boundedWindowAround(frame: number, length: number, duration: number) {
  const startFrame = Math.max(0, Math.min(duration - 1, Math.round(frame - length / 2)));
  return {
    startFrame,
    endFrame: Math.min(duration, Math.max(startFrame + 1, startFrame + length)),
  };
}

function clampFrame(frame: number, duration: number): number {
  return Math.max(0, Math.min(Math.max(0, duration - 1), Math.round(frame)));
}

function finitePositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExplicitlyFalse(value: string | undefined): boolean {
  return ['0', 'false', 'off', 'no'].includes(String(value ?? '').trim().toLowerCase());
}

function safeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'unknown';
}
