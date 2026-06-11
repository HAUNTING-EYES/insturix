import type { AgentInput } from '../agents/types';
import {
  normalizeThinkForgeBlockExportMeta,
  type ClickatronCarouselSlideSpec,
  type ClickatronTextLayer,
  type ThinkForgeBlockExportMeta,
} from '../schemas/clickatron-creative-contract';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';

export const THINKFORGE_CLICKATRON_EXPORT_START = 'THINKFORGE_CLICKATRON_EXPORT';
export const THINKFORGE_CLICKATRON_EXPORT_END = 'END_THINKFORGE_CLICKATRON_EXPORT';

const SIDECAR_RE = /<!--\s*THINKFORGE_CLICKATRON_EXPORT\s*([\s\S]*?)\s*END_THINKFORGE_CLICKATRON_EXPORT\s*-->/i;
const SIDECAR_START_RE = /<!--\s*THINKFORGE_CLICKATRON_EXPORT\b/i;

function compactText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('\n').toLowerCase();
}

export function shouldRequestClickatronCreativeSidecar(input: Pick<AgentInput, 'context' | 'userPrompt'>): boolean {
  const text = compactText([
    input.userPrompt,
    input.context.projectSummary,
    input.context.currentScript,
    input.context.systemBrief,
  ]);

  const hasNonVideoCreativeIntent = /\b(post|posts|carousel|carousels|thread|threads|blog|article|newsletter|social|linkedin|instagram|facebook|pinterest|graphic|static creative|ad creative|blog header|x post)\b/.test(text);
  const hasVideoIntent = /\b(video|videos|reel|reels|shorts|youtube video|tiktok video|script|scripts|storyboard|shot list|scene breakdown|b-roll|voiceover|commercial|ugc)\b/.test(text);

  return hasNonVideoCreativeIntent && !hasVideoIntent;
}

export function appendClickatronCreativeSidecarInstruction(input: AgentInput): AgentInput {
  return {
    ...input,
    userPrompt: `${input.userPrompt}

Hidden Clickatron export requirement:
After the visible draft, append exactly one HTML comment in this shape:
<!-- THINKFORGE_CLICKATRON_EXPORT
{ "clickatron": { "...": "valid ClickatronCreativeSpec JSON" } }
END_THINKFORGE_CLICKATRON_EXPORT -->

Rules for the hidden JSON:
- Do not mention this export in the visible copy.
- Use schemaVersion 1.
- Use kind "single_post_visual" for one visual, thread visual, blog header, newsletter graphic, or ad creative.
- Use kind "carousel" only when the requested output is a carousel; include renderPlan.slides for every slide.
- Use source.sourceService "thinkforge" and source.sourceBlockIds ["AUTO"]. The backend replaces AUTO with real block IDs.
- Choose platform from generic, instagram, linkedin, x, facebook, youtube, tiktok, or pinterest.
- Use editable_text_layers unless the user explicitly asks for no text in the image.
- Put exact readable words in renderPlan.textLayers, not inside renderPlan.imagePrompt.
- Keep renderPlan.imagePrompt focused on scene, composition, objects, metaphor, style, mood, and layout.
- Use brand.hardConstraints only for constraints grounded in the prompt or retrieved brand context. Do not invent logo placement, claims, colors, or legal promises.
- If the user's visual preference is unclear, set validation.status to "needs_user_input" and add one concise question in validation.needsUserInput.
- If enough visual direction is present, set validation.status to "ready".
- Do not wrap the hidden JSON in a code fence.`,
  };
}

export function stripClickatronCreativeSidecarText(markdown: string): string {
  const complete = SIDECAR_RE.exec(markdown);
  if (complete?.index !== undefined) {
    return `${markdown.slice(0, complete.index)}${markdown.slice(complete.index + complete[0].length)}`.trimEnd();
  }

  const start = markdown.search(SIDECAR_START_RE);
  if (start === -1) return markdown;
  return markdown.slice(0, start).trimEnd();
}

export function extractRequiredClickatronCreativeSidecar(markdown: string): {
  visibleMarkdown: string;
  exportMeta: ThinkForgeBlockExportMeta;
} {
  const match = SIDECAR_RE.exec(markdown);
  if (!match) {
    throw new Error('ThinkForge Clickatron export sidecar was requested but missing');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (error) {
    throw new Error(`ThinkForge Clickatron export sidecar JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const exportMeta = normalizeThinkForgeBlockExportMeta(parsed);
  if (!exportMeta?.clickatron) {
    throw new Error('ThinkForge Clickatron export sidecar must include exportMeta.clickatron');
  }

  return {
    visibleMarkdown: stripClickatronCreativeSidecarText(markdown),
    exportMeta,
  };
}

function resolveTextLayers(layers: ClickatronTextLayer[] | undefined, fallbackBlockId: string): ClickatronTextLayer[] | undefined {
  if (!layers || layers.length === 0) return undefined;
  return layers.map((layer) => ({
    ...layer,
    sourceBlockId: !layer.sourceBlockId || layer.sourceBlockId === 'AUTO' ? fallbackBlockId : layer.sourceBlockId,
  }));
}

function resolveSlides(slides: ClickatronCarouselSlideSpec[] | undefined, blockIds: string[]): ClickatronCarouselSlideSpec[] | undefined {
  if (!slides || slides.length === 0) return undefined;
  const firstBlockId = blockIds[0];
  return slides.map((slide, index) => {
    const fallbackBlockId = blockIds[Math.min(index, blockIds.length - 1)] ?? firstBlockId;
    const explicitBlockIds = slide.sourceBlockIds?.map((id) => (id === 'AUTO' ? fallbackBlockId : id)).filter(Boolean);
    return {
      ...slide,
      sourceBlockIds: explicitBlockIds && explicitBlockIds.length > 0 ? explicitBlockIds : [fallbackBlockId],
      textLayers: resolveTextLayers(slide.textLayers, fallbackBlockId),
    };
  });
}

export function finalizeClickatronCreativeExportMeta(
  exportMeta: ThinkForgeBlockExportMeta,
  blocks: ThinkForgeBlock[],
  options?: { staleReason?: string },
): ThinkForgeBlockExportMeta {
  if (!exportMeta.clickatron) {
    throw new Error('Cannot finalize Clickatron export metadata without a clickatron spec');
  }
  const blockIds = blocks.map((block) => block.id).filter(Boolean);
  if (blockIds.length === 0) {
    throw new Error('Cannot finalize Clickatron export metadata without ThinkForge block IDs');
  }

  const firstBlockId = blockIds[0];
  const existingIssues = exportMeta.clickatron.validation.issues ?? [];
  const staleIssue = options?.staleReason
    ? [{
        code: options.staleReason,
        message: 'Visible content changed after the Clickatron visual plan was authored; review or regenerate before publishing.',
        severity: 'warning' as const,
      }]
    : [];

  const finalized = normalizeThinkForgeBlockExportMeta({
    clickatron: {
      ...exportMeta.clickatron,
      source: {
        ...exportMeta.clickatron.source,
        sourceService: 'thinkforge',
        sourceBlockIds: blockIds,
      },
      renderPlan: {
        ...exportMeta.clickatron.renderPlan,
        textLayers: resolveTextLayers(exportMeta.clickatron.renderPlan.textLayers, firstBlockId),
        slides: resolveSlides(exportMeta.clickatron.renderPlan.slides, blockIds),
      },
      validation: {
        ...exportMeta.clickatron.validation,
        status: options?.staleReason ? 'stale' : exportMeta.clickatron.validation.status,
        issues: [...existingIssues, ...staleIssue],
      },
    },
  });

  if (!finalized?.clickatron) {
    throw new Error('Finalized Clickatron export metadata is invalid');
  }
  return finalized;
}

export function attachClickatronCreativeExportMeta(
  blocks: ThinkForgeBlock[],
  exportMeta: ThinkForgeBlockExportMeta,
  options?: { staleReason?: string },
): ThinkForgeBlock[] {
  const finalized = finalizeClickatronCreativeExportMeta(exportMeta, blocks, options);
  return validateThinkForgeBlocks(
    blocks.map((block, index) => index === 0 ? { ...block, exportMeta: finalized } : block),
  );
}
