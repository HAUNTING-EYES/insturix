import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 }
  from './native-media-final-render-execution-budget-ledger-owner-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
} from './native-media-final-render-execution-budget-policy-v1';
import type {
  NativeMediaFinalRenderExecutionBudgetSettlementModeV1,
  NativeMediaFinalRenderExecutionBudgetTerminalEvidenceV1,
} from './native-media-final-render-execution-budget-settlement-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import {
  assertNativeMediaFinalRenderPreparationResultV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1,
} from './native-media-final-render-preparation-result-v1';
import type { NativeMediaFinalRenderPreparationBudgetOwnerV1 }
  from './native-media-final-render-preparation-worker-v1';

export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_WORKER_RECEIPT_V1' as const;

type LedgerResolutionV1 = Awaited<ReturnType<
  NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['resolve']
>>;
type AuthorizeInputV1 = Parameters<
  NativeMediaFinalRenderPreparationBudgetOwnerV1['authorize']
>[0];
type TerminalJobV1 = Parameters<
  NativeMediaFinalRenderPreparationBudgetOwnerV1['settleTerminal']
>[0];
type SettlementUsageV1 = Readonly<{
  encodedFrameAttempts: string;
  artifactBytesWritten: string;
  artifactBytesVerified: string;
}>;

export function createNativeMediaFinalRenderExecutionBudgetWorkerOwnerV1(
  input: Readonly<{
    ledgerOwner: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1>;
    policy: unknown;
    clock?: () => Date;
  }>,
): Readonly<NativeMediaFinalRenderPreparationBudgetOwnerV1> {
  const policy = assertNativeMediaFinalRenderExecutionBudgetPolicyV1(input.policy);
  const clock = input.clock ?? (() => new Date());
  return Object.freeze({
    ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    authorize: async ({ job, jobInput: jobInputValue }: AuthorizeInputV1) => {
      try {
        const jobInput = assertJobBinding(job, jobInputValue, 'running');
        const resolved = await resolve(input.ledgerOwner, jobInput);
        assertResolution(resolved, jobInput, policy.policySha256);
        if (resolved.record.settlement) fail('RESERVATION_ALREADY_SETTLED');
        const now = clockIso(clock);
        if (Date.parse(now) < Date.parse(resolved.record.reservation.reservedAt)) {
          fail('RESERVATION_NOT_YET_VALID');
        }
        if (Date.parse(now) >= Date.parse(resolved.record.reservation.expiresAt)) {
          fail('RESERVATION_EXPIRED');
        }
        return Object.freeze({
          disposition: 'AUTHORIZED' as const,
          reservationId: resolved.record.reservation.reservationId,
          reservationBindingSha256: resolved.record.reservation.reservationSha256,
          authorizationReceiptSha256: hashEditronCanonicalJsonV1({
            version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V1,
            authority: 'EXACT_RENDER_EXECUTION_BUDGET_WORKER_AUTHORIZATION',
            jobId: job.jobId,
            attemptCount: job.attemptCount,
            jobInputBindingSha256: job.input.bindingSha256,
            ownerId: policy.ownerId,
            ownerVersion: policy.ownerVersion,
            policySha256: policy.policySha256,
            authorizationSha256: resolved.record.authorization.authorizationSha256,
            reservationSha256: resolved.record.reservation.reservationSha256,
          }),
        });
      } catch (error) {
        if (error instanceof NativeMediaFinalRenderExecutionBudgetWorkerOwnerErrorV1) {
          return Object.freeze({
            disposition: 'BLOCKED' as const,
            errorCode: error.code,
            retryable: false,
          });
        }
        throw error;
      }
    },
    settleTerminal: async (job: TerminalJobV1) => {
      const jobInput = assertJobBinding(job, job.input.payload, job.status);
      if (!isTerminal(job.status)) fail('TERMINAL_STATUS_INVALID');
      const resolved = await resolve(input.ledgerOwner, jobInput);
      assertResolution(resolved, jobInput, policy.policySha256);
      const settlement = terminalSettlement(job, jobInput);
      return input.ledgerOwner.settle({
        reservationId: jobInput.budgetReservation.reservationId,
        bindingSha256: jobInput.budgetReservation.bindingSha256,
        ...settlement,
      });
    },
  });
}

async function resolve(
  owner: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
) {
  return owner.resolve({
    reservationId: jobInput.budgetReservation.reservationId,
    bindingSha256: jobInput.budgetReservation.bindingSha256,
  });
}

function assertJobBinding(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInputValue: unknown,
  expectedStatus: DurableWorkflowJobSnapshotV1['status'],
): NativeMediaFinalRenderPreparationJobInputV1 {
  const jobInput = assertNativeMediaFinalRenderPreparationJobInputV1(jobInputValue);
  const binding = jobInput.policyBindings.runtimePolicy.executionBudget;
  if (job.status !== expectedStatus
    || job.operationOwner !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1
    || job.operationKind !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1
    || job.input.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    || job.input.bindingSha256 !== hashDurableWorkflowJobJsonV1(jobInput)
    || hashDurableWorkflowJobJsonV1(job.input.payload)
      !== hashDurableWorkflowJobJsonV1(jobInput)
    || job.tenantId !== jobInput.tenantId || job.userId !== jobInput.userId
    || job.orgId !== jobInput.orgId || job.projectId !== jobInput.projectId
    || !job.budgetReservation
    || job.budgetReservation.reservationId !== jobInput.budgetReservation.reservationId
    || job.budgetReservation.bindingSha256 !== jobInput.budgetReservation.bindingSha256
    || binding.ownerId !== NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1
    || !Number.isSafeInteger(job.attemptCount) || job.attemptCount < 0
    || (expectedStatus === 'running' && job.attemptCount < 1)
    || !Number.isSafeInteger(job.maxAttempts) || job.maxAttempts < 1
    || job.attemptCount > job.maxAttempts
    || job.remainingAttempts !== job.maxAttempts - job.attemptCount) {
    fail('JOB_BINDING_MISMATCH');
  }
  return jobInput;
}

function assertResolution(
  resolved: LedgerResolutionV1,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
  policySha256: string,
): void {
  const binding = jobInput.policyBindings.runtimePolicy.executionBudget;
  const expectedScope = {
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    projectId: jobInput.projectId,
    sequenceId: jobInput.sequenceId,
    projectRevisionSha256: hashEditronCanonicalJsonV1(jobInput.projectRevision),
    admissionReceiptSha256: jobInput.admissionReceiptSha256,
    exactSourceRequestSha256: jobInput.exactSourceRequestSha256,
  };
  if (resolved.policy.ownerId !== binding.ownerId
    || resolved.policy.ownerVersion !== binding.ownerVersion
    || resolved.policy.policySha256 !== binding.policySha256
    || resolved.policy.policySha256 !== policySha256
    || hashEditronCanonicalJsonV1(resolved.record.authorization.scope)
      !== hashEditronCanonicalJsonV1(expectedScope)
    || resolved.record.reservation.reservationId
      !== jobInput.budgetReservation.reservationId
    || resolved.record.reservation.reservationSha256
      !== jobInput.budgetReservation.bindingSha256) {
    fail('RESERVATION_SCOPE_OR_POLICY_MISMATCH');
  }
}

function terminalSettlement(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
): Readonly<{
  mode: NativeMediaFinalRenderExecutionBudgetSettlementModeV1;
  terminalEvidence: NativeMediaFinalRenderExecutionBudgetTerminalEvidenceV1;
  usage: SettlementUsageV1 | null;
}> {
  const receipt = job.terminalReceipt;
  if ((job.status === 'completed' && (!receipt || receipt.disposition === 'CANCELLED'))
    || (job.status === 'cancelled' && receipt?.disposition !== 'CANCELLED')
    || (job.status === 'dead_letter' && (receipt !== null || job.error === null))
    || (job.status === 'completed' && job.attemptCount < 1)) {
    fail('TERMINAL_EVIDENCE_INVALID');
  }
  const result = receipt?.disposition === 'PASS'
    ? passResult(job, jobInput)
    : null;
  const terminalEvidence = Object.freeze({
    jobId: job.jobId,
    jobStatus: job.status as NativeMediaFinalRenderExecutionBudgetTerminalEvidenceV1['jobStatus'],
    terminalDisposition: receipt?.disposition ?? null,
    attemptCount: job.attemptCount,
    terminalArtifactSha256: hashEditronCanonicalJsonV1({
      kind: 'EXACT_RENDER_EXECUTION_BUDGET_WORKER_TERMINAL_EVIDENCE_V1',
      jobId: job.jobId,
      status: job.status,
      attemptCount: job.attemptCount,
      inputBindingSha256: job.input.bindingSha256,
      resumeStateSha256: job.resumeState?.stateSha256 ?? null,
      terminalReceiptSha256: receipt?.receiptSha256 ?? null,
      error: job.error,
      artifactBindingSha256: result?.artifact.artifactBindingSha256 ?? null,
    }),
  });
  if (result && job.attemptCount === 1) {
    return Object.freeze({
      mode: 'METERED_FINAL_ARTIFACT', terminalEvidence,
      usage: {
        encodedFrameAttempts: result.artifact.videoFrameCount,
        artifactBytesWritten: result.artifact.artifactByteLength,
        artifactBytesVerified: result.artifact.artifactByteLength,
      },
    });
  }
  if (result) return Object.freeze({
    mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
    terminalEvidence, usage: null,
  });
  if (job.status === 'cancelled' && job.attemptCount === 0) {
    return Object.freeze({ mode: 'RELEASED_NO_EXECUTION', terminalEvidence, usage: null });
  }
  return Object.freeze({
    mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN', terminalEvidence, usage: null,
  });
}

function passResult(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: NativeMediaFinalRenderPreparationJobInputV1,
) {
  const resume = job.resumeState;
  if (!resume || resume.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1
    || resume.stateSha256 !== hashDurableWorkflowJobJsonV1(resume.payload)) {
    fail('PASS_RESUME_EVIDENCE_INVALID');
  }
  return assertNativeMediaFinalRenderPreparationResultV1(resume.payload, {
    jobInput,
    jobInputBindingSha256: job.input.bindingSha256,
  });
}

function clockIso(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('CLOCK_INVALID');
  return value.toISOString();
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): status is
  'completed' | 'cancelled' | 'dead_letter' {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function fail(code: string): never {
  throw new NativeMediaFinalRenderExecutionBudgetWorkerOwnerErrorV1(
    `NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_WORKER_${code}`,
  );
}

export class NativeMediaFinalRenderExecutionBudgetWorkerOwnerErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeMediaFinalRenderExecutionBudgetWorkerOwnerErrorV1';
  }
}
