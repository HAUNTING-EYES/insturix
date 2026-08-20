import type { EffectiveBrandResolution } from "@/lib/shared/brand-effective-resolver";
import type { UnifiedBrand } from "@/lib/shared/brand-registry";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";
import { sanitizeVisualPrompt } from "@/lib/clickatron/sanitize-visual-prompt";
import {
  compileClickatronGenerationPrompt,
  type ClickatronGenerationPromptMode,
  type ClickatronGenerationPromptSegment,
} from "@/lib/clickatron/generation-prompt-compiler";

type MetadataRecord = Record<string, unknown>;

export interface ClickatronPromptContextInput {
  prompt: string;
  metadata?: MetadataRecord | null;
  brandContextBlock?: string | null;
  /** Model the user picked. Decides in-image text rendering on the default text policy (C2). */
  modelId?: string | null;
  /** Aspect ratio of the canvas to explicitly steer compositional framing */
  aspectRatio?: string | null;
  /** True only when the worker resolved accepted Brand Vault logo evidence. */
  logoEvidenceAvailable?: boolean;
  /** Actual payload mode. Image edit/inpainting reserve their provider preamble. */
  generationMode?: ClickatronGenerationPromptMode;
}

export interface BrandContextResolverDeps {
  getBrand?: (userId: string, brandId: string) => Promise<UnifiedBrand | null>;
  getBrandResolution?: (userId: string, brandId: string) => Promise<EffectiveBrandResolution>;
  formatBrand?: (brand: UnifiedBrand | null) => string;
  formatBrandResolution?: (resolution: EffectiveBrandResolution) => string;
}

const MAX_FIELD_LENGTH = 700;
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

// pushGroundingList is defined below (next to pushListField). Merge note: main (a1c8a7de) and
// this branch each added an identical copy; kept the one below, removed this duplicate (TS2393).

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function summarizeTextLayers(value: unknown, exposeExactCopy: boolean): string | undefined {
  if (!Array.isArray(value)) return undefined;
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
      const rawPrompt = cleanText(slide?.imagePrompt);
      const prompt = rawPrompt ? sanitizeVisualPrompt(rawPrompt).clean : undefined;
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
  orgId?: string | null,
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

  return (await formatClickatronBrandResolution(await resolveDefaultClickatronBrandResolution(userId, resolvedBrandId, orgId), deps)).trim();
}

async function resolveDefaultClickatronBrandResolution(
  userId: string,
  brandId: string,
  orgId?: string | null,
): Promise<EffectiveBrandResolution> {
  const { resolveEffectiveBrandWithProfile } = await import("@/lib/shared/brand-effective-resolver");
  // orgId is included only when the caller provides it (the worker passes task.orgId; the
  // deps-injection test path omits it, keeping the resolver call shape backward-compatible).
  return resolveEffectiveBrandWithProfile(userId, brandId, {
    service: "clickatron",
    ...(orgId !== undefined ? { orgId } : {}),
  });
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

export function buildClickatronSourceContextBlock(metadata?: MetadataRecord | null, modelId?: string | null): string {
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
  pushField(lines, "Audience", creativeBrief?.audience);
  pushField(lines, "Visual metaphor", creativeBrief?.visualMetaphor);
  // NOTE: coreMessage / hook / cta are COPY (words), not scene direction. They used to be
  // pushed as frequency-sorted keyword bags ("Core message concepts: businesses, campaigns,
  // …"), which a text-capable model then baked into the image as literal word-salad (prod
  // 2026-07-05). Copy belongs on the editable overlay layer / real text-layers, never as a
  // keyword bag in the raster prompt. The scene is driven by Image prompt + Visual metaphor +
  // Key claims (evoke, do not render). [R6]
  // Grounding fields the contract carries but the prompt builder used to drop:
  // keyClaims = proof points the image should EVOKE as concept (image stays text-free);
  // brand.hardConstraints/softPreferences = brand rules. See clickatron-creative-contract.ts:193-202.
  pushGroundingList(lines, "Key claims to evoke visually (do not render as text)", creativeBrief?.keyClaims);
  const brand = asRecord(creativeSpec?.brand);
  pushGroundingList(lines, "Brand hard constraints (must respect)", brand?.hardConstraints);
  pushGroundingList(lines, "Brand style preferences", brand?.softPreferences);
  pushField(lines, "Visual mode", userIntent?.visualMode);
  pushField(lines, "Text density", userIntent?.textDensity);
  pushField(lines, "Image prompt", typeof renderPlan?.imagePrompt === "string" ? sanitizeVisualPrompt(renderPlan.imagePrompt).clean : renderPlan?.imagePrompt);
  pushField(lines, "Layout intent", renderPlan?.layoutIntent);
  pushField(lines, "Text policy", renderPlan?.textPolicy);
  const renderTextInImage = shouldRenderTextInImage(renderPlan?.textPolicy, modelId);
  const textLayerSummary = summarizeTextLayers(renderPlan?.textLayers, renderTextInImage);
  pushField(lines, "Text layers", textLayerSummary);
  if (textLayerSummary) {
    lines.push(renderTextInImage
      ? "Text-layer copy handling: render this exact copy accurately and legibly in the image."
      : "Text-layer copy handling: exact copy is metadata only; do not rasterize it in the generated image.");
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

function shouldRenderTextInImage(textPolicy: unknown, modelId?: string | null): boolean {
  if (textPolicy === 'force_render_text') return true;
  if (textPolicy !== 'minimal_generated_text' || !modelId) return false;
  const normalizedModelId = modelId.toLowerCase();
  return normalizedModelId.includes('nano-banana')
    || normalizedModelId.includes('seedream')
    || normalizedModelId.includes('gemini');
}

function parseTextHierarchy(metadata?: MetadataRecord | null): string {
  const creativeSpec = asRecord(asRecord(asRecord(metadata)?.clickatron)?.creativeSpec);
  const renderPlan = asRecord(creativeSpec?.renderPlan);
  const textLayers = renderPlan?.textLayers;

  if (!Array.isArray(textLayers)) return "";

  let orgName = "";
  let eventName = "";
  let tagline = "";
  let dateTime = "";
  let venue = "";
  let footer = "";

  for (const entry of textLayers) {
    const layer = asRecord(entry);
    const role = (cleanText(layer?.role) || "").toLowerCase();
    const text = cleanText(layer?.text) || "";
    if (!text) continue;

    if (role.includes("org") || role.includes("presenter") || role.includes("brand")) orgName = text;
    else if (role.includes("title") || role.includes("event") || role.includes("headline")) eventName = text;
    else if (role.includes("tagline") || role.includes("subtitle")) tagline = text;
    else if (role.includes("date") || role.includes("time") || role.includes("when")) dateTime = text;
    else if (role.includes("venue") || role.includes("location") || role.includes("where")) venue = text;
    else if (role.includes("footer") || role.includes("contact") || role.includes("social")) footer = text;
    else if (!eventName) eventName = text; // fallback
    else if (!tagline) tagline = text;
  }

  const lines: string[] = [];
  if (orgName) lines.push(`LEVEL 1 (organization/presenter line — small, top): ${orgName}`);
  if (eventName) lines.push(`LEVEL 2 (event title/headline — largest, dominant): ${eventName}`);
  if (tagline) lines.push(`LEVEL 3 (optional tagline): ${tagline}`);
  if (dateTime) lines.push(`LEVEL 4 (date + time — medium, high contrast): ${dateTime}`);
  if (venue) lines.push(`LEVEL 5 (venue — medium): ${venue}`);
  if (footer) lines.push(`LEVEL 6 (optional footer): ${footer}`);

  return lines.join("\n");
}
function buildRasterTextDirective(metadata?: MetadataRecord | null, modelId?: string | null): { hierarchy: string } {
  const clickatron = asRecord(asRecord(metadata)?.clickatron);
  const creativeSpec = asRecord(clickatron?.creativeSpec);
  const renderPlan = asRecord(creativeSpec?.renderPlan);
  const hierarchy = parseTextHierarchy(metadata);
  if (hierarchy && shouldRenderTextInImage(renderPlan?.textPolicy, modelId)) {
    return {
      hierarchy,
    };
  }

  return {
    hierarchy: "",
  };
}

function normalizedRawText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizedRawList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => normalizedRawText(item))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items.join('; ') : undefined;
}

function brandContextLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^<\/?[a-z_]+>$/i.test(line));
}

function isRequiredBrandContextLine(line: string): boolean {
  return /^(?:Brand:|BrandVault:|Brand source:|Brand colors:|Typography:|Visual direction:|Voice:|Never use words\/phrases:)/i.test(line);
}

export function buildClickatronGenerationPrompt(input: ClickatronPromptContextInput): string {
  const prompt = sanitizeVisualPrompt(input.prompt).clean.trim();
  const sourceContextBlock = buildClickatronSourceContextBlock(input.metadata, input.modelId);
  const brandContextBlock = input.brandContextBlock?.trim() || "";
  const rasterText = buildRasterTextDirective(input.metadata, input.modelId);
  const metadata = asRecord(input.metadata);
  const clickatron = asRecord(metadata?.clickatron);
  const creativeSpec = asRecord(clickatron?.creativeSpec);
  const creativeBrief = asRecord(creativeSpec?.creativeBrief);
  const creativeBrand = asRecord(creativeSpec?.brand);
  const renderPlan = asRecord(creativeSpec?.renderPlan);
  const projectMeta = asRecord(asRecord(metadata?.thinkforge)?.projectMeta);
  const visualBrief = normalizedRawText(renderPlan?.imagePrompt);
  const layoutIntent = normalizedRawText(renderPlan?.layoutIntent);
  const visualMetaphor = normalizedRawText(creativeBrief?.visualMetaphor);
  const hardConstraints = normalizedRawList(creativeBrand?.hardConstraints);
  const keyClaims = normalizedRawList(creativeBrief?.keyClaims);
  const brandBrief = normalizedRawText(projectMeta?.brandBrief);
  const aspectRatio = normalizedRawText(input.aspectRatio)
    ?? normalizedRawText(creativeSpec?.aspectRatio)
    ?? normalizedRawText(clickatron?.aspectRatio);
  const compactRasterPolicy = rasterText.hierarchy
    ? 'Raster text policy: Render only the exact supplied text hierarchy accurately and legibly; do not invent additional copy.'
    : 'Raster text policy: Do not render readable text, logos, brand marks, watermarks, or interface labels. Generate a text-free raster background and reserve clear safe zones for editable overlays.';
  const allBrandLines = brandContextLines(brandContextBlock);
  const requiredBrandLines = allBrandLines.filter(isRequiredBrandContextLine);
  const optionalBrandLines = allBrandLines.filter((line) => !isRequiredBrandContextLine(line));
  const hasBrandContract = Boolean(brandContextBlock || input.logoEvidenceAvailable || hardConstraints);

  if (!input.modelId && !sourceContextBlock && !brandContextBlock && !aspectRatio) {
    return prompt;
  }

  const segments: ClickatronGenerationPromptSegment[] = [
    { id: 'raster-policy', content: compactRasterPolicy, required: true },
    { id: 'user-intent', content: prompt ? `User request: ${prompt}` : undefined, required: true },
    { id: 'visual-brief', content: visualBrief ? `Visual brief: ${visualBrief}` : undefined, required: true },
    {
      id: 'composition',
      content: [layoutIntent ? `Layout: ${layoutIntent}` : undefined, visualMetaphor ? `Visual metaphor: ${visualMetaphor}` : undefined]
        .filter(Boolean)
        .join(' | '),
      required: true,
    },
    { id: 'aspect-ratio', content: aspectRatio ? `Canvas aspect ratio: ${aspectRatio}` : undefined, required: true },
    { id: 'brand-brief', content: brandBrief ? `Brand brief: ${brandBrief}` : undefined, required: true },
    { id: 'brand-hard-constraints', content: hardConstraints ? `Brand hard constraints: ${hardConstraints}` : undefined, required: true },
    { id: 'visual-claims', content: keyClaims ? `Evoke these claims visually without text: ${keyClaims}` : undefined, required: true },
    {
      id: 'brand-logo-policy',
      content: hasBrandContract
        ? 'Brand integrity: Never invent, redraw, or spell a logo from text. Use accepted Brand Vault logo evidence only; otherwise leave logo-safe space.'
        : undefined,
      required: true,
    },
    { id: 'text-hierarchy', content: rasterText.hierarchy ? `Text hierarchy: ${rasterText.hierarchy}` : undefined, required: true },
    ...requiredBrandLines.map((content, index) => ({
      id: `brand-required-${index}`,
      content,
      required: true,
    })),
    {
      id: 'quality-bar',
      content: 'Quality bar: premium editorial composition, one focal point, clear hierarchy, deliberate negative space; avoid generic templates and stock layouts.',
      required: false,
      priority: 100,
    },
    ...optionalBrandLines.map((content, index) => ({
      id: `brand-optional-${index}`,
      content,
      required: false,
      priority: 80,
    })),
    { id: 'source-context', content: sourceContextBlock, required: false, priority: 20 },
  ];

  return compileClickatronGenerationPrompt({
    modelId: input.modelId,
    generationMode: input.generationMode,
    segments,
  }).prompt;
}
