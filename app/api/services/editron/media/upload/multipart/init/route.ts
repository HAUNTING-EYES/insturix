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
import { formatStorageBytes } from '@/lib/services/storage-quota-service';
import { reserveStorageForUpload } from '@/lib/services/storage-reserve-service';
import { R2_MAX_OBJECT_BYTES, R2_MIN_PART_BYTES, R2_MAX_PART_BYTES, R2_MAX_PARTS, isValidPartSize } from '@/lib/editron/services/r2-upload-limits';

export const runtime = 'nodejs';

const MEDIA_UPLOADS_COLLECTION = 'mediaUploads';

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, totalSize, totalParts, partSize, assetId: clientAssetId } = body;
    const numericTotalSize = Number(totalSize);
    const numericTotalParts = Number(totalParts);
    const numericPartSize = Number(partSize);

    if (!filename || !contentType
      || !Number.isSafeInteger(numericTotalSize) || numericTotalSize < 1
      || !Number.isSafeInteger(numericTotalParts) || numericTotalParts < 1
      || !Number.isSafeInteger(numericPartSize) || numericPartSize < 1) {
      return NextResponse.json(
        { success: false, error: 'Valid filename, contentType, totalSize, totalParts and partSize are required' },
        { status: 400 },
      );
    }

    // R2 hard cap: 4.995 TiB, 10,000 parts, 5 MiB–4.995 GiB per part.
    // The server recomputes the authoritative plan from the size rather than trusting the client.
    if (numericTotalSize > R2_MAX_OBJECT_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 4.995 TiB.' },
        { status: 413 },
      );
    }
    if (!isValidPartSize(numericPartSize)) {
      return NextResponse.json(
        {
          success: false,
          error: `Part size must be between ${Math.round(R2_MIN_PART_BYTES / 1024 / 1024)} MiB and ${(R2_MAX_PART_BYTES / 1024 / 1024 / 1024).toFixed(3)} GiB per part.`,
        },
        { status: 400 },
      );
    }
    const resolvedParts = Math.ceil(numericTotalSize / numericPartSize);
    if (numericTotalParts !== resolvedParts || resolvedParts > R2_MAX_PARTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Part count must be ceil(size/partSize) and at most ${R2_MAX_PARTS}. Got ${numericTotalParts}, expected ${resolvedParts}.`,
        },
        { status: 400 },
      );
    }

    // Reserve BEFORE the multipart upload starts — evict LRU non-protected assets
    // to make room for the declared size (or allow paid overage); block only when
    // everything else is pinned/in-use.
    const reservation = await reserveStorageForUpload(userId, orgId, numericTotalSize);
    if (!reservation.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Storage full (${formatStorageBytes(reservation.usedBytes)} of ${formatStorageBytes(reservation.limitBytes)} used) — the rest is pinned or in use. Delete/unpin assets, enable extra storage, or upgrade your plan.`,
          code: 'storage_quota_exceeded',
        },
        { status: 413 },
      );
    }

    const { uploadId, r2Key, assetId: generatedAssetId } = await initiateMultipartUpload(userId, filename, contentType);
    const assetId = clientAssetId || generatedAssetId;
    const readUrl = getR2PublicUrl(assetId);

    // Track the upload in MongoDB for resumability and cleanup.
    const db = await getDatabase();
    await db.collection(MEDIA_UPLOADS_COLLECTION).insertOne({
      assetId,
      userId,
      orgId: orgId || null,
      uploadId,
      r2Key,
      filename,
      contentType,
      totalSize: numericTotalSize,
      totalParts: numericTotalParts,
      partSize: numericPartSize,
      completedParts: [],
      status: 'in-progress',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });

    console.log(`[Multipart] Init: ${assetId} (${numericTotalParts} parts x ${Math.round((numericPartSize || 0) / 1024 / 1024)}MB, ${Math.round(numericTotalSize / 1024 / 1024 / 1024 / 1024 * 10) / 10}GB)`);

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
