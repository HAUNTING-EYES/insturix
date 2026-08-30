import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  createMediaProxyMasterTranscodeCurrentAssetOwnerV1,
  type MediaProxyMasterTranscodeCurrentAssetStoreV1,
} from '@/lib/editron/services/media-proxy-master-transcode-current-asset-owner-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import type { MediaProxyMasterCurrentTimeMapPortV1 }
  from '@/lib/editron/services/media-proxy-master-trusted-transcode-executor-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 }
  from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T22:00:00.000Z');

describe('MediaProxyMasterTranscodeCurrentAssetOwnerV1', () => {
  it('returns only the exact current source and V3 time map', async () => {
    const fixture = await ownerFixture();

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).resolves.toBe(fixture.asset);
    expect(fixture.load).toHaveBeenCalledWith(
      fixture.jobInput.assetId,
      fixture.jobInput.userId,
    );
    expect(fixture.readTimeMap).toHaveBeenCalledWith(fixture.asset);
  });

  it('returns null for an absent current asset', async () => {
    const fixture = await ownerFixture();
    fixture.load.mockResolvedValueOnce(null);

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).resolves.toBeNull();
    expect(fixture.readTimeMap).not.toHaveBeenCalled();
  });

  it('classifies a current-asset store outage as retryable', async () => {
    const fixture = await ownerFixture();
    fixture.load.mockRejectedValueOnce(new Error('mongo unavailable'));

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).rejects.toMatchObject({
      code:
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
      retryable: true,
    });
    expect(fixture.readTimeMap).not.toHaveBeenCalled();
  });

  it('permanently rejects source substitution and V3 map drift', async () => {
    const substituted = await ownerFixture();
    substituted.load.mockResolvedValueOnce({
      ...substituted.asset,
      sourceVersionV1: createMediaSourceVersionV1({
        ...substituted.jobInput.command.masterSourceVersion,
        contentSha256: hash('substituted-master'),
      }),
    });
    await expect(substituted.owner.resolve({
      job: substituted.job,
      jobInput: substituted.jobInput,
    })).rejects.toMatchObject({
      code: 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
      retryable: false,
    });
    expect(substituted.readTimeMap).not.toHaveBeenCalled();

    const mapDrift = await ownerFixture();
    mapDrift.readTimeMap.mockResolvedValueOnce({
      ...mapDrift.jobInput.command.masterTimeMap,
      totalFrameCount: '299',
    });
    await expect(mapDrift.owner.resolve({
      job: mapDrift.job,
      jobInput: mapDrift.jobInput,
    })).rejects.toMatchObject({
      code: 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
      retryable: false,
    });
  });

  it('rejects an unclaimed job or mismatched runtime binding before storage',
    async () => {
      const fixture = await ownerFixture();
      await expect(fixture.owner.resolve({
        job: { ...fixture.job, status: 'queued' },
        jobInput: fixture.jobInput,
      })).rejects.toMatchObject({ retryable: false });
      expect(fixture.load).not.toHaveBeenCalled();

      const wrongOwner = createMediaProxyMasterTranscodeCurrentAssetOwnerV1({
        runtimePolicyBindingSha256: hash('wrong-runtime'),
        assetStore: { load: fixture.load },
        currentTimeMapPort: { read: fixture.readTimeMap },
      });
      await expect(wrongOwner.resolve({
        job: fixture.job,
        jobInput: fixture.jobInput,
      })).rejects.toMatchObject({
        code: 'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
        retryable: false,
      });
      expect(fixture.load).not.toHaveBeenCalled();
    });
});

async function ownerFixture() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  const request = jobRequest();
  const created = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
    jobStore: store,
    request,
    now: START,
  });
  const claim = await store.claim({
    jobId: created.job.jobId,
    workerId: 'current-asset-owner-test',
    now: START,
  });
  if (claim.kind !== 'claimed') throw new Error('TEST_CLAIM_REQUIRED');
  const jobInput = assertMediaProxyMasterTranscodeDurableJobV1(claim.job);
  const asset = {
    assetId: jobInput.assetId,
    type: 'video',
    sourceVersionV1: jobInput.command.masterSourceVersion,
  } as MediaSourcePtsCadenceMapAssetStateInputV3;
  const loadAsset: MediaProxyMasterTranscodeCurrentAssetStoreV1['load'] =
    async () => asset;
  const readCurrentTimeMap: MediaProxyMasterCurrentTimeMapPortV1['read'] =
    async () => jobInput.command.masterTimeMap;
  const load = vi.fn(loadAsset);
  const readTimeMap = vi.fn(readCurrentTimeMap);
  const owner = createMediaProxyMasterTranscodeCurrentAssetOwnerV1({
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    assetStore: { load },
    currentTimeMapPort: { read: readTimeMap },
  });
  return { asset, job: claim.job, jobInput, load, owner, readTimeMap };
}

function jobRequest() {
  const command = transcodeCommand();
  return {
    tenantId: 'tenant-current-asset',
    userId: 'user-current-asset',
    orgId: null,
    assetId: 'asset-current-asset',
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
      reservationId: 'reservation-current-asset',
      bindingSha256: hash('reservation-current-asset'),
    },
  };
}

function transcodeCommand() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/master-current.mp4' },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-master-current' },
  });
  const master = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-current-asset' },
    assetId: 'asset-current-asset',
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
    transcodeJobId: 'transcode-current-asset-1',
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
