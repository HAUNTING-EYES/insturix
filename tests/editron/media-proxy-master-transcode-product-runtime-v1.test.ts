import path from 'node:path';

import { MongoNetworkError } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { buildMediaProxyMasterTranscodeDurableJobContractV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1,
  runMediaProxyMasterTranscodeProductRuntimeV1,
  type MediaProxyMasterTranscodeProductRuntimeDependenciesV1,
} from '@/lib/editron/services/media-proxy-master-transcode-product-runtime-v1';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  mediaProxyMasterBudgetHashV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

const NOW = new Date('2026-08-30T00:15:00.000Z');

describe('proxy master transcode product runtime v1', () => {
  it('returns not-found before resolving deployment owners or claiming', async () => {
    const fixture = build();
    fixture.jobStore.getForWorkerExecution.mockResolvedValueOnce(null);
    await expect(run(fixture)).resolves.toEqual({
      kind: 'skipped', reason: 'not_found',
    });
    expect(fixture.createPrivateRuntime).not.toHaveBeenCalled();
    expect(fixture.ledgerOwner.resolve).not.toHaveBeenCalled();
    expect(fixture.jobStore.claim).not.toHaveBeenCalled();
  });

  it('qualifies every concrete owner before invoking the lifecycle claim', async () => {
    const fixture = build();
    await expect(run(fixture)).resolves.toEqual({
      kind: 'skipped', reason: 'lease_held',
    });
    expect(fixture.jobStore.getForWorkerExecution).toHaveBeenCalledWith({
      jobId: fixture.job.jobId,
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_proxy_master_trusted_transcode',
      inputSchemaId: fixture.job.input.schemaId,
    });
    expect(fixture.createExecutor).toHaveBeenCalledWith(expect.objectContaining({
      ffmpegPath:
        fixture.environment[MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1],
      ffprobePath:
        fixture.environment[MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1],
      runtime: expect.objectContaining({
        workerImageDigest:
          fixture.budget.runtimePolicy.executionProfile.workerImageDigest,
        platform: fixture.budget.runtimePolicy.executionProfile.platform,
        ffmpegVersion:
          fixture.budget.runtimePolicy.executionProfile.ffmpegVersion,
        ffprobeVersion:
          fixture.budget.runtimePolicy.executionProfile.ffprobeVersion,
      }),
    }));
    for (const owner of [
      fixture.createPrivateRuntime,
      fixture.ledgerOwner.resolve,
      fixture.createAssetStore,
      fixture.createExecutor,
    ]) {
      expect(owner.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.jobStore.claim.mock.invocationCallOrder[0]!,
      );
    }
  });

  it('blocks policy, deployment, publication and Finance drift before claim',
    async () => {
    const missingPolicy = build();
    await expect(run(missingPolicy, {
      ...missingPolicy.dependencies,
      policyRegistry: undefined,
      environment: {},
    })).rejects.toThrow('OPERATIONAL_POLICY_MISSING_REGISTRY');
    expect(missingPolicy.jobStore.claim).not.toHaveBeenCalled();

    const unknownPolicy = build();
    await expect(run(unknownPolicy, {
      ...unknownPolicy.dependencies,
      policyRegistry: {
        ...unknownPolicy.policyRegistry,
        resolveRetry() { throw new Error('unknown historical policy'); },
      },
    })).rejects.toThrow('OPERATIONAL_POLICY_BINDING_UNAVAILABLE');
    expect(unknownPolicy.jobStore.claim).not.toHaveBeenCalled();

    const image = build();
    image.environment[MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1] =
      hash('wrong-image');
    await expect(run(image)).rejects.toThrow('WORKER_IMAGE_MISMATCH');
    expect(image.createPrivateRuntime).not.toHaveBeenCalled();

    const toolchain = build();
    toolchain.environment[MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1]
      = hash('wrong-toolchain');
    await expect(run(toolchain)).rejects.toThrow('TOOLCHAIN_RECEIPT_MISMATCH');
    expect(toolchain.createPrivateRuntime).not.toHaveBeenCalled();

    const platform = build();
    await expect(run(platform, {
      ...platform.dependencies,
      runtimePlatform: 'win32-x64',
    })).rejects.toThrow('RUNTIME_PLATFORM_MISMATCH');
    expect(platform.createPrivateRuntime).not.toHaveBeenCalled();

    const executable = build();
    executable.environment[MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1] =
      'ffmpeg';
    await expect(run(executable)).rejects.toThrow('FFMPEG_PATH_INVALID');
    expect(executable.createPrivateRuntime).not.toHaveBeenCalled();

    const publication = build();
    publication.createPrivateRuntime.mockReturnValueOnce({
      proxyMasterTranscodePublication: {
        publicationPolicy:
          createMediaProxyMasterR2PrivatePublicationPolicyV1({
            bucketName: 'different-private-bucket',
            storagePolicyVersion: 'private-proxy-media-v1',
            browserRouteExposure: 'NO_BROWSER_ROUTE',
          }),
        publisher: publication.publisher,
      },
    });
    await expect(run(publication)).rejects.toThrow(
      'PRIVATE_PUBLICATION_POLICY_MISMATCH',
    );
    expect(publication.ledgerOwner.resolve).not.toHaveBeenCalled();

    const finance = build();
    finance.ledgerOwner.resolve.mockRejectedValueOnce(
      new Error('finance unavailable'),
    );
    await expect(run(finance)).rejects.toThrow('finance unavailable');
    expect(finance.createAssetStore).not.toHaveBeenCalled();
    expect(finance.jobStore.claim).not.toHaveBeenCalled();
  });

  it('settles terminal replay without current FFmpeg, R2 or asset owners', async () => {
    const fixture = build();
    const terminal = snapshot(fixture.contract, {
      status: 'cancelled',
      attemptCount: 0,
      remainingAttempts: 6,
      terminalReceipt: {
        disposition: 'CANCELLED',
        receiptId: 'cancel-proxy-product-1',
        receiptSha256: hash('cancelled'),
        proofReferences: [],
        completedAt: NOW.toISOString(),
      },
    });
    fixture.jobStore.getForWorkerExecution.mockResolvedValueOnce(terminal);
    fixture.jobStore.claim.mockResolvedValueOnce({
      kind: 'skipped', reason: 'terminal', job: terminal,
    } as never);
    await expect(run(fixture, {
      ...fixture.dependencies,
      environment: {},
    })).resolves.toEqual({ kind: 'skipped', reason: 'terminal' });
    expect(fixture.createPrivateRuntime).not.toHaveBeenCalled();
    expect(fixture.createAssetStore).not.toHaveBeenCalled();
    expect(fixture.createExecutor).not.toHaveBeenCalled();
    expect(fixture.ledgerOwner.settle).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'RELEASED_NO_EXECUTION' }),
    );
  });

  it('turns a post-preclaim Mongo outage into a policy-governed retry', async () => {
    const fixture = build();
    const running = snapshot(fixture.contract, {
      status: 'running',
      attemptCount: 1,
      remainingAttempts: 5,
      leaseOwnerId: 'worker-proxy-product-1',
      leaseExpiresAt: '2026-08-30T00:20:00.000Z',
    });
    fixture.jobStore.claim.mockResolvedValueOnce({
      kind: 'claimed', job: running, leaseToken: 'lease-proxy-product-1',
    } as never);
    fixture.jobStore.getAuthorized.mockResolvedValueOnce(running);
    fixture.ledgerOwner.resolve
      .mockResolvedValueOnce({
        policy: fixture.budget.policy,
        record: fixture.record,
      })
      .mockRejectedValueOnce(new MongoNetworkError('Atlas unavailable'));

    await expect(run(fixture)).resolves.toMatchObject({
      kind: 'retry_wait',
      errorCode: 'PROXY_BUDGET_MONGO_NETWORK_UNAVAILABLE',
    });
    expect(fixture.jobStore.retryOrDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'PROXY_BUDGET_MONGO_NETWORK_UNAVAILABLE',
          retryable: true,
        }),
      }),
    );
    expect(fixture.executor.execute).not.toHaveBeenCalled();
  });
});

function run(
  fixture: ReturnType<typeof build>,
  dependencies = fixture.dependencies,
) {
  return runMediaProxyMasterTranscodeProductRuntimeV1({
    jobId: fixture.job.jobId,
    workerId: 'worker-proxy-product-1',
  }, dependencies);
}

function build() {
  const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV1({
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: budget.command,
    publicationPolicy: budget.publicationPolicy,
    runtimePolicy: budget.runtimePolicy,
    budgetReservation: {
      reservationId: budget.reservation.reservationId,
      bindingSha256: budget.reservation.reservationSha256,
    },
  });
  const job = snapshot(contract);
  const record =
    createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
      budget.policy,
      budget.authorization,
      budget.reservation,
    );
  const ledgerOwner = {
    reserve: vi.fn(async () => budget.reservation),
    resolve: vi.fn(async () => ({ policy: budget.policy, record })),
    settle: vi.fn(async () => ({} as never)),
  } satisfies MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1;
  const unavailable = vi.fn(async () => {
    throw new Error('UNEXPECTED_JOB_STORE_CALL');
  });
  const jobStore = {
    getForWorkerExecution: vi.fn(async (): Promise<typeof job | null> => job),
    claim: vi.fn(async () => ({ kind: 'skipped' as const, reason: 'lease_held' })),
    heartbeat: vi.fn(async () => 'ACTIVE' as const),
    saveResumeState: unavailable,
    complete: unavailable,
    retryOrDeadLetter: vi.fn(async () => 'retry_wait' as const),
    markCancelled: unavailable,
    getAuthorized: vi.fn(async () => job as DurableWorkflowJobSnapshotV1),
  };
  const policyRegistry =
    createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
      activeRetryPolicy: budget.operationalPolicies.retry,
      activeHeartbeatPolicy: budget.operationalPolicies.heartbeat,
      retainedRetryPolicies: [],
      retainedHeartbeatPolicies: [],
    });
  const publisher = { publish: vi.fn() };
  const createPrivateRuntime = vi.fn(() => ({
    proxyMasterTranscodePublication: {
      publicationPolicy: budget.publicationPolicy,
      publisher,
    },
  }));
  const assetStore = { load: vi.fn() };
  const createAssetStore = vi.fn(async () => assetStore);
  const currentTimeMapPort = { read: vi.fn() };
  const executor = { execute: vi.fn() };
  const createExecutor = vi.fn(() => executor);
  const environment: Record<string, string | undefined> = {
    [MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1]:
      budget.runtimePolicy.executionProfile.workerImageDigest,
    [MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1]:
      budget.runtimePolicy.executionProfile.compatibilityReceiptSha256,
    [MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1]:
      path.resolve('ffmpeg-proxy-product'),
    [MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1]:
      path.resolve('ffprobe-proxy-product'),
  };
  const dependencies: MediaProxyMasterTranscodeProductRuntimeDependenciesV1 = {
    environment,
    jobStore: jobStore as never,
    policyRegistry,
    ledgerOwner,
    createPrivateRuntime,
    createAssetStore,
    currentTimeMapPort,
    createExecutor,
    runtimePlatform: 'linux-x64',
    clock: () => NOW,
  };
  return {
    budget, contract, job, record, ledgerOwner, jobStore, policyRegistry,
    publisher, createPrivateRuntime, createAssetStore, createExecutor,
    executor, environment, dependencies,
  };
}

function snapshot(
  contract: ReturnType<typeof buildMediaProxyMasterTranscodeDurableJobContractV1>,
  overrides: Partial<DurableWorkflowJobSnapshotV1> = {},
): DurableWorkflowJobSnapshotV1 {
  return {
    jobId: 'dwj_proxy_product_1',
    version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_proxy_master_trusted_transcode',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: contract.payload.version,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 6,
    remainingAttempts: 6,
    retryCursor: null,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
    resumeState: null,
    terminalReceipt: null,
    error: null,
    dispatchTransport: 'QSTASH',
    dispatchMessageId: 'message-proxy-product-1',
    dispatchCount: 1,
    createdAt: '2026-08-30T00:10:00.000Z',
    updatedAt: '2026-08-30T00:10:00.000Z',
    expiresAt: '2026-09-06T00:10:00.000Z',
    ...overrides,
  };
}

function hash(value: string): string {
  return mediaProxyMasterBudgetHashV1(value);
}
