// Robust, lenient JSON parsing helpers for ThinkForge

export function stripCodeFences(s: string): string {
  if (!s) return s;
  return s.replace(/```json\s*([\s\S]*?)\s*```/gi, '$1').replace(/```\s*([\s\S]*?)\s*```/g, '$1');
}

export function looksLikeJSON(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  // cheap heuristic: must contain a colon or bracket pair
  return /[:\[\]{},]/.test(t);
}

export function extractBalancedJson(s: string): string | null {
  if (!s) return null;
  const t = stripCodeFences(s.trim());
  let start = t.indexOf('{');
    const altStart = t.indexOf('[');
  if (start === -1 || (altStart !== -1 && altStart < start)) start = altStart; // pick earlier of { or [
  if (start === -1) return null;
    const stack = [] as string[];
  let end = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      // skip strings
      i++;
      while (i < t.length) {
        if (t[i] === '\\') { i += 2; continue; }
        if (t[i] === '"') break;
        i++;
      }
      continue;
    }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      const last = stack.pop();
      if (!last) return null;
      if ((last === '{' && ch !== '}') || (last === '[' && ch !== ']')) return null;
      if (stack.length === 0) { end = i + 1; break; }
    }
  }
  if (end !== -1) return t.slice(start, end);
  return null;
}

export function parseJsonLenient<T = any>(input: string): T | null {
  if (!input) return null;
  const stripped = stripCodeFences(input);
  try {
    return JSON.parse(stripped) as T;
  } catch {}
  const extracted = extractBalancedJson(stripped);
  if (extracted) {
    try { return JSON.parse(extracted) as T; } catch {}
  }
  return null;
}

export function sanitizeServerScript(data: any, prev?: any): any {
  // Expecting an object possibly with title, content, blocks
  const out: any = { ...(prev || {}) };
  if (data && typeof data === 'object') {
    if (typeof data.title === 'string') out.title = data.title;
    if (Array.isArray(data.blocks)) {
      // minimal validation on blocks: objects with type key
      const ok = data.blocks.every((b: any) => b && typeof b === 'object' && typeof b.type === 'string');
      if (ok) out.blocks = data.blocks;
    }
    if (typeof data.content === 'string') {
      const c = data.content.trim();
      // Avoid leaking JSON as content; prefer blocks over content
      if (!looksLikeJSON(c)) out.content = c;
    }
    if (typeof data.body === 'string' && data.body.trim()) {
      // retain body only if it's not likely a JSON string
      if (!looksLikeJSON(data.body)) out.body = data.body;
    }
  }
  return out;
}
