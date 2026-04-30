/**
 * POST /api/services/editron/media/upload
 *
 * Registers a media asset that has been uploaded directly to GCS.
 * The client first obtains a signed URL via /upload/url, uploads the file
 * to GCS directly, then calls this endpoint to persist the asset metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fileExists } from '@/lib/editron/services/gcs-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Hard limit at 3GB to prevent abuse (user footage can be large)
    // Files >100MB cost extra credits (handled by billing, not blocked here)
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > 3 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 3GB.' }, { status: 413 });
    }

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      assetId,
      gcsPath,
      readUrl,
      readUrlExpiresAt,
      filename,
      contentType,
      size,
      type,
      projectId,
      thumbnail,
      duration,
      dimensions,
    } = body;

    // Validate required fields — gcsPath is optional (R2 uploads don't have one)
    if (!assetId || !readUrl || !filename || !contentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, readUrl, filename, contentType' },
        { status: 400 }
      );
    }

    // Verify file exists in storage (GCS or R2)
    let exists = false;
    if (gcsPath) {
      exists = await fileExists(gcsPath);
    } else {
      // R2 upload — verify via HEAD request to CDN URL
      try {
        const headRes = await fetch(readUrl, { method: 'HEAD' });
        exists = headRes.ok;
      } catch {
        exists = true; // Assume exists if HEAD fails (CDN might not support HEAD)
      }
    }
    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'File not found in storage. Please upload the file first.' },
        { status: 404 }
      );
    }

    // Determine file type
    let fileType: 'video' | 'audio' | 'image';
    if (type) {
      fileType = type;
    } else if (contentType.startsWith('video/')) {
      fileType = 'video';
    } else if (contentType.startsWith('image/')) {
      fileType = 'image';
    } else if (contentType.startsWith('audio/')) {
      fileType = 'audio';
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Save metadata to MongoDB
    const parsedDimensions =
      dimensions &&
      typeof dimensions.width === 'number' &&
      typeof dimensions.height === 'number'
        ? {
            width: Math.round(dimensions.width),
            height: Math.round(dimensions.height),
          }
        : undefined;

    const mediaAsset: MediaAsset = {
      assetId,
      userId,
      projectId: projectId || undefined,
      type: fileType,
      source: 'user-upload',
      filename,
      gcsPath,
      cachedUrl: readUrl,
      urlExpiresAt: new Date(readUrlExpiresAt),
      size: size || 0,
      thumbnail: thumbnail || undefined,
      duration: duration ? parseFloat(duration) : undefined,
      dimensions: parsedDimensions,
      uploadedAt: new Date(),
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(mediaAsset);

    // ── Trigger async asset analysis via QStash ──
    // Runs 5-Track analysis (video), Gemini Vision (image), or basic tagging (audio)
    // in background. Does NOT block upload response.
    try {
      const qstashToken = process.env.QSTASH_TOKEN;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

      if (qstashToken) {
        await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/` + encodeURIComponent(`${baseUrl}/api/internal/workers/asset-analysis`), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '2',
            'Upstash-Timeout': '300',
          },
          body: JSON.stringify({
            assetId,
            userId,
            type: fileType,
            url: readUrl,
            duration: duration ? parseFloat(duration) : undefined,
            filename,
          }),
        });
        console.log(`[Upload] Dispatched analysis worker for ${assetId}`);

        // Graph sync: create Asset node in Neo4j (async, non-blocking)
        await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/` + encodeURIComponent(`${baseUrl}/api/internal/workers/graph-sync`), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '3',
          },
          body: JSON.stringify({
            action: 'asset_created',
            data: {
              assetId,
              userId,
              type: fileType,
              duration: duration ? parseFloat(duration) : undefined,
            },
          }),
        });
        console.log(`[Upload] Dispatched graph-sync for ${assetId}`);
      }
    } catch (qErr: any) {
      // Non-fatal — asset is uploaded even if analysis/graph dispatch fails
      console.warn(`[Upload] Worker dispatch failed: ${qErr.message}`);
    }

    return NextResponse.json({
      success: true,
      assetId,
      url: readUrl,
      type: fileType,
      filename,
      size: size || 0,
    });
  } catch (error: any) {
    console.error('Error registering media asset:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register media asset' },
      { status: 500 }
    );
  }
}
