import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  assertProviderPromptAllowed,
  type ProviderPrivacyAuditRecord,
} from '../../lib/thinkforge/privacy/provider-privacy-gateway';

export type EvalProvider = 'gemini' | 'deepseek' | 'openrouter';

export interface EvalUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}

export interface EvalProviderConfig {
  provider: EvalProvider;
  model: string;
  apiKey: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface EvalRunResult {
  output: string;
  latencyMs: number;
  usage?: EvalUsage;
  estimatedCostUsd?: number;
  costEstimateNote: string;
  privacyAudit: ProviderPrivacyAuditRecord;
}

type RawEvalRunResult = Omit<
  EvalRunResult,
  'latencyMs' | 'estimatedCostUsd' | 'costEstimateNote' | 'privacyAudit'
>;

interface ChatCompletionMessage {
  role?: string;
  content?: string;
  reasoning_content?: string;
  refusal?: string;
}

interface ChatCompletionChoice {
  message?: ChatCompletionMessage;
  finish_reason?: string;
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  error?: {
    message?: string;
  };
  message?: string;
}

interface PriceHint {
  inputUsdPerMillion?: number;
  inputCacheHitUsdPerMillion?: number;
  outputUsdPerMillion?: number;
  source: string;
}

const DEFAULT_MODELS: Record<EvalProvider, string> = {
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-v4-flash',
  openrouter: 'deepseek/deepseek-chat',
};

const DEFAULT_PRICE_HINTS: Record<string, PriceHint> = {
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

export function parseEvalProviders(value: string | undefined): EvalProvider[] {
  const raw = value ?? 'gemini,deepseek';
  const providers = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const parsed = providers.map((provider) => {
    if (provider !== 'gemini' && provider !== 'deepseek' && provider !== 'openrouter') {
      throw new Error(`Unsupported eval provider "${provider}". Use gemini, deepseek, or openrouter.`);
    }
    return provider;
  });

  return Array.from(new Set(parsed));
}

export function buildEvalProviderConfig(args: {
  provider: EvalProvider;
  model?: string;
  temperature: number;
  maxOutputTokens: number;
}): EvalProviderConfig {
  const model = args.model ?? process.env[`${args.provider.toUpperCase()}_EVAL_MODEL`] ?? DEFAULT_MODELS[args.provider];
  const apiKey = readApiKey(args.provider);

  return {
    provider: args.provider,
    model,
    apiKey,
    temperature: args.temperature,
    maxOutputTokens: args.maxOutputTokens,
  };
}

export async function runEvalPrompt(config: EvalProviderConfig, prompt: string): Promise<EvalRunResult> {
  const privacy = assertProviderPromptAllowed({
    provider: config.provider,
    model: config.model,
    routePurpose: 'eval',
    prompt,
    fieldsSent: ['prompt'],
  });
  const start = Date.now();
  const raw = config.provider === 'gemini'
    ? await runGeminiPrompt(config, privacy.prompt)
    : await runOpenAICompatiblePrompt(config, privacy.prompt);
  const latencyMs = Date.now() - start;
  const cost = estimateCost(config, raw.usage);

  return {
    ...raw,
    latencyMs,
    estimatedCostUsd: cost.estimatedCostUsd,
    costEstimateNote: cost.note,
    privacyAudit: privacy.audit,
  };
}

function readApiKey(provider: EvalProvider): string {
  const key = provider === 'gemini'
    ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    : provider === 'deepseek'
      ? process.env.DEEPSEEK_API_KEY
      : process.env.OPENROUTER_API_KEY;

  if (!key) {
    const names = provider === 'gemini'
      ? 'GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
      : provider === 'deepseek'
        ? 'DEEPSEEK_API_KEY'
        : 'OPENROUTER_API_KEY';
    throw new Error(`Missing API key for ${provider}. Set ${names}.`);
  }

  return key;
}

async function runGeminiPrompt(
  config: EvalProviderConfig,
  prompt: string,
): Promise<RawEvalRunResult> {
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({ model: config.model });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    },
  });

  const usage = result.response.usageMetadata as
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;

  return {
    output: result.response.text(),
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  };
}

async function runOpenAICompatiblePrompt(
  config: EvalProviderConfig,
  prompt: string,
): Promise<RawEvalRunResult> {
  const baseUrl = config.provider === 'deepseek'
    ? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
    : process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL ?? 'https://insturix.local';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME ?? 'ThinkForge eval';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      max_tokens: config.maxOutputTokens,
      stream: false,
    }),
  });

  const text = await response.text();
  const body = parseJson<ChatCompletionResponse>(text);

  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`${config.provider} request failed (${response.status}): ${message}`);
  }

  const output = body?.choices?.[0]?.message?.content;
  if (!output || output.trim().length === 0) {
    throw new Error(`${config.provider} response did not include choices[0].message.content; ${responseDiagnostic(body, text)}`);
  }

  return {
    output,
    usage: body.usage
      ? {
          promptTokens: body.usage.prompt_tokens,
          completionTokens: body.usage.completion_tokens,
          totalTokens: body.usage.total_tokens,
          promptCacheHitTokens: body.usage.prompt_cache_hit_tokens,
          promptCacheMissTokens: body.usage.prompt_cache_miss_tokens,
        }
      : undefined,
  };
}

function parseJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function responseDiagnostic(body: ChatCompletionResponse | undefined, rawText: string): string {
  if (!body) {
    return `raw=${rawText.slice(0, 1000)}`;
  }

  return `response=${JSON.stringify({
    choices: body.choices?.map((choice) => ({
      finishReason: choice.finish_reason,
      messageKeys: Object.keys(choice.message ?? {}),
      contentLength: choice.message?.content?.length ?? 0,
      reasoningContentLength: choice.message?.reasoning_content?.length ?? 0,
      refusalLength: choice.message?.refusal?.length ?? 0,
    })),
    usage: body.usage,
    error: body.error,
    message: body.message,
  }).slice(0, 1000)}`;
}

function estimateCost(config: EvalProviderConfig, usage: EvalUsage | undefined): {
  estimatedCostUsd?: number;
  note: string;
} {
  if (!usage?.promptTokens && !usage?.completionTokens) {
    return { note: 'usage_missing' };
  }

  const price = readPriceHint(config.provider, config.model);
  if (price.inputUsdPerMillion === undefined || price.outputUsdPerMillion === undefined) {
    return { note: 'price_missing_set_eval_price_env' };
  }

  const promptTokens = usage.promptTokens ?? 0;
  const cacheHitTokens = usage.promptCacheHitTokens ?? 0;
  const cacheMissTokens = usage.promptCacheMissTokens ?? Math.max(0, promptTokens - cacheHitTokens);
  const input = price.inputCacheHitUsdPerMillion !== undefined
    && (usage.promptCacheHitTokens !== undefined || usage.promptCacheMissTokens !== undefined)
    ? (cacheHitTokens / 1_000_000) * price.inputCacheHitUsdPerMillion
      + (cacheMissTokens / 1_000_000) * price.inputUsdPerMillion
    : (promptTokens / 1_000_000) * price.inputUsdPerMillion;
  const output = ((usage.completionTokens ?? 0) / 1_000_000) * price.outputUsdPerMillion;
  return {
    estimatedCostUsd: input + output,
    note: price.source,
  };
}

function readPriceHint(provider: EvalProvider, model: string): PriceHint {
  const modelKey = model.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const providerKey = provider.toUpperCase();
  const modelInput = readNumberEnv(`EVAL_PRICE_${providerKey}_${modelKey}_INPUT_PER_1M`);
  const modelOutput = readNumberEnv(`EVAL_PRICE_${providerKey}_${modelKey}_OUTPUT_PER_1M`);
  if (modelInput !== undefined || modelOutput !== undefined) {
    return {
      inputUsdPerMillion: modelInput,
      outputUsdPerMillion: modelOutput,
      source: `env:EVAL_PRICE_${providerKey}_${modelKey}_*`,
    };
  }

  const providerInput = readNumberEnv(`EVAL_PRICE_${providerKey}_INPUT_PER_1M`);
  const providerOutput = readNumberEnv(`EVAL_PRICE_${providerKey}_OUTPUT_PER_1M`);
  if (providerInput !== undefined || providerOutput !== undefined) {
    return {
      inputUsdPerMillion: providerInput,
      outputUsdPerMillion: providerOutput,
      source: `env:EVAL_PRICE_${providerKey}_*`,
    };
  }

  return DEFAULT_PRICE_HINTS[`${provider}:${model}`] ?? {
    source: 'price_missing_set_eval_price_env',
  };
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
