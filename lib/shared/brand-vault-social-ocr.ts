import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { BrandVaultSourcePlatform } from './brand-website-refinery-types';

export interface BrandVaultSocialOcrInput {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  sourceUrl?: string;
  platform?: BrandVaultSourcePlatform;
  mediaType?: string;
  sourceKind?: 'social' | 'website' | 'upload';
}

export interface BrandVaultSocialOcrResult {
  text?: string;
  warning?: string;
}

export interface BrandVaultSocialOcrProvider {
  readTextFromImage(input: BrandVaultSocialOcrInput): Promise<BrandVaultSocialOcrResult>;
}

export type BrandVaultOcrFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BrandVaultGeminiSocialOcrOptions {
  apiKey?: string;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: BrandVaultOcrFetch;
  maxImageBytes?: number;
  modelName?: string;
}

const DEFAULT_MAX_IMAGE_BYTES = 2_000_000;
const DEFAULT_MODEL_NAME = 'gemini-2.5-flash';
const OCR_PROMPT = [
  'Extract only visible text from this brand evidence image or thumbnail.',
  'Return the exact readable text, preserving short line breaks when useful.',
  'Do not describe the image. Do not infer missing words. If no readable text exists, return NO_TEXT.',
].join(' ');

type BrandVaultOcrUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type BrandVaultGeminiOcrCostInput = {
  status: ProviderCostEventStatus;
  modelName: string;
  sourceKind: NonNullable<BrandVaultSocialOcrInput['sourceKind']>;
  platform?: BrandVaultSourcePlatform;
  mediaType?: string;
  mimeType: string;
  imageBytes?: number;
  outputChars?: number;
  functionMs?: number;
  usage?: BrandVaultOcrUsage;
  error?: unknown;
};

export function createBrandVaultGeminiSocialOcrProvider(
  options: BrandVaultGeminiSocialOcrOptions = {},
): BrandVaultSocialOcrProvider | null {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? env.BRAND_VAULT_SOCIAL_OCR_ENABLED === 'true';
  const apiKey = options.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!enabled || !apiKey) return null;

  const fetchFn = options.fetchFn ?? fetch;
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const modelName = options.modelName ?? env.BRAND_VAULT_SOCIAL_OCR_MODEL ?? DEFAULT_MODEL_NAME;

  const runGeminiOcr = async (
    base64: string,
    mimeType: string,
    input: BrandVaultSocialOcrInput,
    label: string,
    ref: string,
  ): Promise<BrandVaultSocialOcrResult> => {
    const startedAt = Date.now();
    const imageBytes = approximateBase64Bytes(base64);
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([OCR_PROMPT, { inlineData: { mimeType, data: base64 } }]);
      const rawText = result.response.text();
      const text = normalizeOcrText(rawText);
      await recordBrandVaultGeminiOcrCost({
        status: 'success',
        modelName,
        sourceKind: input.sourceKind ?? 'social',
        platform: input.platform,
        mediaType: input.mediaType,
        mimeType,
        imageBytes,
        outputChars: rawText.length,
        functionMs: Date.now() - startedAt,
        usage: readGeminiUsage(result),
      });
      return text ? { text } : {};
    } catch (error) {
      await recordBrandVaultGeminiOcrCost({
        status: 'failed',
        modelName,
        sourceKind: input.sourceKind ?? 'social',
        platform: input.platform,
        mediaType: input.mediaType,
        mimeType,
        imageBytes,
        functionMs: Date.now() - startedAt,
        error,
      });
      return { warning: `Brand Vault skipped ${label} for ${ref}: ${errorMessage(error)}` };
    }
  };

  return {
    async readTextFromImage(input) {
      const sourceLabel =
        input.sourceKind === 'website' ? 'website OCR' : input.sourceKind === 'upload' ? 'upload OCR' : 'social OCR';
      // Uploaded files arrive as inline image data (no URL to fetch).
      if (input.imageBase64) {
        const mimeType = imageMimeType(input.mimeType ?? null);
        if (!mimeType) return { warning: `Brand Vault skipped ${sourceLabel}: uploaded data was not a supported image.` };
        if (Math.floor((input.imageBase64.length * 3) / 4) > maxImageBytes) {
          return { warning: `Brand Vault skipped ${sourceLabel}: image exceeded ${maxImageBytes} bytes.` };
        }
        return runGeminiOcr(input.imageBase64, mimeType, input, sourceLabel, input.sourceUrl ?? 'upload');
      }
      if (!input.imageUrl) return {};
      const image = await fetchOcrImage({ imageUrl: input.imageUrl, fetchFn, maxImageBytes, sourceLabel });
      if (!image.ok) return { warning: image.warning };
      return runGeminiOcr(image.base64, image.mimeType, input, sourceLabel, input.imageUrl);
    },
  };
}

async function fetchOcrImage(args: {
  imageUrl: string;
  fetchFn: BrandVaultOcrFetch;
  maxImageBytes: number;
  sourceLabel: string;
}): Promise<{ ok: true; base64: string; mimeType: string } | { ok: false; warning: string }> {
  try {
    const response = await args.fetchFn(args.imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' },
    });
    if (!response.ok) {
      return { ok: false, warning: `Brand Vault skipped ${args.sourceLabel} for ${args.imageUrl}: image fetch returned ${response.status}.` };
    }

    const mimeType = imageMimeType(response.headers.get('content-type'));
    if (!mimeType) {
      return { ok: false, warning: `Brand Vault skipped ${args.sourceLabel} for ${args.imageUrl}: response was not an image.` };
    }

    const contentLength = numberFromHeader(response.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > args.maxImageBytes) {
      return { ok: false, warning: `Brand Vault skipped ${args.sourceLabel} for ${args.imageUrl}: image exceeded ${args.maxImageBytes} bytes.` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > args.maxImageBytes) {
      return { ok: false, warning: `Brand Vault skipped ${args.sourceLabel} for ${args.imageUrl}: image exceeded ${args.maxImageBytes} bytes.` };
    }

    return {
      ok: true,
      base64: buffer.toString('base64'),
      mimeType,
    };
  } catch (error) {
    return { ok: false, warning: `Brand Vault skipped ${args.sourceLabel} for ${args.imageUrl}: ${errorMessage(error)}` };
  }
}

async function recordBrandVaultGeminiOcrCost(input: BrandVaultGeminiOcrCostInput) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(OCR_PROMPT.length);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);
  await recordProviderCostEvent({
    status: input.status,
    service: 'brand_vault',
    action: 'brand_scan',
    route: 'lib/shared/brand-vault-social-ocr',
    provider: 'gemini',
    model: cleanGeminiModelName(input.modelName),
    operation: 'image_ocr',
    units: {
      requestCount: 1,
      imageCount: 1,
      bytesIn: input.imageBytes,
      inputTokens,
      outputTokens,
      totalTokens: input.usage?.totalTokens ?? sumOptional(inputTokens, outputTokens),
      functionMs: input.functionMs,
    },
    metadata: {
      providerName: 'gemini',
      sourceKind: input.sourceKind,
      platform: input.platform,
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      imageBytes: input.imageBytes,
      outputChars: input.outputChars,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

function readGeminiUsage(result: unknown): BrandVaultOcrUsage | undefined {
  const resultRecord = asRecord(result);
  const responseRecord = asRecord(resultRecord?.response);
  const usage = asRecord(resultRecord?.usageMetadata) ?? asRecord(responseRecord?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokenCount ?? usage.inputTokenCount);
  const outputTokens = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount);
  const totalTokens = readNumber(usage.totalTokenCount);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === 'number' && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function approximateBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function cleanGeminiModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function imageMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase();
  if (!mimeType?.startsWith('image/')) return undefined;
  if (mimeType === 'image/svg+xml') return undefined;
  return mimeType;
}

function normalizeOcrText(value: string | undefined): string | undefined {
  const normalized = value
    ?.replace(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/\bNO_TEXT\b/gi, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return undefined;
  if (/^(?:no readable text|no visible text|none)$/i.test(normalized)) return undefined;
  return normalized.length > 1500 ? `${normalized.slice(0, 1500).trim()}...` : normalized;
}

function numberFromHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
