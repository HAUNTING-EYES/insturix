/**
 * POST /api/services/editron/assets/cdn-resolve
 *
 * Called by Cloudflare Worker on R2 cache miss.
 * Returns a fresh GCS signed URL for the Worker to fetch and cache in R2.
 *
 * Auth: x-cdn-secret header (shared secret with Worker)
 * NOT user-authenticated — this is a server-to-server call.
 *
 * Phase D W1: CDN infrastructure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { refreshSignedUrl } from '@/lib/editron/services/gcs-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Verify Worker shared secret
    const cdnSecret = request.headers.get('x-cdn-secret');
    if (!cdnSecret || cdnSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }

    // Look up asset in MongoDB
    const db = await getDatabase();
    const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({ assetId }) as any;

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Public assets don't need GCS refresh
    if (asset.publicUrl) {
      return NextResponse.json({
        gcsUrl: asset.publicUrl,
        contentType: asset.contentType || 'application/octet-stream',
      });
    }

    // Get a fresh GCS signed URL
    if (!asset.gcsPath) {
      // No gcsPath — try cached URL as last resort
      if (asset.cachedUrl) {
        return NextResponse.json({
          gcsUrl: asset.cachedUrl,
          contentType: asset.contentType || 'application/octet-stream',
        });
      }
      return NextResponse.json({ error: 'Asset has no gcsPath or URL' }, { status: 404 });
    }

    const { url: freshUrl, expiresAt } = await refreshSignedUrl(asset.gcsPath);

    // Update cached URL in DB
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId },
      { $set: { cachedUrl: freshUrl, urlExpiresAt: expiresAt } },
    );

    return NextResponse.json({
      gcsUrl: freshUrl,
      contentType: asset.contentType || (
        asset.type === 'video' ? 'video/mp4' :
        asset.type === 'audio' ? 'audio/mpeg' :
        asset.type === 'image' ? 'image/png' :
        'application/octet-stream'
      ),
    });
  } catch (error: any) {
    console.error('[cdn-resolve] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
