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
    } = body;

    // Validate required fields
    if (!assetId || !gcsPath || !readUrl || !filename || !contentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, gcsPath, readUrl, filename, contentType' },
        { status: 400 }
      );
    }

    // Verify the file was actually uploaded to GCS
    const exists = await fileExists(gcsPath);
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
      uploadedAt: new Date(),
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(mediaAsset);

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
