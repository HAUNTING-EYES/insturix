import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processPostMortemJob } from './post-mortem-job';
import { safePostMortemJobErrorMessage } from './post-mortem-job-store';

const PostMortemWorkerPayloadSchema = z.object({
  jobId: z.string().trim().min(1).max(160).regex(/^postmortem_[a-f0-9]+$/),
}).strict();

export async function postMortemWorkerHandler(request: NextRequest) {
  let jobId: string;
  try {
    jobId = PostMortemWorkerPayloadSchema.parse(await request.json()).jobId;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof z.ZodError ? 'Invalid post-mortem worker payload.' : 'Invalid JSON.',
    }, { status: 400 });
  }

  try {
    const result = await processPostMortemJob(jobId);
    if (result.status === 'queued') {
      console.warn('[ThinkForge:PostMortemWorker] Attempt queued for retry:', { jobId });
      return NextResponse.json({ status: result.status }, { status: 500 });
    }
    if (result.status === 'dead_letter') {
      console.error('[ThinkForge:PostMortemWorker] Job entered dead letter:', { jobId });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ThinkForge:PostMortemWorker] Unrecoverable worker failure:', {
      jobId,
      error: safePostMortemJobErrorMessage(error),
    });
    return NextResponse.json({ status: 'worker_failure' }, { status: 500 });
  }
}
