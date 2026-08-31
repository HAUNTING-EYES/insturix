import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { processProductionContractRefreshJob } from '@/lib/thinkforge/production-contract-refresh/job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WorkerPayloadSchema = z.object({
  jobId: z.string().regex(/^contractrefresh_[a-f0-9]+$/),
}).strict();

export async function productionContractRefreshWorkerHandler(request: NextRequest) {
  const parsed = WorkerPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid production refresh worker payload.' }, { status: 400 });
  }
  try {
    const result = await processProductionContractRefreshJob(parsed.data.jobId);
    if (result.status === 'queued' && result.reason === 'dispatch_failed') {
      return NextResponse.json(result, { status: 500 });
    }
    if (result.status === 'dead_letter') {
      console.error('[ThinkForge:ProductionRefreshWorker] Job entered dead letter:', {
        jobId: parsed.data.jobId,
        error: result.error,
        refundPending: result.refundPending,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ThinkForge:ProductionRefreshWorker] Unrecoverable worker failure:', {
      jobId: parsed.data.jobId,
      error: error instanceof Error ? error.message : 'unknown',
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
  ? productionContractRefreshWorkerHandler
  : hasSigningKeys
    ? verifySignatureAppRouter(productionContractRefreshWorkerHandler)
    : workerNotConfigured;
