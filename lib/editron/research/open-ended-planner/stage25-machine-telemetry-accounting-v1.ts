import {
  assertProviderNativeDurableAttemptReceiptV2R,
  PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R,
  type ProviderNativeAttemptAccountingModeV2R,
  type ProviderNativeDurableAttemptReceiptV2R,
} from './provider-native-durable-attempt-receipt-v2r';
import type {
  Stage25ProviderAccountingReconciliationV1,
  Stage25ProviderAttemptBindingV1,
  Stage25ProviderUsageV1,
} from './stage25-machine-telemetry-receipt-v1';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R }
  from '@/lib/editron/services/provider-native-product-budget-v2r';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R }
  from '@/lib/editron/services/provider-native-product-budget-credits-owner-v2r';

const SHA256 = /^[a-f0-9]{64}$/;
export const STAGE25_ACCEPTED_COST_COMPONENTS_V1 = [
  'FROZEN_PRICE_ESTIMATE', 'RENDER_COST', 'STORAGE_COST', 'EGRESS_COST', 'HUMAN_COST',
] as const;
type JsonRecord = Record<string, unknown>;
type AcceptedCostMode = typeof STAGE25_ACCEPTED_COST_COMPONENTS_V1[number];
export type Stage25CostModeV1 = AcceptedCostMode | 'BUDGET_RESERVATION' | 'SUBSCRIPTION_CREDIT';
export type Stage25NanoUsdCostModeV1 = Exclude<Stage25CostModeV1, 'SUBSCRIPTION_CREDIT'>;

export interface Stage25TelemetrySourceBindingV1 {
  ownerId: string; ownerVersion: string; receiptSha256: string; allocationSha256: string;
}

export type Stage25NanoUsdCostMetricV1<M extends Stage25NanoUsdCostModeV1> = Readonly<
  | { mode: M; disposition: 'AVAILABLE'; unit: 'NANO_USD'; amount: number;
      source: Readonly<Stage25TelemetrySourceBindingV1>; reason: null }
  | { mode: M; disposition: 'UNAVAILABLE'; unit: 'NANO_USD'; amount: null;
      source: null; reason: string }
>;
export type Stage25SubscriptionCreditMetricV1 = Readonly<
  | { mode: 'SUBSCRIPTION_CREDIT'; disposition: 'AVAILABLE'; unit: 'CENTICREDIT'; amount: number;
      source: Readonly<Stage25TelemetrySourceBindingV1>; reason: null }
  | { mode: 'SUBSCRIPTION_CREDIT'; disposition: 'UNAVAILABLE'; unit: 'CENTICREDIT';
      amount: null; source: null; reason: string }
>;
export interface Stage25MachineTelemetryCostMetricsV1 {
  frozenPriceEstimate: Stage25NanoUsdCostMetricV1<'FROZEN_PRICE_ESTIMATE'>;
  reservation: Stage25NanoUsdCostMetricV1<'BUDGET_RESERVATION'>;
  subscriptionCredit: Stage25SubscriptionCreditMetricV1;
  render: Stage25NanoUsdCostMetricV1<'RENDER_COST'>;
  storage: Stage25NanoUsdCostMetricV1<'STORAGE_COST'>;
  egress: Stage25NanoUsdCostMetricV1<'EGRESS_COST'>;
  human: Stage25NanoUsdCostMetricV1<'HUMAN_COST'>;
}
export function normalizeStage25ProviderAttemptsV1(
  values: readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[], episodeId: string,
): Stage25ProviderAttemptBindingV1[] {
  return normalizeStage25StoredProviderAttemptsV1(values.map((value) => {
    const receipt = assertProviderNativeDurableAttemptReceiptV2R(value);
    if (receipt.scope.episodeId !== episodeId) fail('PROVIDER_ATTEMPT_SCOPE_MISMATCH');
    return {
      ownerVersion: PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R,
      receiptSha256: receipt.receiptSha256,
      previousAttemptReceiptSha256: receipt.previousAttemptReceiptSha256,
      turn: receipt.attempt.turn,
      attemptOrdinal: receipt.attempt.attemptOrdinal, accountingMode: receipt.accounting.mode,
      accountedOutputTokens: receipt.accounting.accountedOutputTokens,
      accountedCostNanoUsd: receipt.accounting.accountedCostNanoUsd,
      isUpperBound: receipt.accounting.isUpperBound,
    };
  }));
}

export function normalizeStage25StoredProviderAttemptsV1(value: unknown) {
  if (!Array.isArray(value)) fail('PROVIDER_ATTEMPTS_INVALID');
  const result: Stage25ProviderAttemptBindingV1[] = value.map((raw) => {
    const item = record(raw, 'PROVIDER_ATTEMPT');
    if (item.ownerVersion !== PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R) {
      fail('PROVIDER_ATTEMPT_OWNER_INVALID');
    }
    const normalized = {
      ownerVersion: PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R,
      receiptSha256: sha(item.receiptSha256, 'PROVIDER_ATTEMPT_RECEIPT'),
      previousAttemptReceiptSha256: nullableSha(
        item.previousAttemptReceiptSha256,
        'PROVIDER_PREVIOUS_ATTEMPT_RECEIPT',
      ),
      turn: positiveInteger(item.turn, 'PROVIDER_ATTEMPT_TURN'),
      attemptOrdinal: positiveInteger(item.attemptOrdinal, 'PROVIDER_ATTEMPT_ORDINAL'),
      accountingMode: accountingMode(item.accountingMode),
      accountedOutputTokens: nullableNonNegative(item.accountedOutputTokens, 'ACCOUNTED_OUTPUT_TOKENS'),
      accountedCostNanoUsd: nullableNonNegative(item.accountedCostNanoUsd, 'ACCOUNTED_COST'),
      isUpperBound: boolean(item.isUpperBound, 'ACCOUNTING_UPPER_BOUND'),
    };
    assertAttemptAccountingShape(normalized);
    return normalized;
  });
  unique(result.map(({ receiptSha256 }) => receiptSha256), 'PROVIDER_ATTEMPT_RECEIPT');
  if (result.length
    && (result[0].attemptOrdinal !== 1 || result[0].previousAttemptReceiptSha256 !== null)) {
    fail('PROVIDER_ATTEMPT_CHAIN_INVALID');
  }
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].attemptOrdinal !== result[index - 1].attemptOrdinal + 1
      || result[index].turn < result[index - 1].turn
      || result[index].previousAttemptReceiptSha256 !== result[index - 1].receiptSha256) {
      fail('PROVIDER_ATTEMPT_CHAIN_INVALID');
    }
  }
  return result;
}

export function reconcileStage25ProviderAccountingV1(
  attempts: readonly Stage25ProviderAttemptBindingV1[],
): Stage25ProviderAccountingReconciliationV1 {
  const hashes = attempts.map(({ receiptSha256 }) => receiptSha256);
  const unavailable = (reason: string): Stage25ProviderAccountingReconciliationV1 => ({
    disposition: 'UNAVAILABLE', attemptReceiptSha256s: hashes,
    accountedOutputTokens: null, accountedCostNanoUsd: null, reason,
  });
  if (!attempts.length) return unavailable('No durable provider-attempt receipt exists.');
  if (attempts.some((attempt) => attempt.accountingMode !== 'PROVIDER_REPORTED_USAGE'
    || attempt.isUpperBound || attempt.accountedOutputTokens === null
    || attempt.accountedCostNanoUsd === null)) {
    return unavailable('One or more durable attempts lack final provider-reported accounting.');
  }
  return {
    disposition: 'RECONCILED_PROVIDER_REPORTED_USAGE', attemptReceiptSha256s: hashes,
    accountedOutputTokens: safeSum(attempts.map((item) => item.accountedOutputTokens as number), 'ACCOUNTED_OUTPUT_TOKENS'),
    accountedCostNanoUsd: safeSum(attempts.map((item) => item.accountedCostNanoUsd as number), 'ACCOUNTED_COST'),
    reason: null,
  };
}

export function normalizeStage25ProviderUsageV1(
  value: unknown, reconciliation: Stage25ProviderAccountingReconciliationV1,
): Stage25ProviderUsageV1 {
  const usage = record(value, 'PROVIDER_USAGE');
  const hashes = hashList(usage.attemptReceiptSha256s, 'PROVIDER_USAGE_ATTEMPT');
  if (!sameStrings(hashes, reconciliation.attemptReceiptSha256s)) {
    fail('PROVIDER_USAGE_ATTEMPT_BINDING_INVALID');
  }
  if (usage.disposition === 'UNAVAILABLE') {
    const nullFields = ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens',
      'visibleOutputTokens', 'reasoningTokens', 'totalTokens', 'sourceReceiptSha256'] as const;
    if (nullFields.some((field) => usage[field] !== null) || !requiredText(usage.reason)) {
      fail('PROVIDER_USAGE_UNAVAILABLE_INVALID');
    }
    return { disposition: 'UNAVAILABLE', attemptReceiptSha256s: hashes,
      inputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null,
      visibleOutputTokens: null, reasoningTokens: null, totalTokens: null,
      sourceReceiptSha256: null, reason: usage.reason as string };
  }
  if (usage.disposition !== 'PROVIDER_REPORTED_USAGE' || usage.reason !== null
    || reconciliation.disposition !== 'RECONCILED_PROVIDER_REPORTED_USAGE') {
    fail('PROVIDER_USAGE_UNRECONCILED');
  }
  const normalized = { disposition: 'PROVIDER_REPORTED_USAGE' as const,
    attemptReceiptSha256s: hashes,
    inputTokens: nonNegative(usage.inputTokens, 'PROVIDER_INPUT_TOKENS'),
    cachedInputTokens: nonNegative(usage.cachedInputTokens, 'PROVIDER_CACHED_INPUT_TOKENS'),
    cacheWriteInputTokens: nonNegative(usage.cacheWriteInputTokens, 'PROVIDER_CACHE_WRITE_TOKENS'),
    visibleOutputTokens: nonNegative(usage.visibleOutputTokens, 'PROVIDER_VISIBLE_OUTPUT_TOKENS'),
    reasoningTokens: nonNegative(usage.reasoningTokens, 'PROVIDER_REASONING_TOKENS'),
    totalTokens: nonNegative(usage.totalTokens, 'PROVIDER_TOTAL_TOKENS'),
    sourceReceiptSha256: sha(usage.sourceReceiptSha256, 'PROVIDER_USAGE_SOURCE'), reason: null };
  if (normalized.cachedInputTokens + normalized.cacheWriteInputTokens > normalized.inputTokens
    || normalized.totalTokens !== normalized.inputTokens + normalized.visibleOutputTokens
      + normalized.reasoningTokens
    || normalized.visibleOutputTokens + normalized.reasoningTokens
      !== reconciliation.accountedOutputTokens) fail('PROVIDER_USAGE_ARITHMETIC_INVALID');
  return normalized;
}

export function normalizeStage25CostsV1(
  value: unknown, reconciliation: Stage25ProviderAccountingReconciliationV1,
): Stage25MachineTelemetryCostMetricsV1 {
  const input = record(value, 'COSTS');
  exactKeys(input, ['frozenPriceEstimate', 'reservation', 'subscriptionCredit', 'render', 'storage', 'egress', 'human'], 'COSTS');
  const costs = {
    frozenPriceEstimate: normalizeNano(input.frozenPriceEstimate, 'FROZEN_PRICE_ESTIMATE'),
    reservation: normalizeNano(input.reservation, 'BUDGET_RESERVATION'),
    subscriptionCredit: normalizeCredit(input.subscriptionCredit),
    render: normalizeNano(input.render, 'RENDER_COST'), storage: normalizeNano(input.storage, 'STORAGE_COST'),
    egress: normalizeNano(input.egress, 'EGRESS_COST'), human: normalizeNano(input.human, 'HUMAN_COST'),
  };
  if (costs.frozenPriceEstimate.disposition === 'AVAILABLE'
    && (reconciliation.disposition !== 'RECONCILED_PROVIDER_REPORTED_USAGE'
      || costs.frozenPriceEstimate.amount !== reconciliation.accountedCostNanoUsd)) {
    fail('FROZEN_PRICE_ESTIMATE_RECONCILIATION_INVALID');
  }
  if (costs.reservation.disposition === 'AVAILABLE'
    && costs.reservation.source.ownerVersion !== PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R) {
    fail('BUDGET_RESERVATION_OWNER_VERSION_INVALID');
  }
  if (costs.subscriptionCredit.disposition === 'AVAILABLE'
    && costs.subscriptionCredit.source.ownerVersion !== PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_RECORD_VERSION_V2R) {
    fail('SUBSCRIPTION_CREDIT_OWNER_VERSION_INVALID');
  }
  unique(STAGE25_ACCEPTED_COST_COMPONENTS_V1.map((mode) => costByMode(costs, mode))
    .filter((metric) => metric.disposition === 'AVAILABLE')
    .map((metric) => metric.source?.allocationSha256 as string), 'COST_ALLOCATION');
  return costs;
}

export function costByMode(costs: Stage25MachineTelemetryCostMetricsV1, mode: AcceptedCostMode) {
  if (mode === 'FROZEN_PRICE_ESTIMATE') return costs.frozenPriceEstimate;
  if (mode === 'RENDER_COST') return costs.render;
  if (mode === 'STORAGE_COST') return costs.storage;
  if (mode === 'EGRESS_COST') return costs.egress;
  return costs.human;
}

function normalizeNano<M extends Stage25NanoUsdCostModeV1>(value: unknown, mode: M): Stage25NanoUsdCostMetricV1<M> {
  const metric = record(value, `COST_${mode}`);
  if (metric.mode !== mode || metric.unit !== 'NANO_USD') fail(`COST_${mode}_MODE_INVALID`);
  if (metric.disposition === 'UNAVAILABLE') {
    if (metric.amount !== null || metric.source !== null || !requiredText(metric.reason)) fail(`COST_${mode}_UNAVAILABLE_INVALID`);
    return { mode, disposition: 'UNAVAILABLE', unit: 'NANO_USD', amount: null, source: null, reason: metric.reason as string };
  }
  if (metric.disposition !== 'AVAILABLE' || metric.reason !== null) fail(`COST_${mode}_INVALID`);
  return { mode, disposition: 'AVAILABLE', unit: 'NANO_USD', amount: nonNegative(metric.amount, `COST_${mode}_AMOUNT`),
    source: normalizeSource(metric.source, `COST_${mode}`), reason: null };
}

function normalizeCredit(value: unknown): Stage25SubscriptionCreditMetricV1 {
  const metric = record(value, 'COST_SUBSCRIPTION_CREDIT');
  if (metric.mode !== 'SUBSCRIPTION_CREDIT' || metric.unit !== 'CENTICREDIT') fail('COST_SUBSCRIPTION_CREDIT_MODE_INVALID');
  if (metric.disposition === 'UNAVAILABLE') {
    if (metric.amount !== null || metric.source !== null || !requiredText(metric.reason)) fail('COST_SUBSCRIPTION_CREDIT_UNAVAILABLE_INVALID');
    return { mode: 'SUBSCRIPTION_CREDIT', disposition: 'UNAVAILABLE', unit: 'CENTICREDIT', amount: null, source: null, reason: metric.reason as string };
  }
  if (metric.disposition !== 'AVAILABLE' || metric.reason !== null) fail('COST_SUBSCRIPTION_CREDIT_INVALID');
  return { mode: 'SUBSCRIPTION_CREDIT', disposition: 'AVAILABLE', unit: 'CENTICREDIT',
    amount: nonNegative(metric.amount, 'COST_SUBSCRIPTION_CREDIT_AMOUNT'),
    source: normalizeSource(metric.source, 'COST_SUBSCRIPTION_CREDIT'), reason: null };
}

function normalizeSource(value: unknown, label: string): Stage25TelemetrySourceBindingV1 {
  const source = record(value, `${label}_SOURCE`);
  return { ownerId: identity(source.ownerId, `${label}_OWNER_ID`), ownerVersion: identity(source.ownerVersion, `${label}_OWNER_VERSION`),
    receiptSha256: sha(source.receiptSha256, `${label}_RECEIPT`), allocationSha256: sha(source.allocationSha256, `${label}_ALLOCATION`) };
}

function accountingMode(value: unknown): ProviderNativeAttemptAccountingModeV2R {
  if (value !== 'PROVIDER_REPORTED_USAGE' && value !== 'CONSERVATIVE_WORST_CASE_RESERVATION'
    && value !== 'ACCOUNTING_UNRESOLVED') fail('ACCOUNTING_MODE_INVALID');
  return value;
}
function assertAttemptAccountingShape(value: Stage25ProviderAttemptBindingV1): void {
  const hasTotals = value.accountedOutputTokens !== null && value.accountedCostNanoUsd !== null;
  if ((value.accountingMode === 'PROVIDER_REPORTED_USAGE' && (!hasTotals || value.isUpperBound))
    || (value.accountingMode === 'CONSERVATIVE_WORST_CASE_RESERVATION'
      && (!hasTotals || !value.isUpperBound))
    || (value.accountingMode === 'ACCOUNTING_UNRESOLVED'
      && (hasTotals || value.accountedOutputTokens !== null
        || value.accountedCostNanoUsd !== null || value.isUpperBound))) {
    fail('PROVIDER_ATTEMPT_ACCOUNTING_INVALID');
  }
}
function hashList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) fail(`${label}_HASHES_INVALID`);
  const hashes = value.map((item) => sha(item, label)); unique(hashes, label); return hashes;
}
function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function exactKeys(value: JsonRecord, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label}_FIELDS_INVALID`);
}
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`); return value as JsonRecord;
}
function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) fail(`${label}_INVALID`); return value;
}
function sha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_HASH_INVALID`); return value;
}
function nullableSha(value: unknown, label: string): string | null {
  return value === null ? null : sha(value, label);
}
function boolean(value: unknown, label: string): boolean { if (typeof value !== 'boolean') fail(`${label}_INVALID`); return value; }
function nullableNonNegative(value: unknown, label: string): number | null { return value === null ? null : nonNegative(value, label); }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`); return Number(value); }
function positiveInteger(value: unknown, label: string): number { const result = nonNegative(value, label); if (!result) fail(`${label}_INVALID`); return result; }
function safeSum(values: readonly number[], label: string): number { const total = values.reduce((sum, value) => sum + value, 0); if (!Number.isSafeInteger(total) || total < 0) fail(`${label}_OVERFLOW`); return total; }
function unique(values: readonly string[], label: string): void { if (new Set(values).size !== values.length) fail(`${label}_DUPLICATE`); }
function requiredText(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) && value.length <= 2_000; }
function fail(code: string): never { throw new Error(`STAGE25_MACHINE_TELEMETRY_${code}`); }
