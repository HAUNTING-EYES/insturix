import type { UnifiedBrand } from "@/lib/shared/brand-registry";

type MetadataRecord = Record<string, unknown>;

export interface ClickatronPromptContextInput {
  prompt: string;
  metadata?: MetadataRecord | null;
  brandContextBlock?: string | null;
}

export interface BrandContextResolverDeps {
  getBrand?: (userId: string, brandId: string) => Promise<UnifiedBrand | null>;
  formatBrand?: (brand: UnifiedBrand | null) => string;
}

const MAX_FIELD_LENGTH = 700;
const MAX_PROMPT_LENGTH = 6000;
const PROJECT_META_FIELDS = [
  ["idea", "Idea"],
  ["purpose", "Purpose"],
  ["style", "Style"],
  ["format", "Format"],
  ["platform", "Platform"],
  ["tone", "Tone"],
  ["sessionName", "Session"],
  ["brandBrief", "Brand brief"],
  ["clientId", "Client ID"],
  ["clientName", "Client"],
  ["campaignId", "Campaign ID"],
  ["campaignName", "Campaign"],
  ["seriesId", "Series"],
  ["calendarItemId", "Calendar item"],
  ["contentCardId", "Content card"],
] as const;
const PROMPT_CONTEXT_KEYWORD_STOPWORDS = new Set([
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

function asRecord(value: unknown): MetadataRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MetadataRecord)
    : null;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > MAX_FIELD_LENGTH
    ? `${normalized.slice(0, MAX_FIELD_LENGTH - 3)}...`
    : normalized;
}

function pushField(lines: string[], label: string, value: unknown): void {
  const text = cleanText(value);
  if (text) lines.push(`${label}: ${text}`);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function conceptKeywords(value: unknown, limit = 12): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  const counts = new Map<string, number>();
  for (const match of text.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{2,}\b/g)) {
    const word = match[0];
    if (PROMPT_CONTEXT_KEYWORD_STOPWORDS.has(word)) continue;
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

function pushConceptField(lines: string[], label: string, value: unknown): void {
  const keywords = conceptKeywords(value);
  if (keywords) lines.push(`${label}: ${keywords}`);
}

function summarizeTextLayers(value: unknown, textPolicy: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const exposeExactCopy = cleanText(textPolicy) === "minimal_generated_text";
  const layers = value
    .map((entry) => {
      const layer = asRecord(entry);
      const text = cleanText(layer?.text);
      if (!text) return undefined;
      const role = cleanText(layer?.role) || "text";
      if (!exposeExactCopy) {
        const maxLines = typeof layer?.maxLines === "number" ? `, max ${layer.maxLines} lines` : "";
        return `${role} layer planned (${countWords(text)} words${maxLines}; exact copy withheld from raster prompt)`;
      }
      return role ? `${role}: ${text}` : text;
    })
    .filter(Boolean);
  return layers.length > 0 ? layers.join(" | ") : undefined;
}

function summarizeSlides(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const slides = value
    .map((entry) => {
      const slide = asRecord(entry);
      const index = typeof slide?.index === "number" ? slide.index + 1 : undefined;
      const prompt = cleanText(slide?.imagePrompt);
      if (!prompt) return undefined;
      const title = cleanText(slide?.title);
      return `Slide ${index ?? "?"}${title ? ` (${title})` : ""}: ${prompt}`;
    })
    .filter(Boolean);
  return slides.length > 0 ? slides.join(" | ") : undefined;
}

export function resolveClickatronPromptBrandId(
  brandId: unknown,
  metadata?: MetadataRecord | null,
): string | undefined {
  const directBrandId = cleanText(brandId);
  if (directBrandId) return directBrandId;

  const sourceContext = asRecord(metadata?.sourceContext);
  return cleanText(sourceContext?.brandId);
}

export async function resolveClickatronBrandContextBlock(
  userId: string,
  brandId: string | undefined,
  deps: BrandContextResolverDeps = {},
): Promise<string> {
  const resolvedBrandId = cleanText(brandId);
  if (!resolvedBrandId) return "";

  const [{ getUnifiedBrand }, { buildBrandContextBlock }] = deps.getBrand && deps.formatBrand
    ? [{ getUnifiedBrand: deps.getBrand }, { buildBrandContextBlock: deps.formatBrand }]
    : await Promise.all([
      import("@/lib/shared/brand-registry"),
      import("@/lib/shared/brand-context-block"),
    ]);
  const getBrand = deps.getBrand ?? getUnifiedBrand;
  const formatBrand = deps.formatBrand ?? buildBrandContextBlock;
  const brand = await getBrand(userId, resolvedBrandId);
  return formatBrand(brand).trim();
}

export function buildClickatronSourceContextBlock(metadata?: MetadataRecord | null): string {
  const safeMetadata = asRecord(metadata);
  if (!safeMetadata) return "";

  const sourceContext = asRecord(safeMetadata.sourceContext);
  const thinkforge = asRecord(safeMetadata.thinkforge);
  const script = asRecord(thinkforge?.script);
  const projectMeta = asRecord(thinkforge?.projectMeta);
  const clickatron = asRecord(safeMetadata.clickatron);
  const creativeSpec = asRecord(clickatron?.creativeSpec);
  const creativeBrief = asRecord(creativeSpec?.creativeBrief);
  const userIntent = asRecord(creativeSpec?.userIntent);
  const renderPlan = asRecord(creativeSpec?.renderPlan);
  const validation = asRecord(creativeSpec?.validation);

  const lines: string[] = ["<clickatron_source_context>"];
  pushField(lines, "Handoff", safeMetadata.handoff);
  pushField(lines, "Source service", sourceContext?.sourceService);
  pushField(lines, "Script title", script?.title);
  pushField(lines, "Thumbnail title", clickatron?.title);
  pushField(lines, "Aspect ratio", clickatron?.aspectRatio);
  pushField(lines, "Creative kind", creativeSpec?.kind);
  pushField(lines, "Asset intent", creativeSpec?.assetIntent);
  pushField(lines, "Platform", creativeSpec?.platform);
  pushField(lines, "Validation status", validation?.status);
  pushField(lines, "Creative objective", creativeBrief?.objective);
  pushConceptField(lines, "Core message concepts", creativeBrief?.coreMessage);
  pushConceptField(lines, "Hook concepts", creativeBrief?.hook);
  pushField(lines, "Audience", creativeBrief?.audience);
  pushConceptField(lines, "CTA concepts", creativeBrief?.cta);
  pushField(lines, "Visual metaphor", creativeBrief?.visualMetaphor);
  pushField(lines, "Visual mode", userIntent?.visualMode);
  pushField(lines, "Text density", userIntent?.textDensity);
  pushField(lines, "Image prompt", renderPlan?.imagePrompt);
  pushField(lines, "Layout intent", renderPlan?.layoutIntent);
  pushField(lines, "Text policy", renderPlan?.textPolicy);
  const textLayerSummary = summarizeTextLayers(renderPlan?.textLayers, renderPlan?.textPolicy);
  pushField(lines, "Text layers", textLayerSummary);
  if (textLayerSummary) {
    lines.push("Text-layer copy handling: exact copy is metadata only; do not rasterize it in the generated image.");
  }
  pushField(lines, "Carousel slides", summarizeSlides(renderPlan?.slides));

  if (projectMeta) {
    for (const [key, label] of PROJECT_META_FIELDS) {
      pushField(lines, label, projectMeta[key]);
    }
  }

  if (lines.length === 1) return "";
  lines.push("</clickatron_source_context>");
  return lines.join("\n");
}

export function buildClickatronGenerationPrompt(input: ClickatronPromptContextInput): string {
  const prompt = input.prompt.trim();
  const sourceContextBlock = buildClickatronSourceContextBlock(input.metadata);
  const brandContextBlock = input.brandContextBlock?.trim() || "";
  const contextBlocks = [sourceContextBlock, brandContextBlock].filter(Boolean);

  if (contextBlocks.length === 0) return prompt;

  const enriched = [
    ...contextBlocks,
    "<clickatron_thumbnail_request>",
    prompt,
    "</clickatron_thumbnail_request>",
    "<clickatron_generation_rules>",
    "Use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.",
    "Generate the raster image as a text-free visual/background, not a finished poster with baked-in copy.",
    "Do not render readable words, letters, numbers, headings, body copy, CTA text, labels, UI text, watermarks, signatures, or logo text.",
    "Use Clickatron text-layer summaries only to reserve safe zones; exact copy is added later as editable overlays.",
    "If the request contains long post, caption, or script copy, treat it as meaning and layout intent, not as words to draw.",
    "Do not invent logos, trademarks, mascots, product packs, or brand assets unless the prompt or reference images explicitly provide them.",
    "Do not render source IDs or internal metadata text in the thumbnail.",
    "</clickatron_generation_rules>",
  ].join("\n\n");

  return enriched.length > MAX_PROMPT_LENGTH
    ? `${enriched.slice(0, MAX_PROMPT_LENGTH - 3)}...`
    : enriched;
}
