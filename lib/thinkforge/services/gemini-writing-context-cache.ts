import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateObject } from 'ai';
import type { z } from 'zod';
import { createThinkForgeModel } from '../agents/model-factory';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';

const CACHE_TTL_SECONDS = 1800;
const CACHE_STORE_TIMEOUT_MS = 1_500;
const REDIS_KEY = 'thinkforge:gemini:creative-content-cache:v2';
const DEFAULT_CACHE_MODEL = 'models/gemini-2.5-flash';

interface CacheEntry {
  cacheName: string;
  expiresAt: number;
  createdAt: number;
  modelName: string;
  contextHash: string;
}

export interface WritingContextGenerationInput {
  prompt: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface WritingContextGenerationResult {
  text: string;
  cacheStatus: 'hit' | 'created' | 'inline';
  modelName: string;
}

export interface WritingContextStructuredGenerationInput<TOutput> extends WritingContextGenerationInput {
  schema: z.ZodType<TOutput>;
}

export interface WritingContextStructuredGenerationResult<TOutput> {
  result: TOutput;
  cacheStatus: WritingContextGenerationResult['cacheStatus'];
  modelName: string;
}

interface ResolvedWritingContext {
  cacheName?: string;
  cacheStatus: WritingContextGenerationResult['cacheStatus'];
  modelName: string;
  systemInstruction: string;
}

let cachedDocText: string | null = null;

type GeminiWritingContextOperation =
  | 'context_cache_create'
  | 'llm_completion_cached_context'
  | 'llm_completion_inline_context'
  | 'llm_structured_cached_context'
  | 'llm_structured_inline_context';

type GeminiWritingContextUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

async function recordThinkForgeWritingContextCost(input: {
  status: ProviderCostEventStatus;
  modelName: string;
  operation: GeminiWritingContextOperation;
  cacheStatus?: WritingContextGenerationResult['cacheStatus'];
  userInputChars?: number;
  systemInstructionChars?: number;
  outputChars?: number;
  functionMs?: number;
  usage?: GeminiWritingContextUsage;
  error?: unknown;
}) {
  const estimatedInputTokens = estimateTokensFromChars(
    sumOptional(input.userInputChars, input.systemInstructionChars),
  );
  const estimatedOutputTokens = estimateTokensFromChars(input.outputChars);

  void recordProviderCostEvent({
    status: input.status,
    service: 'thinkforge',
    action: 'writing_context_cache',
    route: 'lib/thinkforge/services/gemini-writing-context-cache',
    provider: 'gemini',
    model: cleanGeminiModelName(input.modelName),
    operation: input.operation,
    units: {
      requestCount: 1,
      inputTokens: input.usage?.inputTokens ?? estimatedInputTokens,
      outputTokens: input.usage?.outputTokens ?? estimatedOutputTokens,
      totalTokens:
        input.usage?.totalTokens ??
        sumOptional(
          input.usage?.inputTokens ?? estimatedInputTokens,
          input.usage?.outputTokens ?? estimatedOutputTokens,
        ),
      functionMs: input.functionMs,
    },
    metadata: {
      cacheStatus: input.cacheStatus,
      hasCachedContext: input.cacheStatus === 'hit' || input.cacheStatus === 'created',
      userInputChars: input.userInputChars,
      systemInstructionChars: input.systemInstructionChars,
      outputChars: input.outputChars,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  }).catch((error) => {
    console.warn('[ThinkForgeWritingCache] Provider cost event failed:', error);
  });
}

function readGeminiUsage(result: unknown): GeminiWritingContextUsage | undefined {
  const root = asRecord(result);
  const response = asRecord(root?.response);
  const usage = asRecord(root?.usageMetadata ?? response?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokenCount ?? usage.inputTokenCount ?? usage.inputTokens);
  const outputTokens = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount ?? usage.outputTokens);
  const totalTokens = readNumber(usage.totalTokenCount ?? usage.totalTokens);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function cleanGeminiModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === 'number' && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(...values: Array<number | undefined>): number | undefined {
  let sawValue = false;
  let total = 0;
  for (const value of values) {
    if (value === undefined) continue;
    sawValue = true;
    total += value;
  }
  return sawValue ? total : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeCacheModelName(modelName?: string): string {
  const selected = modelName || process.env.THINKFORGE_WRITING_CONTEXT_MODEL || DEFAULT_CACHE_MODEL;
  return selected.startsWith('models/') ? selected : `models/${selected}`;
}

function toRuntimeModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('No GEMINI_API_KEY or GOOGLE_API_KEY');
  return apiKey;
}

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function withCacheStoreDeadline<T>(promise: Promise<T>, operation: 'read' | 'write'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis cache ${operation} exceeded ${CACHE_STORE_TIMEOUT_MS}ms`));
    }, CACHE_STORE_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function getCreativeContentKnowledgeText(): string {
  if (cachedDocText) return cachedDocText;

  const attempts = [join(process.cwd(), 'docs', 'creative-content-knowledge.md')];
  if (typeof __dirname !== 'undefined') {
    attempts.push(join(__dirname, '..', '..', '..', 'docs', 'creative-content-knowledge.md'));
  }

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      cachedDocText = readFileSync(attempt, 'utf8');
      return cachedDocText;
    } catch (error: any) {
      failures.push(`${attempt}: ${error?.code || error?.message || String(error)}`);
    }
  }

  throw new Error(`[ThinkForgeWritingCache] Failed to load creative-content-knowledge.md:\n${failures.join('\n')}`);
}

export function buildWritingContextSystemInstruction(docText = getCreativeContentKnowledgeText()): string {
  return [
    '<creative_content_knowledge>',
    docText,
    '</creative_content_knowledge>',
    '',
    '<thinkforge_writing_context_rules>',
    '- Use the creative content knowledge as writing intelligence, not as rigid templates.',
    '- Content type emerges from signals, FORMAT, brand voice, platform, and user intent.',
    '- Execute selected writing techniques with concrete, source-grounded craft.',
    '- Do not mention this cached document or internal signal machinery in user-facing output.',
    '</thinkforge_writing_context_rules>',
  ].join('\n');
}

function hashWritingContext(systemInstruction: string): string {
  return createHash('sha256').update(systemInstruction).digest('hex');
}

async function getCachedEntry(modelName: string, contextHash: string): Promise<CacheEntry | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const entry = await withCacheStoreDeadline(redis.get<CacheEntry>(REDIS_KEY), 'read');
    if (!entry || entry.modelName !== modelName || entry.contextHash !== contextHash) return null;
    if (Date.now() > entry.expiresAt - 60_000) return null;
    return entry;
  } catch (error) {
    console.warn('[ThinkForgeWritingCache] Redis read failed:', error);
    return null;
  }
}

async function storeCacheEntry(cacheName: string, modelName: string, contextHash: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    const entry: CacheEntry = {
      cacheName,
      modelName,
      contextHash,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
      createdAt: Date.now(),
    };
    await withCacheStoreDeadline(redis.set(REDIS_KEY, entry, { ex: CACHE_TTL_SECONDS }), 'write');
  } catch (error) {
    console.warn('[ThinkForgeWritingCache] Redis write failed:', error);
  }
}

async function createCache(
  modelName: string,
  contextHash: string,
  systemInstruction: string,
): Promise<string | null> {
  const startedAt = Date.now();

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: getApiKey() });
    const cache = await client.caches.create({
      model: toRuntimeModelName(modelName),
      config: {
        displayName: 'thinkforge-creative-content-knowledge-v2',
        systemInstruction,
        ttl: `${CACHE_TTL_SECONDS}s`,
      },
    });

    if (!cache.name) throw new Error('Cache creation returned no name');
    await storeCacheEntry(cache.name, modelName, contextHash);
    recordThinkForgeWritingContextCost({
      status: 'success',
      modelName,
      operation: 'context_cache_create',
      cacheStatus: 'created',
      systemInstructionChars: systemInstruction.length,
      functionMs: Date.now() - startedAt,
    });
    return cache.name;
  } catch (error) {
    recordThinkForgeWritingContextCost({
      status: 'failed',
      modelName,
      operation: 'context_cache_create',
      systemInstructionChars: systemInstruction.length,
      functionMs: Date.now() - startedAt,
      error,
    });
    console.warn('[ThinkForgeWritingCache] Cache creation failed; using inline context:', error);
    return null;
  }
}

async function resolveWritingContext(modelName: string): Promise<ResolvedWritingContext> {
  const systemInstruction = buildWritingContextSystemInstruction();
  const contextHash = hashWritingContext(systemInstruction);
  const existing = await getCachedEntry(modelName, contextHash);

  if (existing) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey: getApiKey() });
      const cache = await client.caches.get({ name: existing.cacheName });
      if (!cache.name) throw new Error('Cached context returned no name');
      return {
        cacheName: existing.cacheName,
        cacheStatus: 'hit',
        modelName,
        systemInstruction,
      };
    } catch (error) {
      console.warn('[ThinkForgeWritingCache] Cached context is unavailable; recreating it:', error);
    }
  }

  const cacheName = await createCache(modelName, contextHash, systemInstruction);
  return {
    ...(cacheName ? { cacheName } : {}),
    cacheStatus: cacheName ? 'created' : 'inline',
    modelName,
    systemInstruction,
  };
}

function readGeneratedText(response: { text?: string }): string {
  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty writing-context response');
  return text;
}

async function readAiSdkUsage(value: unknown): Promise<GeminiWritingContextUsage | undefined> {
  const usage = asRecord(await Promise.resolve(value));
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens);
  const outputTokens = readNumber(usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens);
  const totalTokens = readNumber(usage.totalTokens ?? usage.total_tokens);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

export async function generateWithWritingContextCache(
  input: WritingContextGenerationInput,
): Promise<WritingContextGenerationResult> {
  if (input.abortSignal?.aborted) {
    throw new Error('ThinkForge writing generation aborted before start');
  }

  const modelName = normalizeCacheModelName(input.modelName);
  const context = await resolveWritingContext(modelName);
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: getApiKey() });
  const startedAt = Date.now();
  const completionOperation = context.cacheName
    ? { operation: 'llm_completion_cached_context' as const }
    : { operation: 'llm_completion_inline_context' as const };

  try {
    const result = await client.models.generateContent({
      model: toRuntimeModelName(modelName),
      contents: input.prompt,
      config: {
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        abortSignal: input.abortSignal,
        ...(context.cacheName
          ? { cachedContent: context.cacheName }
          : { systemInstruction: context.systemInstruction }),
      },
    });
    const text = readGeneratedText(result);
    recordThinkForgeWritingContextCost({
      status: 'success',
      modelName,
      ...completionOperation,
      cacheStatus: context.cacheStatus,
      userInputChars: input.prompt.length,
      ...(context.cacheName ? {} : { systemInstructionChars: context.systemInstruction.length }),
      outputChars: text.length,
      functionMs: Date.now() - startedAt,
      usage: readGeminiUsage(result),
    });
    return { text, cacheStatus: context.cacheStatus, modelName };
  } catch (error) {
    recordThinkForgeWritingContextCost({
      status: 'failed',
      modelName,
      ...completionOperation,
      cacheStatus: context.cacheStatus,
      userInputChars: input.prompt.length,
      ...(context.cacheName ? {} : { systemInstructionChars: context.systemInstruction.length }),
      functionMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

export async function generateStructuredWithWritingContextCache<TOutput>(
  input: WritingContextStructuredGenerationInput<TOutput>,
): Promise<WritingContextStructuredGenerationResult<TOutput>> {
  if (input.abortSignal?.aborted) {
    throw new Error('ThinkForge writing generation aborted before start');
  }

  const modelName = normalizeCacheModelName(input.modelName);
  const context = await resolveWritingContext(modelName);
  const startedAt = Date.now();
  const structuredOperation = context.cacheName
    ? { operation: 'llm_structured_cached_context' as const }
    : { operation: 'llm_structured_inline_context' as const };

  try {
    const generation = await generateObject({
      model: createThinkForgeModel(toRuntimeModelName(modelName)),
      schema: input.schema,
      prompt: input.prompt,
      system: context.cacheName ? undefined : context.systemInstruction,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      abortSignal: input.abortSignal,
      ...(context.cacheName
        ? { providerOptions: { google: { cachedContent: context.cacheName } } }
        : {}),
    });
    const outputChars = JSON.stringify(generation.object).length;
    recordThinkForgeWritingContextCost({
      status: 'success',
      modelName,
      ...structuredOperation,
      cacheStatus: context.cacheStatus,
      userInputChars: input.prompt.length,
      ...(context.cacheName ? {} : { systemInstructionChars: context.systemInstruction.length }),
      outputChars,
      functionMs: Date.now() - startedAt,
      usage: await readAiSdkUsage(generation.usage),
    });
    return {
      result: generation.object,
      cacheStatus: context.cacheStatus,
      modelName,
    };
  } catch (error) {
    recordThinkForgeWritingContextCost({
      status: 'failed',
      modelName,
      ...structuredOperation,
      cacheStatus: context.cacheStatus,
      userInputChars: input.prompt.length,
      ...(context.cacheName ? {} : { systemInstructionChars: context.systemInstruction.length }),
      functionMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}
