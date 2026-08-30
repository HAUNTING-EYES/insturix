import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v2';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import { runMediaProxyMasterTranscodeDurableWorkerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1,
} from '@/lib/editron/services/media-proxy-master-transcode-product-runtime-v1';
import {
  MediaProxyMasterTranscodeProductRuntimeErrorV2,
  runMediaProxyMasterTranscodeProductRuntimeV2,
} from '@/lib/editron/services/media-proxy-master-transcode-product-runtime-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
  buildMediaProxyMasterTranscodeV2Fixture,
} from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodeProductRuntimeV2', () => {
  it('skips an absent V2 job without constructing deployment ports', async () => {
    const createPrivateRuntime = vi.fn();
    const runWorker = vi.fn();
    await expect(runMediaProxyMasterTranscodeProductRuntimeV2({
      jobId: 'missing-job',
      workerId: 'worker-v2',
    }, {
      jobStore: {
        getForWorkerExecution: vi.fn(async () => null),
      } as never,
      createPrivateRuntime,
      runWorker,
    })).resolves.toEqual({ kind: 'skipped', reason: 'not_found' });
    expect(createPrivateRuntime).not.toHaveBeenCalled();
    expect(runWorker).not.toHaveBeenCalled();
  });

  it('composes the exact V2 owners before invoking the durable worker', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const setup = dependencies(fixture);
    await expect(runMediaProxyMasterTranscodeProductRuntimeV2({
      jobId: fixture.job.jobId,
      workerId: 'worker-v2',
    }, setup.dependencies)).resolves.toEqual({
      kind: 'skipped',
      reason: 'fixture_worker',
    });

    expect(setup.createPrivateRuntime).toHaveBeenCalledTimes(1);
    expect(setup.createMultipartCoordinator).toHaveBeenCalledWith(
      expect.objectContaining({
        heartbeatPolicy: fixture.base.operationalPolicies.heartbeat,
      }),
    );
    const workerInput = setup.runWorker.mock.calls[0]?.[0];
    expect(workerInput).toMatchObject({
      jobId: fixture.job.jobId,
      workerId: 'worker-v2',
      attemptOwner: {
        runtimePolicyBindingSha256:
          fixture.contract.payload.runtimePolicy.bindingSha256,
        publicationPolicySha256:
          fixture.contract.payload.publicationPolicy.policySha256,
        preparedArtifactPolicySha256:
          fixture.contract.payload.preparedArtifactPolicy.policySha256,
      },
      budgetOwner: {
        ownerId: fixture.base.policy.ownerId,
        ownerVersion: fixture.base.policy.ownerVersion,
        policySha256: fixture.base.policy.policySha256,
      },
    });
  });

  it('rejects a substituted deployment before private storage is opened', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const setup = dependencies(fixture);
    const environment = {
      ...setup.dependencies.environment,
      [MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1]:
        '0'.repeat(64),
    };
    await expect(runMediaProxyMasterTranscodeProductRuntimeV2({
      jobId: fixture.job.jobId,
      workerId: 'worker-v2',
    }, {
      ...setup.dependencies,
      environment,
    })).rejects.toBeInstanceOf(
      MediaProxyMasterTranscodeProductRuntimeErrorV2,
    );
    expect(setup.createPrivateRuntime).not.toHaveBeenCalled();
    expect(setup.runWorker).not.toHaveBeenCalled();
  });

  it('settles terminal work without requiring FFmpeg or private R2', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const setup = dependencies(fixture);
    const terminalJob = {
      ...fixture.job,
      status: 'completed' as const,
      remainingAttempts: 0,
      expiresAt: MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
    };
    setup.getForWorkerExecution.mockResolvedValueOnce(terminalJob);
    await expect(runMediaProxyMasterTranscodeProductRuntimeV2({
      jobId: terminalJob.jobId,
      workerId: 'worker-v2',
    }, {
      ...setup.dependencies,
      environment: {},
    })).resolves.toEqual({ kind: 'skipped', reason: 'fixture_worker' });
    expect(setup.createPrivateRuntime).not.toHaveBeenCalled();
    const workerInput = setup.runWorker.mock.calls[0]?.[0];
    expect(workerInput?.attemptOwner)
      .toMatchObject({
        runtimePolicyBindingSha256:
          fixture.contract.payload.runtimePolicy.bindingSha256,
      });
  });
});

function dependencies(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const profile = fixture.contract.payload.runtimePolicy.executionProfile;
  const record = createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
    fixture.base.policy,
    fixture.budgetAuthorization,
    fixture.budgetReservation,
  );
  const ledgerOwner = {
    reserve: vi.fn(),
    resolve: vi.fn(async () => ({ policy: fixture.base.policy, record })),
    settle: vi.fn(),
  };
  const getForWorkerExecution = vi.fn(async () => fixture.job);
  const createPrivateRuntime = vi.fn(() => privateRuntime(fixture));
  const createMultipartCoordinator = vi.fn(() => ({
    publishOrResume: vi.fn(),
  }));
  const runWorker = vi.fn<
    Parameters<typeof runMediaProxyMasterTranscodeDurableWorkerV2>,
    ReturnType<typeof runMediaProxyMasterTranscodeDurableWorkerV2>
  >(async () => ({ kind: 'skipped', reason: 'fixture_worker' }));
  const environment = {
    [MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1]:
      profile.workerImageDigest,
    [MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1]:
      profile.compatibilityReceiptSha256,
    [MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1]:
      path.resolve('fixture-bin', 'ffmpeg'),
    [MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1]:
      path.resolve('fixture-bin', 'ffprobe'),
  };
  return {
    getForWorkerExecution,
    createPrivateRuntime,
    createMultipartCoordinator,
    runWorker,
    dependencies: {
      environment,
      jobStore: { getForWorkerExecution } as never,
      policyRegistry:
        createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
          activeRetryPolicy: fixture.base.operationalPolicies.retry,
          activeHeartbeatPolicy: fixture.base.operationalPolicies.heartbeat,
          retainedRetryPolicies: [],
          retainedHeartbeatPolicies: [],
        }),
      ledgerOwner,
      createPrivateRuntime,
      createAssetStore: vi.fn(async () => ({} as never)),
      currentTimeMapPort: { read: vi.fn() },
      createPreparedExecutor: vi.fn(() => ({ prepare: vi.fn() })),
      createMultipartStore: vi.fn(() => ({} as never)),
      createMultipartCoordinator,
      runWorker,
      runtimePlatform: profile.platform,
      clock: () => new Date('2026-08-30T00:12:30.000Z'),
    },
  };
}

function privateRuntime(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const method = vi.fn();
  return {
    proxyMasterTranscodePublication: {
      publicationPolicy:
        fixture.contract.payload.publicationPolicy.singlePut.policy,
      publisher: { publish: method },
    },
    proxyMasterPreparedArtifactStore: {
      stage: method,
      recover: method,
      reopen: method,
    },
    proxyMasterMultipartTransport: {
      inspectLocalArtifact: method,
      discoverUploads: method,
      createUpload: method,
      listParts: method,
      inspectLocalPart: method,
      uploadPart: method,
      complete: method,
      verifyPublishedObject: method,
      abort: method,
    },
  } as never;
}
