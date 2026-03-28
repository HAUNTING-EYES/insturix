/**
 * Asset Search Service
 *
 * Provides semantic search across user's media library.
 * Used by:
 * - Director Agent: check for existing footage before generating
 * - AI chat: find relevant assets
 * - Asset Library panel: search UI
 *
 * Falls back to tag-based search when embeddings aren't available.
 */

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
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
 * Returns ranked results with relevance scores.
 */
export async function searchUserAssets(
  userId: string,
  query: string,
  options: {
    type?: 'video' | 'audio' | 'image';
    minScore?: number;
    limit?: number;
  } = {},
): Promise<AssetSearchResult[]> {
  const { type, minScore = 0.4, limit = 5 } = options;
  const db = await getDatabase();

  const filter: any = { userId, analysisStatus: 'complete' };
  if (type) filter.type = type;

  const assets = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .find(filter)
    .sort({ uploadedAt: -1 })
    .limit(100)
    .toArray() as unknown as (MediaAsset & { tags?: string[]; semanticEmbedding?: number[] })[];

  if (assets.length === 0) return [];

  // Embed query
  let queryEmbedding: number[] | null = null;
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
    const embModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embResult = await embModel.embedContent(query);
    queryEmbedding = embResult.embedding?.values || null;
  } catch {
    // Fall back to tag search
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  const results: AssetSearchResult[] = [];

  for (const asset of assets) {
    let score = 0;

    // Semantic similarity
    if (queryEmbedding && asset.semanticEmbedding?.length) {
      score = cosineSimilarity(queryEmbedding, asset.semanticEmbedding);
    }

    // Tag matching
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

/**
 * Check if user has existing footage matching a scene description.
 * Used by Director to avoid regenerating video when suitable footage exists.
 *
 * @returns Best matching video asset, or null if nothing scores above threshold
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
