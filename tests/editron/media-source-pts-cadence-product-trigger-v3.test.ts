import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import type {
  MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3,
  MediaSourcePtsCadenceEpochQStashPublisherV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-dispatch-v3';
import {
  triggerQualifiedMediaSourcePtsCadenceV3,
} from '@/lib/editron/services/media-source-pts-cadence-product-trigger-v3';
import { MEDIA_SOURCE_PROBE_VERSION_V1 }
  from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const ENV: MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3 = {
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-key',
  NEXT_PUBLIC_APP_URL: 'https://editron.example.test',
};

describe('media source PTS cadence product trigger V3', () => {
  it('persists and dispatches one user-owned job after exact qualification', async () => {
    const setup = jobStore();
    const asset = assetFixture({ kind: 'USER', userId: 'user-1' });
    const publishJSON = vi.fn(async () => ({ messageId: 'message-1' }));
    const result = await triggerQualifiedMediaSourcePtsCadenceV3(
      message(asset.qualification),
      dependencies(asset, setup.store, publishJSON),
    );

    expect(result).toMatchObject({
      disposition: 'SCHEDULED',
      created: true,
      delivery: 'CONFIRMED',
      messageId: 'message-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
    if (result.disposition !== 'SCHEDULED') throw new Error('expected job');
    await expect(setup.store.getAuthorized({
      jobId: result.jobId,
      tenantId: 'user-1',
      userId: 'user-1',
    })).resolves.toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_pts_cadence_epoch_scan',
      dispatchMessageId: 'message-1',
    });
  });

  it('uses the canonical source organization as tenant scope', async () => {
    const setup = jobStore();
    const asset = assetFixture({ kind: 'ORG', orgId: 'org-1' });
    const result = await triggerQualifiedMediaSourcePtsCadenceV3(
      message(asset.qualification),
      dependencies(asset, setup.store, vi.fn(async () => ({ messageId: 'message-org' }))),
    );

    if (result.disposition !== 'SCHEDULED') throw new Error('expected job');
    await expect(setup.store.getAuthorized({
      jobId: result.jobId,
      tenantId: 'org-1',
      userId: 'user-1',
    })).resolves.toMatchObject({ orgId: 'org-1' });
  });

  it('retains a recoverable job when signed delivery is unavailable', async () => {
    const setup = jobStore();
    const asset = assetFixture({ kind: 'USER', userId: 'user-1' });
    const result = await triggerQualifiedMediaSourcePtsCadenceV3(
      message(asset.qualification),
      {
        ...dependencies(asset, setup.store, vi.fn()),
        environment: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      },
    );

    expect(result).toMatchObject({
      disposition: 'DELIVERY_DEFERRED',
      created: true,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    });
    if (result.disposition !== 'DELIVERY_DEFERRED') throw new Error('expected deferred');
    await expect(setup.store.getAuthorized({
      jobId: result.jobId,
      tenantId: 'user-1',
      userId: 'user-1',
    })).resolves.toMatchObject({ status: 'queued', dispatchMessageId: null });
  });

  it('is idempotent across terminal qualification redelivery', async () => {
    const setup = jobStore();
    const asset = assetFixture({ kind: 'USER', userId: 'user-1' });
    const publishJSON = vi.fn(async () => ({ messageId: 'message-once' }));
    const deps = dependencies(asset, setup.store, publishJSON);
    const first = await triggerQualifiedMediaSourcePtsCadenceV3(
      message(asset.qualification),
      deps,
    );
    const second = await triggerQualifiedMediaSourcePtsCadenceV3(
      message(asset.qualification),
      deps,
    );

    expect(first).toMatchObject({ disposition: 'SCHEDULED', created: true });
    expect(second).toMatchObject({
      disposition: 'SCHEDULED',
      created: false,
      delivery: 'ALREADY_CONFIRMED',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it('does not guess among multiple video streams', async () => {
    const setup = jobStore();
    const base = assetFixture({ kind: 'USER', userId: 'user-1' });
    const qualification = withVideoStreams(base.qualification, [0, 2]);
    const publishJSON = vi.fn();
    await expect(triggerQualifiedMediaSourcePtsCadenceV3(
      message(qualification),
      dependencies({
        ...base,
        qualification,
        sourceQualificationV1: qualification,
      }, setup.store, publishJSON),
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'VIDEO_STREAM_SELECTION_REQUIRED',
    });
    expect(publishJSON).not.toHaveBeenCalled();
    expect(setup.collection.snapshot()).toHaveLength(0);
  });

  it('does not schedule non-video or superseded source bindings', async () => {
    const setup = jobStore();
    const audio = assetFixture(
      { kind: 'USER', userId: 'user-1' },
      'audio',
    );
    await expect(triggerQualifiedMediaSourcePtsCadenceV3(
      message(audio.qualification),
      dependencies(audio, setup.store, vi.fn()),
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'MEDIA_KIND_NOT_VIDEO',
    });
    await expect(triggerQualifiedMediaSourcePtsCadenceV3(
      { ...message(audio.qualification), sourceBindingSha256: 'f'.repeat(64) },
      dependencies(audio, setup.store, vi.fn()),
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'SOURCE_BINDING_SUPERSEDED',
    });
    expect(setup.collection.snapshot()).toHaveLength(0);
  });
});

function dependencies(
  asset: ReturnType<typeof assetFixture>,
  store: DurableWorkflowJobStoreV1,
  publishJSON: MediaSourcePtsCadenceEpochQStashPublisherV3['publishJSON'],
) {
  return {
    assetStore: { load: vi.fn(async () => asset) },
    jobStore: store,
    environment: ENV,
    publisher: { publishJSON },
    now: NOW,
  };
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function message(qualification: MediaSourceQualificationRecordV1) {
  return {
    assetId: qualification.assetId,
    userId: 'user-1',
    sourceBindingSha256: qualification.sourceBindingSha256,
  };
}

function assetFixture(
  owner: MediaSourceOwnerV1,
  mediaKind: 'video' | 'audio' = 'video',
) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'uploads/source.mov' },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersionV1 = createMediaSourceVersionV1({
    owner,
    assetId: 'asset-1',
    mediaKind,
    byteLength: 1_000,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const qualification = withVideoStreams(qualificationFixture(storageVersion), [0]);
  return {
    assetId: 'asset-1',
    type: mediaKind,
    sourceVersionV1,
    sourceQualificationV1: qualification,
    qualification,
  };
}

function qualificationFixture(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
): MediaSourceQualificationRecordV1 {
  return {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: storageVersion.locator,
    sourceBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      assetId: 'asset-1',
      locator: storageVersion.locator,
    }),
    requestId: 'media-source-probe:product-trigger',
    attemptCount: 1,
    requestedAt: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    storageVersion,
    observation: null,
    diagnostic: null,
  };
}

function withVideoStreams(
  qualification: MediaSourceQualificationRecordV1,
  streamIndices: readonly number[],
): MediaSourceQualificationRecordV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion: `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: streamIndices.map((streamIndex) => ({
      streamIndex,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    })),
    audioStreams: [],
  };
  return {
    ...qualification,
    observation: {
      ...material,
      observationSha256: hashEditronCanonicalJsonV1(material),
    },
  };
}
