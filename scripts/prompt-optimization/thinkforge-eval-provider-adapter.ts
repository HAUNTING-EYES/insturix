import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  assertProviderPromptAllowed,
  type ProviderPrivacyAuditRecord,
} from '../../lib/thinkforge/privacy/provider-privacy-gateway';
import {
  authorizeThinkForgeEvalProviderDispatch,
  estimateThinkForgeEvalProviderCost,
  type ThinkForgeEvalProvider,
  type ThinkForgeEvalProviderRole,
} from '../../lib/thinkforge/eval/provider-budget';

export type EvalProvider = ThinkForgeEvalProvider;

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
  budgetRole?: ThinkForgeEvalProviderRole;
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

const DEFAULT_MODELS: Record<EvalProvider, string> = {
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-v4-flash',
  openrouter: 'deepseek/deepseek-chat',
  anthropic: 'claude-sonnet-4-6',
};

const DEFAULT_TRANSIENT_RETRY_ATTEMPTS = 3;
const DEFAULT_TRANSIENT_RETRY_BASE_MS = 400;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;

export function parseEvalProviders(value: string | undefined): EvalProvider[] {
  const raw = value ?? 'gemini,deepseek';
  const providers = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const parsed = providers.map((provider) => {
    if (provider !== 'gemini' && provider !== 'deepseek' && provider !== 'openrouter' && provider !== 'anthropic') {
      throw new Error(`Unsupported eval provider "${provider}". Use gemini, anthropic, deepseek, or openrouter.`);
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
  const model = args.model ?? defaultEvalModelForProvider(args.provider);
  const apiKey = readApiKey(args.provider);

  return {
    provider: args.provider,
    model,
    apiKey,
    temperature: args.temperature,
    maxOutputTokens: args.maxOutputTokens,
  };
}

export function defaultEvalModelForProvider(provider: EvalProvider): string {
  return process.env[`${provider.toUpperCase()}_EVAL_MODEL`] ?? DEFAULT_MODELS[provider];
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
  const raw = await runProviderPromptWithRetry(config, privacy.prompt);
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

async function runProviderPromptWithRetry(
  config: EvalProviderConfig,
  prompt: string,
): Promise<RawEvalRunResult> {
  const attempts = resolveEvalTransientRetryAttempts();
  const requestTimeoutMs = readPositiveIntEnv('THINKFORGE_EVAL_REQUEST_TIMEOUT_MS')
    ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    authorizeThinkForgeEvalProviderDispatch({
      role: config.budgetRole ?? 'judge',
      provider: config.provider,
      model: config.model,
      label: `${config.provider}/${config.model}/attempt-${attempt}`,
      inputTokenUpperBound: Math.max(1, Buffer.byteLength(prompt, 'utf8')),
      maxOutputTokens: config.maxOutputTokens,
    });
    try {
      return await withEvalTimeout(
        (abortSignal) => config.provider === 'gemini'
          ? runGeminiPrompt(config, prompt, abortSignal)
          : config.provider === 'anthropic'
            ? runAnthropicPrompt(config, prompt, abortSignal)
            : runOpenAICompatiblePrompt(config, prompt, abortSignal),
        requestTimeoutMs,
        `${config.provider}/${config.model}`,
      );
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientProviderError(error)) {
        throw error;
      }

      await sleep(retryDelayMs(attempt));
    }
  }

  throw lastError;
}

function isTransientProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b/i.test(message)
    || /service unavailable|temporarily unavailable|timeout|timed out|rate limit|too many requests|overload|econnreset|etimedout|eai_again/i.test(message);
}

function retryDelayMs(attempt: number): number {
  const base = readNonNegativeNumberEnv('THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS')
    ?? DEFAULT_TRANSIENT_RETRY_BASE_MS;
  return base * attempt;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveEvalTransientRetryAttempts(): number {
  return readPositiveIntEnv('THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS')
    ?? DEFAULT_TRANSIENT_RETRY_ATTEMPTS;
}

export async function withEvalTimeout<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const reason = new Error(`Eval provider request timed out after ${timeoutMs}ms (${label}).`);
          controller.abort(reason);
          reject(reason);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readApiKey(provider: EvalProvider): string {
  const key = provider === 'gemini'
    ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    : provider === 'deepseek'
      ? process.env.DEEPSEEK_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
        : process.env.OPENROUTER_API_KEY;

  if (!key) {
    const names = provider === 'gemini'
      ? 'GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
      : provider === 'deepseek'
        ? 'DEEPSEEK_API_KEY'
        : provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : 'OPENROUTER_API_KEY';
    throw new Error(`Missing API key for ${provider}. Set ${names}.`);
  }

  return key;
}

async function runGeminiPrompt(
  config: EvalProviderConfig,
  prompt: string,
  abortSignal: AbortSignal,
): Promise<RawEvalRunResult> {
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({ model: config.model });
  const result = await model.generateContent(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
      },
    },
    { signal: abortSignal },
  );

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
  abortSignal: AbortSignal,
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
    signal: abortSignal,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      max_tokens: config.maxOutputTokens,
      stream: false,
      // DeepSeek V4 enables thinking by default. Eval verdicts are short JSON,
      // so reserve the completion budget for the answer rather than hidden CoT.
      ...(config.provider === 'deepseek'
        ? { thinking: { type: 'disabled' } }
        : {}),
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

interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

async function runAnthropicPrompt(
  config: EvalProviderConfig,
  prompt: string,
  abortSignal: AbortSignal,
): Promise<RawEvalRunResult> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

  const response = await fetch(endpoint, {
    method: 'POST',
    signal: abortSignal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxOutputTokens,
      temperature: config.temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const text = await response.text();
  const body = parseJson<AnthropicMessagesResponse>(text);

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new Error(`anthropic request failed (${response.status}): ${message}`);
  }

  const output = (body?.content ?? [])
    .map((block) => block?.text ?? '')
    .join('')
    .trim();
  if (!output) {
    throw new Error(`anthropic response had no text content; raw=${text.slice(0, 600)}`);
  }

  return {
    output,
    usage: body?.usage
      ? {
          promptTokens: body.usage.input_tokens,
          completionTokens: body.usage.output_tokens,
          totalTokens: (body.usage.input_tokens ?? 0) + (body.usage.output_tokens ?? 0),
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
  return estimateThinkForgeEvalProviderCost({
    provider: config.provider,
    model: config.model,
    usage,
  });
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNonNegativeNumberEnv(name: string): number | undefined {
  const parsed = readNumberEnv(name);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
