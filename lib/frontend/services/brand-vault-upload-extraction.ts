export type BrandVaultUploadSourceKind = "uploaded_guideline" | "uploaded_asset";

export type BrandVaultUploadedAssetRole =
  | "brand_book"
  | "logo"
  | "font"
  | "color_palette"
  | "creative_reference"
  | "prior_work"
  | "other";

export interface BrandVaultUploadSourceEvidence {
  kind: BrandVaultUploadSourceKind;
  name: string;
  note: string;
  mimeType?: string;
  sizeBytes?: number;
  text?: string;
  dominantColors?: string[];
  assetRole?: BrandVaultUploadedAssetRole;
}

export interface BrandVaultUploadExtractionResult {
  source: BrandVaultUploadSourceEvidence;
  warnings: string[];
}

export interface BrandVaultUploadMetadata {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  text?: string;
  dominantColors?: string[];
}

const MAX_TEXT_CHARS = 20_000;
const MAX_TEXT_FILE_BYTES = 4_000_000;
const MAX_IMAGE_SAMPLE_SIZE = 96;
const MAX_IMAGE_SAMPLE_PIXELS = MAX_IMAGE_SAMPLE_SIZE * MAX_IMAGE_SAMPLE_SIZE;

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "html", "htm", "css", "svg", "xml"]);
const GUIDELINE_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx", "txt", "md", "markdown", "csv", "json"]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"]);
const SERVER_EXTRACTION_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx"]);

export async function extractBrandVaultUploadEvidence(file: File): Promise<BrandVaultUploadExtractionResult> {
  const warnings: string[] = [];
  let text: string | undefined;
  let dominantColors: string[] = [];

  if (shouldExtractText(file)) {
    if (file.size <= MAX_TEXT_FILE_BYTES) {
      text = limitText(await file.text());
      dominantColors = extractHexColorsFromUploadText(text ?? "");
    } else {
      warnings.push(`${file.name} is too large for browser text extraction.`);
    }
  }

  if (isImageUpload(file) && file.type !== "image/svg+xml") {
    try {
      dominantColors = uniqueStrings([...dominantColors, ...(await sampleImageDominantColors(file))]);
    } catch {
      warnings.push(`${file.name} image colors could not be sampled in the browser.`);
    }
  }

  const localResult: BrandVaultUploadExtractionResult = {
    source: createBrandVaultUploadSourceFromMetadata({
      name: file.name,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
      text,
      dominantColors,
    }),
    warnings,
  };

  if (!shouldRequestServerExtraction(file, localResult.source)) return localResult;

  const serverResult = await requestServerUploadExtraction(file);
  if (serverResult) return mergeUploadExtractionResults(localResult, serverResult);

  return {
    source: localResult.source,
    warnings: uniqueStrings([
      ...localResult.warnings,
      `${file.name} could not be server-extracted; metadata staged for review.`,
    ]),
  };
}

export function createBrandVaultUploadSourceFromMetadata(metadata: BrandVaultUploadMetadata): BrandVaultUploadSourceEvidence {
  const assetRole = inferBrandVaultUploadedAssetRole(metadata.name, metadata.mimeType);
  const text = limitText(metadata.text);
  const dominantColors = uniqueStrings([
    ...normalizeColorValues(metadata.dominantColors ?? []),
    ...extractHexColorsFromUploadText(text ?? ""),
  ]).slice(0, 12);
  const kind = inferBrandVaultSourceKind(metadata.name, metadata.mimeType, assetRole);

  return {
    kind,
    name: metadata.name,
    note: uploadNote(kind, Boolean(text), dominantColors.length),
    mimeType: metadata.mimeType,
    sizeBytes: metadata.sizeBytes,
    text,
    dominantColors: dominantColors.length ? dominantColors : undefined,
    assetRole,
  };
}

export function extractHexColorsFromUploadText(text: string): string[] {
  const colors: string[] = [];
  for (const match of text.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
    const color = normalizeHexColor(match[0]);
    if (color) colors.push(color);
  }
  return uniqueStrings(colors);
}

export function inferBrandVaultSourceKind(
  name: string,
  mimeType: string | undefined,
  assetRole: BrandVaultUploadedAssetRole = inferBrandVaultUploadedAssetRole(name, mimeType),
): BrandVaultUploadSourceKind {
  const extension = fileExtension(name);
  if (assetRole === "logo" || assetRole === "font" || isImageExtension(extension) || mimeType?.startsWith("image/")) {
    return "uploaded_asset";
  }
  if (GUIDELINE_EXTENSIONS.has(extension)) return "uploaded_guideline";
  return "uploaded_asset";
}

export function inferBrandVaultUploadedAssetRole(name: string, mimeType?: string): BrandVaultUploadedAssetRole {
  const label = `${name} ${mimeType ?? ""}`.toLowerCase();
  if (/\b(?:logo|logomark|wordmark|brandmark)\b/.test(label)) return "logo";
  if (/\b(?:font|typeface|otf|ttf|woff2?)\b/.test(label)) return "font";
  if (/\b(?:palette|colors?|colours?|swatches)\b/.test(label)) return "color_palette";
  if (/\b(?:brand[-_\s]?book|guidelines?|manual|style[-_\s]?guide)\b/.test(label)) return "brand_book";
  if (/\b(?:case[-_\s]?study|portfolio|reference|inspiration|moodboard)\b/.test(label)) return "creative_reference";
  if (/\b(?:prior|previous|old|archive|best[-_\s]?performing)\b/.test(label)) return "prior_work";
  return "other";
}

function shouldExtractText(file: File): boolean {
  const extension = fileExtension(file.name);
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension) || file.type === "application/json" || file.type === "image/svg+xml";
}

function isImageUpload(file: File): boolean {
  return file.type.startsWith("image/") || isImageExtension(fileExtension(file.name));
}

function isImageExtension(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension);
}

function shouldRequestServerExtraction(file: File, source: BrandVaultUploadSourceEvidence): boolean {
  const extension = fileExtension(file.name);
  if (SERVER_EXTRACTION_EXTENSIONS.has(extension) || file.type === "application/pdf") return true;
  return source.kind === "uploaded_asset" && !source.dominantColors?.length && file.size <= 25_000_000;
}

async function requestServerUploadExtraction(file: File): Promise<BrandVaultUploadExtractionResult | null> {
  if (typeof fetch !== "function" || typeof FormData === "undefined") return null;
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const response = await fetch("/api/brand-vault/uploads/extract", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (!isServerUploadExtractionResult(body)) return null;
    return {
      source: body.source,
      warnings: body.warnings,
    };
  } catch {
    return null;
  }
}

function isServerUploadExtractionResult(value: unknown): value is { source: BrandVaultUploadSourceEvidence; warnings: string[] } {
  if (!value || typeof value !== "object") return false;
  const body = value as { ok?: unknown; source?: unknown; warnings?: unknown };
  if (body.ok !== true || !Array.isArray(body.warnings) || !isUploadSourceEvidence(body.source)) return false;
  return body.warnings.every((warning) => typeof warning === "string");
}

function isUploadSourceEvidence(value: unknown): value is BrandVaultUploadSourceEvidence {
  if (!value || typeof value !== "object") return false;
  const source = value as BrandVaultUploadSourceEvidence;
  return (
    (source.kind === "uploaded_guideline" || source.kind === "uploaded_asset") &&
    typeof source.name === "string" &&
    typeof source.note === "string" &&
    (source.text === undefined || typeof source.text === "string") &&
    (source.dominantColors === undefined || Array.isArray(source.dominantColors))
  );
}

function mergeUploadExtractionResults(
  localResult: BrandVaultUploadExtractionResult,
  serverResult: BrandVaultUploadExtractionResult,
): BrandVaultUploadExtractionResult {
  const source = createBrandVaultUploadSourceFromMetadata({
    name: localResult.source.name,
    mimeType: serverResult.source.mimeType ?? localResult.source.mimeType,
    sizeBytes: serverResult.source.sizeBytes ?? localResult.source.sizeBytes,
    text: serverResult.source.text ?? localResult.source.text,
    dominantColors: uniqueStrings([
      ...(localResult.source.dominantColors ?? []),
      ...(serverResult.source.dominantColors ?? []),
    ]),
  });
  return {
    source: {
      ...source,
      assetRole: serverResult.source.assetRole ?? localResult.source.assetRole ?? source.assetRole,
    },
    warnings: uniqueStrings([...localResult.warnings, ...serverResult.warnings]),
  };
}

function limitText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\u0000/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned;
}

function uploadNote(kind: BrandVaultUploadSourceKind, hasText: boolean, colorCount: number): string {
  const parts = [kind === "uploaded_guideline" ? "Uploaded brand guideline" : "Uploaded brand asset"];
  if (hasText) parts.push("text extracted");
  if (colorCount > 0) parts.push(`${colorCount} color${colorCount === 1 ? "" : "s"} observed`);
  if (!hasText && colorCount === 0) parts.push("metadata staged for review");
  return `${parts.join("; ")}.`;
}

function normalizeColorValues(values: string[]): string[] {
  return values.map(normalizeHexColor).filter((color): color is string => Boolean(color));
}

function normalizeHexColor(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function fileExtension(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  return extension && extension !== name.toLowerCase() ? extension : "";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function sampleImageDominantColors(file: File): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return [];
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = context.getImageData(0, 0, width, height).data;
  const buckets = new Map<string, number>();
  const stride = Math.max(1, Math.floor((width * height) / MAX_IMAGE_SAMPLE_PIXELS));

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 128) continue;
    const red = quantizeColor(data[offset] ?? 0);
    const green = quantizeColor(data[offset + 1] ?? 0);
    const blue = quantizeColor(data[offset + 2] ?? 0);
    if (isNearNeutral(red, green, blue)) continue;
    const hex = rgbToHex(red, green, blue);
    buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .slice(0, 8);
}

function quantizeColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

function isNearNeutral(red: number, green: number, blue: number): boolean {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max - min < 12 && (max < 36 || max > 220);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
