/**
 * Safe JSON.parse wrapper for LLM outputs.
 *
 * Bundle 4 (2026-04-09) — Toyota audit P0 fix (A.gemini.1).
 *
 * Before: raw `JSON.parse(jsonStr)` on Gemini output in 4+ files. If the
 * model returns malformed JSON (incomplete output, token truncation, extra
 * prose before/after the object), parse throws and the entire call chain
 * crashes with no fallback.
 *
 * After: extract the JSON block (with markdown fence stripping), try parse,
 * fall back to a provided default. Optionally validate against a Zod schema
 * before returning.
 *
 * Usage:
 *   const parsed = safeParseLlmJson(gemResponse, {
 *     fallback: { subjects: [] },
 *     label: 'subject extraction',
 *   });
 */

export interface SafeParseOptions<T> {
  /** Fallback value returned on any parse failure. REQUIRED. */
  fallback: T;
  /** Label for log messages (e.g. "consistency scoring response"). */
  label?: string;
  /** Optional runtime validator. Return the validated value or throw. */
  validate?: (raw: unknown) => T;
  /** Log the failing raw string (first 200 chars) on failure. Default true. */
  logRawOnFailure?: boolean;
}

/**
 * Extract a JSON block from a raw LLM response string.
 * Handles:
 *   - Markdown code fences (```json ... ```)
 *   - Leading/trailing prose
 *   - Pure JSON
 *
 * Returns the cleaned string, or null if no JSON-like substring found.
 */
export function extractJsonBlock(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strip markdown code fence variants
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/m, '');
  cleaned = cleaned.replace(/\s*```$/m, '');
  cleaned = cleaned.trim();

  // If it starts with { or [, assume it's already JSON
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) return cleaned;

  // Otherwise find the first JSON-like substring.
  // Find earliest { or [ and latest matching } or ].
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const starts: number[] = [];
  if (firstBrace >= 0) starts.push(firstBrace);
  if (firstBracket >= 0) starts.push(firstBracket);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end <= start) return null;

  return cleaned.substring(start, end + 1);
}

/**
 * Safely parse an LLM response as JSON, with fallback + optional validation.
 * Never throws — always returns either a valid value or the fallback.
 */
export function safeParseLlmJson<T>(
  raw: string,
  options: SafeParseOptions<T>,
): { value: T; parseOk: boolean; validationOk: boolean; error?: string } {
  const label = options.label || 'LLM response';
  const logRaw = options.logRawOnFailure !== false;

  if (!raw || typeof raw !== 'string') {
    console.warn(`[safeParseLlmJson] ${label}: empty or non-string input, using fallback`);
    return {
      value: options.fallback,
      parseOk: false,
      validationOk: false,
      error: 'Empty or non-string input',
    };
  }

  const jsonStr = extractJsonBlock(raw);
  if (!jsonStr) {
    console.warn(`[safeParseLlmJson] ${label}: no JSON block found in response, using fallback`);
    if (logRaw) console.warn(`[safeParseLlmJson] ${label}: raw="${raw.substring(0, 200)}"`);
    return {
      value: options.fallback,
      parseOk: false,
      validationOk: false,
      error: 'No JSON block found',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err: any) {
    console.warn(`[safeParseLlmJson] ${label}: JSON.parse failed (${err.message}), using fallback`);
    if (logRaw) console.warn(`[safeParseLlmJson] ${label}: raw="${jsonStr.substring(0, 200)}"`);
    return {
      value: options.fallback,
      parseOk: false,
      validationOk: false,
      error: `JSON.parse: ${err.message}`,
    };
  }

  if (options.validate) {
    try {
      const validated = options.validate(parsed);
      return { value: validated, parseOk: true, validationOk: true };
    } catch (err: any) {
      console.warn(`[safeParseLlmJson] ${label}: schema validation failed (${err.message}), using fallback`);
      if (logRaw) console.warn(`[safeParseLlmJson] ${label}: parsed=${JSON.stringify(parsed).substring(0, 200)}`);
      return {
        value: options.fallback,
        parseOk: true,
        validationOk: false,
        error: `Validation: ${err.message}`,
      };
    }
  }

  return { value: parsed as T, parseOk: true, validationOk: true };
}
