import { Client } from '@upstash/qstash';
import { renderStillOnLambda, type RenderStillOnLambdaOutput } from '@remotion/lambda/client';

import { REMOTION_COMPOSITION_ID } from './remotion-constants';
import { buildPhase0FixtureManifest, type Phase0FixtureProject } from './phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from './phase0-render-artifact-pack';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';

export const PHASE0_RENDERED_STILL_EVIDENCE_VERSION = 'editron-phase0-rendered-still-evidence-v1' as const;

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

export interface Phase0RenderedStillFrameEvidence {
  frame: number;
  url: string;
  outKey: string;
  bucketName: string;
  renderId: string;
  sizeInBytes: number;
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
  failedFrames: Array<{ frame: number; error: string }>;
  artifactPackStatus: 'ready' | 'not-renderable';
  artifactPackIssues: string[];
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

export async function buildPhase0RenderedStillEvidence(
  project: Phase0FixtureProject,
  options: {
    capturedAt?: string;
    renderStill?: RenderStill;
    prepareCredentials?: () => Promise<void>;
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
  const inputProps = {
    ...artifactPack.renderInput,
    isRendering: true,
  } as Record<string, unknown>;

  for (const frame of requestedSampleFrames) {
    try {
      const still = await renderStill({
        region: config.region as any,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: REMOTION_COMPOSITION_ID,
        inputProps,
        imageFormat: 'png',
        privacy: 'public',
        frame,
        maxRetries: 1,
      });
      renderedFrames.push(toFrameEvidence(frame, still));
    } catch (err: unknown) {
      failedFrames.push({
        frame,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const status: Phase0RenderedStillEvidenceStatus = renderedFrames.length === requestedSampleFrames.length
    ? 'completed'
    : renderedFrames.length > 0
      ? 'partial'
      : 'failed';

  return {
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
    failedFrames: [{ frame: -1, error: input.error }],
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

function toFrameEvidence(frame: number, still: RenderStillOnLambdaOutput): Phase0RenderedStillFrameEvidence {
  return {
    frame,
    url: still.url,
    outKey: still.outKey,
    bucketName: still.bucketName,
    renderId: still.renderId,
    sizeInBytes: still.sizeInBytes,
  };
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
