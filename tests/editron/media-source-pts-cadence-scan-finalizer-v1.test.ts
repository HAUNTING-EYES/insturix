import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-state-v2';
import { persistMediaSourcePtsCadenceMapAssetStateV2 } from '@/lib/editron/services/media-source-pts-cadence-map-asset-store-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  serializeMediaSourcePtsCadenceManifestSidecarV1,
  serializeMediaSourcePtsCadenceShardSidecarV1,
} from '@/lib/editron/services/media-source-pts-cadence-private-sidecar-codec-v1';
import {
  finalizeMediaSourcePtsCadenceScanV1,
  type MediaSourcePtsCadenceFinalizerStateOwnerV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-finalizer-v1';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 } from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import { createMediaSourcePtsCadenceScanRequestV1 } from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence scan finalizer V1', () => {
  it('publishes exact source-wide cadence evidence and replays without rewriting artifacts', async () => {
    const fixture = finalizerFixture();
    await expect(finalizeMediaSourcePtsCadenceScanV1({
      ...fixture.input,
      manifestPolicy: { ...fixture.input.manifestPolicy, policyVersion: 'wrong-policy' },
    })).resolves.toEqual({ disposition: 'REJECTED', reason: 'MANIFEST_POLICY_BINDING_MISMATCH' });
    expect(fixture.writeCount()).toBe(0);
    const completed = await finalizeMediaSourcePtsCadenceScanV1(fixture.input);

    expect(completed).toMatchObject({
      disposition: 'COMPLETED',
      state: {
        sourcePtsCadenceMapV2: {
          lifecycleV1: { status: 'COMPLETE', activeClaim: null },
          terminalReceipt: {
            sourceCadence: { kind: 'CFR', durationTicks: '3003' },
            sourceStartPresentationTimestampTicks: '0',
            sourceEndExclusivePresentationTimestampTicks: '12012',
          },
        },
      },
    });
    expect(fixture.stateOwner.persist).toHaveBeenCalledTimes(5);
    const writes = fixture.writeCount();

    const replay = await finalizeMediaSourcePtsCadenceScanV1(fixture.input);
    expect(replay).toMatchObject({ disposition: 'ALREADY_COMPLETE' });
    expect(fixture.writeCount()).toBe(writes);
    expect(fixture.stateOwner.persist).toHaveBeenCalledTimes(5);
  });

  it('refuses a foreign active claim before reading staging or writing canonical artifacts', async () => {
    const fixture = finalizerFixture();
    const initial = createMediaSourcePtsCadenceMapAssetRecordV2({ bootstrapShard: fixture.bootstrapShard, now: new Date('2026-08-25T00:00:00.000Z') });
    const claimed = claimMediaSourcePtsCadenceMapAssetRecordV2({
      record: initial, claimId: 'foreign-cadence-claim',
      now: new Date('2026-08-25T00:00:01.000Z'),
      expiresAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    Object.assign(fixture.asset, createMediaSourcePtsCadenceMapAssetStateV2({ asset: fixture.asset, record: claimed }));

    await expect(finalizeMediaSourcePtsCadenceScanV1(fixture.input)).resolves.toEqual({
      disposition: 'BUSY',
      activeClaimId: 'foreign-cadence-claim',
    });
    expect(fixture.stagingReader.read).not.toHaveBeenCalled();
    expect(fixture.writeCount()).toBe(0);
    expect(fixture.stateOwner.persist).not.toHaveBeenCalled();
  });

  it('surfaces initialization CAS loss without publishing completion', async () => {
    const fixture = finalizerFixture();
    const racedOwner: MediaSourcePtsCadenceFinalizerStateOwnerV1 = {
      load: fixture.stateOwner.load,
      persist: vi.fn(async () => ({ disposition: 'RACE_LOST' as const })),
    };

    await expect(finalizeMediaSourcePtsCadenceScanV1({
      ...fixture.input,
      stateOwner: racedOwner,
    })).resolves.toEqual({ disposition: 'REJECTED', reason: 'STORE_RACE_LOST' });
    expect(fixture.asset.sourcePtsCadenceMapV2).toBeUndefined();
  });
});

function finalizerFixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1', mediaKind: 'video', byteLength: 12_345,
    contentSha256: 'b'.repeat(64), storageVersion,
  });
  const qualification = qualificationRecord(storageVersion);
  const mapper = {
    mapperVersion: 'media-pts-mapper-v2', ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'policy-v2', timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const frames = [
    { presentationTimestampTicks: '0', durationTicks: '3003' },
    { presentationTimestampTicks: '3003', durationTicks: '3003' },
    { presentationTimestampTicks: '6006', durationTicks: '3003' },
    { presentationTimestampTicks: '9009', durationTicks: '3003' },
  ] as const;
  const bootstrapShard = createMediaSourcePtsCadenceShardV1({
    sourceVersion, qualification, videoStreamIndex: 0, mapper,
    shardSequence: 0, firstFrameOrdinal: '0', frames: frames.slice(0, 2),
  });
  const mapBinding = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1' as const,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation!.observationSha256,
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    mapper,
  };
  expect(mediaSourcePtsCadenceMapBindingSha256V1(bootstrapShard)).toBe(hashEditronCanonicalJsonV1(mapBinding));
  const resourcePolicy = {
    policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100,
  };
  const request = createMediaSourcePtsCadenceScanRequestV1({
    mapBinding,
    resourcePolicy,
    sourceUrl: 'https://tenant.example.test/source.mov?signature=secret',
  });
  const staging = [frames.slice(0, 2), frames.slice(2)].map((batchFrames, index, all) => {
    const previous = index === 0 ? null : all[0];
    const previousSerialization = previous ? serializeMediaSourcePtsCadenceScanStagingBatchV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
      mapBindingSha256: request.mapBindingSha256,
      resourcePolicy,
      sourceTimebase: mapBinding.sourceTimebase,
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      shardSequence: 0,
      firstFrameOrdinal: '0',
      previousBatchContentSha256: null,
      frames: previous,
    }) : null;
    return serializeMediaSourcePtsCadenceScanStagingBatchV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
      mapBindingSha256: request.mapBindingSha256,
      resourcePolicy,
      sourceTimebase: mapBinding.sourceTimebase,
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      shardSequence: index,
      firstFrameOrdinal: String(index * 2),
      previousBatchContentSha256: previousSerialization?.contentSha256 ?? null,
      frames: batchFrames,
    });
  });
  const stagingSidecars = staging.map((serialization) =>
    createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }));
  const result = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy,
    ffprobeVersion: mapper.ffprobeVersion,
    videoStreamIndex: 0,
    sourceTimebase: mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches: staging.map((serialization, index) => ({
      shardSequence: index,
      firstFrameOrdinal: String(index * 2),
      frameCount: '2',
      startPresentationTimestampTicks: String(index * 6006),
      endExclusivePresentationTimestampTicks: String((index + 1) * 6006),
      previousBatchContentSha256: index ? staging[0].contentSha256 : null,
      sidecar: stagingSidecars[index],
    })),
    totalFrameCount: '4',
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '12012',
  };
  const stagingReader = {
    read: vi.fn(async (sidecar: (typeof stagingSidecars)[number]) => {
      const index = stagingSidecars.findIndex(({ objectKey }) => objectKey === sidecar.objectKey);
      if (index < 0) throw new Error('TEST_STAGING_MISSING');
      return staging[index].batch;
    }),
  };
  const objects = new Map<string, StoredObject>();
  const descriptorPort = {
    writeImmutableShard: vi.fn(async ({ mapBindingSha256, shard, expected }) => {
      const serialized = serializeMediaSourcePtsCadenceShardSidecarV1({
        storage: 'R2_PRIVATE', mapBindingSha256, shard,
      });
      objects.set(expected.objectKey, stored(serialized));
      return expected;
    }),
    writeImmutableManifest: vi.fn(async ({ mapBindingSha256, checkpoint, expected }) => {
      const serialized = serializeMediaSourcePtsCadenceManifestSidecarV1({
        storage: 'R2_PRIVATE', mapBindingSha256, checkpoint,
      });
      objects.set(expected.objectKey, stored(serialized));
      return expected;
    }),
  };
  const artifactPort = {
    writeImmutableFrameBatch: vi.fn(async ({ serialization, expected }) => {
      objects.set(expected.objectKey, stored(serialization));
      return expected;
    }),
    writeImmutableManifestIndex: vi.fn(async ({ serialization, expected }) => {
      objects.set(expected.objectKey, stored(serialization));
      return expected;
    }),
    read: async ({ objectKey }: { objectKey: string }) => readStored(objects, objectKey),
  };
  const asset: MediaSourcePtsCadenceMapAssetStateInputV2 = {
    assetId: 'asset-1', type: 'video', sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const stateOwner = memoryStateOwner(asset);
  let clock = Date.parse('2026-08-25T00:00:00.000Z');
  const input = {
    assetId: 'asset-1', userId: 'user-1', claimId: 'cadence-claim-finalizer',
    claimExpiresAt: new Date('2026-08-26T00:00:00.000Z'),
    now: () => new Date(clock += 1000),
    request, result, sourceVersion, qualification,
    coveragePolicyVersion: 'coverage-v2',
    manifestPolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 },
    stagingReader, descriptorPort, artifactPort,
    lifecycleManifestReader: { read: async ({ objectKey }: { objectKey: string }) => readStored(objects, objectKey) },
    stateOwner,
  };
  return {
    asset, bootstrapShard, input, stagingReader, stateOwner,
    writeCount: () => descriptorPort.writeImmutableShard.mock.calls.length
      + descriptorPort.writeImmutableManifest.mock.calls.length
      + artifactPort.writeImmutableFrameBatch.mock.calls.length
      + artifactPort.writeImmutableManifestIndex.mock.calls.length,
  };
}

function memoryStateOwner(asset: MediaSourcePtsCadenceMapAssetStateInputV2) {
  const load = vi.fn(async () => asset);
  const persist = vi.fn(async (input: Parameters<MediaSourcePtsCadenceFinalizerStateOwnerV1['persist']>[0]) =>
    persistMediaSourcePtsCadenceMapAssetStateV2(input, {
      load,
      replace: async ({ expectedState, nextState }) => {
        if ((asset.sourcePtsCadenceMapStateSha256V2 ?? null)
          !== (expectedState?.sourcePtsCadenceMapStateSha256V2 ?? null)) return false;
        Object.assign(asset, nextState, { sourcePtsCadenceMapV1: null, sourcePtsCadenceMapStateSha256V1: null });
        return true;
      },
    }));
  return { load, persist } satisfies MediaSourcePtsCadenceFinalizerStateOwnerV1;
}

function qualificationRecord(storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const, kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1', formatName: 'mov', durationMilliseconds: 134,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: '12012',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' }, frameCount: '4',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709', colorRange: 'tv',
      timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1', status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1', locator: { provider: 'R2', objectKey: 'media/source.mov' },
    sourceBindingSha256: 'c'.repeat(64), requestId: 'media-source-probe:fixture', attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z', startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z', storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

type StoredObject = Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
type Storable = Readonly<{ canonicalJson: string; byteLength?: number; contentSha256?: string; sidecar?: Readonly<{ byteLength: number; contentSha256: string }> }>;
function stored(value: Storable): StoredObject {
  const byteLength = value.byteLength ?? value.sidecar?.byteLength;
  const contentSha256 = value.contentSha256 ?? value.sidecar?.contentSha256;
  if (!byteLength || !contentSha256) throw new Error('TEST_SERIALIZATION_METADATA_MISSING');
  return { canonicalJson: value.canonicalJson, byteLength, contentSha256 };
}
function readStored(objects: Map<string, StoredObject>, objectKey: string): StoredObject {
  const value = objects.get(objectKey);
  if (!value) throw new Error('TEST_OBJECT_MISSING');
  return value;
}
