import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  assertMediaProxyMasterTranscodeDurableWorkerMessageV1,
  dispatchMediaProxyMasterTranscodeDurableJobV1,
  recoverMediaProxyMasterTranscodeDurableJobsV1,
  resolveMediaProxyMasterTranscodeDurableDispatchConfigurationV1,
  type MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
  type MediaProxyMasterTranscodeQStashPublisherV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v1';
import {
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T21:00:00.000Z');
const ENV: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1 = {
  QSTASH_TOKEN: 'test-qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
const DELIVERY_POLICY = Object.freeze({
  retries: 2,
  retryDelayMs: 30_000,
  timeoutSeconds: 300,
});
type PublishInputV1 = Parameters<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>[0];
type PublishResultV1 = ReturnType<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>;

describe('MediaProxyMasterTranscodeDurableDispatchV1', () => {
  it('fails closed before job creation when signed dispatch is incomplete',
    async () => {
      const createOrGet = vi.fn();
      await expect(dispatchMediaProxyMasterTranscodeDurableJobV1({
        request: jobRequest(),
        jobStore: { createOrGet, recordDispatch: vi.fn() },
        deliveryPolicy: DELIVERY_POLICY,
        env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
        publisher: publisher('unused-message'),
      })).rejects.toThrow(
        'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
      );
      expect(createOrGet).not.toHaveBeenCalled();
    });

  it('publishes jobId only, records delivery and does not republish replay',
    async () => {
      const setup = jobStore();
      const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
        async () => ({ messageId: 'message-proxy-1' }),
      );
      const first = await dispatchMediaProxyMasterTranscodeDurableJobV1({
        request: jobRequest(),
        jobStore: setup.store,
        deliveryPolicy: DELIVERY_POLICY,
        env: ENV,
        publisher: { publishJSON },
        now: START,
      });

      expect(first).toMatchObject({
        state: 'dispatched', created: true, messageId: 'message-proxy-1',
      });
      expect(publishJSON).toHaveBeenCalledOnce();
      const published = publishJSON.mock.calls[0]![0];
      expect(published.url).toBe(
        'https://editron-preview.example.test/api/internal/workers/media-proxy-master-transcode',
      );
      expect(published.body).toEqual({ jobId: first.jobId });
      expect(Object.keys(published.body as object)).toEqual(['jobId']);
      expect(published.deduplicationId).toBe(first.jobId);
      expect(published).toMatchObject({
        retries: 2, retryDelay: '30000', timeout: 300,
      });
      await expect(setup.store.getAuthorized({
        jobId: first.jobId,
        tenantId: 'tenant-proxy-dispatch',
        userId: 'user-proxy-dispatch',
      })).resolves.toMatchObject({
        operationOwner: 'MEDIA_ASSETS',
        operationKind: 'media_proxy_master_trusted_transcode',
        input: {
          schemaId: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V1_1',
        },
        dispatchMessageId: 'message-proxy-1',
        dispatchCount: 1,
      });

      await expect(dispatchMediaProxyMasterTranscodeDurableJobV1({
        request: jobRequest(),
        jobStore: setup.store,
        deliveryPolicy: DELIVERY_POLICY,
        env: ENV,
        publisher: { publishJSON },
        now: START,
      })).resolves.toMatchObject({
        state: 'already_dispatched',
        jobId: first.jobId,
        messageId: 'message-proxy-1',
      });
      expect(publishJSON).toHaveBeenCalledOnce();
    });

  it('distinguishes an unconfirmed send from an unrecorded delivery',
    async () => {
      const unconfirmed = jobStore();
      await expect(dispatchMediaProxyMasterTranscodeDurableJobV1({
        request: jobRequest(),
        jobStore: unconfirmed.store,
        deliveryPolicy: DELIVERY_POLICY,
        env: ENV,
        publisher: { publishJSON: vi.fn(async () => ({})) },
        now: START,
      })).resolves.toMatchObject({
        state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_MISSING',
      });

      const unknown = jobStore();
      await expect(dispatchMediaProxyMasterTranscodeDurableJobV1({
        request: jobRequest(),
        jobStore: {
          createOrGet: unknown.store.createOrGet.bind(unknown.store),
          recordDispatch: vi.fn(async () => {
            throw new Error('mongo unavailable');
          }),
        },
        deliveryPolicy: DELIVERY_POLICY,
        env: ENV,
        publisher: publisher('message-proxy-maybe-delivered'),
        now: START,
      })).resolves.toMatchObject({
        state: 'delivery_unknown',
        messageId: 'message-proxy-maybe-delivered',
        reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
      });
    });

  it('recovers only stale proxy-transcode jobs with state-bound deduplication',
    async () => {
      const setup = jobStore();
      const created = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
        jobStore: setup.store,
        request: jobRequest(),
        now: START,
      });
      const wrongFamily = {
        ...created.job,
        jobId: 'dwj_wrong_proxy_family',
        operationKind: 'media_source_audio_materialization',
      };
      const fresh = {
        ...created.job,
        jobId: 'dwj_fresh_proxy_job',
        updatedAt: new Date(START.getTime() + 120_000).toISOString(),
      };
      const listRecoverable = vi.fn(async () => [
        created.job, wrongFamily, fresh,
      ]);
      const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
        async () => ({ messageId: 'message-proxy-recovery' }),
      );

      const result = await recoverMediaProxyMasterTranscodeDurableJobsV1({
        jobStore: {
          listRecoverable,
          recordDispatch: setup.store.recordDispatch.bind(setup.store),
        },
        staleBefore: new Date(START.getTime() + 60_000),
        deliveryPolicy: DELIVERY_POLICY,
        now: new Date(START.getTime() + 180_000),
        env: ENV,
        publisher: { publishJSON },
      });

      expect(result).toMatchObject({ scanned: 3, eligible: 1, skipped: 2 });
      expect(result.results).toEqual([{
        jobId: created.job.jobId,
        state: 'dispatched',
        messageId: 'message-proxy-recovery',
      }]);
      expect(publishJSON.mock.calls[0]![0].body)
        .toEqual({ jobId: created.job.jobId });
      expect(publishJSON.mock.calls[0]![0].deduplicationId)
        .toMatch(/^[a-f0-9]{64}$/);
    });

  it('requires a strict jobId message and secure worker origin', () => {
    expect(assertMediaProxyMasterTranscodeDurableWorkerMessageV1({
      jobId: 'dwj_proxy_job_1',
    })).toEqual({ jobId: 'dwj_proxy_job_1' });
    expect(() => assertMediaProxyMasterTranscodeDurableWorkerMessageV1({
      jobId: 'dwj_proxy_job_1',
      sourceUrl: 'https://must-not-enter.example/source.mov',
    })).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_WORKER_MESSAGE_INVALID');
    expect(resolveMediaProxyMasterTranscodeDurableDispatchConfigurationV1({
      ...ENV,
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(resolveMediaProxyMasterTranscodeDurableDispatchConfigurationV1(ENV))
      .toMatchObject({
        configured: true,
        workerUrl:
          'https://editron-preview.example.test/api/internal/workers/media-proxy-master-transcode',
      });
  });
});

function publisher(messageId: string):
MediaProxyMasterTranscodeQStashPublisherV1 {
  return { publishJSON: vi.fn(async () => ({ messageId })) };
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    store: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
  };
}

function jobRequest() {
  const command = transcodeCommand();
  return {
    tenantId: 'tenant-proxy-dispatch',
    userId: 'user-proxy-dispatch',
    orgId: null,
    assetId: 'asset-proxy-dispatch',
    command,
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    }),
    runtimePolicy: createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
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
    }),
    budgetReservation: {
      reservationId: 'reservation-proxy-dispatch',
      bindingSha256: hash('reservation-proxy-dispatch'),
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
    owner: { kind: 'USER', userId: 'user-proxy-dispatch' },
    assetId: 'asset-proxy-dispatch',
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
    transcodeJobId: 'transcode-dispatch-1',
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

function policyOwner(tag: string) {
  return {
    ownerId: `${tag}-owner`,
    ownerVersion: `${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
