/**
 * POST /api/services/editron/media/upload/swap
 *
 * Swaps a proxy asset's cachedUrl to the original full-quality URL.
 * Called after the background multipart upload completes.
 *
 * Idempotent: re-calling with the same data is a no-op.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assetId, originalUrl, originalR2Key } = body;

    if (!assetId || !originalUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, originalUrl' },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
      assetId,
      userId,
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 },
      );
    }

    // Idempotent: if already swapped, return success
    if (!asset.isProxy) {
      console.log(`[Swap] ${assetId} already swapped, no-op`);
      return NextResponse.json({ success: true, alreadySwapped: true });
    }

    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      {
        $set: {
          cachedUrl: originalUrl,
          isProxy: false,
          ...(originalR2Key && { originalR2Key }),
        },
      },
    );

    console.log(`[Swap] ${assetId}: proxy → original`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Swap] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Swap failed' },
      { status: 500 },
    );
  }
}
