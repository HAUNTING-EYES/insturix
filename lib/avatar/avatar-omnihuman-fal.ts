import { fal } from '@fal-ai/client';

export const OMNIHUMAN_FAL_MODEL_ID = 'fal-ai/bytedance/omnihuman/v1.5';

export interface TalkingHeadFalSubmitInput {
  imageUrl: string;
  audioUrl: string;
  prompt?: string;
  resolution?: string;
  turboMode?: boolean;
}

export interface TalkingHeadFalSubmitResult {
  modelId: string;
  requestId: string;
  input: Record<string, unknown>;
}

export interface TalkingHeadFalRefreshResult {
  modelId: string;
  requestId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  providerStatus: string;
  raw: Record<string, unknown>;
  videoUrl?: string;
  durationSeconds?: number;
  errorMessage?: string;
}

export interface TalkingHeadFalClient {
  submit(input: TalkingHeadFalSubmitInput): Promise<TalkingHeadFalSubmitResult>;
  refresh(requestId: string): Promise<TalkingHeadFalRefreshResult>;
}

let falConfigured = false;

export type TalkingHeadFalInputBuilder = (input: TalkingHeadFalSubmitInput) => Record<string, unknown>;

/**
 * Generic fal talking-head client (submit → poll → video URL). OmniHuman and Kling
 * AI Avatar share the exact same queue contract and result shape, so they differ
 * only by model ID and how the input object is keyed — everything else is shared.
 */
export function createFalTalkingHeadClient(
  modelId: string,
  buildInput: TalkingHeadFalInputBuilder,
  env: Record<string, string | undefined> = process.env,
): TalkingHeadFalClient {
  return {
    async submit(input) {
      ensureFalConfigured(env);
      const queueInput = buildInput(input);
      const handle = await fal.queue.submit(modelId, { input: queueInput });
      const requestId = extractRequestId(handle);
      if (!requestId) {
        throw new Error(`fal talking-head queue (${modelId}) did not return a request id.`);
      }
      return { modelId, requestId, input: queueInput };
    },
    async refresh(requestId) {
      ensureFalConfigured(env);
      const queueStatus = await fal.queue.status(modelId, { requestId, logs: false });
      const providerStatus = String(readPath(queueStatus, ['status']) ?? '').toUpperCase();
      const normalizedStatus = normalizeFalQueueStatus(providerStatus);

      if (normalizedStatus !== 'succeeded') {
        return {
          modelId,
          requestId,
          status: normalizedStatus,
          providerStatus,
          raw: cloneRecord(queueStatus),
          errorMessage: extractErrorMessage(queueStatus),
        };
      }

      const result = await fal.queue.result(modelId, { requestId });
      return {
        modelId,
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

export function createDefaultTalkingHeadFalClient(
  env: Record<string, string | undefined> = process.env,
): TalkingHeadFalClient {
  return createFalTalkingHeadClient(OMNIHUMAN_FAL_MODEL_ID, buildTalkingHeadFalInput, env);
}

// Kling AI Avatar — better identity retention + ~3x cheaper than OmniHuman (bake-off 2026-07-06).
export type KlingAvatarTier = 'standard' | 'pro';

export const KLING_AVATAR_MODEL_IDS: Record<KlingAvatarTier, string> = {
  standard: 'fal-ai/kling-video/v1/standard/ai-avatar',
  pro: 'fal-ai/kling-video/ai-avatar/v2/pro',
};

export function buildKlingAvatarFalInput(input: TalkingHeadFalSubmitInput): Record<string, unknown> {
  // Kling AI Avatar length is driven by the audio; resolution/turbo are not accepted.
  return {
    image_url: input.imageUrl,
    audio_url: input.audioUrl,
    ...(input.prompt ? { prompt: input.prompt } : {}),
  };
}

export function createKlingAvatarFalClient(
  env: Record<string, string | undefined> = process.env,
  tier: KlingAvatarTier = 'standard',
): TalkingHeadFalClient {
  return createFalTalkingHeadClient(KLING_AVATAR_MODEL_IDS[tier], buildKlingAvatarFalInput, env);
}

export function buildTalkingHeadFalInput(input: TalkingHeadFalSubmitInput): Record<string, unknown> {
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

function normalizeFalQueueStatus(providerStatus: string): TalkingHeadFalRefreshResult['status'] {
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
