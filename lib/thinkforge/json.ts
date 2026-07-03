// JSON safety + sanitization helpers for ThinkForge

import { validateThinkForgeBlocks } from './schemas/thinkforge-block';
import { applyThinkForgeBlockPatches, type ThinkForgeBlockPatch } from './utils/thinkforge-block-patch';

// Script-oriented caps are intentionally generous to avoid unintended truncation
// during long-form generation. Chat-oriented caps stay lower to prevent verbose
// responses from unrelated agents.
export const MAX_TEXT_SCRIPT = 10000;
export const MAX_TEXT_CHAT = 4000;
export const MAX_BLOCKS_SCRIPT = 1000;

export type Block = any;
export type ScriptModel = {
  title?: string | null;
  outline?: string | null;
  content?: string | null;
  blocks?: Block[] | null;
  version?: number;
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

type BlockPatchPayload = {
  title?: string | null;
  outline?: string | null;
  content?: string | null;
  blocks?: Block[] | null;
  replacements?: Array<{
    blockId?: string;
    id?: string;
    content?: unknown;
    text?: string;
    newText?: string;
    kind?: string;
    meta?: { role?: string; goal?: string };
  }> | null;
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


export function applyBlockPatches(currentBlocks: Block[] | null | undefined, payload: BlockPatchPayload): Block[] {
  const current = validateThinkForgeBlocks(Array.isArray(currentBlocks) ? currentBlocks : []);
  const replacements = Array.isArray(payload?.replacements) ? payload.replacements : [];

  if (replacements.length > 0) {
    const patches: ThinkForgeBlockPatch[] = [];
    for (const replacement of replacements) {
      const blockId = replacement.blockId || replacement.id;
      if (!blockId) continue;

      patches.push({
        blockId,
        content: Array.isArray(replacement.content) ? replacement.content as any : undefined,
        text: replacement.text ?? replacement.newText,
        kind: replacement.kind as any,
        meta: replacement.meta,
      });
    }

    if (patches.length > 0) {
      return applyThinkForgeBlockPatches(current, patches);
    }
  }

  if (Array.isArray(payload?.blocks)) {
    return validateThinkForgeBlocks(payload.blocks);
  }

  return current;
}
export function sanitizeServerScript(input: any): ScriptModel {
  const title = typeof input?.title === 'string' ? input.title.slice(0, 160) : (input?.title ?? null);
  const blocks = validateThinkForgeBlocks(Array.isArray(input?.blocks) ? input.blocks : []);
  const metadata = input?.metadata ?? null;
  const version = typeof input?.version === 'number' ? input.version : undefined;
  return { title, outline: null, content: null, blocks, metadata, version };
}
