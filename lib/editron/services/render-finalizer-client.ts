export const EDITRON_RENDER_FINALIZER_ENDPOINT_ENV = 'EDITRON_RENDER_FINALIZER_ENDPOINT' as const;
export const EDITRON_RENDER_FINALIZER_TOKEN_ENV = 'EDITRON_RENDER_FINALIZER_TOKEN' as const;

const MAX_DURATION_MS = 3 * 60 * 60 * 1000;
const SAFE_JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface RenderFinalizerEnvironment {
  EDITRON_RENDER_FINALIZER_ENDPOINT?: string;
  EDITRON_RENDER_FINALIZER_TOKEN?: string;
}

export interface RenderFinalizerInput {
  inputUrl: string;
  jobId: string;
  expectedDurationMs: number;
  outputBucket?: string;
  outputRegion?: string;
}

export interface RenderFinalizerProbeReceipt {
  expectedDurationMs: number;
  formatDurationMs: number;
  videoDurationMs: number;
  audioDurationMs: number | null;
  videoCodec: string;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sampleRate: number | null;
  channels: number | null;
  verificationToleranceMs: number;
}

export interface RenderFinalizerResult {
  url: string;
  sizeBytes: number;
  expectedDurationMs: number;
  receipt: RenderFinalizerProbeReceipt;
}

export class RenderFinalizerClientError extends Error {
  constructor(
    public readonly code:
      | 'NOT_CONFIGURED'
      | 'INVALID_REQUEST'
      | 'NETWORK_ERROR'
      | 'WORKER_REJECTED'
      | 'INVALID_RESPONSE',
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'RenderFinalizerClientError';
  }
}

function processEnvironment(): RenderFinalizerEnvironment {
  return {
    EDITRON_RENDER_FINALIZER_ENDPOINT: process.env.EDITRON_RENDER_FINALIZER_ENDPOINT,
    EDITRON_RENDER_FINALIZER_TOKEN: process.env.EDITRON_RENDER_FINALIZER_TOKEN,
  };
}

export function isRenderFinalizerConfigured(
  env: RenderFinalizerEnvironment = processEnvironment(),
): boolean {
  return Boolean(
    env.EDITRON_RENDER_FINALIZER_ENDPOINT?.trim()
    && env.EDITRON_RENDER_FINALIZER_TOKEN?.trim(),
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateInput(input: RenderFinalizerInput): void {
  let url: URL;
  try {
    url = new URL(input.inputUrl);
  } catch {
    throw new RenderFinalizerClientError('INVALID_REQUEST', 'inputUrl must be a valid URL.');
  }
  if (url.protocol !== 'https:') {
    throw new RenderFinalizerClientError('INVALID_REQUEST', 'inputUrl must use HTTPS.');
  }
  if (!SAFE_JOB_ID.test(input.jobId)) {
    throw new RenderFinalizerClientError('INVALID_REQUEST', 'jobId must be a safe identifier.');
  }
  if (
    !Number.isInteger(input.expectedDurationMs)
    || input.expectedDurationMs <= 0
    || input.expectedDurationMs > MAX_DURATION_MS
  ) {
    throw new RenderFinalizerClientError(
      'INVALID_REQUEST',
      'expectedDurationMs must be a positive integer within the production cap.',
    );
  }
  if (Boolean(input.outputBucket) !== Boolean(input.outputRegion)) {
    throw new RenderFinalizerClientError(
      'INVALID_REQUEST',
      'outputBucket and outputRegion must be supplied together.',
    );
  }
}

function parseReceipt(value: unknown, expectedDurationMs: number): RenderFinalizerProbeReceipt | null {
  const receipt = record(value);
  if (!receipt) return null;
  const tolerance = receipt.verificationToleranceMs;
  const formatDuration = receipt.formatDurationMs;
  const videoDuration = receipt.videoDurationMs;
  const audioDuration = receipt.audioDurationMs;
  if (
    receipt.expectedDurationMs !== expectedDurationMs
    || !finiteNumber(tolerance)
    || tolerance < 0
    || tolerance > 1
    || !finiteNumber(formatDuration)
    || !finiteNumber(videoDuration)
    || (audioDuration !== null && !finiteNumber(audioDuration))
    || typeof receipt.videoCodec !== 'string'
    || (receipt.audioCodec !== null && typeof receipt.audioCodec !== 'string')
    || Math.abs(formatDuration - expectedDurationMs) > tolerance
    || Math.abs(videoDuration - expectedDurationMs) > tolerance
    || (finiteNumber(audioDuration) && Math.abs(audioDuration - expectedDurationMs) > tolerance)
  ) {
    return null;
  }
  return receipt as unknown as RenderFinalizerProbeReceipt;
}

export async function finalizeRenderArtifact(
  input: RenderFinalizerInput,
  options: {
    env?: RenderFinalizerEnvironment;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<RenderFinalizerResult> {
  validateInput(input);
  const env = options.env ?? processEnvironment();
  const endpoint = env.EDITRON_RENDER_FINALIZER_ENDPOINT?.trim();
  const token = env.EDITRON_RENDER_FINALIZER_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new RenderFinalizerClientError(
      'NOT_CONFIGURED',
      'Render finalizer endpoint/token is not configured.',
    );
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown network failure';
    throw new RenderFinalizerClientError(
      'NETWORK_ERROR',
      `Render finalizer request failed: ${message}`,
    );
  }

  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload?.ok !== true) {
    const workerError = record(payload?.error);
    const message = typeof workerError?.message === 'string'
      ? workerError.message
      : `Render finalizer returned HTTP ${response.status}.`;
    throw new RenderFinalizerClientError('WORKER_REJECTED', message, response.status);
  }

  const receipt = parseReceipt(payload.receipt, input.expectedDurationMs);
  if (
    typeof payload.url !== 'string'
    || !payload.url.startsWith('https://')
    || !finiteNumber(payload.sizeBytes)
    || payload.sizeBytes <= 0
    || payload.expectedDurationMs !== input.expectedDurationMs
    || !receipt
  ) {
    throw new RenderFinalizerClientError(
      'INVALID_RESPONSE',
      'Render finalizer returned an incomplete or unverified success payload.',
      response.status,
    );
  }

  return {
    url: payload.url,
    sizeBytes: payload.sizeBytes,
    expectedDurationMs: input.expectedDurationMs,
    receipt,
  };
}
