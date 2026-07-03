/**
 * GET /api/services/editron/media/references
 * The owner's REFERENCE pool — pinned media assets (org-wide), with fresh URLs.
 * This is the reusable library Brand Vault and future generations draw from
 * (e.g. "use my product shots"). Pinned = never LRU-evicted.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import { resolveStorageOwner } from '@/lib/services/storage-quota-service';
import { ownerAssetFilter } from '@/lib/editron/services/storage-eviction-policy';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const owner = resolveStorageOwner(userId, orgId);
    const db = await getDatabase();
    const assets = (await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ ...ownerAssetFilter(owner), pinned: true })
      .sort({ lastUsedAt: -1 })
      .toArray()) as unknown as MediaAsset[];

    const references = await Promise.all(
      assets.map(async (asset) => {
        let path = asset.cachedUrl || '';
        try {
          path = await (assetResolver as any).getOrRefreshUrl(asset);
        } catch {
          /* fall back to cached URL */
        }
        return {
          assetId: asset.assetId,
          name: asset.filename,
          type: asset.type,
          path,
          size: asset.size,
          thumbnail: asset.thumbnail,
          dimensions: asset.dimensions,
        };
      }),
    );

    return NextResponse.json({ success: true, references });
  } catch (error) {
    console.error('[media/references]', error);
    return NextResponse.json({ error: 'Failed to load references' }, { status: 500 });
  }
}
