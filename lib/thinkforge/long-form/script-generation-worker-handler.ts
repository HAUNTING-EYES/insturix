import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processLongFormScriptJob } from './script-generation-job';

const LongFormScriptWorkerPayloadSchema = z.object({
  jobId: z.string().trim().regex(/^longscript_[a-f0-9]+$/),
}).strict();

export async function longFormScriptWorkerHandler(request: NextRequest) {
  const parsed = LongFormScriptWorkerPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid long-form script worker payload.' }, { status: 400 });
  }

  try {
    const result = await processLongFormScriptJob(parsed.data.jobId);
    if (result.status === 'queued' && result.reason !== 'next_action') {
      console.warn('[ThinkForge:LongFormWorker] Durable action queued for retry:', {
        jobId: parsed.data.jobId,
        reason: result.reason,
      });
      return NextResponse.json(result, { status: 500 });
    }
    if (result.status === 'dead_letter') {
      console.error('[ThinkForge:LongFormWorker] Job entered dead letter:', {
        jobId: parsed.data.jobId,
        error: result.error,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ThinkForge:LongFormWorker] Unrecoverable worker failure:', {
      jobId: parsed.data.jobId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ status: 'worker_failure' }, { status: 500 });
  }
}
