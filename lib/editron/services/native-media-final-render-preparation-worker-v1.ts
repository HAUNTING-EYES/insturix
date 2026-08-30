import {
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  assertNativeMediaFinalRenderPreparationDurableJobV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DURABLE_JOB_BINDING_MISMATCH_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
  type NativeMediaFinalRenderPreparationRuntimeContractV1,
  toNativeMediaFinalRenderPreparationJobContractInputV1,
} from './native-media-final-render-preparation-job-v1';
import {
  createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1,
  type NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  type NativeMediaFinalRenderPreparationRetryDecisionV1,
  type NativeMediaFinalRenderPreparationRetryPolicyOwnerV1,
} from './native-media-final-render-preparation-delivery-retry-policy-v1';
import {
  assertNativeMediaFinalRenderPreparationResultV1,
  createNativeMediaFinalRenderPreparationResumeStateV1,
  createNativeMediaFinalRenderPreparationTerminalReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1,
  type NativeMediaFinalRenderPreparationResultV1,
} from './native-media-final-render-preparation-result-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
} from './native-media-final-render-preparation-runtime-policy-v1';
import type { NativeMediaFinalRenderArtifactV1 }
  from './native-media-final-render-source-preparation-v1';

const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1 =
  'NATIVE_MEDIA_FINAL_RENDER_SOURCE_MATERIALIZER' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

type NativeMediaFinalRenderPreparationBudgetAuthorizationV1 = Readonly<
  | {
      disposition: 'AUTHORIZED';
      reservationId: string;
      reservationBindingSha256: string;
      authorizationReceiptSha256: string;
    }
  | { disposition: 'BLOCKED'; errorCode: string; retryable: boolean }
>;

export interface NativeMediaFinalRenderPreparationBudgetOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  authorize(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  }>): Promise<NativeMediaFinalRenderPreparationBudgetAuthorizationV1>;
  /** Must be idempotent: terminal redelivery calls this without rerunning preparation. */
  settleTerminal(job: Readonly<DurableWorkflowJobSnapshotV1>): Promise<unknown>;
}

export interface NativeMediaFinalRenderArtifactPreparationOwnerV1 {
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1;
  ownerVersion: string;
  heartbeatPolicyOwnerId:
    typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1;
  heartbeatPolicyOwnerVersion:
    typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1;
  heartbeatPolicySha256: string;
  prepare(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: NativeMediaFinalRenderPreparationJobInputV1;
    lifecycle: Readonly<{ heartbeat(): Promise<void> }>;
  }>): Promise<Readonly<
    | {
        disposition: 'PREPARED';
        publishHandle: string;
        artifact: NativeMediaFinalRenderArtifactV1;
      }
    | {
        disposition: 'UNVERIFIABLE';
        diagnosticCode: string;
        proofSha256: string;
      }
  >>;
}

type NativeMediaFinalRenderPreparationWorkerResultV1 = Readonly<
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
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(requireIdentity(code, 'ERROR_CODE'));
    this.name = 'NativeMediaFinalRenderPreparationWorkerFailureV1';
  }
}
class CancellationRequestedV1 extends Error {}

/**
 * Transport-neutral lifecycle composition only. The injected preparation owner
 * must adapt the existing exact-source materializer; it may not implement a
 * second timestamp/audio/form path inside this worker.
 */
export async function runNativeMediaFinalRenderPreparationWorkerV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1,
    'claim' | 'heartbeat' | 'saveResumeState' | 'complete' | 'retryOrDeadLetter'
    | 'markCancelled' | 'getAuthorized'>;
  jobId: string;
  workerId: string;
  runtimeContract: NativeMediaFinalRenderPreparationRuntimeContractV1;
  budgetOwner: Readonly<NativeMediaFinalRenderPreparationBudgetOwnerV1>;
  preparationOwner: Readonly<NativeMediaFinalRenderArtifactPreparationOwnerV1>;
  deliveryRetryPolicy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
  clock?: () => Date;
}>): Promise<NativeMediaFinalRenderPreparationWorkerResultV1> {
  const clock = input.clock ?? (() => new Date());
  const retryPolicyOwner =
    createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1(input.deliveryRetryPolicy);
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') {
    if ('job' in claim && isTerminal(claim.job.status)) {
      const jobInput = resolveClaimedJob(claim.job);
      assertRuntimeContract(jobInput, input.runtimeContract);
      assertOwnerBindings(input, jobInput, retryPolicyOwner);
      await settleTerminalSnapshot(input.budgetOwner, claim.job);
    }
    return { kind: 'skipped', reason: claim.reason };
  }
  if (claim.kind === 'cancel_claimed') {
    const jobInput = resolveClaimedJob(claim.job);
    assertRuntimeContract(jobInput, input.runtimeContract);
    assertOwnerBindings(input, jobInput, retryPolicyOwner);
    await input.jobStore.markCancelled({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, clock()),
      now: clock(),
    });
    await settleCommittedTerminal(input, claim.job);
    return { kind: 'cancelled', jobId: input.jobId };
  }

  let cancellationRequested = false;
  let ownerBindingsVerified = false;
  let terminalSettlementStarted = false;
  let resumeSequence = claim.job.resumeState?.sequence ?? 0;
  const heartbeat = async (): Promise<void> => {
    const state = await input.jobStore.heartbeat({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      now: clock(),
    });
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequestedV1(
        'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_CANCEL_REQUESTED',
      );
    }
  };

  try {
    await heartbeat();
    const jobInput = resolveClaimedJob(claim.job);
    assertRuntimeContract(jobInput, input.runtimeContract);
    assertOwnerBindings(input, jobInput, retryPolicyOwner);
    ownerBindingsVerified = true;
    const authorizationReceiptSha256 = await authorizeBudget(
      input.budgetOwner,
      claim.job,
      jobInput,
    );
    await heartbeat();

    let result = readResumeResult(claim.job, jobInput);
    if (!result) {
      const outcome = await input.preparationOwner.prepare({
        job: claim.job,
        jobInput,
        lifecycle: { heartbeat },
      });
      const parsed = parsePreparationOutcome(outcome, jobInput, claim.job.input.bindingSha256);
      if (parsed.disposition === 'UNVERIFIABLE') {
        await heartbeat();
        const terminal = unverifiableReceipt({
          job: claim.job,
          jobInput,
          authorizationReceiptSha256,
          preparationOwner: input.preparationOwner,
          diagnosticCode: parsed.diagnosticCode,
          proofSha256: parsed.proofSha256,
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
        return {
          kind: 'completed',
          jobId: claim.job.jobId,
          disposition: 'UNVERIFIABLE',
          receiptSha256: terminal.receiptSha256,
        };
      }
      await heartbeat();
      await input.jobStore.saveResumeState({
        jobId: claim.job.jobId,
        leaseToken: claim.leaseToken,
        expectedSequence: resumeSequence,
        state: {
          schemaId: parsed.resume.schemaId,
          stateSha256: parsed.resume.stateSha256,
          payload: parsed.resume.payload as unknown as Readonly<Record<string, unknown>>,
        },
        now: clock(),
      });
      resumeSequence += 1;
      result = parsed.resume.payload;
    }

    await heartbeat();
    const terminal = createNativeMediaFinalRenderPreparationTerminalReceiptV1({
      jobId: claim.job.jobId,
      operationId: claim.job.operationId,
      jobInput,
      jobInputBindingSha256: claim.job.input.bindingSha256,
      result,
      executionAuthorizationReceiptSha256: authorizationReceiptSha256,
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
    return {
      kind: 'completed',
      jobId: claim.job.jobId,
      disposition: 'PASS',
      receiptSha256: terminal.receiptSha256,
    };
  } catch (error) {
    if (terminalSettlementStarted) throw error;
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    const current = await input.jobStore.getAuthorized({
      jobId: claim.job.jobId,
      tenantId: claim.job.tenantId,
      userId: claim.job.userId,
    });
    if (current && isTerminal(current.status)) {
      if (ownerBindingsVerified) await settleTerminalSnapshot(input.budgetOwner, current);
      return { kind: 'skipped', reason: 'terminal' };
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
        if (ownerBindingsVerified) {
          await settleCommittedTerminal(input, current ?? claim.job);
        }
        return { kind: 'cancelled', jobId: claim.job.jobId };
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return { kind: 'lease_lost', reason: cancelError.message };
        }
        throw cancelError;
      }
    }
    const failure = await settleFailure({
      input, claim, current, error, clock, ownerBindingsVerified, retryPolicyOwner,
    });
    if (failure.kind === 'dead_letter' && ownerBindingsVerified) {
      await settleCommittedTerminal(input, current ?? claim.job);
    }
    return failure;
  }
}

function resolveClaimedJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): NativeMediaFinalRenderPreparationJobInputV1 {
  try {
    return assertNativeMediaFinalRenderPreparationDurableJobV1(job);
  } catch (error) {
    if (error instanceof Error
      && error.message === NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DURABLE_JOB_BINDING_MISMATCH_V1) {
      throw new WorkerFailureV1(
        'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_JOB_BINDING_MISMATCH',
        false,
      );
    }
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_JOB_CONTRACT_INVALID',
      false,
    );
  }
}

function assertRuntimeContract(
  job: NativeMediaFinalRenderPreparationJobInputV1,
  runtimeValue: NativeMediaFinalRenderPreparationRuntimeContractV1,
): void {
  const runtime = record(
    runtimeValue,
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RUNTIME_CONTRACT_INVALID',
  );
  exactKeys(runtime, ['executionProfile', 'policyBindings'],
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RUNTIME_CONTRACT_FIELDS_INVALID');
  let rebound: ReturnType<typeof buildNativeMediaFinalRenderPreparationJobContractV1>;
  try {
    rebound = buildNativeMediaFinalRenderPreparationJobContractV1(
      toNativeMediaFinalRenderPreparationJobContractInputV1(job, {
        policyBindings: runtimeValue.policyBindings,
        executionProfile: runtimeValue.executionProfile,
      }),
    );
  } catch {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RUNTIME_CONTRACT_INVALID',
      false,
    );
  }
  if (hashDurableWorkflowJobJsonV1(rebound.payload.policyBindings)
      !== hashDurableWorkflowJobJsonV1(job.policyBindings)
    || hashDurableWorkflowJobJsonV1(rebound.payload.executionProfile)
      !== hashDurableWorkflowJobJsonV1(job.executionProfile)) {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RUNTIME_BINDING_MISMATCH',
      false,
    );
  }
}

function assertOwnerBindings(
  input: Parameters<typeof runNativeMediaFinalRenderPreparationWorkerV1>[0],
  job: NativeMediaFinalRenderPreparationJobInputV1,
  retryPolicyOwner: Readonly<NativeMediaFinalRenderPreparationRetryPolicyOwnerV1>,
): void {
  const runtimePolicy = job.policyBindings.runtimePolicy;
  if (input.budgetOwner.ownerId !== runtimePolicy.executionBudget.ownerId
    || input.budgetOwner.ownerVersion !== runtimePolicy.executionBudget.ownerVersion
    || input.budgetOwner.policySha256 !== runtimePolicy.executionBudget.policySha256
    || retryPolicyOwner.ownerId !== runtimePolicy.retryPolicy.ownerId
    || retryPolicyOwner.ownerVersion !== runtimePolicy.retryPolicy.ownerVersion
    || retryPolicyOwner.policySha256 !== runtimePolicy.retryPolicy.policySha256
    || input.preparationOwner.ownerId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1
    || input.preparationOwner.ownerVersion !== job.policyBindings.materializerPolicyVersion
    || input.preparationOwner.heartbeatPolicyOwnerId
      !== runtimePolicy.heartbeatPolicy.ownerId
    || input.preparationOwner.heartbeatPolicyOwnerVersion
      !== runtimePolicy.heartbeatPolicy.ownerVersion
    || input.preparationOwner.heartbeatPolicySha256
      !== runtimePolicy.heartbeatPolicy.policySha256) {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_BINDING_MISMATCH',
      false,
    );
  }
}

async function authorizeBudget(
  owner: Readonly<NativeMediaFinalRenderPreparationBudgetOwnerV1>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
): Promise<string> {
  const authorization = record(await owner.authorize({ job, jobInput }),
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_RESULT_INVALID');
  if (authorization.disposition === 'BLOCKED') {
    exactKeys(authorization, ['disposition', 'errorCode', 'retryable'],
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_RESULT_FIELDS_INVALID');
    if (typeof authorization.retryable !== 'boolean') {
      throw new WorkerFailureV1(
        'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_RESULT_INVALID',
        false,
      );
    }
    throw new WorkerFailureV1(
      requireIdentity(authorization.errorCode, 'BUDGET_ERROR_CODE'),
      authorization.retryable,
    );
  }
  if (authorization.disposition !== 'AUTHORIZED') {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_RESULT_INVALID',
      false,
    );
  }
  exactKeys(authorization, [
    'authorizationReceiptSha256', 'disposition', 'reservationBindingSha256', 'reservationId',
  ], 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_RESULT_FIELDS_INVALID');
  if (authorization.reservationId !== jobInput.budgetReservation.reservationId
    || authorization.reservationBindingSha256 !== jobInput.budgetReservation.bindingSha256) {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BUDGET_BINDING_MISMATCH',
      false,
    );
  }
  return requireSha256(authorization.authorizationReceiptSha256, 'BUDGET_AUTHORIZATION_RECEIPT');
}

function readResumeResult(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
): NativeMediaFinalRenderPreparationResultV1 | null {
  if (!job.resumeState) return null;
  const resume = record(
    job.resumeState,
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESUME_INVALID',
  );
  exactKeys(resume, ['committedAt', 'payload', 'schemaId', 'sequence', 'stateSha256'],
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESUME_INVALID');
  if (resume.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1
    || !Number.isSafeInteger(resume.sequence) || Number(resume.sequence) < 1
    || resume.stateSha256 !== hashDurableWorkflowJobJsonV1(resume.payload)) {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESUME_INVALID',
      false,
    );
  }
  try {
    return assertNativeMediaFinalRenderPreparationResultV1(resume.payload, {
      jobInput,
      jobInputBindingSha256: job.input.bindingSha256,
    });
  } catch {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESUME_INVALID',
      false,
    );
  }
}

function parsePreparationOutcome(
  value: unknown,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
  jobInputBindingSha256: string,
): Readonly<
  | { disposition: 'PREPARED'; resume: ReturnType<
      typeof createNativeMediaFinalRenderPreparationResumeStateV1> }
  | { disposition: 'UNVERIFIABLE'; diagnosticCode: string; proofSha256: string }
> {
  const outcome = record(
    value,
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_RESULT_INVALID',
  );
  if (outcome.disposition === 'UNVERIFIABLE') {
    exactKeys(outcome, ['diagnosticCode', 'disposition', 'proofSha256'],
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_RESULT_FIELDS_INVALID');
    return Object.freeze({
      disposition: 'UNVERIFIABLE',
      diagnosticCode: requireIdentity(outcome.diagnosticCode, 'OWNER_DIAGNOSTIC_CODE'),
      proofSha256: requireSha256(outcome.proofSha256, 'OWNER_PROOF'),
    });
  }
  if (outcome.disposition !== 'PREPARED') {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_RESULT_INVALID',
      false,
    );
  }
  exactKeys(outcome, ['artifact', 'disposition', 'publishHandle'],
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_RESULT_FIELDS_INVALID');
  try {
    return Object.freeze({
      disposition: 'PREPARED',
      resume: createNativeMediaFinalRenderPreparationResumeStateV1({
        jobInput,
        jobInputBindingSha256,
        publishHandle: outcome.publishHandle as string,
        artifact: outcome.artifact as NativeMediaFinalRenderArtifactV1,
      }),
    });
  } catch {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_PREPARED_RESULT_INVALID',
      false,
    );
  }
}

async function settleFailure(input: Readonly<{
  input: Parameters<typeof runNativeMediaFinalRenderPreparationWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
  ownerBindingsVerified: boolean;
  retryPolicyOwner: Readonly<NativeMediaFinalRenderPreparationRetryPolicyOwnerV1>;
}>): Promise<NativeMediaFinalRenderPreparationWorkerResultV1> {
  let failure = toWorkerFailure(input.error);
  if (!(input.error instanceof WorkerFailureV1) && input.current?.resumeState) {
    failure = new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_POST_RESUME_TRANSITION_FAILED',
      true,
    );
  }
  if (failure.retryable && !input.ownerBindingsVerified) {
    failure = new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_OWNER_BINDING_NOT_VERIFIED',
      false,
    );
  }
  const now = input.clock();
  let retryAt = now;
  let retryDecision: NativeMediaFinalRenderPreparationRetryDecisionV1 | null = null;
  if (failure.retryable) {
    try {
      retryDecision = input.retryPolicyOwner.decideRetry({
        job: input.current ?? input.claim.job,
        errorCode: failure.code,
        now,
      });
      if (retryDecision.disposition === 'RETRY_AT') {
        retryAt = new Date(retryDecision.retryAtIso);
        if (!Number.isFinite(retryAt.getTime())
          || retryAt.toISOString() !== retryDecision.retryAtIso || retryAt <= now) {
          throw new Error('RETRY_AT_INVALID');
        }
      } else {
        failure = new WorkerFailureV1(failure.code, false);
      }
    } catch {
      retryDecision = null;
      failure = new WorkerFailureV1(
        'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RETRY_POLICY_DECISION_INVALID',
        false,
      );
    }
  }
  try {
    const status = await input.input.jobStore.retryOrDeadLetter({
      jobId: input.claim.job.jobId,
      leaseToken: input.claim.leaseToken,
      error: {
        code: failure.code,
        message: failure.code,
        retryable: failure.retryable,
        occurredAt: now,
      },
      retryAt,
      retryCursor: {
        resumeSequence: input.current?.resumeState?.sequence ?? 0,
        resumeStateSha256: input.current?.resumeState?.stateSha256 ?? null,
        retryPolicySha256: input.retryPolicyOwner.policySha256,
        retryDecisionSha256: retryDecision?.decisionSha256 ?? null,
        retryDisposition: retryDecision?.disposition ?? 'NOT_RETRYABLE',
        retryReason: retryDecision?.disposition === 'DEAD_LETTER'
          ? retryDecision.reason
          : null,
      },
      now,
    });
    return { kind: status, jobId: input.claim.job.jobId, errorCode: failure.code };
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    throw error;
  }
}

function toWorkerFailure(error: unknown): WorkerFailureV1 {
  if (error instanceof WorkerFailureV1) return error;
  return new WorkerFailureV1(
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_EXECUTION_FAILED',
    false,
  );
}

async function settleCommittedTerminal(
  input: Parameters<typeof runNativeMediaFinalRenderPreparationWorkerV1>[0],
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<void> {
  const terminal = await input.jobStore.getAuthorized({
    jobId: job.jobId,
    tenantId: job.tenantId,
    userId: job.userId,
  });
  if (!terminal || !isTerminal(terminal.status)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_SETTLEMENT_STATE_INVALID');
  }
  await settleTerminalSnapshot(input.budgetOwner, terminal);
}

async function settleTerminalSnapshot(
  owner: Readonly<NativeMediaFinalRenderPreparationBudgetOwnerV1>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<void> {
  if (!isTerminal(job.status)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_SETTLEMENT_STATE_INVALID');
  }
  await owner.settleTerminal(job);
}

function unverifiableReceipt(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  authorizationReceiptSha256: string;
  preparationOwner: Readonly<NativeMediaFinalRenderArtifactPreparationOwnerV1>;
  diagnosticCode: string;
  proofSha256: string;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization', input.authorizationReceiptSha256, 'PASS'),
    proof('exact-render-preparation', input.proofSha256, 'UNVERIFIABLE'),
  ]);
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_VERSION_V1,
    jobId: input.job.jobId,
    operationId: input.job.operationId,
    inputBindingSha256: input.job.input.bindingSha256,
    budgetReservationId: input.jobInput.budgetReservation.reservationId,
    budgetReservationBindingSha256: input.jobInput.budgetReservation.bindingSha256,
    authorizationReceiptSha256: input.authorizationReceiptSha256,
    preparationOwnerId: input.preparationOwner.ownerId,
    preparationOwnerVersion: input.preparationOwner.ownerVersion,
    disposition: 'UNVERIFIABLE',
    diagnosticCode: input.diagnosticCode,
    proofReferences,
    completedAt: input.completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'UNVERIFIABLE',
    receiptId: `nmfrprepw_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt: input.completedAt,
  });
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAt: Date,
): DurableWorkflowJobTerminalReceiptV1 {
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_VERSION_V1,
    jobId: job.jobId,
    disposition: 'CANCELLED',
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'CANCELLED',
    receiptId: `nmfrprepw_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: [],
    completedAt,
  });
}

function proof(
  proofId: string,
  proofSha256: string,
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE',
) {
  return Object.freeze({
    proofId: requireIdentity(proofId, 'PROOF_ID'),
    proofSha256: requireSha256(proofSha256, 'PROOF'),
    disposition,
  });
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkerFailureV1(code, false);
  }
  return value as Record<string, unknown>;
}

function exactKeys(recordValue: Record<string, unknown>, expected: readonly string[], code: string) {
  const actual = Object.keys(recordValue).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    throw new WorkerFailureV1(code, false);
  }
}

function requireIdentity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    throw new Error(`NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_${label}_INVALID`);
  }
  return normalized;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new WorkerFailureV1(
      `NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_${label}_SHA256_INVALID`,
      false,
    );
  }
  return value;
}
