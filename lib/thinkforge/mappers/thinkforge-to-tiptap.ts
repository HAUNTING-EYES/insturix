/**
 * ThinkForgeBlock to Tiptap JSON Mapper
 * 
 * Converts ThinkForgeBlock[] to Tiptap JSON AST format.
 * This is used for migrating existing content to Tiptap and for
 * displaying legacy content in the new editor.
 */

import type {
  ThinkForgeBlock,
  ThinkForgeBlockKind,
  RichTextAST,
  RichTextNode,
} from '../schemas/thinkforge-block';
import type {
  TiptapJSON,
  TiptapTextNode,
  TiptapParagraph,
  TiptapHeading,
  TiptapBlockContent,
  TiptapMark,
  TiptapActionBlock,
  TiptapWhyBlock,
  TiptapExampleBlock,
  TiptapBlockquote,
  TiptapCodeBlock,
  TiptapBulletList,
  TiptapOrderedList,
  TiptapListItem,
  TiptapHorizontalRule,
} from '../schemas/tiptap-schema';
import { createEmptyDoc } from '../schemas/tiptap-schema';

// =============================================================================
// STYLE TO MARK CONVERSION
// =============================================================================

/**
 * Convert ThinkForge styles to Tiptap marks
 */
function stylesToMarks(styles: Record<string, boolean> | undefined): TiptapMark[] {
  if (!styles) return [];
  
  const marks: TiptapMark[] = [];
  
  if (styles.bold) marks.push({ type: 'bold' });
  if (styles.italic) marks.push({ type: 'italic' });
  if (styles.underline) marks.push({ type: 'underline' });
  if (styles.strike || styles.strikethrough) marks.push({ type: 'strike' });
  if (styles.code) marks.push({ type: 'code' });
  if (styles.highlight) marks.push({ type: 'highlight' });
  
  return marks;
}

// =============================================================================
// RICH TEXT CONVERSION
// =============================================================================

/**
 * Convert ThinkForge RichTextAST to Tiptap text nodes
 */
function richTextToTiptapContent(content: RichTextAST): TiptapTextNode[] {
  const result: TiptapTextNode[] = [];
  
  for (const node of content) {
    if (node.type === 'text') {
      const text = node.text || '';
      if (text.length === 0) continue;
      
      const marks = stylesToMarks(node.styles);
      const textNode: TiptapTextNode = { type: 'text', text };
      if (marks.length > 0) {
        textNode.marks = marks;
      }
      result.push(textNode);
    } else if (node.type === 'link') {
      // Convert link to text with link mark
      const href = node.href || '#';
      const linkContent = node.content || [];
      
      for (const linkChild of linkContent) {
        if (linkChild.type === 'text' && linkChild.text) {
          const marks: TiptapMark[] = [
            { type: 'link', attrs: { href } },
            ...stylesToMarks(linkChild.styles),
          ];
          result.push({
            type: 'text',
            text: linkChild.text,
            marks,
          });
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// LIST DETECTION AND CONVERSION
// =============================================================================

/**
 * Detect if text contains bullet list pattern
 */
function isBulletList(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  
  // Check if most lines start with bullet markers
  const bulletPattern = /^[•\-\*]\s+/;
  const bulletCount = lines.filter(l => bulletPattern.test(l)).length;
  return bulletCount >= Math.min(2, lines.length * 0.7);
}

/**
 * Detect if text contains numbered list pattern
 */
function isNumberedList(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  
  // Check if lines start with numbers
  const numberedPattern = /^\d+[\.\)]\s+/;
  const numberedCount = lines.filter(l => numberedPattern.test(l)).length;
  return numberedCount >= Math.min(2, lines.length * 0.7);
}

/**
 * Convert bullet list text to Tiptap bulletList structure
 */
function convertBulletListToTiptap(text: string): TiptapBulletList {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: TiptapListItem[] = [];
  
  for (const line of lines) {
    // Remove bullet marker (•, -, *, etc.)
    const cleanLine = line.replace(/^[•\-\*]\s+/, '').trim();
    if (!cleanLine) continue;
    
    // Create paragraph with text content
    const paragraph: TiptapParagraph = {
      type: 'paragraph',
      content: cleanLine ? [{ type: 'text', text: cleanLine }] : [],
    };
    
    items.push({
      type: 'listItem',
      content: [paragraph],
    });
  }
  
  return {
    type: 'bulletList',
    content: items.length > 0 ? items : undefined,
  };
}

/**
 * Convert numbered list text to Tiptap orderedList structure
 */
function convertNumberedListToTiptap(text: string): TiptapOrderedList {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: TiptapListItem[] = [];
  
  for (const line of lines) {
    // Remove number marker (1., 2), etc.)
    const cleanLine = line.replace(/^\d+[\.\)]\s+/, '').trim();
    if (!cleanLine) continue;
    
    // Create paragraph with text content
    const paragraph: TiptapParagraph = {
      type: 'paragraph',
      content: cleanLine ? [{ type: 'text', text: cleanLine }] : [],
    };
    
    items.push({
      type: 'listItem',
      content: [paragraph],
    });
  }
  
  return {
    type: 'orderedList',
    content: items.length > 0 ? items : undefined,
  };
}

/**
 * Check if block should be converted to horizontal rule
 */
function isHorizontalRule(block: ThinkForgeBlock): boolean {
  const text = block.content
    .filter(node => node.type === 'text')
    .map(node => (node as any).text || '')
    .join(' ')
    .trim();
  
  return text === '---' || text === '—' || text === '___' || text.length === 0;
}

// =============================================================================
// BLOCK CONVERSION
// =============================================================================

/**
 * Map ThinkForgeBlockKind to Tiptap node type
 */
const KIND_TO_TIPTAP_TYPE: Record<ThinkForgeBlockKind, string> = {
  header: 'heading',
  action: 'actionBlock',
  why: 'whyBlock',
  example: 'exampleBlock',
  paragraph: 'paragraph',
};

/**
 * Extract plain text from Tiptap content for pattern detection
 */
function extractPlainTextFromTiptapContent(content: TiptapTextNode[]): string {
  return content.map(node => node.text || '').join(' ').trim();
}

/**
 * Convert a single ThinkForgeBlock to Tiptap node(s)
 * Returns array to support splitting lists and horizontal rules
 */
function blockToTiptapNodes(block: ThinkForgeBlock): TiptapBlockContent[] {
  const { id, kind, content, meta } = block;
  const tiptapContent = richTextToTiptapContent(content);
  const plainText = extractPlainTextFromTiptapContent(tiptapContent);
  
  // Check for horizontal rule first
  if (isHorizontalRule(block)) {
    return [{
      type: 'horizontalRule',
    } as TiptapHorizontalRule];
  }
  
  switch (kind) {
    case 'header': {
      // Convert to heading node with level from meta (default to 2)
      const level = Math.min(3, Math.max(1, meta?.level || 2));
      const heading: TiptapHeading = {
        type: 'heading',
        attrs: { level, id },
        content: tiptapContent,
      };
      return [heading];
    }
    
    case 'action': {
      // Check if this is a list pattern
      if (isBulletList(plainText)) {
        return [convertBulletListToTiptap(plainText)];
      }
      if (isNumberedList(plainText)) {
        return [convertNumberedListToTiptap(plainText)];
      }
      
      // Otherwise, convert to actionBlock with paragraph content
      const paragraph: TiptapParagraph = {
        type: 'paragraph',
        content: tiptapContent,
      };
      const actionBlock: TiptapActionBlock = {
        type: 'actionBlock',
        attrs: {
          id,
          role: meta?.role,
          goal: meta?.goal,
        },
        content: [paragraph],
      };
      return [actionBlock];
    }
    
    case 'why': {
      // Check if this is a list pattern (for callout lists)
      if (isBulletList(plainText)) {
        const list = convertBulletListToTiptap(plainText);
        const whyBlock: TiptapWhyBlock = {
          type: 'whyBlock',
          attrs: {
            id,
            role: meta?.role,
            goal: meta?.goal,
          },
          content: [list],
        };
        return [whyBlock];
      }
      if (isNumberedList(plainText)) {
        const list = convertNumberedListToTiptap(plainText);
        const whyBlock: TiptapWhyBlock = {
          type: 'whyBlock',
          attrs: {
            id,
            role: meta?.role,
            goal: meta?.goal,
          },
          content: [list],
        };
        return [whyBlock];
      }
      
      // Convert to whyBlock (like blockquote) with paragraph content
      const paragraph: TiptapParagraph = {
        type: 'paragraph',
        content: tiptapContent,
      };
      const whyBlock: TiptapWhyBlock = {
        type: 'whyBlock',
        attrs: {
          id,
          role: meta?.role,
          goal: meta?.goal,
        },
        content: [paragraph],
      };
      return [whyBlock];
    }
    
    case 'example': {
      // Convert to exampleBlock with code block content
      const codeBlock: TiptapCodeBlock = {
        type: 'codeBlock',
        attrs: { language: null, id: `${id}_code` },
        content: tiptapContent,
      };
      const exampleBlock: TiptapExampleBlock = {
        type: 'exampleBlock',
        attrs: {
          id,
          role: meta?.role,
          goal: meta?.goal,
        },
        content: [codeBlock],
      };
      return [exampleBlock];
    }
    
    case 'paragraph':
    default: {
      // Check if this is a list pattern
      if (isBulletList(plainText)) {
        return [convertBulletListToTiptap(plainText)];
      }
      if (isNumberedList(plainText)) {
        return [convertNumberedListToTiptap(plainText)];
      }
      
      // Convert to paragraph node
      const paragraph: TiptapParagraph = {
        type: 'paragraph',
        attrs: { id },
        content: tiptapContent,
      };
      return [paragraph];
    }
  }
}

/**
 * Convert a single ThinkForgeBlock to Tiptap node (backward compatibility)
 */
function blockToTiptapNode(block: ThinkForgeBlock): TiptapBlockContent {
  const nodes = blockToTiptapNodes(block);
  return nodes[0] || { type: 'paragraph', content: [] };
}

/**
 * Export blockToTiptapNodes for streaming use
 */
export { blockToTiptapNodes };

// =============================================================================
// MAIN CONVERSION FUNCTION
// =============================================================================

/**
 * Convert ThinkForgeBlock[] to Tiptap JSON document.
 * 
 * @param blocks - Array of ThinkForgeBlock to convert
 * @returns Tiptap JSON document
 */
export function thinkForgeBlocksToTiptapJSON(blocks: ThinkForgeBlock[]): TiptapJSON {
  if (!blocks || blocks.length === 0) {
    return createEmptyDoc();
  }
  
  const content: TiptapBlockContent[] = [];
  
  for (const block of blocks) {
    // blockToTiptapNodes can return multiple nodes (for lists, horizontal rules, etc.)
    const nodes = blockToTiptapNodes(block);
    content.push(...nodes);
  }
  
  // Ensure at least one paragraph if conversion resulted in empty content
  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [],
    });
  }
  
  return {
    type: 'doc',
    content,
  };
}

/**
 * Convert a single ThinkForgeBlock to Tiptap node (for incremental updates)
 * 
 * @param block - ThinkForgeBlock to convert
 * @returns Tiptap block content node
 */
export function thinkForgeBlockToTiptapNode(block: ThinkForgeBlock): TiptapBlockContent {
  return blockToTiptapNode(block);
}

/**
 * Convert ThinkForge RichTextAST to Tiptap inline content (for partial updates)
 * 
 * @param content - RichTextAST to convert
 * @returns Array of Tiptap text nodes
 */
export function thinkForgeRichTextToTiptapContent(content: RichTextAST): TiptapTextNode[] {
  return richTextToTiptapContent(content);
}
