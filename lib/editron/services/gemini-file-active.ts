export interface GeminiFileManagerLike {
  getFile(name: string): Promise<{ state?: string | null } | null | undefined>;
}

export interface GeminiFileActivationInput {
  fileManager: GeminiFileManagerLike;
  fileName?: string | null;
  initialState?: string | null;
  label: string;
  fileSizeBytes?: number | null;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface GeminiFileActivationResult {
  active: boolean;
  state: string | null;
  attempts: number;
  waitedMs: number;
  reason?: 'missing-file-name' | 'timeout';
}

const MB = 1024 * 1024;
const DEFAULT_SMALL_FILE_WAIT_MS = 90_000;
const DEFAULT_MEDIUM_FILE_WAIT_MS = 180_000;
const DEFAULT_LARGE_FILE_WAIT_MS = 240_000;
const MAX_WAIT_MS = 270_000;
const MIN_WAIT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const MIN_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 10_000;

export async function waitForGeminiFileActive(input: GeminiFileActivationInput): Promise<GeminiFileActivationResult> {
  const fileName = typeof input.fileName === 'string' && input.fileName.trim() ? input.fileName : null;
  if (!fileName) {
    return {
      active: false,
      state: normalizeState(input.initialState),
      attempts: 0,
      waitedMs: 0,
      reason: 'missing-file-name',
    };
  }

  const maxWaitMs = resolveMaxWaitMs(input);
  const pollIntervalMs = resolvePollIntervalMs(input.pollIntervalMs);
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let state = normalizeState(input.initialState);
  let attempts = 0;
  let waitedMs = 0;

  while (state !== 'ACTIVE' && waitedMs < maxWaitMs) {
    const delayMs = Math.min(pollIntervalMs, maxWaitMs - waitedMs);
    await sleep(delayMs);
    waitedMs += delayMs;
    attempts++;

    try {
      const check = await input.fileManager.getFile(fileName);
      state = normalizeState(check?.state) ?? state;
    } catch (err: unknown) {
      console.warn(`[${input.label}] Gemini file state check failed:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    active: state === 'ACTIVE',
    state,
    attempts,
    waitedMs,
    ...(state === 'ACTIVE' ? {} : { reason: 'timeout' as const }),
  };
}

function resolveMaxWaitMs(input: GeminiFileActivationInput): number {
  const explicit = normalizeMs(input.maxWaitMs);
  if (explicit !== null) return clamp(explicit, MIN_WAIT_MS, MAX_WAIT_MS);

  const env = normalizeMs(process.env.EDITRON_GEMINI_FILE_ACTIVE_TIMEOUT_MS);
  if (env !== null) return clamp(env, MIN_WAIT_MS, MAX_WAIT_MS);

  const sizeBytes = Number(input.fileSizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return DEFAULT_MEDIUM_FILE_WAIT_MS;
  if (sizeBytes > 500 * MB) return DEFAULT_LARGE_FILE_WAIT_MS;
  if (sizeBytes > 100 * MB) return DEFAULT_MEDIUM_FILE_WAIT_MS;
  return DEFAULT_SMALL_FILE_WAIT_MS;
}

function resolvePollIntervalMs(value?: number): number {
  const explicit = normalizeMs(value);
  if (explicit !== null) return clamp(explicit, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);

  const env = normalizeMs(process.env.EDITRON_GEMINI_FILE_POLL_INTERVAL_MS);
  if (env !== null) return clamp(env, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);

  return DEFAULT_POLL_INTERVAL_MS;
}

function normalizeState(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function normalizeMs(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}