/**
 * GET /api/services/pipeline/storyboard/[id]/generate-videos/status?batchId=xxx
 *
 * Poll video generation batch progress.
 * Returns per-scene status so the frontend can show real-time progress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVideoBatchStatus } from '@/lib/pipeline/video-queue-service';

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

    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'batchId query parameter is required' },
        { status: 400 },
      );
    }

    const { batch, jobs } = await getVideoBatchStatus(batchId, userId);

    if (!batch) {
      return NextResponse.json(
        { success: false, error: 'Batch not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      batchId: batch._id,
      status: batch.status,
      totalScenes: batch.totalScenes,
      completed: batch.completed,
      failed: batch.failed,
      isComplete: batch.status !== 'processing',
      scenes: jobs.map((j: any) => ({
        sceneIndex: j.sceneIndex,
        status: j.status,
        videoUrl: j.videoUrl,
        videoAssetId: j.videoAssetId,
        error: j.error,
      })),
    });
  } catch (error: any) {
    console.error('[video-status] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
