import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import {
  LongFormScriptJobLeaseLostError,
  LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES,
  longFormScriptGenerationJobStore,
  resolveLongFormScriptJobNextAction,
  type ClaimLongFormScriptJobResult,
  type LongFormScriptGenerationJobInput,
  type LongFormScriptGenerationJobSnapshot,
} from './script-generation-job-store';
import {
  executeLongFormScriptAction,
  isRetryableLongFormScriptActionError,
  type LongFormScriptActionResult,
} from './script-generation-execution';

const HEARTBEAT_INTERVAL_MS = 60_000;
const RECOVERY_STALE_MS = 2 * 60_000;

type JobStore = Pick<typeof longFormScriptGenerationJobStore,
  | 'createOrGet'
  | 'claim'
  | 'heartbeat'
  | 'savePlan'
  | 'saveChapterArtifact'
  | 'saveAssembledResult'
  | 'saveCommitReceipt'
  | 'yieldLease'
  | 'complete'
  | 'retryOrDeadLetter'
  | 'setQueueMessage'
  | 'listRecoverable'
>;

export interface LongFormScriptJobDependencies {
  store?: JobStore;
  execute?: typeof executeLongFormScriptAction;
  dispatch?: (jobId: string) => Promise<string>;
}

export function isLongFormScriptWorkerConfigured(): boolean {
  const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  return Boolean(process.env.QSTASH_TOKEN)
    && (isDev || Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY));
}

export async function enqueueLongFormScriptJob(
  input: LongFormScriptGenerationJobInput,
): Promise<{ job: LongFormScriptGenerationJobSnapshot; created: boolean; queueMessageId: string | null }> {
  if (!isLongFormScriptWorkerConfigured()) {
    throw new Error('ThinkForge long-form script worker is not configured.');
  }
  const queued = await longFormScriptGenerationJobStore.createOrGet(input);
  if (!queued.created) return { ...queued, queueMessageId: queued.job.queueMessageId };
  const queueMessageId = await dispatchLongFormScriptJob(queued.job.id);
  return { ...queued, queueMessageId };
}

export async function dispatchLongFormScriptJob(jobId: string): Promise<string> {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dispatched = await qstash.publishJSON({
    url: `${baseUrl}/api/internal/workers/thinkforge/long-form-script`,
    body: { jobId },
    retries: LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES - 1,
    deduplicationId: `${jobId}:${randomUUID()}`,
  });
  await longFormScriptGenerationJobStore.setQueueMessage(jobId, dispatched.messageId);
  return dispatched.messageId;
}

export async function recoverStalledLongFormScriptJobs(
  limit = 25,
  now = new Date(),
): Promise<{ candidates: number; dispatched: number; failed: number }> {
  if (!isLongFormScriptWorkerConfigured()) {
    throw new Error('ThinkForge long-form script worker is not configured.');
  }
  const jobs = await longFormScriptGenerationJobStore.listRecoverable(
    new Date(now.getTime() - RECOVERY_STALE_MS),
    Math.max(1, Math.min(limit, 100)),
  );
  const results = await Promise.allSettled(jobs.map((job) => dispatchLongFormScriptJob(job.id)));
  return {
    candidates: jobs.length,
    dispatched: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
}

export type ProcessLongFormScriptJobResult =
  | { status: 'completed' }
  | { status: 'queued'; reason: 'next_action' | 'retry' | 'dispatch_failed'; error?: string }
  | { status: 'dead_letter'; error: string }
  | { status: 'deferred'; reason: 'lease_held' | 'lease_lost' }
  | { status: 'skipped'; reason: 'not_found' | 'terminal' };

export async function processLongFormScriptJob(
  jobId: string,
  dependencies: LongFormScriptJobDependencies = {},
): Promise<ProcessLongFormScriptJobResult> {
  const store = dependencies.store ?? longFormScriptGenerationJobStore;
  const execute = dependencies.execute ?? executeLongFormScriptAction;
  const dispatch = dependencies.dispatch ?? dispatchLongFormScriptJob;
  const claim = await store.claim(jobId);
  if (claim.kind === 'skipped') {
    return claim.reason === 'lease_held'
      ? { status: 'deferred', reason: 'lease_held' }
      : { status: 'skipped', reason: claim.reason };
  }

  const heartbeat = startLeaseHeartbeat(store, jobId, claim.leaseToken);
  try {
    const action = resolveLongFormScriptJobNextAction(claim.job);
    const output = await execute({ job: claim.job, action, signal: heartbeat.signal });
    await heartbeat.assert();
    await saveActionCheckpoint(store, claim, output);
    await heartbeat.assert();

    if (output.kind === 'commit' || output.kind === 'complete') {
      heartbeat.stop();
      await store.complete(jobId, claim.leaseToken);
      return { status: 'completed' };
    }

    heartbeat.stop();
    await store.yieldLease(jobId, claim.leaseToken);
    try {
      await dispatch(jobId);
      return { status: 'queued', reason: 'next_action' };
    } catch (error) {
      return { status: 'queued', reason: 'dispatch_failed', error: safeError(error) };
    }
  } catch (error) {
    heartbeat.stop();
    try {
      const status = await store.retryOrDeadLetter(
        jobId,
        claim.leaseToken,
        error,
        isRetryableLongFormScriptActionError(error),
      );
      return status === 'queued'
        ? { status, reason: 'retry', error: safeError(error) }
        : { status, error: safeError(error) };
    } catch (transitionError) {
      if (transitionError instanceof LongFormScriptJobLeaseLostError) {
        return { status: 'deferred', reason: 'lease_lost' };
      }
      throw transitionError;
    }
  } finally {
    heartbeat.stop();
  }
}

async function saveActionCheckpoint(
  store: JobStore,
  claim: Extract<ClaimLongFormScriptJobResult, { kind: 'claimed' }>,
  output: LongFormScriptActionResult,
): Promise<void> {
  switch (output.kind) {
    case 'plan': return store.savePlan(claim.job.id, claim.leaseToken, output.plan);
    case 'write_chapter': return store.saveChapterArtifact(claim.job.id, claim.leaseToken, output.artifact);
    case 'assemble': return store.saveAssembledResult(claim.job.id, claim.leaseToken, output.result);
    case 'commit': return store.saveCommitReceipt(claim.job.id, claim.leaseToken, output.receipt);
    case 'complete': return;
  }
}

function startLeaseHeartbeat(store: JobStore, jobId: string, leaseToken: string) {
  let failure: unknown = null;
  let inFlight = false;
  const controller = new AbortController();
  const recordFailure = (error: unknown) => {
    failure = error;
    controller.abort(error);
  };
  const timer = setInterval(() => {
    if (inFlight || failure) return;
    inFlight = true;
    void store.heartbeat(jobId, leaseToken)
      .catch(recordFailure)
      .finally(() => { inFlight = false; });
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return {
    signal: controller.signal,
    assert: async () => {
      if (failure) throw failure;
      try {
        await store.heartbeat(jobId, leaseToken);
      } catch (error) {
        recordFailure(error);
        throw error;
      }
      if (failure) throw failure;
    },
    stop: () => clearInterval(timer),
  };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(token|key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 2_000);
}
