import { describe, expect, it } from 'vitest';

import {
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1,
  resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
} from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-environment-v1';
import {
  createMediaProxyMasterTranscodeHeartbeatPolicyV1,
  createMediaProxyMasterTranscodeRetryPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';

describe('proxy transcode operational-policy deployment registry v1', () => {
  it('requires an explicit bounded deployment declaration', () => {
    expect(resolve({})).toEqual({
      configured: false,
      reason: 'MISSING_REGISTRY',
      registry: null,
    });
    expect(resolve({
      [MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1]:
        JSON.stringify({ payload: 'x'.repeat(256 * 1_024) }),
    })).toEqual({
      configured: false,
      reason: 'REGISTRY_TOO_LARGE',
      registry: null,
    });
  });

  it.each([
    '{',
    '[]',
    JSON.stringify({}),
    JSON.stringify({
      ...declaration(policy(1_000)),
      unrecognizedAuthority: true,
    }),
    JSON.stringify({
      ...declaration(policy(1_000)),
      retainedRetryPolicies: new Array(257).fill(policy(1_000).retry),
    }),
  ])('rejects malformed, extra-field, or unbounded declarations', (raw) => {
    expect(resolve({
      [MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1]: raw,
    })).toEqual({
      configured: false,
      reason: 'REGISTRY_INVALID',
      registry: null,
    });
  });

  it('resolves the exact active and retained declarations after rotation', () => {
    const old = policy(1_000);
    const current = policy(2_000);
    const result = resolve({
      [MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1]:
        JSON.stringify(declaration(current, old)),
    });
    expect(result.configured).toBe(true);
    if (!result.configured) throw new Error('TEST_REGISTRY_REQUIRED');

    expect(result.registry.activeRetryPolicy).toEqual(current.retry);
    expect(result.registry.activeHeartbeatPolicy).toEqual(current.heartbeat);
    expect(result.registry.resolveRetry(binding(old.retry))).toEqual(old.retry);
    expect(result.registry.resolveHeartbeat(binding(old.heartbeat)))
      .toEqual(old.heartbeat);
    expect(() => result.registry.resolveRetry({
      ...binding(current.retry),
      policySha256: hash('unknown-policy'),
    })).toThrow('RETRY_POLICY_NOT_FOUND');
  });

  it('rejects a nested policy whose declared hash is forged', () => {
    const active = policy(1_000);
    expect(resolve({
      [MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1]:
        JSON.stringify(declaration({
          ...active,
          retry: { ...active.retry, policySha256: hash('forged') },
        })),
    })).toEqual({
      configured: false,
      reason: 'REGISTRY_INVALID',
      registry: null,
    });
  });
});

function resolve(environment: Readonly<Record<string, string | undefined>>) {
  return resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
    environment,
  );
}

function declaration(
  active: ReturnType<typeof policy>,
  retained?: ReturnType<typeof policy>,
) {
  return {
    activeRetryPolicy: active.retry,
    activeHeartbeatPolicy: active.heartbeat,
    retainedRetryPolicies: retained ? [retained.retry] : [],
    retainedHeartbeatPolicies: retained ? [retained.heartbeat] : [],
  };
}

function policy(baseDelayMs: number) {
  return {
    retry: createMediaProxyMasterTranscodeRetryPolicyV1({
      durableJob: {
        maxAttempts: 6,
        retentionMs: 7 * 24 * 60 * 60 * 1_000,
      },
      qstashDelivery: {
        retries: 2,
        retryDelayMs: 30_000,
        timeoutSeconds: 300,
      },
      workerRetry: {
        baseDelayMs,
        maximumDelayMs: 30_000,
        backoffMultiplier: 2,
        deterministicJitterPermille: 200,
        retryableDiagnostics: [
          'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
        ],
      },
    }),
    heartbeat: createMediaProxyMasterTranscodeHeartbeatPolicyV1({
      heartbeatIntervalMs: baseDelayMs,
    }),
  };
}

function binding<T extends Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>>(policyValue: T): Readonly<{
  ownerId: T['ownerId'];
  ownerVersion: T['ownerVersion'];
  policySha256: string;
}> {
  return {
    ownerId: policyValue.ownerId,
    ownerVersion: policyValue.ownerVersion,
    policySha256: policyValue.policySha256,
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
