import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertProviderNativeDurableAttemptReceiptV2R,
  createProviderNativeDurableAttemptReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';

const ROUTE = {
  routeId: 'OPENAI_TERRA',
  provider: 'openai',
  model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium',
} as const;
const BASE = {
  episodeId: 'episode-attempt-1',
  contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64),
  route: ROUTE,
  turn: 2,
  requestHash: 'c'.repeat(64),
  maxOutputTokens: 512,
  occurredAt: '2026-08-23T10:00:00.000Z',
} as const;

describe('provider-native durable attempt receipt', () => {
  it('binds a conservatively accounted timeout and an ordered retry', () => {
    const first = createProviderNativeDurableAttemptReceiptV2R({
      ...BASE,
      result: {
        kind: 'TRANSPORT_RESULT_UNAVAILABLE',
        transportErrorCode: 'PROVIDER_TIMEOUT',
        errorSha256: 'd'.repeat(64),
      },
      accounting: {
        mode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
        accountedCostNanoUsd: 4_000_000,
        accountedOutputTokens: 512,
        isUpperBound: true,
        runtimeGuardAudit: [
          { ordinal: 1, phase: 'BEFORE_TURN', status: 'ALLOW', turn: 2 },
          { ordinal: 2, phase: 'BEFORE_INVOKE', status: 'ALLOW', turn: 2,
            requestHash: BASE.requestHash, reservedWorstCaseNanoUsd: 4_000_000 },
          { ordinal: 3, phase: 'SETTLE_UNKNOWN_INVOKE', status: 'ALLOW', turn: 2,
            requestHash: BASE.requestHash, reservedWorstCaseNanoUsd: 4_000_000 },
        ],
      },
      retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT',
    });
    const second = createProviderNativeDurableAttemptReceiptV2R({
      ...BASE,
      requestHash: 'e'.repeat(64),
      occurredAt: '2026-08-23T10:00:02.000Z',
      result: {
        kind: 'RESPONSE_RECEIVED', responseStatus: 200,
        responseSha256: 'f'.repeat(64), providerRequestId: 'response-2',
      },
      accounting: {
        mode: 'PROVIDER_REPORTED_USAGE', accountedCostNanoUsd: 2_000_000,
        accountedOutputTokens: 220, isUpperBound: false,
        runtimeGuardAudit: [
          { ordinal: 4, phase: 'BEFORE_INVOKE', status: 'ALLOW', turn: 2 },
          { ordinal: 5, phase: 'AFTER_INVOKE', status: 'ALLOW', turn: 2 },
        ],
      },
      retryDisposition: 'NO_RETRY_TERMINAL',
      previousAttempt: first,
    });

    expect(first.attempt.attemptOrdinal).toBe(1);
    expect(second.attempt.attemptOrdinal).toBe(2);
    expect(second.previousAttemptReceiptSha256).toBe(first.receiptSha256);
    expect(assertProviderNativeDurableAttemptReceiptV2R(second)).toEqual(second);
  });

  it('rejects unresolved accounting as retry-safe', () => {
    expect(() => createProviderNativeDurableAttemptReceiptV2R({
      ...BASE,
      result: {
        kind: 'TRANSPORT_RESULT_UNAVAILABLE', transportErrorCode: 'SOCKET_CLOSED',
        errorSha256: 'd'.repeat(64),
      },
      accounting: {
        mode: 'ACCOUNTING_UNRESOLVED', accountedCostNanoUsd: null,
        accountedOutputTokens: null, isUpperBound: false,
        runtimeGuardAudit: [{ ordinal: 1, status: 'DENY' }],
      },
      retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT',
    })).toThrow('PROVIDER_NATIVE_DURABLE_ATTEMPT_UNSAFE_RETRY_DISPOSITION');
  });

  it('rejects a copied prior receipt from another episode', () => {
    const prior = responseReceipt();
    expect(() => createProviderNativeDurableAttemptReceiptV2R({
      ...responseInput(), episodeId: 'different-episode', previousAttempt: prior,
    })).toThrow('PROVIDER_NATIVE_DURABLE_ATTEMPT_ATTEMPT_CHAIN_SCOPE_MISMATCH');
  });

  it('rejects tampered audit and skipped attempt-chain material', () => {
    const original = responseReceipt();
    const forgedAudit = structuredClone(original) as Record<string, unknown>;
    const accounting = forgedAudit.accounting as Record<string, unknown>;
    accounting.runtimeGuardAudit = [{ ordinal: 99, status: 'ALLOW' }];
    expect(() => assertProviderNativeDurableAttemptReceiptV2R(forgedAudit))
      .toThrow('PROVIDER_NATIVE_DURABLE_ATTEMPT_RUNTIME_GUARD_AUDIT_HASH_MISMATCH');

    const forgedOrdinal = structuredClone(original) as Record<string, unknown>;
    const attempt = forgedOrdinal.attempt as Record<string, unknown>;
    attempt.attemptOrdinal = 2;
    const { receiptSha256: _oldHash, ...material } = forgedOrdinal;
    forgedOrdinal.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => assertProviderNativeDurableAttemptReceiptV2R(forgedOrdinal))
      .toThrow('PROVIDER_NATIVE_DURABLE_ATTEMPT_RECEIPT_INVALID');
  });
});

function responseInput() {
  return {
    ...BASE,
    result: {
      kind: 'RESPONSE_RECEIVED' as const, responseStatus: 429,
      responseSha256: 'f'.repeat(64), providerRequestId: null,
    },
    accounting: {
      mode: 'CONSERVATIVE_WORST_CASE_RESERVATION' as const,
      accountedCostNanoUsd: 4_000_000, accountedOutputTokens: 512,
      isUpperBound: true,
      runtimeGuardAudit: [{ ordinal: 1, phase: 'AFTER_INVOKE_HTTP_FAILURE',
        status: 'ALLOW' }],
    },
    retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT' as const,
  };
}

function responseReceipt() {
  return createProviderNativeDurableAttemptReceiptV2R(responseInput());
}
