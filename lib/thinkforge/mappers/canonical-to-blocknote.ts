/**
 * Canonical to BlockNote mapper.
 * 
 * Converts canonical block format (with children array) to BlockNote format
 * (with content array). Preserves block IDs for cursor restoration.
 */

import type { Block as BlockNoteBlock } from "@blocknote/core";
import type { Block, BlockTree, InlineNode } from "../schemas/canonical";

/**
 * Convert InlineNode[] to BlockNote content format.
 * BlockNote uses an array of inline content nodes.
 */
function convertInlineNodesToContent(
  children: Array<InlineNode | Block>
): Array<{ type: string; text: string; styles?: Record<string, boolean> }> {
  const content: Array<{ type: string; text: string; styles?: Record<string, boolean> }> = [];

  // Ensure children is an array
  if (!Array.isArray(children)) {
    // If children is a string, convert it to a text node
    if (typeof children === 'string') {
      return [{ type: "text", text: children }];
    }
    // If children is undefined/null or not iterable, return empty text node
    return [{ type: "text", text: "" }];
  }

  for (const child of children) {
    // If it's an InlineNode, convert it
    if ("text" in child && "type" in child && !("id" in child)) {
      const inlineNode = child as InlineNode;
      const styles: Record<string, boolean> = {};

      // Map inline node types to BlockNote styles
      if (inlineNode.type === "em") {
        styles.italic = true;
      } else if (inlineNode.type === "strong") {
        styles.bold = true;
      } else if (inlineNode.type === "code") {
        styles.code = true;
      }

      // BlockNote uses "text" type for all inline content
      content.push({
        type: "text",
        text: inlineNode.text,
        ...(Object.keys(styles).length > 0 ? { styles } : {}),
      });
    } else if ("id" in child && "type" in child) {
      // Nested block - BlockNote doesn't support nested blocks in content
      // Extract text from nested block recursively
      const nestedBlock = child as Block;
      const nestedText = extractTextFromBlock(nestedBlock);
      if (nestedText) {
        content.push({
          type: "text",
          text: nestedText,
        });
      }
    }
  }

  // If no content, add empty text node
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return content;
}

/**
 * Extract plain text from a block recursively.
 */
function extractTextFromBlock(block: Block): string {
  const texts: string[] = [];

  // Ensure children is an array
  if (!Array.isArray(block.children)) {
    return "";
  }

  for (const child of block.children) {
    if ("text" in child && "type" in child && !("id" in child)) {
      texts.push((child as InlineNode).text);
    } else if ("id" in child && "type" in child) {
      texts.push(extractTextFromBlock(child as Block));
    }
  }

  return texts.join("");
}

/**
 * Convert canonical block type to BlockNote block type.
 * BlockNote uses different type names for some blocks.
 * Note: bulletList and numberedList are container blocks that need special handling.
 */
function mapBlockType(canonicalType: Block["type"]): string {
  const typeMap: Record<Block["type"], string> = {
    heading: "heading",
    paragraph: "paragraph",
    bulletList: "paragraph", // Container - will be handled specially
    numberedList: "paragraph", // Container - will be handled specially
    listItem: "bulletListItem", // Individual list item
    dialogue: "paragraph", // Map dialogue to paragraph
    code: "code",
    quote: "quote",
    divider: "divider",
  };

  return typeMap[canonicalType] || "paragraph";
}

/**
 * Convert a single canonical block to BlockNote format.
 * Handles list containers by extracting list items.
 */
function convertBlockToBlockNote(block: Block): BlockNoteBlock | BlockNoteBlock[] {
  // Ensure children is an array
  const children = Array.isArray(block.children) ? block.children : [];
  
  // Handle list containers - extract list items from children
  if (block.type === "bulletList" || block.type === "numberedList") {
    const listItems: BlockNoteBlock[] = [];
    
    // Extract list items from children
    for (const child of children) {
      if ("id" in child && "type" in child) {
        // It's a nested block (list item)
        const listItemBlock = child as Block;
        const listItemType = block.type === "bulletList" ? "bulletListItem" : "numberedListItem";
        const content = convertInlineNodesToContent(listItemBlock.children);
        
        listItems.push({
          id: listItemBlock.id || block.id + "_item_" + listItems.length,
          type: listItemType as any,
          props: listItemBlock.props || {},
          content: content as any,
        });
      } else {
        // It's an inline node - create a list item with this content
        const listItemType = block.type === "bulletList" ? "bulletListItem" : "numberedListItem";
        const content = convertInlineNodesToContent([child]);
        
        listItems.push({
          id: block.id + "_item_" + listItems.length,
          type: listItemType as any,
          props: {},
          content: content as any,
        });
      }
    }
    
    // Return array of list items (will be flattened in the main function)
    return listItems.length > 0 ? listItems : [{
      id: block.id,
      type: (block.type === "bulletList" ? "bulletListItem" : "numberedListItem") as any,
      props: {},
      content: [{ type: "text", text: "" }] as any,
    }];
  }

  // Regular block conversion
  let blockNoteType = mapBlockType(block.type);
  const content = convertInlineNodesToContent(children);

  // Validate that the type is supported by BlockNote
  // BlockNote default types: heading, paragraph, bulletListItem, numberedListItem, code, quote, divider
  const supportedTypes = new Set([
    "heading",
    "paragraph", 
    "bulletListItem",
    "numberedListItem",
    "code",
    "quote",
    "divider"
  ]);
  
  // Fallback to paragraph if type is not supported
  if (!supportedTypes.has(blockNoteType)) {
    console.warn(`BlockNote: Unsupported block type "${blockNoteType}", converting to paragraph`);
    blockNoteType = "paragraph";
  }

  // Build BlockNote block
  const blockNoteBlock: BlockNoteBlock = {
    id: block.id, // Preserve ID exactly
    type: blockNoteType as any,
    props: block.props || {},
    content: content as any,
  };

  return blockNoteBlock;
}

/**
 * Convert canonical block tree to BlockNote blocks.
 * 
 * @param canonicalBlocks - Array of canonical blocks
 * @returns Array of BlockNote blocks with preserved IDs
 */
export function canonicalToBlockNote(
  canonicalBlocks: BlockTree
): BlockNoteBlock[] {
  const result: BlockNoteBlock[] = [];
  
  for (const block of canonicalBlocks) {
    const converted = convertBlockToBlockNote(block);
    if (Array.isArray(converted)) {
      // List container - flatten the list items
      result.push(...converted);
    } else {
      // Regular block
      result.push(converted);
    }
  }
  
  return result;
}

