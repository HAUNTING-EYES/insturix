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

function serializeReferenceStatusSubject(subject: any, job?: any) {
  const hasStoredImage = Boolean(subject?.imageUrl);
  return {
    subjectId: subject?.subjectId || job?.subjectId,
    name: job?.subjectName || subject?.name,
    status: hasStoredImage ? subject?.status || job?.status : job?.status || subject?.status,
    imageUrl: subject?.imageUrl || job?.imageUrl,
    imageAssetId: subject?.imageAssetId || job?.imageAssetId,
    imageGcsPath: subject?.imageGcsPath,
    source: subject?.source,
    error: job?.error,
    intent: job?.intent,
    category: subject?.category,
    visualDescription: subject?.visualDescription,
    scenesAppearingIn: subject?.scenesAppearingIn,
    referenceProvenance: subject?.referenceProvenance,
    referenceProvenanceLabel: subject?.referenceProvenanceLabel,
    requiresBrandEvidence: subject?.requiresBrandEvidence,
    brandEvidenceStatus: subject?.brandEvidenceStatus,
    evidenceRequiredReason: subject?.evidenceRequiredReason,
  };
}

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
    const jobsBySubjectId = new Map((jobs || []).map((job: any) => [job.subjectId, job]));
    const subjects = refSet?.subjects?.length
      ? refSet.subjects.map((subject: any) => serializeReferenceStatusSubject(subject, jobsBySubjectId.get(subject.subjectId)))
      : jobs.map((job: any) => serializeReferenceStatusSubject(undefined, job));

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
      subjects,
    });
  } catch (error: any) {
    console.error('[reference-images-generate-status]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
