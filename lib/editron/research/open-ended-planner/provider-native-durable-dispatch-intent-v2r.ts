import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertProviderNativeDurableAttemptReceiptV2R,
  type ProviderNativeDurableAttemptReceiptV2R,
} from './provider-native-durable-attempt-receipt-v2r';
import type { ProviderNativeRouteV2R } from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_V2R_1' as const;

export interface ProviderNativeDurableDispatchIntentV2R {
  version: typeof PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_VERSION_V2R;
  authority: 'RESEARCH_DURABLE_PROVIDER_DISPATCH_INTENT_NO_PROJECT_MUTATION';
  scope: Readonly<{
    episodeId: string;
    contextSha256: string;
    toolSetSha256: string;
    routeSha256: string;
  }>;
  dispatch: Readonly<{
    turn: number;
    attemptOrdinal: number;
    requestHash: string;
    maxOutputTokens: number;
  }>;
  reservation: Readonly<{
    inputTokensUpperBound: number;
    reservedWorstCaseNanoUsd: number;
    runtimeGuardAudit: readonly Readonly<JsonRecord>[];
    runtimeGuardAuditSha256: string;
  }>;
  deliveryState: 'AUTHORIZED_NOT_PROVEN_DISPATCHED';
  previousAttemptReceiptSha256: string | null;
  createdAt: string;
  receiptSha256: string;
}

export function createProviderNativeDurableDispatchIntentV2R(input: Readonly<{
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  turn: number;
  requestHash: string;
  maxOutputTokens: number;
  inputTokensUpperBound: number;
  reservedWorstCaseNanoUsd: number;
  runtimeGuardAudit: readonly Readonly<JsonRecord>[];
  createdAt: string;
  previousAttempt?: Readonly<ProviderNativeDurableAttemptReceiptV2R>;
}>): Readonly<ProviderNativeDurableDispatchIntentV2R> {
  assertRoute(input.route);
  const scope = {
    episodeId: identity(input.episodeId, 'EPISODE_ID'),
    contextSha256: sha256(input.contextSha256, 'CONTEXT'),
    toolSetSha256: sha256(input.toolSetSha256, 'TOOL_SET'),
    routeSha256: hashCanonicalJsonV1(input.route),
  };
  const previousAttempt = input.previousAttempt
    ? assertProviderNativeDurableAttemptReceiptV2R(input.previousAttempt)
    : undefined;
  if (previousAttempt
    && canonicalizeJsonV1(previousAttempt.scope) !== canonicalizeJsonV1(scope)) {
    fail('ATTEMPT_CHAIN_SCOPE_MISMATCH');
  }
  const dispatch = {
    turn: positiveInteger(input.turn, 'TURN'),
    attemptOrdinal: previousAttempt ? previousAttempt.attempt.attemptOrdinal + 1 : 1,
    requestHash: sha256(input.requestHash, 'REQUEST'),
    maxOutputTokens: positiveInteger(input.maxOutputTokens, 'MAX_OUTPUT_TOKENS'),
  };
  if (previousAttempt && previousAttempt.attempt.turn > dispatch.turn) {
    fail('ATTEMPT_CHAIN_TURN_REGRESSION');
  }
  const runtimeGuardAudit = input.runtimeGuardAudit.map((event) => ({
    ...record(event, 'RUNTIME_GUARD_EVENT'),
  }));
  const reservation = {
    inputTokensUpperBound: positiveInteger(
      input.inputTokensUpperBound,
      'INPUT_TOKENS_UPPER_BOUND',
    ),
    reservedWorstCaseNanoUsd: nonNegativeInteger(
      input.reservedWorstCaseNanoUsd,
      'RESERVED_WORST_CASE_NANO_USD',
    ),
    runtimeGuardAudit,
    runtimeGuardAuditSha256: hashCanonicalJsonV1(runtimeGuardAudit),
  };
  assertReservationAudit(dispatch, reservation);
  const material = {
    version: PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_VERSION_V2R,
    authority:
      'RESEARCH_DURABLE_PROVIDER_DISPATCH_INTENT_NO_PROJECT_MUTATION' as const,
    scope,
    dispatch,
    reservation,
    deliveryState: 'AUTHORIZED_NOT_PROVEN_DISPATCHED' as const,
    previousAttemptReceiptSha256: previousAttempt?.receiptSha256 ?? null,
    createdAt: isoTimestamp(input.createdAt),
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeDurableDispatchIntentV2R(
  value: unknown,
): Readonly<ProviderNativeDurableDispatchIntentV2R> {
  const candidate = record(value, 'RECEIPT');
  const scope = record(candidate.scope, 'SCOPE');
  const dispatchCandidate = record(candidate.dispatch, 'DISPATCH');
  const reservationCandidate = record(candidate.reservation, 'RESERVATION');
  const runtimeGuardAudit = records(
    reservationCandidate.runtimeGuardAudit,
    'RUNTIME_GUARD_AUDIT',
  );
  const dispatch = {
    turn: positiveInteger(dispatchCandidate.turn, 'TURN'),
    attemptOrdinal: positiveInteger(dispatchCandidate.attemptOrdinal, 'ATTEMPT_ORDINAL'),
    requestHash: sha256(dispatchCandidate.requestHash, 'REQUEST'),
    maxOutputTokens: positiveInteger(
      dispatchCandidate.maxOutputTokens,
      'MAX_OUTPUT_TOKENS',
    ),
  };
  const reservation = {
    inputTokensUpperBound: positiveInteger(
      reservationCandidate.inputTokensUpperBound,
      'INPUT_TOKENS_UPPER_BOUND',
    ),
    reservedWorstCaseNanoUsd: nonNegativeInteger(
      reservationCandidate.reservedWorstCaseNanoUsd,
      'RESERVED_WORST_CASE_NANO_USD',
    ),
    runtimeGuardAudit,
    runtimeGuardAuditSha256: sha256(
      reservationCandidate.runtimeGuardAuditSha256,
      'RUNTIME_GUARD_AUDIT',
    ),
  };
  if (reservation.runtimeGuardAuditSha256 !== hashCanonicalJsonV1(runtimeGuardAudit)) {
    fail('RUNTIME_GUARD_AUDIT_HASH_MISMATCH');
  }
  assertReservationAudit(dispatch, reservation);
  const material = {
    version: candidate.version,
    authority: candidate.authority,
    scope: {
      episodeId: identity(scope.episodeId, 'EPISODE_ID'),
      contextSha256: sha256(scope.contextSha256, 'CONTEXT'),
      toolSetSha256: sha256(scope.toolSetSha256, 'TOOL_SET'),
      routeSha256: sha256(scope.routeSha256, 'ROUTE'),
    },
    dispatch,
    reservation,
    deliveryState: candidate.deliveryState,
    previousAttemptReceiptSha256: candidate.previousAttemptReceiptSha256 === null
      ? null : sha256(candidate.previousAttemptReceiptSha256, 'PREVIOUS_ATTEMPT'),
    createdAt: isoTimestamp(candidate.createdAt),
  };
  if (candidate.version !== PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_VERSION_V2R
    || candidate.authority
      !== 'RESEARCH_DURABLE_PROVIDER_DISPATCH_INTENT_NO_PROJECT_MUTATION'
    || candidate.deliveryState !== 'AUTHORIZED_NOT_PROVEN_DISPATCHED'
    || (dispatch.attemptOrdinal === 1)
      !== (material.previousAttemptReceiptSha256 === null)
    || hashCanonicalJsonV1(material) !== candidate.receiptSha256
    || canonicalizeJsonV1(candidate)
      !== canonicalizeJsonV1({ ...material, receiptSha256: candidate.receiptSha256 })) {
    fail('RECEIPT_INVALID');
  }
  return deepFreezeV1(candidate as unknown as ProviderNativeDurableDispatchIntentV2R);
}

function assertReservationAudit(
  dispatch: ProviderNativeDurableDispatchIntentV2R['dispatch'],
  reservation: ProviderNativeDurableDispatchIntentV2R['reservation'],
): void {
  const matches = reservation.runtimeGuardAudit.filter((event) => (
    event.phase === 'BEFORE_INVOKE'
    && event.status === 'ALLOW'
    && event.turn === dispatch.turn
    && event.requestHash === dispatch.requestHash
    && event.inputTokensUpperBound === reservation.inputTokensUpperBound
    && event.reservedWorstCaseNanoUsd === reservation.reservedWorstCaseNanoUsd
  ));
  if (matches.length !== 1) fail('RESERVATION_AUDIT_BINDING_INVALID');
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
function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}
function isoTimestamp(value: unknown): string {
  const text = identity(value, 'CREATED_AT');
  if (new Date(text).toISOString() !== text) fail('CREATED_AT_INVALID');
  return text;
}
function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_${code}`);
}
