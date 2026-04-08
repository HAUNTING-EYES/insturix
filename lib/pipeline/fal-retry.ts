/**
 * fal.ai retry wrapper with exponential backoff.
 *
 * Bundle 4 (2026-04-09) — Toyota audit P0 fix (A.fal.ai.1).
 *
 * Before: any fal.subscribe() 429 or 5xx = instant throw. User loses 10+ minutes
 * of work. No retry, no backoff. The Toyota audit documented this as the top
 * reliability issue.
 *
 * After: transient errors (429, 5xx, fetch/ECONNRESET, timeout) get up to 3
 * retries with exponential backoff (1s → 2s → 4s). 4xx client errors are not
 * retried — those are legitimate fatal errors (auth, invalid request, etc.).
 *
 * Usage:
 *   const result = await falRetry(
 *     () => (fal as any).subscribe(modelId, { input, logs: false }),
 *     { maxRetries: 3, label: `scene ${sceneIndex} image gen` },
 *   );
 */

export interface FalRetryOptions {
  /** Max retry attempts AFTER the initial attempt. Default 3 (total 4 attempts). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default 1000. */
  baseDelayMs?: number;
  /** Label for log messages (e.g. "scene 3 image gen"). */
  label?: string;
  /** Optional callback fired on each retry (for pipelineWarnings integration). */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Classify an error as transient (retryable) or fatal.
 *
 * Retryable:
 *   - Any HTTP 429 (rate limit)
 *   - Any HTTP 5xx (server error)
 *   - fetch() errors ("fetch failed", ECONNRESET, ETIMEDOUT, ENOTFOUND)
 *   - Explicit timeout errors from our own code
 *
 * Not retryable:
 *   - HTTP 4xx (except 429)
 *   - Zod / schema validation errors
 *   - Programming bugs (TypeError, ReferenceError)
 */
export function isTransientFalError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();

  // HTTP status code patterns
  if (err.status === 429 || err.statusCode === 429) return true;
  if (typeof err.status === 'number' && err.status >= 500 && err.status < 600) return true;
  if (typeof err.statusCode === 'number' && err.statusCode >= 500 && err.statusCode < 600) return true;

  // Error message patterns (fal.ai client often throws errors with status embedded in msg)
  if (/\b429\b/.test(msg)) return true;
  if (/\b5\d{2}\b/.test(msg)) return true;
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
  if (msg.includes('service unavailable') || msg.includes('bad gateway')) return true;
  if (msg.includes('gateway timeout') || msg.includes('internal server error')) return true;

  // Network errors
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout')) return true;
  if (msg.includes('enotfound') || msg.includes('socket hang up') || msg.includes('connection reset')) return true;

  // Our own timeout wrapper
  if (msg.includes('timed out after') && msg.includes('fal')) return true;

  return false;
}

/**
 * Execute a fal.ai call with exponential backoff retry on transient errors.
 */
export async function falRetry<T>(
  fn: () => Promise<T>,
  options: FalRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const label = options.label || 'fal.ai call';

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff with jitter: 1s → 2s → 4s → 8s (+/- 250ms)
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 500) - 250;
        const delay = Math.max(100, backoffMs + jitter);
        console.log(`[falRetry] ${label}: retry ${attempt}/${maxRetries} in ${delay}ms (last error: ${lastError?.message?.substring(0, 120)})`);
        if (options.onRetry) {
          try {
            options.onRetry(attempt, lastError);
          } catch { /* don't let the callback break retry */ }
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await fn();
    } catch (err: any) {
      lastError = err;

      // Non-transient → bail immediately
      if (!isTransientFalError(err)) {
        console.log(`[falRetry] ${label}: non-transient error, not retrying: ${err.message}`);
        throw err;
      }

      // Out of retries → bail
      if (attempt >= maxRetries) {
        console.error(`[falRetry] ${label}: FAILED after ${maxRetries + 1} attempts. Last error: ${err.message}`);
        throw err;
      }
    }
  }

  // Unreachable — loop either returns or throws
  throw lastError;
}
