import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  executeQueuedMgRenderJob,
  MgRenderJobExecutionError,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';

export const runtime = 'nodejs';
export const maxDuration = 800;
const MAX_SANDBOX_TIME_INSIDE_WORKER_MS = 10 * 60 * 1_000;

const payloadSchema = z.object({
  jobId: z.string().regex(/^mgr_[a-f0-9]{32}$/),
}).strict();

async function handler(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid MG render job payload' }, { status: 400 });
  }

  try {
    const configuredTimeout = Number(process.env.MG_RENDER_SANDBOX_TIMEOUT_MS);
    const workerTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? Math.min(configuredTimeout, MAX_SANDBOX_TIME_INSIDE_WORKER_MS)
      : MAX_SANDBOX_TIME_INSIDE_WORKER_MS;
    const execution = await executeQueuedMgRenderJob(parsed.data.jobId, {
      env: { ...process.env, MG_RENDER_SANDBOX_TIMEOUT_MS: String(workerTimeout) },
    });
    if (execution.status === 'not-claimed') {
      const now = Date.now();
      const retryAt = execution.jobStatus === 'queued'
        ? execution.nextAttemptAt
        : execution.jobStatus === 'running' && execution.leaseExpiresAt && execution.leaseExpiresAt.getTime() <= now
          ? execution.leaseExpiresAt
          : null;
      if (retryAt) {
        const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - now) / 1_000));
        return NextResponse.json(
          { success: false, status: 'waiting-for-lease', jobStatus: execution.jobStatus },
          { status: 503, headers: { 'retry-after': String(retryAfterSeconds) } },
        );
      }
      return NextResponse.json({ success: true, status: execution.jobStatus }, { status: 202 });
    }
    return NextResponse.json({
      success: true,
      status: execution.result.status,
      jobId: execution.result.jobId,
    });
  } catch (error) {
    if (error instanceof MgRenderJobExecutionError) {
      if (error.disposition === 'queued') {
        return NextResponse.json(
          { success: false, status: 'retrying', error: error.message },
          { status: 503 },
        );
      }
      return NextResponse.json({
        success: false,
        status: error.disposition,
        error: error.message,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MGRenderWorker] ${parsed.data.jobId} failed before durable disposition:`, error);
    return NextResponse.json({ success: false, status: 'unknown', error: message }, { status: 500 });
  }
}

// Fail closed outside local development. Missing QStash signing keys must never expose the worker publicly.
export const POST = process.env.NODE_ENV === 'development'
  ? handler
  : verifySignatureAppRouter(handler);
