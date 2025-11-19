/**
 * DELETE /api/services/editron/media/delete
 * Delete a media asset
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import { deleteFromGCS } from '@/lib/editron/services/gcs-service';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Asset ID is required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    
    // Find the asset to get GCS path
    const asset = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ assetId, userId });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Delete from GCS
    try {
      await deleteFromGCS(asset.gcsPath);
    } catch (error) {
      console.error('Error deleting from GCS:', error);
      // Continue even if GCS deletion fails
    }

    // Delete from MongoDB
    await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .deleteOne({ assetId, userId });

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting media asset:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete media asset' },
      { status: 500 }
    );
  }
}
