import {
  PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R,
  type ProviderNativeAttemptAccountingModeV2R,
  type ProviderNativeDurableAttemptReceiptV2R,
} from './provider-native-durable-attempt-receipt-v2r';
import {
  normalizeStage25CostsV1,
  normalizeStage25ProviderAttemptsV1,
  normalizeStage25ProviderUsageV1,
  normalizeStage25StoredProviderAttemptsV1,
  reconcileStage25ProviderAccountingV1,
  type Stage25MachineTelemetryCostMetricsV1,
} from './stage25-machine-telemetry-accounting-v1';
import {
  deriveStage25CostPerAcceptedEditV1,
  normalizeStage25BlindReviewV1,
  normalizeStage25HardProofV1,
  normalizeStage25StoredAcceptanceV1,
  validateStage25CorrectionConsistencyV1,
  type Stage25AcceptanceV1,
  type Stage25AcceptedEditCostV1,
  type Stage25BlindReviewInputV1,
  type Stage25HardProofInputV1,
} from './stage25-machine-telemetry-acceptance-v1';
import {
  normalizeStage25DurationsV1,
  normalizeStage25RetryRepairV1,
  validateStage25TimelineEnvelopeV1,
  type Stage25DurationMetricsV1,
  type Stage25RetryRepairCountsV1,
} from './stage25-machine-telemetry-timing-v1';
import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export type {
  Stage25CostModeV1,
  Stage25MachineTelemetryCostMetricsV1,
  Stage25NanoUsdCostMetricV1,
  Stage25NanoUsdCostModeV1,
  Stage25SubscriptionCreditMetricV1,
  Stage25TelemetrySourceBindingV1,
} from './stage25-machine-telemetry-accounting-v1';
export type {
  Stage25AcceptedEditCostV1,
  Stage25BlindAcceptanceBindingV1,
  Stage25HardProofBindingV1,
} from './stage25-machine-telemetry-acceptance-v1';
export type {
  Stage25DurationKindV1,
  Stage25DurationMetricV1,
  Stage25MeasuredDurationSegmentV1,
  Stage25RetryRepairCountsV1,
} from './stage25-machine-telemetry-timing-v1';

export const STAGE25_MACHINE_TELEMETRY_RECEIPT_VERSION_V1 =
  'EDITRON_STAGE25_MACHINE_TELEMETRY_RECEIPT_V1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
type JsonRecord = Record<string, unknown>;

export interface Stage25ProviderAttemptBindingV1 {
  ownerVersion: typeof PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R;
  receiptSha256: string;
  previousAttemptReceiptSha256: string | null;
  turn: number;
  attemptOrdinal: number;
  accountingMode: ProviderNativeAttemptAccountingModeV2R;
  accountedOutputTokens: number | null;
  accountedCostNanoUsd: number | null;
  isUpperBound: boolean;
}
export type Stage25ProviderAccountingReconciliationV1 = Readonly<
  | { disposition: 'RECONCILED_PROVIDER_REPORTED_USAGE'; attemptReceiptSha256s: readonly string[];
      accountedOutputTokens: number; accountedCostNanoUsd: number; reason: null }
  | { disposition: 'UNAVAILABLE'; attemptReceiptSha256s: readonly string[];
      accountedOutputTokens: null; accountedCostNanoUsd: null; reason: string }
>;
export type Stage25ProviderUsageV1 = Readonly<
  | { disposition: 'PROVIDER_REPORTED_USAGE'; attemptReceiptSha256s: readonly string[];
      inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number;
      visibleOutputTokens: number; reasoningTokens: number; totalTokens: number;
      sourceReceiptSha256: string; reason: null }
  | { disposition: 'UNAVAILABLE'; attemptReceiptSha256s: readonly string[];
      inputTokens: null; cachedInputTokens: null; cacheWriteInputTokens: null;
      visibleOutputTokens: null; reasoningTokens: null; totalTokens: null;
      sourceReceiptSha256: null; reason: string }
>;

export interface Stage25MachineTelemetryReceiptV1 {
  version: typeof STAGE25_MACHINE_TELEMETRY_RECEIPT_VERSION_V1;
  authority: 'RESEARCH_TELEMETRY_AGGREGATOR_NO_ACCOUNTING_OR_PROOF_AUTHORITY';
  scope: Readonly<{
    cohortId: string; taskId: string; episodeId: string; candidateId: string; resultId: string;
  }>;
  artifactBindings: Readonly<{
    candidateSha256: string;
    resultSha256: string;
    proofSubjectFinalStateSha256: string;
  }>;
  providerAttempts: readonly Readonly<Stage25ProviderAttemptBindingV1>[];
  providerAccountingReconciliation: Stage25ProviderAccountingReconciliationV1;
  durations: Stage25DurationMetricsV1;
  providerUsage: Stage25ProviderUsageV1;
  costs: Readonly<Stage25MachineTelemetryCostMetricsV1>;
  retryRepair: Readonly<Stage25RetryRepairCountsV1>;
  acceptance: Readonly<Stage25AcceptanceV1>;
  costPerAcceptedEdit: Stage25AcceptedEditCostV1;
  issuedAt: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface Stage25MachineTelemetryInputV1 {
  scope: Stage25MachineTelemetryReceiptV1['scope'];
  artifactBindings: Stage25MachineTelemetryReceiptV1['artifactBindings'];
  providerAttemptReceipts: readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
  durations: Stage25DurationMetricsV1;
  providerUsage: Stage25ProviderUsageV1;
  costs: Stage25MachineTelemetryCostMetricsV1;
  retryRepair: Stage25RetryRepairCountsV1;
  hardProof: Stage25HardProofInputV1;
  blindReview: Stage25BlindReviewInputV1;
  issuedAt: string;
}

export function createStage25MachineTelemetryReceiptV1(
  input: Readonly<Stage25MachineTelemetryInputV1>,
): Readonly<Stage25MachineTelemetryReceiptV1> {
  const scope = normalizeScope(input.scope);
  const artifactBindings = normalizeArtifacts(input.artifactBindings);
  const providerAttempts = normalizeStage25ProviderAttemptsV1(
    input.providerAttemptReceipts,
    scope.episodeId,
  );
  const providerAccountingReconciliation = reconcileStage25ProviderAccountingV1(providerAttempts);
  const durations = normalizeStage25DurationsV1(input.durations);
  const providerUsage = normalizeStage25ProviderUsageV1(
    input.providerUsage,
    providerAccountingReconciliation,
  );
  const costs = normalizeStage25CostsV1(input.costs, providerAccountingReconciliation);
  const retryRepair = normalizeStage25RetryRepairV1(
    input.retryRepair,
    providerAttempts.length,
    durations,
  );
  const hardProof = normalizeStage25HardProofV1(
    input.hardProof,
    scope.episodeId,
    artifactBindings.proofSubjectFinalStateSha256,
  );
  const blindReview = normalizeStage25BlindReviewV1(
    input.blindReview,
    scope.taskId,
    scope.resultId,
    artifactBindings.resultSha256,
  );
  validateStage25CorrectionConsistencyV1(input.blindReview, durations.correction, retryRepair);
  const acceptance = { hardProof, blindReview };
  const costPerAcceptedEdit = deriveStage25CostPerAcceptedEditV1(acceptance, costs);
  const issuedAt = iso(input.issuedAt, 'ISSUED_AT');
  validateStage25TimelineEnvelopeV1(durations, issuedAt);
  const material = {
    version: STAGE25_MACHINE_TELEMETRY_RECEIPT_VERSION_V1,
    authority: 'RESEARCH_TELEMETRY_AGGREGATOR_NO_ACCOUNTING_OR_PROOF_AUTHORITY' as const,
    scope, artifactBindings, providerAttempts, providerAccountingReconciliation,
    durations, providerUsage, costs, retryRepair, acceptance, costPerAcceptedEdit,
    issuedAt, stateEffects: [] as const,
  };
  validateMaterial(material);
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25MachineTelemetryReceiptV1(
  value: unknown,
): asserts value is Readonly<Stage25MachineTelemetryReceiptV1> {
  const candidate = record(value, 'RECEIPT');
  const receiptSha256 = sha(candidate.receiptSha256, 'RECEIPT');
  const material = structuredClone(candidate);
  delete material.receiptSha256;
  if (candidate.version !== STAGE25_MACHINE_TELEMETRY_RECEIPT_VERSION_V1
    || candidate.authority !== 'RESEARCH_TELEMETRY_AGGREGATOR_NO_ACCOUNTING_OR_PROOF_AUTHORITY'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length
    || hashCanonicalJsonV1(material) !== receiptSha256) fail('RECEIPT_INVALID');
  validateMaterial(material as unknown as Omit<Stage25MachineTelemetryReceiptV1, 'receiptSha256'>);
}

function validateMaterial(
  value: Omit<Stage25MachineTelemetryReceiptV1, 'receiptSha256'>,
): void {
  const scope = normalizeScope(value.scope);
  const artifactBindings = normalizeArtifacts(value.artifactBindings);
  const providerAttempts = normalizeStage25StoredProviderAttemptsV1(value.providerAttempts);
  const providerAccountingReconciliation = reconcileStage25ProviderAccountingV1(providerAttempts);
  const durations = normalizeStage25DurationsV1(value.durations);
  const providerUsage = normalizeStage25ProviderUsageV1(
    value.providerUsage,
    providerAccountingReconciliation,
  );
  const costs = normalizeStage25CostsV1(value.costs, providerAccountingReconciliation);
  const retryRepair = normalizeStage25RetryRepairV1(
    value.retryRepair,
    providerAttempts.length,
    durations,
  );
  const acceptance = normalizeStage25StoredAcceptanceV1(
    value.acceptance,
    artifactBindings.proofSubjectFinalStateSha256,
    scope.resultId,
  );
  const costPerAcceptedEdit = deriveStage25CostPerAcceptedEditV1(acceptance, costs);
  const issuedAt = iso(value.issuedAt, 'ISSUED_AT');
  validateStage25TimelineEnvelopeV1(durations, issuedAt);
  const normalized = {
    scope, artifactBindings, providerAttempts, providerAccountingReconciliation,
    durations, providerUsage, costs, retryRepair, acceptance, costPerAcceptedEdit,
  };
  for (const [key, expected] of Object.entries(normalized)) {
    if (canonicalizeJsonV1(value[key as keyof typeof value]) !== canonicalizeJsonV1(expected)) {
      fail('MATERIAL_INVALID');
    }
  }
  if (!Array.isArray(value.stateEffects) || value.stateEffects.length) fail('MATERIAL_INVALID');
}

function normalizeScope(value: Stage25MachineTelemetryReceiptV1['scope']) {
  return {
    cohortId: identity(value.cohortId, 'COHORT_ID'), taskId: identity(value.taskId, 'TASK_ID'),
    episodeId: identity(value.episodeId, 'EPISODE_ID'), candidateId: identity(value.candidateId, 'CANDIDATE_ID'),
    resultId: identity(value.resultId, 'RESULT_ID'),
  };
}

function normalizeArtifacts(value: Stage25MachineTelemetryReceiptV1['artifactBindings']) {
  return {
    candidateSha256: sha(value.candidateSha256, 'CANDIDATE'),
    resultSha256: sha(value.resultSha256, 'RESULT'),
    proofSubjectFinalStateSha256: sha(value.proofSubjectFinalStateSha256, 'PROOF_SUBJECT_FINAL_STATE'),
  };
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}
function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) fail(`${label}_INVALID`);
  return value;
}
function sha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_HASH_INVALID`);
  return value;
}
function iso(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  try { if (new Date(value).toISOString() !== value) fail(`${label}_INVALID`); }
  catch { fail(`${label}_INVALID`); }
  return value;
}
function fail(code: string): never { throw new Error(`STAGE25_MACHINE_TELEMETRY_${code}`); }
