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

// ─── Scene Detection ──────────────────────────────────────────────────────

const SCENE_HEADING_RE = /^Scene\s+\d+/i;
const MUSIC_HEADING_RE = /^Music\s+Direction/i;
const LABEL_RE = /^\*\*([^*:]+?):\*\*\s*(.*)/;

const NARRATION_LABELS = /^(narration|voiceover|vo|dialogue|on[- ]?camera|script)$/i;
const VISUAL_LABELS = /^(visual|shot|camera|video)$/i;
const AUDIO_LABELS = /^(audio|music|sfx|sound)$/i;
const TEXT_LABELS = /^(on[- ]?screen\s*text|text\s*overlay|title|caption|super)$/i;
const MOOD_LABELS = /^(mood|tone|feeling|emotion)$/i;

interface SceneCollector {
  title: string;
  narration: string[];
  visual: string[];
  audio: string[];
  onScreenText: string[];
  mood: string[];
  unlabeled: string[];
}

function createSceneBlock(
  collector: SceneCollector,
  helpers: { ensureId: () => string; normalize: typeof normalizeThinkForgeRichText; parseStyles: typeof parseInlineStyles },
): ThinkForgeBlock {
  const narrationText = collector.narration.length > 0
    ? collector.narration.join(' ')
    : collector.unlabeled.join(' ');

  return {
    id: helpers.ensureId(),
    kind: 'scene',
    content: helpers.normalize(helpers.parseStyles(narrationText || '')),
    scene: {
      visualDescription: collector.visual.join(' '),
      subjects: [],
      ...(collector.mood.length > 0 ? { mood: collector.mood.join(', ') } : {}),
      ...(collector.onScreenText.length > 0 ? { onScreenText: collector.onScreenText } : {}),
      ...(collector.audio.length > 0 ? { musicDescription: collector.audio.join(' ') } : {}),
    },
  };
}

function processSceneLine(collector: SceneCollector, trimmedLine: string): void {
  const labelMatch = LABEL_RE.exec(trimmedLine);
  if (labelMatch) {
    const label = labelMatch[1].trim();
    const value = labelMatch[2].trim();
    if (NARRATION_LABELS.test(label)) collector.narration.push(value);
    else if (VISUAL_LABELS.test(label)) collector.visual.push(value);
    else if (AUDIO_LABELS.test(label)) collector.audio.push(value);
    else if (TEXT_LABELS.test(label)) collector.onScreenText.push(value);
    else if (MOOD_LABELS.test(label)) collector.mood.push(value);
    else collector.unlabeled.push(trimmedLine);
  } else if (trimmedLine) {
    collector.unlabeled.push(trimmedLine);
  }
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
  const STAR_BULLET_RE = /^\*\s+(?!\*)(.*)$/;
  const NUMBERED_RE = /^\d+[.)]\s+(.*)$/;

  let listBuffer: string[] = [];
  let currentScene: SceneCollector | null = null;
  let editorialBuffer: string[] | null = null;

  const helpers = { ensureId: ensureThinkForgeBlockId, normalize: normalizeThinkForgeRichText, parseStyles: parseInlineStyles };

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

  const flushScene = () => {
    if (!currentScene) return;
    blocks.push(createSceneBlock(currentScene, helpers));
    currentScene = null;
  };

  const flushEditorial = () => {
    if (!editorialBuffer) return;
    const text = editorialBuffer.join('\n');
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'editorial',
      content: normalizeThinkForgeRichText(parseInlineStyles(text)),
      editorial: { editorialType: 'instrumentation' },
    });
    editorialBuffer = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      flushList();
      continue;
    }

    if (trimmed === '---' || trimmed === '___' || trimmed === '***') {
      flushList();
      continue;
    }

    let headingMatch;
    if ((headingMatch = H3_RE.exec(trimmed))) {
      flushList();
      flushScene();
      flushEditorial();
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
      flushScene();
      flushEditorial();
      const headingText = headingMatch[1];

      if (SCENE_HEADING_RE.test(headingText)) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'header',
          content: normalizeThinkForgeRichText(parseInlineStyles(headingText)),
          meta: { level: 2 },
        });
        currentScene = { title: headingText, narration: [], visual: [], audio: [], onScreenText: [], mood: [], unlabeled: [] };
        continue;
      }

      if (MUSIC_HEADING_RE.test(headingText)) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'header',
          content: normalizeThinkForgeRichText(parseInlineStyles(headingText)),
          meta: { level: 2 },
        });
        editorialBuffer = [];
        continue;
      }

      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText(parseInlineStyles(headingText)),
        meta: { level: 2 },
      });
      continue;
    }
    if ((headingMatch = H1_RE.exec(trimmed))) {
      flushList();
      flushScene();
      flushEditorial();
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText(parseInlineStyles(headingMatch[1])),
        meta: { level: 1 },
      });
      continue;
    }

    if (currentScene) {
      processSceneLine(currentScene, trimmed);
      continue;
    }

    if (editorialBuffer) {
      editorialBuffer.push(trimmed);
      continue;
    }

    if (BULLET_RE.test(trimmed) || STAR_BULLET_RE.test(trimmed)) {
      listBuffer.push(trimmed);
      continue;
    }

    if (NUMBERED_RE.test(trimmed)) {
      listBuffer.push(trimmed);
      continue;
    }

    flushList();
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'paragraph',
      content: normalizeThinkForgeRichText(parseInlineStyles(trimmed)),
    });
  }

  flushList();
  flushScene();
  flushEditorial();
  return blocks;
}
