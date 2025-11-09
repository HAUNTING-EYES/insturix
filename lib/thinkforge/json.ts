// JSON safety + sanitization helpers for ThinkForge

export type Block = any;
export type ScriptModel = {
  title?: string | null;
  outline?: string | null;
  content?: string | null;
  blocks?: Block[] | null;
  metadata?: {
    workflow?: string;
    thoughts?: string;
    duration_ms?: number;
    agent_steps?: Array<{
      agent?: string;
      step?: string;
      output?: string;
    }>;
    quality_metrics?: {
      score?: number;
      feedback?: string;
    };
  } | null;
};

export function stripCodeFences(input: string): string {
  if (!input) return "";
  let s = String(input).trim();
  if (!s.startsWith("```") && !s.includes("```")) return s;
  // remove leading ```lang\n and trailing ```
  if (s.startsWith("```")) {
    const firstNL = s.indexOf("\n");
    if (firstNL !== -1) s = s.slice(firstNL + 1);
  }
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

export function looksLikeJSON(input: string): boolean {
  if (!input) return false;
  const s = String(input).trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  return i !== -1 && j !== -1 && j > i;
}

export function extractBalancedJson(input: string): string | null {
  if (!input) return null;
  const s = stripCodeFences(input);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const cand = s.slice(start, end + 1);
  // quick balance check
  let bal = 0;
  for (const ch of cand) {
    if (ch === '{') bal++;
    else if (ch === '}') bal--;
    if (bal < 0) return null;
  }
  return bal === 0 ? cand : null;
}

export function parseJsonLenient(input: string): any {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    // try fenced + balanced
    const extracted = extractBalancedJson(input);
    if (extracted) {
      try { return JSON.parse(extracted); } catch {}
    }
    // attempt very light coercions
    let s = stripCodeFences(input);
    // quote unquoted keys and single quotes → double quotes (best effort)
    s = s.replace(/([,{\s])(\w+)\s*:/g, '$1"$2":');
    s = s.replace(/'([^']*)'/g, '"$1"');
    try { return JSON.parse(extracted ?? s); } catch {}
    return null;
  }
}

const ALLOWED_TYPES = new Set([
  'heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'quote', 'code'
]);

export function sanitizeBlock(raw: any): any | null {
  try {
    const MAX_TEXT = 4000;
    const t = String(raw?.type ?? raw?.kind ?? 'paragraph').toLowerCase();
    const type = ALLOWED_TYPES.has(t) ? t : 'paragraph';

    // props
    const props: any = {};
    if (type === 'heading') {
      let lvl = Number(raw?.props?.level ?? raw?.level ?? 1);
      if (!Number.isFinite(lvl)) lvl = 1;
      lvl = Math.max(1, Math.min(3, Math.floor(lvl)));
      props.level = lvl;
    }

    // extract text content best-effort
    const extractText = (node: any): string => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(extractText).join('');
      if (typeof node === 'object') {
        const direct = node.text ?? node.content;
        if (typeof direct === 'string') return direct;
        if (Array.isArray(direct)) return direct.map(extractText).join('');
        const children = node.children ?? node.content;
        return extractText(children);
      }
      return String(node);
    };

    const text = extractText(raw?.content ?? raw?.children ?? raw?.text ?? raw) || '';
    const content = String(text).slice(0, MAX_TEXT);
    if (!content) return null;

    // ensure stable id
    const id = ensureBlockId(raw?.id);

    if (type === 'heading') return { id, type, props, content };
    return { id, type, content };
  } catch {
    return null;
  }
}

export function sanitizeServerScript(input: any): ScriptModel {
  const MAX_BLOCKS = 400;
  const title = typeof input?.title === 'string' ? input.title.slice(0, 160) : (input?.title ?? null);
  const outline = typeof input?.outline === 'string' ? input.outline.slice(0, 4000) : (input?.outline ?? null);
  const content = typeof input?.content === 'string' ? input.content.slice(0, 20000) : (input?.content ?? null);
  const blocksArr = Array.isArray(input?.blocks) ? input.blocks : [];
  
  // Enhanced block validation and sanitization
  const blocks = blocksArr
    .slice(0, MAX_BLOCKS)
    .map((block: any, index: number) => {
      // Ensure block is an object
      if (!block || typeof block !== 'object') {
        return null;
      }
      
      // Sanitize block
      const sanitized = sanitizeBlock(block);
      if (!sanitized) {
        return null;
      }
      
      // Guarantee id exists
      return {
        ...sanitized,
        id: ensureBlockId(sanitized?.id || block?.id)
      };
    })
    .filter(Boolean) as Block[];
  
  // Validate block structure matches BlockNote schema
  const validatedBlocks = blocks.map((block: any) => {
    // Ensure required fields
    if (!block.type || !block.content) {
      return null;
    }
    
    // Ensure content is string or array
    if (typeof block.content !== 'string' && !Array.isArray(block.content)) {
      block.content = String(block.content || '');
    }
    
    return block;
  }).filter(Boolean) as Block[];
  
  // Preserve metadata if present
  const metadata = input?.metadata ? {
    workflow: typeof input.metadata.workflow === 'string' ? input.metadata.workflow : undefined,
    thoughts: typeof input.metadata.thoughts === 'string' ? input.metadata.thoughts.slice(0, 1000) : undefined,
    duration_ms: typeof input.metadata.duration_ms === 'number' ? input.metadata.duration_ms : undefined,
    agent_steps: Array.isArray(input.metadata.agent_steps) ? input.metadata.agent_steps.slice(0, 20) : undefined,
    quality_metrics: input.metadata.quality_metrics ? {
      score: typeof input.metadata.quality_metrics.score === 'number' ? input.metadata.quality_metrics.score : undefined,
      feedback: typeof input.metadata.quality_metrics.feedback === 'string' ? input.metadata.quality_metrics.feedback.slice(0, 500) : undefined,
    } : undefined,
  } : null;
  
  return { title, outline, content, blocks: validatedBlocks, metadata };
}

// ---- ID helpers ----

// Simple, collision-resistant enough ULID-like id without external deps
let _lastTime = 0;
let _seq = 0;
function nextSeq(ts: number) {
  if (ts === _lastTime) {
    _seq = (_seq + 1) & 0xffff;
  } else {
    _lastTime = ts;
    _seq = 0;
  }
  return _seq;
}

export function generateId(): string {
  const ts = Date.now();
  const seq = nextSeq(ts);
  // base36 timestamp + random/seq tail
  const tsPart = ts.toString(36);
  const rnd = Math.floor(Math.random() * 0xffffffff) ^ seq;
  const rndPart = rnd.toString(36).padStart(7, '0');
  return `b_${tsPart}${rndPart}`;
}

export function ensureBlockId(id: unknown): string {
  if (typeof id === 'string' && id.trim().length >= 6) return id;
  return generateId();
}

// Ensure every block in an array has an id
export function ensureBlockIds(blocks: any[] | null | undefined): any[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => ({ ...b, id: ensureBlockId((b as any)?.id) }));
}

// Apply patches returned from server minimally, using id or index fallback
export type Replacement = { id?: string; index?: number; block: any };
export type PatchResponse = { title?: string; outline?: string; content?: string; blocks?: any[]; replacements?: Replacement[] };

export function applyBlockPatches(current: any[], server: PatchResponse): any[] {
  const cur = ensureBlockIds(current || []);
  // If full blocks array provided, sanitize ids and return
  if (Array.isArray(server.blocks) && server.blocks.length > 0) {
    return ensureBlockIds(server.blocks);
  }
  const next = cur.slice();
  const reps = Array.isArray(server.replacements) ? server.replacements : [];
  if (reps.length === 0) return next;
  const byId: Record<string, number> = Object.create(null);
  next.forEach((b: any, i: number) => { const id = (b && b.id) ? String(b.id) : ''; if (id) byId[id] = i; });
  for (const r of reps) {
    const safe = sanitizeBlock(r.block);
    if (!safe) continue;
    let idx = -1;
    if (r.id && byId[r.id] !== undefined) idx = byId[r.id];
    else if (typeof r.index === 'number' && r.index >= 0 && r.index < next.length) idx = r.index;
    if (idx >= 0) {
      // keep the existing id if present
      const ex = next[idx];
      const keepId = (ex && ex.id) ? String(ex.id) : null;
      next[idx] = keepId ? { ...safe, id: keepId } : safe;
    }
  }
  return next;
}
