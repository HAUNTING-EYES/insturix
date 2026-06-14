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
  ["brandId", "Brand ID"],
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

  const lines: string[] = ["<clickatron_source_context>"];
  pushField(lines, "Handoff", safeMetadata.handoff);
  pushField(lines, "Source service", sourceContext?.sourceService);
  pushField(lines, "Script title", script?.title);
  pushField(lines, "Thumbnail title", clickatron?.title);
  pushField(lines, "Aspect ratio", clickatron?.aspectRatio);

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
    "Use source and brand context for concept, composition, typography, color, tone, and audience fit.",
    "Do not invent logos, trademarks, mascots, product packs, or brand assets unless the prompt or reference images explicitly provide them.",
    "Do not render source IDs or internal metadata text in the thumbnail.",
    "</clickatron_generation_rules>",
  ].join("\n\n");

  return enriched.length > MAX_PROMPT_LENGTH
    ? `${enriched.slice(0, MAX_PROMPT_LENGTH - 3)}...`
    : enriched;
}
