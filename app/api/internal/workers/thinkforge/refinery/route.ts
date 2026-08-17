import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  chargeThinkForgeRefineryJob,
  claimThinkForgeRefineryJob,
  failThinkForgeRefineryJob,
  refundThinkForgeRefineryJob,
  retryOrDeadLetterThinkForgeRefineryJob,
  runClaimedThinkForgeRefineryJob,
} from '@/lib/thinkforge/refinery/refinery-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const RefineryWorkerPayloadSchema = z.object({
  jobId: z.string().trim().min(1).max(160).regex(/^refinery_[a-zA-Z0-9]+$/),
}).strict();

async function refineryWorkerHandler(request: NextRequest) {
  let payload: z.infer<typeof RefineryWorkerPayloadSchema>;
  try {
    payload = RefineryWorkerPayloadSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Invalid refinery worker payload.' : 'Invalid JSON.' }, { status: 400 });
  }

  const claimed = await claimThinkForgeRefineryJob(payload.jobId);
  if (claimed.kind === 'skipped') {
    // A concurrent QStash redelivery must not execute the same job twice. A held
    // lease remains retryable; terminal and missing jobs are acknowledged safely.
    if (claimed.reason === 'attempts_exhausted') {
      await refundThinkForgeRefineryJob(payload.jobId, 'ThinkForge research processing exhausted all attempts.');
    }
    const status = claimed.reason === 'lease_held'
      ? 'deferred'
      : claimed.reason === 'attempts_exhausted' ? 'dead_letter' : 'skipped';
    return NextResponse.json({ status, reason: claimed.reason }, {
      status: claimed.reason === 'lease_held' ? 409 : 200,
    });
  }

  const charge = await chargeThinkForgeRefineryJob(claimed.job);
  if (!charge.ok) {
    if (charge.code === 'insufficient_credits') {
      await failThinkForgeRefineryJob(claimed.job, charge.code, charge.message);
      return NextResponse.json({ status: 'failed', code: charge.code });
    }
    const transition = await retryOrDeadLetterThinkForgeRefineryJob(claimed.job, new Error(charge.message));
    if (transition === 'dead_letter') {
      await refundThinkForgeRefineryJob(claimed.job.id, 'ThinkForge research billing could not be confirmed.');
    }
    return NextResponse.json({ status: transition }, { status: transition === 'queued' ? 500 : 200 });
  }

  try {
    await runClaimedThinkForgeRefineryJob(charge.job);
    return NextResponse.json({ status: 'completed' });
  } catch (error) {
    const transition = await retryOrDeadLetterThinkForgeRefineryJob(charge.job, error);
    if (transition === 'dead_letter') {
      await refundThinkForgeRefineryJob(charge.job.id, 'ThinkForge research processing failed after all retry attempts.');
    }
    console.error('[ThinkForge:RefineryWorker] Processing attempt failed:', {
      jobId: charge.job.id,
      attempt: charge.job.attemptCount,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ status: transition }, { status: transition === 'queued' ? 500 : 200 });
  }
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
  return refineryWorkerHandler(request);
}

export const POST = isDev
  ? refineryWorkerHandler
  : (hasSigningKeys ? verifySignatureAppRouter(refineryWorkerHandler) : secureHandler);
