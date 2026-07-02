/**
 * DELETE /api/services/editron/media/delete
 * Delete a media asset
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import { deleteFromGCS } from '@/lib/editron/services/gcs-service';
import { deleteFromR2 } from '@/lib/editron/services/r2-service';
import { recordStorageUsage, resolveStorageOwner } from '@/lib/services/storage-quota-service';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Asset ID is required' },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    const asset = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ assetId, userId });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 },
      );
    }

    const completedMultipartUpload = await db.collection(COLLECTIONS.MEDIA_UPLOADS).findOne({
      assetId,
      userId,
      status: 'completed',
      storageUsageRecordedAt: { $exists: true },
    });

    try {
      if (asset.gcsPath) {
        await deleteFromGCS(asset.gcsPath);
      } else {
        const r2Keys = new Set<string>();
        r2Keys.add(asset.r2Key || asset.assetId);
        if (asset.originalR2Key) r2Keys.add(asset.originalR2Key);
        if (completedMultipartUpload?.r2Key) r2Keys.add(completedMultipartUpload.r2Key);
        for (const r2Key of r2Keys) {
          await deleteFromR2(r2Key);
        }
      }
    } catch (error) {
      console.error('Error deleting from storage:', error);
    }

    await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .deleteOne({ assetId, userId });

    const assetBytes = Number(asset.size) || 0;
    const completedMultipartBytes = Number(completedMultipartUpload?.storageUsageBytes ?? completedMultipartUpload?.totalSize) || 0;
    await recordStorageUsage(resolveStorageOwner(userId, orgId), -(assetBytes + completedMultipartBytes));

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting media asset:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete media asset' },
      { status: 500 },
    );
  }
}