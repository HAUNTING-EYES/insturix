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
}).catchall(z.unknown());

export const ItalicMarkSchema = z.object({
  type: z.literal('italic'),
}).catchall(z.unknown());

export const UnderlineMarkSchema = z.object({
  type: z.literal('underline'),
}).catchall(z.unknown());

export const StrikeMarkSchema = z.object({
  type: z.literal('strike'),
}).catchall(z.unknown());

export const CodeMarkSchema = z.object({
  type: z.literal('code'),
}).catchall(z.unknown());

export const HighlightMarkSchema = z.object({
  type: z.literal('highlight'),
  attrs: z.object({
    color: z.string().optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());

export const LinkMarkSchema = z.object({
  type: z.literal('link'),
  attrs: z.object({
    href: z.string(),
    target: z.string().optional(),
    rel: z.string().optional(),
    class: z.string().nullable().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());

export const MarkSchema = z.union([
  BoldMarkSchema,
  ItalicMarkSchema,
  UnderlineMarkSchema,
  StrikeMarkSchema,
  CodeMarkSchema,
  HighlightMarkSchema,
  LinkMarkSchema,
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()),
]);

export type TiptapMark = z.infer<typeof MarkSchema>;

// =============================================================================
// TEXT NODE SCHEMA
// =============================================================================

export const TextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
}).catchall(z.unknown());

export type TiptapTextNode = z.infer<typeof TextNodeSchema>;

// =============================================================================
// INLINE CONTENT (text nodes, hard breaks, etc.)
// =============================================================================

// Hard Break
export const HardBreakNodeSchema = z.object({
  type: z.literal('hardBreak'),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.unknown());

export interface TiptapHardBreak {
  type: 'hardBreak';
  attrs?: Record<string, unknown>;
}

// Inline content is an array of text nodes or hard breaks
export const InlineContentSchema = z.array(z.union([
  TextNodeSchema,
  HardBreakNodeSchema,
]));

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
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => InlineContentSchema).optional(),
}).catchall(z.unknown());

export interface TiptapParagraph {
  type: 'paragraph';
  attrs?: Record<string, unknown>;
  content?: (TiptapTextNode | TiptapHardBreak)[];
}

// Heading (levels 1-3)
export const HeadingNodeSchema: z.ZodType<TiptapHeading> = z.object({
  type: z.literal('heading'),
  attrs: z.object({
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }).catchall(z.unknown()),
  content: z.lazy(() => InlineContentSchema).optional(),
}).catchall(z.unknown());

export interface TiptapHeading {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 } & Record<string, unknown>;
  content?: (TiptapTextNode | TiptapHardBreak)[];
}

// List Item
export const ListItemNodeSchema: z.ZodType<TiptapListItem> = z.object({
  type: z.literal('listItem'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
}).catchall(z.unknown());

export interface TiptapListItem {
  type: 'listItem';
  attrs?: Record<string, unknown>;
  content?: (TiptapParagraph | TiptapBulletList | TiptapOrderedList)[];
}

// Bullet List
export const BulletListNodeSchema: z.ZodType<TiptapBulletList> = z.object({
  type: z.literal('bulletList'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(ListItemNodeSchema)).optional(),
}).catchall(z.unknown());

export interface TiptapBulletList {
  type: 'bulletList';
  attrs?: Record<string, unknown>;
  content?: TiptapListItem[];
}

// Ordered List
export const OrderedListNodeSchema: z.ZodType<TiptapOrderedList> = z.object({
  type: z.literal('orderedList'),
  attrs: z.object({
    start: z.number().optional(),
  }).catchall(z.unknown()).optional(),
  content: z.lazy(() => z.array(ListItemNodeSchema)).optional(),
}).catchall(z.unknown());

export interface TiptapOrderedList {
  type: 'orderedList';
  attrs?: { start?: number } & Record<string, unknown>;
  content?: TiptapListItem[];
}

// Blockquote
export const BlockquoteNodeSchema: z.ZodType<TiptapBlockquote> = z.object({
  type: z.literal('blockquote'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
}).catchall(z.unknown());

export interface TiptapBlockquote {
  type: 'blockquote';
  attrs?: Record<string, unknown>;
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// Code Block
export const CodeBlockNodeSchema: z.ZodType<TiptapCodeBlock> = z.object({
  type: z.literal('codeBlock'),
  attrs: z.object({
    language: z.string().nullable().optional(),
  }).catchall(z.unknown()).optional(),
  content: z.lazy(() => InlineContentSchema).optional(),
}).catchall(z.unknown());

export interface TiptapCodeBlock {
  type: 'codeBlock';
  attrs?: { language?: string | null } & Record<string, unknown>;
  content?: (TiptapTextNode | TiptapHardBreak)[];
}

// Horizontal Rule
export const HorizontalRuleNodeSchema = z.object({
  type: z.literal('horizontalRule'),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.unknown());

export interface TiptapHorizontalRule {
  type: 'horizontalRule';
  attrs?: Record<string, unknown>;
}

// Hard Break
// (already updated above)

// Image
export const ImageNodeSchema = z.object({
  type: z.literal('image'),
  attrs: z.object({
    src: z.string(),
    alt: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());

export interface TiptapImage {
  type: 'image';
  attrs: { src: string; alt?: string | null; title?: string | null } & Record<string, unknown>;
}

// Video (custom node)
export const VideoNodeSchema = z.object({
  type: z.literal('video'),
  attrs: z.object({
    src: z.string(),
    poster: z.string().nullable().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());

export interface TiptapVideo {
  type: 'video';
  attrs: { src: string; poster?: string | null } & Record<string, unknown>;
}

// =============================================================================
// CUSTOM THINKFORGE BLOCK SCHEMAS
// =============================================================================

// ActionBlock - represents action/instruction content
export const ActionBlockNodeSchema: z.ZodType<TiptapActionBlock> = z.object({
  type: z.literal('actionBlock'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
}).catchall(z.unknown());

export interface TiptapActionBlock {
  type: 'actionBlock';
  attrs?: Record<string, unknown>;
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// WhyBlock - represents explanation/reasoning content
export const WhyBlockNodeSchema: z.ZodType<TiptapWhyBlock> = z.object({
  type: z.literal('whyBlock'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
  ]))).optional(),
}).catchall(z.unknown());

export interface TiptapWhyBlock {
  type: 'whyBlock';
  attrs?: Record<string, unknown>;
  content?: (TiptapParagraph | TiptapHeading | TiptapBulletList | TiptapOrderedList)[];
}

// ExampleBlock - represents example/code content
export const ExampleBlockNodeSchema: z.ZodType<TiptapExampleBlock> = z.object({
  type: z.literal('exampleBlock'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.lazy(() => z.array(z.union([
    ParagraphNodeSchema,
    CodeBlockNodeSchema,
  ]))).optional(),
}).catchall(z.unknown());

export interface TiptapExampleBlock {
  type: 'exampleBlock';
  attrs?: Record<string, unknown>;
  content?: (TiptapParagraph | TiptapCodeBlock)[];
}

// =============================================================================
// DOCUMENT SCHEMA
// =============================================================================

// Generic block fallback
export const GenericBlockSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(z.unknown()).optional(),
}).catchall(z.unknown());

// Block-level content that can appear at the top level of a document
export const BlockContentSchema = z.union([
  ParagraphNodeSchema,
  HeadingNodeSchema,
  BulletListNodeSchema,
  OrderedListNodeSchema,
  BlockquoteNodeSchema,
  CodeBlockNodeSchema,
  HorizontalRuleNodeSchema,
  HardBreakNodeSchema,
  ImageNodeSchema,
  VideoNodeSchema,
  ActionBlockNodeSchema,
  WhyBlockNodeSchema,
  ExampleBlockNodeSchema,
  GenericBlockSchema, // Fallback for any other node types
]);

export type TiptapBlockContent = z.infer<typeof BlockContentSchema>;

// Document root node
export const DocNodeSchema: z.ZodType<TiptapDoc> = z.object({
  type: z.literal('doc'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(BlockContentSchema).optional(),
}).catchall(z.unknown());

export interface TiptapDoc {
  type: 'doc';
  attrs?: Record<string, unknown>;
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
