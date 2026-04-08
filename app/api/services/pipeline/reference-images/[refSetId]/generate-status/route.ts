/**
 * GET /api/services/pipeline/reference-images/[refSetId]/generate-status?batchId=xxx
 *
 * Bundle 4 (2026-04-09): Poll reference-image generation progress.
 *
 * Mirrors the storyboard generate-status route. Used by the export dialog
 * while reference-image workers are running.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReferenceImageBatchStatus } from '@/lib/pipeline/reference-image-queue';
import { getReferenceImageSet } from '@/lib/pipeline/reference-image-db';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ refSetId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { refSetId } = await params;
    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'batchId query parameter is required' },
        { status: 400 },
      );
    }

    const { batch, jobs } = await getReferenceImageBatchStatus(batchId, userId);
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }

    // Pull the full ref set so frontend gets visualDescription etc.
    const refSet = await getReferenceImageSet(refSetId, userId);

    return NextResponse.json({
      success: true,
      batchId: batch._id,
      refSetId,
      status: batch.status,
      refSetStatus: refSet?.status || 'generating',
      totalSubjects: batch.totalSubjects,
      completed: batch.completed,
      failed: batch.failed,
      isComplete: batch.status !== 'processing',
      subjects: jobs.map((j: any) => {
        const subj = refSet?.subjects.find((s: any) => s.subjectId === j.subjectId);
        return {
          subjectId: j.subjectId,
          name: j.subjectName || subj?.name,
          status: j.status,
          imageUrl: subj?.imageUrl || j.imageUrl,
          imageAssetId: subj?.imageAssetId || j.imageAssetId,
          error: j.error,
          intent: j.intent,
          category: subj?.category,
          visualDescription: subj?.visualDescription,
          scenesAppearingIn: subj?.scenesAppearingIn,
        };
      }),
    });
  } catch (error: any) {
    console.error('[reference-images-generate-status]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
