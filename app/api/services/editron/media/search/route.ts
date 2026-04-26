/**
 * POST /api/services/editron/media/search
 *
 * Semantic search across user's media assets.
 * Uses Gemini text-embedding-004 to embed the query, then cosine similarity
 * against stored embeddings from asset analysis.
 *
 * Also supports tag-based search as fallback when embeddings aren't available.
 *
 * Used by:
 * - Asset Library search box (frontend)
 * - Director Agent (check existing footage before generating new video)
 * - AI chat tools (find relevant assets)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';

export const runtime = 'nodejs';

interface SearchResult {
  assetId: string;
  filename: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  tags: string[];
  score: number; // 0-1 relevance
  matchType: 'semantic' | 'tag' | 'filename';
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { query, type, limit = 10, minScore = 0.3 } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ success: false, error: 'Query required' }, { status: 400 });
    }

    // Primary path: Neo4j graph-filtered vector search
    try {
      const { searchUserAssets } = await import('@/lib/editron/services/asset-search-service');
      const graphResults = await searchUserAssets(userId, query, { type, minScore, limit });
      if (graphResults.length > 0) {
        return NextResponse.json({
          success: true,
          results: graphResults.map(r => ({ ...r, matchType: 'semantic' as const })),
          total: graphResults.length,
          query,
          source: 'graph',
        });
      }
    } catch { /* graph search failed — fall through to MongoDB */ }

    // Fallback: direct MongoDB search
    const db = await getDatabase();

    // Build MongoDB filter
    const filter: any = { userId };
    if (type) filter.type = type;

    const assets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find(filter)
      .sort({ uploadedAt: -1 })
      .limit(200) // Cap scan to 200 most recent assets
      .toArray() as unknown as (MediaAsset & { tags?: string[]; semanticEmbedding?: number[] })[];

    if (assets.length === 0) {
      return NextResponse.json({ success: true, results: [], total: 0 });
    }

    // ── Embed the query ──
    let queryEmbedding: number[] | null = null;
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
      const embModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const embResult = await embModel.embedContent(query);
      queryEmbedding = embResult.embedding?.values || null;
    } catch (embErr: any) {
      console.warn(`[MediaSearch] Embedding failed: ${embErr.message}, falling back to tag search`);
    }

    // ── Score each asset ──
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored: SearchResult[] = [];

    for (const asset of assets) {
      let score = 0;
      let matchType: 'semantic' | 'tag' | 'filename' = 'filename';

      // 1. Semantic similarity (highest quality)
      if (queryEmbedding && asset.semanticEmbedding?.length) {
        const cosSim = cosineSimilarity(queryEmbedding, asset.semanticEmbedding);
        if (cosSim > score) {
          score = cosSim;
          matchType = 'semantic';
        }
      }

      // 2. Tag matching
      if (asset.tags?.length) {
        const tagMatches = asset.tags.filter(tag =>
          queryWords.some(w => tag.toLowerCase().includes(w)) ||
          tag.toLowerCase().includes(queryLower)
        );
        const tagScore = tagMatches.length / Math.max(queryWords.length, 1);
        if (tagScore > score) {
          score = Math.min(tagScore, 0.95); // Cap tag score slightly below perfect semantic
          matchType = 'tag';
        }
      }

      // 3. Filename matching (lowest priority)
      const filenameLower = asset.filename.toLowerCase();
      const filenameMatch = queryWords.some(w => filenameLower.includes(w));
      if (filenameMatch && score < 0.3) {
        score = 0.3;
        matchType = 'filename';
      }

      if (score >= minScore) {
        // Resolve URL
        let url = asset.cachedUrl || '';
        try {
          url = await (assetResolver as any).getOrRefreshUrl(asset) || url;
        } catch { /* use cached */ }

        scored.push({
          assetId: asset.assetId,
          filename: asset.filename,
          type: asset.type,
          url,
          thumbnail: asset.thumbnail,
          duration: asset.duration,
          dimensions: asset.dimensions,
          tags: asset.tags || [],
          score,
          matchType,
        });
      }
    }

    // Sort by score descending, limit results
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    return NextResponse.json({
      success: true,
      results,
      total: scored.length,
      query,
    });
  } catch (error: any) {
    console.error('[MediaSearch] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── Cosine Similarity ──
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
