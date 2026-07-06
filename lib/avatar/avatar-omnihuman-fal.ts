import { fal } from '@fal-ai/client';

export const OMNIHUMAN_FAL_MODEL_ID = 'fal-ai/bytedance/omnihuman/v1.5';

export interface OmniHumanFalSubmitInput {
  imageUrl: string;
  audioUrl: string;
  prompt?: string;
  resolution?: string;
  turboMode?: boolean;
}

export interface OmniHumanFalSubmitResult {
  modelId: string;
  requestId: string;
  input: Record<string, unknown>;
}

export interface OmniHumanFalRefreshResult {
  modelId: string;
  requestId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  providerStatus: string;
  raw: Record<string, unknown>;
  videoUrl?: string;
  durationSeconds?: number;
  errorMessage?: string;
}

export interface OmniHumanFalClient {
  submit(input: OmniHumanFalSubmitInput): Promise<OmniHumanFalSubmitResult>;
  refresh(requestId: string): Promise<OmniHumanFalRefreshResult>;
}

let falConfigured = false;

export function createDefaultOmniHumanFalClient(
  env: Record<string, string | undefined> = process.env,
): OmniHumanFalClient {
  return {
    async submit(input) {
      ensureFalConfigured(env);
      const queueInput = buildOmniHumanFalInput(input);
      const handle = await fal.queue.submit(OMNIHUMAN_FAL_MODEL_ID as string, { input: queueInput });
      const requestId = extractRequestId(handle);
      if (!requestId) {
        throw new Error('fal OmniHuman queue did not return a request id.');
      }
      return {
        modelId: OMNIHUMAN_FAL_MODEL_ID,
        requestId,
        input: queueInput,
      };
    },
    async refresh(requestId) {
      ensureFalConfigured(env);
      const queueStatus = await fal.queue.status(OMNIHUMAN_FAL_MODEL_ID as string, {
        requestId,
        logs: false,
      });
      const providerStatus = String(readPath(queueStatus, ['status']) ?? '').toUpperCase();
      const normalizedStatus = normalizeFalQueueStatus(providerStatus);

      if (normalizedStatus !== 'succeeded') {
        return {
          modelId: OMNIHUMAN_FAL_MODEL_ID,
          requestId,
          status: normalizedStatus,
          providerStatus,
          raw: cloneRecord(queueStatus),
          errorMessage: extractErrorMessage(queueStatus),
        };
      }

      const result = await fal.queue.result(OMNIHUMAN_FAL_MODEL_ID as string, { requestId });
      return {
        modelId: OMNIHUMAN_FAL_MODEL_ID,
        requestId,
        status: 'succeeded',
        providerStatus,
        raw: cloneRecord(result),
        videoUrl: extractVideoUrl(result),
        durationSeconds: extractDurationSeconds(result),
      };
    },
  };
}

export function buildOmniHumanFalInput(input: OmniHumanFalSubmitInput): Record<string, unknown> {
  return {
    image_url: input.imageUrl,
    audio_url: input.audioUrl,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    turbo_mode: input.turboMode ?? false,
  };
}

function ensureFalConfigured(env: Record<string, string | undefined>): void {
  const credentials = env.FAL_AI_API_KEY?.trim() || env.FAL_KEY?.trim();
  if (!credentials) {
    throw new Error('FAL_AI_API_KEY or FAL_KEY is required to dispatch fal OmniHuman.');
  }
  if (!falConfigured) {
    fal.config({ credentials });
    falConfigured = true;
  }
}

function normalizeFalQueueStatus(providerStatus: string): OmniHumanFalRefreshResult['status'] {
  if (providerStatus === 'COMPLETED') return 'succeeded';
  if (providerStatus === 'IN_PROGRESS') return 'running';
  if (providerStatus === 'IN_QUEUE') return 'queued';
  if (providerStatus === 'FAILED' || providerStatus === 'ERROR') return 'failed';
  return 'running';
}

function extractRequestId(value: unknown): string | undefined {
  return stringPath(value, ['request_id']) ?? stringPath(value, ['requestId']);
}

function extractVideoUrl(value: unknown): string | undefined {
  return stringPath(value, ['data', 'video', 'url'])
    ?? stringPath(value, ['data', 'video_url'])
    ?? stringPath(value, ['data', 'output', 'video', 'url'])
    ?? stringPath(value, ['video', 'url'])
    ?? stringPath(value, ['video_url']);
}

function extractDurationSeconds(value: unknown): number | undefined {
  const duration = readPath(value, ['data', 'duration'])
    ?? readPath(value, ['data', 'video', 'duration'])
    ?? readPath(value, ['duration']);
  return typeof duration === 'number' ? duration : undefined;
}

function extractErrorMessage(value: unknown): string | undefined {
  return stringPath(value, ['error', 'message'])
    ?? stringPath(value, ['error'])
    ?? stringPath(value, ['message']);
}

function stringPath(value: unknown, path: string[]): string | undefined {
  const found = readPath(value, path);
  return typeof found === 'string' ? found : undefined;
}

function readPath(value: unknown, path: string[]): string | number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' || typeof current === 'number' ? current : undefined;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
