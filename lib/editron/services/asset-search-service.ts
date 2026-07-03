/**
 * Asset Search Service
 *
 * Provides semantic search across user's media library.
 * Used by:
 * - Director Agent: check for existing footage before generating
 * - AI chat: find relevant assets
 * - Asset Library panel: search UI
 *
 * Primary path: Neo4j graph-filtered vector search (penalize-not-exclude).
 * Fallback: MongoDB tag + embedding search (if Neo4j is unavailable).
 */

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { generateEditronEmbedding } from './gemini-embedding';
import type { MediaAsset } from './asset-resolver';

export interface AssetSearchResult {
  assetId: string;
  filename: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  tags: string[];
  score: number;
}

/**
 * Search user's media library by natural language query.
 * Tries Neo4j graph search first (relationship-aware, penalize-not-exclude),
 * falls back to MongoDB if Neo4j is unavailable.
 */
export async function searchUserAssets(
  userId: string,
  query: string,
  options: {
    type?: 'video' | 'audio' | 'image';
    moods?: string[];
    brandId?: string;
    minScore?: number;
    limit?: number;
  } = {},
): Promise<AssetSearchResult[]> {
  const { type, moods, brandId, minScore = 0.4, limit = 5 } = options;

  // Embed the query (needed for both Neo4j and MongoDB paths)
  const queryEmbedding = await embedQuery(query);

  // ─── Try Neo4j graph search first ────────────────────────────
  if (queryEmbedding) {
    try {
      const { searchAssets, isNeo4jAvailable } = await import('./graph-service');
      const available = await isNeo4jAvailable();

      if (available) {
        const graphHits = await searchAssets(userId, queryEmbedding, {
          moods: moods as any,
          brandId,
          limit,
          minSemanticScore: minScore,
        });

        if (graphHits.length > 0) {
          const enriched = await enrichGraphHits(userId, graphHits, type);
          if (enriched.length > 0) return enriched;
        }
      }
    } catch (err: unknown) {
      console.warn('[AssetSearch] Neo4j search failed, falling through to MongoDB:', err instanceof Error ? err.message : err);
    }
  }

  // ─── Fallback: MongoDB search ────────────────────────────────
  return searchViaMongoDB(userId, query, queryEmbedding, { type, minScore, limit });
}

/**
 * Check if user has existing footage matching a scene description.
 * Used by Director to avoid regenerating video when suitable footage exists.
 */
export async function findMatchingFootage(
  userId: string,
  sceneDescription: string,
  minConfidence: number = 0.75,
): Promise<AssetSearchResult | null> {
  const results = await searchUserAssets(userId, sceneDescription, {
    type: 'video',
    minScore: minConfidence,
    limit: 1,
  });
  return results[0] || null;
}

// ─── Neo4j helpers ──────────────────────────────────────────────

async function enrichGraphHits(
  userId: string,
  hits: Array<{ assetId: string; briefing: string | null; finalScore: number }>,
  typeFilter?: 'video' | 'audio' | 'image',
): Promise<AssetSearchResult[]> {
  const db = await getDatabase();
  const assetIds = hits.map(h => h.assetId);

  const filter: Record<string, unknown> = { userId, assetId: { $in: assetIds } };
  if (typeFilter) filter.type = typeFilter;

  const assets = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .find(filter)
    .toArray() as unknown as MediaAsset[];

  const assetMap = new Map(assets.map(a => [a.assetId, a]));
  const scoreMap = new Map(hits.map(h => [h.assetId, h.finalScore]));

  return hits
    .filter(h => assetMap.has(h.assetId))
    .map(h => {
      const a = assetMap.get(h.assetId)!;
      return {
        assetId: a.assetId,
        filename: a.filename,
        type: a.type,
        url: a.cachedUrl || '',
        thumbnail: a.thumbnail,
        duration: a.duration,
        dimensions: a.dimensions,
        tags: (a as any).tags || [],
        score: scoreMap.get(h.assetId) ?? 0,
      };
    });
}

// ─── MongoDB fallback ───────────────────────────────────────────

async function searchViaMongoDB(
  userId: string,
  query: string,
  queryEmbedding: number[] | null,
  options: { type?: string; minScore: number; limit: number },
): Promise<AssetSearchResult[]> {
  const { type, minScore, limit } = options;
  const db = await getDatabase();

  const filter: Record<string, unknown> = { userId, analysisStatus: 'complete' };
  if (type) filter.type = type;

  const assets = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .find(filter)
    .sort({ uploadedAt: -1 })
    .limit(100)
    .toArray() as unknown as (MediaAsset & { tags?: string[]; semanticEmbedding?: number[] })[];

  if (assets.length === 0) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  const results: AssetSearchResult[] = [];

  for (const asset of assets) {
    let score = 0;

    if (queryEmbedding && asset.semanticEmbedding?.length) {
      score = cosineSimilarity(queryEmbedding, asset.semanticEmbedding);
    }

    if (asset.tags?.length) {
      const tagMatches = asset.tags.filter(tag =>
        queryWords.some(w => tag.toLowerCase().includes(w)) ||
        tag.toLowerCase().includes(queryLower)
      );
      const tagScore = tagMatches.length / Math.max(queryWords.length, 1);
      score = Math.max(score, Math.min(tagScore, 0.95));
    }

    if (score >= minScore) {
      results.push({
        assetId: asset.assetId,
        filename: asset.filename,
        type: asset.type,
        url: asset.cachedUrl || '',
        thumbnail: asset.thumbnail,
        duration: asset.duration,
        dimensions: asset.dimensions,
        tags: asset.tags || [],
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ─── Shared utilities ───────────────────────────────────────────

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    return await generateEditronEmbedding(text, { taskType: 'RETRIEVAL_QUERY' });
  } catch (err: unknown) {
    console.warn('[AssetSearch] embedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
