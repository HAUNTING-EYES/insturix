/**
 * Tiptap JSON to ThinkForgeBlock Mapper
 * 
 * Converts Tiptap JSON AST to ThinkForgeBlock[] format.
 * This is used for backward compatibility during migration and
 * for systems that still expect ThinkForgeBlock format.
 */

import { nanoid } from 'nanoid';
import type {
  ThinkForgeBlock,
  ThinkForgeBlockKind,
  RichTextAST,
  RichTextNode,
  EditorialType,
} from '../schemas/thinkforge-block';
import type {
  TiptapJSON,
  TiptapTextNode,
  TiptapBlockContent,
  TiptapMark,
} from '../schemas/tiptap-schema';
import { ensureThinkForgeBlockId, validateThinkForgeBlocks } from '../schemas/thinkforge-block';

// =============================================================================
// MARK TO STYLE CONVERSION
// =============================================================================

/**
 * Convert Tiptap marks to ThinkForge styles
 */
function marksToStyles(marks: TiptapMark[] | undefined): Record<string, boolean> {
  if (!marks || marks.length === 0) return {};
  
  const styles: Record<string, boolean> = {};
  
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        styles.bold = true;
        break;
      case 'italic':
        styles.italic = true;
        break;
      case 'underline':
        styles.underline = true;
        break;
      case 'strike':
        styles.strike = true;
        break;
      case 'code':
        styles.code = true;
        break;
      case 'highlight':
        styles.highlight = true;
        break;
      // Link is handled separately
    }
  }
  
  return styles;
}

/**
 * Extract link href from marks if present
 */
function extractLinkHref(marks: TiptapMark[] | undefined): string | null {
  if (!marks) return null;
  const linkMark = marks.find(m => m.type === 'link');
  const attrs = linkMark && 'attrs' in linkMark && linkMark.attrs && typeof linkMark.attrs === 'object'
    ? linkMark.attrs as Record<string, unknown>
    : null;
  if (typeof attrs?.href === 'string') {
    return attrs.href;
  }
  return null;
}

// =============================================================================
// TEXT NODE CONVERSION
// =============================================================================

/**
 * Convert Tiptap text nodes to ThinkForge RichTextAST
 */
function tiptapContentToRichText(content: TiptapTextNode[] | undefined): RichTextAST {
  if (!content || content.length === 0) {
    return [{ type: 'text', text: '', styles: {} }];
  }
  
  const result: RichTextNode[] = [];
  
  for (const node of content) {
    if (node.type !== 'text') continue;
    
    const text = node.text || '';
    const linkHref = extractLinkHref(node.marks);
    
    if (linkHref) {
      // This is a link
      const styles = marksToStyles(node.marks?.filter(m => m.type !== 'link'));
      result.push({
        type: 'link',
        href: linkHref,
        content: [{
          type: 'text',
          text,
          styles,
        }],
      });
    } else {
      // Regular text node
      const styles = marksToStyles(node.marks);
      result.push({
        type: 'text',
        text,
        styles: Object.keys(styles).length > 0 ? styles : {},
      });
    }
  }
  
  // Ensure at least one node
  if (result.length === 0) {
    result.push({ type: 'text', text: '', styles: {} });
  }
  
  return result;
}

// =============================================================================
// BLOCK EXTRACTION
// =============================================================================

/**
 * Extract text content from nested Tiptap nodes (for custom blocks)
 */
function extractTextFromBlockContent(content: TiptapBlockContent[] | undefined): RichTextAST {
  if (!content || content.length === 0) {
    return [{ type: 'text', text: '', styles: {} }];
  }
  
  const result: RichTextNode[] = [];
  
  for (const node of content) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const textContent = 'content' in node ? node.content : undefined;
      result.push(...tiptapContentToRichText(textContent as TiptapTextNode[] | undefined));
    } else if (node.type === 'codeBlock') {
      const textContent = 'content' in node ? node.content : undefined;
      result.push(...tiptapContentToRichText(textContent as TiptapTextNode[] | undefined));
    }
  }
  
  if (result.length === 0) {
    result.push({ type: 'text', text: '', styles: {} });
  }
  
  return result;
}

function parseStringArrayAttribute(value: unknown, field: string): string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`Invalid ${field} scene attribute.`);
    }
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new Error(`Invalid ${field} scene attribute.`);
  }
  return parsed;
}

// =============================================================================
// NODE TYPE MAPPING
// =============================================================================

/**
 * Map Tiptap node type to ThinkForgeBlockKind
 */
function tiptapTypeToKind(type: string): ThinkForgeBlockKind {
  switch (type) {
    case 'heading':
      return 'header';
    case 'actionBlock':
      return 'action';
    case 'whyBlock':
      return 'why';
    case 'exampleBlock':
      return 'example';
    case 'blockquote':
      return 'why';
    case 'codeBlock':
      return 'example';
    case 'sceneBlock':
      return 'scene';
    case 'editorialBlock':
      return 'editorial';
    case 'paragraph':
    default:
      return 'paragraph';
  }
}

// =============================================================================
// BLOCK CONVERSION
// =============================================================================

/**
 * Convert a Tiptap node to ThinkForgeBlock
 */
function tiptapNodeToBlock(node: TiptapBlockContent, index: number): ThinkForgeBlock | null {
  const type = node.type;
  const kind = tiptapTypeToKind(type);
  
  // Extract ID from attrs if present
  let id: string | undefined;
  if ('attrs' in node && node.attrs && 'id' in node.attrs) {
    id = node.attrs.id as string;
  }
  id = ensureThinkForgeBlockId(id || `blk_${nanoid(8)}_${index}`);
  
  // Preserve structural and custom-block metadata across editor round trips.
  let meta: ThinkForgeBlock['meta'];
  if ('attrs' in node && node.attrs) {
    const attrs = node.attrs as Record<string, unknown>;
    const role = typeof attrs.role === 'string' && attrs.role ? attrs.role : undefined;
    const goal = typeof attrs.goal === 'string' && attrs.goal ? attrs.goal : undefined;
    const headingLevel = type === 'heading'
      && typeof attrs.level === 'number'
      && Number.isInteger(attrs.level)
      && attrs.level >= 1
      && attrs.level <= 3
      ? attrs.level
      : undefined;
    if (role || goal || headingLevel !== undefined) {
      meta = {
        ...(role ? { role } : {}),
        ...(goal ? { goal } : {}),
        ...(headingLevel !== undefined ? { level: headingLevel } : {}),
      };
    }
  }
  
  // Extract content
  let content: RichTextAST;
  
  switch (type) {
    case 'paragraph':
    case 'heading': {
      const textContent = 'content' in node ? node.content : undefined;
      content = tiptapContentToRichText(textContent as TiptapTextNode[] | undefined);
      break;
    }
    
    case 'actionBlock':
    case 'whyBlock':
    case 'exampleBlock':
    case 'blockquote':
    case 'sceneBlock':
    case 'editorialBlock': {
      const blockContent = 'content' in node ? node.content : undefined;
      content = extractTextFromBlockContent(blockContent as TiptapBlockContent[] | undefined);
      break;
    }
    
    case 'codeBlock': {
      const textContent = 'content' in node ? node.content : undefined;
      content = tiptapContentToRichText(textContent as TiptapTextNode[] | undefined);
      break;
    }
    
    case 'horizontalRule':
    case 'hardBreak':
    case 'image':
    case 'video': {
      // Skip non-text blocks
      return null;
    }
    
    case 'bulletList':
    case 'orderedList': {
      // Flatten list items into paragraphs
      const listItems: Array<{ content?: unknown }> =
        'content' in node && Array.isArray(node.content)
          ? node.content as Array<{ content?: unknown }>
          : [];
      const allContent: RichTextNode[] = [];
      
      for (const item of listItems) {
        if (item && typeof item === 'object' && Array.isArray(item.content)) {
          const itemContent = extractTextFromBlockContent(item.content as TiptapBlockContent[]);
          allContent.push(...itemContent);
          // Add newline between items
          allContent.push({ type: 'text', text: '\n', styles: {} });
        }
      }
      
      if (allContent.length === 0) {
        return null;
      }
      
      content = allContent;
      break;
    }
    
    default: {
      // Unknown type - try to extract content if present
      if ('content' in node && Array.isArray(node.content)) {
        content = tiptapContentToRichText(node.content as TiptapTextNode[]);
      } else {
        return null;
      }
    }
  }
  
  // V2: Reconstruct typed slots from Tiptap attrs for scene/editorial blocks
  const attrs = ('attrs' in node && node.attrs) ? node.attrs as Record<string, unknown> : {};

  let scene: ThinkForgeBlock['scene'];
  if (kind === 'scene') {
    const validCategories = ['person', 'product', 'location', 'object', 'brand', 'other'] as const;
    type SubjectCategory = typeof validCategories[number];
    let rawSubjects: Array<{ name: string; category: string }> = [];
    try { rawSubjects = JSON.parse(String(attrs.subjects || '[]')); } catch { /* ignore */ }
    const subjects = rawSubjects.map(s => ({
      name: String(s.name || ''),
      category: (validCategories.includes(s.category as SubjectCategory) ? s.category : 'other') as SubjectCategory,
    }));
    scene = {
      visualDescription: String(attrs.visualDescription || ''),
      subjects,
      ...(attrs.duration != null ? { duration: Number(attrs.duration) } : {}),
      ...(attrs.durationExplicit ? { durationExplicit: true } : {}),
      ...(attrs.mood ? { mood: String(attrs.mood) } : {}),
      ...(attrs.onScreenText ? { onScreenText: parseStringArrayAttribute(attrs.onScreenText, 'onScreenText') } : {}),
      ...(attrs.sfxDescription ? { sfxDescription: String(attrs.sfxDescription) } : {}),
      ...(attrs.musicDescription ? { musicDescription: String(attrs.musicDescription) } : {}),
    };
  }

  let editorial: ThinkForgeBlock['editorial'];
  if (kind === 'editorial') {
    editorial = {
      editorialType: (['emotional_target', 'instrumentation', 'production_note', 'style_guide', 'color_palette', 'pacing_note', 'custom'].includes(String(attrs.editorialType))
        ? String(attrs.editorialType)
        : 'custom') as EditorialType,
    };
  }

  return {
    id,
    kind,
    content,
    meta,
    ...(scene ? { scene } : {}),
    ...(editorial ? { editorial } : {}),
  };
}

// =============================================================================
// MAIN CONVERSION FUNCTION
// =============================================================================

/**
 * Convert Tiptap JSON document to ThinkForgeBlock[].
 * 
 * @param doc - Tiptap JSON document
 * @returns Array of ThinkForgeBlock
 */
export function tiptapJSONToThinkForgeBlocks(doc: TiptapJSON): ThinkForgeBlock[] {
  if (!doc || doc.type !== 'doc' || !doc.content) {
    return [];
  }
  
  const blocks: ThinkForgeBlock[] = [];
  
  for (let i = 0; i < doc.content.length; i++) {
    const node = doc.content[i];
    const block = tiptapNodeToBlock(node, i);
    if (block) {
      blocks.push(block);
    }
  }
  
  // Validate and return
  return validateThinkForgeBlocks(blocks);
}

/**
 * Convert a single Tiptap node to ThinkForgeBlock (for incremental updates)
 * 
 * @param node - Tiptap block content node
 * @param index - Block index for ID generation
 * @returns ThinkForgeBlock or null if not convertible
 */
export function tiptapNodeToThinkForgeBlock(
  node: TiptapBlockContent,
  index: number = 0
): ThinkForgeBlock | null {
  return tiptapNodeToBlock(node, index);
}

/**
 * Convert Tiptap text nodes to ThinkForge RichTextAST (for partial updates)
 * 
 * @param content - Tiptap text nodes
 * @returns ThinkForge RichTextAST
 */
export function tiptapTextToThinkForgeRichText(
  content: TiptapTextNode[] | undefined
): RichTextAST {
  return tiptapContentToRichText(content);
}
