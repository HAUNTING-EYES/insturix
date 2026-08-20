import { NextResponse } from 'next/server';
import { z } from 'zod';
import { processObserverJob } from './observer-job';

const ObserverWorkerPayloadSchema = z.object({
  jobId: z.string().trim().min(1).max(160).regex(/^observer_[a-zA-Z0-9]+$/),
}).strict();

export async function observerWorkerHandler(request: Request) {
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
