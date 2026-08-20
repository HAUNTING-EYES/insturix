import { isGenerationTemporarilyUnavailable } from '../errors/thinkforge-error';

const exhaustedOverloadRetries = new WeakSet<object>();

function canTrackRetry(error: unknown): error is object {
  return (typeof error === 'object' && error !== null) || typeof error === 'function';
}

function hasExhaustedOverloadRetry(error: unknown): boolean {
  return canTrackRetry(error) && exhaustedOverloadRetries.has(error);
}

function markOverloadRetryExhausted(error: unknown): void {
  if (canTrackRetry(error)) exhaustedOverloadRetries.add(error);
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return new DOMException('The operation was aborted.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (delayMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function retryOnceOnOverload<T>(
  fn: () => Promise<T>,
  delayMs: number = 700,
  abortSignal?: AbortSignal,
): Promise<T> {
  throwIfAborted(abortSignal);
  try {
    return await fn();
  } catch (error) {
    if (abortSignal?.aborted) {
      if (isAbortError(error)) throw error;
      throw abortReason(abortSignal);
    }
    if (!isGenerationTemporarilyUnavailable(error)) {
      throw error;
    }
    if (hasExhaustedOverloadRetry(error)) {
      throw error;
    }
    await waitForRetry(delayMs, abortSignal);
    throwIfAborted(abortSignal);
    try {
      return await fn();
    } catch (retryError) {
      if (!abortSignal?.aborted && isGenerationTemporarilyUnavailable(retryError)) {
        markOverloadRetryExhausted(retryError);
      }
      throw retryError;
    }
  }
}
