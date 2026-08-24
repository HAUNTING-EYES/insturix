import {
  assertBlindQualityReviewReceiptV1,
  BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1,
  type BlindQualityReviewReceiptV1,
} from './blind-quality-review-receipt-v1';
import {
  assertProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
  type ProviderNativeExecutionBoundOutcomeProofReceiptV2R,
} from './provider-native-durable-outcome-proof-v2r';
import {
  costByMode,
  STAGE25_ACCEPTED_COST_COMPONENTS_V1,
  type Stage25MachineTelemetryCostMetricsV1,
} from './stage25-machine-telemetry-accounting-v1';
import type {
  Stage25DurationMetricV1,
  Stage25RetryRepairCountsV1,
} from './stage25-machine-telemetry-timing-v1';

const SHA256 = /^[a-f0-9]{64}$/;
type JsonRecord = Record<string, unknown>;

export type Stage25HardProofInputV1 = Readonly<
  | { receipt: Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R>; reason: null }
  | { receipt: null; reason: string }
>;
export type Stage25BlindReviewInputV1 = Readonly<
  | { receipt: Readonly<BlindQualityReviewReceiptV1>; resultId: string; reason: null }
  | { receipt: null; resultId: null; reason: string }
>;
export type Stage25HardProofBindingV1 = Readonly<
  | { disposition: 'BOUND';
      ownerVersion: typeof PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R;
      receiptSha256: string; proofSubjectFinalStateSha256: string;
      proofDisposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE'; reason: null }
  | { disposition: 'UNAVAILABLE';
      ownerVersion: typeof PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R;
      receiptSha256: null; proofSubjectFinalStateSha256: null;
      proofDisposition: null; reason: string }
>;
export type Stage25BlindAcceptanceBindingV1 = Readonly<
  | { disposition: 'BOUND'; ownerVersion: typeof BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1;
      receiptSha256: string; resultId: string;
      decision: 'PASS' | 'PARTIAL' | 'FAIL' | 'UNVERIFIABLE'; reason: null }
  | { disposition: 'UNAVAILABLE'; ownerVersion: typeof BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1;
      receiptSha256: null; resultId: null; decision: null; reason: string }
>;
export interface Stage25AcceptanceV1 {
  hardProof: Stage25HardProofBindingV1;
  blindReview: Stage25BlindAcceptanceBindingV1;
}
export type Stage25AcceptedEditCostV1 = Readonly<
  | { disposition: 'RESEARCH_ESTIMATE_AVAILABLE'; amountNanoUsd: number;
      includedModes: typeof STAGE25_ACCEPTED_COST_COMPONENTS_V1;
      invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE'; reason: null }
  | { disposition: 'UNAVAILABLE'; amountNanoUsd: null; includedModes: readonly [];
      invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE'; reason: string }
>;

export function normalizeStage25HardProofV1(
  value: Stage25HardProofInputV1,
  episodeId: string,
  expectedFinalStateSha256: string,
): Stage25HardProofBindingV1 {
  if (value.receipt === null) {
    if (!requiredText(value.reason)) fail('HARD_PROOF_UNAVAILABLE_REASON_REQUIRED');
    return { disposition: 'UNAVAILABLE',
      ownerVersion: PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
      receiptSha256: null, proofSubjectFinalStateSha256: null,
      proofDisposition: null, reason: value.reason };
  }
  if (value.reason !== null) fail('HARD_PROOF_REASON_INVALID');
  const receipt = assertProviderNativeExecutionBoundOutcomeProofReceiptV2R(value.receipt);
  if (receipt.scope.episodeId !== episodeId) fail('HARD_PROOF_SCOPE_MISMATCH');
  if (receipt.subject.finalStateSha256 !== expectedFinalStateSha256) {
    fail('HARD_PROOF_FINAL_STATE_MISMATCH');
  }
  return { disposition: 'BOUND',
    ownerVersion: PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
    receiptSha256: receipt.receiptSha256,
    proofSubjectFinalStateSha256: receipt.subject.finalStateSha256,
    proofDisposition: receipt.disposition, reason: null };
}

export function normalizeStage25BlindReviewV1(
  value: Stage25BlindReviewInputV1,
  taskId: string,
  resultId: string,
  resultSha256: string,
): Stage25BlindAcceptanceBindingV1 {
  if (value.receipt === null) {
    if (value.resultId !== null || !requiredText(value.reason)) fail('BLIND_REVIEW_UNAVAILABLE_INVALID');
    return { disposition: 'UNAVAILABLE', ownerVersion: BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1,
      receiptSha256: null, resultId: null, decision: null, reason: value.reason };
  }
  if (value.reason !== null || value.resultId !== resultId) fail('BLIND_REVIEW_BINDING_INVALID');
  assertBlindQualityReviewReceiptV1(value.receipt);
  const binding = value.receipt.resultBindings.find(({ artifactId }) => artifactId === resultId);
  const review = value.receipt.resultReviews.find((item) => item.resultId === resultId);
  if (value.receipt.taskId !== taskId || !binding || binding.sha256 !== resultSha256 || !review) {
    fail('BLIND_REVIEW_BINDING_INVALID');
  }
  return { disposition: 'BOUND', ownerVersion: BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1,
    receiptSha256: value.receipt.receiptHash, resultId,
    decision: review.decision, reason: null };
}

export function normalizeStage25StoredAcceptanceV1(
  value: unknown,
  expectedFinalStateSha256: string,
  expectedResultId: string,
): Stage25AcceptanceV1 {
  const input = record(value, 'ACCEPTANCE');
  exactKeys(input, ['hardProof', 'blindReview'], 'ACCEPTANCE');
  const hard = record(input.hardProof, 'HARD_PROOF');
  const blind = record(input.blindReview, 'BLIND_REVIEW');
  const hardProof = hard.disposition === 'BOUND'
    ? normalizeStoredBoundProof(hard, expectedFinalStateSha256) : unavailableHardProof(hard);
  const blindReview = blind.disposition === 'BOUND'
    ? normalizeStoredBoundReview(blind, expectedResultId) : unavailableBlindReview(blind);
  return { hardProof, blindReview };
}

export function deriveStage25CostPerAcceptedEditV1(
  acceptance: Stage25AcceptanceV1,
  costs: Stage25MachineTelemetryCostMetricsV1,
): Stage25AcceptedEditCostV1 {
  const unavailable = (reason: string): Stage25AcceptedEditCostV1 => ({
    disposition: 'UNAVAILABLE', amountNanoUsd: null, includedModes: [],
    invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE', reason,
  });
  if (acceptance.hardProof.disposition !== 'BOUND'
    || acceptance.hardProof.proofDisposition !== 'PASS') {
    return unavailable('Hard proof has not passed for this final state.');
  }
  if (acceptance.blindReview.disposition !== 'BOUND'
    || acceptance.blindReview.decision !== 'PASS') {
    return unavailable('Blind review has not accepted this result.');
  }
  const components = STAGE25_ACCEPTED_COST_COMPONENTS_V1.map((mode) => costByMode(costs, mode));
  if (components.some(({ disposition }) => disposition !== 'AVAILABLE')) {
    return unavailable('One or more accepted-edit cost components are unavailable.');
  }
  return { disposition: 'RESEARCH_ESTIMATE_AVAILABLE',
    amountNanoUsd: safeSum(components.map((metric) => metric.amount as number)),
    includedModes: STAGE25_ACCEPTED_COST_COMPONENTS_V1,
    invoiceReconciliation: 'NOT_PERFORMED_NOT_AN_INVOICE', reason: null };
}

export function validateStage25CorrectionConsistencyV1(
  blindInput: Stage25BlindReviewInputV1,
  duration: Stage25DurationMetricV1,
  counts: Stage25RetryRepairCountsV1,
): void {
  if (blindInput.receipt === null) return;
  const review = blindInput.receipt.resultReviews.find(({ resultId }) => resultId === blindInput.resultId);
  if (!review) fail('BLIND_CORRECTION_REVIEW_MISSING');
  if (review.correction.status === 'MEASURED_HANDS_ON') {
    if (duration.disposition !== 'MEASURED'
      || duration.durationMilliseconds !== review.correction.durationMilliseconds
      || counts.humanCorrectionCount < 1) fail('BLIND_CORRECTION_TELEMETRY_MISMATCH');
  } else if (duration.disposition === 'MEASURED' || counts.humanCorrectionCount !== 0) {
    fail('BLIND_CORRECTION_TELEMETRY_MISMATCH');
  }
}

function normalizeStoredBoundProof(
  value: JsonRecord,
  expectedFinalStateSha256: string,
): Stage25HardProofBindingV1 {
  const finalState = sha(value.proofSubjectFinalStateSha256, 'HARD_PROOF_FINAL_STATE');
  if (finalState !== expectedFinalStateSha256) fail('HARD_PROOF_FINAL_STATE_MISMATCH');
  return { disposition: 'BOUND',
    ownerVersion: exact(value.ownerVersion, PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R, 'HARD_PROOF_OWNER'),
    receiptSha256: sha(value.receiptSha256, 'HARD_PROOF_RECEIPT'),
    proofSubjectFinalStateSha256: finalState,
    proofDisposition: proofDisposition(value.proofDisposition),
    reason: exact(value.reason, null, 'HARD_PROOF_REASON') };
}

function unavailableHardProof(value: JsonRecord): Stage25HardProofBindingV1 {
  if (value.disposition !== 'UNAVAILABLE'
    || value.ownerVersion !== PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R
    || value.receiptSha256 !== null || value.proofSubjectFinalStateSha256 !== null
    || value.proofDisposition !== null || !requiredText(value.reason)) {
    fail('HARD_PROOF_UNAVAILABLE_INVALID');
  }
  return { disposition: 'UNAVAILABLE',
    ownerVersion: PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
    receiptSha256: null, proofSubjectFinalStateSha256: null,
    proofDisposition: null, reason: value.reason as string };
}

function normalizeStoredBoundReview(
  value: JsonRecord,
  expectedResultId: string,
): Stage25BlindAcceptanceBindingV1 {
  const resultId = identity(value.resultId, 'BLIND_REVIEW_RESULT_ID');
  if (resultId !== expectedResultId) fail('BLIND_REVIEW_BINDING_INVALID');
  return { disposition: 'BOUND',
    ownerVersion: exact(value.ownerVersion, BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1, 'BLIND_REVIEW_OWNER'),
    receiptSha256: sha(value.receiptSha256, 'BLIND_REVIEW_RECEIPT'), resultId,
    decision: blindDecision(value.decision),
    reason: exact(value.reason, null, 'BLIND_REVIEW_REASON') };
}

function unavailableBlindReview(value: JsonRecord): Stage25BlindAcceptanceBindingV1 {
  if (value.disposition !== 'UNAVAILABLE' || value.ownerVersion !== BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1
    || value.receiptSha256 !== null || value.resultId !== null || value.decision !== null
    || !requiredText(value.reason)) fail('BLIND_REVIEW_UNAVAILABLE_INVALID');
  return { disposition: 'UNAVAILABLE', ownerVersion: BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1,
    receiptSha256: null, resultId: null, decision: null, reason: value.reason as string };
}

function proofDisposition(value: unknown): 'PASS' | 'FAIL' | 'UNVERIFIABLE' {
  if (value !== 'PASS' && value !== 'FAIL' && value !== 'UNVERIFIABLE') fail('HARD_PROOF_DISPOSITION_INVALID');
  return value;
}
function blindDecision(value: unknown): 'PASS' | 'PARTIAL' | 'FAIL' | 'UNVERIFIABLE' {
  if (value !== 'PASS' && value !== 'PARTIAL' && value !== 'FAIL' && value !== 'UNVERIFIABLE') fail('BLIND_REVIEW_DECISION_INVALID');
  return value;
}
function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label}_FIELDS_INVALID`);
}
function exact<T>(value: unknown, expected: T, label: string): T { if (value !== expected) fail(`${label}_INVALID`); return expected; }
function record(value: unknown, label: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`); return value as JsonRecord; }
function identity(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) fail(`${label}_INVALID`); return value; }
function sha(value: unknown, label: string): string { if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_HASH_INVALID`); return value; }
function safeSum(values: readonly number[]): number { const total = values.reduce((sum, value) => sum + value, 0); if (!Number.isSafeInteger(total) || total < 0) fail('ACCEPTED_EDIT_COST_OVERFLOW'); return total; }
function requiredText(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) && value.length <= 2_000; }
function fail(code: string): never { throw new Error(`STAGE25_MACHINE_TELEMETRY_${code}`); }
