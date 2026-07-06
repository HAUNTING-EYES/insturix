import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  buildMediaUploadBatchSummary,
  normalizeUploadBatchId,
  type MediaUploadBatchAssetStatusInput,
} from '@/lib/editron/services/media-upload-batch';

export const runtime = 'nodejs';

type BatchDocument = {
  uploadBatchId: string;
  userId: string;
  orgId?: string;
  projectId?: string;
  assetIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
};

type BatchMediaAsset = {
  assetId: string;
  filename: string;
  type: 'video' | 'image' | 'audio';
  size?: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  thumbnail?: string;
  uploadedAt?: Date;
  analysisStatus?: string | null;
  analysisError?: string | null;
  analysisSkipReason?: string | null;
  analysisQueuedAt?: Date | null;
  analysisStartedAt?: Date | null;
  analysisCompletedAt?: Date | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uploadBatchId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let uploadBatchId: string;
    try {
      uploadBatchId = normalizeUploadBatchId((await params).uploadBatchId);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Invalid upload batch id' },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const batch = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({ uploadBatchId, userId }) as BatchDocument | null;
    const assetIds = Array.isArray(batch?.assetIds) ? batch.assetIds.filter(Boolean) : [];
    const assetFilter = assetIds.length > 0
      ? { userId, $or: [{ uploadBatchId }, { assetId: { $in: assetIds } }] }
      : { userId, uploadBatchId };

    const mediaAssets = await db.collection(COLLECTIONS.MEDIA_ASSETS)
      .find(assetFilter, {
        projection: {
          _id: 0,
          assetId: 1,
          filename: 1,
          type: 1,
          size: 1,
          duration: 1,
          dimensions: 1,
          thumbnail: 1,
          uploadedAt: 1,
          analysisStatus: 1,
          analysisError: 1,
          analysisSkipReason: 1,
          analysisQueuedAt: 1,
          analysisStartedAt: 1,
          analysisCompletedAt: 1,
        },
      })
      .sort({ uploadedAt: 1 })
      .toArray() as unknown as BatchMediaAsset[];

    const summary = buildMediaUploadBatchSummary(mediaAssets.map((asset): MediaUploadBatchAssetStatusInput => ({
      assetId: asset.assetId,
      filename: asset.filename,
      type: asset.type,
      size: asset.size ?? 0,
      duration: asset.duration,
      dimensions: asset.dimensions,
      thumbnail: asset.thumbnail,
      uploadedAt: asset.uploadedAt,
      analysisStatus: asset.analysisStatus,
      analysisError: asset.analysisError,
      analysisSkipReason: asset.analysisSkipReason,
      analysisQueuedAt: asset.analysisQueuedAt,
      analysisStartedAt: asset.analysisStartedAt,
      analysisCompletedAt: asset.analysisCompletedAt,
    })));

    return NextResponse.json({
      success: true,
      batch: {
        uploadBatchId,
        exists: Boolean(batch) || mediaAssets.length > 0,
        projectId: batch?.projectId,
        createdAt: batch?.createdAt,
        updatedAt: batch?.updatedAt,
        ...summary,
      },
    });
  } catch (error: any) {
    console.error('[UploadBatch] failed to load batch status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load upload batch' },
      { status: 500 },
    );
  }
}