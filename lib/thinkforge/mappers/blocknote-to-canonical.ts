/**
 * BlockNote to Canonical mapper.
 * 
 * Converts BlockNote block format (with content array) to canonical format
 * (with children array). Validates output and preserves/generates IDs.
 */

import type { Block as BlockNoteBlock } from "@blocknote/core";
import type { Block, BlockTree, InlineNode } from "../schemas/canonical";
import { validateBlockTree } from "../schemas/canonical";

/**
 * Convert BlockNote content to canonical InlineNode[].
 * BlockNote content is an array of inline content nodes with styles.
 */
function convertContentToInlineNodes(
  content: any[]
): Array<InlineNode | Block> {
  const children: Array<InlineNode | Block> = [];

  if (!Array.isArray(content)) {
    // If content is a string, convert to text InlineNode
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    return [{ type: "text", text: "" }];
  }

  for (const node of content) {
    if (!node || typeof node !== "object") {
      continue;
    }

    // BlockNote text nodes have type "text" and text property
    if (node.type === "text" && typeof node.text === "string") {
      const text = node.text;
      const styles = node.styles || {};

      // Convert BlockNote styles to canonical InlineNode types
      if (styles.code) {
        children.push({ type: "code", text });
      } else if (styles.bold && styles.italic) {
        // Both bold and italic - prefer strong
        children.push({ type: "strong", text });
      } else if (styles.bold) {
        children.push({ type: "strong", text });
      } else if (styles.italic) {
        children.push({ type: "em", text });
      } else {
        children.push({ type: "text", text });
      }
    } else if (node.type && node.text) {
      // Fallback for other node types
      children.push({ type: "text", text: String(node.text) });
    }
  }

  // If no children, add empty text node
  if (children.length === 0) {
    children.push({ type: "text", text: "" });
  }

  return children;
}

/**
 * Convert BlockNote block type to canonical block type.
 */
function mapBlockNoteTypeToCanonical(blockNoteType: string): Block["type"] {
  const typeMap: Record<string, Block["type"]> = {
    heading: "heading",
    paragraph: "paragraph",
    bulletListItem: "listItem", // BlockNote bulletListItem -> canonical listItem
    numberedListItem: "listItem", // BlockNote numberedListItem -> canonical listItem
    code: "code",
    quote: "quote",
    divider: "divider",
  };

  return (typeMap[blockNoteType] || "paragraph") as Block["type"];
}

/**
 * Convert a single BlockNote block to canonical format.
 */
function convertBlockNoteToCanonical(
  blockNoteBlock: BlockNoteBlock,
  generateId: () => string
): Block {
  const canonicalType = mapBlockNoteTypeToCanonical(blockNoteBlock.type);

  // Preserve ID if present, otherwise generate
  const id = blockNoteBlock.id || generateId();

  // Convert content to children
  const content = (blockNoteBlock.content as any) || [];
  const children = convertContentToInlineNodes(content);

  // Build canonical block
  const canonicalBlock: Block = {
    id,
    type: canonicalType,
    props: blockNoteBlock.props || undefined,
    children,
  };

  return canonicalBlock;
}

/**
 * Convert BlockNote blocks to canonical format.
 * 
 * Validates output against canonical schema (fail-closed).
 * Preserves existing IDs, generates if missing.
 * 
 * @param blockNoteBlocks - Array of BlockNote blocks
 * @returns Validated canonical block tree
 * @throws Error if blocks fail validation
 */
export function blockNoteToCanonical(
  blockNoteBlocks: BlockNoteBlock[]
): BlockTree {
  // Generate ID function
  let idCounter = 0;
  const generateId = () => {
    return `block_${Date.now()}_${++idCounter}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Convert all blocks
  const canonicalBlocks: Block[] = blockNoteBlocks.map((block) =>
    convertBlockNoteToCanonical(block, generateId)
  );

  // Validate against canonical schema (fail-closed)
  return validateBlockTree(canonicalBlocks);
}

