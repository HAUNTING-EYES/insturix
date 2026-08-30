import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
import type {
  MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
  MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1,
  MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableJobV1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  type MediaProxyMasterTranscodeDurableJobInputV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeDurableTerminalReceiptV1,
  readMediaProxyMasterTranscodeDurableResumeResultV1,
} from './media-proxy-master-transcode-durable-result-v1';
import type { MediaProxyMasterTranscodeBudgetOwnerV1 }
  from './media-proxy-master-transcode-durable-worker-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

type LedgerResolutionV1 = Awaited<ReturnType<
  MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1['resolve']
>>;
type AuthorizeInputV1 = Parameters<
  MediaProxyMasterTranscodeBudgetOwnerV1['authorize']
>[0];
type TerminalJobV1 = Parameters<
  MediaProxyMasterTranscodeBudgetOwnerV1['settleTerminal']
>[0];

export type MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 = Readonly<{
  errorCode: string;
  retryable: boolean;
}>;

export type MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV1 = (
  error: unknown,
) => MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 | null;

/** Resolves and qualifies the exact Finance reservation before dispatch. */
export async function resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1(
  input: Readonly<{
    ledgerOwner:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
    clock?: () => Date;
  }>,
) {
  const jobInput = assertJobInput(input.jobInput);
  const resolved = await resolveQualifiedBudget({
    ledgerOwner: input.ledgerOwner,
    jobInput,
    clock: input.clock ?? (() => new Date()),
  });
  return resolved.policy;
}

export function createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV1(
  input: Readonly<{
    ledgerOwner:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1>;
    policy: unknown;
    classifyInfrastructureFailure:
      MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV1;
    clock?: () => Date;
  }>,
): Readonly<MediaProxyMasterTranscodeBudgetOwnerV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  if (typeof input.classifyInfrastructureFailure !== 'function') {
    fail('INFRASTRUCTURE_FAILURE_CLASSIFIER_REQUIRED');
  }
  const clock = input.clock ?? (() => new Date());
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    authorize: async ({ job, jobInput: jobInputValue }: AuthorizeInputV1) => {
      try {
        const jobInput = assertJobBinding(job, jobInputValue, 'running');
        const resolved = await resolveQualifiedBudget({
          ledgerOwner: input.ledgerOwner,
          jobInput,
          expectedPolicySha256: policy.policySha256,
          clock,
        });
        return Object.freeze({
          disposition: 'AUTHORIZED' as const,
          reservationId: resolved.record.reservation.reservationId,
          reservationBindingSha256:
            resolved.record.reservation.reservationSha256,
          authorizationReceiptSha256: authorizationReceipt(
            job,
            resolved,
          ),
        });
      } catch (error) {
        const classification = classifyFailure(
          error,
          input.classifyInfrastructureFailure,
        );
        if (!classification) throw error;
        return Object.freeze({
          disposition: 'BLOCKED' as const,
          errorCode: classification.errorCode,
          retryable: classification.retryable,
          proofSha256: hashEditronCanonicalJsonV1({
            version:
              MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V1,
            authority: 'PROXY_TRANSCODE_EXECUTION_BUDGET_WORKER_BLOCK',
            jobId: safeText(job.jobId),
            operationId: safeText(job.operationId),
            jobInputBindingSha256: safeText(job.input?.bindingSha256),
            reservationId: safeText(job.budgetReservation?.reservationId),
            ownerId: policy.ownerId,
            ownerVersion: policy.ownerVersion,
            policySha256: policy.policySha256,
            errorCode: classification.errorCode,
            retryable: classification.retryable,
          }),
        });
      }
    },
    settleTerminal: async (job: TerminalJobV1) => {
      if (!isTerminal(job.status)) fail('TERMINAL_STATUS_INVALID');
      const jobInput = assertJobBinding(job, job.input.payload, job.status);
      const resolved = await resolve(input.ledgerOwner, jobInput);
      assertResolution(resolved, jobInput, policy.policySha256);
      const settlement = terminalSettlement(
        job,
        jobInput,
        authorizationReceipt(job, resolved),
      );
      return input.ledgerOwner.settle({
        reservationId: jobInput.budgetReservation.reservationId,
        bindingSha256: jobInput.budgetReservation.bindingSha256,
        ...settlement,
      });
    },
  });
}

async function resolveQualifiedBudget(input: Readonly<{
  ledgerOwner:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  expectedPolicySha256?: string;
  clock: () => Date;
}>): Promise<LedgerResolutionV1> {
  const resolved = await resolve(input.ledgerOwner, input.jobInput);
  assertResolution(
    resolved,
    input.jobInput,
    input.expectedPolicySha256 ?? resolved.policy.policySha256,
  );
  if (resolved.record.settlement) fail('RESERVATION_ALREADY_SETTLED');
  const now = clockIso(input.clock);
  if (Date.parse(now) < Date.parse(resolved.record.reservation.reservedAt)) {
    fail('RESERVATION_NOT_YET_VALID');
  }
  if (Date.parse(now) >= Date.parse(resolved.record.reservation.expiresAt)) {
    fail('RESERVATION_EXPIRED');
  }
  return resolved;
}

async function resolve(
  owner: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
) {
  return owner.resolve({
    reservationId: jobInput.budgetReservation.reservationId,
    bindingSha256: jobInput.budgetReservation.bindingSha256,
  });
}

function assertJobInput(
  value: unknown,
): MediaProxyMasterTranscodeDurableJobInputV1 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobInputV1(value);
  } catch {
    fail('JOB_INPUT_INVALID');
  }
}

function assertJobBinding(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInputValue: unknown,
  expectedStatus: DurableWorkflowJobSnapshotV1['status'],
): MediaProxyMasterTranscodeDurableJobInputV1 {
  let bound: MediaProxyMasterTranscodeDurableJobInputV1;
  let supplied: MediaProxyMasterTranscodeDurableJobInputV1;
  try {
    bound = assertMediaProxyMasterTranscodeDurableJobV1(job);
    supplied = assertMediaProxyMasterTranscodeDurableJobInputV1(jobInputValue);
  } catch {
    fail('JOB_BINDING_MISMATCH');
  }
  const budgetBinding = bound.runtimePolicy.executionBudgetPolicy;
  if (job.status !== expectedStatus
    || hashDurableWorkflowJobJsonV1(bound)
      !== hashDurableWorkflowJobJsonV1(supplied)
    || job.operationOwner !== MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1
    || job.operationKind !== MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1
    || job.projectId !== null
    || !job.budgetReservation
    || job.budgetReservation.reservationId
      !== bound.budgetReservation.reservationId
    || job.budgetReservation.bindingSha256
      !== bound.budgetReservation.bindingSha256
    || budgetBinding.ownerId
      !== MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1
    || !Number.isSafeInteger(job.attemptCount) || job.attemptCount < 0
    || (expectedStatus === 'running' && job.attemptCount < 1)
    || !Number.isSafeInteger(job.maxAttempts) || job.maxAttempts < 1
    || job.attemptCount > job.maxAttempts
    || job.remainingAttempts !== job.maxAttempts - job.attemptCount) {
    fail('JOB_BINDING_MISMATCH');
  }
  return bound;
}

function assertResolution(
  resolved: LedgerResolutionV1,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  expectedPolicySha256: string,
): void {
  const binding = jobInput.runtimePolicy.executionBudgetPolicy;
  if (resolved.policy.ownerId !== binding.ownerId
    || resolved.policy.ownerVersion !== binding.ownerVersion
    || resolved.policy.policySha256 !== binding.policySha256
    || resolved.policy.policySha256 !== expectedPolicySha256
    || resolved.record.reservation.reservationId
      !== jobInput.budgetReservation.reservationId
    || resolved.record.reservation.reservationSha256
      !== jobInput.budgetReservation.bindingSha256) {
    fail('RESERVATION_SCOPE_OR_POLICY_MISMATCH');
  }
  try {
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1(
      resolved.record.authorization,
      resolved.policy,
      jobInput,
    );
  } catch {
    fail('RESERVATION_SCOPE_OR_POLICY_MISMATCH');
  }
}

function authorizationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  resolved: LedgerResolutionV1,
): string {
  return hashEditronCanonicalJsonV1({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V1,
    authority: 'PROXY_TRANSCODE_EXECUTION_BUDGET_WORKER_AUTHORIZATION',
    jobId: job.jobId,
    operationId: job.operationId,
    jobInputBindingSha256: job.input.bindingSha256,
    ownerId: resolved.policy.ownerId,
    ownerVersion: resolved.policy.ownerVersion,
    policySha256: resolved.policy.policySha256,
    authorizationSha256: resolved.record.authorization.authorizationSha256,
    reservationSha256: resolved.record.reservation.reservationSha256,
  });
}

function terminalSettlement(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  expectedAuthorizationReceiptSha256: string,
): Readonly<{
  mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
  terminalEvidence:
    MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
  usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
}> {
  const receipt = job.terminalReceipt;
  if ((job.status === 'completed'
      && (!receipt
        || (receipt.disposition !== 'PASS'
          && receipt.disposition !== 'UNVERIFIABLE')))
    || (job.status === 'cancelled' && receipt?.disposition !== 'CANCELLED')
    || (job.status === 'dead_letter' && (receipt !== null || job.error === null))
    || (job.status === 'completed' && job.attemptCount < 1)) {
    fail('TERMINAL_EVIDENCE_INVALID');
  }
  const result = receipt?.disposition === 'PASS'
    ? passResult(
      job,
      jobInput,
      expectedAuthorizationReceiptSha256,
    )
    : null;
  const terminalDisposition:
    MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1[
      'terminalDisposition'
    ] = receipt === null
      ? null
      : receipt.disposition === 'PASS'
        || receipt.disposition === 'UNVERIFIABLE'
        || receipt.disposition === 'CANCELLED'
        ? receipt.disposition
        : fail('TERMINAL_EVIDENCE_INVALID');
  const terminalEvidence = Object.freeze({
    jobId: job.jobId,
    jobStatus: job.status as
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1['jobStatus'],
    terminalDisposition,
    attemptCount: job.attemptCount,
    terminalArtifactSha256: hashEditronCanonicalJsonV1({
      kind: 'PROXY_TRANSCODE_EXECUTION_BUDGET_WORKER_TERMINAL_EVIDENCE_V1',
      jobId: job.jobId,
      status: job.status,
      attemptCount: job.attemptCount,
      inputBindingSha256: job.input.bindingSha256,
      resumeStateSha256: job.resumeState?.stateSha256 ?? null,
      terminalReceiptSha256: receipt?.receiptSha256 ?? null,
      error: job.error,
      durableResultSha256: result?.resultSha256 ?? null,
      trustedTranscodeReceiptSha256:
        result?.trustedTranscodeReceipt.receiptSha256 ?? null,
    }),
  });
  if (result && job.attemptCount === 1) {
    const trusted = result.trustedTranscodeReceipt;
    const processMilliseconds = Date.parse(trusted.process.completedAt)
      - Date.parse(trusted.process.startedAt);
    if (!Number.isSafeInteger(processMilliseconds) || processMilliseconds < 0) {
      fail('PASS_PROCESS_METER_INVALID');
    }
    const artifactBytes = String(trusted.proxyEncode.sourceVersion.byteLength);
    return Object.freeze({
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence,
      usage: {
        sourceBytesRead: String(
          trusted.masterDecode.localFileEvidence.byteLength,
        ),
        encodedFrameAttempts: trusted.masterDecode.totalFrameCount,
        processMilliseconds: String(processMilliseconds),
        artifactBytesWritten: artifactBytes,
        artifactBytesVerified: artifactBytes,
      },
    });
  }
  if (result) {
    return Object.freeze({
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      terminalEvidence,
      usage: null,
    });
  }
  if (job.status === 'cancelled' && job.attemptCount === 0) {
    return Object.freeze({
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence,
      usage: null,
    });
  }
  return Object.freeze({
    mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
    terminalEvidence,
    usage: null,
  });
}

function passResult(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  expectedAuthorizationReceiptSha256: string,
) {
  let result: NonNullable<ReturnType<
    typeof readMediaProxyMasterTranscodeDurableResumeResultV1
  >>;
  try {
    result = readMediaProxyMasterTranscodeDurableResumeResultV1(job, jobInput)!;
  } catch {
    fail('PASS_RESUME_EVIDENCE_INVALID');
  }
  if (!result
    || result.budgetAuthorizationReceiptSha256
      !== expectedAuthorizationReceiptSha256) {
    fail('PASS_RESUME_EVIDENCE_INVALID');
  }
  const receipt = job.terminalReceipt!;
  const expected = createMediaProxyMasterTranscodeDurableTerminalReceiptV1({
    jobId: job.jobId,
    operationId: job.operationId,
    jobInputBindingSha256: job.input.bindingSha256,
    jobInput,
    result,
    completedAt: date(receipt.completedAt, 'TERMINAL_COMPLETED_AT'),
  });
  const expectedSnapshot = {
    ...expected,
    completedAt: expected.completedAt.toISOString(),
  };
  if (hashDurableWorkflowJobJsonV1(receipt)
    !== hashDurableWorkflowJobJsonV1(expectedSnapshot)) {
    fail('PASS_TERMINAL_RECEIPT_INVALID');
  }
  return result;
}

function classifyFailure(
  error: unknown,
  classifier:
    MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV1,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 | null {
  if (error instanceof MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV1) {
    return Object.freeze({ errorCode: error.code, retryable: false });
  }
  const value = classifier(error);
  if (value === null) return null;
  if (!value || typeof value.retryable !== 'boolean') {
    fail('INFRASTRUCTURE_FAILURE_CLASSIFICATION_INVALID');
  }
  return Object.freeze({
    errorCode: identity(value.errorCode, 'INFRASTRUCTURE_ERROR_CODE'),
    retryable: value.retryable,
  });
}

function clockIso(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('CLOCK_INVALID');
  }
  return value.toISOString();
}

function date(value: unknown, label: string): Date {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime()) || result.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return result;
}

function safeText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 512 ? value : null;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTITY.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): status is
  'completed' | 'cancelled' | 'dead_letter' {
  return status === 'completed'
    || status === 'cancelled'
    || status === 'dead_letter';
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV1(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_${code}`,
  );
}

export class MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV1';
  }
}
