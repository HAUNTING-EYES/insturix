import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processPostMortemJob } from '@/lib/thinkforge/post-mortem/post-mortem-job';
import { safePostMortemJobErrorMessage } from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function workerNotConfigured() {
  return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
}

export const POST = isDev
  ? postMortemWorkerHandler
  : hasSigningKeys
    ? verifySignatureAppRouter(postMortemWorkerHandler)
    : workerNotConfigured;
