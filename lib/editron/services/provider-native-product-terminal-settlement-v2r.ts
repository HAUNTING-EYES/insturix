import { canonicalizeJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { decodeProviderNativeCheckpointStateV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-checkpoint-state-codec-v2r';
import type {
  ProviderNativeEpisodeResumeCheckpointV2R,
  ProviderNativeRuntimeGuardResumeStateV2R,
}
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  assertProviderNativeProductBudgetSettlementV2R,
  type ProviderNativeProductBudgetAuthorizationV2R,
  type ProviderNativeProductBudgetReservationV2R,
  type ProviderNativeProductBudgetSettlementRequestV2R,
  type ProviderNativeProductBudgetSettlementV2R,
  type ProviderNativeProductBudgetWalletPortV2R,
} from './provider-native-product-budget-v2r';
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  createProviderNativeProductCustomerChargeReceiptV2R,
  type ProviderNativeProductCustomerChargeOwnerV2R,
  type ProviderNativeProductCustomerChargeReceiptV2R,
} from './provider-native-product-customer-charge-v2r';

type JsonRecord = Record<string, unknown>;

export interface ProviderNativeProductTerminalReservationLocatorV2R {
  resolveTerminal(input: Readonly<{
    reservationId: string;
    expectedGuardIdentitySha256: string;
  }>): Promise<Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
  }>>;
}

type TerminalBudgetOwner = ProviderNativeProductTerminalReservationLocatorV2R
  & Pick<ProviderNativeProductBudgetWalletPortV2R, 'settle'>;

export interface ProviderNativeProductTerminalSettlementOwnerV2R {
  settleTerminal(
    job: Readonly<DurableWorkflowJobSnapshotV1>,
  ): Promise<Readonly<ProviderNativeProductBudgetSettlementV2R>>;
}

export function createProviderNativeProductTerminalSettlementOwnerV2R(
  input: Readonly<{
    budgetOwner: Readonly<TerminalBudgetOwner>;
    customerChargeOwner: Readonly<ProviderNativeProductCustomerChargeOwnerV2R>;
  }>,
): Readonly<ProviderNativeProductTerminalSettlementOwnerV2R> {
  return Object.freeze({
    settleTerminal: async (job: Readonly<DurableWorkflowJobSnapshotV1>) => {
      assertTerminalJob(job);
      const budgetBinding = job.budgetReservation!;
      const located = await input.budgetOwner.resolveTerminal({
        reservationId: budgetBinding.reservationId,
        expectedGuardIdentitySha256: budgetBinding.bindingSha256,
      });
      const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
        located.authorization,
      );
      const reservation = assertProviderNativeProductBudgetReservationV2R(
        located.reservation,
        authorization,
      );
      assertJobBinding(job, authorization, reservation);
      const evidence = deriveExecutionEvidence(job, authorization, reservation);
      let requested: ProviderNativeProductBudgetSettlementRequestV2R;
      if (evidence.mode === 'CANCELLED_BEFORE_DISPATCH') {
        requested = {
          mode: evidence.mode,
          terminalDisposition: 'FAIL',
          actualProviderSpendNanoUsd: 0,
          chargedCentiCredits: 0,
          releasedCentiCredits: reservation.reservedCentiCredits,
          providerAttemptReceiptSha256s: [],
          executionEvidence: evidence.executionEvidence,
          customerChargeComputationSha256: null,
        };
      } else if (evidence.mode === 'CONSERVATIVE_MAX') {
        requested = {
          mode: evidence.mode,
          terminalDisposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
          actualProviderSpendNanoUsd: null,
          chargedCentiCredits: reservation.reservedCentiCredits,
          releasedCentiCredits: 0,
          providerAttemptReceiptSha256s: evidence.attemptSha256s,
          executionEvidence: evidence.executionEvidence,
          customerChargeComputationSha256: null,
        };
      } else {
        const charge = assertCustomerChargeReceipt(
          await input.customerChargeOwner.compute({
            authorization,
            reservation,
            actualProviderSpendNanoUsd: evidence.actualSpendNanoUsd,
            providerAttemptReceiptSha256s: evidence.attemptSha256s,
          }),
          authorization,
          evidence.actualSpendNanoUsd,
          evidence.attemptSha256s,
        );
        requested = {
          mode: 'ACTUAL_USAGE',
          terminalDisposition: completedDisposition(job),
          actualProviderSpendNanoUsd: evidence.actualSpendNanoUsd,
          chargedCentiCredits: charge.chargedCentiCredits,
          releasedCentiCredits:
            reservation.reservedCentiCredits - charge.chargedCentiCredits,
          providerAttemptReceiptSha256s: evidence.attemptSha256s,
          executionEvidence: evidence.executionEvidence,
          customerChargeComputationSha256: charge.receiptSha256,
        };
      }
      const settled = assertProviderNativeProductBudgetSettlementV2R(
        await input.budgetOwner.settle({ authorization, reservation, requested }),
        authorization,
        reservation,
      );
      if (hashEditronCanonicalJsonV1(settlementRequest(settled))
        !== hashEditronCanonicalJsonV1(requested)) {
        fail('PRODUCT_TERMINAL_SETTLEMENT_RESULT_MISMATCH');
      }
      return settled;
    },
  });
}

function deriveExecutionEvidence(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
) {
  const artifactSha256 = terminalArtifactSha256(job);
  if (!job.resumeState) {
    if (job.status !== 'cancelled') fail('PRODUCT_TERMINAL_RUNTIME_EVIDENCE_MISSING');
    return { mode: 'CANCELLED_BEFORE_DISPATCH' as const, attemptSha256s: [],
      actualSpendNanoUsd: 0, executionEvidence: jobEvidence(job, 'NO_PROVIDER_DISPATCH',
        artifactSha256) };
  }
  const { checkpoint } = decodeProviderNativeCheckpointStateV2R({
    state: job.resumeState,
    projectId: job.projectId,
  });
  assertCheckpointBinding(checkpoint, authorization, reservation);
  const attempts = 'accountedProviderAttempts' in checkpoint
    ? checkpoint.accountedProviderAttempts : [];
  const attemptSha256s = attempts.map(({ receiptSha256 }) => receiptSha256);
  const runtime = checkpoint.runtimeGuardResumeState;
  const usage = record(runtime.state.usage, 'PRODUCT_TERMINAL_RUNTIME_USAGE');
  const providerTurns = nonNegativeInteger(usage.providerTurns, 'TERMINAL_PROVIDER_TURNS');
  const actualSpendNanoUsd = nonNegativeInteger(
    usage.spentNanoUsd,
    'TERMINAL_PROVIDER_SPEND',
  );
  const pending = 'pendingProviderDispatchIntent' in checkpoint;
  const conservative = pending || conservativeSpend(usage) > 0
    || attempts.some((attempt) => attempt.accounting.mode !== 'PROVIDER_REPORTED_USAGE');
  if (job.status === 'cancelled' && providerTurns === 0 && !pending
    && attempts.length === 0) {
    return { mode: 'CANCELLED_BEFORE_DISPATCH' as const, attemptSha256s: [],
      actualSpendNanoUsd: 0, executionEvidence: jobEvidence(job, 'NO_PROVIDER_DISPATCH',
        artifactSha256) };
  }
  if (providerTurns === 0 && !pending && attempts.length === 0) {
    fail('PRODUCT_TERMINAL_PROVIDER_EVIDENCE_EMPTY');
  }
  return conservative
    ? { mode: 'CONSERVATIVE_MAX' as const, attemptSha256s, actualSpendNanoUsd,
        executionEvidence: jobEvidence(job, 'UNKNOWN_PROVIDER_RESULT', artifactSha256) }
    : { mode: 'ACTUAL_USAGE' as const, attemptSha256s, actualSpendNanoUsd,
        executionEvidence: jobEvidence(job, 'ACTUAL_USAGE_COMPLETE', artifactSha256) };
}

function assertCheckpointBinding(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
): asserts checkpoint is ProviderNativeEpisodeResumeCheckpointV2R & {
  runtimeGuardResumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>;
} {
  if (!('runtimeGuardResumeState' in checkpoint)
    || checkpoint.episodeId !== authorization.scope.episodeId
    || canonicalizeJsonV1(checkpoint.route) !== canonicalizeJsonV1(authorization.route)
    || checkpoint.runtimeGuardResumeState.guardIdentitySha256
      !== reservation.guardIdentitySha256
    || checkpoint.runtimeGuardResumeState.state.authorizationSha256
      !== authorization.authorizationSha256) {
    fail('PRODUCT_TERMINAL_CHECKPOINT_BINDING_MISMATCH');
  }
}

function assertTerminalJob(job: Readonly<DurableWorkflowJobSnapshotV1>): void {
  if (!['completed', 'cancelled', 'dead_letter'].includes(job.status)
    || job.operationOwner !== 'PLAN_SERVICE'
    || job.operationKind !== 'editorial_plan_node_episode'
    || !job.projectId || !job.budgetReservation) {
    fail('PRODUCT_TERMINAL_JOB_INVALID');
  }
  if ((job.status === 'completed' || job.status === 'cancelled')
    !== (job.terminalReceipt !== null)) {
    fail('PRODUCT_TERMINAL_JOB_RECEIPT_INVALID');
  }
}

function assertJobBinding(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>,
): void {
  if (job.tenantId !== authorization.scope.tenantId
    || job.userId !== authorization.scope.userId
    || job.projectId !== authorization.scope.projectId
    || job.budgetReservation?.reservationId !== reservation.reservationId
    || job.budgetReservation.bindingSha256 !== reservation.guardIdentitySha256) {
    fail('PRODUCT_TERMINAL_JOB_BUDGET_BINDING_MISMATCH');
  }
}

function assertCustomerChargeReceipt(
  value: Readonly<ProviderNativeProductCustomerChargeReceiptV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  spend: number,
  attempts: readonly string[],
): Readonly<ProviderNativeProductCustomerChargeReceiptV2R> {
  const candidate = createProviderNativeProductCustomerChargeReceiptV2R({
    authorization,
    actualProviderSpendNanoUsd: value.actualProviderSpendNanoUsd,
    providerAttemptReceiptSha256s: value.providerAttemptReceiptSha256s,
    chargedCentiCredits: value.chargedCentiCredits,
  });
  if (canonicalizeEditronJsonV1(value) !== canonicalizeEditronJsonV1(candidate)
    || candidate.actualProviderSpendNanoUsd !== spend
    || canonicalizeEditronJsonV1(candidate.providerAttemptReceiptSha256s)
      !== canonicalizeEditronJsonV1(attempts)) {
    fail('PRODUCT_CUSTOMER_CHARGE_RECEIPT_INVALID');
  }
  return candidate;
}

function settlementRequest(value: ProviderNativeProductBudgetSettlementV2R) {
  return { mode: value.mode, terminalDisposition: value.terminalDisposition,
    actualProviderSpendNanoUsd: value.actualProviderSpendNanoUsd,
    chargedCentiCredits: value.chargedCentiCredits,
    releasedCentiCredits: value.releasedCentiCredits,
    providerAttemptReceiptSha256s: value.providerAttemptReceiptSha256s,
    executionEvidence: value.executionEvidence,
    customerChargeComputationSha256: value.customerChargeComputationSha256 };
}

function completedDisposition(job: Readonly<DurableWorkflowJobSnapshotV1>) {
  if (job.status !== 'completed' || !job.terminalReceipt
    || job.terminalReceipt.disposition === 'CANCELLED') {
    return 'FAIL' as const;
  }
  return job.terminalReceipt.disposition;
}

function jobEvidence(job: Readonly<DurableWorkflowJobSnapshotV1>,
  kind: 'ACTUAL_USAGE_COMPLETE' | 'UNKNOWN_PROVIDER_RESULT' | 'NO_PROVIDER_DISPATCH',
  artifactSha256: string) {
  return { ownerId: 'DURABLE_WORKFLOW_JOB_STORE' as const,
    ownerVersion: DURABLE_WORKFLOW_JOB_VERSION_V1, jobId: job.jobId,
    kind, artifactSha256 };
}
function terminalArtifactSha256(job: Readonly<DurableWorkflowJobSnapshotV1>): string {
  if (job.terminalReceipt) return sha256(job.terminalReceipt.receiptSha256);
  return hashDurableWorkflowJobJsonV1({ version: DURABLE_WORKFLOW_JOB_VERSION_V1,
    jobId: job.jobId, status: job.status, error: job.error,
    resumeState: job.resumeState, budgetReservation: job.budgetReservation,
    updatedAt: job.updatedAt });
}
function conservativeSpend(usage: JsonRecord): number {
  return usage.conservativeReservedNanoUsd === undefined ? 0
    : nonNegativeInteger(usage.conservativeReservedNanoUsd,
      'TERMINAL_CONSERVATIVE_SPEND');
}
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}
function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('PRODUCT_SHA256_INVALID');
  }
  return value;
}
function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}
function fail(code: string): never { throw new Error(code); }
