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
import { runMediaProxyMasterTransitionV1 } from '@/lib/editron/services/media-proxy-master-transition-v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET_NOT_CONFIGURED' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const db = await getDatabase();

    // Find proxy assets that might have completed originals
    const proxyAssets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ isProxy: true }, { projection: { assetId: 1, userId: 1 } })
      .limit(50)
      .toArray();

    if (proxyAssets.length === 0) {
      return NextResponse.json({ success: true, checked: 0, transitioned: 0, pendingQualification: 0, skipped: 0 });
    }

    let transitioned = 0;
    let pendingQualification = 0;
    let skipped = 0;
    let failures = 0;

    for (const asset of proxyAssets) {
      if (typeof asset.assetId !== 'string' || typeof asset.userId !== 'string') {
        skipped++;
        continue;
      }
      try {
        const result = await runMediaProxyMasterTransitionV1({ assetId: asset.assetId, userId: asset.userId });
        if (result.disposition === 'TRANSITIONED') {
          transitioned++;
          if (result.qualification === 'PENDING') pendingQualification++;
        } else if (result.disposition !== 'ALREADY_ACTIVE') {
          skipped++;
        }
      } catch {
        failures++;
      }
    }

    return NextResponse.json({
      success: failures === 0,
      checked: proxyAssets.length,
      transitioned,
      pendingQualification,
      skipped,
      failures,
    }, { status: failures === 0 ? 200 : 500 });
  } catch {
    return NextResponse.json({ success: false, error: 'PROXY_MASTER_CLEANUP_FAILED' }, { status: 500 });
  }
}
