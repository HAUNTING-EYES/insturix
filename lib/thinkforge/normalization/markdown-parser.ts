import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, type ThinkForgeBlock } from '../schemas/thinkforge-block';

/**
 * Parse Markdown into ThinkForge blocks using only:
 * - H2 (##) and H3 (###) headings
 * - Double-newline paragraph breaks
 *
 * Preserves text exactly as written.
 */
export function parseMarkdownToBlocks(markdown: string): ThinkForgeBlock[] {
  if (!markdown || typeof markdown !== 'string') return [];

  const blocks: ThinkForgeBlock[] = [];
  const lines = markdown.split('\n');
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join('\n');
    if (text.length === 0) {
      paragraphBuffer = [];
      return;
    }
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'paragraph',
      content: normalizeThinkForgeRichText([{ type: 'text', text, styles: {} }]),
    });
    paragraphBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      flushParagraph();
      const text = line.slice(4);
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText([{ type: 'text', text, styles: {} }]),
        meta: { level: 3 },
      });
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      const text = line.slice(3);
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText([{ type: 'text', text, styles: {} }]),
        meta: { level: 2 },
      });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  return blocks;
}
