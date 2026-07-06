import { readFileSync } from 'fs';
import { join } from 'path';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';

const CACHE_TTL_SECONDS = 1800;
const REDIS_KEY = 'thinkforge:gemini:creative-content-cache';
const DEFAULT_CACHE_MODEL = 'models/gemini-2.5-flash';

interface CacheEntry {
  cacheName: string;
  expiresAt: number;
  createdAt: number;
  modelName: string;
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

let cachedDocText: string | null = null;

type GeminiWritingContextOperation =
  | 'context_cache_create'
  | 'llm_completion_cached_context'
  | 'llm_completion_inline_context';

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

  await recordProviderCostEvent({
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
  });
}

function readGeminiUsage(result: unknown): GeminiWritingContextUsage | undefined {
  const root = asRecord(result);
  const response = asRecord(root?.response);
  const usage = asRecord(response?.usageMetadata ?? root?.usageMetadata);
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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

async function getCachedEntry(modelName: string): Promise<CacheEntry | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const entry = await redis.get<CacheEntry>(REDIS_KEY);
    if (!entry || entry.modelName !== modelName) return null;
    if (Date.now() > entry.expiresAt - 60_000) return null;
    return entry;
  } catch (error) {
    console.warn('[ThinkForgeWritingCache] Redis read failed:', error);
    return null;
  }
}

async function storeCacheEntry(cacheName: string, modelName: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    const entry: CacheEntry = {
      cacheName,
      modelName,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
      createdAt: Date.now(),
    };
    await redis.set(REDIS_KEY, entry, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn('[ThinkForgeWritingCache] Redis write failed:', error);
  }
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

async function createCache(modelName: string): Promise<string | null> {
  const startedAt = Date.now();
  let systemInstructionChars: number | undefined;

  try {
    const systemInstruction = buildWritingContextSystemInstruction();
    systemInstructionChars = systemInstruction.length;
    const { GoogleAICacheManager } = await import('@google/generative-ai/server');
    const cacheManager = new GoogleAICacheManager(getApiKey());
    const cache = await cacheManager.create({
      model: modelName,
      displayName: 'thinkforge-creative-content-knowledge-v1',
      contents: [
        {
          role: 'user',
          parts: [{ text: systemInstruction }],
        },
      ],
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    if (!cache?.name) throw new Error('Cache creation returned no name');
    await storeCacheEntry(cache.name, modelName);
    await recordThinkForgeWritingContextCost({
      status: 'success',
      modelName,
      operation: 'context_cache_create',
      cacheStatus: 'created',
      systemInstructionChars,
      functionMs: Date.now() - startedAt,
    });
    return cache.name;
  } catch (error: any) {
    await recordThinkForgeWritingContextCost({
      status: 'failed',
      modelName,
      operation: 'context_cache_create',
      systemInstructionChars,
      functionMs: Date.now() - startedAt,
      error,
    });
    console.warn(`[ThinkForgeWritingCache] Cache creation failed: ${error?.message || error}`);
    return null;
  }
}

export async function generateWithWritingContextCache(
  input: WritingContextGenerationInput,
): Promise<WritingContextGenerationResult> {
  if (input.abortSignal?.aborted) {
    throw new Error('ThinkForge writing generation aborted before start');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = normalizeCacheModelName(input.modelName);
  const generationConfig = {
    temperature: input.temperature,
    maxOutputTokens: input.maxTokens,
  };

  const existing = await getCachedEntry(modelName);
  let cacheName = existing?.cacheName || null;
  let cacheStatus: WritingContextGenerationResult['cacheStatus'] = existing ? 'hit' : 'inline';

  if (!cacheName) {
    cacheName = await createCache(modelName);
    cacheStatus = cacheName ? 'created' : 'inline';
  }

  if (cacheName) {
    const startedAt = Date.now();
    try {
      const { GoogleAICacheManager } = await import('@google/generative-ai/server');
      const cacheManager = new GoogleAICacheManager(apiKey);
      const cachedContent = await cacheManager.get(cacheName);
      const model = genAI.getGenerativeModelFromCachedContent(cachedContent);
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig,
      });
      const text = result.response.text();
      await recordThinkForgeWritingContextCost({
        status: 'success',
        modelName,
        operation: 'llm_completion_cached_context',
        cacheStatus,
        userInputChars: input.prompt.length,
        outputChars: text.length,
        functionMs: Date.now() - startedAt,
        usage: readGeminiUsage(result),
      });
      return { text, cacheStatus, modelName };
    } catch (error: any) {
      await recordThinkForgeWritingContextCost({
        status: 'failed',
        modelName,
        operation: 'llm_completion_cached_context',
        cacheStatus,
        userInputChars: input.prompt.length,
        functionMs: Date.now() - startedAt,
        error,
      });
      console.warn(`[ThinkForgeWritingCache] Cache bind/generate failed: ${error?.message || error}. Using inline context.`);
    }
  }

  const systemInstruction = buildWritingContextSystemInstruction();
  const model = genAI.getGenerativeModel({
    model: toRuntimeModelName(modelName),
    systemInstruction,
  });
  const startedAt = Date.now();
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig,
    });
    const text = result.response.text();
    await recordThinkForgeWritingContextCost({
      status: 'success',
      modelName,
      operation: 'llm_completion_inline_context',
      cacheStatus: 'inline',
      userInputChars: input.prompt.length,
      systemInstructionChars: systemInstruction.length,
      outputChars: text.length,
      functionMs: Date.now() - startedAt,
      usage: readGeminiUsage(result),
    });
    return { text, cacheStatus: 'inline', modelName };
  } catch (error) {
    await recordThinkForgeWritingContextCost({
      status: 'failed',
      modelName,
      operation: 'llm_completion_inline_context',
      cacheStatus: 'inline',
      userInputChars: input.prompt.length,
      systemInstructionChars: systemInstruction.length,
      functionMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}
