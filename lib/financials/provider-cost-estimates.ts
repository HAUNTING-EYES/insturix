import { CREDITS_PER_USD } from '@/lib/config/creditCosts';

export const PROVIDER_COST_PRICING_VERSION = '2026-07-01.phase1';

const GB = 1024 * 1024 * 1024;

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
    usdPerUnit: 0.007,
    source: 'docs/agents/vault/06-Resources/APIs-Models-Keys-Costs.md: Mirelo $0.007/sec/sample',
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
  const rate = findRate({ provider, operation, model }, rates);

  if (!rate) {
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

  const quantity = quantityForRateUnit(rate.unit, input.units);
  if (quantity === null) {
    return {
      provider,
      operation,
      model,
      estimatedCostUsd: null,
      costBasis: 'pricing_to_be_seen',
      pricingVersion: rate.pricingVersion ?? pricingVersion,
      missingPricing: true,
      quantity: null,
      unit: rate.unit,
      usdPerUnit: rate.usdPerUnit,
      source: rate.source,
    };
  }

  return {
    provider,
    operation,
    model,
    estimatedCostUsd: roundUsd(quantity * rate.usdPerUnit),
    costBasis: 'estimated_table',
    pricingVersion: rate.pricingVersion ?? pricingVersion,
    missingPricing: false,
    quantity,
    unit: rate.unit,
    usdPerUnit: rate.usdPerUnit,
    source: rate.source,
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
    ses: 'aws-ses',
  };
  return aliases[normalized] ?? normalized;
}

export function normalizeModel(model: string): string {
  return normalizeSegment(model);
}

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function findRate(
  input: { provider: string; operation: string; model?: string },
  rates: readonly ProviderCostRate[],
): ProviderCostRate | undefined {
  const normalizedRates = rates.map((rate) => ({
    ...rate,
    provider: normalizeProvider(rate.provider),
    operation: normalizeSegment(rate.operation),
    model: rate.model ? normalizeModel(rate.model) : undefined,
  }));

  return (
    normalizedRates.find(
      (rate) =>
        rate.provider === input.provider &&
        rate.operation === input.operation &&
        !!input.model &&
        rate.model === input.model,
    ) ??
    normalizedRates.find(
      (rate) =>
        rate.provider === input.provider &&
        rate.operation === input.operation &&
        !rate.model,
    )
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
