/**
 * POST /api/services/editron/media/upload/multipart/init
 *
 * Initiates an R2 multipart upload for large file uploads.
 * Returns uploadId, assetId, and r2Key for subsequent part uploads.
 * Creates a tracking record in mediaUploads collection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initiateMultipartUpload, getR2PublicUrl } from '@/lib/editron/services/r2-service';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

const MEDIA_UPLOADS_COLLECTION = 'mediaUploads';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, totalSize, totalParts, assetId: clientAssetId } = body;

    if (!filename || !contentType || !totalSize || !totalParts) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: filename, contentType, totalSize, totalParts' },
        { status: 400 },
      );
    }

    if (totalSize > 3 * 1024 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File too large. Maximum size is 3GB.' }, { status: 413 });
    }

    const { uploadId, r2Key, assetId: generatedAssetId } = await initiateMultipartUpload(userId, filename, contentType);
    const assetId = clientAssetId || generatedAssetId;
    const readUrl = getR2PublicUrl(assetId);

    // Track the upload in MongoDB for resumability and cleanup
    const db = await getDatabase();
    await db.collection(MEDIA_UPLOADS_COLLECTION).insertOne({
      assetId,
      userId,
      uploadId,
      r2Key,
      filename,
      contentType,
      totalSize,
      totalParts,
      completedParts: [],
      status: 'in-progress',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });

    console.log(`[Multipart] Init: ${assetId} (${totalParts} parts, ${Math.round(totalSize / 1024 / 1024)}MB)`);

    return NextResponse.json({
      success: true,
      uploadId,
      assetId,
      r2Key,
      readUrl,
    });
  } catch (error: any) {
    console.error('[Multipart] Init failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to initiate multipart upload' },
      { status: 500 },
    );
  }
}
