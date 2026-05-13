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
      totalParts: upload.totalParts,
      completedParts: upload.completedParts?.length ?? 0,
      totalSize: upload.totalSize,
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
