/**
 * POST /api/services/editron/media/upload/multipart/part
 *
 * Records a successfully-uploaded part's ETag on the server-side `mediaUploads`
 * record. This is what makes uploads durable/resumable: after a browser refresh
 * or tab close, the client fetches the persisted {PartNumber, ETag} list from the
 * status route and only re-uploads missing parts — the already-uploaded bytes are
 * never re-sent. Part ETags are authoritative for R2 CompleteMultipartUpload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MEDIA_UPLOADS_COLLECTION = 'mediaUploads';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assetId, uploadId, r2Key, partNumber, etag } = body as {
      assetId?: unknown;
      uploadId?: unknown;
      r2Key?: unknown;
      partNumber?: unknown;
      etag?: unknown;
    };

    if (!assetId || !uploadId || !r2Key || typeof partNumber !== 'number' || typeof etag !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, uploadId, r2Key, partNumber, etag' },
        { status: 400 },
      );
    }
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      return NextResponse.json({ success: false, error: 'Invalid partNumber' }, { status: 400 });
    }
    const trimmedEtag = etag.trim();
    if (!trimmedEtag) {
      return NextResponse.json({ success: false, error: 'Invalid etag' }, { status: 400 });
    }

    const db = await getDatabase();
    const upload = await db.collection(MEDIA_UPLOADS_COLLECTION).findOne({
      assetId,
      userId,
      uploadId,
      r2Key,
      status: 'in-progress',
    });

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload not found or not owned by user' },
        { status: 404 },
      );
    }

    const totalParts = typeof upload.totalParts === 'number' ? upload.totalParts : 0;
    if (partNumber > totalParts) {
      return NextResponse.json({ success: false, error: 'partNumber exceeds totalParts' }, { status: 400 });
    }

    const completedParts = Array.isArray(upload.completedParts)
      ? upload.completedParts.filter((part: { PartNumber?: unknown }) => (
        part && typeof part === 'object' && Number(part?.PartNumber) !== partNumber
      ))
      : [];
    completedParts.push({ PartNumber: partNumber, ETag: trimmedEtag });
    completedParts.sort((a: { PartNumber: number }, b: { PartNumber: number }) => a.PartNumber - b.PartNumber);

    const result = await db.collection(MEDIA_UPLOADS_COLLECTION).updateOne(
      { _id: upload._id, userId },
      { $set: { completedParts, status: 'in-progress', lastActivityAt: new Date() } },
      { upsert: false },
    );

    if (result.matchedCount !== 1) {
      return NextResponse.json({ success: false, error: 'Upload mutated concurrently' }, { status: 409 });
    }

    return NextResponse.json({ success: true, partNumber, recorded: true, completedCount: completedParts.length });
  } catch (error: any) {
    console.error('[Multipart] Part record failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to record part' },
      { status: 500 },
    );
  }
}
