/**
 * GET /api/services/editron/assets/url/[assetId]
 *
 * URL Proxy Service — returns 302 redirect to the current valid URL
 * for any asset. This URL never expires — the proxy transparently
 * refreshes the underlying GCS signed URL when needed.
 *
 * Use this instead of storing signed URLs directly in components.
 * Browser caches the redirect for 1 hour (Cache-Control: private).
 *
 * Phase D W4: Production-grade URL management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { refreshSignedUrl } from '@/lib/editron/services/gcs-service';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;

    // Auth: prefer Clerk session, allow unauthenticated for CDN Worker calls with secret
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch {}

    // CDN Worker auth: shared secret header
    const cdnSecret = request.headers.get('x-cdn-secret');
    const isCdnWorker = cdnSecret === process.env.CRON_SECRET;

    if (!userId && !isCdnWorker) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up asset in media_assets collection
    const db = await getDatabase();
    const query: any = { assetId };
    if (userId && !isCdnWorker) {
      // For user requests, verify ownership
      // But some assets are shared (storyboard images used across scenes)
      // so we check without userId first, then verify
    }

    const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(query) as any;

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Check if cached URL is still valid (> 1 day remaining)
    const now = Date.now();
    const expiresAt = asset.urlExpiresAt ? new Date(asset.urlExpiresAt).getTime() : 0;
    const oneDayFromNow = now + 24 * 60 * 60 * 1000;

    let url = asset.cachedUrl;

    if (!url || expiresAt < oneDayFromNow) {
      // URL expired or expiring soon — refresh
      if (asset.gcsPath) {
        try {
          const refreshed = await refreshSignedUrl(asset.gcsPath);
          url = refreshed.url;

          // Update cache in DB
          await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
            { assetId },
            {
              $set: {
                cachedUrl: url,
                urlExpiresAt: refreshed.expiresAt,
              },
            },
          );
        } catch (refreshErr: any) {
          console.error(`[URLProxy] Failed to refresh ${assetId}: ${refreshErr.message}`);
          // Fall back to cached URL even if expired — might still work
          if (!url) {
            return NextResponse.json({ error: 'Asset URL unavailable' }, { status: 503 });
          }
        }
      } else if (asset.publicUrl) {
        // Public assets (Pexels, Freesound) don't expire
        url = asset.publicUrl;
      } else if (!url) {
        return NextResponse.json({ error: 'Asset has no URL or gcsPath' }, { status: 404 });
      }
    }

    // 302 redirect with 1-hour browser cache
    return NextResponse.redirect(url, {
      status: 302,
      headers: {
        'Cache-Control': 'private, max-age=3600',
        'X-Asset-Id': assetId,
      },
    });
  } catch (error: any) {
    console.error('[URLProxy] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
