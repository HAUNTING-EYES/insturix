import type { EffectiveBrandResolution } from "@/lib/shared/brand-effective-resolver";
import type { UnifiedBrand } from "@/lib/shared/brand-registry";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";
import { modelSupportsTextRendering } from "@/lib/config/clickatron-models";
import { sanitizeVisualPrompt } from "@/lib/clickatron/sanitize-visual-prompt";

type MetadataRecord = Record<string, unknown>;

export interface ClickatronPromptContextInput {
  prompt: string;
  metadata?: MetadataRecord | null;
  brandContextBlock?: string | null;
  /** Model the user picked. Decides in-image text rendering on the default text policy (C2). */
  modelId?: string | null;
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
  const textLayerSummary = summarizeTextLayers(renderPlan?.textLayers, renderPlan?.textPolicy);
  pushField(lines, "Text layers", textLayerSummary);
  if (textLayerSummary) {
    // C2: when the resolved policy/model wants in-image text, the exact copy above is what the
    // model should RENDER; otherwise it stays overlay-only metadata.
    lines.push(shouldRenderTextInImage(renderPlan?.textPolicy, modelId)
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

// C2: read renderPlan.textPolicy off the handoff metadata.
function readClickatronTextPolicy(metadata?: MetadataRecord | null): string | undefined {
  const creativeSpec = asRecord(asRecord(asRecord(metadata)?.clickatron)?.creativeSpec);
  return cleanText(asRecord(creativeSpec?.renderPlan)?.textPolicy);
}

// C2: decide whether generation bakes the supplied copy INTO the image, or keeps the image
// text-free so copy is layered as editable overlays (the historical default). Reality of the
// upstream contract: the only policies anything actually sets are 'no_generated_text' and
// 'editable_text_layers' — 'minimal_generated_text' is contract-valid but currently never
// produced. So the live trigger is the MODEL the user picked: on the default policy a
// text-capable model renders the copy, everything else stays text-free. Explicit policies win.
function shouldRenderTextInImage(textPolicy: unknown, modelId?: string | null): boolean {
  const policy = cleanText(textPolicy);
  if (policy === "no_generated_text") return false; // explicit: never bake text
  if (policy === "minimal_generated_text") return true; // explicit: always bake text
  // editable_text_layers / unset (the default): the user's model pick decides.
  return modelSupportsTextRendering(modelId ?? undefined);
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

export function buildClickatronGenerationPrompt(input: ClickatronPromptContextInput): string {
  const prompt = sanitizeVisualPrompt(input.prompt).clean.trim();
  const sourceContextBlock = buildClickatronSourceContextBlock(input.metadata, input.modelId);
  const brandContextBlock = input.brandContextBlock?.trim() || "";
  const contextBlocks = [sourceContextBlock, brandContextBlock].filter(Boolean);

  if (contextBlocks.length === 0) return prompt;

  const renderTextInImage = shouldRenderTextInImage(readClickatronTextPolicy(input.metadata), input.modelId);
  const textRules = renderTextInImage
    ? [
        "If the source context supplies text-layer copy, render exactly that copy in the image — accurate spelling, brand-appropriate type, high contrast, balanced placement, overlay-safe margins.",
        "Render ONLY the supplied text-layer copy. Do not render key claims, brand taglines, or any other context field as image text unless it is explicitly present in the text-layer copy field.",
        "If no text-layer copy is supplied, keep the image text-free — never invent extra words, captions, UI chrome, watermarks, or logo text.",
      ]
    : [
        "Generate the raster image as a text-free visual/background, not a finished poster with baked-in copy.",
        "Do not render readable words, letters, numbers, headings, body copy, CTA text, labels, UI text, watermarks, signatures, or logo text.",
        "Use Clickatron text-layer summaries only to reserve safe zones; exact copy is added later as editable overlays.",
        "If the request contains long post, caption, or script copy, treat it as meaning and layout intent, not as words to draw.",
      ];

  const textHierarchyContent = parseTextHierarchy(input.metadata);
  const textHierarchyBlock = `<text_hierarchy>
${textHierarchyContent || "No specific text fields provided. Use whitespace, decorative icons, or artistic elements, do not invent text."}
</text_hierarchy>`;

  const styleLock = `<style_lock>
This is a premium, highly artistic graphic-design composition, not a boring or generic photograph. Regardless of how the user describes the scene, render it as:
- A visually pleasing, highly artistic flat/vector-style illustration or bold graphic design, NOT photorealistic photography.
- Incorporate engaging character elements, expressive colors, and rich thematic details that align with the brand and context.
- Use bold gradients, dynamic layouts, and solid-color typography to create an engaging visual weight.
- A textured or stylistic background (paper texture, subtle pattern, or solid color field) rather than a literal environment/location.
- If the user's prompt explicitly describes literal photographic people/scenes, treat this as a description of the MOOD and SUBJECT MATTER to evoke through artistic iconography, character elements, and composition, not as a literal photo brief.
- Strictly adhere to the provided brand colors and contrast cautions to ensure absolute visual harmony.
</style_lock>`;

  const languageGuard = `<language_guard>
Render text in English only, exactly as provided in <text_hierarchy>, regardless of what script the user's original request used or implied. If the user's request included non-English text, do not attempt to render it as image text — flag it for the editable text-overlay layer instead, and use English-language visual/iconographic elements only.
Do not alter spelling, dates, numbers, or capitalization from what was supplied.
</language_guard>`;

  const layoutRules = `<layout_rules>
- Maintain high contrast between text and background at every text zone
- Keep a consistent color palette across illustrations, typography, and background (strictly adhering to the specified brand context)
- Ensure character elements and visual metaphors are central to the composition, making it visually striking and far from boring
- Do not add generic stock-photo-style people, watermarks, or unrelated decorative elements
</layout_rules>`;

  const enriched = [
    `<role>You are an expert graphic design generator creating a bold, modern, and highly artistic composition.</role>`,
    styleLock,
    textHierarchyBlock,
    languageGuard,
    ...contextBlocks,
    `<clickatron_generation_rules>`,
    "Use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.",
    "Honor every brand hard constraint from the source context, and treat key claims as visual concepts to evoke through scene and composition, never as text to render.",
    "If a creative direction in the source context conflicts with a brand hard constraint, the brand hard constraint always takes priority. Adjust the creative concept to satisfy the constraint rather than ignoring it.",
    ...textRules,
    "Do not invent logos, trademarks, mascots, product packs, or brand assets unless the prompt or reference images explicitly provide them.",
    "Do not render source IDs or internal metadata text in the thumbnail.",
    "If a brand context field (colors, typography, visual direction, etc.) is empty or not provided, do not invent a plausible default for it — proceed using only the fields that were actually supplied.",
    `</clickatron_generation_rules>`,
    layoutRules,
    `<clickatron_thumbnail_request>\n${prompt}\n</clickatron_thumbnail_request>`,
    `<output_format>A single flat-design artistic image, portrait orientation, with all specified text rendered exactly and legibly, in the described graphic-design style.</output_format>`
  ].join("\n\n");

  return enriched.length > MAX_PROMPT_LENGTH
    ? `${enriched.slice(0, MAX_PROMPT_LENGTH - 3)}...`
    : enriched;
}
