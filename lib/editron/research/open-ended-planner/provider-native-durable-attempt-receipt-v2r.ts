import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeRouteV2R } from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_V2R_1' as const;
export type ProviderNativeAttemptAccountingModeV2R = 'PROVIDER_REPORTED_USAGE'
  | 'CONSERVATIVE_WORST_CASE_RESERVATION'
  | 'ACCOUNTING_UNRESOLVED';
export type ProviderNativeAttemptRetryDispositionV2R = 'RETRY_SAFE_AFTER_DURABLE_COMMIT'
  | 'NO_RETRY_TERMINAL'
  | 'NEVER_RETRY_ACCOUNTING_UNVERIFIABLE';
export type ProviderNativeAttemptResultV2R = Readonly<
  | {
      kind: 'RESPONSE_RECEIVED';
      responseStatus: number;
      responseSha256: string;
      providerRequestId: string | null;
    }
  | {
      kind: 'TRANSPORT_RESULT_UNAVAILABLE';
      transportErrorCode: string;
      errorSha256: string;
  }
>;
export interface ProviderNativeDurableAttemptReceiptV2R {
  version: typeof PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R;
  authority: 'RESEARCH_DURABLE_PROVIDER_ATTEMPT_ACCOUNTING_NO_PROJECT_MUTATION';
  scope: Readonly<{
    episodeId: string;
    contextSha256: string;
    toolSetSha256: string;
    routeSha256: string;
  }>;
  attempt: Readonly<{
    turn: number;
    attemptOrdinal: number;
    requestHash: string;
    maxOutputTokens: number;
  }>;
  result: ProviderNativeAttemptResultV2R;
  accounting: Readonly<{
    mode: ProviderNativeAttemptAccountingModeV2R;
    accountedCostNanoUsd: number | null;
    accountedOutputTokens: number | null;
    isUpperBound: boolean;
    runtimeGuardAudit: readonly Readonly<JsonRecord>[];
    runtimeGuardAuditSha256: string;
  }>;
  retryDisposition: ProviderNativeAttemptRetryDispositionV2R;
  previousAttemptReceiptSha256: string | null;
  occurredAt: string;
  receiptSha256: string;
}

export function createProviderNativeDurableAttemptReceiptV2R(input: Readonly<{
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  turn: number;
  requestHash: string;
  maxOutputTokens: number;
  result: ProviderNativeAttemptResultV2R;
  accounting: Readonly<{
    mode: ProviderNativeAttemptAccountingModeV2R;
    accountedCostNanoUsd: number | null;
    accountedOutputTokens: number | null;
    isUpperBound: boolean;
    runtimeGuardAudit: readonly Readonly<JsonRecord>[];
  }>;
  retryDisposition: ProviderNativeAttemptRetryDispositionV2R;
  occurredAt: string;
  previousAttempt?: Readonly<ProviderNativeDurableAttemptReceiptV2R>;
}>): Readonly<ProviderNativeDurableAttemptReceiptV2R> {
  const scope = {
    episodeId: identity(input.episodeId, 'EPISODE_ID'),
    contextSha256: sha256(input.contextSha256, 'CONTEXT'),
    toolSetSha256: sha256(input.toolSetSha256, 'TOOL_SET'),
    routeSha256: hashCanonicalJsonV1(input.route),
  };
  assertRoute(input.route);
  const previousAttempt = input.previousAttempt
    ? assertProviderNativeDurableAttemptReceiptV2R(input.previousAttempt)
    : undefined;
  if (previousAttempt
    && canonicalizeJsonV1(previousAttempt.scope) !== canonicalizeJsonV1(scope)) {
    fail('ATTEMPT_CHAIN_SCOPE_MISMATCH');
  }
  const attempt = {
    turn: positiveInteger(input.turn, 'TURN'),
    attemptOrdinal: previousAttempt ? previousAttempt.attempt.attemptOrdinal + 1 : 1,
    requestHash: sha256(input.requestHash, 'REQUEST'),
    maxOutputTokens: positiveInteger(input.maxOutputTokens, 'MAX_OUTPUT_TOKENS'),
  };
  if (previousAttempt && previousAttempt.attempt.turn > attempt.turn) {
    fail('ATTEMPT_CHAIN_TURN_REGRESSION');
  }
  const result = normalizeResult(input.result);
  const runtimeGuardAudit = input.accounting.runtimeGuardAudit.map((event) => ({
    ...record(event, 'RUNTIME_GUARD_EVENT'),
  }));
  if (!runtimeGuardAudit.length) fail('RUNTIME_GUARD_AUDIT_EMPTY');
  const accounting = {
    mode: input.accounting.mode,
    accountedCostNanoUsd: nullableNonNegativeInteger(
      input.accounting.accountedCostNanoUsd,
      'ACCOUNTED_COST',
    ),
    accountedOutputTokens: nullableNonNegativeInteger(
      input.accounting.accountedOutputTokens,
      'ACCOUNTED_OUTPUT_TOKENS',
    ),
    isUpperBound: input.accounting.isUpperBound,
    runtimeGuardAudit,
    runtimeGuardAuditSha256: hashCanonicalJsonV1(runtimeGuardAudit),
  };
  assertAccounting(accounting, input.retryDisposition);
  const material = {
    version: PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R,
    authority:
      'RESEARCH_DURABLE_PROVIDER_ATTEMPT_ACCOUNTING_NO_PROJECT_MUTATION' as const,
    scope,
    attempt,
    result,
    accounting,
    retryDisposition: input.retryDisposition,
    previousAttemptReceiptSha256: previousAttempt?.receiptSha256 ?? null,
    occurredAt: isoTimestamp(input.occurredAt),
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeDurableAttemptReceiptV2R(
  value: unknown,
): Readonly<ProviderNativeDurableAttemptReceiptV2R> {
  const candidate = record(value, 'RECEIPT');
  const scope = record(candidate.scope, 'SCOPE');
  const attempt = record(candidate.attempt, 'ATTEMPT');
  const accounting = record(candidate.accounting, 'ACCOUNTING');
  const runtimeGuardAudit = records(accounting.runtimeGuardAudit, 'RUNTIME_GUARD_AUDIT');
  const result = normalizeResult(
    record(candidate.result, 'RESULT') as unknown as ProviderNativeAttemptResultV2R,
  );
  const normalizedAccounting = {
    mode: accounting.mode as ProviderNativeAttemptAccountingModeV2R,
    accountedCostNanoUsd: nullableNonNegativeInteger(
      accounting.accountedCostNanoUsd,
      'ACCOUNTED_COST',
    ),
    accountedOutputTokens: nullableNonNegativeInteger(
      accounting.accountedOutputTokens,
      'ACCOUNTED_OUTPUT_TOKENS',
    ),
    isUpperBound: boolean(accounting.isUpperBound, 'IS_UPPER_BOUND'),
    runtimeGuardAudit,
    runtimeGuardAuditSha256: sha256(
      accounting.runtimeGuardAuditSha256,
      'RUNTIME_GUARD_AUDIT',
    ),
  };
  if (normalizedAccounting.runtimeGuardAuditSha256
    !== hashCanonicalJsonV1(runtimeGuardAudit)) {
    fail('RUNTIME_GUARD_AUDIT_HASH_MISMATCH');
  }
  const retryDisposition = candidate.retryDisposition as ProviderNativeAttemptRetryDispositionV2R;
  assertAccounting(normalizedAccounting, retryDisposition);
  const material = {
    version: candidate.version,
    authority: candidate.authority,
    scope: {
      episodeId: identity(scope.episodeId, 'EPISODE_ID'),
      contextSha256: sha256(scope.contextSha256, 'CONTEXT'),
      toolSetSha256: sha256(scope.toolSetSha256, 'TOOL_SET'),
      routeSha256: sha256(scope.routeSha256, 'ROUTE'),
    },
    attempt: {
      turn: positiveInteger(attempt.turn, 'TURN'),
      attemptOrdinal: positiveInteger(attempt.attemptOrdinal, 'ATTEMPT_ORDINAL'),
      requestHash: sha256(attempt.requestHash, 'REQUEST'),
      maxOutputTokens: positiveInteger(attempt.maxOutputTokens, 'MAX_OUTPUT_TOKENS'),
    },
    result,
    accounting: normalizedAccounting,
    retryDisposition,
    previousAttemptReceiptSha256: candidate.previousAttemptReceiptSha256 === null
      ? null : sha256(candidate.previousAttemptReceiptSha256, 'PREVIOUS_ATTEMPT'),
    occurredAt: isoTimestamp(candidate.occurredAt),
  };
  if (candidate.version !== PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_VERSION_V2R
    || candidate.authority
      !== 'RESEARCH_DURABLE_PROVIDER_ATTEMPT_ACCOUNTING_NO_PROJECT_MUTATION'
    || (material.attempt.attemptOrdinal === 1)
      !== (material.previousAttemptReceiptSha256 === null)
    || hashCanonicalJsonV1(material) !== candidate.receiptSha256
    || canonicalizeJsonV1(candidate)
      !== canonicalizeJsonV1({ ...material, receiptSha256: candidate.receiptSha256 })) {
    fail('RECEIPT_INVALID');
  }
  return deepFreezeV1(candidate as unknown as ProviderNativeDurableAttemptReceiptV2R);
}

function normalizeResult(value: ProviderNativeAttemptResultV2R): ProviderNativeAttemptResultV2R {
  const result = record(value, 'RESULT');
  if (result.kind === 'RESPONSE_RECEIVED') {
    const status = positiveInteger(result.responseStatus, 'RESPONSE_STATUS');
    if (status < 100 || status > 599) fail('RESPONSE_STATUS_INVALID');
    return {
      kind: 'RESPONSE_RECEIVED',
      responseStatus: status,
      responseSha256: sha256(result.responseSha256, 'RESPONSE'),
      providerRequestId: result.providerRequestId === null
        ? null : identity(result.providerRequestId, 'PROVIDER_REQUEST_ID'),
    };
  }
  if (result.kind === 'TRANSPORT_RESULT_UNAVAILABLE') {
    return {
      kind: 'TRANSPORT_RESULT_UNAVAILABLE',
      transportErrorCode: identity(result.transportErrorCode, 'TRANSPORT_ERROR_CODE'),
      errorSha256: sha256(result.errorSha256, 'TRANSPORT_ERROR'),
    };
  }
  fail('RESULT_KIND_INVALID');
}

function assertAccounting(
  accounting: ProviderNativeDurableAttemptReceiptV2R['accounting'],
  retry: ProviderNativeAttemptRetryDispositionV2R,
): void {
  if (accounting.mode === 'PROVIDER_REPORTED_USAGE') {
    if (accounting.isUpperBound || accounting.accountedCostNanoUsd === null
      || accounting.accountedOutputTokens === null) fail('REPORTED_USAGE_INVALID');
  } else if (accounting.mode === 'CONSERVATIVE_WORST_CASE_RESERVATION') {
    if (!accounting.isUpperBound || accounting.accountedCostNanoUsd === null
      || accounting.accountedOutputTokens === null) fail('CONSERVATIVE_RESERVATION_INVALID');
  } else if (accounting.mode === 'ACCOUNTING_UNRESOLVED') {
    if (accounting.isUpperBound || accounting.accountedCostNanoUsd !== null
      || accounting.accountedOutputTokens !== null) fail('UNRESOLVED_ACCOUNTING_INVALID');
  } else {
    fail('ACCOUNTING_MODE_INVALID');
  }
  if (retry === 'RETRY_SAFE_AFTER_DURABLE_COMMIT') {
    if (accounting.mode === 'ACCOUNTING_UNRESOLVED') fail('UNSAFE_RETRY_DISPOSITION');
  } else if (retry === 'NEVER_RETRY_ACCOUNTING_UNVERIFIABLE') {
    if (accounting.mode !== 'ACCOUNTING_UNRESOLVED') fail('RETRY_DISPOSITION_INVALID');
  } else if (retry !== 'NO_RETRY_TERMINAL') {
    fail('RETRY_DISPOSITION_INVALID');
  }
}

function assertRoute(route: Readonly<ProviderNativeRouteV2R>): void {
  identity(route.routeId, 'ROUTE_ID');
  identity(route.provider, 'ROUTE_PROVIDER');
  identity(route.model, 'ROUTE_MODEL');
  identity(route.claimedModelIdentity, 'ROUTE_CLAIMED_MODEL');
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}
function records(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) fail(`${label}_INVALID`);
  return value.map((entry) => ({ ...record(entry, label) }));
}
function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}_INVALID`);
  return value;
}
function sha256(value: unknown, label: string): string {
  const text = identity(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) fail(`${label}_SHA256_INVALID`);
  return text;
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(`${label}_INVALID`);
  return Number(value);
}
function nullableNonNegativeInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label}_INVALID`);
  return value;
}
function isoTimestamp(value: unknown): string {
  const text = identity(value, 'OCCURRED_AT');
  if (new Date(text).toISOString() !== text) fail('OCCURRED_AT_INVALID');
  return text;
}
function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_DURABLE_ATTEMPT_${code}`);
}
