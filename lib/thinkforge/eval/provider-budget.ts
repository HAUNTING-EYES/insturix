import { AsyncLocalStorage } from 'node:async_hooks';

export type ThinkForgeEvalProvider = 'gemini' | 'deepseek' | 'openrouter' | 'anthropic';
export type ThinkForgeEvalProviderRole = 'writer' | 'judge';

interface PriceHint {
  inputUsdPerMillion?: number;
  inputCacheHitUsdPerMillion?: number;
  outputUsdPerMillion?: number;
  source: string;
}

export interface ThinkForgeEvalUsage {
  promptTokens?: number;
  completionTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}

export interface ThinkForgeEvalCostEstimate {
  estimatedCostUsd?: number;
  note: string;
}

export interface ThinkForgeEvalDispatch {
  role: ThinkForgeEvalProviderRole;
  provider: ThinkForgeEvalProvider;
  model: string;
  label: string;
  inputTokenUpperBound: number;
  maxOutputTokens: number;
}

export interface ThinkForgeEvalBudgetLimits {
  maxProviderRequests: number;
  maxWriterRequests: number;
  maxJudgeRequests: number;
  maxOutputTokens: number;
  maxEstimatedCostUsd: number;
  costSafetyMultiplier?: number;
}

export interface ThinkForgeEvalBudgetSnapshot {
  limits: Required<ThinkForgeEvalBudgetLimits>;
  providerRequests: number;
  writerRequests: number;
  judgeRequests: number;
  reservedOutputTokens: number;
  estimatedCostUpperBoundUsd: number;
  dispatches: Array<ThinkForgeEvalDispatch & {
    sequence: number;
    estimatedCostUpperBoundUsd: number;
    priceSource: string;
  }>;
}

const DEFAULT_COST_SAFETY_MULTIPLIER = 2;

const DEFAULT_PRICE_HINTS: Readonly<Record<string, PriceHint>> = {
  'gemini:gemini-2.5-flash': {
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 2.5,
    source: 'builtin:google_gemini_2_5_flash_standard_2026_06_14',
  },
  'deepseek:deepseek-v4-flash': {
    inputUsdPerMillion: 0.14,
    inputCacheHitUsdPerMillion: 0.0028,
    outputUsdPerMillion: 0.28,
    source: 'builtin:deepseek_v4_flash_2026_06_14',
  },
  'deepseek:deepseek-chat': {
    inputUsdPerMillion: 0.14,
    inputCacheHitUsdPerMillion: 0.0028,
    outputUsdPerMillion: 0.28,
    source: 'builtin:deepseek_chat_compat_v4_flash_2026_06_14',
  },
};

export class ThinkForgeEvalBudgetExceededError extends Error {
  readonly code = 'THINKFORGE_EVAL_BUDGET_EXCEEDED';

  constructor(readonly reason: string) {
    super(`ThinkForge eval budget exceeded before provider dispatch: ${reason}`);
    this.name = 'ThinkForgeEvalBudgetExceededError';
  }
}

function normalizedModelName(model: string): string {
  return model.replace(/^models\//, '').trim();
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readPriceHint(provider: ThinkForgeEvalProvider, model: string): PriceHint {
  const normalizedModel = normalizedModelName(model);
  const modelKey = normalizedModel.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const providerKey = provider.toUpperCase();
  const modelInput = readNumberEnv(`EVAL_PRICE_${providerKey}_${modelKey}_INPUT_PER_1M`);
  const modelCacheHit = readNumberEnv(`EVAL_PRICE_${providerKey}_${modelKey}_CACHE_HIT_INPUT_PER_1M`);
  const modelOutput = readNumberEnv(`EVAL_PRICE_${providerKey}_${modelKey}_OUTPUT_PER_1M`);
  if (modelInput !== undefined || modelOutput !== undefined) {
    return {
      inputUsdPerMillion: modelInput,
      inputCacheHitUsdPerMillion: modelCacheHit,
      outputUsdPerMillion: modelOutput,
      source: `env:EVAL_PRICE_${providerKey}_${modelKey}_*`,
    };
  }

  const providerInput = readNumberEnv(`EVAL_PRICE_${providerKey}_INPUT_PER_1M`);
  const providerCacheHit = readNumberEnv(`EVAL_PRICE_${providerKey}_CACHE_HIT_INPUT_PER_1M`);
  const providerOutput = readNumberEnv(`EVAL_PRICE_${providerKey}_OUTPUT_PER_1M`);
  if (providerInput !== undefined || providerOutput !== undefined) {
    return {
      inputUsdPerMillion: providerInput,
      inputCacheHitUsdPerMillion: providerCacheHit,
      outputUsdPerMillion: providerOutput,
      source: `env:EVAL_PRICE_${providerKey}_*`,
    };
  }

  return DEFAULT_PRICE_HINTS[`${provider}:${normalizedModel}`] ?? {
    source: 'price_missing_set_eval_price_env',
  };
}

export function estimateThinkForgeEvalProviderCost(input: {
  provider: ThinkForgeEvalProvider;
  model: string;
  usage: ThinkForgeEvalUsage;
}): ThinkForgeEvalCostEstimate {
  const price = readPriceHint(input.provider, input.model);
  if (price.inputUsdPerMillion === undefined || price.outputUsdPerMillion === undefined) {
    return { note: price.source };
  }

  const promptTokens = Math.max(0, input.usage.promptTokens ?? 0);
  const cacheHitTokens = Math.max(0, input.usage.promptCacheHitTokens ?? 0);
  const cacheMissTokens = Math.max(
    0,
    input.usage.promptCacheMissTokens ?? promptTokens - cacheHitTokens,
  );
  const inputCost = price.inputCacheHitUsdPerMillion !== undefined
    && (input.usage.promptCacheHitTokens !== undefined
      || input.usage.promptCacheMissTokens !== undefined)
    ? (cacheHitTokens / 1_000_000) * price.inputCacheHitUsdPerMillion
      + (cacheMissTokens / 1_000_000) * price.inputUsdPerMillion
    : (promptTokens / 1_000_000) * price.inputUsdPerMillion;
  const outputCost = (
    Math.max(0, input.usage.completionTokens ?? 0) / 1_000_000
  ) * price.outputUsdPerMillion;

  return {
    estimatedCostUsd: inputCost + outputCost,
    note: price.source,
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number`);
  }
  return value;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
  return value;
}

function atLeastOneFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a finite number greater than or equal to 1`);
  }
  return value;
}

export class ThinkForgeEvalProviderBudget {
  private readonly limits: Required<ThinkForgeEvalBudgetLimits>;
  private providerRequests = 0;
  private writerRequests = 0;
  private judgeRequests = 0;
  private reservedOutputTokens = 0;
  private estimatedCostUpperBoundUsd = 0;
  private readonly dispatches: ThinkForgeEvalBudgetSnapshot['dispatches'] = [];

  constructor(limits: ThinkForgeEvalBudgetLimits) {
    this.limits = {
      maxProviderRequests: positiveInteger(limits.maxProviderRequests, 'maxProviderRequests'),
      maxWriterRequests: positiveInteger(limits.maxWriterRequests, 'maxWriterRequests'),
      maxJudgeRequests: positiveInteger(limits.maxJudgeRequests, 'maxJudgeRequests'),
      maxOutputTokens: positiveInteger(limits.maxOutputTokens, 'maxOutputTokens'),
      maxEstimatedCostUsd: nonNegativeFinite(limits.maxEstimatedCostUsd, 'maxEstimatedCostUsd'),
      costSafetyMultiplier: limits.costSafetyMultiplier === undefined
        ? DEFAULT_COST_SAFETY_MULTIPLIER
        : atLeastOneFinite(limits.costSafetyMultiplier, 'costSafetyMultiplier'),
    };
  }

  authorizeDispatch(dispatch: ThinkForgeEvalDispatch): void {
    const inputTokenUpperBound = positiveInteger(
      dispatch.inputTokenUpperBound,
      `${dispatch.label}.inputTokenUpperBound`,
    );
    const maxOutputTokens = positiveInteger(
      dispatch.maxOutputTokens,
      `${dispatch.label}.maxOutputTokens`,
    );
    const cost = estimateThinkForgeEvalProviderCost({
      provider: dispatch.provider,
      model: dispatch.model,
      usage: {
        promptTokens: inputTokenUpperBound,
        completionTokens: maxOutputTokens,
      },
    });
    if (cost.estimatedCostUsd === undefined) {
      throw new ThinkForgeEvalBudgetExceededError(
        `price_unknown:${dispatch.provider}/${normalizedModelName(dispatch.model)}:${cost.note}`,
      );
    }

    const dispatchCostUpperBound = cost.estimatedCostUsd * this.limits.costSafetyMultiplier;
    const nextProviderRequests = this.providerRequests + 1;
    const nextWriterRequests = this.writerRequests + (dispatch.role === 'writer' ? 1 : 0);
    const nextJudgeRequests = this.judgeRequests + (dispatch.role === 'judge' ? 1 : 0);
    const nextOutputTokens = this.reservedOutputTokens + maxOutputTokens;
    const nextEstimatedCost = this.estimatedCostUpperBoundUsd + dispatchCostUpperBound;

    const violations = [
      nextProviderRequests > this.limits.maxProviderRequests
        ? `provider_requests:${nextProviderRequests}/${this.limits.maxProviderRequests}`
        : null,
      nextWriterRequests > this.limits.maxWriterRequests
        ? `writer_requests:${nextWriterRequests}/${this.limits.maxWriterRequests}`
        : null,
      nextJudgeRequests > this.limits.maxJudgeRequests
        ? `judge_requests:${nextJudgeRequests}/${this.limits.maxJudgeRequests}`
        : null,
      nextOutputTokens > this.limits.maxOutputTokens
        ? `output_tokens:${nextOutputTokens}/${this.limits.maxOutputTokens}`
        : null,
      nextEstimatedCost > this.limits.maxEstimatedCostUsd + Number.EPSILON
        ? `estimated_usd:${nextEstimatedCost.toFixed(6)}/${this.limits.maxEstimatedCostUsd.toFixed(6)}`
        : null,
    ].filter((violation): violation is string => Boolean(violation));

    if (violations.length > 0) {
      throw new ThinkForgeEvalBudgetExceededError(violations.join(','));
    }

    this.providerRequests = nextProviderRequests;
    this.writerRequests = nextWriterRequests;
    this.judgeRequests = nextJudgeRequests;
    this.reservedOutputTokens = nextOutputTokens;
    this.estimatedCostUpperBoundUsd = nextEstimatedCost;
    this.dispatches.push({
      ...dispatch,
      inputTokenUpperBound,
      maxOutputTokens,
      sequence: nextProviderRequests,
      estimatedCostUpperBoundUsd: dispatchCostUpperBound,
      priceSource: cost.note,
    });
  }

  snapshot(): ThinkForgeEvalBudgetSnapshot {
    return {
      limits: { ...this.limits },
      providerRequests: this.providerRequests,
      writerRequests: this.writerRequests,
      judgeRequests: this.judgeRequests,
      reservedOutputTokens: this.reservedOutputTokens,
      estimatedCostUpperBoundUsd: this.estimatedCostUpperBoundUsd,
      dispatches: this.dispatches.map((dispatch) => ({ ...dispatch })),
    };
  }
}

const evalBudgetStorage = new AsyncLocalStorage<ThinkForgeEvalProviderBudget>();

export function runWithThinkForgeEvalProviderBudget<T>(
  budget: ThinkForgeEvalProviderBudget,
  operation: () => Promise<T>,
): Promise<T> {
  return evalBudgetStorage.run(budget, operation);
}

export function authorizeThinkForgeEvalProviderDispatch(
  dispatch: ThinkForgeEvalDispatch,
): void {
  evalBudgetStorage.getStore()?.authorizeDispatch(dispatch);
}
