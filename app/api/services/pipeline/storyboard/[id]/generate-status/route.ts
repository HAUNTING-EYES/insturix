/**
 * GET /api/services/pipeline/storyboard/[id]/generate-status?batchId=xxx
 *
 * Bundle 4 (2026-04-09): Poll storyboard image generation progress.
 *
 * Mirrors /api/services/pipeline/storyboard/[id]/generate-videos/status/route.ts.
 * Used by the export dialog (and any future UI) to show per-scene progress
 * while the QStash workers are running.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboardImageBatchStatus } from '@/lib/pipeline/storyboard-image-queue';
import { getStoryboard } from '@/lib/pipeline/storyboard-db';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyboardId } = await params;
    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'batchId query parameter is required' },
        { status: 400 },
      );
    }

    const { batch, jobs } = await getStoryboardImageBatchStatus(batchId, userId);
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }

    // Also fetch the storyboard doc so frontend gets latest image URLs per scene
    // (jobs table has imageUrl, but storyboard.scenes has the consolidated state
    // including any sub-shot images that landed).
    const storyboard = await getStoryboard(storyboardId, userId);

    return NextResponse.json({
      success: true,
      batchId: batch._id,
      storyboardId,
      status: batch.status,
      storyboardStatus: storyboard?.status || 'generating',
      totalScenes: batch.totalScenes,
      completed: batch.completed,
      failed: batch.failed,
      isComplete: batch.status !== 'processing',
      consistencyCheckDone: batch.consistencyCheckDone || false,
      scenes: jobs.map((j: any) => {
        const sbScene = storyboard?.scenes.find((s: any) => s.sceneIndex === j.sceneIndex);
        return {
          sceneIndex: j.sceneIndex,
          status: j.status,
          imageUrl: sbScene?.imageUrl || j.imageUrl,
          imageAssetId: sbScene?.imageAssetId || j.imageAssetId,
          error: j.error,
          subShotsGenerated: j.subShotsGenerated,
          subShotsFailed: j.subShotsFailed,
        };
      }),
    });
  } catch (error: any) {
    console.error('[storyboard-generate-status]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
