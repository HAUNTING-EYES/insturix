import type { EffectiveBrandResolution } from "@/lib/shared/brand-effective-resolver";
import type { UnifiedBrand } from "@/lib/shared/brand-registry";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";

type MetadataRecord = Record<string, unknown>;

export interface ClickatronPromptContextInput {
  prompt: string;
  metadata?: MetadataRecord | null;
  brandContextBlock?: string | null;
}

export interface BrandContextResolverDeps {
  getBrand?: (userId: string, brandId: string) => Promise<UnifiedBrand | null>;
  getBrandResolution?: (userId: string, brandId: string) => Promise<EffectiveBrandResolution>;
  formatBrand?: (brand: UnifiedBrand | null) => string;
  formatBrandResolution?: (resolution: EffectiveBrandResolution) => string;
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

  if (deps.getBrandResolution) {
    return (await formatClickatronBrandResolution(await deps.getBrandResolution(userId, resolvedBrandId), deps)).trim();
  }

  if (deps.getBrand) {
    return (await formatClickatronBrandResolution(
      { brand: await deps.getBrand(userId, resolvedBrandId), acceptedProfile: null, source: "legacy" },
      deps,
    )).trim();
  }

  return (await formatClickatronBrandResolution(await resolveDefaultClickatronBrandResolution(userId, resolvedBrandId), deps)).trim();
}

async function resolveDefaultClickatronBrandResolution(
  userId: string,
  brandId: string,
): Promise<EffectiveBrandResolution> {
  const { resolveEffectiveBrandWithProfile } = await import("@/lib/shared/brand-effective-resolver");
  return resolveEffectiveBrandWithProfile(userId, brandId, { service: "clickatron" });
}

async function formatClickatronBrandResolution(
  resolution: EffectiveBrandResolution,
  deps: BrandContextResolverDeps,
): Promise<string> {
  if (deps.formatBrandResolution) return deps.formatBrandResolution(resolution);
  if (resolution.acceptedProfile) {
    return buildClickatronBrandSignalContextBlock(resolution.acceptedProfile, resolution.brand);
  }

  const formatBrand = deps.formatBrand ?? (await import("@/lib/shared/brand-context-block")).buildBrandContextBlock;
  return formatBrand(resolution.brand);
}

function actionableValue<T>(signal: BrandSignal<T> | undefined): T | undefined {
  return signal && isBrandSignalActionable(signal) ? signal.value : undefined;
}

function actionableList(signal: BrandSignal<string[]> | undefined): string[] | undefined {
  const value = actionableValue(signal);
  return value && value.length > 0 ? value : undefined;
}

function pushListField(lines: string[], label: string, values: string[] | undefined): void {
  if (values?.length) lines.push(`${label}: ${values.join(", ")}`);
}

// Join a string[] spec field (e.g. keyClaims, hardConstraints) into one labelled line.
// Distinct from pushListField above (which takes a typed string[]); this takes raw
// untyped metadata values and no-ops on non-arrays/empties, so specs lacking these
// fields are unchanged.
function pushGroundingList(lines: string[], label: string, value: unknown, max = 8): void {
  if (!Array.isArray(value)) return;
  const items = value
    .map((entry) => cleanText(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, max);
  if (items.length > 0) lines.push(`${label}: ${items.join("; ")}`);
}

function pushVisualDirective(
  directives: string[],
  signal: BrandSignal<number> | undefined,
  high: string,
  low: string,
): void {
  if (!signal || !isBrandSignalActionable(signal)) return;
  if (signal.value >= 0.6) directives.push(high);
  else if (signal.value <= 0.4) directives.push(low);
}

function describeClickatronVisualDirectives(profile: BrandSignalProfile): string[] {
  const directives: string[] = [];
  pushVisualDirective(directives, profile.visual.minimalism, "minimal, sparse composition", "visually rich composition");
  pushVisualDirective(directives, profile.visual.densityTolerance, "high information density is allowed", "keep layouts airy and low-density");
  pushVisualDirective(directives, profile.visual.dataVizAffinity, "data, diagram, or dashboard metaphors are on-brand", "avoid chart-heavy visual metaphors");
  pushVisualDirective(directives, profile.visual.expressiveness, "bold expressive visual energy", "restrained visual energy");
  pushVisualDirective(directives, profile.visual.geometryTendency, "geometric and angular forms", "organic and soft forms");
  pushVisualDirective(directives, profile.visual.decorationTolerance, "decorative accents are allowed", "avoid decorative filler");
  pushVisualDirective(directives, profile.visual.cornerRadiusBias, "rounded friendly shape language", "sharp or squared shape language");
  pushVisualDirective(directives, profile.visual.layoutSymmetry, "structured symmetrical layout", "asymmetric editorial layout");
  pushVisualDirective(directives, profile.visual.contrastPreference, "high-contrast composition", "soft low-contrast composition");
  return directives;
}

function buildClickatronBrandSignalContextBlock(
  profile: BrandSignalProfile,
  fallbackBrand: UnifiedBrand | null,
): string {
  const lines: string[] = ["<brand_context>"];
  const brandName = actionableValue(profile.identity.brandName) ?? fallbackBrand?.name ?? "Brand";
  lines.push(`Brand: ${brandName}`);
  lines.push("Brand source: accepted Brand Vault profile");

  const category = actionableValue(profile.identity.category)
    ?? actionableValue(profile.identity.industry)
    ?? fallbackBrand?.visual.industry;
  pushField(lines, "Industry/category", category && category !== "unknown" ? category : undefined);
  pushListField(lines, "Audience", actionableList(profile.identity.audience) ?? (fallbackBrand?.voice.nicheMap ? [fallbackBrand.voice.nicheMap] : undefined));
  pushListField(lines, "Products/services", actionableList(profile.identity.productServices));

  const primary = actionableValue(profile.palette.primary);
  const accent = actionableValue(profile.palette.accent);
  const supporting = actionableList(profile.palette.supporting);
  const paletteParts = [
    primary ? `primary ${primary}` : undefined,
    accent ? `accent ${accent}` : undefined,
    supporting?.length ? `supporting ${supporting.join(", ")}` : undefined,
  ].filter((part): part is string => Boolean(part));
  if (paletteParts.length > 0) lines.push(`Brand colors: ${paletteParts.join("; ")}`);
  else pushListField(lines, "Brand colors", fallbackBrand?.visual.colors);

  const unsafeOnDark = actionableList(profile.palette.unsafeOnDark);
  const unsafeOnLight = actionableList(profile.palette.unsafeOnLight);
  if (unsafeOnDark?.length || unsafeOnLight?.length) {
    lines.push(
      `Contrast cautions: ${[
        unsafeOnDark?.length ? `avoid ${unsafeOnDark.join(", ")} on dark surfaces` : undefined,
        unsafeOnLight?.length ? `avoid ${unsafeOnLight.join(", ")} on light surfaces` : undefined,
      ].filter(Boolean).join("; ")}`,
    );
  }

  pushField(lines, "Typography", actionableValue(profile.typography.raw) ?? fallbackBrand?.visual.typography);
  const visualDirectives = describeClickatronVisualDirectives(profile);
  if (visualDirectives.length) lines.push(`Visual direction: ${visualDirectives.join("; ")}`);

  pushField(lines, "Visual style", fallbackBrand?.visual.visualStyle);
  pushListField(lines, "Preferred hook styles", actionableList(profile.voice.hookArchetypes) ?? fallbackBrand?.voice.hookArchetypes);
  pushListField(lines, "Recurring phrases/structures", actionableList(profile.voice.recurringPhrases) ?? fallbackBrand?.voice.structuralHabits);
  pushListField(lines, "Never use words/phrases", actionableList(profile.voice.killList) ?? fallbackBrand?.voice.killList);

  lines.push("</brand_context>");
  return lines.join("\n");
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
  // Grounding fields the contract carries but the prompt builder used to drop:
  // keyClaims = proof points the image should EVOKE as concept (image stays text-free);
  // brand.hardConstraints/softPreferences = brand rules. See clickatron-creative-contract.ts:193-202.
  pushGroundingList(lines, "Key claims to evoke visually (do not render as text)", creativeBrief?.keyClaims);
  const brand = asRecord(creativeSpec?.brand);
  pushGroundingList(lines, "Brand hard constraints (must respect)", brand?.hardConstraints);
  pushGroundingList(lines, "Brand style preferences", brand?.softPreferences);
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
    "Honor every brand hard constraint from the source context, and treat key claims as visual concepts to evoke through scene and composition, never as text to render.",
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
