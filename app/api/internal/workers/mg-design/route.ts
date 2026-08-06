import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  executeQueuedMgDesignJob,
  MgDesignJobExecutionError,
} from '@/lib/editron/motion-graphics/codegen/mg-design-job-runner';

export const runtime = 'nodejs';
export const maxDuration = 800;

const payloadSchema = z.object({
  jobId: z.string().regex(/^mgd_[a-f0-9]{32}$/),
}).strict();

async function handler(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid MG design job payload' }, { status: 400 });
  }

  try {
    const execution = await executeQueuedMgDesignJob(parsed.data.jobId);
    if (execution.status === 'not-claimed') {
      if (execution.jobStatus === 'queued' || execution.jobStatus === 'running') {
        const retryAt = execution.jobStatus === 'queued'
          ? execution.nextAttemptAt
          : execution.leaseExpiresAt;
        const retryAfterSeconds = retryAt
          ? Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1_000))
          : 15;
        return NextResponse.json(
          { success: false, status: 'waiting', jobStatus: execution.jobStatus },
          { status: 503, headers: { 'retry-after': String(retryAfterSeconds) } },
        );
      }
      return NextResponse.json({ success: true, status: execution.jobStatus }, { status: 202 });
    }
    return NextResponse.json({ success: true, status: 'completed', result: execution.result });
  } catch (error) {
    if (error instanceof MgDesignJobExecutionError) {
      return NextResponse.json(
        { success: false, status: error.disposition, error: error.message },
        { status: error.disposition === 'queued' ? 503 : 500 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MGDesignWorker] ${parsed.data.jobId} failed before durable disposition:`, error);
    return NextResponse.json({ success: false, status: 'unknown', error: message }, { status: 500 });
  }
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function secureHandler(request: NextRequest): Promise<NextResponse> {
  if (!isDev && !hasSigningKeys) {
    console.error('[MGDesignWorker] SECURITY: QStash signing keys not configured');
    return NextResponse.json({ success: false, error: 'Worker not configured' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
