import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobV1,
  type MediaProxyMasterTranscodeDurableJobInputV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeDurableResultV1,
  createMediaProxyMasterTranscodeDurableResumeStateV1,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV1,
  readMediaProxyMasterTranscodeDurableResumeResultV1,
  type MediaProxyMasterTranscodeDurableResultV1,
} from './media-proxy-master-transcode-durable-result-v1';
import type {
  MediaProxyMasterTrustedTranscodeExecutionResultV1,
  MediaProxyMasterTrustedTranscodeExecutorV1,
} from './media-proxy-master-trusted-transcode-executor-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V1_1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1 =
  'MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_EXECUTOR' as const;
export const MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1 =
  'MEDIA_ASSETS' as const;
export const MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_OWNER_V3' as const;

const MAX_HEARTBEAT_INTERVAL_MS = Math.floor(
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3,
);
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type MasterAssetV1 = Parameters<
  MediaProxyMasterTrustedTranscodeExecutorV1['execute']
>[0]['masterAsset'];

export type MediaProxyMasterTranscodeBudgetAuthorizationV1 = Readonly<
  | {
      disposition: 'AUTHORIZED';
      reservationId: string;
      reservationBindingSha256: string;
      authorizationReceiptSha256: string;
    }
  | {
      disposition: 'BLOCKED';
      errorCode: string;
      retryable: boolean;
      proofSha256: string;
    }
>;

export interface MediaProxyMasterTranscodeBudgetOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  authorize(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  }>): Promise<MediaProxyMasterTranscodeBudgetAuthorizationV1>;
  settleTerminal(job: Readonly<DurableWorkflowJobSnapshotV1>): Promise<unknown>;
}

export type MediaProxyMasterTranscodeRetryDecisionInputV1 = Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  diagnosticCode: string;
  retryableHint: boolean | null;
  now: Date;
}>;

export type MediaProxyMasterTranscodeRetryDecisionV1 = Readonly<
  | { disposition: 'RETRY_AT'; retryAt: Date }
  | { disposition: 'STOP_UNVERIFIABLE'; reason: string }
>;

export interface MediaProxyMasterTranscodeRetryOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  decide(
    input: MediaProxyMasterTranscodeRetryDecisionInputV1,
  ): Promise<MediaProxyMasterTranscodeRetryDecisionV1>;
}

export interface MediaProxyMasterTranscodeHeartbeatOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  heartbeatIntervalMs: number;
}

export interface MediaProxyMasterCurrentAssetOwnerV1 {
  ownerId: typeof MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1;
  ownerVersion: typeof MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1;
  runtimePolicyBindingSha256: string;
  resolve(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  }>): Promise<MasterAssetV1 | null>;
}

export interface MediaProxyMasterTranscodeExecutionOwnerV1 {
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1;
  ownerVersion: string;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
  execute: MediaProxyMasterTrustedTranscodeExecutorV1['execute'];
}

export type MediaProxyMasterTranscodeDurableWorkerResultV1 = Readonly<
  | { kind: 'skipped'; reason: string }
  | { kind: 'lease_lost'; reason: string }
  | { kind: 'cancelled'; jobId: string }
  | { kind: 'retry_wait' | 'dead_letter'; jobId: string; errorCode: string }
  | {
      kind: 'completed';
      jobId: string;
      disposition: 'PASS' | 'UNVERIFIABLE';
      receiptSha256: string;
    }
>;

class WorkerFailureV1 extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(identity(code, 'ERROR_CODE'));
    this.name = 'MediaProxyMasterTranscodeDurableWorkerFailureV1';
  }
}

class CancellationRequestedV1 extends Error {}

export async function runMediaProxyMasterTranscodeDurableWorkerV1(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1,
      'claim' | 'heartbeat' | 'saveResumeState' | 'complete'
      | 'retryOrDeadLetter' | 'markCancelled' | 'getAuthorized'>;
    jobId: string;
    workerId: string;
    budgetOwner: Readonly<MediaProxyMasterTranscodeBudgetOwnerV1>;
    retryOwner: Readonly<MediaProxyMasterTranscodeRetryOwnerV1>;
    heartbeatOwner: Readonly<MediaProxyMasterTranscodeHeartbeatOwnerV1>;
    currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV1>;
    transcodeOwner: Readonly<MediaProxyMasterTranscodeExecutionOwnerV1>;
    clock?: () => Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableWorkerResultV1> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') {
    if ('job' in claim && isTerminal(claim.job.status)) {
      const jobInput = resolveClaimedJob(claim.job);
      assertOwnerBindings(input, jobInput);
      await input.budgetOwner.settleTerminal(claim.job);
    }
    return Object.freeze({ kind: 'skipped', reason: claim.reason });
  }
  if (claim.kind === 'cancel_claimed') {
    const jobInput = resolveClaimedJob(claim.job);
    assertOwnerBindings(input, jobInput);
    await input.jobStore.markCancelled({
      jobId: claim.job.jobId,
      leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, clock()),
      now: clock(),
    });
    await settleCommittedTerminal(input, claim.job);
    return Object.freeze({ kind: 'cancelled', jobId: claim.job.jobId });
  }

  let cancellationRequested = false;
  let ownerBindingsVerified = false;
  let terminalSettlementStarted = false;
  let authorizationReceiptSha256: string | null = null;
  const resumeSequence = claim.job.resumeState?.sequence ?? 0;
  const heartbeat = async (): Promise<void> => {
    const state = await input.jobStore.heartbeat({
      jobId: claim.job.jobId,
      leaseToken: claim.leaseToken,
      now: clock(),
    });
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequestedV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CANCEL_REQUESTED',
      );
    }
  };

  try {
    await heartbeat();
    const jobInput = resolveClaimedJob(claim.job);
    assertOwnerBindings(input, jobInput);
    ownerBindingsVerified = true;
    authorizationReceiptSha256 = await authorizeBudget(
      input.budgetOwner,
      claim.job,
      jobInput,
    );
    await heartbeat();

    let result = readResumeResult(claim.job, jobInput);
    if (result) {
      if (result.budgetAuthorizationReceiptSha256
        !== authorizationReceiptSha256) {
        throw new WorkerFailureV1(
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_REAUTHORIZATION_MISMATCH',
          false,
        );
      }
    } else {
      const masterAsset = await input.currentAssetOwner.resolve({
        job: claim.job,
        jobInput,
      });
      if (!masterAsset) {
        throw new WorkerFailureV1(
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_MASTER_ASSET_UNAVAILABLE',
          true,
        );
      }
      await heartbeat();
      const execution = await executeWithHeartbeats({
        execute: (abortSignal) => input.transcodeOwner.execute({
          command: jobInput.command,
          masterAsset,
          abortSignal,
        }),
        heartbeat,
        heartbeatIntervalMs: input.heartbeatOwner.heartbeatIntervalMs,
      });
      const outcome = normalizeExecutionOutcome(execution);
      if (outcome.disposition === 'UNVERIFIABLE') {
        const decision = await decideRetry(input.retryOwner, {
          job: claim.job,
          diagnosticCode: outcome.diagnostic,
          retryableHint: null,
          now: clock(),
        });
        if (decision.disposition === 'RETRY_AT') {
          const retry = await transitionRetry({
            jobStore: input.jobStore,
            job: claim.job,
            leaseToken: claim.leaseToken,
            errorCode: outcome.diagnostic,
            retryAt: decision.retryAt,
            decision,
            now: clock(),
          });
          if (retry.kind === 'dead_letter') {
            await settleCommittedTerminal(input, claim.job);
          }
          return retry;
        }
        await heartbeat();
        const terminal = unverifiableReceipt({
          job: claim.job,
          jobInput,
          authorizationReceiptSha256,
          diagnosticCode: outcome.diagnostic,
          decision,
          transcodeOwner: input.transcodeOwner,
          completedAt: clock(),
        });
        await input.jobStore.complete({
          jobId: claim.job.jobId,
          leaseToken: claim.leaseToken,
          receipt: terminal,
          now: clock(),
        });
        terminalSettlementStarted = true;
        await settleCommittedTerminal(input, claim.job);
        return Object.freeze({
          kind: 'completed',
          jobId: claim.job.jobId,
          disposition: 'UNVERIFIABLE',
          receiptSha256: terminal.receiptSha256,
        });
      }
      result = createMediaProxyMasterTranscodeDurableResultV1({
        jobId: claim.job.jobId,
        operationId: claim.job.operationId,
        jobInputBindingSha256: claim.job.input.bindingSha256,
        jobInput,
        budgetAuthorizationReceiptSha256: authorizationReceiptSha256,
        trustedTranscodeReceipt: outcome.receipt,
      });
      const resume = createMediaProxyMasterTranscodeDurableResumeStateV1({
        result,
        jobId: claim.job.jobId,
        operationId: claim.job.operationId,
        jobInputBindingSha256: claim.job.input.bindingSha256,
        jobInput,
      });
      await heartbeat();
      await input.jobStore.saveResumeState({
        jobId: claim.job.jobId,
        leaseToken: claim.leaseToken,
        expectedSequence: resumeSequence,
        state: resume,
        now: clock(),
      });
    }

    await heartbeat();
    const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV1({
      jobId: claim.job.jobId,
      operationId: claim.job.operationId,
      jobInputBindingSha256: claim.job.input.bindingSha256,
      jobInput,
      result,
      completedAt: clock(),
    });
    await input.jobStore.complete({
      jobId: claim.job.jobId,
      leaseToken: claim.leaseToken,
      receipt: terminal,
      now: clock(),
    });
    terminalSettlementStarted = true;
    await settleCommittedTerminal(input, claim.job);
    return Object.freeze({
      kind: 'completed',
      jobId: claim.job.jobId,
      disposition: 'PASS',
      receiptSha256: terminal.receiptSha256,
    });
  } catch (error) {
    if (terminalSettlementStarted) throw error;
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return Object.freeze({ kind: 'lease_lost', reason: error.message });
    }
    const current = await input.jobStore.getAuthorized({
      jobId: claim.job.jobId,
      tenantId: claim.job.tenantId,
      userId: claim.job.userId,
    });
    if (current && isTerminal(current.status)) {
      if (ownerBindingsVerified) await input.budgetOwner.settleTerminal(current);
      return Object.freeze({ kind: 'skipped', reason: 'terminal' });
    }
    if (cancellationRequested || error instanceof CancellationRequestedV1
      || current?.cancelRequestedAt) {
      try {
        await input.jobStore.markCancelled({
          jobId: claim.job.jobId,
          leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(current ?? claim.job, clock()),
          now: clock(),
        });
        if (ownerBindingsVerified) await settleCommittedTerminal(input, claim.job);
        return Object.freeze({ kind: 'cancelled', jobId: claim.job.jobId });
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return Object.freeze({ kind: 'lease_lost', reason: cancelError.message });
        }
        throw cancelError;
      }
    }
    const failure = await settleFailure({
      input,
      claim,
      current,
      error,
      clock,
      ownerBindingsVerified,
      authorizationReceiptSha256,
    });
    if (failure.kind === 'dead_letter' && ownerBindingsVerified) {
      await settleCommittedTerminal(input, current ?? claim.job);
    }
    return failure;
  }
}

function resolveClaimedJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableJobInputV1 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobV1(job);
  } catch {
    throw new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_JOB_CONTRACT_INVALID',
      false,
    );
  }
}

function assertOwnerBindings(
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV1>[0],
  job: MediaProxyMasterTranscodeDurableJobInputV1,
): void {
  const runtime = job.runtimePolicy;
  const heartbeatIntervalMs = input.heartbeatOwner.heartbeatIntervalMs;
  if (input.budgetOwner.ownerId !== runtime.executionBudgetPolicy.ownerId
    || input.budgetOwner.ownerVersion !== runtime.executionBudgetPolicy.ownerVersion
    || input.budgetOwner.policySha256 !== runtime.executionBudgetPolicy.policySha256
    || input.retryOwner.ownerId !== runtime.retryPolicy.ownerId
    || input.retryOwner.ownerVersion !== runtime.retryPolicy.ownerVersion
    || input.retryOwner.policySha256 !== runtime.retryPolicy.policySha256
    || input.heartbeatOwner.ownerId !== runtime.heartbeatPolicy.ownerId
    || input.heartbeatOwner.ownerVersion !== runtime.heartbeatPolicy.ownerVersion
    || input.heartbeatOwner.policySha256 !== runtime.heartbeatPolicy.policySha256
    || !Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1
    || heartbeatIntervalMs > MAX_HEARTBEAT_INTERVAL_MS
    || input.currentAssetOwner.ownerId !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1
    || input.currentAssetOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1
    || input.currentAssetOwner.runtimePolicyBindingSha256 !== runtime.bindingSha256
    || input.transcodeOwner.ownerId
      !== MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1
    || input.transcodeOwner.ownerVersion !== job.command.policy.policyVersion
    || input.transcodeOwner.runtimePolicyBindingSha256 !== runtime.bindingSha256
    || input.transcodeOwner.publicationPolicySha256
      !== job.publicationPolicy.policySha256) {
    throw new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_OWNER_BINDING_MISMATCH',
      false,
    );
  }
}

async function authorizeBudget(
  owner: Readonly<MediaProxyMasterTranscodeBudgetOwnerV1>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
): Promise<string> {
  const result = object(
    await owner.authorize({ job, jobInput }),
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_RESULT_INVALID',
  );
  if (result.disposition === 'BLOCKED') {
    exactKeys(result, [
      'disposition', 'errorCode', 'proofSha256', 'retryable',
    ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_RESULT_FIELDS_INVALID');
    if (typeof result.retryable !== 'boolean') {
      throw new WorkerFailureV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_RESULT_INVALID',
        false,
      );
    }
    sha256(result.proofSha256, 'BUDGET_BLOCK_PROOF');
    throw new WorkerFailureV1(
      identity(result.errorCode, 'BUDGET_ERROR_CODE'),
      result.retryable,
    );
  }
  if (result.disposition !== 'AUTHORIZED') {
    throw new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_RESULT_INVALID',
      false,
    );
  }
  exactKeys(result, [
    'authorizationReceiptSha256', 'disposition', 'reservationBindingSha256',
    'reservationId',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_RESULT_FIELDS_INVALID');
  if (result.reservationId !== jobInput.budgetReservation.reservationId
    || result.reservationBindingSha256
      !== jobInput.budgetReservation.bindingSha256) {
    throw new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_BUDGET_BINDING_MISMATCH',
      false,
    );
  }
  return sha256(result.authorizationReceiptSha256, 'BUDGET_AUTHORIZATION_RECEIPT');
}

function readResumeResult(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
): MediaProxyMasterTranscodeDurableResultV1 | null {
  try {
    return readMediaProxyMasterTranscodeDurableResumeResultV1(job, jobInput);
  } catch {
    throw new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESUME_INVALID',
      false,
    );
  }
}

function normalizeExecutionOutcome(
  value: MediaProxyMasterTrustedTranscodeExecutionResultV1,
): MediaProxyMasterTrustedTranscodeExecutionResultV1 {
  const outcome = object(
    value,
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTOR_RESULT_INVALID',
  );
  if (outcome.disposition === 'COMPLETED') {
    exactKeys(outcome, ['disposition', 'receipt'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTOR_RESULT_FIELDS_INVALID');
    return value;
  }
  if (outcome.disposition === 'UNVERIFIABLE') {
    exactKeys(outcome, ['diagnostic', 'disposition'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTOR_RESULT_FIELDS_INVALID');
    identity(outcome.diagnostic, 'EXECUTOR_DIAGNOSTIC');
    return value;
  }
  throw new WorkerFailureV1(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTOR_RESULT_INVALID',
    false,
  );
}

async function executeWithHeartbeats<T>(input: Readonly<{
  execute(abortSignal: AbortSignal): Promise<T>;
  heartbeat(): Promise<void>;
  heartbeatIntervalMs: number;
}>): Promise<T> {
  const controller = new AbortController();
  let heartbeatFailure: unknown = null;
  let heartbeatInFlight: Promise<void> | null = null;
  const tick = () => {
    if (heartbeatInFlight || heartbeatFailure) return;
    heartbeatInFlight = input.heartbeat()
      .catch((error) => {
        heartbeatFailure = error;
        controller.abort();
      })
      .finally(() => {
        heartbeatInFlight = null;
      });
  };
  const timer = setInterval(tick, input.heartbeatIntervalMs);
  timer.unref?.();
  try {
    let result: T;
    try {
      result = await input.execute(controller.signal);
    } catch (error) {
      if (heartbeatInFlight) await heartbeatInFlight;
      if (heartbeatFailure) throw heartbeatFailure;
      throw new WorkerFailureV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTOR_FAILED',
        true,
      );
    }
    if (heartbeatInFlight) await heartbeatInFlight;
    if (heartbeatFailure) throw heartbeatFailure;
    await input.heartbeat();
    return result;
  } finally {
    clearInterval(timer);
    controller.abort();
  }
}

type NormalizedRetryDecisionV1 = Readonly<
  | {
      disposition: 'RETRY_AT';
      retryAt: Date;
      diagnosticCode: string;
      policySha256: string;
      decisionSha256: string;
    }
  | {
      disposition: 'STOP_UNVERIFIABLE';
      reason: string;
      diagnosticCode: string;
      policySha256: string;
      decisionSha256: string;
    }
>;

async function decideRetry(
  owner: Readonly<MediaProxyMasterTranscodeRetryOwnerV1>,
  input: MediaProxyMasterTranscodeRetryDecisionInputV1,
): Promise<NormalizedRetryDecisionV1> {
  const raw = object(
    await owner.decide(input),
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_INVALID',
  );
  const now = validDate(input.now, 'RETRY_DECISION_NOW');
  const diagnosticCode = identity(input.diagnosticCode, 'RETRY_DIAGNOSTIC');
  const common = {
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V1,
    jobId: input.job.jobId,
    attemptCount: input.job.attemptCount,
    diagnosticCode,
    retryableHint: input.retryableHint,
    policySha256: owner.policySha256,
    decidedAt: now.toISOString(),
  };
  if (raw.disposition === 'RETRY_AT') {
    exactKeys(raw, ['disposition', 'retryAt'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_FIELDS_INVALID');
    if (input.retryableHint === false) {
      throw new WorkerFailureV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_INVALID',
        false,
      );
    }
    const retryAt = validDate(raw.retryAt, 'RETRY_AT');
    if (retryAt <= now || retryAt >= new Date(input.job.expiresAt)) {
      throw new WorkerFailureV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_INVALID',
        false,
      );
    }
    const material = {
      ...common,
      disposition: 'RETRY_AT' as const,
      retryAt: retryAt.toISOString(),
    };
    return Object.freeze({
      disposition: 'RETRY_AT',
      retryAt,
      diagnosticCode,
      policySha256: owner.policySha256,
      decisionSha256: hashDurableWorkflowJobJsonV1(material),
    });
  }
  if (raw.disposition === 'STOP_UNVERIFIABLE') {
    exactKeys(raw, ['disposition', 'reason'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_FIELDS_INVALID');
    const reason = identity(raw.reason, 'STOP_REASON');
    const material = {
      ...common,
      disposition: 'STOP_UNVERIFIABLE' as const,
      reason,
    };
    return Object.freeze({
      disposition: 'STOP_UNVERIFIABLE',
      reason,
      diagnosticCode,
      policySha256: owner.policySha256,
      decisionSha256: hashDurableWorkflowJobJsonV1(material),
    });
  }
  throw new WorkerFailureV1(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_INVALID',
    false,
  );
}

async function transitionRetry(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'retryOrDeadLetter'>;
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  leaseToken: string;
  errorCode: string;
  retryAt: Date;
  decision: NormalizedRetryDecisionV1;
  now: Date;
}>): Promise<Extract<MediaProxyMasterTranscodeDurableWorkerResultV1,
  { kind: 'retry_wait' | 'dead_letter' }>> {
  const status = await input.jobStore.retryOrDeadLetter({
    jobId: input.job.jobId,
    leaseToken: input.leaseToken,
    error: {
      code: input.errorCode,
      message: input.errorCode,
      retryable: true,
      occurredAt: input.now,
    },
    retryAt: input.retryAt,
    retryCursor: {
      resumeSequence: input.job.resumeState?.sequence ?? 0,
      resumeStateSha256: input.job.resumeState?.stateSha256 ?? null,
      retryPolicySha256: input.decision.policySha256,
      retryDecisionSha256: input.decision.decisionSha256,
      retryDisposition: input.decision.disposition,
    },
    now: input.now,
  });
  return Object.freeze({
    kind: status,
    jobId: input.job.jobId,
    errorCode: input.errorCode,
  });
}

async function settleFailure(input: Readonly<{
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
  ownerBindingsVerified: boolean;
  authorizationReceiptSha256: string | null;
}>): Promise<Extract<MediaProxyMasterTranscodeDurableWorkerResultV1,
  { kind: 'retry_wait' | 'dead_letter' }>> {
  let failure = toWorkerFailure(input.error);
  if (!(input.error instanceof WorkerFailureV1) && input.current?.resumeState) {
    failure = new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_POST_RESUME_TRANSITION_FAILED',
      true,
    );
  }
  if (failure.retryable && !input.ownerBindingsVerified) {
    failure = new WorkerFailureV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_OWNER_BINDING_NOT_VERIFIED',
      false,
    );
  }
  const now = input.clock();
  let retryable = failure.retryable;
  let retryAt = new Date(now.getTime() + 1);
  let decision: NormalizedRetryDecisionV1 | null = null;
  if (retryable) {
    try {
      decision = await decideRetry(input.input.retryOwner, {
        job: input.current ?? input.claim.job,
        diagnosticCode: failure.code,
        retryableHint: true,
        now,
      });
      if (decision.disposition === 'RETRY_AT') {
        retryAt = decision.retryAt;
      } else {
        retryable = false;
      }
    } catch {
      retryable = false;
      failure = new WorkerFailureV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RETRY_DECISION_INVALID',
        false,
      );
    }
  }
  const status = await input.input.jobStore.retryOrDeadLetter({
    jobId: input.claim.job.jobId,
    leaseToken: input.claim.leaseToken,
    error: {
      code: failure.code,
      message: failure.code,
      retryable,
      occurredAt: now,
    },
    retryAt,
    retryCursor: {
      resumeSequence: input.current?.resumeState?.sequence ?? 0,
      resumeStateSha256: input.current?.resumeState?.stateSha256 ?? null,
      retryPolicySha256: input.input.retryOwner.policySha256,
      retryDecisionSha256: decision?.decisionSha256 ?? null,
      retryDisposition: decision?.disposition ?? 'NOT_RETRYABLE',
      authorizationReceiptSha256: input.authorizationReceiptSha256,
    },
    now,
  });
  return Object.freeze({
    kind: status,
    jobId: input.claim.job.jobId,
    errorCode: failure.code,
  });
}

function toWorkerFailure(error: unknown): WorkerFailureV1 {
  if (error instanceof WorkerFailureV1) return error;
  return new WorkerFailureV1(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_EXECUTION_FAILED',
    false,
  );
}

function unverifiableReceipt(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  authorizationReceiptSha256: string;
  diagnosticCode: string;
  decision: Extract<NormalizedRetryDecisionV1,
    { disposition: 'STOP_UNVERIFIABLE' }>;
  transcodeOwner: Readonly<MediaProxyMasterTranscodeExecutionOwnerV1>;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const diagnosticMaterial = {
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V1,
    jobId: input.job.jobId,
    operationId: input.job.operationId,
    jobInputBindingSha256: input.job.input.bindingSha256,
    commandSha256: input.jobInput.command.commandSha256,
    publicationPolicySha256: input.jobInput.publicationPolicy.policySha256,
    transcodeOwnerId: input.transcodeOwner.ownerId,
    transcodeOwnerVersion: input.transcodeOwner.ownerVersion,
    diagnosticCode: input.diagnosticCode,
    retryDecisionSha256: input.decision.decisionSha256,
  };
  const diagnosticProofSha256 = hashDurableWorkflowJobJsonV1(diagnosticMaterial);
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization', input.authorizationReceiptSha256, 'PASS'),
    proof('private-publication-policy',
      input.jobInput.publicationPolicy.policySha256, 'PASS'),
    proof('trusted-proxy-transcode-execution',
      diagnosticProofSha256, 'UNVERIFIABLE'),
    proof('retry-policy-decision', input.decision.decisionSha256, 'PASS'),
  ]);
  const completedAt = validDate(input.completedAt, 'UNVERIFIABLE_COMPLETED_AT');
  const material = {
    ...diagnosticMaterial,
    disposition: 'UNVERIFIABLE' as const,
    diagnosticProofSha256,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'UNVERIFIABLE',
    receiptId: `mpmtrans_unverified_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  });
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAtValue: Date,
): DurableWorkflowJobTerminalReceiptV1 {
  const completedAt = validDate(completedAtValue, 'CANCELLED_AT');
  const material = {
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V1,
    jobId: job.jobId,
    disposition: 'CANCELLED' as const,
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'CANCELLED',
    receiptId: `mpmtrans_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: [],
    completedAt,
  });
}

async function settleCommittedTerminal(
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV1>[0],
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<void> {
  const terminal = await input.jobStore.getAuthorized({
    jobId: job.jobId,
    tenantId: job.tenantId,
    userId: job.userId,
  });
  if (!terminal || !isTerminal(terminal.status)) {
    throw new Error(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_SETTLEMENT_STATE_INVALID',
    );
  }
  await input.budgetOwner.settleTerminal(terminal);
}

function proof(
  proofId: string,
  proofSha256: string,
  disposition: 'PASS' | 'UNVERIFIABLE',
) {
  return Object.freeze({
    proofId: identity(proofId, 'PROOF_ID'),
    proofSha256: sha256(proofSha256, 'PROOF'),
    disposition,
  });
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkerFailureV1(code, false);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    throw new WorkerFailureV1(code, false);
  }
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    throw new Error(`MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_${label}_INVALID`);
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new WorkerFailureV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_${label}_SHA256_INVALID`,
      false,
    );
  }
  return value;
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new WorkerFailureV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_${label}_INVALID`,
      false,
    );
  }
  return new Date(value);
}
