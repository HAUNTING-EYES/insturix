import type { BrandVaultSourcePlatform } from './brand-website-refinery-types';

export interface BrandVaultSocialOcrInput {
  imageUrl: string;
  sourceUrl?: string;
  platform?: BrandVaultSourcePlatform;
  mediaType?: string;
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
  'Extract only visible text from this social media image or thumbnail for brand evidence.',
  'Return the exact readable text, preserving short line breaks when useful.',
  'Do not describe the image. Do not infer missing words. If no readable text exists, return NO_TEXT.',
].join(' ');

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

  return {
    async readTextFromImage(input) {
      const image = await fetchOcrImage({
        imageUrl: input.imageUrl,
        fetchFn,
        maxImageBytes,
      });
      if (!image.ok) return { warning: image.warning };

      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          OCR_PROMPT,
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        ]);
        const text = normalizeOcrText(result.response.text());
        return text ? { text } : {};
      } catch (error) {
        return { warning: `Brand Vault skipped social OCR for ${input.imageUrl}: ${errorMessage(error)}` };
      }
    },
  };
}

async function fetchOcrImage(args: {
  imageUrl: string;
  fetchFn: BrandVaultOcrFetch;
  maxImageBytes: number;
}): Promise<{ ok: true; base64: string; mimeType: string } | { ok: false; warning: string }> {
  try {
    const response = await args.fetchFn(args.imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' },
    });
    if (!response.ok) {
      return { ok: false, warning: `Brand Vault skipped social OCR for ${args.imageUrl}: image fetch returned ${response.status}.` };
    }

    const mimeType = imageMimeType(response.headers.get('content-type'));
    if (!mimeType) {
      return { ok: false, warning: `Brand Vault skipped social OCR for ${args.imageUrl}: response was not an image.` };
    }

    const contentLength = numberFromHeader(response.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > args.maxImageBytes) {
      return { ok: false, warning: `Brand Vault skipped social OCR for ${args.imageUrl}: image exceeded ${args.maxImageBytes} bytes.` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > args.maxImageBytes) {
      return { ok: false, warning: `Brand Vault skipped social OCR for ${args.imageUrl}: image exceeded ${args.maxImageBytes} bytes.` };
    }

    return {
      ok: true,
      base64: buffer.toString('base64'),
      mimeType,
    };
  } catch (error) {
    return { ok: false, warning: `Brand Vault skipped social OCR for ${args.imageUrl}: ${errorMessage(error)}` };
  }
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
