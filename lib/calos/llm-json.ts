/**
 * Shared defensive extractor for LLM replies that should contain a JSON array. Strips a ```json
 * fence if present, slices the outermost [...], and parses. Returns [] on anything malformed —
 * a bad model reply is data to ignore, not an outage. Used by the trends + planner parsers.
 *
 * Object-wrapper tolerance: models frequently reply {"trends": [...]} despite an "array only"
 * instruction (observed live from Perplexity Sonar). The outermost-[...] slice below happens to
 * handle the single-array case, but silently returns [] when the object holds MORE than one array.
 * So if the slice fails, we parse the object and take its array-valued field.
 */
const WRAPPER_KEYS = ["trends", "items", "results", "data"];

export function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  let body = text.trim();

  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();

  // 1) Outermost [...] — the expected shape (a bare array reply). Unchanged behaviour.
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to the object-wrapper case
    }
  }

  // 2) Object wrapper: {"trends": [...]} — prefer a known key, else the first array-valued field.
  const objStart = body.indexOf("{");
  const objEnd = body.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(body.slice(objStart, objEnd + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const key of WRAPPER_KEYS) {
          if (Array.isArray(obj[key])) return obj[key] as unknown[];
        }
        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) return value;
        }
      }
    } catch {
      // malformed — fall through
    }
  }

  return [];
}
