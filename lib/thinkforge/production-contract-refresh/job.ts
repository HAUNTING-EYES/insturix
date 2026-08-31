import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';

import { hashScriptDocumentContent } from '../persistence/script-sidecar-binding';
import * as db from '../services/db';
import {
  planProductionContractRefresh,
  reviseDocumentViaFlatWriter,
  type ProductionContractRefreshPlan,
} from '../services/flat-writer-edit';
import {
  PRODUCTION_CONTRACT_REFRESH_JOB_MAX_STAGE_FAILURES,
  ProductionContractRefreshJobCheckpointConflictError,
  ProductionContractRefreshJobLeaseLostError,
  ProductionContractRefreshJobTransitionError,
  productionContractRefreshJobStore,
  type ClaimProductionContractRefreshJobResult,
  type ProductionContractRefreshCommitReceipt,
  type ProductionContractRefreshJobSnapshot,
} from './job-store';

const HEARTBEAT_INTERVAL_MS = 20_000;
const STAGE_TIMEOUT_MS = 50_000;
const RECOVERY_STALE_MS = 60_000;

type RefundForWallet = typeof import('../../services/creditsService').CreditsService.refundForWallet;

type JobStore = Pick<typeof productionContractRefreshJobStore,
  | 'claim'
  | 'heartbeat'
  | 'saveTreatment'
  | 'saveCommitReceipt'
  | 'yieldLease'
  | 'complete'
  | 'retryOrDeadLetter'
  | 'markRefunded'
  | 'setQueueMessage'
  | 'listRecoverable'
  | 'listRefundPending'
>;

export interface ProductionContractRefreshJobDependencies {
  store?: JobStore;
  plan?: typeof planProductionContractRefresh;
  revise?: typeof reviseDocumentViaFlatWriter;
  loadScript?: typeof db.getScript;
  dispatch?: (jobId: string) => Promise<string>;
  refund?: RefundForWallet;
}

export type ProcessProductionContractRefreshJobResult =
  | { status: 'completed'; documentVersion: number }
  | { status: 'queued'; reason: 'next_stage' | 'retry' | 'dispatch_failed'; error?: string }
  | { status: 'dead_letter'; error: string; refundPending: boolean }
  | { status: 'deferred'; reason: 'lease_held' | 'lease_lost' }
  | { status: 'skipped'; reason: 'not_found' | 'terminal' | 'billing_pending' };

export function isProductionContractRefreshWorkerConfigured(): boolean {
  const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  return Boolean(process.env.QSTASH_TOKEN)
    && (isDev || Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY));
}

export async function dispatchProductionContractRefreshJob(jobId: string): Promise<string> {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dispatched = await qstash.publishJSON({
    url: `${baseUrl}/api/internal/workers/thinkforge/production-contract-refresh`,
    body: { jobId },
    retries: PRODUCTION_CONTRACT_REFRESH_JOB_MAX_STAGE_FAILURES - 1,
    deduplicationId: `${jobId}:${randomUUID()}`,
  });
  await productionContractRefreshJobStore.setQueueMessage(jobId, dispatched.messageId);
  return dispatched.messageId;
}

export async function processProductionContractRefreshJob(
  jobId: string,
  dependencies: ProductionContractRefreshJobDependencies = {},
): Promise<ProcessProductionContractRefreshJobResult> {
  const store = dependencies.store ?? productionContractRefreshJobStore;
  const dispatch = dependencies.dispatch ?? dispatchProductionContractRefreshJob;
  const claim = await store.claim(jobId);
  if (claim.kind === 'skipped') {
    if (claim.reason === 'lease_held') return { status: 'deferred', reason: 'lease_held' };
    return { status: 'skipped', reason: claim.reason };
  }

  const heartbeat = startLeaseHeartbeat(store, jobId, claim.leaseToken);
  try {
    if (claim.job.stage === 'committing' && claim.job.commitReceipt) {
      heartbeat.stop();
      await store.complete(jobId, claim.leaseToken);
      return { status: 'completed', documentVersion: claim.job.commitReceipt.documentVersion };
    }

    if (claim.job.stage === 'treatment') {
      const plan = await (dependencies.plan ?? planProductionContractRefresh)({
        userId: claim.job.userId,
        orgId: claim.job.orgId,
        sessionId: claim.job.sessionId,
        scriptId: claim.job.scriptId,
        expectedVersion: claim.job.baseVersion,
        abortSignal: heartbeat.signal,
      });
      await heartbeat.assert();
      await store.saveTreatment(jobId, claim.leaseToken, plan);
      await heartbeat.assert();
      heartbeat.stop();
      await store.yieldLease(jobId, claim.leaseToken);
      return await redispatch(jobId, dispatch, 'next_stage');
    }

    const receipt = await recoverOrExecuteCommit(claim, heartbeat, dependencies);
    await heartbeat.assert();
    await store.saveCommitReceipt(jobId, claim.leaseToken, receipt);
    heartbeat.stop();
    await store.complete(jobId, claim.leaseToken);
    return { status: 'completed', documentVersion: receipt.documentVersion };
  } catch (error) {
    heartbeat.stop();
    try {
      const status = await store.retryOrDeadLetter(
        jobId,
        claim.leaseToken,
        error,
        isRetryableProductionContractRefreshError(error),
      );
      if (status === 'queued') {
        const result = await redispatch(jobId, dispatch, 'retry');
        return result.error ? { ...result, error: safeError(error) } : result;
      }
      const refunded = await refundDeadLetterJob(claim.job, safeError(error), store, dependencies.refund)
        .then(() => true)
        .catch((refundError) => {
          console.error('[ThinkForge:production-contract-refresh] Durable refund remains pending:', refundError);
          return false;
        });
      return { status: 'dead_letter', error: safeError(error), refundPending: !refunded };
    } catch (transitionError) {
      if (transitionError instanceof ProductionContractRefreshJobLeaseLostError) {
        return { status: 'deferred', reason: 'lease_lost' };
      }
      throw transitionError;
    }
  } finally {
    heartbeat.stop();
  }
}

export async function recoverProductionContractRefreshJobs(
  limit = 25,
  now = new Date(),
  dependencies: ProductionContractRefreshJobDependencies = {},
): Promise<{ candidates: number; dispatched: number; refunded: number; failed: number }> {
  if (!isProductionContractRefreshWorkerConfigured() && !dependencies.dispatch) {
    throw new Error('ThinkForge production-contract refresh worker is not configured.');
  }
  const store = dependencies.store ?? productionContractRefreshJobStore;
  const dispatch = dependencies.dispatch ?? dispatchProductionContractRefreshJob;
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const [recoverable, refundPending] = await Promise.all([
    store.listRecoverable(new Date(now.getTime() - RECOVERY_STALE_MS), boundedLimit),
    store.listRefundPending(boundedLimit),
  ]);
  const dispatchResults = await Promise.allSettled(recoverable.map((job) => dispatch(job.id)));
  const refundResults = await Promise.allSettled(refundPending.map((job) => (
    refundDeadLetterJob(job, job.error?.message ?? 'Production-contract refresh failed.', store, dependencies.refund)
  )));
  const dispatched = dispatchResults.filter((result) => result.status === 'fulfilled').length;
  const refunded = refundResults.filter((result) => result.status === 'fulfilled').length;
  return {
    candidates: recoverable.length + refundPending.length,
    dispatched,
    refunded,
    failed: dispatchResults.length + refundResults.length - dispatched - refunded,
  };
}

async function recoverOrExecuteCommit(
  claim: Extract<ClaimProductionContractRefreshJobResult, { kind: 'claimed' }>,
  heartbeat: ReturnType<typeof startLeaseHeartbeat>,
  dependencies: ProductionContractRefreshJobDependencies,
): Promise<ProductionContractRefreshCommitReceipt> {
  const existing = await (dependencies.loadScript ?? db.getScript)(claim.job.sessionId, claim.job.scriptId);
  if (isThisJobCommitted(existing, claim.job)) {
    return {
      documentVersion: existing!.version ?? 0,
      contentHash: hashScriptDocumentContent(existing!.content),
      committedAt: new Date().toISOString(),
    };
  }
  if (!claim.job.treatmentCheckpoint) {
    throw new ProductionContractRefreshJobTransitionError('Sidecar refresh requires a treatment checkpoint.');
  }
  const refreshed = await (dependencies.revise ?? reviseDocumentViaFlatWriter)({
    mode: 'refresh-production-contract',
    userId: claim.job.userId,
    orgId: claim.job.orgId,
    sessionId: claim.job.sessionId,
    scriptId: claim.job.scriptId,
    expectedVersion: claim.job.baseVersion,
    productionContractPlan: checkpointToPlan(claim.job.treatmentCheckpoint),
    refreshJobId: claim.job.id,
    abortSignal: heartbeat.signal,
    beforeCommit: heartbeat.assert,
  });
  return {
    documentVersion: refreshed.version ?? 0,
    contentHash: hashScriptDocumentContent(refreshed.content),
    committedAt: new Date().toISOString(),
  };
}

function checkpointToPlan(
  checkpoint: NonNullable<ProductionContractRefreshJobSnapshot['treatmentCheckpoint']>,
): ProductionContractRefreshPlan {
  return {
    treatment: checkpoint.treatment,
    inputFingerprint: checkpoint.inputFingerprint,
    source: checkpoint.source,
    cacheStatus: checkpoint.cacheStatus,
    modelName: checkpoint.modelName,
    latencyMs: checkpoint.latencyMs,
    ...(checkpoint.writingContextCacheStatus
      ? { writingContextCacheStatus: checkpoint.writingContextCacheStatus }
      : {}),
    writingKnowledgeVersion: checkpoint.writingKnowledgeVersion,
    editronCreativeGraphVersion: checkpoint.editronCreativeGraphVersion,
  };
}

function isThisJobCommitted(
  script: Awaited<ReturnType<typeof db.getScript>>,
  job: ProductionContractRefreshJobSnapshot,
): boolean {
  if (!script || (script.version ?? 0) !== job.baseVersion + 1) return false;
  if (hashScriptDocumentContent(script.content) !== job.input.documentHash) return false;
  const metadata = script.metadata && typeof script.metadata === 'object'
    ? script.metadata as Record<string, unknown>
    : {};
  return metadata.productionContractRefreshJobId === job.id;
}

async function redispatch(
  jobId: string,
  dispatch: (jobId: string) => Promise<string>,
  reason: 'next_stage' | 'retry',
): Promise<Extract<ProcessProductionContractRefreshJobResult, { status: 'queued' }>> {
  try {
    await dispatch(jobId);
    return { status: 'queued', reason };
  } catch (error) {
    return { status: 'queued', reason: 'dispatch_failed', error: safeError(error) };
  }
}

async function refundDeadLetterJob(
  job: ProductionContractRefreshJobSnapshot,
  reason: string,
  store: JobStore,
  refundOverride?: RefundForWallet,
): Promise<void> {
  const { wallet, transactionId, cost } = job.billing;
  if (!wallet || !transactionId || !cost) {
    throw new ProductionContractRefreshJobTransitionError('Dead-letter refresh is missing its durable billing receipt.');
  }
  const refund = refundOverride ?? (await import('../../services/creditsService')).CreditsService.refundForWallet;
  const result = await refund(wallet, cost, reason, {
    service: 'thinkforge',
    action: 'document_creation',
    originalTransactionId: transactionId,
    projectId: job.sessionId,
  });
  if (!result.success) throw new Error(result.error || 'Production-contract refresh refund failed.');
  await store.markRefunded(job.id, reason);
}

function startLeaseHeartbeat(store: JobStore, jobId: string, leaseToken: string) {
  let failure: unknown = null;
  let inFlight = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    const error = new Error('Production-contract refresh stage exceeded its 50-second execution budget.');
    failure = error;
    controller.abort(error);
  }, STAGE_TIMEOUT_MS);
  timeout.unref();
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
      await store.heartbeat(jobId, leaseToken).catch((error) => {
        recordFailure(error);
        throw error;
      });
      if (failure) throw failure;
    },
    stop: () => {
      clearInterval(timer);
      clearTimeout(timeout);
    },
  };
}

function isRetryableProductionContractRefreshError(error: unknown): boolean {
  if (error instanceof ProductionContractRefreshJobTransitionError
    || error instanceof ProductionContractRefreshJobCheckpointConflictError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return ![
    'Version conflict',
    'changed visible content',
    'available only for video scripts',
    'Document not found',
    'Session not found',
  ].some((fragment) => message.includes(fragment));
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(token|key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 2_000);
}
