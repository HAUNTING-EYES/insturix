import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enqueueRenderFinalization } from '@/lib/editron/services/render-finalization-dispatch';
import {
  claimFailedJobFinalizationRetry,
  getJob,
  releaseFailedJobFinalizationRetryClaim,
} from '@/lib/editron/services/render-job-service';

const RetryFinalizationRequestSchema = z.object({
  jobId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  const parsed = RetryFinalizationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { type: 'error', code: 'INVALID_RETRY_REQUEST', message: 'A valid render job ID is required.' },
      { status: 400 },
    );
  }

  const job = await getJob(parsed.data.jobId);
  if (!job || job.userId !== userId) {
    return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
  }
  if (job.status === 'done') {
    return NextResponse.json({ type: 'success', data: { state: 'already_done', jobId: job._id } });
  }
  if (job.status === 'finalizing') {
    return NextResponse.json(
      { type: 'success', data: { state: 'already_finalizing', jobId: job._id } },
      { status: 202 },
    );
  }
  if (job.status !== 'error' || job.finalization?.state !== 'failed') {
    return notRetryable();
  }

  const claim = await claimFailedJobFinalizationRetry({ jobId: job._id, userId });
  if (!claim) return notRetryable();

  try {
    const dispatch = await enqueueRenderFinalization(claim);
    return NextResponse.json(
      {
        type: 'success',
        data: {
          state: 'enqueued',
          jobId: claim.jobId,
          messageId: dispatch.messageId,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    const released = await releaseFailedJobFinalizationRetryClaim({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
      error,
    }).catch(() => false);
    if (!released) {
      console.error(`[RenderFinalizationRetry] Failed to restore claim ${claim.claimToken}.`);
    }
    return NextResponse.json(
      {
        type: 'error',
        code: 'FINALIZATION_RETRY_DISPATCH_FAILED',
        message: 'Render finalization could not be queued. The original render was preserved.',
      },
      { status: 503 },
    );
  }
}

function notRetryable() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'FINALIZATION_NOT_RETRYABLE',
      message: 'This render has no retryable preserved finalization artifact.',
    },
    { status: 409 },
  );
}
