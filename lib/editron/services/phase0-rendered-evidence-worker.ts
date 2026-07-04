import { Client } from '@upstash/qstash';
import { renderStillOnLambda, type RenderStillOnLambdaOutput } from '@remotion/lambda/client';

import { REMOTION_COMPOSITION_ID } from './remotion-constants';
import {
  buildPhase0FixtureManifest,
  type Phase0FixtureProject,
  type Phase0RenderedAestheticReportLike,
  type Phase0RenderedQualityEvidencePayload,
} from './phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from './phase0-render-artifact-pack';
import {
  buildPhase0RenderedAestheticEvidence,
  type ReadRenderedStillImage,
} from './phase0-rendered-aesthetic-scoring';
import { buildPhase0RenderedQualityGate } from './editron-learning-gate';
import { buildPhase0LiveTruthSnapshot, type Phase0LiveTruthSnapshot } from './phase0-live-truth';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';

export const PHASE0_RENDERED_STILL_EVIDENCE_VERSION = 'editron-phase0-rendered-still-evidence-v1' as const;
const DEFAULT_PHASE0_RENDERED_EVIDENCE_LOCK_STALE_MS = 20 * 60 * 1000;

type Phase0RenderedStillEvidenceStatus = 'completed' | 'partial' | 'failed' | 'skipped';

type EnvLike = Record<string, string | undefined>;

export interface Phase0RenderedEvidenceDispatchPayload {
  projectId: string;
  userId: string;
  requestedAt?: string;
}

export interface Phase0RenderedEvidenceDispatchResult {
  dispatched: boolean;
  reason?: string;
  messageId?: string;
}

export interface Phase0RenderedEvidenceDispatchRecord {
  version: 'editron-phase0-rendered-evidence-dispatch-v1';
  status: 'dispatched' | 'not_dispatched';
  requestedAt: string;
  updatedAt: string;
  workerPath: '/api/internal/workers/phase0-rendered-evidence';
  messageId: string | null;
  reason: string | null;
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
}

export interface Phase0RenderedStillEvidence {
  version: typeof PHASE0_RENDERED_STILL_EVIDENCE_VERSION;
  status: Phase0RenderedStillEvidenceStatus;
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
  failedFrames: Array<{ frame: number; error: string; renderKind?: 'full' | 'baseline' | 'worker' }>;
  artifactPackStatus: 'ready' | 'not-renderable';
  artifactPackIssues: string[];
  renderedAestheticReport?: Phase0RenderedAestheticReportLike;
  renderedQualityEvidence?: Phase0RenderedQualityEvidencePayload;
  phase0LiveTruth?: Phase0LiveTruthSnapshot;
}

export function buildPhase0RenderedEvidenceClaimFilter(input: {
  projectId: string;
  now?: Date;
  staleMs?: number;
}): Record<string, unknown> {
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? DEFAULT_PHASE0_RENDERED_EVIDENCE_LOCK_STALE_MS;
  const staleBefore = new Date(now.getTime() - staleMs);

  return {
    projectId: input.projectId,
    $and: [
      {
        $or: [
          { 'intelligence.phase0RenderedEvidenceLockAt': { $exists: false } },
          { 'intelligence.phase0RenderedEvidenceLockAt': null },
          { 'intelligence.phase0RenderedEvidenceLockAt': { $lt: staleBefore } },
        ],
      },
      {
        $or: [
          { 'intelligence.phase0RenderedStillEvidence.status': { $exists: false } },
          { 'intelligence.phase0RenderedStillEvidence.version': { $ne: PHASE0_RENDERED_STILL_EVIDENCE_VERSION } },
          { 'intelligence.phase0RenderedStillEvidence.status': { $nin: ['completed', 'partial'] } },
          {
            $and: [
              { 'intelligence.phase0RenderedStillEvidence.status': { $in: ['completed', 'partial'] } },
              { 'intelligence.renderedQualityEvidence.qualityEvidenceSource': { $ne: 'rendered-aesthetic' } },
            ],
          },
        ],
      },
    ],
  };
}

export function buildPhase0RenderedEvidenceClaimUpdate(input: {
  now?: Date;
  requestedAt?: string;
} = {}): Record<string, unknown> {
  const now = input.now ?? new Date();
  return {
    $set: {
      'intelligence.phase0RenderedEvidenceLockAt': now,
      'intelligence.phase0RenderedEvidenceLockRequestedAt': input.requestedAt ?? now.toISOString(),
    },
  };
}

export function buildPhase0RenderedEvidenceClaimRelease(): Record<string, unknown> {
  return {
    $unset: {
      'intelligence.phase0RenderedEvidenceLockAt': '',
      'intelligence.phase0RenderedEvidenceLockRequestedAt': '',
    },
  };
}
type RenderStill = typeof renderStillOnLambda;

export function resolvePhase0RenderedEvidenceConfig(env: EnvLike = process.env) {
  const enabled = !isExplicitlyFalse(env.EDITRON_PHASE0_RENDERED_EVIDENCE_AUTO);
  const functionName = env.REMOTION_LAMBDA_FUNCTION_NAME || '';
  const serveUrl = env.REMOTION_LAMBDA_SERVE_URL || '';
  const region = env.REMOTION_AWS_REGION || 'us-east-1';
  const sampleLimit = clampSampleLimit(env.EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES);

  return {
    enabled,
    functionName,
    serveUrl,
    region,
    sampleLimit,
    configured: enabled && Boolean(functionName && serveUrl),
    reason: !enabled
      ? 'disabled'
      : !functionName
        ? 'missing_remotion_lambda_function_name'
        : !serveUrl
          ? 'missing_remotion_lambda_serve_url'
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

  const token = env.QSTASH_TOKEN;
  if (!token) return { dispatched: false, reason: 'missing_qstash_token' };

  const baseUrl = env.VERCEL_URL
    ? `https://${env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/internal/workers/phase0-rendered-evidence`;
  const qstash = new Client({ token, baseUrl: env.QSTASH_URL || undefined });
  const result = await qstash.publishJSON({
    url,
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

export function buildPhase0RenderedEvidenceDispatchPersistSet(
  result: Phase0RenderedEvidenceDispatchResult,
  input: { requestedAt?: string; updatedAt?: string } = {},
): Record<string, unknown> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const requestedAt = input.requestedAt ?? updatedAt;
  const status: Phase0RenderedEvidenceDispatchRecord['status'] = result.dispatched
    ? 'dispatched'
    : 'not_dispatched';
  const record: Phase0RenderedEvidenceDispatchRecord = {
    version: 'editron-phase0-rendered-evidence-dispatch-v1',
    status,
    requestedAt,
    updatedAt,
    workerPath: '/api/internal/workers/phase0-rendered-evidence',
    messageId: result.messageId ?? null,
    reason: result.dispatched ? null : String(result.reason ?? 'unknown').slice(0, 240),
  };

  return {
    'intelligence.phase0RenderedEvidenceDispatch': record,
    'intelligence.phase0FixtureArtifact.renderedEvidenceDispatchStatus': status,
    'intelligence.phase0FixtureArtifact.renderedEvidenceDispatchReason': record.reason,
    'intelligence.phase0FixtureArtifact.renderedEvidenceDispatchMessageId': record.messageId,
    'intelligence.phase0FixtureArtifact.renderedEvidenceRequestedAt': requestedAt,
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
  const requestedSampleFrames = artifactPack.samplePlan.sampledFrames.slice(0, config.sampleLimit);

  if (!config.configured) {
    return baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status: 'skipped',
    });
  }

  if (artifactPack.status !== 'ready') {
    return baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status: 'skipped',
    });
  }

  await (options.prepareCredentials ?? setAWSCredentials)();

  const renderStill = options.renderStill ?? renderStillOnLambda;
  const renderedFrames: Phase0RenderedStillFrameEvidence[] = [];
  const failedFrames: Phase0RenderedStillEvidence['failedFrames'] = [];
  const overlayOnlyInputProps = {
    ...artifactPack.renderInput,
    overlays: buildOverlayOnlyRenderOverlays(
      artifactPack.renderInput.overlays,
      artifactPack.renderInput.width,
      artifactPack.renderInput.height,
    ),
    isRendering: true,
  } as Record<string, unknown>;
  const baselineInputProps = {
    ...artifactPack.renderInput,
    overlays: buildBaselineOverlays(
      artifactPack.renderInput.overlays,
      artifactPack.renderInput.width,
      artifactPack.renderInput.height,
    ),
    isRendering: true,
  } as Record<string, unknown>;

  for (const frame of requestedSampleFrames) {
    let fullStill: RenderStillOnLambdaOutput | null = null;
    try {
      fullStill = await renderStill({
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps: overlayOnlyInputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame,
        maxRetries: 1,
      });
    } catch (err: unknown) {
      failedFrames.push({
        frame,
        renderKind: 'full',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      const baselineStill = await renderStill({
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps: baselineInputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame,
        maxRetries: 1,
      });
      renderedFrames.push(toFrameEvidence(frame, fullStill, baselineStill));
    } catch (err: unknown) {
      failedFrames.push({
        frame,
        renderKind: 'baseline',
        error: err instanceof Error ? err.message : String(err),
      });
      renderedFrames.push(toFrameEvidence(frame, fullStill));
    }
  }

  const pairedFrameCount = renderedFrames.filter((frame) => frame.baselineUrl).length;
  const status: Phase0RenderedStillEvidenceStatus = pairedFrameCount === requestedSampleFrames.length && failedFrames.length === 0
    ? 'completed'
    : renderedFrames.length > 0
      ? 'partial'
      : 'failed';

  let evidence: Phase0RenderedStillEvidence = {
    ...baseEvidence({
      projectId: manifest.projectId,
      capturedAt,
      config,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues,
      requestedSampleFrames,
      status,
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
        { readImage: options.readImage },
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
  const reason = firstFailure ?? firstIssue ?? `phase0-worker-status:${evidence.status}`;
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

export function buildPhase0RenderedStillEvidencePersistSet(
  evidence: Phase0RenderedStillEvidence,
): Record<string, unknown> {
  const renderedQualityEvidence = evidence.renderedQualityEvidence ?? buildMissingPhase0RenderedQualityEvidence(evidence);
  const setPayload: Record<string, unknown> = {
    'intelligence.phase0RenderedStillEvidence': evidence,
    'intelligence.phase0FixtureArtifact.materialization': evidence.renderedFrames.length > 0
      ? 'lambda-stills-rendered'
      : 'lambda-stills-missing',
    'intelligence.phase0FixtureArtifact.renderedStillEvidenceStatus': evidence.status,
    'intelligence.phase0FixtureArtifact.renderedStillFrameCount': evidence.renderedFrames.length,
    'intelligence.phase0FixtureArtifact.renderedStillFailedFrameCount': evidence.failedFrames.length,
    'intelligence.phase0FixtureArtifact.renderedStillCompletedAt': evidence.completedAt,
  };

  if (evidence.renderedAestheticReport) {
    setPayload['intelligence.phase0RenderedAestheticReport'] = evidence.renderedAestheticReport;
  }

  if (evidence.phase0LiveTruth) {
    setPayload['intelligence.phase0LiveTruth'] = evidence.phase0LiveTruth;
  }

  if (renderedQualityEvidence) {
    const renderedQualityGate = buildPhase0RenderedQualityGate({
      qualityEvidence: renderedQualityEvidence,
      evaluatedAt: evidence.completedAt ?? evidence.capturedAt,
      hasQualityReview: renderedQualityEvidence.qualityEvidenceSource === 'rendered-aesthetic',
    });
    setPayload['intelligence.renderedQualityEvidence'] = renderedQualityEvidence;
    setPayload['intelligence.phase0RenderedQualityGate'] = renderedQualityGate;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticStatus'] = renderedQualityEvidence.renderedAestheticStatus;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticScore'] = renderedQualityEvidence.renderedAestheticScore;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticIssueCount'] = renderedQualityEvidence.renderedAestheticIssueCount;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticFailFrameCount'] = renderedQualityEvidence.renderedAestheticFailFrameCount;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticWarnFrameCount'] = renderedQualityEvidence.renderedAestheticWarnFrameCount;
    setPayload['intelligence.phase0FixtureArtifact.renderedAestheticSampledFrames'] = renderedQualityEvidence.renderedAestheticSampledFrames;

    if (renderedQualityGate.status === 'needs_review') {
      setPayload.autoEditStatus = 'needs_review';
      setPayload.projectStatus = 'needs-attention';
      setPayload.autoEditHealth = 'needs_review';
      setPayload.autoEditWarning = renderedQualityGate.warning;
    }
  }

  return setPayload;
}

function baseEvidence(input: {
  projectId: string;
  capturedAt: string;
  config: ReturnType<typeof resolvePhase0RenderedEvidenceConfig>;
  artifactPackStatus: Phase0RenderedStillEvidence['artifactPackStatus'];
  artifactPackIssues: string[];
  requestedSampleFrames: number[];
  status: Phase0RenderedStillEvidenceStatus;
}): Phase0RenderedStillEvidence {
  return {
    version: PHASE0_RENDERED_STILL_EVIDENCE_VERSION,
    status: input.status,
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
  };
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
