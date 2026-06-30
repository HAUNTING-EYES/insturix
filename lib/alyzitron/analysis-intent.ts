import type {
  AlyzitronContentIntent,
  AlyzitronIntentResolution,
  AlyzitronIntentSource,
  AlyzitronMediaSourceKind,
} from "@/app/api/services/alyzitron/types";

const CONTENT_INTENTS: readonly AlyzitronContentIntent[] = [
  "own_content",
  "competitor_content",
  "reference_content",
  "unknown",
];

const INTENT_SOURCES: readonly AlyzitronIntentSource[] = [
  "user_selected",
  "system_inferred",
  "defaulted",
  "unknown",
];

const MEDIA_SOURCE_KINDS: readonly AlyzitronMediaSourceKind[] = [
  "file",
  "image",
  "youtube_url",
  "external_url",
  "r2",
  "gcs",
];

const LOCAL_MEDIA_KINDS = new Set<AlyzitronMediaSourceKind>(["file", "image", "r2", "gcs"]);
const EXTERNAL_MEDIA_KINDS = new Set<AlyzitronMediaSourceKind>(["youtube_url", "external_url"]);

export interface ResolveAlyzitronContentIntentInput {
  userSelectedIntent?: unknown;
  contentIntent?: unknown;
  intentSource?: unknown;
  userConfirmedIntent?: unknown;
  intentResolution?: unknown;
  mediaSourceKind?: unknown;
  videoUrl?: unknown;
  sourceUrl?: unknown;
  brandId?: unknown;
  editronProjectId?: unknown;
  metadata?: unknown;
  context?: unknown;
  userText?: unknown;
}

type MetadataRecord = Record<string, unknown>;

function asRecord(value: unknown): MetadataRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MetadataRecord)
    : null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function hasTruthyBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function normalizeAlyzitronContentIntent(value: unknown): AlyzitronContentIntent | undefined {
  const normalized = cleanString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;

  if ((CONTENT_INTENTS as readonly string[]).includes(normalized)) {
    return normalized as AlyzitronContentIntent;
  }

  if (["self", "mine", "my_content", "our_content", "own", "owned", "self_content"].includes(normalized)) {
    return "own_content";
  }
  if (["competitor", "competition", "rival", "rival_content"].includes(normalized)) {
    return "competitor_content";
  }
  if (["reference", "ref", "inspo", "inspiration", "example"].includes(normalized)) {
    return "reference_content";
  }
  if (["unsure", "not_sure", "unknown"].includes(normalized)) {
    return "unknown";
  }

  return undefined;
}

export function normalizeAlyzitronIntentSource(value: unknown): AlyzitronIntentSource | undefined {
  const normalized = cleanString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized && (INTENT_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as AlyzitronIntentSource)
    : undefined;
}

export function normalizeAlyzitronMediaSourceKind(value: unknown): AlyzitronMediaSourceKind | undefined {
  const normalized = cleanString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized && (MEDIA_SOURCE_KINDS as readonly string[]).includes(normalized)
    ? (normalized as AlyzitronMediaSourceKind)
    : undefined;
}

export function inferAlyzitronMediaSourceKind(args: {
  mediaSourceKind?: unknown;
  videoUrl?: unknown;
  metadata?: unknown;
}): AlyzitronMediaSourceKind | undefined {
  const explicit = normalizeAlyzitronMediaSourceKind(args.mediaSourceKind);
  if (explicit) return explicit;

  const metadata = asRecord(args.metadata);
  const metadataKind = normalizeAlyzitronMediaSourceKind(metadata?.mediaSourceKind ?? metadata?.sourceKind);
  if (metadataKind) return metadataKind;

  const mimeType = cleanString(metadata?.mimeType)?.toLowerCase();
  if (mimeType?.startsWith("image/")) return "image";

  const url = cleanString(args.videoUrl)?.toLowerCase();
  if (!url) return undefined;
  if (url.startsWith("gs://")) return "gcs";
  if (url.includes("r2.cloudflarestorage.com") || url.includes("r2.dev") || url.includes("/alyzitron-uploads/")) return "r2";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube_url";
  if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) return "image";
  if (url.startsWith("http://") || url.startsWith("https://")) return "external_url";
  return undefined;
}

function normalizeProvidedResolution(value: unknown): AlyzitronIntentResolution | null {
  const record = asRecord(value);
  if (!record) return null;

  const contentIntent = normalizeAlyzitronContentIntent(record.contentIntent);
  if (!contentIntent) return null;

  const source = normalizeAlyzitronIntentSource(record.source) ?? "unknown";
  const rationale = Array.isArray(record.rationale)
    ? record.rationale.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    contentIntent,
    source,
    confidence: clampConfidence(record.confidence, source === "user_selected" ? 1 : 0.5),
    rationale,
    userConfirmed: hasTruthyBoolean(record.userConfirmed),
  };
}

function buildResolution(
  contentIntent: AlyzitronContentIntent,
  source: AlyzitronIntentSource,
  confidence: number,
  rationale: string[],
  userConfirmed = false,
): AlyzitronIntentResolution {
  return {
    contentIntent,
    source,
    confidence: clampConfidence(confidence, 0),
    rationale,
    userConfirmed,
  };
}

function hasAnyCleanString(...values: unknown[]): boolean {
  return values.some((value) => Boolean(cleanString(value)));
}

function collectText(input: ResolveAlyzitronContentIntentInput): string {
  const metadata = asRecord(input.metadata);
  const context = asRecord(input.context);
  return [
    cleanString(input.userText),
    cleanString(context?.additionalDetails),
    cleanString(metadata?.additionalDetails),
    cleanString(metadata?.prompt),
    cleanString(metadata?.note),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function hasCompetitorLanguage(text: string): boolean {
  return /\b(competitor|competitors|competition|rival|rivals|benchmark|other brand|their content|their ad|their video)\b/i.test(text);
}

function hasReferenceLanguage(text: string): boolean {
  return /\b(reference|references|inspo|inspiration|example|learn from|what can we use|why did this work|why does this work)\b/i.test(text);
}

function hasOwnContentLanguage(text: string): boolean {
  return /\b(my|mine|our|ours|own)\b.{0,24}\b(content|video|post|reel|short|ad|creative)\b/i.test(text)
    || /\b(content|video|post|reel|short|ad|creative)\b.{0,24}\b(my|mine|our|ours|own)\b/i.test(text);
}

function hasActiveBrand(input: ResolveAlyzitronContentIntentInput): boolean {
  const metadata = asRecord(input.metadata);
  const context = asRecord(input.context);
  return hasAnyCleanString(input.brandId, metadata?.brandId, context?.brandId);
}

function hasOwnedProject(input: ResolveAlyzitronContentIntentInput): boolean {
  const metadata = asRecord(input.metadata);
  const context = asRecord(input.context);
  return hasAnyCleanString(input.editronProjectId, metadata?.editronProjectId, context?.editronProjectId);
}

export function resolveAlyzitronContentIntent(
  input: ResolveAlyzitronContentIntentInput = {},
): AlyzitronIntentResolution {
  const userSelectedIntent = normalizeAlyzitronContentIntent(input.userSelectedIntent);
  if (userSelectedIntent) {
    return buildResolution(userSelectedIntent, "user_selected", 1, ["User explicitly selected the analysis intent."], true);
  }

  const providedResolution = normalizeProvidedResolution(input.intentResolution);
  if (providedResolution?.source === "user_selected" || providedResolution?.userConfirmed) {
    return {
      ...providedResolution,
      source: "user_selected",
      confidence: Math.max(providedResolution.confidence, 0.95),
      userConfirmed: true,
      rationale: providedResolution.rationale.length
        ? providedResolution.rationale
        : ["User-confirmed intent resolution was provided."],
    };
  }

  const payloadIntent = normalizeAlyzitronContentIntent(input.contentIntent);
  const payloadSource = normalizeAlyzitronIntentSource(input.intentSource);
  if (payloadIntent && (payloadSource === "user_selected" || hasTruthyBoolean(input.userConfirmedIntent))) {
    return buildResolution(payloadIntent, "user_selected", 1, ["User explicitly selected the analysis intent."], true);
  }

  const mediaSourceKind = inferAlyzitronMediaSourceKind({
    mediaSourceKind: input.mediaSourceKind,
    videoUrl: input.videoUrl ?? input.sourceUrl,
    metadata: input.metadata,
  });
  const text = collectText(input);
  const brandSelected = hasActiveBrand(input);

  if (hasCompetitorLanguage(text)) {
    return buildResolution(
      "competitor_content",
      "system_inferred",
      EXTERNAL_MEDIA_KINDS.has(mediaSourceKind as AlyzitronMediaSourceKind) ? 0.75 : 0.68,
      ["User context mentions competitor or benchmark language."],
    );
  }

  if (hasReferenceLanguage(text)) {
    return buildResolution(
      "reference_content",
      "system_inferred",
      0.65,
      ["User context mentions reference, inspiration, or learning language."],
    );
  }

  if (hasOwnContentLanguage(text) && brandSelected) {
    return buildResolution("own_content", "system_inferred", 0.78, [
      "User context uses own-content language and an active brand is selected.",
    ]);
  }

  if (hasOwnedProject(input)) {
    return buildResolution("own_content", "system_inferred", 0.85, [
      "Media originated from an owned Editron project.",
    ]);
  }

  if (brandSelected && mediaSourceKind && LOCAL_MEDIA_KINDS.has(mediaSourceKind)) {
    return buildResolution("own_content", "system_inferred", 0.7, [
      "Local or owned-storage media was submitted while an active brand is selected.",
    ]);
  }

  if (mediaSourceKind && EXTERNAL_MEDIA_KINDS.has(mediaSourceKind)) {
    return buildResolution("reference_content", "defaulted", 0.45, [
      "External URLs default to reference analysis when no stronger ownership signal exists.",
    ]);
  }

  return buildResolution("unknown", "defaulted", 0.3, [
    "No reliable ownership, competitor, or reference signal was available.",
  ]);
}
