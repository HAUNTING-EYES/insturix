import { v4 as uuid } from "uuid";
import type { BlockTree, Block as CanonicalBlock } from "./schemas/canonical";
import { extractTextFromBlocks } from "./context";
import { sanitizeForRender } from "./schemas/cir";

export type BlockNodeType = "instruction" | "example" | "why";

export interface BlockNode {
  blockId: string; // stable id
  type: BlockNodeType;
  text: string;
  cirRef?: {
    actionId?: string;
    exampleId?: string;
  };
}

export interface BlockPatch {
  blockId: string;
  newText: string;
}

export interface PlacementProposal {
  insertAfterBlockId?: string;
  insertBeforeBlockId?: string;
  atEnd?: boolean;
  rationale: string;
}

export function suggestInsertionPoint(blocks: BlockNode[]): PlacementProposal {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { atEnd: true, rationale: "Empty document" };
  }

  // 1. After the last instructional block
  const lastInstructionIdx = [...blocks].reverse().findIndex(b => b.type === "instruction");
  if (lastInstructionIdx !== -1) {
    const idx = blocks.length - 1 - lastInstructionIdx;
    // If it's not the very last block, it's a good spot
    if (idx < blocks.length - 1) {
      return { 
        insertAfterBlockId: blocks[idx].blockId, 
        rationale: "New content usually follows main instructional steps." 
      };
    }
  }

  // 2. Before a "Next" / wrap-up / CTA block
  const wrapUpIdx = blocks.findIndex(b => 
    /next steps|conclusion|wrap up|cta|call to action|summary/i.test(b.text)
  );
  if (wrapUpIdx !== -1) {
    return { 
      insertBeforeBlockId: blocks[wrapUpIdx].blockId, 
      rationale: "Inserting before the conclusion/wrap-up." 
    };
  }

  // 3. Fallback: end of document
  return { atEnd: true, rationale: "Adding to the end of the document." };
}

function inferType(block: CanonicalBlock): BlockNodeType {
  if (block.type === "code") return "example";
  const text = extractText(block).toLowerCase();
  if (text.startsWith("why:")) return "why";
  return "instruction";
}

function extractText(block: CanonicalBlock): string {
  if (!block || !Array.isArray(block.children)) return "";
  const walk = (b: CanonicalBlock): string => {
    if (!b || !Array.isArray(b.children)) return "";
    return b.children
      .map((c: any) => {
        if (c && typeof c === "object" && typeof c.text === "string") return c.text;
        if (c && typeof c === "object" && Array.isArray(c.children)) return walk(c as any);
        return "";
      })
      .join(" ");
  };
  return walk(block).trim();
}

export function canonicalToBlockGraph(blocks: BlockTree): BlockNode[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    const text = sanitizeForRender(extractText(b));
    const blockId = typeof (b as any).id === "string" && (b as any).id.trim().length > 0 ? (b as any).id : uuid();
    return {
      blockId,
      type: inferType(b),
      text,
    } satisfies BlockNode;
  });
}

export function applyBlockPatchesToCanonical(blocks: BlockTree, patches: BlockPatch[]): BlockTree {
  if (!Array.isArray(blocks)) return blocks;
  const byId = new Map<string, number>();
  blocks.forEach((b: any, idx) => {
    if (typeof b?.id === "string") {
      byId.set(b.id, idx);
    }
  });

  const next = blocks.map((b) => ({ ...b }));
  for (const patch of patches) {
    const idx = byId.get(patch.blockId);
    if (idx === undefined) continue;
    const block = next[idx];
    if (!block) continue;
    next[idx] = {
      ...block,
      children: [{ type: "text", text: sanitizeForRender(patch.newText) }],
    };
  }
  return next;
}

export function resolveContextWindow(blocks: BlockNode[], targetIds: string[], window: number = 1): BlockNode[] {
  if (!Array.isArray(blocks) || blocks.length === 0 || targetIds.length === 0) return [];
  const indices = targetIds
    .map((id) => blocks.findIndex((b) => b.blockId === id))
    .filter((i) => i >= 0);
  if (indices.length === 0) return [];
  const start = Math.max(0, Math.min(...indices) - window);
  const end = Math.min(blocks.length - 1, Math.max(...indices) + window);
  return blocks.slice(start, end + 1);
}
