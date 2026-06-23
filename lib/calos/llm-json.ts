/**
 * Shared defensive extractor for LLM replies that should contain a JSON array. Strips a ```json
 * fence if present, slices the outermost [...], and parses. Returns [] on anything malformed —
 * a bad model reply is data to ignore, not an outage. Used by the trends + planner parsers.
 */
export function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  let body = text.trim();

  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();

  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
