/**
 * POST /api/services/editron/media/upload/multipart/complete
 *
 * Completes an R2 multipart upload by assembling all parts.
 * Updates the mediaUploads tracking record to 'completed'.
 * Returns the final public CDN URL for the assembled file.
 *
 * maxDuration = 60 — CompleteMultipartUpload on R2 can take time for large files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  completeMultipartUpload,
  abortMultipartUpload,
  getR2PublicUrl,
} from '@/lib/editron/services/r2-service';
import { getDatabase } from '@/lib/editron/db/mongodb';
import type { MultipartPart } from '@/lib/editron/services/r2-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MEDIA_UPLOADS_COLLECTION = 'mediaUploads';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assetId, uploadId, r2Key, parts, abort } = body as {
      assetId: string;
      uploadId: string;
      r2Key: string;
      parts?: MultipartPart[];
      abort?: boolean;
    };

    if (!assetId || !uploadId || !r2Key) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, uploadId, r2Key' },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    // ── Abort path ──
    if (abort) {
      await abortMultipartUpload(r2Key, uploadId);
      await db.collection(MEDIA_UPLOADS_COLLECTION).updateOne(
        { assetId, userId },
        { $set: { status: 'aborted', lastActivityAt: new Date() } },
      );
      console.log(`[Multipart] Aborted: ${assetId}`);
      return NextResponse.json({ success: true, aborted: true });
    }

    // ── Complete path ──
    if (!parts?.length) {
      return NextResponse.json(
        { success: false, error: 'Missing parts[] for complete (or set abort: true)' },
        { status: 400 },
      );
    }

    // Verify ownership
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

    // Assemble all parts on R2
    const publicUrl = await completeMultipartUpload(r2Key, uploadId, parts);

    // Mark tracking record as completed
    await db.collection(MEDIA_UPLOADS_COLLECTION).updateOne(
      { assetId, userId },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          lastActivityAt: new Date(),
          publicUrl,
        },
      },
    );

    console.log(`[Multipart] Complete: ${assetId} (${parts.length} parts) → ${publicUrl}`);

    return NextResponse.json({
      success: true,
      assetId,
      publicUrl,
      readUrl: getR2PublicUrl(assetId),
    });
  } catch (error: any) {
    console.error('[Multipart] Complete failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete multipart upload' },
      { status: 500 },
    );
  }
}
