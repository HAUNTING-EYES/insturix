/**
 * GET /api/services/pipeline/storyboard/generate/status?batchId=xxx
 *
 * Poll storyboard image generation batch progress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboardBatchStatus } from '@/lib/pipeline/storyboard-queue-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId required' }, { status: 400 });
    }

    const { batch, jobs } = await getStoryboardBatchStatus(batchId, userId);
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      batchId: batch._id,
      storyboardId: batch.storyboardId,
      status: batch.status,
      totalScenes: batch.totalScenes,
      completed: batch.completed,
      failed: batch.failed,
      isComplete: batch.status !== 'processing',
      scenes: jobs.map((j: any) => ({
        sceneIndex: j.sceneIndex,
        status: j.status,
        imageUrl: j.imageUrl,
        error: j.error,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
