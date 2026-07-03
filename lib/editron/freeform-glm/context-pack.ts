export type FreeformContextOperation = 'generateScene' | 'editElement';
export type FreeformContextPackVersion = 'editron-freeform-context-v1';

export interface FreeformContextSection {
  title: string;
  content: string;
}

export interface FreeformContextPackSummary {
  version: FreeformContextPackVersion;
  cacheKey: string;
  operation: FreeformContextOperation;
  filename: string;
  sectionCount: number;
  charCount: number;
}

export interface FreeformContextPack {
  version: FreeformContextPackVersion;
  cacheKey: string;
  sections: FreeformContextSection[];
  summary: FreeformContextPackSummary;
}

export interface FreeformContextPackInput {
  operation: FreeformContextOperation;
  filename?: string;
  brief?: string;
  brandContext?: string;
  projectContext?: string;
  selectedElementCode?: string;
  selectedElementMarker?: {
    eid: string;
    sourceLoc: string;
  };
  selectedElementTagName?: string;
  allowTagChange?: boolean;
}

const CONTEXT_PACK_VERSION: FreeformContextPackVersion = 'editron-freeform-context-v1';
const DEFAULT_FILENAME = 'FreeformScene.tsx';
const MAX_BRIEF_CHARS = 4_000;
const MAX_BRAND_CONTEXT_CHARS = 6_000;
const MAX_PROJECT_CONTEXT_CHARS = 6_000;
const MAX_ELEMENT_CODE_CHARS = 12_000;

export function buildFreeformContextPack(input: FreeformContextPackInput): FreeformContextPack {
  const filename = input.filename ?? DEFAULT_FILENAME;
  const sections: FreeformContextSection[] = [
    {
      title: 'contract',
      content: [
        'GLM proposes Remotion TSX; Editron validates, instruments, and applies it.',
        'The AST trace layer owns data-eid and data-source-loc for full-scene generation.',
        'Element edits must preserve the selected root marker exactly unless a later patcher replaces it.',
        'Do not use network calls, browser globals, storage, eval, dynamic imports, or external assets.',
      ].join('\n'),
    },
    {
      title: 'allowed-remotion-shape',
      content: [
        'Return compact TSX that imports needed primitives from remotion.',
        'Generated scenes must export one PascalCase component.',
        'Use useCurrentFrame(), useVideoConfig(), and interpolate() or spring() for deterministic motion.',
        'Use Sequence or Series when timing staged content.',
      ].join('\n'),
    },
    {
      title: 'creative-freedom',
      content: [
        'Creativity is open for visual metaphor, layout, palette, typography, copy, rhythm, motion language, density, and mood.',
        'Validators do not judge taste, brand cleverness, beauty, novelty, or narrative quality.',
        'If a validator rejects output, repair the executable contract while preserving the creative intent where possible.',
      ].join('\n'),
    },
    {
      title: 'deterministic-validator-boundary',
      content: [
        'Hard deterministic gates: parseable TSX, safe runtime APIs, Remotion primitive presence, trace ownership, bounded size, and selected-root marker preservation.',
        'Soft creative context: brand voice, project intent, audience, graphic suggestions, pacing preferences, and emotional tone.',
        'Legal claims, brand assets, music licensing, and final publish decisions remain outside GLM authority.',
      ].join('\n'),
    },
  ];

  appendOptionalSection(sections, 'scene-brief', input.brief, MAX_BRIEF_CHARS);
  appendOptionalSection(sections, 'brand-context', input.brandContext, MAX_BRAND_CONTEXT_CHARS);
  appendOptionalSection(sections, 'project-context', input.projectContext, MAX_PROJECT_CONTEXT_CHARS);

  if (input.operation === 'editElement') {
    const marker = input.selectedElementMarker
      ? `marker: data-eid="${input.selectedElementMarker.eid}" data-source-loc="${input.selectedElementMarker.sourceLoc}"`
      : 'marker: not provided';
    const tag = `expected root tag: ${input.selectedElementTagName ?? 'unchanged'}`;
    const tagPolicy = input.allowTagChange ? 'root tag may change' : 'root tag should remain unchanged';

    sections.push({
      title: 'selected-element-policy',
      content: [marker, tag, tagPolicy].join('\n'),
    });
    appendOptionalSection(sections, 'selected-element-code', input.selectedElementCode, MAX_ELEMENT_CODE_CHARS);
  }

  const normalizedSections = sections.map((section) => ({
    title: normalizeTitle(section.title),
    content: normalizeBlock(section.content),
  })).filter((section) => section.content.length > 0);
  const serialized = JSON.stringify({
    version: CONTEXT_PACK_VERSION,
    operation: input.operation,
    filename,
    sections: normalizedSections,
  });
  const cacheKey = `${CONTEXT_PACK_VERSION}:${stableHash(serialized)}`;
  const charCount = normalizedSections.reduce(
    (total, section) => total + section.title.length + section.content.length,
    0,
  );

  return {
    version: CONTEXT_PACK_VERSION,
    cacheKey,
    sections: normalizedSections,
    summary: {
      version: CONTEXT_PACK_VERSION,
      cacheKey,
      operation: input.operation,
      filename,
      sectionCount: normalizedSections.length,
      charCount,
    },
  };
}

export function formatFreeformContextPack(pack: FreeformContextPack): string {
  return [
    'EDITRON FREEFORM CONTEXT PACK',
    `version: ${pack.version}`,
    `cacheKey: ${pack.cacheKey}`,
    `operation: ${pack.summary.operation}`,
    `filename: ${pack.summary.filename}`,
    ...pack.sections.map((section) => (
      `<${section.title}>\n${section.content}\n</${section.title}>`
    )),
  ].join('\n\n');
}

function appendOptionalSection(
  sections: FreeformContextSection[],
  title: string,
  value: string | undefined,
  maxChars: number,
) {
  const normalized = normalizeBlock(value ?? '');
  if (!normalized) return;
  sections.push({
    title,
    content: truncateBlock(normalized, maxChars),
  });
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeBlock(value: string): string {
  return value
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function truncateBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated to ${maxChars} chars]`;
}

function stableHash(value: string): string {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36).padStart(7, '0')}${(h1 >>> 0).toString(36).padStart(7, '0')}`;
}
