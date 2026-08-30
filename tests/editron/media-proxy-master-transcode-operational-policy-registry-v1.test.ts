import { describe, expect, it } from 'vitest';

import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import {
  createMediaProxyMasterTranscodeHeartbeatPolicyV1,
  createMediaProxyMasterTranscodeRetryPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';

describe('MediaProxyMasterTranscodeOperationalPolicyRegistryV1', () => {
  it('resolves active and retained retry and heartbeat declarations', () => {
    const oldRetry = retryPolicy(1_000);
    const activeRetry = retryPolicy(2_000);
    const oldHeartbeat = heartbeatPolicy(1_000);
    const activeHeartbeat = heartbeatPolicy(2_000);
    const registry = createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: activeRetry,
      activeHeartbeatPolicy: activeHeartbeat,
      retainedRetryPolicies: [oldRetry],
      retainedHeartbeatPolicies: [oldHeartbeat],
    });

    expect(registry.resolveRetry(binding(activeRetry))).toEqual(activeRetry);
    expect(registry.resolveRetry(binding(oldRetry))).toEqual(oldRetry);
    expect(registry.resolveHeartbeat(binding(activeHeartbeat)))
      .toEqual(activeHeartbeat);
    expect(registry.resolveHeartbeat(binding(oldHeartbeat))).toEqual(oldHeartbeat);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.retainedRetryPolicyBindings)).toBe(true);
  });

  it('canonicalizes retained declaration order', () => {
    const activeRetry = retryPolicy(3_000);
    const activeHeartbeat = heartbeatPolicy(3_000);
    const firstRetry = retryPolicy(1_000);
    const secondRetry = retryPolicy(2_000);
    const firstHeartbeat = heartbeatPolicy(1_000);
    const secondHeartbeat = heartbeatPolicy(2_000);
    const left = createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: activeRetry,
      activeHeartbeatPolicy: activeHeartbeat,
      retainedRetryPolicies: [firstRetry, secondRetry],
      retainedHeartbeatPolicies: [firstHeartbeat, secondHeartbeat],
    });
    const right = createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: activeRetry,
      activeHeartbeatPolicy: activeHeartbeat,
      retainedRetryPolicies: [secondRetry, firstRetry],
      retainedHeartbeatPolicies: [secondHeartbeat, firstHeartbeat],
    });

    expect(right.registrySha256).toBe(left.registrySha256);
    expect(right.retainedRetryPolicyBindings)
      .toEqual(left.retainedRetryPolicyBindings);
    expect(right.retainedHeartbeatPolicyBindings)
      .toEqual(left.retainedHeartbeatPolicyBindings);
  });

  it('keeps old jobs resolvable after both policies rotate', () => {
    const oldRetry = retryPolicy(1_000);
    const newRetry = retryPolicy(2_000);
    const oldHeartbeat = heartbeatPolicy(1_000);
    const newHeartbeat = heartbeatPolicy(2_000);
    const after = createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: newRetry,
      activeHeartbeatPolicy: newHeartbeat,
      retainedRetryPolicies: [oldRetry],
      retainedHeartbeatPolicies: [oldHeartbeat],
    });

    expect(after.resolveRetry(binding(oldRetry))).toEqual(oldRetry);
    expect(after.resolveHeartbeat(binding(oldHeartbeat))).toEqual(oldHeartbeat);
    expect(after.activeRetryPolicy).toEqual(newRetry);
    expect(after.activeHeartbeatPolicy).toEqual(newHeartbeat);
  });

  it('never substitutes an active policy for an unknown historical hash', () => {
    const registry = registryFixture();
    expect(() => registry.resolveRetry({
      ...binding(registry.activeRetryPolicy),
      policySha256: 'f'.repeat(64),
    })).toThrow('RETRY_POLICY_NOT_FOUND');
    expect(() => registry.resolveHeartbeat({
      ...binding(registry.activeHeartbeatPolicy),
      policySha256: 'f'.repeat(64),
    })).toThrow('HEARTBEAT_POLICY_NOT_FOUND');
  });

  it('rejects duplicate, forged, incomplete, and cross-family bindings', () => {
    const retry = retryPolicy(1_000);
    const heartbeat = heartbeatPolicy(1_000);
    expect(() => createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: retry,
      activeHeartbeatPolicy: heartbeat,
      retainedRetryPolicies: [retry],
      retainedHeartbeatPolicies: [],
    })).toThrow('RETRY_POLICY_BINDING_DUPLICATE');
    expect(() => createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: retry,
      activeHeartbeatPolicy: heartbeat,
      retainedRetryPolicies: [{ ...retryPolicy(2_000), policySha256: '0'.repeat(64) }],
      retainedHeartbeatPolicies: [],
    })).toThrow('RETRY_POLICY_INVALID');

    const registry = registryFixture();
    expect(() => registry.resolveRetry({
      policySha256: retry.policySha256,
    } as never)).toThrow('RETRY_BINDING_FIELDS_INVALID');
    expect(() => registry.resolveRetry(
      binding(registry.activeHeartbeatPolicy) as never,
    )).toThrow('RETRY_BINDING_IDENTITY_INVALID');
  });
});

function registryFixture() {
  return createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
    activeRetryPolicy: retryPolicy(2_000),
    activeHeartbeatPolicy: heartbeatPolicy(2_000),
    retainedRetryPolicies: [],
    retainedHeartbeatPolicies: [],
  });
}

function retryPolicy(baseDelayMs: number) {
  return createMediaProxyMasterTranscodeRetryPolicyV1({
    durableJob: { maxAttempts: 6, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    qstashDelivery: {
      retries: 2,
      retryDelayMs: baseDelayMs * 10,
      timeoutSeconds: 300,
    },
    workerRetry: {
      baseDelayMs,
      maximumDelayMs: 30_000,
      backoffMultiplier: 2,
      deterministicJitterPermille: 200,
      retryableDiagnostics: [
        'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
      ],
    },
  });
}

function heartbeatPolicy(heartbeatIntervalMs: number) {
  return createMediaProxyMasterTranscodeHeartbeatPolicyV1({
    heartbeatIntervalMs,
  });
}

function binding<T extends Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>>(policy: T): Pick<T, 'ownerId' | 'ownerVersion' | 'policySha256'> {
  return {
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
  };
}
