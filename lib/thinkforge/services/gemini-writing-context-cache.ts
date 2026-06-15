import { readFileSync } from 'fs';
import { join } from 'path';

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

  const attempts = [
    join(process.cwd(), 'docs', 'creative-content-knowledge.md'),
    join(__dirname, '..', '..', '..', 'docs', 'creative-content-knowledge.md'),
  ];

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
  try {
    const { GoogleAICacheManager } = await import('@google/generative-ai/server');
    const cacheManager = new GoogleAICacheManager(getApiKey());
    const cache = await cacheManager.create({
      model: modelName,
      displayName: 'thinkforge-creative-content-knowledge-v1',
      contents: [
        {
          role: 'user',
          parts: [{ text: buildWritingContextSystemInstruction() }],
        },
      ],
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    if (!cache?.name) throw new Error('Cache creation returned no name');
    await storeCacheEntry(cache.name, modelName);
    return cache.name;
  } catch (error: any) {
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
    try {
      const { GoogleAICacheManager } = await import('@google/generative-ai/server');
      const cacheManager = new GoogleAICacheManager(apiKey);
      const cachedContent = await cacheManager.get(cacheName);
      const model = genAI.getGenerativeModelFromCachedContent(cachedContent);
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig,
      });
      return { text: result.response.text(), cacheStatus, modelName };
    } catch (error: any) {
      console.warn(`[ThinkForgeWritingCache] Cache bind/generate failed: ${error?.message || error}. Using inline context.`);
    }
  }

  const model = genAI.getGenerativeModel({
    model: toRuntimeModelName(modelName),
    systemInstruction: buildWritingContextSystemInstruction(),
  });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
    generationConfig,
  });
  return { text: result.response.text(), cacheStatus: 'inline', modelName };
}
