/**
 * GET /api/services/editron/media/upload/multipart/status?assetId=xxx
 *
 * Returns upload status for an asset. Used by the editor to show
 * upload progress when re-opening a project with an in-progress upload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const assetId = request.nextUrl.searchParams.get('assetId');
    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Missing assetId query parameter' },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const upload = await db.collection(COLLECTIONS.MEDIA_UPLOADS).findOne({
      assetId,
      userId,
    });

    if (!upload) {
      return NextResponse.json({
        success: true,
        status: 'none',
        assetId,
      });
    }

    return NextResponse.json({
      success: true,
      assetId,
      status: upload.status,
      uploadId: upload.uploadId ?? null,
      r2Key: upload.r2Key ?? null,
      totalParts: upload.totalParts,
      partSize: upload.partSize ?? null,
      totalSize: upload.totalSize,
      completedParts: Array.isArray(upload.completedParts)
        ? upload.completedParts.map((part: { PartNumber?: unknown; ETag?: unknown }) => ({
          PartNumber: typeof part?.PartNumber === 'number' ? part.PartNumber : Number(part?.PartNumber),
          ETag: typeof part?.ETag === 'string' ? part.ETag : '',
        })).filter((part: { PartNumber: number; ETag: string }) => (
          Number.isInteger(part.PartNumber) && part.PartNumber >= 1 && part.ETag.length > 0
        )).sort((a: { PartNumber: number }, b: { PartNumber: number }) => a.PartNumber - b.PartNumber)
        : [],
      createdAt: upload.createdAt,
      lastActivityAt: upload.lastActivityAt,
    });
  } catch (error: any) {
    console.error('[Multipart] Status check failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Status check failed' },
      { status: 500 },
    );
  }
}
