import { CREDITS_PER_USD } from '@/lib/config/creditCosts';

export const PROVIDER_COST_PRICING_VERSION = '2026-08-30.gemini-rates';

const GB = 1024 * 1024 * 1024;
const GEMINI_PRICING_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';
const GEMINI_3_6_FLASH_INPUT_USD_PER_TOKEN = 0.75 / 1_000_000;
const GEMINI_3_6_FLASH_OUTPUT_USD_PER_TOKEN = 3.75 / 1_000_000;
const GEMINI_2_5_FLASH_INPUT_USD_PER_TOKEN = 0.3 / 1_000_000;
const GEMINI_2_5_FLASH_OUTPUT_USD_PER_TOKEN = 2.5 / 1_000_000;
const GEMINI_2_5_FLASH_LITE_INPUT_USD_PER_TOKEN = 0.1 / 1_000_000;
const GEMINI_2_5_FLASH_LITE_OUTPUT_USD_PER_TOKEN = 0.4 / 1_000_000;
const GEMINI_3_1_PRO_PREVIEW_INPUT_USD_PER_TOKEN = 2 / 1_000_000;
const GEMINI_3_1_PRO_PREVIEW_OUTPUT_USD_PER_TOKEN = 12 / 1_000_000;
const GEMINI_EMBEDDING_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;

const GEMINI_TEXT_IMAGE_VIDEO_OPERATIONS = [
  'agent_generation',
  'ai_plan',
  'asset_analysis',
  'auto_edit_analysis',
  'brand_scan',
  'chat_completion',
  'image_analysis',
  'llm_completion_cached_context',
  'llm_completion_inline_context',
  'llm_search_grounded_direct',
  'llm_stream',
  'llm_stream_direct',
  'llm_structured',
  'llm_structured_cached_context',
  'llm_structured_direct',
  'llm_structured_fallback',
  'llm_structured_inline_context',
  'llm_text_direct',
  'summary_generation',
  'trend_search_grounded',
  'video_analysis',
  'video_understanding',
] as const;

export type ProviderCostBasis =
  | 'estimated_table'
  | 'provider_usage'
  | 'invoice_reconciled'
  | 'pricing_to_be_seen';

export type ProviderCostRateUnit =
  | 'request'
  | 'media_second'
  | 'media_minute'
  | 'image'
  | 'audio_character'
  | 'input_token'
  | 'output_token'
  | 'token'
  | 'storage_gb_month'
  | 'email';

export interface ProviderCostUnits {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  mediaSeconds?: number;
  mediaMinutes?: number;
  imageCount?: number;
  audioCharacters?: number;
  bytesIn?: number;
  bytesOut?: number;
  storageBytes?: number;
  queueMessages?: number;
  retryCount?: number;
  functionMs?: number;
  gpuSeconds?: number;
  requestCount?: number;
  emailCount?: number;
}

export interface ProviderCostRate {
  provider: string;
  operation: string;
  unit: ProviderCostRateUnit;
  usdPerUnit: number;
  model?: string;
  pricingVersion?: string;
  source: string;
}

export interface ProviderCostEstimateInput {
  provider: string;
  operation: string;
  model?: string;
  units?: ProviderCostUnits;
}

export interface ProviderCostEstimate {
  provider: string;
  operation: string;
  model?: string;
  estimatedCostUsd: number | null;
  costBasis: ProviderCostBasis;
  pricingVersion: string;
  missingPricing: boolean;
  quantity: number | null;
  unit: ProviderCostRateUnit | null;
  usdPerUnit: number | null;
  source?: string;
}

export interface ProviderCostEstimateOptions {
  rates?: readonly ProviderCostRate[];
  pricingVersion?: string;
}

export const PROVIDER_COST_RATES: readonly ProviderCostRate[] = [
  ...GEMINI_TEXT_IMAGE_VIDEO_OPERATIONS.flatMap((operation) =>
    geminiInputOutputTokenRates({
      operation,
      model: 'gemini-3.6-flash',
      inputUsdPerToken: GEMINI_3_6_FLASH_INPUT_USD_PER_TOKEN,
      outputUsdPerToken: GEMINI_3_6_FLASH_OUTPUT_USD_PER_TOKEN,
      source: `${GEMINI_PRICING_SOURCE}: Gemini 3.6 Flash Standard introductory pricing through 2026-12-31, $0.75/M input tokens and $3.75/M output tokens`,
    }),
  ),
  ...GEMINI_TEXT_IMAGE_VIDEO_OPERATIONS.flatMap((operation) =>
    geminiInputOutputTokenRates({
      operation,
      model: 'gemini-2.5-flash',
      inputUsdPerToken: GEMINI_2_5_FLASH_INPUT_USD_PER_TOKEN,
      outputUsdPerToken: GEMINI_2_5_FLASH_OUTPUT_USD_PER_TOKEN,
      source: `${GEMINI_PRICING_SOURCE}: Gemini 2.5 Flash Standard $0.30/M input text/image/video tokens, $2.50/M output tokens`,
    }),
  ),
  ...GEMINI_TEXT_IMAGE_VIDEO_OPERATIONS.flatMap((operation) =>
    geminiInputOutputTokenRates({
      operation,
      model: 'gemini-2.5-flash-lite',
      inputUsdPerToken: GEMINI_2_5_FLASH_LITE_INPUT_USD_PER_TOKEN,
      outputUsdPerToken: GEMINI_2_5_FLASH_LITE_OUTPUT_USD_PER_TOKEN,
      source: `${GEMINI_PRICING_SOURCE}: Gemini 2.5 Flash-Lite Standard $0.10/M input text/image/video tokens, $0.40/M output tokens`,
    }),
  ),
  ...['llm_completion_cached_context', 'llm_completion_inline_context', 'video_understanding'].flatMap((operation) =>
    geminiInputOutputTokenRates({
      operation,
      model: 'gemini-3.1-pro-preview',
      inputUsdPerToken: GEMINI_3_1_PRO_PREVIEW_INPUT_USD_PER_TOKEN,
      outputUsdPerToken: GEMINI_3_1_PRO_PREVIEW_OUTPUT_USD_PER_TOKEN,
      source: `${GEMINI_PRICING_SOURCE}: Gemini 3.1 Pro Preview Standard $2/M input and $12/M output for prompts <=200k tokens`,
    }),
  ),
  {
    provider: 'gemini',
    operation: 'embedding',
    model: 'gemini-embedding-001',
    unit: 'input_token',
    usdPerUnit: GEMINI_EMBEDDING_INPUT_USD_PER_TOKEN,
    source: `${GEMINI_PRICING_SOURCE}: Gemini Embedding $0.15/M input tokens`,
  },
  {
    provider: 'fal-ai',
    operation: 'video_generation',
    model: 'kling-2.6',
    unit: 'media_second',
    usdPerUnit: 0.14,
    source: 'lib/config/creditCosts.ts comment: Kling 2.6 audio $0.14/sec',
  },
  {
    provider: 'fal-ai',
    operation: 'video_generation',
    model: 'veo-3.1',
    unit: 'media_second',
    usdPerUnit: 0.4,
    source: 'lib/config/creditCosts.ts comment: Veo 3.1 audio $0.40/sec',
  },
  {
    provider: 'fal-ai',
    operation: 'video_generation',
    model: 'happy-horse-v1.1',
    unit: 'media_second',
    usdPerUnit: 0.18,
    source: 'lib/config/creditCosts.ts comment: happy-horse-v1.1 1080p $0.18/sec',
  },
  {
    provider: 'fal-ai',
    operation: 'sfx_generation',
    model: 'mirelo-ai/sfx-v1.5/video-to-audio',
    unit: 'media_second',
    usdPerUnit: 0.01,
    pricingVersion: '2026-07-28.fal-audio',
    source: 'https://fal.ai/models/mirelo-ai/sfx-v1.5/video-to-audio: $0.01 per generated second',
  },
  {
    provider: 'fal-ai',
    operation: 'sfx_generation',
    model: 'cassetteai/sound-effects-generator',
    unit: 'request',
    usdPerUnit: 0.01,
    pricingVersion: '2026-07-28.fal-audio',
    source: 'https://fal.ai/models/CassetteAI/sound-effects-generator: $0.01 per generation',
  },
  {
    provider: 'fal-ai',
    operation: 'voiceover_generation',
    model: 'fal-ai/kokoro/american-english',
    unit: 'audio_character',
    usdPerUnit: 0.02 / 1000,
    source: 'docs/agents/vault/06-Resources/APIs-Models-Keys-Costs.md: Kokoro $0.02/1000 characters',
  },
  {
    provider: 'cloudflare-r2',
    operation: 'storage',
    unit: 'storage_gb_month',
    usdPerUnit: 0.015,
    source: 'docs/agents/vault/06-Resources/APIs-Models-Keys-Costs.md: Cloudflare R2 $0.015/GB storage',
  },
  {
    provider: 'aws-ses',
    operation: 'email_send',
    unit: 'email',
    usdPerUnit: 0.1 / 1000,
    source: 'docs/agents/vault/06-Resources/APIs-Models-Keys-Costs.md: AWS SES $0.10/1000 emails',
  },
] as const;

export function estimateProviderCost(
  input: ProviderCostEstimateInput,
  options: ProviderCostEstimateOptions = {},
): ProviderCostEstimate {
  const pricingVersion = options.pricingVersion ?? PROVIDER_COST_PRICING_VERSION;
  const provider = normalizeProvider(input.provider);
  const operation = normalizeSegment(input.operation);
  const model = input.model ? normalizeModel(input.model) : undefined;
  const rates = options.rates ?? PROVIDER_COST_RATES;
  const matchedRates = findRates({ provider, operation, model }, rates);

  if (matchedRates.length === 0) {
    return {
      provider,
      operation,
      model,
      estimatedCostUsd: null,
      costBasis: 'pricing_to_be_seen',
      pricingVersion,
      missingPricing: true,
      quantity: inferPrimaryQuantity(input.units),
      unit: null,
      usdPerUnit: null,
    };
  }

  const pricedRates = matchedRates.map((rate) => ({
    rate,
    quantity: quantityForRateUnit(rate.unit, input.units),
  }));
  const availableRates = pricedRates.filter(
    (entry): entry is { rate: ProviderCostRate; quantity: number } => entry.quantity !== null,
  );
  const missingRequiredQuantity = availableRates.length !== pricedRates.length;

  if (availableRates.length === 0) {
    return {
      provider,
      operation,
      model,
      estimatedCostUsd: null,
      costBasis: 'pricing_to_be_seen',
      pricingVersion: pricingVersionForRates(matchedRates, pricingVersion),
      missingPricing: true,
      quantity: null,
      unit: summarizeRateUnit(matchedRates),
      usdPerUnit: summarizeUsdPerUnit(matchedRates),
      source: summarizeSources(matchedRates),
    };
  }

  return {
    provider,
    operation,
    model,
    estimatedCostUsd: roundUsd(
      availableRates.reduce((sum, entry) => sum + entry.quantity * entry.rate.usdPerUnit, 0),
    ),
    costBasis: missingRequiredQuantity ? 'pricing_to_be_seen' : 'estimated_table',
    pricingVersion: pricingVersionForRates(matchedRates, pricingVersion),
    missingPricing: missingRequiredQuantity,
    quantity: roundQuantity(availableRates.reduce((sum, entry) => sum + entry.quantity, 0)),
    unit: summarizeRateUnit(availableRates.map((entry) => entry.rate)),
    usdPerUnit: summarizeUsdPerUnit(availableRates.map((entry) => entry.rate)),
    source: summarizeSources(matchedRates),
  };
}

export function estimateRevenueUsdFromCredits(credits?: number | null): number | null {
  if (!isFinitePositiveOrZero(credits)) return null;
  return roundUsd(credits / CREDITS_PER_USD);
}

export function normalizeProvider(provider: string): string {
  const normalized = normalizeSegment(provider);
  const aliases: Record<string, string> = {
    fal: 'fal-ai',
    'fal.ai': 'fal-ai',
    fal_ai: 'fal-ai',
    r2: 'cloudflare-r2',
    cloudflare: 'cloudflare-r2',
    cloudflare_r2: 'cloudflare-r2',
    'google-gemini': 'gemini',
    google_gemini: 'gemini',
    google: 'gemini',
    google_genai: 'gemini',
    'google-generative-ai': 'gemini',
    ses: 'aws-ses',
  };
  return aliases[normalized] ?? normalized;
}

export function normalizeModel(model: string): string {
  const normalized = normalizeSegment(model).replace(/^models\//, '');
  const aliases: Record<string, string> = {
    'creative-doc-model': 'gemini-3.1-pro-preview',
  };
  return aliases[normalized] ?? normalized;
}

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function findRates(
  input: { provider: string; operation: string; model?: string },
  rates: readonly ProviderCostRate[],
): ProviderCostRate[] {
  const normalizedRates = rates.map((rate) => ({
    ...rate,
    provider: normalizeProvider(rate.provider),
    operation: normalizeSegment(rate.operation),
    model: rate.model ? normalizeModel(rate.model) : undefined,
  }));

  const exactModelRates = normalizedRates.filter(
    (rate) =>
      rate.provider === input.provider &&
      rate.operation === input.operation &&
      !!input.model &&
      rate.model === input.model,
  );
  if (exactModelRates.length > 0) return exactModelRates;

  return normalizedRates.filter(
    (rate) =>
      rate.provider === input.provider &&
      rate.operation === input.operation &&
      !rate.model,
  );
}

function quantityForRateUnit(unit: ProviderCostRateUnit, units: ProviderCostUnits = {}): number | null {
  switch (unit) {
    case 'request':
      return cleanQuantity(units.requestCount ?? 1);
    case 'media_second':
      return cleanQuantity(units.mediaSeconds ?? (units.mediaMinutes !== undefined ? units.mediaMinutes * 60 : undefined));
    case 'media_minute':
      return cleanQuantity(units.mediaMinutes ?? (units.mediaSeconds !== undefined ? units.mediaSeconds / 60 : undefined));
    case 'image':
      return cleanQuantity(units.imageCount);
    case 'audio_character':
      return cleanQuantity(units.audioCharacters);
    case 'input_token':
      return cleanQuantity(units.inputTokens);
    case 'output_token':
      return cleanQuantity(units.outputTokens);
    case 'token': {
      const tokenTotal =
        units.totalTokens ??
        (units.inputTokens !== undefined || units.outputTokens !== undefined
          ? (units.inputTokens ?? 0) + (units.outputTokens ?? 0)
          : undefined);
      return cleanQuantity(tokenTotal);
    }
    case 'storage_gb_month':
      return cleanQuantity(units.storageBytes !== undefined ? units.storageBytes / GB : undefined);
    case 'email':
      return cleanQuantity(units.emailCount ?? units.requestCount ?? 1);
    default:
      return null;
  }
}

function geminiInputOutputTokenRates(input: {
  operation: string;
  model: string;
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  source: string;
}): ProviderCostRate[] {
  return [
    {
      provider: 'gemini',
      operation: input.operation,
      model: input.model,
      unit: 'input_token',
      usdPerUnit: input.inputUsdPerToken,
      source: input.source,
    },
    {
      provider: 'gemini',
      operation: input.operation,
      model: input.model,
      unit: 'output_token',
      usdPerUnit: input.outputUsdPerToken,
      source: input.source,
    },
  ];
}

function summarizeRateUnit(rates: readonly ProviderCostRate[]): ProviderCostRateUnit | null {
  if (rates.length === 0) return null;
  const units = [...new Set(rates.map((rate) => rate.unit))];
  if (units.length === 1) return units[0];
  if (units.every((unit) => unit === 'input_token' || unit === 'output_token' || unit === 'token')) {
    return 'token';
  }
  return null;
}

function summarizeUsdPerUnit(rates: readonly ProviderCostRate[]): number | null {
  if (rates.length === 0) return null;
  const values = [...new Set(rates.map((rate) => rate.usdPerUnit))];
  return values.length === 1 ? values[0] : null;
}

function summarizeSources(rates: readonly ProviderCostRate[]): string | undefined {
  const sources = [...new Set(rates.map((rate) => rate.source).filter(Boolean))];
  return sources.length > 0 ? sources.join('; ') : undefined;
}

function pricingVersionForRates(rates: readonly ProviderCostRate[], fallback: string): string {
  const versions = [...new Set(rates.map((rate) => rate.pricingVersion).filter(Boolean))];
  return versions.length === 1 ? (versions[0] as string) : fallback;
}

function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function inferPrimaryQuantity(units: ProviderCostUnits = {}): number | null {
  const tokenTotal =
    units.totalTokens ??
    (units.inputTokens !== undefined || units.outputTokens !== undefined
      ? (units.inputTokens ?? 0) + (units.outputTokens ?? 0)
      : undefined);

  const candidates = [
    units.mediaSeconds,
    units.mediaMinutes,
    units.imageCount,
    units.audioCharacters,
    tokenTotal,
    units.storageBytes,
    units.requestCount,
    units.emailCount,
  ];

  for (const candidate of candidates) {
    const quantity = cleanQuantity(candidate);
    if (quantity !== null) return quantity;
  }

  return null;
}

function cleanQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isFinitePositiveOrZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}
