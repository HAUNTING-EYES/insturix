import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaFinalRenderPreparationRuntimePolicyV1,
  createNativeMediaFinalRenderPreparationRuntimePolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';

describe('NativeMediaFinalRenderPreparationRuntimePolicyV1', () => {
  it('binds exact budget, retry, and heartbeat policy provenance', () => {
    const first = policy();
    const second = policy();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      executionBudget: {
        ownerId: 'EXACT_RENDER_BUDGET_OWNER',
        ownerVersion: '3',
        policySha256: sha('a'),
      },
      retryPolicy: {
        ownerId: 'EXACT_RENDER_RETRY_OWNER',
        ownerVersion: '2',
        policySha256: sha('b'),
      },
      heartbeatPolicy: {
        ownerId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
        ownerVersion: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
        policySha256: sha('c'),
      },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.executionBudget)).toBe(true);
    expect(assertNativeMediaFinalRenderPreparationRuntimePolicyV1(first)).toEqual(first);
  });

  it('changes identity when any owner or policy digest changes', () => {
    const baseline = policy();
    expect(policy({ budgetOwnerVersion: '4' }).bindingSha256)
      .not.toBe(baseline.bindingSha256);
    expect(policy({ retryPolicySha256: sha('d') }).bindingSha256)
      .not.toBe(baseline.bindingSha256);
    expect(policy({ heartbeatPolicySha256: sha('e') }).bindingSha256)
      .not.toBe(baseline.bindingSha256);
  });

  it('rejects malformed, extra-field, and forged receipts', () => {
    expect(() => policy({ heartbeatPolicySha256: 'not-a-sha' }))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_SHA256_INVALID');
    const valid = policy();
    expect(() => assertNativeMediaFinalRenderPreparationRuntimePolicyV1({
      ...valid,
      unexpected: true,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_FIELDS_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationRuntimePolicyV1({
      ...valid,
      bindingSha256: sha('f'),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_BINDING_MISMATCH');
    expect(() => assertNativeMediaFinalRenderPreparationRuntimePolicyV1({
      ...valid,
      heartbeatPolicy: {
        ...valid.heartbeatPolicy,
        ownerVersion: 'forged',
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_OWNER_INVALID');
  });
});

function policy(overrides: Readonly<{
  budgetOwnerVersion?: string;
  retryPolicySha256?: string;
  heartbeatPolicySha256?: string;
}> = {}) {
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'EXACT_RENDER_BUDGET_OWNER',
      ownerVersion: overrides.budgetOwnerVersion ?? '3',
      policySha256: sha('a'),
    },
    retryPolicy: {
      ownerId: 'EXACT_RENDER_RETRY_OWNER',
      ownerVersion: '2',
      policySha256: overrides.retryPolicySha256 ?? sha('b'),
    },
    heartbeatPolicySha256: overrides.heartbeatPolicySha256 ?? sha('c'),
  });
}

function sha(character: string): string {
  return character.repeat(64);
}
