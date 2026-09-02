import { describe, expect, it, vi } from 'vitest';

import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_RUNTIME_VERSION_V2,
  runMediaProxyMasterTranscodeRecoveryV2,
} from '@/lib/editron/services/media-proxy-master-transcode-recovery-runtime-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

const NOW = new Date('2026-08-30T15:00:00.000Z');

describe('MediaProxyMasterTranscodeRecoveryRuntimeV2', () => {
  it('runs both bounded schema owners under one policy snapshot', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const v2 = recovery('job-v2');
    const v1 = recovery('job-v1');
    const recoverV2 = vi.fn(async () => v2);
    const recoverV1 = vi.fn(async () => v1);
    const jobStore = {
      listRecoverable: vi.fn(),
      recordDispatch: vi.fn(),
    };
    const policyRegistry =
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: fixture.base.operationalPolicies.retry,
        activeHeartbeatPolicy: fixture.base.operationalPolicies.heartbeat,
        retainedRetryPolicies: [],
        retainedHeartbeatPolicies: [],
      });

    const result = await runMediaProxyMasterTranscodeRecoveryV2({
      jobStore,
      recoverV1: recoverV1 as never,
      recoverV2: recoverV2 as never,
      environment: {},
      policyRegistry,
      now: NOW,
    });
    expect(result).toMatchObject({
      version: MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_RUNTIME_VERSION_V2,
      schemas: { v1, v2 },
      results: [
        { schemaId: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V2',
          jobId: 'job-v2' },
        { schemaId: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V1_1',
          jobId: 'job-v1' },
      ],
    });
    for (const recover of [recoverV1, recoverV2]) {
      expect(recover).toHaveBeenCalledWith(expect.objectContaining({
        jobStore,
        staleBefore: new Date(
          NOW.getTime() - 2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
        ),
        now: NOW,
        limit: 10,
        policyRegistry,
      }));
    }
  });

  it('rejects invalid time and missing deployment policy before scans', async () => {
    const recoverV1 = vi.fn();
    const recoverV2 = vi.fn();
    await expect(runMediaProxyMasterTranscodeRecoveryV2({
      recoverV1: recoverV1 as never,
      recoverV2: recoverV2 as never,
      now: new Date(Number.NaN),
    })).rejects.toThrow('RECOVERY_V2_NOW_INVALID');
    await expect(runMediaProxyMasterTranscodeRecoveryV2({
      recoverV1: recoverV1 as never,
      recoverV2: recoverV2 as never,
      environment: {},
      now: NOW,
    })).rejects.toThrow('RECOVERY_V2_OPERATIONAL_POLICY_MISSING_REGISTRY');
    expect(recoverV1).not.toHaveBeenCalled();
    expect(recoverV2).not.toHaveBeenCalled();
  });
});

function recovery(jobId: string) {
  return Object.freeze({
    scanned: 1,
    eligible: 1,
    skipped: 0,
    results: Object.freeze([Object.freeze({
      state: 'dispatched' as const,
      jobId,
      messageId: `message-${jobId}`,
    })]),
  });
}
