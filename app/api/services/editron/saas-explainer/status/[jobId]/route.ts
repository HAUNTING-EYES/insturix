import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getExplainerJob } from '@/lib/editron/saas-explainer/explainer-job-service';

/**
 * GET /api/services/editron/saas-explainer/status/[jobId]
 * Poll an explainer render job's progress/result. Owner-scoped (404 on mismatch, so ids don't leak).
 */
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getExplainerJob(jobId);
  if (!job || job.userId !== userId) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    status: job.status,
    progress: job.progress,
    videoId: job.videoId,
    outputUrl: job.outputUrl ?? null,
    costUsd: job.costUsd ?? null,
    error: job.error ?? null,
  });
}
