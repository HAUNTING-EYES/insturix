/**
 * Canonical block schema types matching backend schema EXACTLY (LEGACY).
 *
 * NOTE: The primary canonical storage is the CIR (plain text sections).
 * These block types remain only as a bridge for legacy data and presentation
 * adapters. Do not persist BlockNote formatting as canonical content.
 * All validation is fail-closed (throws Error on invalid input).
 */

// Block type union - must match backend BlockTypeEnum exactly
export type BlockType =
  | "heading"
  | "paragraph"
  | "bulletList"
  | "numberedList"
  | "listItem"
  | "dialogue"
  | "code"
  | "quote"
  | "divider";

// Inline node type union - must match backend InlineNodeTypeEnum exactly
export type InlineNodeType = "text" | "em" | "strong" | "code";

// Inline node interface
export interface InlineNode {
  type: InlineNodeType;
  text: string;
}

// Block interface - must match backend Block model exactly
export interface Block {
  id: string;
  type: BlockType;
  props?: Record<string, unknown>;
  children: Array<InlineNode | Block>;
}

// Block tree type - array of blocks
export type BlockTree = Array<Block>;

// Type guards for runtime validation
function isBlockType(value: unknown): value is BlockType {
  const validTypes: BlockType[] = [
    "heading",
    "paragraph",
    "bulletList",
    "numberedList",
    "listItem",
    "dialogue",
    "code",
    "quote",
    "divider",
  ];
  return typeof value === "string" && validTypes.includes(value as BlockType);
}

function isInlineNodeType(value: unknown): value is InlineNodeType {
  const validTypes: InlineNodeType[] = ["text", "em", "strong", "code"];
  return typeof value === "string" && validTypes.includes(value as InlineNodeType);
}

function isInlineNode(value: unknown): value is InlineNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    isInlineNodeType(obj.type) &&
    typeof obj.text === "string" &&
    !("id" in obj) &&
    !("children" in obj)
  );
}

function isBlock(value: unknown): value is Block {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.id !== "string" || !isBlockType(obj.type)) {
    return false;
  }
  
  // Check props (optional)
  if (obj.props !== undefined) {
    if (typeof obj.props !== "object" || obj.props === null || Array.isArray(obj.props)) {
      return false;
    }
  }
  
  // Check children (required, must be array)
  if (!Array.isArray(obj.children)) {
    return false;
  }
  
  // Validate children recursively
  for (const child of obj.children) {
    if (!isInlineNode(child) && !isBlock(child)) {
      return false;
    }
  }
  
  // Validate props based on block type
  if (obj.props && typeof obj.props === "object") {
    const props = obj.props as Record<string, unknown>;
    
    if (obj.type === "heading") {
      // Only "level" is allowed for heading
      const allowedKeys = new Set(["level"]);
      const keys = Object.keys(props);
      if (keys.some((k) => !allowedKeys.has(k))) {
        return false;
      }
      if ("level" in props) {
        const level = props.level;
        if (typeof level !== "number" || level < 1 || level > 6) {
          return false;
        }
      }
    } else if (obj.type === "code") {
      // Only "language" is allowed for code
      const allowedKeys = new Set(["language"]);
      const keys = Object.keys(props);
      if (keys.some((k) => !allowedKeys.has(k))) {
        return false;
      }
      if ("language" in props && props.language !== null && typeof props.language !== "string") {
        return false;
      }
    } else {
      // Other block types should not have props
      if (Object.keys(props).length > 0) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Validate a single block against canonical schema.
 * 
 * @param block - Unknown value to validate as a block
 * @returns Validated Block
 * @throws Error if block is invalid (fail-closed)
 */
export function validateBlock(block: unknown): Block {
  if (!isBlock(block)) {
    throw new Error(`Invalid block: block must have id (string), type (BlockType), and children (array)`);
  }
  
  // Additional validation: check for HTML in text
  function checkTextForHTML(node: InlineNode | Block): void {
    if (isInlineNode(node)) {
      const text = node.text || "";
      if (text.includes("<") || text.includes(">")) {
        throw new Error("HTML tags are not allowed in text content");
      }
      if (/\|/.test(text) || /`/.test(text) || /\*\*/.test(text) || /__/.test(text)) {
        throw new Error("Inline formatting (markdown, tables, code spans) is not allowed in canonical blocks");
      }
    } else {
      for (const child of node.children) {
        checkTextForHTML(child);
      }
    }
  }
  
  checkTextForHTML(block);
  
  return block;
}

/**
 * Validate a tree of blocks against canonical schema.
 * 
 * @param blocks - Unknown value to validate as block tree
 * @returns Validated BlockTree
 * @throws Error if any block is invalid (fail-closed)
 */
export function validateBlockTree(blocks: unknown): BlockTree {
  if (!Array.isArray(blocks)) {
    throw new Error("blocks must be an array");
  }
  
  const validatedBlocks: Block[] = [];
  for (let idx = 0; idx < blocks.length; idx++) {
    try {
      const validatedBlock = validateBlock(blocks[idx]);
      validatedBlocks.push(validatedBlock);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid block at index ${idx}: ${message}`);
    }
  }
  
  return validatedBlocks;
}

