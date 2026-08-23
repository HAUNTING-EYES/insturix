import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeDurableAttemptReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';
import {
  assertProviderNativeDurableDispatchIntentV2R,
  createProviderNativeDurableDispatchIntentV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-durable-dispatch-intent-v2r';

const ROUTE = { routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' } as const;
const REQUEST_HASH = 'c'.repeat(64);
const BASE = { episodeId: 'dispatch-episode-1', contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64), route: ROUTE, turn: 2,
  requestHash: REQUEST_HASH, maxOutputTokens: 512, inputTokensUpperBound: 900,
  reservedWorstCaseNanoUsd: 4_500_000,
  runtimeGuardAudit: [{ ordinal: 1, phase: 'BEFORE_TURN', status: 'ALLOW', turn: 2 },
    { ordinal: 2, phase: 'BEFORE_INVOKE', status: 'ALLOW', turn: 2,
      requestHash: REQUEST_HASH, inputTokensUpperBound: 900,
      reservedWorstCaseNanoUsd: 4_500_000 }],
  createdAt: '2026-08-23T12:00:00.000Z' } as const;

describe('provider-native durable dispatch intent', () => {
  it('binds the exact pre-dispatch reservation without claiming delivery', () => {
    const intent = createProviderNativeDurableDispatchIntentV2R(BASE);
    expect(intent.deliveryState).toBe('AUTHORIZED_NOT_PROVEN_DISPATCHED');
    expect(intent.dispatch).toMatchObject({ attemptOrdinal: 1,
      requestHash: REQUEST_HASH, maxOutputTokens: 512 });
    expect(assertProviderNativeDurableDispatchIntentV2R(intent)).toEqual(intent);
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('continues the existing attempt chain without copying another scope', () => {
    const previousAttempt = attempt('dispatch-episode-1');
    const intent = createProviderNativeDurableDispatchIntentV2R({
      ...BASE, previousAttempt,
    });
    expect(intent.dispatch.attemptOrdinal).toBe(2);
    expect(intent.previousAttemptReceiptSha256).toBe(previousAttempt.receiptSha256);
    expect(() => createProviderNativeDurableDispatchIntentV2R({
      ...BASE, episodeId: 'different-episode', previousAttempt,
    })).toThrow('PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_ATTEMPT_CHAIN_SCOPE_MISMATCH');
  });

  it('rejects request or reservation evidence that does not match the owner audit', () => {
    expect(() => createProviderNativeDurableDispatchIntentV2R({
      ...BASE, requestHash: 'd'.repeat(64),
    })).toThrow('PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_RESERVATION_AUDIT_BINDING_INVALID');
    expect(() => createProviderNativeDurableDispatchIntentV2R({
      ...BASE, reservedWorstCaseNanoUsd: 4_500_001,
    })).toThrow('PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_RESERVATION_AUDIT_BINDING_INVALID');
  });

  it('rejects tampering even when an attacker recomputes the outer hash', () => {
    const forged = structuredClone(
      createProviderNativeDurableDispatchIntentV2R(BASE),
    ) as Record<string, unknown>;
    const reservation = forged.reservation as Record<string, unknown>;
    reservation.runtimeGuardAudit = [{ ordinal: 2, phase: 'BEFORE_INVOKE',
      status: 'ALLOW', turn: 2, requestHash: REQUEST_HASH,
      inputTokensUpperBound: 1, reservedWorstCaseNanoUsd: 4_500_000 }];
    reservation.runtimeGuardAuditSha256 = hashCanonicalJsonV1(
      reservation.runtimeGuardAudit,
    );
    const { receiptSha256: _oldHash, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => assertProviderNativeDurableDispatchIntentV2R(forged))
      .toThrow('PROVIDER_NATIVE_DURABLE_DISPATCH_INTENT_RESERVATION_AUDIT_BINDING_INVALID');
  });
});

function attempt(episodeId: string) {
  return createProviderNativeDurableAttemptReceiptV2R({ episodeId,
    contextSha256: BASE.contextSha256, toolSetSha256: BASE.toolSetSha256,
    route: ROUTE, turn: 1, requestHash: 'e'.repeat(64), maxOutputTokens: 256,
    result: { kind: 'RESPONSE_RECEIVED', responseStatus: 429,
      responseSha256: 'f'.repeat(64), providerRequestId: null },
    accounting: { mode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedCostNanoUsd: 2_000_000, accountedOutputTokens: 256,
      isUpperBound: true, runtimeGuardAudit: [{ ordinal: 1,
        phase: 'AFTER_INVOKE_HTTP_FAILURE', status: 'ALLOW' }] },
    retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT',
    occurredAt: '2026-08-23T11:59:00.000Z' });
}
