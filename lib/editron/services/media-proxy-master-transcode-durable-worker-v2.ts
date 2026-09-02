import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobConflictErrorV1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
  MediaProxyMasterTranscodeDurableAttemptErrorV2,
  type MediaProxyMasterTranscodeDurableAttemptResultV2,
} from './media-proxy-master-transcode-durable-attempt-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  readMediaProxyMasterTranscodeDurableResumeStateV2,
} from './media-proxy-master-transcode-durable-result-v2';
import type {
  MediaProxyMasterTranscodeHeartbeatOwnerV1,
  MediaProxyMasterTranscodeRetryDecisionInputV1,
  MediaProxyMasterTranscodeRetryOwnerV1,
} from './media-proxy-master-transcode-durable-worker-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2 =
  'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT' as const;

const MAX_HEARTBEAT_INTERVAL_MS = Math.floor(
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3,
);
const MAX_ATTEMPT_STEPS_PER_CLAIM_V2 = 3;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type WorkerStoreV2 = Pick<DurableWorkflowJobStoreV1,
  'claim' | 'heartbeat' | 'saveResumeState' | 'complete'
  | 'retryOrDeadLetter' | 'markCancelled' | 'getAuthorized'>;

export type MediaProxyMasterTranscodeBudgetAuthorizationV2 = Readonly<
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

export interface MediaProxyMasterTranscodeBudgetOwnerV2 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  authorize(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  }>): Promise<MediaProxyMasterTranscodeBudgetAuthorizationV2>;
  /** Must reconcile idempotently; terminal redelivery calls this again. */
  settleTerminal(job: Readonly<DurableWorkflowJobSnapshotV1>): Promise<unknown>;
}

export interface MediaProxyMasterTranscodeAttemptOwnerV2 {
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2;
  ownerVersion: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
  preparedArtifactPolicySha256: string;
  run(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    budgetAuthorizationReceiptSha256: string;
    abortSignal: AbortSignal;
    clock: () => Date;
  }>): Promise<MediaProxyMasterTranscodeDurableAttemptResultV2>;
}

export type MediaProxyMasterTranscodeDurableWorkerResultV2 = Readonly<
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

export class MediaProxyMasterTranscodeDurableWorkerPortErrorV2 extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(identity(code, 'PORT_ERROR_CODE'));
    this.name = 'MediaProxyMasterTranscodeDurableWorkerPortErrorV2';
  }
}

class WorkerFailureV2 extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(identity(code, 'ERROR_CODE'));
    this.name = 'MediaProxyMasterTranscodeDurableWorkerFailureV2';
  }
}

class CancellationRequestedV2 extends Error {}

export async function runMediaProxyMasterTranscodeDurableWorkerV2(
  input: Readonly<{
    jobStore: WorkerStoreV2;
    jobId: string;
    workerId: string;
    budgetOwner: Readonly<MediaProxyMasterTranscodeBudgetOwnerV2>;
    retryOwner: Readonly<MediaProxyMasterTranscodeRetryOwnerV1>;
    heartbeatOwner: Readonly<MediaProxyMasterTranscodeHeartbeatOwnerV1>;
    attemptOwner: Readonly<MediaProxyMasterTranscodeAttemptOwnerV2>;
    clock?: () => Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableWorkerResultV2> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: now(clock),
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
      receipt: cancellationReceipt(claim.job, now(clock)),
      now: now(clock),
    });
    await settleCommittedTerminal(input, claim.job);
    return Object.freeze({ kind: 'cancelled', jobId: claim.job.jobId });
  }

  let cancellationRequested = false;
  let ownerBindingsVerified = false;
  let terminalSettlementStarted = false;
  let resumeCommitMayHaveSucceeded = false;
  let authorizationReceiptSha256: string | null = null;
  let currentJob = claim.job;
  const heartbeat = async (): Promise<void> => {
    let state: 'ACTIVE' | 'CANCEL_REQUESTED';
    try {
      state = await input.jobStore.heartbeat({
        jobId: claim.job.jobId,
        leaseToken: claim.leaseToken,
        now: now(clock),
      });
    } catch (error) {
      if (error instanceof DurableWorkflowJobLeaseLostErrorV1) throw error;
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_HEARTBEAT_FAILED',
        true,
      );
    }
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequestedV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_CANCEL_REQUESTED',
      );
    }
  };

  try {
    await heartbeat();
    const jobInput = resolveClaimedJob(currentJob);
    assertOwnerBindings(input, jobInput);
    ownerBindingsVerified = true;
    authorizationReceiptSha256 = await authorizeBudget(
      input.budgetOwner,
      currentJob,
      jobInput,
    );
    assertResumeAuthorization(currentJob, authorizationReceiptSha256);
    await heartbeat();

    for (let step = 0; step < MAX_ATTEMPT_STEPS_PER_CLAIM_V2; step += 1) {
      const outcome = normalizeAttemptOutcome(
        await executeWithHeartbeats({
          execute: (abortSignal) => input.attemptOwner.run({
            job: currentJob,
            budgetAuthorizationReceiptSha256: authorizationReceiptSha256!,
            abortSignal,
            clock: () => now(clock),
          }),
          heartbeat,
          heartbeatIntervalMs: input.heartbeatOwner.heartbeatIntervalMs,
        }),
        currentJob,
      );

      if (outcome.kind === 'persist_resume') {
        const expectedSequence = currentJob.resumeState?.sequence ?? 0;
        assertResumeProposal(outcome, expectedSequence);
        await heartbeat();
        resumeCommitMayHaveSucceeded = true;
        try {
          await input.jobStore.saveResumeState({
            jobId: currentJob.jobId,
            leaseToken: claim.leaseToken,
            expectedSequence,
            state: outcome.resumeState,
            now: now(clock),
          });
        } catch (error) {
          if (error instanceof DurableWorkflowJobLeaseLostErrorV1) throw error;
          if (error instanceof DurableWorkflowJobConflictErrorV1) {
            resumeCommitMayHaveSucceeded = false;
            throw new WorkerFailureV2(
              'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_CONFLICT',
              false,
            );
          }
          throw new WorkerFailureV2(
            'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_COMMIT_FAILED',
            true,
          );
        }
        currentJob = await reloadCommittedResume({
          jobStore: input.jobStore,
          previous: currentJob,
          proposal: outcome.resumeState,
          expectedSequence,
        });
        resumeCommitMayHaveSucceeded = false;
        assertResumeAuthorization(currentJob, authorizationReceiptSha256);
        continue;
      }

      if (outcome.kind === 'unverifiable') {
        if (currentJob.resumeState !== null) {
          throw new WorkerFailureV2(
            'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_UNVERIFIABLE_STAGE_INVALID',
            false,
          );
        }
        const decision = await decideRetry(input.retryOwner, {
          job: currentJob,
          diagnosticCode: outcome.diagnostic,
          retryableHint: null,
          now: now(clock),
        });
        if (decision.disposition === 'RETRY_AT') {
          const retry = await transitionRetry({
            jobStore: input.jobStore,
            job: currentJob,
            leaseToken: claim.leaseToken,
            errorCode: outcome.diagnostic,
            retryAt: decision.retryAt,
            decision,
            now: now(clock),
          });
          if (retry.kind === 'dead_letter') {
            await settleCommittedTerminal(input, currentJob);
          }
          return retry;
        }
        await heartbeat();
        const terminal = unverifiableReceipt({
          job: currentJob,
          jobInput,
          authorizationReceiptSha256,
          diagnosticCode: outcome.diagnostic,
          decision,
          attemptOwner: input.attemptOwner,
          completedAt: now(clock),
        });
        await completeJob(input.jobStore, {
          jobId: currentJob.jobId,
          leaseToken: claim.leaseToken,
          receipt: terminal,
          now: now(clock),
        });
        terminalSettlementStarted = true;
        await settleCommittedTerminal(input, currentJob);
        return Object.freeze({
          kind: 'completed',
          jobId: currentJob.jobId,
          disposition: 'UNVERIFIABLE',
          receiptSha256: terminal.receiptSha256,
        });
      }

      assertPassReady(currentJob);
      await heartbeat();
      await completeJob(input.jobStore, {
        jobId: currentJob.jobId,
        leaseToken: claim.leaseToken,
        receipt: outcome.receipt,
        now: now(clock),
      });
      terminalSettlementStarted = true;
      await settleCommittedTerminal(input, currentJob);
      return Object.freeze({
        kind: 'completed',
        jobId: currentJob.jobId,
        disposition: 'PASS',
        receiptSha256: outcome.receipt.receiptSha256,
      });
    }
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_STEP_LIMIT',
      false,
    );
  } catch (error) {
    if (terminalSettlementStarted) throw error;
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return Object.freeze({ kind: 'lease_lost', reason: error.message });
    }
    let current: Readonly<DurableWorkflowJobSnapshotV1> | null = null;
    try {
      current = await input.jobStore.getAuthorized({
        jobId: claim.job.jobId,
        tenantId: claim.job.tenantId,
        userId: claim.job.userId,
      });
    } catch { /* The retry transition still owns the active-lease decision. */ }
    if (current && isTerminal(current.status)) {
      if (ownerBindingsVerified) await input.budgetOwner.settleTerminal(current);
      return Object.freeze({ kind: 'skipped', reason: 'terminal' });
    }
    if (cancellationRequested || error instanceof CancellationRequestedV2
      || current?.cancelRequestedAt) {
      try {
        await input.jobStore.markCancelled({
          jobId: claim.job.jobId,
          leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(current ?? currentJob, now(clock)),
          now: now(clock),
        });
        if (ownerBindingsVerified) {
          await settleCommittedTerminal(input, current ?? currentJob);
        }
        return Object.freeze({ kind: 'cancelled', jobId: claim.job.jobId });
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return Object.freeze({ kind: 'lease_lost', reason: cancelError.message });
        }
        throw cancelError;
      }
    }
    let failure: Extract<MediaProxyMasterTranscodeDurableWorkerResultV2,
      { kind: 'retry_wait' | 'dead_letter' }>;
    try {
      failure = await settleFailure({
        input,
        claim,
        current: current ?? currentJob,
        error,
        clock,
        ownerBindingsVerified,
        authorizationReceiptSha256,
        resumeCommitMayHaveSucceeded,
      });
    } catch (transitionError) {
      if (transitionError instanceof DurableWorkflowJobLeaseLostErrorV1) {
        return Object.freeze({
          kind: 'lease_lost',
          reason: transitionError.message,
        });
      }
      throw transitionError;
    }
    if (failure.kind === 'dead_letter' && ownerBindingsVerified) {
      await settleCommittedTerminal(input, current ?? currentJob);
    }
    return failure;
  }
}

function resolveClaimedJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableJobInputV2 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobV2(job);
  } catch {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_JOB_CONTRACT_INVALID',
      false,
    );
  }
}

function assertOwnerBindings(
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV2>[0],
  job: MediaProxyMasterTranscodeDurableJobInputV2,
): void {
  const runtime = job.runtimePolicy;
  const interval = input.heartbeatOwner.heartbeatIntervalMs;
  if (input.budgetOwner.ownerId !== runtime.executionBudgetPolicy.ownerId
    || input.budgetOwner.ownerVersion
      !== runtime.executionBudgetPolicy.ownerVersion
    || input.budgetOwner.policySha256
      !== runtime.executionBudgetPolicy.policySha256
    || input.retryOwner.ownerId !== runtime.retryPolicy.ownerId
    || input.retryOwner.ownerVersion !== runtime.retryPolicy.ownerVersion
    || input.retryOwner.policySha256 !== runtime.retryPolicy.policySha256
    || input.heartbeatOwner.ownerId !== runtime.heartbeatPolicy.ownerId
    || input.heartbeatOwner.ownerVersion !== runtime.heartbeatPolicy.ownerVersion
    || input.heartbeatOwner.policySha256
      !== runtime.heartbeatPolicy.policySha256
    || !Number.isSafeInteger(interval) || interval < 1
    || interval > MAX_HEARTBEAT_INTERVAL_MS
    || input.attemptOwner.ownerId
      !== MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2
    || input.attemptOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2
    || input.attemptOwner.runtimePolicyBindingSha256 !== runtime.bindingSha256
    || input.attemptOwner.publicationPolicySha256
      !== job.publicationPolicy.policySha256
    || input.attemptOwner.preparedArtifactPolicySha256
      !== job.preparedArtifactPolicy.policySha256) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_OWNER_BINDING_MISMATCH',
      false,
    );
  }
}

async function authorizeBudget(
  owner: Readonly<MediaProxyMasterTranscodeBudgetOwnerV2>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): Promise<string> {
  let value: unknown;
  try {
    value = await owner.authorize({ job, jobInput });
  } catch (error) {
    if (error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV2) {
      throw new WorkerFailureV2(error.code, error.retryable);
    }
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_OWNER_FAILED',
      true,
    );
  }
  const result = object(
    value,
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_RESULT_INVALID',
  );
  if (result.disposition === 'BLOCKED') {
    exactKeys(result, [
      'disposition', 'errorCode', 'proofSha256', 'retryable',
    ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_FIELDS_INVALID');
    if (typeof result.retryable !== 'boolean') {
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_RESULT_INVALID',
        false,
      );
    }
    sha256(result.proofSha256, 'BUDGET_BLOCK_PROOF');
    throw new WorkerFailureV2(
      identity(result.errorCode, 'BUDGET_ERROR_CODE'),
      result.retryable,
    );
  }
  if (result.disposition !== 'AUTHORIZED') {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_RESULT_INVALID',
      false,
    );
  }
  exactKeys(result, [
    'authorizationReceiptSha256', 'disposition', 'reservationBindingSha256',
    'reservationId',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_FIELDS_INVALID');
  if (result.reservationId !== jobInput.budgetReservation.reservationId
    || result.reservationBindingSha256
      !== jobInput.budgetReservation.bindingSha256) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_BINDING_MISMATCH',
      false,
    );
  }
  return sha256(
    result.authorizationReceiptSha256,
    'BUDGET_AUTHORIZATION_RECEIPT',
  );
}

function assertResumeAuthorization(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  authorizationReceiptSha256: string,
): void {
  let state: ReturnType<
    typeof readMediaProxyMasterTranscodeDurableResumeStateV2
  >;
  try {
    state = readMediaProxyMasterTranscodeDurableResumeStateV2(job);
  } catch {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_INVALID',
      false,
    );
  }
  if (!state) return;
  const bound = state.disposition === 'DURABLE_PREPARED_ARTIFACT_PERSISTED'
    ? state.budgetAuthorizationReceiptSha256
    : state.preparedState.budgetAuthorizationReceiptSha256;
  if (bound !== authorizationReceiptSha256) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_REAUTHORIZATION_MISMATCH',
      false,
    );
  }
}

function normalizeAttemptOutcome(
  value: unknown,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableAttemptResultV2 {
  const outcome = object(
    value,
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_RESULT_INVALID',
  );
  if (outcome.kind === 'persist_resume') {
    exactKeys(outcome, [
      'disposition', 'expectedSequence', 'kind', 'resumeState',
    ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_FIELDS_INVALID');
    const resume = object(
      outcome.resumeState,
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_PROPOSAL_INVALID',
    );
    exactKeys(resume, ['payload', 'schemaId', 'stateSha256'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_PROPOSAL_FIELDS_INVALID');
    identity(resume.schemaId, 'RESUME_SCHEMA');
    if (sha256(resume.stateSha256, 'RESUME_STATE')
      !== hashDurableWorkflowJobJsonV1(resume.payload)) {
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_PROPOSAL_HASH_MISMATCH',
        false,
      );
    }
    return value as MediaProxyMasterTranscodeDurableAttemptResultV2;
  }
  if (outcome.kind === 'unverifiable') {
    exactKeys(outcome, ['diagnostic', 'kind'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_FIELDS_INVALID');
    identity(outcome.diagnostic, 'ATTEMPT_DIAGNOSTIC');
    return value as MediaProxyMasterTranscodeDurableAttemptResultV2;
  }
  if (outcome.kind === 'complete') {
    exactKeys(outcome, ['kind', 'receipt'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_FIELDS_INVALID');
    assertPassReceipt(outcome.receipt, job);
    return value as MediaProxyMasterTranscodeDurableAttemptResultV2;
  }
  throw new WorkerFailureV2(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_RESULT_INVALID',
    false,
  );
}

function assertResumeProposal(
  outcome: Extract<MediaProxyMasterTranscodeDurableAttemptResultV2,
    { kind: 'persist_resume' }>,
  expectedSequence: number,
): void {
  const expectedDisposition = expectedSequence === 0
    ? 'PREPARED_ARTIFACT'
    : expectedSequence === 1 ? 'TRUSTED_RESULT' : null;
  if (outcome.expectedSequence !== expectedSequence
    || outcome.disposition !== expectedDisposition) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RESUME_SEQUENCE_INVALID',
      false,
    );
  }
}

async function reloadCommittedResume(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'getAuthorized'>;
  previous: Readonly<DurableWorkflowJobSnapshotV1>;
  proposal: Extract<MediaProxyMasterTranscodeDurableAttemptResultV2,
    { kind: 'persist_resume' }>['resumeState'];
  expectedSequence: number;
}>): Promise<Readonly<DurableWorkflowJobSnapshotV1>> {
  let committed: Readonly<DurableWorkflowJobSnapshotV1> | null;
  try {
    committed = await input.jobStore.getAuthorized({
      jobId: input.previous.jobId,
      tenantId: input.previous.tenantId,
      userId: input.previous.userId,
    });
  } catch {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_RELOAD_FAILED',
      true,
    );
  }
  const resume = committed?.resumeState;
  if (!committed || committed.status !== 'running'
    || committed.attemptCount !== input.previous.attemptCount
    || !resume || resume.sequence !== input.expectedSequence + 1
    || resume.schemaId !== input.proposal.schemaId
    || resume.stateSha256 !== input.proposal.stateSha256
    || hashDurableWorkflowJobJsonV1(resume.payload)
      !== hashDurableWorkflowJobJsonV1(input.proposal.payload)
    || resume.committedAt !== committed.updatedAt) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_STATE_INVALID',
      false,
    );
  }
  resolveClaimedJob(committed);
  try {
    readMediaProxyMasterTranscodeDurableResumeStateV2(committed);
  } catch {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_STATE_INVALID',
      false,
    );
  }
  return committed;
}

function assertPassReady(job: Readonly<DurableWorkflowJobSnapshotV1>): void {
  let state: ReturnType<
    typeof readMediaProxyMasterTranscodeDurableResumeStateV2
  >;
  try {
    state = readMediaProxyMasterTranscodeDurableResumeStateV2(job);
  } catch {
    state = null;
  }
  if (!state || state.disposition
      !== 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION'
    || job.resumeState?.sequence !== 2) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_PASS_RESULT_NOT_PERSISTED',
      false,
    );
  }
}

function assertPassReceipt(
  value: unknown,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): void {
  const receipt = object(
    value,
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_RECEIPT_INVALID',
  );
  exactKeys(receipt, [
    'completedAt', 'disposition', 'proofReferences', 'receiptId',
    'receiptSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_FIELDS_INVALID');
  const completedAt = validDate(receipt.completedAt, 'TERMINAL_COMPLETED_AT');
  if (receipt.disposition !== 'PASS'
    || completedAt.getTime() < Date.parse(job.resumeState?.committedAt ?? '')
    || completedAt.getTime() >= Date.parse(job.expiresAt)
    || !Array.isArray(receipt.proofReferences)) {
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_RECEIPT_INVALID',
      false,
    );
  }
  identity(receipt.receiptId, 'TERMINAL_RECEIPT_ID');
  sha256(receipt.receiptSha256, 'TERMINAL_RECEIPT');
  for (const proofValue of receipt.proofReferences) {
    const proof = object(
      proofValue,
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_PROOF_INVALID',
    );
    exactKeys(proof, ['disposition', 'proofId', 'proofSha256'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_PROOF_FIELDS_INVALID');
    if (proof.disposition !== 'PASS') {
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_TERMINAL_PROOF_INVALID',
        false,
      );
    }
    identity(proof.proofId, 'TERMINAL_PROOF_ID');
    sha256(proof.proofSha256, 'TERMINAL_PROOF');
  }
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
      if (error instanceof MediaProxyMasterTranscodeDurableAttemptErrorV2) {
        throw new WorkerFailureV2(
          `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_${error.code}`,
          error.retryable,
        );
      }
      if (error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV2) {
        throw new WorkerFailureV2(error.code, error.retryable);
      }
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_OWNER_FAILED',
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

type NormalizedRetryDecisionV2 = Readonly<
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
): Promise<NormalizedRetryDecisionV2> {
  const raw = object(
    await owner.decide(input),
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_DECISION_INVALID',
  );
  const decidedAt = validDate(input.now, 'RETRY_DECISION_NOW');
  const diagnosticCode = identity(input.diagnosticCode, 'RETRY_DIAGNOSTIC');
  const common = {
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V2,
    jobId: input.job.jobId,
    attemptCount: input.job.attemptCount,
    diagnosticCode,
    retryableHint: input.retryableHint,
    policySha256: owner.policySha256,
    decidedAt: decidedAt.toISOString(),
  };
  if (raw.disposition === 'RETRY_AT') {
    exactKeys(raw, ['disposition', 'retryAt'],
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_FIELDS_INVALID');
    if (input.retryableHint === false) {
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_DECISION_INVALID',
        false,
      );
    }
    const retryAt = validDate(raw.retryAt, 'RETRY_AT');
    if (retryAt <= decidedAt || retryAt >= new Date(input.job.expiresAt)) {
      throw new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_DECISION_INVALID',
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
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_FIELDS_INVALID');
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
  throw new WorkerFailureV2(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_DECISION_INVALID',
    false,
  );
}

async function transitionRetry(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'retryOrDeadLetter'>;
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  leaseToken: string;
  errorCode: string;
  retryAt: Date;
  decision: NormalizedRetryDecisionV2;
  now: Date;
}>): Promise<Extract<MediaProxyMasterTranscodeDurableWorkerResultV2,
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
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV2>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1>;
  error: unknown;
  clock: () => Date;
  ownerBindingsVerified: boolean;
  authorizationReceiptSha256: string | null;
  resumeCommitMayHaveSucceeded: boolean;
}>): Promise<Extract<MediaProxyMasterTranscodeDurableWorkerResultV2,
  { kind: 'retry_wait' | 'dead_letter' }>> {
  let failure = toWorkerFailure(input.error);
  if (input.resumeCommitMayHaveSucceeded
    && !(input.error instanceof WorkerFailureV2)) {
    failure = new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_TRANSITION_FAILED',
      true,
    );
  }
  if (failure.retryable && !input.ownerBindingsVerified) {
    failure = new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_OWNER_BINDING_NOT_VERIFIED',
      false,
    );
  }
  const occurredAt = now(input.clock);
  let retryable = failure.retryable;
  let retryAt = new Date(occurredAt.getTime() + 1);
  let decision: NormalizedRetryDecisionV2 | null = null;
  if (retryable) {
    try {
      decision = await decideRetry(input.input.retryOwner, {
        job: input.current,
        diagnosticCode: failure.code,
        retryableHint: true,
        now: occurredAt,
      });
      if (decision.disposition === 'RETRY_AT') {
        retryAt = decision.retryAt;
      } else {
        retryable = false;
      }
    } catch {
      retryable = false;
      failure = new WorkerFailureV2(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_RETRY_DECISION_INVALID',
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
      occurredAt,
    },
    retryAt,
    retryCursor: {
      resumeSequence: input.current.resumeState?.sequence ?? 0,
      resumeStateSha256: input.current.resumeState?.stateSha256 ?? null,
      resumeCommitMayHaveSucceeded: input.resumeCommitMayHaveSucceeded,
      retryPolicySha256: input.input.retryOwner.policySha256,
      retryDecisionSha256: decision?.decisionSha256 ?? null,
      retryDisposition: decision?.disposition ?? 'NOT_RETRYABLE',
      authorizationReceiptSha256: input.authorizationReceiptSha256,
    },
    now: occurredAt,
  });
  return Object.freeze({
    kind: status,
    jobId: input.claim.job.jobId,
    errorCode: failure.code,
  });
}

function toWorkerFailure(error: unknown): WorkerFailureV2 {
  if (error instanceof WorkerFailureV2) return error;
  if (error instanceof MediaProxyMasterTranscodeDurableAttemptErrorV2) {
    return new WorkerFailureV2(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_ATTEMPT_${error.code}`,
      error.retryable,
    );
  }
  if (error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV2) {
    return new WorkerFailureV2(error.code, error.retryable);
  }
  return new WorkerFailureV2(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_EXECUTION_FAILED',
    false,
  );
}

function unverifiableReceipt(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  authorizationReceiptSha256: string;
  diagnosticCode: string;
  decision: Extract<NormalizedRetryDecisionV2,
    { disposition: 'STOP_UNVERIFIABLE' }>;
  attemptOwner: Readonly<MediaProxyMasterTranscodeAttemptOwnerV2>;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const diagnosticMaterial = {
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V2,
    jobId: input.job.jobId,
    operationId: input.job.operationId,
    jobInputBindingSha256: input.job.input.bindingSha256,
    commandSha256: input.jobInput.command.commandSha256,
    publicationPolicySha256: input.jobInput.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      input.jobInput.preparedArtifactPolicy.policySha256,
    attemptOwnerId: input.attemptOwner.ownerId,
    attemptOwnerVersion: input.attemptOwner.ownerVersion,
    diagnosticCode: input.diagnosticCode,
    retryDecisionSha256: input.decision.decisionSha256,
  };
  const diagnosticProofSha256 = hashDurableWorkflowJobJsonV1(
    diagnosticMaterial,
  );
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization',
      input.authorizationReceiptSha256, 'PASS'),
    proof('private-publication-policy-v2',
      input.jobInput.publicationPolicy.policySha256, 'PASS'),
    proof('prepared-artifact-policy',
      input.jobInput.preparedArtifactPolicy.policySha256, 'PASS'),
    proof('durable-attempt-diagnostic',
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
    receiptId: `mpmtrans2_unverified_${receiptSha256.slice(0, 24)}`,
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
    workerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_VERSION_V2,
    jobId: job.jobId,
    disposition: 'CANCELLED' as const,
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'CANCELLED',
    receiptId: `mpmtrans2_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: [],
    completedAt,
  });
}

async function completeJob(
  store: Pick<DurableWorkflowJobStoreV1, 'complete'>,
  input: Parameters<DurableWorkflowJobStoreV1['complete']>[0],
): Promise<void> {
  try {
    await store.complete(input);
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) throw error;
    throw new WorkerFailureV2(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESULT_COMPLETION_FAILED',
      true,
    );
  }
}

async function settleCommittedTerminal(
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV2>[0],
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<void> {
  const terminal = await input.jobStore.getAuthorized({
    jobId: job.jobId,
    tenantId: job.tenantId,
    userId: job.userId,
  });
  if (!terminal || !isTerminal(terminal.status)) {
    throw new Error(
      'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_SETTLEMENT_STATE_INVALID',
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
  return status === 'completed' || status === 'cancelled'
    || status === 'dead_letter';
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkerFailureV2(code, false);
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
    throw new WorkerFailureV2(code, false);
  }
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    throw new Error(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_${label}_INVALID`,
    );
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new WorkerFailureV2(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_${label}_SHA256_INVALID`,
      false,
    );
  }
  return value;
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new WorkerFailureV2(
      `MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_${label}_INVALID`,
      false,
    );
  }
  return new Date(value);
}

function now(clock: () => Date): Date {
  return validDate(clock(), 'CLOCK');
}
