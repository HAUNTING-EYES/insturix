/**
 * GET /api/services/editron/media/list
 * Fetch a stable, bounded page of media assets for the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';

export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type MediaListCursor = {
  uploadedAt: Date;
  assetId: string;
};

function mediaListPageSize(searchParams: URLSearchParams): number {
  const rawLimit = searchParams.get('limit');
  if (!rawLimit) return DEFAULT_PAGE_SIZE;
  const requested = Number(rawLimit);
  return Number.isFinite(requested)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(requested)))
    : DEFAULT_PAGE_SIZE;
}

function decodeMediaListCursor(value: string | null): MediaListCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { uploadedAt?: unknown; assetId?: unknown };
    const uploadedAt = new Date(typeof parsed.uploadedAt === 'string' ? parsed.uploadedAt : '');
    const assetId = typeof parsed.assetId === 'string' ? parsed.assetId.trim() : '';
    return Number.isFinite(uploadedAt.getTime()) && assetId ? { uploadedAt, assetId } : null;
  } catch {
    return null;
  }
}

function encodeMediaListCursor(asset: Pick<MediaAsset, 'uploadedAt' | 'assetId'>): string {
  return Buffer.from(JSON.stringify({
    uploadedAt: new Date(asset.uploadedAt).toISOString(),
    assetId: asset.assetId,
  })).toString('base64url');
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await getDatabase();
    const searchParams = new URL(request.url).searchParams;
    const pageSize = mediaListPageSize(searchParams);
    const rawCursor = searchParams.get('cursor');
    const cursor = decodeMediaListCursor(rawCursor);
    if (rawCursor && !cursor) {
      return NextResponse.json({ success: false, error: 'Invalid media-list cursor' }, { status: 400 });
    }
    const filter: Record<string, unknown> = {
      userId,
      type: { $in: ['video', 'audio', 'image'] },
      ...(cursor ? {
        $or: [
          { uploadedAt: { $lt: cursor.uploadedAt } },
          { uploadedAt: cursor.uploadedAt, assetId: { $lt: cursor.assetId } },
        ],
      } : {}),
    };
    const mediaAssetsWithSentinel = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find(filter, {
        projection: {
          semanticEmbedding: 0,
          transcription: 0,
          analysis: 0,
          rawFootageAnalysis: 0,
          segmentAnalysis: 0,
          vjepaAnalysis: 0,
          wav2vecAnalysis: 0,
          musicAnalysis: 0,
          momentWeightMap: 0,
        },
      })
      .sort({ uploadedAt: -1, assetId: -1 })
      .limit(pageSize + 1)
      .allowDiskUse(true)
      .toArray() as unknown as MediaAsset[];
    const hasMore = mediaAssetsWithSentinel.length > pageSize;
    const mediaAssets = hasMore ? mediaAssetsWithSentinel.slice(0, pageSize) : mediaAssetsWithSentinel;

    // Resolve assets to get fresh signed URLs if needed
    const resolvedAssets = await Promise.all(
      mediaAssets.map(async (asset) => {
        try {
          // Use AssetResolver to get fresh URL
          const resolvedUrl = await (assetResolver as any).getOrRefreshUrl(asset);
          return {
            id: asset.assetId,
            assetId: asset.assetId,
            name: asset.filename,
            type: asset.type,
            path: resolvedUrl, // Fresh signed URL
            size: asset.size,
            lastModified: new Date(asset.uploadedAt).getTime(),
            thumbnail: asset.thumbnail,
            duration: asset.duration,
            dimensions: asset.dimensions,
            uploadBatchId: (asset as MediaAsset & { uploadBatchId?: string }).uploadBatchId,
            pinned: asset.pinned === true, // reference/protected from eviction
          };
        } catch (error) {
          console.error(`Error resolving asset ${asset.assetId}:`, error);
          // Return asset with cached URL if resolution fails
          return {
            id: asset.assetId,
            assetId: asset.assetId,
            name: asset.filename,
            type: asset.type,
            path: asset.cachedUrl || '',
            size: asset.size,
            lastModified: new Date(asset.uploadedAt).getTime(),
            thumbnail: asset.thumbnail,
            duration: asset.duration,
            dimensions: asset.dimensions,
            uploadBatchId: (asset as MediaAsset & { uploadBatchId?: string }).uploadBatchId,
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      assets: resolvedAssets,
      hasMore,
      nextCursor: hasMore && mediaAssets.length > 0
        ? encodeMediaListCursor(mediaAssets[mediaAssets.length - 1])
        : null,
    });
  } catch (error: any) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch media assets' },
      { status: 500 }
    );
  }
}
