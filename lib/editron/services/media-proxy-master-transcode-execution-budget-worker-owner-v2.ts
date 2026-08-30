import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import { assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2 }
  from './media-proxy-master-transcode-execution-budget-reservation-v2';
import type {
  MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
  MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1,
  MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1,
} from './media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  readMediaProxyMasterTranscodeDurableResumeStateV2,
  type MediaProxyMasterTranscodeDurableResultV2,
} from './media-proxy-master-transcode-durable-result-v2';
import type { MediaProxyMasterTranscodeBudgetOwnerV2 }
  from './media-proxy-master-transcode-durable-worker-v2';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_V2' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

type LedgerResolutionV2 = Awaited<ReturnType<
  MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2['resolve']
>>;
type AuthorizeInputV2 = Parameters<
  MediaProxyMasterTranscodeBudgetOwnerV2['authorize']
>[0];
type TerminalJobV2 = Parameters<
  MediaProxyMasterTranscodeBudgetOwnerV2['settleTerminal']
>[0];

export type MediaProxyMasterTranscodeBudgetInfrastructureFailureV2 = Readonly<{
  errorCode: string;
  retryable: boolean;
}>;

export type MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV2 = (
  error: unknown,
) => MediaProxyMasterTranscodeBudgetInfrastructureFailureV2 | null;

/** Resolves and qualifies the exact V2 Finance reservation before dispatch. */
export async function resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2(
  input: Readonly<{
    ledgerOwner:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
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

export function createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV2(
  input: Readonly<{
    ledgerOwner:
      Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2>;
    policy: unknown;
    classifyInfrastructureFailure:
      MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV2;
    clock?: () => Date;
  }>,
): Readonly<MediaProxyMasterTranscodeBudgetOwnerV2> {
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
    authorize: async ({ job, jobInput: jobInputValue }: AuthorizeInputV2) => {
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
          authorizationReceiptSha256: authorizationReceipt(job, resolved),
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
              MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V2,
            authority:
              'PROXY_TRANSCODE_PREPARED_PUBLICATION_BUDGET_WORKER_BLOCK',
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
    settleTerminal: async (job: TerminalJobV2) => {
      if (!isTerminal(job.status)) fail('TERMINAL_STATUS_INVALID');
      const jobInput = assertJobBinding(job, job.input.payload, job.status);
      const resolved = await resolve(input.ledgerOwner, jobInput);
      assertResolution(resolved, jobInput, policy.policySha256);
      const settlement = terminalSettlement(
        job,
        authorizationReceipt(job, resolved),
        resolved.record.authorization.scope.artifactAccountingProfileSha256,
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
    Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  expectedPolicySha256?: string;
  clock: () => Date;
}>): Promise<LedgerResolutionV2> {
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
  owner: Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
) {
  return owner.resolve({
    reservationId: jobInput.budgetReservation.reservationId,
    bindingSha256: jobInput.budgetReservation.bindingSha256,
  });
}

function assertJobInput(
  value: unknown,
): MediaProxyMasterTranscodeDurableJobInputV2 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobInputV2(value);
  } catch {
    fail('JOB_INPUT_INVALID');
  }
}

function assertJobBinding(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInputValue: unknown,
  expectedStatus: DurableWorkflowJobSnapshotV1['status'],
): MediaProxyMasterTranscodeDurableJobInputV2 {
  let bound: MediaProxyMasterTranscodeDurableJobInputV2;
  let supplied: MediaProxyMasterTranscodeDurableJobInputV2;
  try {
    bound = assertMediaProxyMasterTranscodeDurableJobV2(job);
    supplied = assertMediaProxyMasterTranscodeDurableJobInputV2(jobInputValue);
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
  resolved: LedgerResolutionV2,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
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
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2(
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
  resolved: LedgerResolutionV2,
): string {
  return hashEditronCanonicalJsonV1({
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_RECEIPT_VERSION_V2,
    authority:
      'PROXY_TRANSCODE_PREPARED_PUBLICATION_BUDGET_WORKER_AUTHORIZATION',
    jobId: job.jobId,
    operationId: job.operationId,
    jobInputBindingSha256: job.input.bindingSha256,
    ownerId: resolved.policy.ownerId,
    ownerVersion: resolved.policy.ownerVersion,
    policySha256: resolved.policy.policySha256,
    artifactAccountingProfileSha256:
      resolved.record.authorization.scope.artifactAccountingProfileSha256,
    authorizationSha256: resolved.record.authorization.authorizationSha256,
    reservationSha256: resolved.record.reservation.reservationSha256,
  });
}

function terminalSettlement(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  expectedAuthorizationReceiptSha256: string,
  artifactAccountingProfileSha256: string,
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
    || (job.status === 'dead_letter'
      && (receipt !== null || job.error === null || job.attemptCount < 1))
    || (job.status === 'completed' && job.attemptCount < 1)) {
    fail('TERMINAL_EVIDENCE_INVALID');
  }
  const result = receipt?.disposition === 'PASS'
    ? passResult(job, expectedAuthorizationReceiptSha256)
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
      kind:
        'PROXY_TRANSCODE_PREPARED_PUBLICATION_BUDGET_WORKER_TERMINAL_EVIDENCE_V2',
      jobId: job.jobId,
      status: job.status,
      attemptCount: job.attemptCount,
      inputBindingSha256: job.input.bindingSha256,
      artifactAccountingProfileSha256,
      resumeStateSha256: job.resumeState?.stateSha256 ?? null,
      terminalReceiptSha256: receipt?.receiptSha256 ?? null,
      error: job.error,
      preparedStateSha256: result?.preparedState.preparedStateSha256 ?? null,
      preparedArtifactReferenceSha256:
        result?.preparedState.preparedArtifactReference.referenceSha256 ?? null,
      durableResultSha256: result?.resultSha256 ?? null,
      trustedTranscodeReceiptSha256:
        result?.trustedTranscodeReceipt.receiptSha256 ?? null,
    }),
  });
  if (result && job.attemptCount === 1) {
    return Object.freeze({
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence,
      usage: meteredUsage(result),
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
  expectedAuthorizationReceiptSha256: string,
): MediaProxyMasterTranscodeDurableResultV2 {
  let state: ReturnType<
    typeof readMediaProxyMasterTranscodeDurableResumeStateV2
  >;
  try {
    state = readMediaProxyMasterTranscodeDurableResumeStateV2(job);
  } catch {
    fail('PASS_RESUME_EVIDENCE_INVALID');
  }
  if (!state
    || state.disposition
      !== 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION'
    || state.preparedState.budgetAuthorizationReceiptSha256
      !== expectedAuthorizationReceiptSha256) {
    fail('PASS_RESUME_EVIDENCE_INVALID');
  }
  const receipt = job.terminalReceipt!;
  const expected = createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
    job,
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
  return state;
}

function meteredUsage(
  result: MediaProxyMasterTranscodeDurableResultV2,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1> {
  const prepared = result.preparedState;
  const evidence = prepared.preparedEvidence;
  const trusted = result.trustedTranscodeReceipt;
  const processMilliseconds = Date.parse(evidence.process.completedAt)
    - Date.parse(evidence.process.startedAt);
  if (!Number.isSafeInteger(processMilliseconds) || processMilliseconds < 0) {
    fail('PASS_PROCESS_METER_INVALID');
  }
  const artifact = nonNegativeSafeIntegerBigInt(
    prepared.preparedArtifactReference.artifactByteLength,
    'PASS_ARTIFACT_BYTES',
  );
  const manifest = nonNegativeSafeIntegerBigInt(
    prepared.preparedArtifactReference.manifestByteLength,
    'PASS_MANIFEST_BYTES',
  );
  return Object.freeze({
    sourceBytesRead: String(evidence.masterLocalFileEvidence.byteLength),
    encodedFrameAttempts: trusted.masterDecode.totalFrameCount,
    processMilliseconds: String(processMilliseconds),
    artifactBytesWritten: (artifact * BigInt(2) + manifest).toString(),
    artifactBytesVerified: (
      artifact * BigInt(3) + manifest * BigInt(2)
    ).toString(),
  });
}

function classifyFailure(
  error: unknown,
  classifier:
    MediaProxyMasterTranscodeBudgetInfrastructureFailureClassifierV2,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV2 | null {
  if (error instanceof MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV2) {
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

function nonNegativeSafeIntegerBigInt(value: unknown, label: string): bigint {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${label}_INVALID`);
  }
  return BigInt(Number(value));
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
  throw new MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV2(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_WORKER_V2_${code}`,
  );
}

export class MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV2
  extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetWorkerOwnerErrorV2';
  }
}
