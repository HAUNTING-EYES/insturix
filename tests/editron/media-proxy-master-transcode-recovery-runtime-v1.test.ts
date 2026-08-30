import { describe, expect, it, vi } from 'vitest';

import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { recoverMediaProxyMasterTranscodeDurableJobsV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1,
  runMediaProxyMasterTranscodeRecoveryV1,
} from '@/lib/editron/services/media-proxy-master-transcode-recovery-runtime-v1';
import { buildMediaProxyMasterTranscodeBudgetFixtureV1 }
  from './helpers/media-proxy-master-transcode-budget-fixture';

const NOW = new Date('2026-08-30T15:00:00.000Z');
type RecoveryInputV1 = Parameters<
  typeof recoverMediaProxyMasterTranscodeDurableJobsV1
>[0];
type RecoveryResultV1 = ReturnType<
  typeof recoverMediaProxyMasterTranscodeDurableJobsV1
>;

describe('media proxy/master transcode recovery runtime V1', () => {
  it('binds a bounded sweep to the deployment policy registry', async () => {
    const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const environment = recoveryEnvironment(budget.operationalPolicies);
    const result = Object.freeze({
      scanned: 0,
      eligible: 0,
      skipped: 0,
      results: Object.freeze([]),
    });
    const recover = vi.fn<[RecoveryInputV1], RecoveryResultV1>(
      async () => result,
    );
    const jobStore = {
      listRecoverable: vi.fn(),
      recordDispatch: vi.fn(),
    };

    await expect(runMediaProxyMasterTranscodeRecoveryV1({
      recover,
      jobStore,
      environment,
      now: NOW,
    })).resolves.toBe(result);
    expect(MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1)
      .toBe(2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1);
    expect(recover).toHaveBeenCalledOnce();
    const input = recover.mock.calls[0]![0];
    expect(input).toMatchObject({
      jobStore,
      staleBefore: new Date(
        NOW.getTime() - MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1,
      ),
      now: NOW,
      limit: MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1,
      env: environment,
    });
    expect(input.policyRegistry.activeRetryPolicyBinding.policySha256)
      .toBe(budget.operationalPolicies.retry.policySha256);
    expect(input.policyRegistry.activeHeartbeatPolicyBinding.policySha256)
      .toBe(budget.operationalPolicies.heartbeat.policySha256);
  });

  it('requires the deployment registry before recovery can inspect jobs', async () => {
    const recover = vi.fn();
    await expect(runMediaProxyMasterTranscodeRecoveryV1({
      recover,
      environment: {
        QSTASH_TOKEN: 'qstash-token',
        QSTASH_CURRENT_SIGNING_KEY: 'current-key',
        QSTASH_NEXT_SIGNING_KEY: 'next-key',
        VERCEL_URL: 'editron.example.test',
      },
      now: NOW,
    })).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_OPERATIONAL_POLICY_MISSING_REGISTRY',
    );
    expect(recover).not.toHaveBeenCalled();
  });

  it('rejects an invalid recovery clock before policy or store access', async () => {
    const recover = vi.fn();
    await expect(runMediaProxyMasterTranscodeRecoveryV1({
      recover,
      now: new Date(Number.NaN),
    })).rejects.toThrow('MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_NOW_INVALID');
    expect(recover).not.toHaveBeenCalled();
  });
});

function recoveryEnvironment(
  operationalPolicies: ReturnType<
    typeof buildMediaProxyMasterTranscodeBudgetFixtureV1
  >['operationalPolicies'],
) {
  return {
    QSTASH_TOKEN: 'qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'current-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-key',
    VERCEL_URL: 'editron.example.test',
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_JSON:
      JSON.stringify({
        activeRetryPolicy: operationalPolicies.retry,
        activeHeartbeatPolicy: operationalPolicies.heartbeat,
        retainedRetryPolicies: [],
        retainedHeartbeatPolicies: [],
      }),
  };
}
