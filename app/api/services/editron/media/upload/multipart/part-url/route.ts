/**
 * POST /api/services/editron/media/upload/multipart/part-url
 *
 * Returns a presigned PUT URL for uploading a single part of a multipart upload.
 * Client PUTs the chunk directly to the returned URL, then reports the ETag back.
 * Updates lastActivityAt on the tracking record to prevent TTL cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generatePartUploadUrl } from '@/lib/editron/services/r2-service';
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
    const { assetId, uploadId, r2Key, partNumber } = body;

    if (!assetId || !uploadId || !r2Key || !partNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, uploadId, r2Key, partNumber' },
        { status: 400 },
      );
    }

    // Verify this upload belongs to the requesting user
    const db = await getDatabase();
    const upload = await db.collection(MEDIA_UPLOADS_COLLECTION).findOne({
      assetId,
      userId,
      uploadId,
      status: 'in-progress',
    });

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload not found or not owned by user' },
        { status: 404 },
      );
    }

    if (upload.r2Key !== r2Key) {
      return NextResponse.json(
        { success: false, error: 'Upload key does not match tracked upload' },
        { status: 400 },
      );
    }

    const numericPartNumber = Number(partNumber);
    if (!Number.isInteger(numericPartNumber) || numericPartNumber < 1 || numericPartNumber > 10000) {
      return NextResponse.json({ success: false, error: 'Invalid partNumber' }, { status: 400 });
    }

    const url = await generatePartUploadUrl(upload.r2Key, uploadId, numericPartNumber);

    // Keep the upload alive — TTL is on lastActivityAt
    await db.collection(MEDIA_UPLOADS_COLLECTION).updateOne(
      { assetId, userId },
      { $set: { lastActivityAt: new Date() } },
    );

    return NextResponse.json({ success: true, url, partNumber: numericPartNumber });
  } catch (error: any) {
    console.error('[Multipart] Part URL failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate part upload URL' },
      { status: 500 },
    );
  }
}
