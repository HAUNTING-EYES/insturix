import { ensureThinkForgeBlockId, validateThinkForgeBlocks, type RichTextAST, type RichTextNode, type ThinkForgeBlock, type ThinkForgeBlockKind } from '../schemas/thinkforge-block';

export interface ThinkForgeBlockPatch {
  blockId: string;
  content?: RichTextAST;
  text?: string;
  kind?: ThinkForgeBlockKind;
  meta?: { role?: string; goal?: string };
}

function textToAst(text?: string | null): RichTextAST {
  const value = (text || '').trim();
  return value ? [{ type: 'text', text: value }] : [];
}

export function extractTextFromRichText(ast: RichTextAST): string {
  const parts: string[] = [];
  const walk = (nodes: RichTextAST) => {
    for (const node of nodes) {
      if (node.text) parts.push(node.text);
      const nested = node.content ?? (node as RichTextNode & { children?: RichTextAST }).children;
      if (nested?.length) walk(nested);
    }
  };
  walk(ast || []);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function applyThinkForgeBlockPatches(
  blocks: ThinkForgeBlock[],
  patches: ThinkForgeBlockPatch[],
  options?: { insertAfterId?: string | null; insertBeforeId?: string | null; defaultKind?: ThinkForgeBlockKind }
): ThinkForgeBlock[] {
  const byId = new Map<string, number>();
  blocks.forEach((b, idx) => byId.set(b.id, idx));
  const next = [...blocks];

  const insertAtIndex = (): number => {
    if (options?.insertBeforeId) {
      const idx = next.findIndex((b) => b.id === options.insertBeforeId);
      if (idx >= 0) return idx;
    }
    if (options?.insertAfterId) {
      const idx = next.findIndex((b) => b.id === options.insertAfterId);
      if (idx >= 0) return idx + 1;
    }
    return next.length;
  };

  for (const patch of patches) {
    const targetIdx = byId.get(patch.blockId);
    if (targetIdx === undefined) {
      // treat as addition
      const content = patch.content ?? textToAst(patch.text);
      if (!content.length) continue;
      const newBlock: ThinkForgeBlock = {
        id: ensureThinkForgeBlockId(patch.blockId === 'NEW_BLOCK' ? undefined : patch.blockId),
        kind: patch.kind || options?.defaultKind || 'paragraph',
        content,
        meta: patch.meta,
      };
      const insertionIndex = insertAtIndex();
      next.splice(insertionIndex, 0, newBlock);
      // refresh map indexes after insertion
      next.forEach((b, idx) => byId.set(b.id, idx));
      continue;
    }

    const existing = next[targetIdx];
    const newContent = patch.content ?? textToAst(patch.text);
    next[targetIdx] = {
      ...existing,
      kind: patch.kind ?? existing.kind,
      content: newContent.length ? newContent : existing.content,
      meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
    };
  }

  return validateThinkForgeBlocks(next);
}
