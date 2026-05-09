/**
 * GET /api/cron/cleanup-stale-uploads
 *
 * Daily cron — auto-heals proxy assets where the original upload completed
 * but the swap failed. R2's built-in lifecycle rule handles aborting stale
 * multipart uploads (7-day TTL configured in Cloudflare dashboard).
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/cron/cleanup-stale-uploads", "schedule": "0 4 * * *" }
 */

import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { r2FileExists, getR2PublicUrl } from '@/lib/editron/services/r2-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const db = await getDatabase();

    // Find proxy assets that might have completed originals
    const proxyAssets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ isProxy: true })
      .limit(50)
      .toArray();

    if (proxyAssets.length === 0) {
      return NextResponse.json({ success: true, healed: 0, message: 'No proxy assets found' });
    }

    let healed = 0;

    for (const asset of proxyAssets) {
      // Check if the original R2 key exists (multipart completed successfully)
      const originalKey = asset.originalR2Key;
      if (!originalKey) continue;

      const exists = await r2FileExists(originalKey);
      if (!exists) continue;

      // Original exists — swap the URL
      const originalUrl = getR2PublicUrl(originalKey);
      await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: asset.assetId },
        {
          $set: {
            cachedUrl: originalUrl,
            isProxy: false,
          },
        },
      );

      console.log(`[Cron] Auto-healed proxy: ${asset.assetId} → ${originalKey}`);
      healed++;
    }

    console.log(`[Cron] Cleanup complete: ${healed}/${proxyAssets.length} healed`);

    return NextResponse.json({
      success: true,
      checked: proxyAssets.length,
      healed,
    });
  } catch (error: any) {
    console.error('[Cron] Cleanup failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Cleanup failed' },
      { status: 500 },
    );
  }
}
