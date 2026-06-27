/**
 * Gemini Context Cache Manager
 *
 * Caches the creative production knowledge rules in Gemini's context cache
 * so every call that needs creative context pays ~75% less in input tokens.
 *
 * Cache ID is stored in Upstash Redis (not process singleton) because
 * Vercel workers are stateless — each cold start would create redundant caches.
 *
 * Flow:
 *   1. Check Redis for existing cache name + expiry
 *   2. If valid → return cached model
 *   3. If expired/missing → create new cache → store in Redis → return model
 *   4. If ANY failure → fall back to uncached model (always tested path)
 */

import { getCreativeRulesPromptText } from '@/lib/editron/data/creative-doc-rules';

// ─── Config ──────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 1800; // 30 min — balances cost vs freshness
const REDIS_KEY = 'editron:gemini:creative-doc-cache';
// gemini-3.1-pro-preview: thinking model, full video understanding, context caching verified.
// Tested 2026-05-19: API OK (outputTokenLimit=65536), caching OK, 404 models eliminated.
// Previous: gemini-2.5-flash (fast but no thinking — produced 246 jump_cuts, 27% coverage).
const CACHE_MODEL = 'models/gemini-3.1-pro-preview'; // Must match the model used for generation

// ─── Redis Helpers ───────────────────────────────────────────────

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

interface CacheEntry {
  cacheName: string;
  expiresAt: number; // unix ms
  createdAt: number;
}

async function getCachedEntry(): Promise<CacheEntry | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const entry = await redis.get<CacheEntry>(REDIS_KEY);
    if (!entry) return null;
    // Check if expired (with 60s buffer to avoid race)
    if (Date.now() > entry.expiresAt - 60_000) return null;
    return entry;
  } catch (err) {
    console.warn('[GeminiCache] Redis read failed:', err);
    return null;
  }
}

async function storeCacheEntry(cacheName: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    const entry: CacheEntry = {
      cacheName,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
      createdAt: Date.now(),
    };
    // Redis TTL matches Gemini cache TTL
    await redis.set(REDIS_KEY, entry, { ex: CACHE_TTL_SECONDS });
    console.log(`[GeminiCache] Stored cache entry in Redis: ${cacheName}`);
  } catch (err) {
    console.warn('[GeminiCache] Redis write failed:', err);
  }
}

// ─── Gemini Cache Management ─────────────────────────────────────

async function createCache(): Promise<string | null> {
  try {
    const { GoogleAICacheManager } = await import('@google/generative-ai/server');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY or GOOGLE_API_KEY');

    const cacheManager = new GoogleAICacheManager(apiKey);
    const rulesText = getCreativeRulesPromptText();

    console.log(`[GeminiCache] Creating cache (${Math.round(rulesText.length / 4)} est. tokens, TTL=${CACHE_TTL_SECONDS}s)...`);

    const cache = await cacheManager.create({
      model: CACHE_MODEL,
      displayName: 'editron-creative-doc-v2',
      contents: [
        {
          role: 'user',
          parts: [{ text: rulesText }],
        },
      ],
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    if (!cache?.name) throw new Error('Cache creation returned no name');

    console.log(`[GeminiCache] Created: ${cache.name}`);
    await storeCacheEntry(cache.name);
    return cache.name;
  } catch (err: any) {
    console.warn(`[GeminiCache] Creation failed: ${err.message}. Will use uncached model.`);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Get a Gemini model bound to the cached creative doc context.
 * Falls back to a regular (uncached) model on any failure.
 *
 * @returns GenerativeModel ready for generateContent() calls
 */
export async function getCreativeDocCachedModel(): Promise<any> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No GEMINI_API_KEY or GOOGLE_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try to get existing cache from Redis
  let cacheName: string | null = null;
  const existing = await getCachedEntry();
  if (existing) {
    cacheName = existing.cacheName;
    console.log(`[GeminiCache] HIT — reusing ${cacheName}`);
  } else {
    // Create new cache
    cacheName = await createCache();
  }

  // If we have a valid cache, bind model to it
  if (cacheName) {
    try {
      const { GoogleAICacheManager } = await import('@google/generative-ai/server');
      const cacheManager = new GoogleAICacheManager(apiKey);
      const cachedContent = await cacheManager.get(cacheName);

      if (cachedContent) {
        const model = genAI.getGenerativeModelFromCachedContent(cachedContent);
        console.log('[GeminiCache] Model bound to cached content');
        return model;
      }
    } catch (err: any) {
      console.warn(`[GeminiCache] Failed to bind model to cache ${cacheName}: ${err.message}. Using uncached.`);
    }
  }

  // Fallback: uncached model with creative doc as system instruction
  console.log('[GeminiCache] MISS — using uncached model with inline system instruction');
  const rulesText = getCreativeRulesPromptText();
  return genAI.getGenerativeModel({
    model: CACHE_MODEL.replace('models/', ''),
    systemInstruction: rulesText,
  });
}

/**
 * Get cache stats for debugging/monitoring.
 */
export async function getCacheStats(): Promise<{
  hasCache: boolean;
  cacheName: string | null;
  expiresIn: number | null;
  createdAt: number | null;
}> {
  const entry = await getCachedEntry();
  if (!entry) return { hasCache: false, cacheName: null, expiresIn: null, createdAt: null };
  return {
    hasCache: true,
    cacheName: entry.cacheName,
    expiresIn: Math.round((entry.expiresAt - Date.now()) / 1000),
    createdAt: entry.createdAt,
  };
}
