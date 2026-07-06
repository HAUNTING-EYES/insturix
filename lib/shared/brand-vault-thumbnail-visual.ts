import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';

/**
 * Analyze a committed Clickatron thumbnail (a real, user-accepted brand visual) with Gemini vision to
 * recover the brand's actual visual language - the dominant palette plus a few reliably-judgeable visual
 * dials. This is what lets Brand Vault LEARN from committed thumbnails instead of only logging their URL.
 *
 * Best-effort enrichment: returns null on disabled / no key / fetch error / bad model output, so the
 * caller still emits its baseline asset signal (no regression). A single thumbnail is weak evidence, so
 * the caller stages these inferences for human review rather than auto-accepting them.
 */

export interface ThumbnailVisualSignals {
  palette: { primary?: string; accent?: string; supporting: string[] };
  visual: { minimalism?: number; contrastPreference?: number; expressiveness?: number };
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface AnalyzeThumbnailVisualOptions {
  imageUrl: string;
  apiKey?: string;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchFn;
  modelName?: string;
  maxImageBytes?: number;
}

const DEFAULT_MAX_IMAGE_BYTES = 2_000_000; // mirrors brand-vault-social-ocr DEFAULT_MAX_IMAGE_BYTES
const DEFAULT_MODEL_NAME = 'gemini-2.5-flash'; // mirrors brand-vault-social-ocr DEFAULT_MODEL_NAME
const HEX = /^#[0-9a-fA-F]{6}$/;

const PROMPT = [
  'You are a brand visual analyst. This thumbnail is a brand image the user just chose to publish.',
  'Return ONLY minified JSON, no prose, with this exact shape:',
  '{"primary":"#rrggbb","accent":"#rrggbb","supporting":["#rrggbb"],"minimalism":0.0,"contrastPreference":0.0,"expressiveness":0.0}',
  'primary/accent = the two most dominant brand colours as 6-digit hex. supporting = up to 3 more notable hex colours.',
  'minimalism = how sparse/clean vs busy the composition is (0 busy, 1 minimal).',
  'contrastPreference = overall visual contrast (0 soft/low, 1 high/punchy).',
  'expressiveness = visual energy (0 restrained, 1 bold/expressive).',
  'Omit any field you cannot judge confidently. Never invent colours that are not present in the image.',
].join(' ');

/**
 * Pure parser for the model's JSON reply. Validates hex, clamps dials to [0,1], dedupes the supporting
 * palette and drops primary/accent from it. Returns null when nothing usable was extracted.
 */
export function parseThumbnailVisualSignals(raw: string | undefined): ThumbnailVisualSignals | null {
  if (!raw) return null;
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1').trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch (err) {
    // FAILLOUD: remove after brand-vault verify (revert to `} catch { return null; }`)
    console.error('[FAILLOUD][BrandVault thumbnail-visual] JSON.parse failed', { raw: stripped.slice(0, 500), err });
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const hex = (v: unknown): string | undefined =>
    typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : undefined;
  const dial = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
  };

  const primary = hex(obj.primary);
  const accent = hex(obj.accent);
  const supporting = Array.isArray(obj.supporting)
    ? [...new Set(obj.supporting.map(hex).filter((c): c is string => Boolean(c)))]
        .filter((c) => c !== primary && c !== accent)
        .slice(0, 3)
    : [];
  const minimalism = dial(obj.minimalism);
  const contrastPreference = dial(obj.contrastPreference);
  const expressiveness = dial(obj.expressiveness);

  const hasAny = Boolean(
    primary || accent || supporting.length ||
    minimalism !== undefined || contrastPreference !== undefined || expressiveness !== undefined,
  );
  if (!hasAny) return null;

  return {
    palette: { primary, accent, supporting },
    visual: { minimalism, contrastPreference, expressiveness },
  };
}

const TAG = '[BrandVault thumbnail-visual]';

type BrandVaultThumbnailVisionUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type BrandVaultThumbnailVisionCostInput = {
  status: ProviderCostEventStatus;
  modelName: string;
  mimeType: string;
  imageBytes: number;
  outputChars?: number;
  parseableSignals?: boolean;
  functionMs?: number;
  usage?: BrandVaultThumbnailVisionUsage;
  error?: unknown;
};

export async function analyzeThumbnailVisualSignals(
  options: AnalyzeThumbnailVisualOptions,
): Promise<ThumbnailVisualSignals | null> {
  const env = options.env ?? process.env;
  // Kill switch is silent (intentional config); everything else logs why it produced nothing, so a
  // null is never a mystery in the logs.
  const enabled = options.enabled ?? env.BRAND_VAULT_THUMBNAIL_ANALYSIS_ENABLED !== 'false';
  if (!enabled) return null;
  const apiKey = options.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn(`${TAG} skipped: no GEMINI_API_KEY/GOOGLE_API_KEY`);
    return null;
  }
  if (!options.imageUrl) return null;

  const fetchFn = options.fetchFn ?? fetch;
  const maxBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const modelName = options.modelName ?? env.BRAND_VAULT_THUMBNAIL_ANALYSIS_MODEL ?? DEFAULT_MODEL_NAME;

  try {
    // ponytail: this image fetch mirrors brand-vault-social-ocr's fetchOcrImage; extract a shared
    // helper only if a third caller appears (rule of three).
    const res = await fetchFn(options.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' } });
    if (!res.ok) {
      console.warn(`${TAG} skipped: image fetch returned ${res.status}`);
      return null;
    }
    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!mimeType || !mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
      console.warn(`${TAG} skipped: not a raster image (${mimeType ?? 'unknown content-type'})`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      console.warn(`${TAG} skipped: image ${buffer.byteLength}b exceeds ${maxBytes}b`);
      return null;
    }

    const startedAt = Date.now();
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        PROMPT,
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ]);
      const rawText = result.response.text();
      const signals = parseThumbnailVisualSignals(rawText);
      await recordBrandVaultThumbnailVisionCost({
        status: 'success',
        modelName,
        mimeType,
        imageBytes: buffer.byteLength,
        outputChars: rawText.length,
        parseableSignals: Boolean(signals),
        functionMs: Date.now() - startedAt,
        usage: readGeminiUsage(result),
      });
      if (!signals) {
        console.error(`[FAILLOUD]${TAG} model returned no parseable signals`); // FAILLOUD: remove after brand-vault verify (revert to console.warn)
        return null;
      }
      const colors = [signals.palette.primary, signals.palette.accent, ...signals.palette.supporting].filter(Boolean);
      const dials = Object.entries(signals.visual)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      console.log(`${TAG} extracted palette(${colors.join(',') || 'none'})${dials ? ` ${dials}` : ''}`);
      return signals;
    } catch (err) {
      await recordBrandVaultThumbnailVisionCost({
        status: 'failed',
        modelName,
        mimeType,
        imageBytes: buffer.byteLength,
        functionMs: Date.now() - startedAt,
        error: err,
      });
      throw err;
    }
  } catch (err) {
    // FAILLOUD: remove after brand-vault verify (revert to console.warn message-only)
    console.error(`[FAILLOUD]${TAG} failed`, err);
    return null;
  }
}

async function recordBrandVaultThumbnailVisionCost(input: BrandVaultThumbnailVisionCostInput) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(PROMPT.length);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);
  await recordProviderCostEvent({
    status: input.status,
    service: 'brand_vault',
    action: 'brand_scan',
    route: 'lib/shared/brand-vault-thumbnail-visual',
    provider: 'gemini',
    model: cleanGeminiModelName(input.modelName),
    operation: 'image_vision',
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
      sourceKind: 'committed_thumbnail',
      mimeType: input.mimeType,
      imageBytes: input.imageBytes,
      outputChars: input.outputChars,
      parseableSignals: input.parseableSignals,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

function readGeminiUsage(result: unknown): BrandVaultThumbnailVisionUsage | undefined {
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
