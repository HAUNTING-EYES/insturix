import { thinkForgeBlocksToTiptapJSON } from './mappers/thinkforge-to-tiptap';
import { tiptapJSONToThinkForgeBlocks } from './mappers/tiptap-to-thinkforge';
import { parseMarkdownToBlocks } from './normalization/markdown-parser';
import { validateTiptapJSON } from './schemas/tiptap-validation';
import { validateThinkForgeBlocks, type RichTextAST, type ThinkForgeBlock } from './schemas/thinkforge-block';
import type { TiptapJSON } from './schemas/tiptap-schema';
import { preserveExportMetaForUnchangedBlocks } from './utils/preserve-export-meta';

export interface CanonicalThinkForgeDocumentState {
  richText: TiptapJSON;
  blocks: ThinkForgeBlock[];
  content: string;
}

export class ThinkForgeDocumentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThinkForgeDocumentStateError';
  }
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requireBlocks(value: unknown): ThinkForgeBlock[] {
  if (!Array.isArray(value)) throw new ThinkForgeDocumentStateError('blocks must be an array');
  const validated = validateThinkForgeBlocks(value);
  if (validated.length !== value.length) {
    throw new ThinkForgeDocumentStateError('blocks contain invalid document nodes');
  }
  return validated;
}

function renderInline(nodes: RichTextAST): string {
  return nodes.map((node) => {
    const value = node.type === 'link'
      ? `[${renderInline(node.content || [])}](${node.href || '#'})`
      : node.text || '';
    if (node.type === 'link') return value;
    const styles = node.styles || {};
    let rendered = value;
    if (styles.code) rendered = `\`${rendered}\``;
    if (styles.bold) rendered = `**${rendered}**`;
    if (styles.italic) rendered = `*${rendered}*`;
    if (styles.strike) rendered = `~~${rendered}~~`;
    return rendered;
  }).join('');
}

function renderScene(block: ThinkForgeBlock): string {
  const lines: string[] = [];
  const narration = renderInline(block.content).trim();
  if (narration) lines.push(`**Narration:** ${narration}`);
  if (block.scene?.visualDescription) lines.push(`**Visual:** ${block.scene.visualDescription}`);
  if (block.scene?.onScreenText?.length) lines.push(`**On-screen text:** ${block.scene.onScreenText.join(' | ')}`);
  if (block.scene?.sfxDescription) lines.push(`**SFX:** ${block.scene.sfxDescription}`);
  if (block.scene?.musicDescription) lines.push(`**Music:** ${block.scene.musicDescription}`);
  if (block.scene?.mood) lines.push(`**Mood:** ${block.scene.mood}`);
  return lines.join('\n');
}

export function serializeThinkForgeBlocksToMarkdown(blocks: ThinkForgeBlock[]): string {
  return blocks.map((block) => {
    const text = renderInline(block.content).trim();
    if (block.kind === 'header') {
      const level = Math.min(3, Math.max(1, Number(block.meta?.level) || 2));
      return `${'#'.repeat(level)} ${text}`.trim();
    }
    if (block.kind === 'scene') return renderScene(block);
    return text;
  }).filter(Boolean).join('\n\n');
}

function semanticProjection(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertEquivalent(label: string, left: ThinkForgeBlock[], right: ThinkForgeBlock[]): void {
  const leftProjection = semanticProjection(serializeThinkForgeBlocksToMarkdown(left));
  const rightProjection = semanticProjection(serializeThinkForgeBlocksToMarkdown(right));
  if (leftProjection !== rightProjection) {
    throw new ThinkForgeDocumentStateError(`${label} conflicts with the canonical document`);
  }
}

function assertMarkdownEquivalent(label: string, canonical: string, supplied: string): void {
  if (semanticProjection(canonical) !== semanticProjection(supplied)) {
    throw new ThinkForgeDocumentStateError(`${label} conflicts with the canonical document`);
  }
}

export function normalizeCanonicalThinkForgeDocumentState(
  payload: Record<string, unknown>,
  existingBlocks: ThinkForgeBlock[] = [],
): CanonicalThinkForgeDocumentState {
  const hasRichText = hasOwn(payload, 'richText') && payload.richText !== null && payload.richText !== undefined;
  const hasBlocks = hasOwn(payload, 'blocks');
  const hasContent = hasOwn(payload, 'content');
  if (!hasRichText && !hasBlocks && !hasContent) {
    throw new ThinkForgeDocumentStateError('ReplaceDocument requires richText, blocks, or content');
  }
  if (hasContent && typeof payload.content !== 'string') {
    throw new ThinkForgeDocumentStateError('content must be a string');
  }

  const suppliedBlocks = hasBlocks ? requireBlocks(payload.blocks) : null;
  let richText: TiptapJSON;
  let blocks: ThinkForgeBlock[];

  if (hasRichText) {
    richText = validateTiptapJSON(payload.richText);
    blocks = requireBlocks(tiptapJSONToThinkForgeBlocks(richText));
    if (suppliedBlocks) {
      assertEquivalent('blocks', blocks, suppliedBlocks);
      blocks = preserveExportMetaForUnchangedBlocks(blocks, suppliedBlocks);
    }
  } else if (suppliedBlocks) {
    blocks = suppliedBlocks;
    richText = validateTiptapJSON(thinkForgeBlocksToTiptapJSON(blocks));
  } else {
    blocks = requireBlocks(parseMarkdownToBlocks(String(payload.content || '')));
    richText = validateTiptapJSON(thinkForgeBlocksToTiptapJSON(blocks));
  }

  blocks = preserveExportMetaForUnchangedBlocks(blocks, existingBlocks);
  const content = serializeThinkForgeBlocksToMarkdown(blocks);
  if (typeof payload.content === 'string' && payload.content.trim()) {
    assertMarkdownEquivalent('content', content, payload.content);
  }

  return { richText, blocks, content };
}
