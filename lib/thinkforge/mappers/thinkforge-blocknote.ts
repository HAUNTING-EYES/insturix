import type { Block as BlockNoteBlock } from "@blocknote/core";
import {
  type ThinkForgeBlock,
  type ThinkForgeBlockKind,
  type RichTextAST,
  isRichTextAST,
  ensureThinkForgeBlockId,
  validateThinkForgeBlocks,
} from "../schemas/thinkforge-block";

const KIND_TO_BLOCKNOTE: Record<ThinkForgeBlockKind, string> = {
  header: "heading",
  action: "paragraph",
  why: "quote",
  example: "code",
  paragraph: "paragraph",
};

const BLOCKNOTE_TO_KIND: Record<string, ThinkForgeBlockKind> = {
  heading: "header",
  paragraph: "paragraph",
  quote: "why",
  code: "example",
  codeBlock: "example",
};

function cloneContent(ast: RichTextAST): RichTextAST {
  // Shallow clone to avoid mutating caller state; assumes content is already validated
  return ast.map((node) => {
    if (node.type === 'link') {
      return {
        ...node,
        content: node.content ? cloneContent(node.content) : [],
      };
    }
    return {
      ...node,
      styles: node.styles ? { ...node.styles } : undefined,
    };
  });
}

export function thinkForgeBlocksToBlockNote(blocks: ThinkForgeBlock[]): BlockNoteBlock[] {
  const valid = validateThinkForgeBlocks(blocks);
  return valid.map((block) => {
    const type = KIND_TO_BLOCKNOTE[block.kind] || "paragraph";
    return {
      id: block.id,
      type: type as any,
      props: {
        ...(block.meta || {}),
        thinkforgeKind: block.kind,
      },
      content: cloneContent(block.content) as any,
    } as BlockNoteBlock;
  });
}

export function blockNoteToThinkForgeBlocks(blocks: BlockNoteBlock[]): ThinkForgeBlock[] {
  if (!Array.isArray(blocks)) return [];
  const output: ThinkForgeBlock[] = [];

  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const id = ensureThinkForgeBlockId((raw as any).id);
    const props = (raw as any).props || {};
    const hintedKind = props.thinkforgeKind as ThinkForgeBlockKind | undefined;
    const mappedKind = hintedKind || BLOCKNOTE_TO_KIND[String((raw as any).type)] || "paragraph";
    const content = (raw as any).content;
    if (!isRichTextAST(content)) {
      console.warn("ThinkForgeBlock: dropped block with invalid content AST", { id, type: raw.type });
      continue;
    }
    output.push({
      id,
      kind: mappedKind,
      content: cloneContent(content),
      meta: {
        role: typeof props.role === "string" ? props.role : undefined,
        goal: typeof props.goal === "string" ? props.goal : undefined,
      },
    });
  }

  return output;
}
