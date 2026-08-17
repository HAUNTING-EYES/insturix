import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processObserverJob } from '@/lib/thinkforge/events/observer-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const ObserverWorkerPayloadSchema = z.object({
  jobId: z.string().trim().min(1).max(160).regex(/^observer_[a-zA-Z0-9]+$/),
}).strict();

export async function observerWorkerHandler(request: NextRequest) {
  let payload: z.infer<typeof ObserverWorkerPayloadSchema>;
  try {
    payload = ObserverWorkerPayloadSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({
      error: error instanceof z.ZodError ? 'Invalid observer worker payload.' : 'Invalid JSON.',
    }, { status: 400 });
  }

  const result = await processObserverJob(payload.jobId);
  if (result.status === 'queued') {
    console.warn('[ThinkForge:ObserverWorker] Attempt queued for retry', { jobId: payload.jobId });
    return NextResponse.json(result, { status: 500 });
  }
  if (result.status === 'deferred') {
    return NextResponse.json(result, { status: 409 });
  }
  if (result.status === 'dead_letter') {
    console.error('[ThinkForge:ObserverWorker] Job entered dead letter', { jobId: payload.jobId });
  }
  return NextResponse.json(result);
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function workerNotConfigured() {
  return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
}

export const POST = isDev
  ? observerWorkerHandler
  : hasSigningKeys
    ? verifySignatureAppRouter(observerWorkerHandler)
    : workerNotConfigured;
