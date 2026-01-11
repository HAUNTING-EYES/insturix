/**
 * Tiptap JSON AST Schema Definition
 * 
 * This file defines the canonical Tiptap JSON structure for ThinkForge scripts.
 * All AI generation and persistence must conform to this schema.
 * 
 * IMPORTANT: No sanitization or fallbacks - invalid JSON must be rejected.
 */

import { z } from 'zod';

// =============================================================================
// MARK SCHEMAS
// =============================================================================

export const BoldMarkSchema = z.object({
  type: z.literal('bold'),
});

export const ItalicMarkSchema = z.object({
  type: z.literal('italic'),
});

export const UnderlineMarkSchema = z.object({
  type: z.literal('underline'),
});

export const StrikeMarkSchema = z.object({
  type: z.literal('strike'),
});

export const CodeMarkSchema = z.object({
  type: z.literal('code'),
});

export const HighlightMarkSchema = z.object({
  type: z.literal('highlight'),
  attrs: z.object({
    color: z.string().optional(),
  }).optional(),
});

export const LinkMarkSchema = z.object({
  type: z.literal('link'),
  attrs: z.object({
    href: z.string(),
    target: z.string().optional(),
    rel: z.string().optional(),
    class: z.string().nullable().optional(),
  }),
});

export const MarkSchema = z.discriminatedUnion('type', [
  BoldMarkSchema,
  ItalicMarkSchema,
  UnderlineMarkSchema,
  StrikeMarkSchema,
  CodeMarkSchema,
  HighlightMarkSchema,
  LinkMarkSchema,
]);

export type TiptapMark = z.infer<typeof MarkSchema>;

// =============================================================================
// TEXT NODE SCHEMA
// =============================================================================

export const TextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
});

export type TiptapTextNode = z.infer<typeof TextNodeSchema>;

// =============================================================================
// INLINE CONTENT (text nodes with marks)
// =============================================================================

// Inline content is an array of text nodes
export const InlineContentSchema = z.array(TextNodeSchema);

export type TiptapInlineContent = z.infer<typeof InlineContentSchema>;

// =============================================================================
// BLOCK NODE SCHEMAS
// =============================================================================

// Forward declaration for recursive types
export type TiptapNode = 
  | TiptapTextNode
  | TiptapParagraph
  | TiptapHeading
  | TiptapBulletList
  | TiptapOrderedList
  | TiptapListItem
  | TiptapBlockquote
  | TiptapCodeBlock
  | TiptapHorizontalRule
  | TiptapHardBreak
  | TiptapImage
  | TiptapVideo
  | TiptapActionBlock
  | TiptapWhyBlock
  | TiptapExampleBlock
  | TiptapDoc;

// Paragraph
export const ParagraphNodeSchema: z.ZodType<TiptapParagraph> = z.object({
  type: z.literal('paragraph'),
  attrs: z.object({
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => InlineContentSchema).optional(),
});

export interface TiptapParagraph {
  type: 'paragraph';
  attrs?: { id?: string };
  content?: TiptapTextNode[];
}

// Heading (levels 1-3)
export const HeadingNodeSchema: z.ZodType<TiptapHeading> = z.object({
  type: z.literal('heading'),
  attrs: z.object({
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    id: z.string().optional(),
  }),
  content: z.lazy(() => InlineContentSchema).optional(),
});

export interface TiptapHeading {
  type: 'heading';
  attrs: { level: 1 | 2 | 3; id?: string };
  content?: TiptapTextNode[];
}

// List Item
export const ListItemNodeSchema: z.ZodType<TiptapListItem> = z.object({
  type: z.literal('listItem'),
  attrs: z.object({
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    z.lazy(() => BulletListNodeSchema),
    z.lazy(() => OrderedListNodeSchema),
  ]))).optional(),
});

export interface TiptapListItem {
  type: 'listItem';
  attrs?: { id?: string };
  content?: (TiptapParagraph | TiptapBulletList | TiptapOrderedList)[];
}

// Bullet List
export const BulletListNodeSchema: z.ZodType<TiptapBulletList> = z.object({
  type: z.literal('bulletList'),
  attrs: z.object({
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(ListItemNodeSchema)).optional(),
});

export interface TiptapBulletList {
  type: 'bulletList';
  attrs?: { id?: string };
  content?: TiptapListItem[];
}

// Ordered List
export const OrderedListNodeSchema: z.ZodType<TiptapOrderedList> = z.object({
  type: z.literal('orderedList'),
  attrs: z.object({
    start: z.number().optional(),
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(ListItemNodeSchema)).optional(),
});

export interface TiptapOrderedList {
  type: 'orderedList';
  attrs?: { start?: number; id?: string };
  content?: TiptapListItem[];
}

// Blockquote
export const BlockquoteNodeSchema: z.ZodType<TiptapBlockquote> = z.object({
  type: z.literal('blockquote'),
  attrs: z.object({
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
});

export interface TiptapBlockquote {
  type: 'blockquote';
  attrs?: { id?: string };
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// Code Block
export const CodeBlockNodeSchema: z.ZodType<TiptapCodeBlock> = z.object({
  type: z.literal('codeBlock'),
  attrs: z.object({
    language: z.string().nullable().optional(),
    id: z.string().optional(),
  }).optional(),
  content: z.lazy(() => InlineContentSchema).optional(),
});

export interface TiptapCodeBlock {
  type: 'codeBlock';
  attrs?: { language?: string | null; id?: string };
  content?: TiptapTextNode[];
}

// Horizontal Rule
export const HorizontalRuleNodeSchema = z.object({
  type: z.literal('horizontalRule'),
});

export interface TiptapHorizontalRule {
  type: 'horizontalRule';
}

// Hard Break
export const HardBreakNodeSchema = z.object({
  type: z.literal('hardBreak'),
});

export interface TiptapHardBreak {
  type: 'hardBreak';
}

// Image
export const ImageNodeSchema = z.object({
  type: z.literal('image'),
  attrs: z.object({
    src: z.string(),
    alt: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    id: z.string().optional(),
  }),
});

export interface TiptapImage {
  type: 'image';
  attrs: { src: string; alt?: string | null; title?: string | null; id?: string };
}

// Video (custom node)
export const VideoNodeSchema = z.object({
  type: z.literal('video'),
  attrs: z.object({
    src: z.string(),
    poster: z.string().nullable().optional(),
    id: z.string().optional(),
  }),
});

export interface TiptapVideo {
  type: 'video';
  attrs: { src: string; poster?: string | null; id?: string };
}

// =============================================================================
// CUSTOM THINKFORGE BLOCK SCHEMAS
// =============================================================================

// ActionBlock - represents action/instruction content
export const ActionBlockNodeSchema: z.ZodType<TiptapActionBlock> = z.object({
  type: z.literal('actionBlock'),
  attrs: z.object({
    id: z.string().optional(),
    role: z.string().optional(),
    goal: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
});

export interface TiptapActionBlock {
  type: 'actionBlock';
  attrs?: { id?: string; role?: string; goal?: string };
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// WhyBlock - represents explanation/reasoning content
export const WhyBlockNodeSchema: z.ZodType<TiptapWhyBlock> = z.object({
  type: z.literal('whyBlock'),
  attrs: z.object({
    id: z.string().optional(),
    role: z.string().optional(),
    goal: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
});

export interface TiptapWhyBlock {
  type: 'whyBlock';
  attrs?: { id?: string; role?: string; goal?: string };
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// ExampleBlock - represents example/code content
export const ExampleBlockNodeSchema: z.ZodType<TiptapExampleBlock> = z.object({
  type: z.literal('exampleBlock'),
  attrs: z.object({
    id: z.string().optional(),
    language: z.string().nullable().optional(),
    role: z.string().optional(),
    goal: z.string().optional(),
  }).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    CodeBlockNodeSchema,
  ]))).optional(),
});

export interface TiptapExampleBlock {
  type: 'exampleBlock';
  attrs?: { id?: string; language?: string | null; role?: string; goal?: string };
  content?: (TiptapParagraph | TiptapCodeBlock)[];
}

// =============================================================================
// DOCUMENT SCHEMA
// =============================================================================

// Block-level content that can appear at the top level of a document
export const BlockContentSchema = z.union([
  ParagraphNodeSchema,
  HeadingNodeSchema,
  BulletListNodeSchema,
  OrderedListNodeSchema,
  BlockquoteNodeSchema,
  CodeBlockNodeSchema,
  HorizontalRuleNodeSchema,
  ImageNodeSchema,
  VideoNodeSchema,
  ActionBlockNodeSchema,
  WhyBlockNodeSchema,
  ExampleBlockNodeSchema,
]);

export type TiptapBlockContent = z.infer<typeof BlockContentSchema>;

// Document root node
export const DocNodeSchema: z.ZodType<TiptapDoc> = z.object({
  type: z.literal('doc'),
  content: z.array(BlockContentSchema).optional(),
});

export interface TiptapDoc {
  type: 'doc';
  content?: TiptapBlockContent[];
}

// =============================================================================
// COMPLETE TIPTAP JSON SCHEMA
// =============================================================================

/**
 * Complete Tiptap JSON AST schema for ThinkForge scripts.
 * This is the canonical format for all script content.
 */
export const TiptapJSONSchema = DocNodeSchema;

export type TiptapJSON = z.infer<typeof TiptapJSONSchema>;

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Node types that are valid in ThinkForge scripts
 */
export type TiptapNodeType = 
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'hardBreak'
  | 'image'
  | 'video'
  | 'actionBlock'
  | 'whyBlock'
  | 'exampleBlock'
  | 'text';

/**
 * Mark types supported in ThinkForge scripts
 */
export type TiptapMarkType = 
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'link';

/**
 * Custom ThinkForge block types
 */
export type ThinkForgeBlockType = 'actionBlock' | 'whyBlock' | 'exampleBlock';

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an empty Tiptap document
 */
export function createEmptyDoc(): TiptapDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [],
      },
    ],
  };
}

/**
 * Create a text node with optional marks
 */
export function createTextNode(text: string, marks?: TiptapMark[]): TiptapTextNode {
  const node: TiptapTextNode = { type: 'text', text };
  if (marks && marks.length > 0) {
    node.marks = marks;
  }
  return node;
}

/**
 * Create a paragraph node
 */
export function createParagraph(content: TiptapTextNode[], id?: string): TiptapParagraph {
  const node: TiptapParagraph = { type: 'paragraph', content };
  if (id) {
    node.attrs = { id };
  }
  return node;
}

/**
 * Create a heading node
 */
export function createHeading(level: 1 | 2 | 3, content: TiptapTextNode[], id?: string): TiptapHeading {
  return {
    type: 'heading',
    attrs: { level, ...(id ? { id } : {}) },
    content,
  };
}

/**
 * Create an action block
 */
export function createActionBlock(
  content: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[],
  attrs?: { id?: string; role?: string; goal?: string }
): TiptapActionBlock {
  return {
    type: 'actionBlock',
    attrs,
    content,
  };
}

/**
 * Create a why block
 */
export function createWhyBlock(
  content: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[],
  attrs?: { id?: string; role?: string; goal?: string }
): TiptapWhyBlock {
  return {
    type: 'whyBlock',
    attrs,
    content,
  };
}

/**
 * Create an example block
 */
export function createExampleBlock(
  content: (TiptapParagraph | TiptapCodeBlock)[],
  attrs?: { id?: string; language?: string | null; role?: string; goal?: string }
): TiptapExampleBlock {
  return {
    type: 'exampleBlock',
    attrs,
    content,
  };
}

/**
 * Create a bullet list
 */
export function createBulletList(items: TiptapListItem[], id?: string): TiptapBulletList {
  const node: TiptapBulletList = { type: 'bulletList', content: items };
  if (id) {
    node.attrs = { id };
  }
  return node;
}

/**
 * Create an ordered list
 */
export function createOrderedList(items: TiptapListItem[], start?: number, id?: string): TiptapOrderedList {
  return {
    type: 'orderedList',
    attrs: { ...(start ? { start } : {}), ...(id ? { id } : {}) },
    content: items,
  };
}

/**
 * Create a list item
 */
export function createListItem(content: (TiptapParagraph | TiptapBulletList | TiptapOrderedList)[], id?: string): TiptapListItem {
  const node: TiptapListItem = { type: 'listItem', content };
  if (id) {
    node.attrs = { id };
  }
  return node;
}

/**
 * Create a blockquote
 */
export function createBlockquote(
  content: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[],
  id?: string
): TiptapBlockquote {
  const node: TiptapBlockquote = { type: 'blockquote', content };
  if (id) {
    node.attrs = { id };
  }
  return node;
}

/**
 * Create a code block
 */
export function createCodeBlock(content: TiptapTextNode[], language?: string | null, id?: string): TiptapCodeBlock {
  return {
    type: 'codeBlock',
    attrs: { language, ...(id ? { id } : {}) },
    content,
  };
}

/**
 * Create a horizontal rule
 */
export function createHorizontalRule(): TiptapHorizontalRule {
  return { type: 'horizontalRule' };
}

/**
 * Create a hard break
 */
export function createHardBreak(): TiptapHardBreak {
  return { type: 'hardBreak' };
}

/**
 * Create an image node
 */
export function createImage(src: string, alt?: string | null, title?: string | null, id?: string): TiptapImage {
  return {
    type: 'image',
    attrs: { src, alt, title, ...(id ? { id } : {}) },
  };
}

/**
 * Create a video node
 */
export function createVideo(src: string, poster?: string | null, id?: string): TiptapVideo {
  return {
    type: 'video',
    attrs: { src, poster, ...(id ? { id } : {}) },
  };
}
