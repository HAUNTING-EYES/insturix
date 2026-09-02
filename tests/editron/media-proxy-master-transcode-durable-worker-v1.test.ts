import { describe, expect, it, vi } from 'vitest';

import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobRecordV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  buildMediaProxyMasterTranscodeDurableJobContractV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterTranscodeOutputProbeV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1,
  MediaProxyMasterTranscodeDurableWorkerPortErrorV1,
  runMediaProxyMasterTranscodeDurableWorkerV1,
  type MediaProxyMasterTranscodeBudgetOwnerV1,
  type MediaProxyMasterTranscodeExecutionOwnerV1,
  type MediaProxyMasterTranscodeRetryOwnerV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T20:00:00.000Z');
type DurableWorkerInputV1 = Parameters<
  typeof runMediaProxyMasterTranscodeDurableWorkerV1
>[0];

describe('MediaProxyMasterTranscodeDurableWorkerV1', () => {
  it('persists the trusted result before PASS and resettles terminal replay', async () => {
    const fixture = await workerFixture();

    expect(await fixture.run()).toMatchObject({
      kind: 'completed', jobId: fixture.jobId, disposition: 'PASS',
    });
    expect(await fixture.snapshot()).toMatchObject({
      status: 'completed',
      resumeState: { sequence: 1 },
      terminalReceipt: { disposition: 'PASS' },
    });
    expect(fixture.transcodeOwner.execute).toHaveBeenCalledTimes(1);
    expect(fixture.currentAssetOwner.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);

    expect(await fixture.run()).toEqual({ kind: 'skipped', reason: 'terminal' });
    expect(fixture.transcodeOwner.execute).toHaveBeenCalledTimes(1);
    expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(2);
  });

  it('resumes a persisted result without transcoding after completion transport loss',
    async () => {
      const fixture = await workerFixture();
      let failComplete = true;
      const failingStore = storePorts(fixture.jobStore, async (args) => {
        if (failComplete) {
          failComplete = false;
          throw new Error('simulated completion transport loss');
        }
        return fixture.jobStore.complete(args);
      });

      expect(await fixture.run({ jobStore: failingStore })).toEqual({
        kind: 'retry_wait',
        jobId: fixture.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_POST_RESUME_TRANSITION_FAILED',
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait',
        resumeState: { sequence: 1 },
        nextAttemptAt: '2026-08-30T20:00:01.000Z',
      });
      fixture.advance(1_001);

      expect(await fixture.run()).toMatchObject({
        kind: 'completed', disposition: 'PASS',
      });
      expect(fixture.transcodeOwner.execute).toHaveBeenCalledTimes(1);
      expect(fixture.currentAssetOwner.resolve).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(2);
    });

  it('retries an owner-classified transient executor result', async () => {
    const fixture = await workerFixture();
    fixture.transcodeOwner.execute.mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
    });
    fixture.retryOwner.decide.mockImplementationOnce(async ({ now }) => ({
      disposition: 'RETRY_AT',
      retryAt: new Date(now.getTime() + 1_000),
    }));

    expect(await fixture.run()).toEqual({
      kind: 'retry_wait',
      jobId: fixture.jobId,
      errorCode: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
    });
    expect(await fixture.snapshot()).toMatchObject({
      status: 'retry_wait',
      resumeState: null,
      retryCursor: {
        retryPolicySha256: fixture.retryOwner.policySha256,
        retryDecisionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        retryDisposition: 'RETRY_AT',
      },
    });
    expect(fixture.budgetOwner.settleTerminal).not.toHaveBeenCalled();
  });

  it('terminalizes an owner-classified executor gap as UNVERIFIABLE', async () => {
    const fixture = await workerFixture();
    fixture.transcodeOwner.execute.mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH',
    });

    expect(await fixture.run()).toMatchObject({
      kind: 'completed', disposition: 'UNVERIFIABLE',
    });
    const completed = await fixture.snapshot();
    expect(completed).toMatchObject({
      status: 'completed', resumeState: null,
      terminalReceipt: { disposition: 'UNVERIFIABLE' },
    });
    expect(completed?.terminalReceipt?.proofReferences.map(({ proofId }) => proofId))
      .toEqual([
        'execution-budget-authorization', 'private-publication-policy',
        'trusted-proxy-transcode-execution', 'retry-policy-decision',
      ]);
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
  });

  it('retries a typed current-asset owner outage without executor access',
    async () => {
      const fixture = await workerFixture();
      fixture.currentAssetOwner.resolve.mockRejectedValueOnce(
        new MediaProxyMasterTranscodeDurableWorkerPortErrorV1(
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
          true,
        ),
      );

      expect(await fixture.run()).toEqual({
        kind: 'retry_wait',
        jobId: fixture.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait',
        error: {
          code:
            'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
          retryable: true,
        },
      });
      expect(fixture.transcodeOwner.execute).not.toHaveBeenCalled();
      expect(fixture.budgetOwner.settleTerminal).not.toHaveBeenCalled();
    });

  it('dead-letters typed invalid current-asset evidence', async () => {
    const fixture = await workerFixture();
    fixture.currentAssetOwner.resolve.mockRejectedValueOnce(
      new MediaProxyMasterTranscodeDurableWorkerPortErrorV1(
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
        false,
      ),
    );

    expect(await fixture.run()).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode:
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
    });
    expect(fixture.transcodeOwner.execute).not.toHaveBeenCalled();
    expect(fixture.retryOwner.decide).not.toHaveBeenCalled();
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
  });

  it('dead-letters owner binding drift before budget, asset, or executor access',
    async () => {
      const fixture = await workerFixture();
      expect(await fixture.run({
        transcodeOwner: {
          ...fixture.transcodeOwner,
          publicationPolicySha256: hash('wrong-publication-policy'),
        },
      })).toEqual({
        kind: 'dead_letter',
        jobId: fixture.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_OWNER_BINDING_MISMATCH',
      });
      expect(fixture.budgetOwner.authorize).not.toHaveBeenCalled();
      expect(fixture.currentAssetOwner.resolve).not.toHaveBeenCalled();
      expect(fixture.transcodeOwner.execute).not.toHaveBeenCalled();
      expect(fixture.budgetOwner.settleTerminal).not.toHaveBeenCalled();
    });

  it('dead-letters a canonically rehashed forged resume without retranscoding',
    async () => {
      const fixture = await workerFixture();
      const failingStore = storePorts(fixture.jobStore, async () => {
        throw new Error('simulated completion transport loss');
      });
      expect(await fixture.run({ jobStore: failingStore }))
        .toMatchObject({ kind: 'retry_wait' });
      const record = fixture.collection.snapshot()
        .find(({ jobId }) => jobId === fixture.jobId)!;
      const forgedPayload = {
        ...record.resumeState!.payload,
        publicationPolicySha256: hash('forged-publication-policy'),
      };
      await fixture.collection.updateOne(
        { _id: fixture.jobId },
        { $set: { resumeState: {
          ...record.resumeState,
          payload: forgedPayload,
          stateSha256: hashDurableWorkflowJobJsonV1(forgedPayload),
        } } },
      );
      fixture.advance(1_001);

      expect(await fixture.run()).toEqual({
        kind: 'dead_letter',
        jobId: fixture.jobId,
        errorCode: 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESUME_INVALID',
      });
      expect(fixture.transcodeOwner.execute).toHaveBeenCalledTimes(1);
    });

  it('periodically observes cancellation and aborts the in-flight executor',
    async () => {
      const fixture = await workerFixture({ heartbeatIntervalMs: 1 });
      fixture.transcodeOwner.execute.mockImplementationOnce(async ({ abortSignal }) => {
        await fixture.jobStore.requestCancellation({
          jobId: fixture.jobId,
          tenantId: 'tenant-a',
          userId: 'user-a',
          requestedBy: 'user-a',
          reason: 'cancel_proxy_transcode',
          now: fixture.now(),
        });
        await new Promise<void>((_resolve, reject) => {
          abortSignal?.addEventListener('abort', () => {
            reject(new Error('executor aborted by heartbeat'));
          }, { once: true });
        });
        throw new Error('unreachable');
      });

      expect(await fixture.run()).toEqual({
        kind: 'cancelled', jobId: fixture.jobId,
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
      });
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
    });
});

async function workerFixture(input: Readonly<{
  heartbeatIntervalMs?: number;
}> = {}) {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  let nowMs = START.getTime();
  const request = jobRequest();
  const created = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
    jobStore, request, now: new Date(nowMs),
  });
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV1(request);
  const budgetOwner = {
    ...request.runtimePolicy.executionBudgetPolicy,
    authorize: vi.fn(async () => ({
      disposition: 'AUTHORIZED' as const,
      reservationId: request.budgetReservation.reservationId,
      reservationBindingSha256: request.budgetReservation.bindingSha256,
      authorizationReceiptSha256: hash('budget-authorization'),
    })),
    settleTerminal: vi.fn(async () => undefined),
  } satisfies MediaProxyMasterTranscodeBudgetOwnerV1;
  const decideRetry: MediaProxyMasterTranscodeRetryOwnerV1['decide'] =
    async ({ retryableHint, now }) => (
      retryableHint === true
        ? {
            disposition: 'RETRY_AT' as const,
            retryAt: new Date(now.getTime() + 1_000),
          }
        : {
            disposition: 'STOP_UNVERIFIABLE' as const,
            reason: 'policy-stop',
          }
    );
  const retryOwner = {
    ...request.runtimePolicy.retryPolicy,
    decide: vi.fn(decideRetry),
  } satisfies MediaProxyMasterTranscodeRetryOwnerV1;
  const heartbeatOwner = {
    ...request.runtimePolicy.heartbeatPolicy,
    heartbeatIntervalMs: input.heartbeatIntervalMs ?? 1_000,
  };
  const currentAssetOwner = {
    ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
    ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
    runtimePolicyBindingSha256: request.runtimePolicy.bindingSha256,
    resolve: vi.fn(async () => ({}) as never),
  };
  const executeTranscode: MediaProxyMasterTranscodeExecutionOwnerV1['execute'] =
    async () => ({
      disposition: 'COMPLETED' as const,
      receipt: trustedReceipt(request.command),
    });
  const transcodeOwner = {
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1,
    ownerVersion: request.command.policy.policyVersion,
    runtimePolicyBindingSha256: request.runtimePolicy.bindingSha256,
    publicationPolicySha256: request.publicationPolicy.policySha256,
    execute: vi.fn(executeTranscode),
  } satisfies MediaProxyMasterTranscodeExecutionOwnerV1;
  const base = {
    jobStore,
    jobId: created.job.jobId,
    workerId: 'proxy-worker-a',
    budgetOwner,
    retryOwner,
    heartbeatOwner,
    currentAssetOwner,
    transcodeOwner,
    clock: () => new Date(nowMs),
  } satisfies DurableWorkerInputV1;
  return {
    ...base,
    contract,
    collection,
    now: () => new Date(nowMs),
    advance(milliseconds: number) { nowMs += milliseconds; },
    snapshot: async () => jobStore.getAuthorized({
      jobId: created.job.jobId,
      tenantId: 'tenant-a',
      userId: 'user-a',
    }),
    run: (overrides: Partial<DurableWorkerInputV1> = {}) => (
      runMediaProxyMasterTranscodeDurableWorkerV1({ ...base, ...overrides })
    ),
  };
}

function jobRequest() {
  const command = transcodeCommand();
  const runtimePolicy = createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: { maxAttempts: 6, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    executionBudgetPolicy: policyOwner('budget'),
    retryPolicy: policyOwner('retry'),
    heartbeatPolicy: policyOwner('heartbeat'),
    executionProfile: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
      compatibilityReceiptSha256: hash('compatibility'),
    },
  });
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command,
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    }),
    runtimePolicy,
    budgetReservation: {
      reservationId: 'reservation-a',
      bindingSha256: hash('reservation-a'),
    },
  };
}

function transcodeCommand() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/master.mp4' },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-master' },
  });
  const master = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('master-content'),
    storageVersion,
  });
  const policy = createMediaProxyMasterTranscodePolicyV1({
    presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
    timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
    container: 'mp4',
    videoCodec: 'libx264',
    pixelFormat: 'yuv420p',
    scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
    maximumWidth: 1_920,
    maximumHeight: 1_080,
    videoCrf: 23,
    videoPreset: 'fast',
    keyframeIntervalSeconds: 2,
    audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
    audioCodec: 'aac',
    audioBitrateBitsPerSecond: 192_000,
    maxSourceBytes: 5_000_000,
    maxOutputBytes: 2_000_000,
    timeoutMs: 120_000,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-worker-1',
    policy,
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: hash('source-binding'),
      technicalObservationSha256: hash('observation'),
      sourcePtsCadenceMapStateSha256V3: hash('state'),
      mapBindingSha256: hash('map-binding'),
      terminalReceiptSha256: hash('map-terminal'),
      verificationSha256: hash('map-verification'),
      epochIndexContentSha256: hash('epoch-index'),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [],
  });
}

function trustedReceipt(command: ReturnType<typeof transcodeCommand>) {
  const contentSha256 = hash('proxy-content');
  const objectKey = expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
    command,
    proxyContentSha256: contentSha256,
  });
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey },
    byteLength: 40_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-proxy' },
  });
  const proxy = createMediaSourceVersionV1({
    owner: command.masterSourceVersion.owner,
    assetId: command.masterSourceVersion.assetId,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256,
    storageVersion,
  });
  return createMediaProxyMasterTrustedTranscodeReceiptV1({
    command,
    runtime: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
    },
    process: {
      startedAt: '2026-08-30T19:00:00.000Z',
      completedAt: '2026-08-30T19:01:00.000Z',
      exitCode: 0,
      stderrByteLength: 0,
      stderrSha256: hash('empty-stderr'),
    },
    masterLocalFileEvidence: {
      sourceVersionSha256: command.masterSourceVersion.sourceVersionSha256,
      storageVersionSha256:
        command.masterSourceVersion.storageVersion.storageVersionSha256,
      byteLength: command.masterSourceVersion.byteLength,
      contentSha256: command.masterSourceVersion.contentSha256,
    },
    proxySourceVersion: proxy,
    outputProbe: createMediaProxyMasterTranscodeOutputProbeV1({
      commandSha256: command.commandSha256,
      ffprobeVersion: 'ffprobe version 8.1',
      proxyContentSha256: proxy.contentSha256,
      proxyByteLength: proxy.byteLength,
      container: 'mp4',
      formatNames: ['mov', 'mp4'],
      video: {
        streamIndex: 0,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        codedWidth: 1_280,
        codedHeight: 720,
        sourceTimebase: { numerator: '1', denominator: '90000' },
        sourceStartPts: '0',
        sourceDurationTicks: '900000',
        frameCount: '300',
      },
      audio: [],
      probedAt: '2026-08-30T19:01:01.000Z',
    }),
    outputVideoStreamIndex: 0,
    outputAudioStreamIndexes: [],
    completedAt: '2026-08-30T19:01:02.000Z',
  });
}

function policyOwner(tag: string) {
  return {
    ownerId: `${tag}-owner`,
    ownerVersion: `${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function storePorts(
  store: DurableWorkflowJobStoreV1,
  complete: DurableWorkflowJobStoreV1['complete'],
) {
  return {
    claim: store.claim.bind(store),
    heartbeat: store.heartbeat.bind(store),
    saveResumeState: store.saveResumeState.bind(store),
    complete,
    retryOrDeadLetter: store.retryOrDeadLetter.bind(store),
    markCancelled: store.markCancelled.bind(store),
    getAuthorized: store.getAuthorized.bind(store),
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
