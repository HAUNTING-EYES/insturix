import { inflateRawSync, inflateSync } from 'node:zlib';
import type { BrandVaultSourceInput, BrandVaultUploadedAssetRole } from './brand-website-refinery-types';
import { createBrandVaultGeminiSocialOcrProvider, type BrandVaultSocialOcrProvider } from './brand-vault-social-ocr';

export type BrandVaultUploadParsedSource = BrandVaultSourceInput & {
  kind: 'uploaded_guideline' | 'uploaded_asset';
  name: string;
  note: string;
};

export interface BrandVaultUploadParserInput {
  name: string;
  mimeType?: string;
  buffer: Buffer;
}

export interface BrandVaultUploadParserResult {
  source: BrandVaultUploadParsedSource;
  warnings: string[];
}

interface ParsedUploadEvidence {
  text?: string;
  dominantColors?: string[];
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

const MAX_TEXT_CHARS = 20_000;
const MAX_TEXT_FILE_BYTES = 4_000_000;
const MAX_IMAGE_SAMPLE_SIZE = 96;
const MAX_IMAGE_SAMPLE_PIXELS = MAX_IMAGE_SAMPLE_SIZE * MAX_IMAGE_SAMPLE_SIZE;
const MAX_ZIP_ENTRY_BYTES = 8_000_000;
// DoS guards: a small compressed upload must not decompress into a memory bomb or fan out into
// thousands of entries. Caps are well above real brand decks, below memory-danger. Tune vs finance.
const MAX_ZIP_ENTRIES = 512;
const MAX_TOTAL_INFLATE_BYTES = 64_000_000;
const MAX_OCR_IMAGE_BYTES = 10_000_000;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'css', 'svg', 'xml']);
const GUIDELINE_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'markdown', 'csv', 'json']);
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp']);
const OFFICE_OPEN_XML_EXTENSIONS = new Set(['docx', 'pptx']);
const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'ppt']);

export async function extractBrandVaultUploadEvidenceFromBuffer(
  input: BrandVaultUploadParserInput,
  options: { ocrProvider?: BrandVaultSocialOcrProvider | null } = {},
): Promise<BrandVaultUploadParserResult> {
  const name = input.name.trim() || 'brand-upload';
  const mimeType = input.mimeType?.trim() || undefined;
  const extension = fileExtension(name);
  const warnings: string[] = [];
  let evidence: ParsedUploadEvidence = {};
  // Env-gated by BRAND_VAULT_SOCIAL_OCR_ENABLED (returns null when off); tests inject a mock.
  const ocrProvider = options.ocrProvider === undefined ? createBrandVaultGeminiSocialOcrProvider() : options.ocrProvider;

  if (isTextUpload(name, mimeType)) {
    if (input.buffer.byteLength <= MAX_TEXT_FILE_BYTES) {
      evidence = mergeEvidence(evidence, {
        text: input.buffer.toString('utf8'),
      });
    } else {
      warnings.push(`${name} is too large for server text extraction.`);
    }
  } else if (OFFICE_OPEN_XML_EXTENSIONS.has(extension)) {
    const officeEvidence = extractOfficeOpenXmlEvidence(input.buffer, extension);
    evidence = mergeEvidence(evidence, officeEvidence.evidence);
    warnings.push(...officeEvidence.warnings.map((warning) => `${name}: ${warning}`));
  } else if (extension === 'pdf' || mimeType === 'application/pdf') {
    const pdfEvidence = extractPdfEvidence(input.buffer);
    evidence = mergeEvidence(evidence, pdfEvidence.evidence);
    warnings.push(...pdfEvidence.warnings.map((warning) => `${name}: ${warning}`));
  } else if (LEGACY_OFFICE_EXTENSIONS.has(extension)) {
    warnings.push(`${name}: legacy Office binary files need conversion before text extraction.`);
  }

  if (isImageUpload(name, mimeType) && extension !== 'svg') {
    try {
      evidence = mergeEvidence(evidence, {
        dominantColors: await sampleImageDominantColors(input.buffer),
      });
    } catch {
      warnings.push(`${name}: image colors could not be sampled on the server.`);
    }
    if (ocrProvider && input.buffer.byteLength > MAX_OCR_IMAGE_BYTES) {
      warnings.push(`${name}: image too large for server OCR; skipped.`);
    } else if (ocrProvider) {
      const ocr = await ocrProvider.readTextFromImage({
        imageBase64: input.buffer.toString('base64'),
        mimeType: mimeType ?? `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        sourceKind: 'upload',
        sourceUrl: name,
      });
      if (ocr.text) evidence = mergeEvidence(evidence, { text: ocr.text });
      if (ocr.warning) warnings.push(ocr.warning);
    }
  }

  const source = createUploadSourceFromEvidence({
    name,
    mimeType,
    sizeBytes: input.buffer.byteLength,
    text: evidence.text,
    dominantColors: evidence.dominantColors,
  });

  if (!source.text && !source.dominantColors?.length && isParserBackedDocument(name, mimeType)) {
    warnings.push(`${name}: metadata staged; no reliable text or color evidence was extracted.`);
  }

  return {
    source,
    warnings: uniqueStrings(warnings),
  };
}

function createUploadSourceFromEvidence(input: {
  name: string;
  mimeType?: string;
  sizeBytes: number;
  text?: string;
  dominantColors?: string[];
}): BrandVaultUploadParsedSource {
  const text = limitText(input.text);
  const dominantColors = uniqueStrings([
    ...normalizeColorValues(input.dominantColors ?? []),
    ...extractHexColorsFromText(text ?? ''),
  ]).slice(0, 12);
  const assetRole = inferUploadedAssetRole(input.name, input.mimeType);
  const kind = inferSourceKind(input.name, input.mimeType, assetRole);

  return {
    kind,
    name: input.name,
    note: uploadNote(kind, Boolean(text), dominantColors.length),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    text,
    dominantColors: dominantColors.length ? dominantColors : undefined,
    assetRole,
  };
}

function extractOfficeOpenXmlEvidence(buffer: Buffer, extension: string): { evidence: ParsedUploadEvidence; warnings: string[] } {
  const warnings: string[] = [];
  let entries: ZipEntry[];
  try {
    entries = readZipEntries(buffer);
  } catch {
    return { evidence: {}, warnings: ['Office Open XML package could not be read.'] };
  }

  const textParts: string[] = [];
  const colors: string[] = [];
  for (const entry of entries) {
    if (!isRelevantOfficeXmlEntry(entry.name, extension)) continue;
    const xml = entry.data.toString('utf8');
    colors.push(...extractColorsFromXml(xml));
    if (isOfficeTextEntry(entry.name, extension)) textParts.push(xmlTextContent(xml));
  }

  if (textParts.length === 0) warnings.push('no readable document text found.');
  return {
    evidence: {
      text: normalizeExtractedText(textParts.join('\n')),
      dominantColors: uniqueStrings(colors),
    },
    warnings,
  };
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error('Missing ZIP central directory.');

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = Math.min(buffer.length, centralDirectoryOffset + centralDirectorySize);
  const entries: ZipEntry[] = [];
  let totalInflated = 0;
  let cursor = centralDirectoryOffset;

  while (cursor + 46 <= centralDirectoryEnd && buffer.readUInt32LE(cursor) === 0x02014b50) {
    // DoS guard: stop at the entry-count or cumulative-inflate ceiling (zip-bomb / entry fan-out).
    if (entries.length >= MAX_ZIP_ENTRIES || totalInflated >= MAX_TOTAL_INFLATE_BYTES) break;

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.toString('utf8', nameStart, nameEnd);

    if (uncompressedSize <= MAX_ZIP_ENTRY_BYTES && localHeaderOffset + 30 <= buffer.length) {
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd <= buffer.length) {
        const compressed = buffer.subarray(dataStart, dataEnd);
        // Cap decompression output per entry — a forged small uncompressedSize can't bomb memory.
        let data: Buffer;
        try {
          data = method === 0
            ? compressed
            : method === 8
              ? inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_BYTES })
              : Buffer.alloc(0);
        } catch {
          data = Buffer.alloc(0); // decompression bomb or corrupt entry -> skip
        }
        totalInflated += data.length;
        if ((data.length > 0 || uncompressedSize === 0) && totalInflated <= MAX_TOTAL_INFLATE_BYTES) {
          entries.push({ name, data });
        }
      }
    }

    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function isRelevantOfficeXmlEntry(name: string, extension: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith('.xml')) return false;
  if (lower.startsWith('docprops/')) return true;
  if (extension === 'docx') return lower.startsWith('word/');
  return lower.startsWith('ppt/slides/') || lower.startsWith('ppt/notesSlides/') || lower.startsWith('ppt/theme/');
}

function isOfficeTextEntry(name: string, extension: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('docprops/')) return true;
  if (extension === 'docx') {
    return /word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(lower);
  }
  return /ppt\/(?:slides\/slide\d+|notesslides\/notesslide\d+)\.xml$/.test(lower);
}

function xmlTextContent(xml: string): string {
  const textNodes: string[] = [];
  for (const match of xml.matchAll(/>([^<>]+)</g)) {
    const text = decodeXmlEntities(match[1] ?? '').trim();
    if (text) textNodes.push(text);
  }
  return textNodes.join('\n');
}

function extractColorsFromXml(xml: string): string[] {
  const colors: string[] = [];
  for (const match of xml.matchAll(/\b(?:srgbClr|sysClr|color|schemeClr)\b[^>]*\b(?:val|lastClr|rgb)="?([0-9a-fA-F]{6})"?/g)) {
    colors.push(`#${match[1]}`);
  }
  colors.push(...extractHexColorsFromText(xml));
  return uniqueStrings(colors);
}

function extractPdfEvidence(buffer: Buffer): { evidence: ParsedUploadEvidence; warnings: string[] } {
  const header = buffer.subarray(0, 1024).toString('latin1');
  if (!header.includes('%PDF')) {
    return { evidence: {}, warnings: ['file does not look like a PDF.'] };
  }

  const chunks = [buffer.subarray(0, Math.min(buffer.length, 1_000_000)).toString('latin1')];
  chunks.push(...extractPdfStreamChunks(buffer));
  const text = normalizeExtractedText(chunks.flatMap(extractPdfOperatorText).join('\n'));
  return {
    evidence: {
      text,
      dominantColors: extractHexColorsFromText(text ?? ''),
    },
    warnings: text ? [] : ['no readable PDF text operators found.'],
  };
}

function extractPdfStreamChunks(buffer: Buffer): string[] {
  const chunks: string[] = [];
  const streamToken = Buffer.from('stream', 'latin1');
  const endToken = Buffer.from('endstream', 'latin1');
  let cursor = 0;

  while (cursor < buffer.length) {
    const streamOffset = buffer.indexOf(streamToken, cursor);
    if (streamOffset < 0) break;
    const endOffset = buffer.indexOf(endToken, streamOffset + streamToken.length);
    if (endOffset < 0) break;

    const dictionary = buffer.subarray(Math.max(0, streamOffset - 512), streamOffset).toString('latin1');
    let dataStart = streamOffset + streamToken.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buffer[dataStart] === 0x0d || buffer[dataStart] === 0x0a) dataStart += 1;

    let dataEnd = endOffset;
    if (buffer[dataEnd - 2] === 0x0d && buffer[dataEnd - 1] === 0x0a) dataEnd -= 2;
    else if (buffer[dataEnd - 1] === 0x0d || buffer[dataEnd - 1] === 0x0a) dataEnd -= 1;

    const raw = buffer.subarray(dataStart, dataEnd);
    const data = /FlateDecode/.test(dictionary) ? inflatePdfStream(raw) : raw;
    if (data.length > 0) chunks.push(data.toString('latin1'));
    cursor = endOffset + endToken.length;
  }

  return chunks;
}

function inflatePdfStream(raw: Buffer): Buffer {
  const opts = { maxOutputLength: MAX_ZIP_ENTRY_BYTES };
  try {
    return inflateSync(raw, opts);
  } catch {
    try {
      return inflateRawSync(raw, opts);
    } catch {
      return Buffer.alloc(0); // decompression bomb or corrupt stream -> skip
    }
  }
}

function extractPdfOperatorText(chunk: string): string[] {
  const text: string[] = [];
  for (const match of chunk.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
    text.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, '')));
  }
  for (const arrayMatch of chunk.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
    const arrayBody = arrayMatch[1] ?? '';
    for (const token of arrayBody.matchAll(/\((?:\\.|[^\\()])*\)|<([0-9a-fA-F\s]+)>/g)) {
      text.push(token[1] ? decodePdfHex(token[1]) : decodePdfLiteral(token[0]));
    }
  }
  return text;
}

function decodePdfLiteral(value: string): string {
  return value
    .slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
      if (escaped === 'n' || escaped === 'r') return '\n';
      if (escaped === 't') return '\t';
      if (escaped === 'b' || escaped === 'f') return ' ';
      return escaped;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function decodePdfHex(value: string): string {
  const hex = value.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const codeUnits: number[] = [];
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      codeUnits.push((bytes[index] << 8) + bytes[index + 1]);
    }
    return String.fromCharCode(...codeUnits);
  }
  return String.fromCharCode(...bytes);
}

async function sampleImageDominantColors(buffer: Buffer): Promise<string[]> {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const { data, info } = await sharp(buffer)
    .resize(MAX_IMAGE_SAMPLE_SIZE, MAX_IMAGE_SAMPLE_SIZE, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, number>();
  const pixelCount = info.width * info.height;
  const stride = Math.max(1, Math.floor(pixelCount / MAX_IMAGE_SAMPLE_PIXELS));

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
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

function mergeEvidence(first: ParsedUploadEvidence, second: ParsedUploadEvidence): ParsedUploadEvidence {
  return {
    text: limitText([first.text, second.text].filter(Boolean).join('\n')),
    dominantColors: uniqueStrings([...(first.dominantColors ?? []), ...(second.dominantColors ?? [])]),
  };
}

function isParserBackedDocument(name: string, mimeType?: string): boolean {
  const extension = fileExtension(name);
  return OFFICE_OPEN_XML_EXTENSIONS.has(extension) || LEGACY_OFFICE_EXTENSIONS.has(extension) || extension === 'pdf' || mimeType === 'application/pdf';
}

function isTextUpload(name: string, mimeType?: string): boolean {
  const extension = fileExtension(name);
  return Boolean(mimeType?.startsWith('text/')) || TEXT_EXTENSIONS.has(extension) || mimeType === 'application/json' || mimeType === 'image/svg+xml';
}

function isImageUpload(name: string, mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith('image/')) || IMAGE_EXTENSIONS.has(fileExtension(name));
}

function inferSourceKind(
  name: string,
  mimeType: string | undefined,
  assetRole: BrandVaultUploadedAssetRole,
): BrandVaultUploadParsedSource['kind'] {
  const extension = fileExtension(name);
  if (assetRole === 'logo' || assetRole === 'font' || IMAGE_EXTENSIONS.has(extension) || mimeType?.startsWith('image/')) {
    return 'uploaded_asset';
  }
  if (GUIDELINE_EXTENSIONS.has(extension)) return 'uploaded_guideline';
  return 'uploaded_asset';
}

function inferUploadedAssetRole(name: string, mimeType?: string): BrandVaultUploadedAssetRole {
  const label = `${name} ${mimeType ?? ''}`.toLowerCase();
  if (/\b(?:logo|logomark|wordmark|brandmark)\b/.test(label)) return 'logo';
  if (/\b(?:font|typeface|otf|ttf|woff2?)\b/.test(label)) return 'font';
  if (/\b(?:palette|colors?|colours?|swatches)\b/.test(label)) return 'color_palette';
  if (/\b(?:brand[-_\s]?book|guidelines?|manual|style[-_\s]?guide)\b/.test(label)) return 'brand_book';
  if (/\b(?:case[-_\s]?study|portfolio|reference|inspiration|moodboard)\b/.test(label)) return 'creative_reference';
  if (/\b(?:prior|previous|old|archive|best[-_\s]?performing)\b/.test(label)) return 'prior_work';
  return 'other';
}

function uploadNote(kind: BrandVaultUploadParsedSource['kind'], hasText: boolean, colorCount: number): string {
  const parts = [kind === 'uploaded_guideline' ? 'Uploaded brand guideline' : 'Uploaded brand asset'];
  if (hasText) parts.push('text extracted');
  if (colorCount > 0) parts.push(`${colorCount} color${colorCount === 1 ? '' : 's'} observed`);
  if (!hasText && colorCount === 0) parts.push('metadata staged for review');
  return `${parts.join('; ')}.`;
}

function normalizeExtractedText(value: string): string | undefined {
  const cleaned = value
    .replace(/\u0000/g, '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return limitText(cleaned);
}

function limitText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\u0000/g, '').trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned;
}

function extractHexColorsFromText(text: string): string[] {
  const colors: string[] = [];
  for (const match of text.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
    const color = normalizeHexColor(match[0]);
    if (color) colors.push(color);
  }
  return uniqueStrings(colors);
}

function normalizeColorValues(values: string[]): string[] {
  return values.map(normalizeHexColor).filter((color): color is string => Boolean(color));
}

function normalizeHexColor(value: string | undefined): string | undefined {
  const hex = value?.trim().toLowerCase();
  if (!hex) return undefined;
  const withHash = hex.startsWith('#') ? hex : `#${hex}`;
  if (/^#[0-9a-f]{6}$/.test(withHash)) return withHash;
  if (/^#[0-9a-f]{3}$/.test(withHash)) return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`;
  return undefined;
}

function fileExtension(name: string): string {
  const extension = name.toLowerCase().split('.').pop();
  return extension && extension !== name.toLowerCase() ? extension : '';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
  return value.toString(16).padStart(2, '0');
}
