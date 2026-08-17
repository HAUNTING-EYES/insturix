import { isGenerationTemporarilyUnavailable } from '../errors/thinkforge-error';

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return new DOMException('The operation was aborted.', 'AbortError');
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
      throw abortReason(abortSignal);
    }
    if (!isGenerationTemporarilyUnavailable(error)) {
      throw error;
    }
    await waitForRetry(delayMs, abortSignal);
    throwIfAborted(abortSignal);
    return fn();
  }
}
