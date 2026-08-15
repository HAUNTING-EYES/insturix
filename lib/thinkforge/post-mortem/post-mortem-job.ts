import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { commitPostMortemPlan } from '../agents/post-mortem-agent';
import { deleteSession, getSession } from '../services/db';
import {
  PostMortemInputSchema,
  PostMortemPreparedPlanSchema,
  PostMortemResultSchema,
  type PostMortemInput,
  type PostMortemResult,
} from './post-mortem-contract';
import {
  PostMortemJobLeaseLostError,
  THINKFORGE_POST_MORTEM_JOB_MAX_ATTEMPTS,
  postMortemJobStore,
  type ClaimPostMortemJobResult,
  type PostMortemJobSnapshot,
} from './post-mortem-job-store';
import { preparePostMortemPlan } from './post-mortem-planner';

const HEARTBEAT_INTERVAL_MS = 60_000;

export function isPostMortemWorkerConfigured(): boolean {
  const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  return Boolean(process.env.QSTASH_TOKEN)
    && (isDev || Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY));
}

export async function enqueuePostMortemJob(
  rawInput: PostMortemInput,
  options: { deleteSessionOnCompletion?: boolean } = {},
): Promise<{ job: PostMortemJobSnapshot; created: boolean; queueMessageId: string | null }> {
  if (!isPostMortemWorkerConfigured()) throw new Error('ThinkForge post-mortem worker is not configured.');
  const input = PostMortemInputSchema.parse(rawInput);
  const queued = await postMortemJobStore.createOrGet({
    ...input,
    orgId: input.orgId ?? null,
    deleteSessionOnCompletion: options.deleteSessionOnCompletion === true,
  });
  if (!queued.created) return { ...queued, queueMessageId: queued.job.queueMessageId };

  try {
    const queueMessageId = await dispatchPostMortemJob(queued.job);
    return { ...queued, queueMessageId };
  } catch (error) {
    await postMortemJobStore.markDispatchFailed(queued.job.id, error);
    throw error;
  }
}

export async function dispatchPostMortemJob(job: PostMortemJobSnapshot): Promise<string> {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dispatched = await qstash.publishJSON({
    url: `${baseUrl}/api/internal/workers/thinkforge/post-mortem`,
    body: { jobId: job.id },
    retries: THINKFORGE_POST_MORTEM_JOB_MAX_ATTEMPTS - 1,
    deduplicationId: `${job.id}:${randomUUID()}`,
  });
  await postMortemJobStore.setQueueMessage(job.id, dispatched.messageId);
  return dispatched.messageId;
}

export type ProcessPostMortemJobResult =
  | { status: 'completed' }
  | { status: 'queued' | 'dead_letter'; error: string }
  | { status: 'deferred'; reason: string }
  | { status: 'skipped'; reason: string };

export async function processPostMortemJob(jobId: string): Promise<ProcessPostMortemJobResult> {
  const claim = await postMortemJobStore.claim(jobId);
  if (claim.kind === 'skipped') {
    return claim.reason === 'lease_held'
      ? { status: 'deferred', reason: claim.reason }
      : { status: 'skipped', reason: claim.reason };
  }

  try {
    await runClaimedPostMortemJob(claim);
    return { status: 'completed' };
  } catch (error) {
    try {
      const status = await postMortemJobStore.retryOrDeadLetter(jobId, claim.leaseToken, error);
      return { status, error: safeErrorMessage(error) };
    } catch (transitionError) {
      if (transitionError instanceof PostMortemJobLeaseLostError) {
        return { status: 'deferred', reason: 'lease_lost' };
      }
      throw transitionError;
    }
  }
}

async function runClaimedPostMortemJob(
  claim: Extract<ClaimPostMortemJobResult, { kind: 'claimed' }>,
): Promise<void> {
  const { job, leaseToken } = claim;
  const heartbeat = startLeaseHeartbeat(job.id, leaseToken);
  try {
    let result: PostMortemResult;
    if (job.result) {
      result = PostMortemResultSchema.parse(job.result);
    } else {
      const plan = job.checkpoint
        ? PostMortemPreparedPlanSchema.parse(job.checkpoint)
        : await preparePostMortemPlan(job.input);
      await heartbeat.assert();
      if (!job.checkpoint) await postMortemJobStore.saveCheckpoint(job.id, leaseToken, plan);
      await heartbeat.assert();
      result = PostMortemResultSchema.parse(await commitPostMortemPlan(plan));
      await heartbeat.assert();
      await postMortemJobStore.saveResult(job.id, leaseToken, result);
    }

    await heartbeat.assert();
    const current = await postMortemJobStore.getAuthorized(job.id, job.userId, job.orgId);
    if (!current) throw new PostMortemJobLeaseLostError();
    if (current.input.deleteSessionOnCompletion) {
      await heartbeat.assert();
      const session = await getSession(job.input.sessionId, job.userId, job.orgId);
      if (session) {
        if (session.userId !== job.userId) throw new Error('Only the session owner may finalize deletion.');
        await deleteSession(job.input.sessionId, job.userId);
      }
    }
    await heartbeat.assert();
    await postMortemJobStore.complete(job.id, leaseToken);
  } finally {
    heartbeat.stop();
  }
}

function startLeaseHeartbeat(jobId: string, leaseToken: string): {
  assert: () => Promise<void>;
  stop: () => void;
} {
  let failure: unknown = null;
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight || failure) return;
    inFlight = true;
    void postMortemJobStore.heartbeat(jobId, leaseToken)
      .catch((error) => { failure = error; })
      .finally(() => { inFlight = false; });
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return {
    assert: async () => {
      if (failure) throw failure;
      await postMortemJobStore.heartbeat(jobId, leaseToken);
      if (failure) throw failure;
    },
    stop: () => clearInterval(timer),
  };
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
