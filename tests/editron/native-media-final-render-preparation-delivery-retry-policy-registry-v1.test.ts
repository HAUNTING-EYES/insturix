import { describe, expect, it } from 'vitest';

import { createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import { createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-registry-v1';

describe('native final-render preparation retry-policy registry v1', () => {
  it('resolves active and retained policies by exact complete binding', () => {
    const oldPolicy = policy(1_000);
    const activePolicy = policy(2_000);
    const registry = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [oldPolicy],
    });

    expect(registry.activePolicy).toEqual(activePolicy);
    expect(registry.resolve(binding(activePolicy))).toEqual(activePolicy);
    expect(registry.resolve(binding(oldPolicy))).toEqual(oldPolicy);
    expect(registry.activePolicyBinding).toEqual(binding(activePolicy));
    expect(registry.retainedPolicyBindings).toEqual([binding(oldPolicy)]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.retainedPolicyBindings)).toBe(true);
  });

  it('canonicalizes retained entry order into one registry identity', () => {
    const activePolicy = policy(3_000);
    const first = policy(1_000);
    const second = policy(2_000);
    const left = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [first, second],
    });
    const right = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [second, first],
    });

    expect(left.registrySha256).toBe(right.registrySha256);
    expect(left.retainedPolicyBindings).toEqual(right.retainedPolicyBindings);
  });

  it('keeps an old job resolvable after the active policy rotates', () => {
    const oldPolicy = policy(1_000);
    const newPolicy = policy(2_000);
    const before = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy: oldPolicy,
      retainedPolicies: [],
    });
    const after = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy: newPolicy,
      retainedPolicies: [oldPolicy],
    });

    expect(before.resolve(binding(oldPolicy))).toEqual(oldPolicy);
    expect(after.resolve(binding(oldPolicy))).toEqual(oldPolicy);
    expect(after.activePolicy).toEqual(newPolicy);
    expect(after.registrySha256).not.toBe(before.registrySha256);
  });

  it('never substitutes the active policy for an unknown historical hash', () => {
    const activePolicy = policy(2_000);
    const registry = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [],
    });

    expect(() => registry.resolve({
      ...binding(activePolicy),
      policySha256: 'f'.repeat(64),
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_POLICY_NOT_FOUND',
    );
  });

  it('rejects duplicate and forged declarations', () => {
    const activePolicy = policy(1_000);
    expect(() => createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [activePolicy],
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_POLICY_BINDING_DUPLICATE',
    );
    expect(() => createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [{ ...policy(2_000), policySha256: '0'.repeat(64) }],
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_POLICY_INVALID',
    );
  });

  it('rejects incomplete, extra-field and wrong-owner bindings', () => {
    const activePolicy = policy(1_000);
    const registry = createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
      activePolicy,
      retainedPolicies: [],
    });

    expect(() => registry.resolve({ policySha256: activePolicy.policySha256 } as never))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_BINDING_FIELDS_INVALID');
    expect(() => registry.resolve({ ...binding(activePolicy), extra: true } as never))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_BINDING_FIELDS_INVALID');
    expect(() => registry.resolve({
      ...binding(activePolicy), ownerId: 'OTHER_POLICY_OWNER',
    } as never)).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_BINDING_IDENTITY_INVALID',
    );
  });
});

function policy(workerRetryDelayMs: number) {
  return createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 5, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    qstashDelivery: { retries: 2, retryDelayMs: 10_000, timeoutSeconds: 120 },
    workerRetry: { delayMs: workerRetryDelayMs },
  });
}

function binding(policyValue: ReturnType<typeof policy>) {
  return {
    ownerId: policyValue.ownerId,
    ownerVersion: policyValue.ownerVersion,
    policySha256: policyValue.policySha256,
  } as const;
}
