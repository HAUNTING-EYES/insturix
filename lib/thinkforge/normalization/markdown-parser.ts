import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, type ThinkForgeBlock, type RichTextNode } from '../schemas/thinkforge-block';

/**
 * Parse inline markdown (**bold**, *italic*) from text into RichTextAST nodes
 * with proper styles applied.
 */
function parseInlineStyles(text: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  // Match ***bold+italic***, **bold**, *italic* — order matters (longest first)
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) {
        nodes.push({ type: 'text', text: beforeText, styles: {} });
      }
    }

    if (match[2]) {
      // ***bold+italic***
      nodes.push({ type: 'text', text: match[2], styles: { bold: true, italic: true } });
    } else if (match[3]) {
      // **bold**
      nodes.push({ type: 'text', text: match[3], styles: { bold: true } });
    } else if (match[4]) {
      // *italic* (single asterisk, but NOT matching inside **)
      nodes.push({ type: 'text', text: match[4], styles: { italic: true } });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      nodes.push({ type: 'text', text: remaining, styles: {} });
    }
  }

  // No matches — return plain text
  if (nodes.length === 0 && text.length > 0) {
    nodes.push({ type: 'text', text, styles: {} });
  }

  return nodes;
}

/**
 * Parse Markdown into ThinkForge blocks.
 *
 * Design principle: Each LINE becomes its own block so that the editor
 * renders proper spacing between elements (shots, visuals, audio cues, etc).
 *
 * Handles:
 * - # / ## / ### headings
 * - Bullet list items (- or * at line start)  → kept as-is for TipTap mapper
 * - Inline **bold** and *italic*
 * - Empty lines → ignored (spacing handled by block separation)
 */
export function parseMarkdownToBlocks(markdown: string): ThinkForgeBlock[] {
  if (!markdown || typeof markdown !== 'string') return [];

  const blocks: ThinkForgeBlock[] = [];
  const lines = markdown.split('\n');

  const H1_RE = /^#\s+(.*)$/;
  const H2_RE = /^##\s+(.*)$/;
  const H3_RE = /^###\s+(.*)$/;
  const BULLET_RE = /^[\-•]\s+(.*)$/;
  const STAR_BULLET_RE = /^\*\s+(?!\*)(.*)$/; // * followed by space, NOT ** (avoid matching bold)
  const NUMBERED_RE = /^\d+[.)]\s+(.*)$/;

  // Collect consecutive bullet/numbered lines into one block
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const listText = listBuffer.join('\n');
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'paragraph',
      content: normalizeThinkForgeRichText(parseInlineStyles(listText)),
    });
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Empty line — flush any pending list
    if (trimmed === '') {
      flushList();
      continue;
    }

    // --- (horizontal rule)
    if (trimmed === '---' || trimmed === '___' || trimmed === '***') {
      flushList();
      continue;
    }

    // Heading detection (H3 first, then H2, then H1)
    let headingMatch;
    if ((headingMatch = H3_RE.exec(trimmed))) {
      flushList();
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText(parseInlineStyles(headingMatch[1])),
        meta: { level: 3 },
      });
      continue;
    }
    if ((headingMatch = H2_RE.exec(trimmed))) {
      flushList();
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText(parseInlineStyles(headingMatch[1])),
        meta: { level: 2 },
      });
      continue;
    }
    if ((headingMatch = H1_RE.exec(trimmed))) {
      flushList();
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText(parseInlineStyles(headingMatch[1])),
        meta: { level: 1 },
      });
      continue;
    }

    // Bullet list line  (- item or • item)
    if (BULLET_RE.test(trimmed) || STAR_BULLET_RE.test(trimmed)) {
      listBuffer.push(trimmed);
      continue;
    }

    // Numbered list line (1. item or 2) item)
    if (NUMBERED_RE.test(trimmed)) {
      listBuffer.push(trimmed);
      continue;
    }

    // Regular text line → flush any pending list, then create its own paragraph
    flushList();
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'paragraph',
      content: normalizeThinkForgeRichText(parseInlineStyles(trimmed)),
    });
  }

  flushList();
  return blocks;
}
