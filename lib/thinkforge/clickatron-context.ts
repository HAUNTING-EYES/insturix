import type { ProjectLink } from "@/lib/shared/project-links";
import {
  CLICKATRON_CREATIVE_SPEC_VERSION,
  CLICKATRON_PLATFORMS,
  CLICKATRON_TEXT_DENSITIES,
  CLICKATRON_VISUAL_MODES,
  normalizeClickatronCreativeSpec,
  type ClickatronCreativeKind,
  type ClickatronCreativeSpec,
  type ClickatronCreativeValidation,
  type ClickatronPlatform,
  type ClickatronTextDensity,
  type ClickatronTextLayer,
  type ClickatronTextPolicy,
  type ClickatronVisualMode,
} from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import type { ProjectMeta } from "@/lib/thinkforge/state/types";

const PROJECT_META_KEYS = [
  "idea",
  "purpose",
  "style",
  "format",
  "platform",
  "tone",
  "sessionName",
  "brandId",
  "brandBrief",
  "clientId",
  "clientName",
  "campaignId",
  "campaignName",
  "seriesId",
  "calendarItemId",
  "contentCardId",
] as const;

export interface ThinkToClickContextInput {
  sessionId: string;
  scriptId?: string;
  projectId?: string;
  projectMeta?: ProjectMeta | null;
  projectLink?: Pick<ProjectLink, "universalId" | "brandId" | "sourceScriptId"> | null;
  creativeSpec?: ClickatronCreativeSpec | null;
  blocks?: ThinkForgeBlock[] | null;
  userVisualChoices?: ThinkToClickVisibleContentChoices | null;
  signalTrace?: unknown;
  writerOutput?: unknown;
  title?: string;
  aspectRatio?: string;
  scenesCount?: number;
}

export interface ThinkToClickVisibleContentChoices {
  kind?: ClickatronCreativeKind;
  platform?: ClickatronPlatform;
  aspectRatio?: string;
  visualMode?: ClickatronVisualMode;
  textDensity?: ClickatronTextDensity;
  vibe?: string;
  imageStyle?: string;
  notes?: string;
}

export interface ThinkToClickSessionDraft {
  prompt: string;
  aspectRatio: string;
  kind: ClickatronCreativeSpec["kind"];
  platform: ClickatronCreativeSpec["platform"];
  assetIntent: ClickatronCreativeSpec["assetIntent"];
  readyToGenerate: boolean;
  validation: ClickatronCreativeValidation;
  metadata: Record<string, unknown>;
}

export interface ThinkToClickContext {
  sourceService: "thinkforge";
  sourceSessionId: string;
  sourceScriptId?: string;
  universalId?: string;
  brandId?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
  sessionDraft?: ThinkToClickSessionDraft;
}

export function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function pickThinkForgeProjectMeta(projectMeta?: ProjectMeta | null): Record<string, unknown> | undefined {
  if (!projectMeta) return undefined;

  const picked = PROJECT_META_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    const value = projectMeta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});

  return Object.keys(picked).length > 0 ? picked : undefined;
}

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}

function toPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  const text = toNonEmptyString(value);
  return text && (values as readonly string[]).includes(text) ? text as T[number] : fallback;
}

export function findClickatronCreativeSpecInBlocks(blocks?: ThinkForgeBlock[] | null): ClickatronCreativeSpec | undefined {
  if (!Array.isArray(blocks)) return undefined;
  for (const block of blocks) {
    const candidate = block.exportMeta?.clickatron;
    if (candidate) {
      return normalizeClickatronCreativeSpec(candidate);
    }
  }
  return undefined;
}

const VISIBLE_CONTENT_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "all",
  "and",
  "are",
  "because",
  "been",
  "but",
  "can",
  "current",
  "every",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "just",
  "more",
  "not",
  "now",
  "one",
  "our",
  "out",
  "that",
  "the",
  "their",
  "this",
  "was",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "without",
  "you",
  "your",
]);

function richTextToPlainText(content: ThinkForgeBlock["content"]): string {
  const parts: string[] = [];
  const walk = (nodes: ThinkForgeBlock["content"]) => {
    for (const node of nodes || []) {
      if (node.text) parts.push(node.text);
      if (node.content?.length) walk(node.content);
    }
  };
  walk(content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function summarizeVisibleBlocks(blocks?: ThinkForgeBlock[] | null) {
  const sourceBlocks = (blocks || [])
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      text: richTextToPlainText(block.content),
      sceneText: block.scene?.visualDescription,
    }))
    .filter((block) => block.id && (block.text || block.sceneText));

  const sourceBlockIds = sourceBlocks.map((block) => block.id);
  const visibleText = sourceBlocks
    .map((block) => block.sceneText || block.text)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    sourceBlocks,
    sourceBlockIds,
    visibleText,
  };
}

function simpleContentHash(value: string): string | undefined {
  if (!value) return undefined;
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `visible_${Math.abs(hash).toString(36)}`;
}

function textSnippet(value: string | undefined, limit = 140): string | undefined {
  const text = toNonEmptyString(value);
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit - 3).trim()}...` : text;
}

function visualKeywords(value: string, limit = 12): string | undefined {
  const counts = new Map<string, number>();
  for (const match of value.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{2,}\b/g)) {
    const word = match[0];
    if (VISIBLE_CONTENT_STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const keywords = [...counts.entries()]
    .sort(([leftWord, leftCount], [rightWord, rightCount]) =>
      rightCount - leftCount || leftWord.localeCompare(rightWord),
    )
    .slice(0, limit)
    .map(([word]) => word);

  return keywords.length > 0 ? keywords.join(", ") : undefined;
}

function visibleTextLayers(
  sourceBlocks: Array<{ id: string; text?: string; sceneText?: string }>,
  textPolicy: ClickatronTextPolicy,
): ClickatronTextLayer[] | undefined {
  if (textPolicy === "no_generated_text") return undefined;
  const layers = sourceBlocks
    .map((block, index) => {
      const text = textSnippet(block.text || block.sceneText, index === 0 ? 96 : 140);
      if (!text) return undefined;
      return {
        id: index === 0 ? "headline" : `body_${index}`,
        text,
        role: index === 0 ? "headline" : "body",
        priority: Math.max(45, 95 - index * 10),
        sourceBlockId: block.id,
        maxLines: index === 0 ? 2 : 4,
        locked: true,
      } satisfies ClickatronTextLayer;
    })
    .filter(Boolean) as ClickatronTextLayer[];
  return layers.length > 0 ? layers : undefined;
}

function buildWriterOutputClickatronCreativeSpec(input: ThinkToClickContextInput, visualPrompts: Record<string, unknown>): ClickatronCreativeSpec | undefined {
  const summary = summarizeVisibleBlocks(input.blocks);
  if (summary.sourceBlockIds.length === 0) return undefined;

  const choices = input.userVisualChoices || {};
  
  const carouselPrompts = Array.isArray(visualPrompts.carouselPrompts) ? visualPrompts.carouselPrompts : [];
  const scenePrompts = Array.isArray(visualPrompts.scenePrompts) ? visualPrompts.scenePrompts : [];
  const singleImagePrompt = typeof visualPrompts.singleImagePrompt === "string" ? visualPrompts.singleImagePrompt : undefined;

  const hasCarousel = carouselPrompts.length > 0;
  const hasScene = scenePrompts.length > 0;
  // ponytail: real writer visual prompt present, vs the placeholder fallbacks below. Drives an honest
  // validation.status instead of a hardcoded "ready". Fact-level grounding (does the prompt carry the
  // brand/offer/price) needs the resolved signal profile wired into this path (Phase 4), then reuse
  // applyContentSignalProfileToClickatronExportMeta.
  const hasRealPrompt = Boolean(singleImagePrompt) || hasCarousel || hasScene;

  let kind: ClickatronCreativeKind = "single_post_visual";
  if (choices.kind) {
    kind = enumValue(choices.kind, ["single_post_visual", "carousel"] as const, "single_post_visual");
  } else if (hasCarousel || hasScene) {
    kind = "carousel";
  }

  const wantsCarousel = kind === "carousel";
  const platform = enumValue(choices.platform, CLICKATRON_PLATFORMS, "generic");
  const aspectRatio = toNonEmptyString(choices.aspectRatio) || toNonEmptyString(input.aspectRatio) || "1:1";
  const visualMode = enumValue(choices.visualMode, CLICKATRON_VISUAL_MODES, "text_forward_graphic");
  const textDensity = enumValue(choices.textDensity, CLICKATRON_TEXT_DENSITIES, "medium");
  const textPolicy: ClickatronTextPolicy = textDensity === "none" ? "no_generated_text" : "editable_text_layers";
  
  const title = toNonEmptyString(input.title);
  const objective = title ? `Create a Clickatron visual for ${title}.` : "Create a Clickatron visual from ThinkForge writer output.";
  const coreMessage = summary.visibleText ? summary.visibleText.slice(0, 240) : "Writer generated visual.";

  let imagePrompt = "";
  if (wantsCarousel) {
    imagePrompt = hasCarousel 
      ? `Carousel overview: Maintain a consistent visual system across slides. ${carouselPrompts[0]}`
      : hasScene
        ? `Video storyboard overview: Maintain a consistent visual style across scenes. ${scenePrompts[0]}`
        : singleImagePrompt 
          ? singleImagePrompt 
          : "Carousel generated from writer output.";
  } else {
    imagePrompt = singleImagePrompt 
      ? singleImagePrompt 
      : hasCarousel && carouselPrompts[0]
        ? carouselPrompts[0] as string
        : hasScene && scenePrompts[0]
          ? scenePrompts[0] as string
          : "Single visual generated from writer output.";
  }

  let slides: any[] | undefined;
  if (wantsCarousel) {
    const promptsArray: string[] = hasCarousel ? carouselPrompts as string[] : hasScene ? scenePrompts as string[] : [];
    if (promptsArray.length > 0) {
      slides = promptsArray.map((promptText, index) => {
        const block = summary.sourceBlocks[index] || summary.sourceBlocks[0];
        const slideTextLayers = block ? visibleTextLayers([block], textPolicy) : undefined;
        return {
          id: `slide_${index + 1}`,
          index,
          title: textSnippet(block?.text || block?.sceneText, 64) || `Slide ${index + 1}`,
          sourceBlockIds: block ? [block.id] : summary.sourceBlockIds,
          imagePrompt: promptText,
          layoutIntent: "Editable slide content layout.",
          ...(slideTextLayers ? { textLayers: slideTextLayers } : {}),
        };
      });
    }
  }

  const rootTextLayers = wantsCarousel ? undefined : visibleTextLayers(summary.sourceBlocks.slice(0, 4), textPolicy);

  return normalizeClickatronCreativeSpec({
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind,
    assetIntent: kind === "carousel" ? "carousel" : "post_graphic",
    platform,
    aspectRatio,
    source: {
      sourceService: "thinkforge",
      sourceSessionId: toNonEmptyString(input.sessionId),
      sourceScriptId: toNonEmptyString(input.scriptId),
      sourceBlockIds: summary.sourceBlockIds,
      contentHash: simpleContentHash(summary.visibleText || imagePrompt),
    },
    userIntent: {
      visualMode,
      textDensity,
      wantsCarousel,
      ...(toNonEmptyString(choices.notes) ? { notes: choices.notes } : {}),
    },
    creativeBrief: {
      objective,
      coreMessage,
      ...(toNonEmptyString(choices.vibe) ? { hook: choices.vibe } : {}),
    },
    renderPlan: {
      textPolicy,
      imagePrompt,
      layoutIntent: wantsCarousel
        ? "Carousel-ready visual language with repeatable slide rhythm."
        : "Single-frame social graphic background.",
      ...(rootTextLayers ? { textLayers: rootTextLayers } : {}),
      ...(slides && slides.length > 0 ? { slides } : {}),
    },
    validation: hasRealPrompt
      ? { status: "ready" }
      : {
          status: "needs_user_input",
          issues: [{
            code: "missing_writer_visual_prompt",
            message: "Writer produced no visual prompt; the image would render from a generic placeholder. Add a visual prompt before sending to Clickatron.",
            severity: "warning",
          }],
        },
  });
}

export function buildVisibleContentClickatronCreativeSpec(input: ThinkToClickContextInput): ClickatronCreativeSpec | undefined {
  const summary = summarizeVisibleBlocks(input.blocks);
  if (summary.sourceBlockIds.length === 0 || !summary.visibleText) return undefined;

  const choices = input.userVisualChoices || {};
  const kind = enumValue(choices.kind, ["single_post_visual", "carousel"] as const, "single_post_visual");
  const platform = enumValue(choices.platform, CLICKATRON_PLATFORMS, "generic");
  const aspectRatio = toNonEmptyString(choices.aspectRatio) || toNonEmptyString(input.aspectRatio) || "1:1";
  const visualMode = enumValue(choices.visualMode, CLICKATRON_VISUAL_MODES, "text_forward_graphic");
  const textDensity = enumValue(choices.textDensity, CLICKATRON_TEXT_DENSITIES, "medium");
  const textPolicy: ClickatronTextPolicy = textDensity === "none" ? "no_generated_text" : "editable_text_layers";
  const wantsCarousel = kind === "carousel";
  const platformLabel = platform === "x" ? "x/twitter" : platform;
  const title = toNonEmptyString(input.title);
  const objective = title ? `Create a Clickatron visual for ${title}.` : "Create a Clickatron visual from visible ThinkForge content.";
  const coreMessage = summary.visibleText.slice(0, 240);
  const keywords = visualKeywords(summary.visibleText);
  const promptBase = kind === "carousel"
    ? `Create a text-free ${platformLabel} carousel visual system based on the ThinkForge content structure.`
    : `Create a text-free ${platformLabel} single-post visual background based on the ThinkForge content structure.`;
  const rootTextLayers = wantsCarousel ? undefined : visibleTextLayers(summary.sourceBlocks.slice(0, 4), textPolicy);

  return normalizeClickatronCreativeSpec({
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind,
    assetIntent: kind === "carousel" ? "carousel" : "post_graphic",
    platform,
    aspectRatio,
    source: {
      sourceService: "thinkforge",
      sourceSessionId: toNonEmptyString(input.sessionId),
      sourceScriptId: toNonEmptyString(input.scriptId),
      sourceBlockIds: summary.sourceBlockIds,
      contentHash: simpleContentHash(summary.visibleText),
    },
    userIntent: {
      visualMode,
      textDensity,
      wantsCarousel,
      ...(toNonEmptyString(choices.notes) ? { notes: choices.notes } : {}),
    },
    creativeBrief: {
      objective,
      coreMessage,
      ...(toNonEmptyString(choices.vibe) ? { hook: choices.vibe } : {}),
    },
    renderPlan: {
      textPolicy,
      imagePrompt: [
        promptBase,
        "Use abstract composition, brand-safe shapes, editorial depth, and clear negative space.",
        keywords ? `Concept keywords to interpret, not draw as text: ${keywords}.` : undefined,
        "Do not render any readable words, letters, logos, UI screenshots, or fake brand marks.",
        choices.imageStyle ? `Image style: ${choices.imageStyle}.` : undefined,
      ].filter(Boolean).join(" "),
      negativePrompt: "readable text, letters, fake logos, watermark, misspelled words, UI screenshots",
      layoutIntent: wantsCarousel
        ? "Carousel-ready visual language with repeatable slide rhythm and strong safe-zone discipline."
        : "Single-frame social graphic background with center-safe composition and room for editable overlay text.",
      ...(rootTextLayers ? { textLayers: rootTextLayers } : {}),
      ...(wantsCarousel ? {
        slides: summary.sourceBlocks.slice(0, 8).map((block, index) => {
          const slideTextLayers = visibleTextLayers([block], textPolicy);
          const slideKeywords = visualKeywords(block.sceneText || block.text || "");
          return {
            id: `slide_${index + 1}`,
            index,
            title: textSnippet(block.text || block.sceneText, 64),
            sourceBlockIds: [block.id],
            imagePrompt: [
              `${promptBase} Slide ${index + 1}: text-free visual variation with consistent brand-safe composition.`,
              slideKeywords ? `Slide concepts to interpret, not draw as text: ${slideKeywords}.` : undefined,
            ].filter(Boolean).join(" "),
            layoutIntent: "Text-free slide background; final copy must be added as editable overlay text.",
            ...(slideTextLayers ? { textLayers: slideTextLayers } : {}),
          };
        }),
      } : {}),
    },
    validation: {
      status: "ready",
      issues: [{
        code: "derived_from_visible_content",
        message: "No hidden Clickatron sidecar was found; derived a text-free visual brief from visible ThinkForge blocks.",
        severity: "warning",
      }],
    },
  });
}

function buildClickatronSessionPrompt(creativeSpec: ClickatronCreativeSpec): string {
  const slideLines = creativeSpec.renderPlan.slides?.map((slide) => {
    return `Slide ${slide.index + 1}: ${slide.imagePrompt}`;
  });
  const textPolicyLine = creativeSpec.renderPlan.textPolicy === "minimal_generated_text"
    ? "Text rendering policy: use only minimal short generated text if unavoidable; prefer editable Clickatron layers."
    : "Text rendering policy: do not rasterize readable text. Exact copy must remain editable Clickatron metadata or be omitted when text density is none.";

  return [
    creativeSpec.renderPlan.imagePrompt,
    textPolicyLine,
    creativeSpec.renderPlan.layoutIntent ? `Layout intent: ${creativeSpec.renderPlan.layoutIntent}` : undefined,
    slideLines && slideLines.length > 0 ? `Carousel slide plan:\n${slideLines.join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

function buildClickatronSessionDraft(
  creativeSpec: ClickatronCreativeSpec | undefined,
  metadata: Record<string, unknown>,
): ThinkToClickSessionDraft | undefined {
  if (!creativeSpec) return undefined;
  return {
    prompt: buildClickatronSessionPrompt(creativeSpec),
    aspectRatio: creativeSpec.aspectRatio,
    kind: creativeSpec.kind,
    platform: creativeSpec.platform,
    assetIntent: creativeSpec.assetIntent,
    readyToGenerate: creativeSpec.validation.status === "ready",
    validation: creativeSpec.validation,
    metadata,
  };
}

export function buildThinkToClickContext(input: ThinkToClickContextInput): ThinkToClickContext {
  const sourceSessionId = toNonEmptyString(input.sessionId);
  if (!sourceSessionId) {
    throw new Error("ThinkForge sessionId is required for Clickatron handoff");
  }

  const sourceScriptId =
    toNonEmptyString(input.scriptId) ||
    toNonEmptyString(input.projectLink?.sourceScriptId);
  const brandId =
    toNonEmptyString(input.projectMeta?.brandId) ||
    toNonEmptyString(input.projectLink?.brandId);
  const universalId = toNonEmptyString(input.projectLink?.universalId);
  const projectId = toNonEmptyString(input.projectId);
  const projectMeta = pickThinkForgeProjectMeta(input.projectMeta);
  const writerOutput = toPlainRecord(input.writerOutput);
  const visualPrompts = writerOutput && typeof writerOutput.visualPrompts === 'object' && writerOutput.visualPrompts !== null
    ? writerOutput.visualPrompts as Record<string, unknown>
    : undefined;

  let creativeSpec: ClickatronCreativeSpec | undefined = undefined;

  if (visualPrompts && (visualPrompts.singleImagePrompt || visualPrompts.carouselPrompts || visualPrompts.scenePrompts)) {
    creativeSpec = buildWriterOutputClickatronCreativeSpec(input, visualPrompts);
  }

  if (!creativeSpec && input.creativeSpec) {
    creativeSpec = normalizeClickatronCreativeSpec(input.creativeSpec);
  }

  if (!creativeSpec) {
    creativeSpec = buildVisibleContentClickatronCreativeSpec(input);
  }

  const signalTrace = toPlainRecord(input.signalTrace);

  const sourceContext = compactRecord({
    sourceService: "thinkforge",
    sourceSessionId,
    sourceScriptId,
    universalId,
    brandId,
    projectId,
  });

  const clickatron = compactRecord({
    title: toNonEmptyString(input.title),
    aspectRatio: toNonEmptyString(creativeSpec?.aspectRatio) || toNonEmptyString(input.aspectRatio),
    scenesCount: typeof input.scenesCount === "number" ? input.scenesCount : undefined,
    creativeSpec,
  });

  const metadata = compactRecord({
    handoff: "think-to-click",
    sourceContext,
    thinkforge: compactRecord({
      sessionId: sourceSessionId,
      scriptId: sourceScriptId,
      projectMeta,
      signalTrace,
      writerOutput,
    }),
    projectLink: universalId ? { universalId } : undefined,
    clickatron: Object.keys(clickatron).length > 0 ? clickatron : undefined,
  });
  const sessionDraft = buildClickatronSessionDraft(creativeSpec, metadata);

  return {
    sourceService: "thinkforge",
    sourceSessionId,
    ...(sourceScriptId ? { sourceScriptId } : {}),
    ...(universalId ? { universalId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(projectId ? { projectId } : {}),
    metadata,
    ...(sessionDraft ? { sessionDraft } : {}),
  };
}
