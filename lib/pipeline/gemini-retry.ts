/**
 * Gemini retry wrapper with exponential backoff.
 *
 * 2026-04-19 — Toyota audit A.gemini.6 fix.
 *
 * Parallels `lib/pipeline/fal-retry.ts` for the Google AI SDK surface.
 * Unlike fal.ai calls which are wrapped in `falRetry`, Gemini calls via
 * `generateObject()` / `generateContent()` had ZERO retry logic — any 429
 * (rate limit) or 5xx (server transient) from Google immediately propagated
 * to the caller, failing whatever pipeline stage was running and wasting the
 * user's credits + time.
 *
 * Scope: scene parser, video prompt refinement, 5-Track analysis, consistency
 * scoring, unified edit intelligence, and any other Gemini structured-output
 * or vision call.
 *
 * Usage:
 *   const result = await geminiRetry(
 *     () => generateObject({ model, schema, prompt, ... }),
 *     { maxRetries: 3, label: 'scene parser' },
 *   );
 *
 * Design notes:
 * - Structurally identical to falRetry for consistency (same mental model
 *   for future maintainers). A shared base `retryTransient` was considered
 *   (Rule A6) but deferred — falRetry and geminiRetry classify errors
 *   differently, and merging them would complicate both. If a third service
 *   needs retry, THEN it's worth unifying.
 * - Retries on 429 / 5xx / network failures. Does NOT retry on 4xx (except
 *   429), schema validation (Zod), or programming errors.
 * - Does NOT retry on quota exceeded (daily / monthly limits) — those are
 *   fatal and retry would just burn attempts.
 */

export interface GeminiRetryOptions {
  /** Max retry attempts AFTER the initial attempt. Default 3 (total 4 attempts). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default 1500 (Gemini prefers slightly slower retries than fal.ai — their 429 often means "slow down globally"). */
  baseDelayMs?: number;
  /** Label for log messages (e.g. "scene parser", "5-track vision"). */
  label?: string;
  /** Optional callback fired on each retry (for pipelineWarnings integration). */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Classify a Gemini error as transient (retryable) or fatal.
 *
 * Retryable:
 *   - HTTP 429 (rate limit — Google's default quota limits refresh per-minute)
 *   - HTTP 5xx (server error — Gemini backend blips)
 *   - fetch()/network errors
 *   - "deadline exceeded" (Google gRPC-style transient)
 *
 * NOT retryable (fatal, bail immediately):
 *   - HTTP 4xx except 429 (auth, malformed request)
 *   - "quota exceeded" / "daily quota" — daily/monthly caps, retrying won't help
 *   - "resource exhausted" with quota detail
 *   - Zod / schema validation errors
 *   - Model / permission errors (401, 403)
 *   - Programming bugs (TypeError, ReferenceError)
 *
 * NOTE on 429 vs quota-exceeded: Google uses 429 both for "slow down, retry soon"
 * (burst rate limit) AND for "you hit daily quota" (fatal). We disambiguate by
 * checking the error message for "quota" or "daily" keywords. Conservative —
 * would rather bail on an ambiguous 429 than burn 3 retries hitting a daily cap.
 */
export function isTransientGeminiError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();

  // Fatal patterns — never retry
  if (err.status === 401 || err.statusCode === 401) return false;
  if (err.status === 403 || err.statusCode === 403) return false;
  if (msg.includes('quota') && (msg.includes('daily') || msg.includes('monthly') || msg.includes('exceeded'))) return false;
  if (msg.includes('api key') && (msg.includes('invalid') || msg.includes('expired'))) return false;
  if (msg.includes('permission') || msg.includes('forbidden')) return false;
  // Zod validation (our own schema check failed)
  if (err.name === 'ZodError' || msg.includes('schema') && msg.includes('invalid')) return false;
  // Programming bugs
  if (err instanceof TypeError || err instanceof ReferenceError) return false;

  // Transient — retry
  if (err.status === 429 || err.statusCode === 429) return true;
  if (typeof err.status === 'number' && err.status >= 500 && err.status < 600) return true;
  if (typeof err.statusCode === 'number' && err.statusCode >= 500 && err.statusCode < 600) return true;
  if (/\b429\b/.test(msg) && !msg.includes('quota')) return true;
  if (/\b5\d{2}\b/.test(msg)) return true;
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
  if (msg.includes('service unavailable') || msg.includes('bad gateway')) return true;
  if (msg.includes('gateway timeout') || msg.includes('internal server error')) return true;
  if (msg.includes('deadline exceeded')) return true;

  // Network transient
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout')) return true;
  if (msg.includes('enotfound') || msg.includes('socket hang up') || msg.includes('connection reset')) return true;

  // Our own AbortSignal timeout fired
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  if (msg.includes('timed out')) return true;

  return false;
}

/**
 * Execute a Gemini call with exponential backoff retry on transient errors.
 */
export async function geminiRetry<T>(
  fn: () => Promise<T>,
  options: GeminiRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1500;
  const label = options.label || 'gemini call';

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff with jitter: 1.5s → 3s → 6s → 12s (+/- 350ms)
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 700) - 350;
        const delay = Math.max(200, backoffMs + jitter);
        console.log(`[geminiRetry] ${label}: retry ${attempt}/${maxRetries} in ${delay}ms (last error: ${lastError?.message?.substring(0, 120)})`);
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
      if (!isTransientGeminiError(err)) {
        console.log(`[geminiRetry] ${label}: non-transient error, not retrying: ${err.message?.substring(0, 200)}`);
        throw err;
      }

      // Out of retries → bail
      if (attempt >= maxRetries) {
        console.error(`[geminiRetry] ${label}: FAILED after ${maxRetries + 1} attempts. Last error: ${err.message}`);
        throw err;
      }
    }
  }

  // Unreachable — loop either returns or throws
  throw lastError;
}
