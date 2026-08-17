import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import {
  createOrGetQueuedThinkForgeRefineryJob,
  dispatchThinkForgeRefineryJob,
  getThinkForgeRefineryJob,
  isThinkForgeRefineryWorkerConfigured,
  recordThinkForgeRefineryDispatchFailure,
  type ThinkForgeRefineryJobSnapshot,
} from '@/lib/thinkforge/refinery/refinery-job';
import {
  toSafeUrlIngestionProblem,
  validateThinkForgeIngestionUrl,
} from '@/lib/thinkforge/security/url-ingestion-gateway';
import { getSession } from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RefineryRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  urls: z.array(z.string().trim().url().max(2_000)).min(1).max(10),
  // Accepted only for backwards-compatible clients; ownership always comes from sessionId.
  projectId: z.unknown().optional(),
}).strict();

function toClientJob(job: ThinkForgeRefineryJobSnapshot) {
  return {
    id: job.id,
    sessionId: job.sessionId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    result: job.result,
    error: job.error ? {
      code: job.error.code,
      message: publicRefineryErrorMessage(job.error.code),
      retryable: job.error.retryable,
    } : null,
    chargeStatus: job.charge.status,
    deadLetteredAt: job.deadLetteredAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function publicRefineryErrorMessage(code: string): string {
  switch (code) {
    case 'dispatch_failed':
      return 'Research is queued and automatic dispatch recovery is in progress.';
    case 'transient_failure':
      return 'Research processing is retrying automatically.';
    case 'insufficient_credits':
      return 'There are not enough credits to analyze these sources.';
    case 'attempts_exhausted':
    case 'processing_failed':
      return 'Research processing could not complete after repeated attempts.';
    default:
      return 'Research processing could not complete.';
  }
}

/**
 * Queues URL research for a session. The client polls GET before it asks the
 * writer to use those sources, so no authoring request races its research.
 */
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  if (!isThinkForgeRefineryWorkerConfigured()) {
    return NextResponse.json({ error: 'Research processing is temporarily unavailable.' }, { status: 503 });
  }

  let input: z.infer<typeof RefineryRequestSchema>;
  try {
    input = RefineryRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({
      error: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Invalid research request.' : 'Invalid JSON.',
    }, { status: 400 });
  }

  const session = await getSession(input.sessionId, userId, orgId ?? null);
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  let urls: string[];
  try {
    const validatedUrls = await Promise.all(
      [...new Set(input.urls.map((url) => url.trim()))]
        .map((url) => validateThinkForgeIngestionUrl(url)),
    );
    urls = [...new Set(validatedUrls)];
  } catch (error) {
    const problem = toSafeUrlIngestionProblem(error);
    return NextResponse.json({
      error: problem.message,
      code: problem.code,
    }, { status: problem.status });
  }

  const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());
  const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', { taskId: session._id }, billingWallet);
  if (!creditCheck.allowed) {
    return creditCheck.errorResponse ?? NextResponse.json({ error: 'Credit check failed.' }, { status: 500 });
  }

  const { job, created } = await createOrGetQueuedThinkForgeRefineryJob({
    userId,
    orgId: orgId ?? null,
    sessionId: session._id,
    urls,
    wallet: billingWallet,
  });
  if (!created) return NextResponse.json({ job: toClientJob(job), deduplicated: true }, { status: 202 });

  try {
    const queueMessageId = await dispatchThinkForgeRefineryJob(job);
    return NextResponse.json({ job: toClientJob(job), queueMessageId }, { status: 202 });
  } catch (error) {
    const deferred = await recordThinkForgeRefineryDispatchFailure(job.id, error);
    console.warn('[ThinkForge:Refinery] Initial dispatch failed; durable recovery remains queued.', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({
      job: toClientJob(deferred ?? job),
      queueState: 'recovery_pending',
    }, { status: 202 });
  }
}

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  if (!jobId) return NextResponse.json({ error: 'Missing jobId.' }, { status: 400 });

  const job = await getThinkForgeRefineryJob(jobId, userId, orgId ?? null);
  if (!job) return NextResponse.json({ error: 'Research job not found.' }, { status: 404 });
  return NextResponse.json({ job: toClientJob(job) });
}
