/**
 * GET /api/services/editron/media/list
 * Fetch all media assets for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';
import { assetResolver } from '@/lib/services/asset-resolver';
import type { MediaAsset } from '@/lib/services/asset-resolver';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = await getDatabase();
    
    // Fetch all media assets for this user, sorted by most recent first
    const mediaAssets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .toArray() as unknown as MediaAsset[];

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
            lastModified: asset.uploadedAt.getTime(),
            thumbnail: asset.thumbnail,
            duration: asset.duration,
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
            lastModified: asset.uploadedAt.getTime(),
            thumbnail: asset.thumbnail,
            duration: asset.duration,
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      assets: resolvedAssets,
    });
  } catch (error: any) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch media assets' },
      { status: 500 }
    );
  }
}
