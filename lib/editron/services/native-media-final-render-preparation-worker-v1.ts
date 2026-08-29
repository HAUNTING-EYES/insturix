import {
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  type NativeMediaFinalRenderPreparationExecutionProfileV1,
  type NativeMediaFinalRenderPreparationJobInputV1,
  type NativeMediaFinalRenderPreparationPolicyBindingsV1,
} from './native-media-final-render-preparation-job-v1';
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

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RECEIPT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1 =
  'NATIVE_MEDIA_FINAL_RENDER_SOURCE_MATERIALIZER' as const;

const OPERATION_OWNER = 'NATIVE_MEDIA_FINAL_RENDER';
const OPERATION_KIND = 'native_media_final_render_prepare_source';
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type NativeMediaFinalRenderPreparationRuntimeContractV1 = Readonly<{
  policyBindings: NativeMediaFinalRenderPreparationPolicyBindingsV1;
  executionProfile: NativeMediaFinalRenderPreparationExecutionProfileV1;
}>;

export type NativeMediaFinalRenderPreparationBudgetAuthorizationV1 = Readonly<
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

export interface NativeMediaFinalRenderPreparationRetryPolicyOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
  nextRetryAt(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    errorCode: string;
    now: Date;
  }>): Promise<Date>;
}

export class NativeMediaFinalRenderPreparationRetryableErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(requireIdentity(code, 'RETRYABLE_ERROR_CODE'));
    this.name = 'NativeMediaFinalRenderPreparationRetryableErrorV1';
  }
}

export type NativeMediaFinalRenderPreparationWorkerResultV1 = Readonly<
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
  retryPolicyOwner: Readonly<NativeMediaFinalRenderPreparationRetryPolicyOwnerV1>;
  clock?: () => Date;
}>): Promise<NativeMediaFinalRenderPreparationWorkerResultV1> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') {
    if ('job' in claim && isTerminal(claim.job.status)) {
      const jobInput = resolveClaimedJob(claim.job);
      assertRuntimeContract(jobInput, input.runtimeContract);
      assertOwnerBindings(input, jobInput);
      await settleTerminalSnapshot(input.budgetOwner, claim.job);
    }
    return { kind: 'skipped', reason: claim.reason };
  }
  if (claim.kind === 'cancel_claimed') {
    const jobInput = resolveClaimedJob(claim.job);
    assertRuntimeContract(jobInput, input.runtimeContract);
    assertOwnerBindings(input, jobInput);
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
    assertOwnerBindings(input, jobInput);
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
      input, claim, current, error, clock, ownerBindingsVerified,
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
  let payload: NativeMediaFinalRenderPreparationJobInputV1;
  let contract: ReturnType<typeof buildNativeMediaFinalRenderPreparationJobContractV1>;
  try {
    payload = assertNativeMediaFinalRenderPreparationJobInputV1(job.input.payload);
    contract = buildNativeMediaFinalRenderPreparationJobContractV1(contractInput(payload));
  } catch {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_JOB_CONTRACT_INVALID',
      false,
    );
  }
  if (job.version !== DURABLE_WORKFLOW_JOB_VERSION_V1
    || job.operationOwner !== OPERATION_OWNER || job.operationKind !== OPERATION_KIND
    || job.operationId !== contract.operationIdentity
    || job.idempotencyKey !== contract.operationIdentity
    || job.parentCommandId !== null || job.parentReceiptId !== null
    || job.input.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    || job.input.bindingSha256 !== contract.bindingSha256
    || job.tenantId !== payload.tenantId || job.userId !== payload.userId
    || job.orgId !== payload.orgId || job.projectId !== payload.projectId
    || hashDurableWorkflowJobJsonV1(job.budgetReservation)
      !== hashDurableWorkflowJobJsonV1(payload.budgetReservation)
    || hashDurableWorkflowJobJsonV1(job.dependencies)
      !== hashDurableWorkflowJobJsonV1(contract.dependencies)) {
    throw new WorkerFailureV1(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_JOB_BINDING_MISMATCH',
      false,
    );
  }
  return payload;
}

function contractInput(
  job: NativeMediaFinalRenderPreparationJobInputV1,
  runtime?: NativeMediaFinalRenderPreparationRuntimeContractV1,
) {
  return {
    tenantId: job.tenantId,
    userId: job.userId,
    orgId: job.orgId,
    projectId: job.projectId,
    sequenceId: job.sequenceId,
    projectRevision: job.projectRevision,
    admissionReceiptSha256: job.admissionReceiptSha256,
    budgetReservation: job.budgetReservation,
    exactSourceRequest: job.exactSourceRequest,
    policyBindings: runtime?.policyBindings ?? job.policyBindings,
    executionProfile: runtime?.executionProfile ?? job.executionProfile,
  };
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
    rebound = buildNativeMediaFinalRenderPreparationJobContractV1(contractInput(job, {
      policyBindings: runtime.policyBindings as NativeMediaFinalRenderPreparationPolicyBindingsV1,
      executionProfile:
        runtime.executionProfile as NativeMediaFinalRenderPreparationExecutionProfileV1,
    }));
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
): void {
  const runtimePolicy = job.policyBindings.runtimePolicy;
  if (input.budgetOwner.ownerId !== runtimePolicy.executionBudget.ownerId
    || input.budgetOwner.ownerVersion !== runtimePolicy.executionBudget.ownerVersion
    || input.budgetOwner.policySha256 !== runtimePolicy.executionBudget.policySha256
    || input.retryPolicyOwner.ownerId !== runtimePolicy.retryPolicy.ownerId
    || input.retryPolicyOwner.ownerVersion !== runtimePolicy.retryPolicy.ownerVersion
    || input.retryPolicyOwner.policySha256 !== runtimePolicy.retryPolicy.policySha256
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
}>): Promise<NativeMediaFinalRenderPreparationWorkerResultV1> {
  let failure = toWorkerFailure(input.error);
  if (!(input.error instanceof WorkerFailureV1)
    && !(input.error instanceof NativeMediaFinalRenderPreparationRetryableErrorV1)
    && input.current?.resumeState) {
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
  if (failure.retryable) {
    retryAt = await input.input.retryPolicyOwner.nextRetryAt({
      job: input.current ?? input.claim.job,
      errorCode: failure.code,
      now,
    });
    if (!(retryAt instanceof Date) || Number.isNaN(retryAt.getTime()) || retryAt <= now) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RETRY_AT_INVALID');
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
  if (error instanceof NativeMediaFinalRenderPreparationRetryableErrorV1) {
    return new WorkerFailureV1(error.code, true);
  }
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
