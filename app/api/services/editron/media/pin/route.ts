/**
 * PATCH /api/services/editron/media/pin
 * Pin/unpin a media asset. Pinned assets are the owner's REFERENCE pool: they are
 * never LRU-evicted and are surfaced (via /media/references) to Brand Vault and
 * future generations. Owner-scoped (you can pin exactly what's in your storage pool).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { resolveStorageOwner } from '@/lib/services/storage-quota-service';
import { ownerAssetFilter } from '@/lib/editron/services/storage-eviction-policy';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { assetId, pinned } = body;
    if (!assetId || typeof pinned !== 'boolean') {
      return NextResponse.json({ error: 'assetId and pinned (boolean) are required' }, { status: 400 });
    }

    const owner = resolveStorageOwner(userId, orgId);
    const db = await getDatabase();
    const res = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, ...ownerAssetFilter(owner) },
      { $set: { pinned } },
    );
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: 'Asset not found or not owned' }, { status: 404 });
    }

    return NextResponse.json({ success: true, assetId, pinned });
  } catch (error) {
    console.error('[media/pin]', error);
    return NextResponse.json({ error: 'Failed to update pin' }, { status: 500 });
  }
}
