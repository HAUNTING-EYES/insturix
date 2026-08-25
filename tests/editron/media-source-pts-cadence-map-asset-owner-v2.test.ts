import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV2,
  checkpointMediaSourcePtsCadenceMapAssetRecordV2,
  completeMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  createMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetRecordV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
  type MediaSourcePtsCadenceStoredObjectReaderV2,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-state-v2';
import {
  mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2,
  persistMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStorePortsV2,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-store-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import {
  serializeMediaSourcePtsCadenceManifestSidecarV1,
  serializeMediaSourcePtsCadenceShardSidecarV1,
} from '@/lib/editron/services/media-source-pts-cadence-private-sidecar-codec-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourcePtsCadenceSourceCoverageV2 } from '@/lib/editron/services/media-source-pts-cadence-source-coverage-v2';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceMapAssetOwnerV2', () => {
  it('checkpoints stored recoverable batches and terminalizes exact full-source CFR evidence', async () => {
    const fixture = ownerFixture();
    const first = await fixture.checkpoint(0);
    if (first.disposition !== 'CHECKPOINTED') throw new Error(JSON.stringify(first));
    const second = await fixture.checkpoint(1, first.record);
    if (second.disposition !== 'CHECKPOINTED') throw new Error(JSON.stringify(second));
    const terminal = await fixture.complete(second.record);
    if (terminal.disposition !== 'COMPLETED') throw new Error(JSON.stringify(terminal));

    expect(first.disposition).toBe('CHECKPOINTED');
    expect(second.record.lifecycleV1.checkpoint).toMatchObject({
      appendedShardCount: '2',
      nextFrameOrdinal: '4',
      nextPresentationTimestampTicks: '12012',
    });
    expect(terminal).toMatchObject({
      disposition: 'COMPLETED',
      record: { lifecycleV1: { status: 'COMPLETE', activeClaim: null } },
      receipt: {
        sourceCadence: { kind: 'CFR', durationTicks: '3003' },
        sourceStartPresentationTimestampTicks: '0',
        sourceEndExclusivePresentationTimestampTicks: '12012',
      },
    });
    expect(terminal.receipt.terminalReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => claimMediaSourcePtsCadenceMapAssetRecordV2({
      record: terminal.record,
      claimId: 'cadence_claim_replay',
      now: new Date('2026-08-25T00:50:00.000Z'),
      expiresAt: new Date('2026-08-25T01:00:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL');
  });

  it('fails closed when an index was not stored, a sidecar is forged, or source coverage is partial', async () => {
    const missing = ownerFixture();
    missing.objects.delete(missing.indexSidecars[0].objectKey);
    await expect(missing.checkpoint(0)).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'MANIFEST_INDEX_NOT_STORED',
    });

    const forged = ownerFixture();
    await expect(forged.checkpoint(0, undefined, {
      ...forged.indexSidecars[0],
      contentSha256: 'f'.repeat(64),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_SIDECAR_MISMATCH');

    const expired = ownerFixture();
    await expect(checkpointMediaSourcePtsCadenceMapAssetRecordV2({
      record: expired.record,
      claimId: expired.claimId,
      frameBatch: expired.batches[0].serialization,
      descriptorSidecar: expired.descriptorSidecars[0],
      manifestIndex: expired.indexes[0],
      manifestIndexSidecar: expired.indexSidecars[0],
      previousManifestIndex: null,
      storedObjectReader: expired.storedObjectReader,
      frameBatchReader: expired.frameBatchReader,
      now: () => new Date('2026-08-25T01:00:00.000Z'),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_NOT_ACTIVE');

    const partial = ownerFixture();
    const first = await partial.checkpoint(0);
    if (first.disposition !== 'CHECKPOINTED') throw new Error(JSON.stringify(first));
    const result = await partial.complete(first.record, 0);
    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_COVERAGE_UNVERIFIABLE',
      coverageReason: 'SOURCE_RANGE_INCOMPLETE',
    });
  });

  it('refuses non-extending checkpoint history and altered stored batch bytes', async () => {
    const history = ownerFixture();
    const first = await history.checkpoint(0);
    if (first.disposition !== 'CHECKPOINTED') throw new Error(JSON.stringify(first));
    await expect(checkpointMediaSourcePtsCadenceMapAssetRecordV2({
      record: first.record,
      claimId: history.claimId,
      frameBatch: history.batches[1].serialization,
      descriptorSidecar: history.descriptorSidecars[1],
      manifestIndex: history.indexes[1],
      manifestIndexSidecar: history.indexSidecars[1],
      previousManifestIndex: null,
      storedObjectReader: history.storedObjectReader,
      frameBatchReader: history.frameBatchReader,
      now: () => new Date('2026-08-25T00:30:00.000Z'),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_PREVIOUS_MANIFEST_MISSING');

    const bytes = ownerFixture();
    const stored = bytes.objects.get(bytes.batches[0].sidecar.objectKey)!;
    bytes.objects.set(bytes.batches[0].sidecar.objectKey, {
      ...stored,
      canonicalJson: `${stored.canonicalJson} `,
    });
    await expect(bytes.checkpoint(0)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INDEX_INTEGRITY_UNVERIFIABLE',
    });
  });

  it('persists one source-bound V2 pair and rejects stale, legacy, changed-source, and raced writes', async () => {
    const fixture = ownerFixture();
    const memory = assetMemory(fixture.asset);
    const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
      bootstrapShard: fixture.batches[0].serialization.payload.shard,
      now: new Date('2026-08-25T00:00:00.000Z'),
    });
    const applied = await persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1', expectedStateSha256: null, nextRecord: initial,
    }, memory.ports);
    expect(applied).toMatchObject({ disposition: 'APPLIED' });
    if (applied.disposition !== 'APPLIED') throw new Error('TEST_V2_INITIAL_WRITE_FAILED');

    const claimed = claimMediaSourcePtsCadenceMapAssetRecordV2({
      record: initial,
      claimId: 'cadence_claim_store',
      now: new Date('2026-08-25T00:10:00.000Z'),
      expiresAt: new Date('2026-08-25T01:00:00.000Z'),
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1', expectedStateSha256: 'f'.repeat(64), nextRecord: claimed,
    }, memory.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH',
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1',
      expectedStateSha256: applied.state.sourcePtsCadenceMapStateSha256V2,
      nextRecord: claimed,
    }, memory.ports)).resolves.toMatchObject({ disposition: 'APPLIED' });

    const filter = mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2({
      assetId: 'asset-1', userId: 'user-1', expectedState: null,
      nextState: createMediaSourcePtsCadenceMapAssetStateV2({ asset: fixture.asset, record: initial }),
    });
    expect(filter).toMatchObject({
      type: 'video',
      'sourceVersionV1.sourceVersionSha256': fixture.sourceVersion.sourceVersionSha256,
      'sourceQualificationV1.observation.observationSha256':
        fixture.qualification.observation!.observationSha256,
    });
    expect(filter.$and).toHaveLength(4);

    const legacy = assetMemory({
      ...fixture.asset,
      sourcePtsCadenceMapV1: initial.lifecycleV1,
      sourcePtsCadenceMapStateSha256V1: 'a'.repeat(64),
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1', expectedStateSha256: null, nextRecord: initial,
    }, legacy.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'LEGACY_V1_STATE_PRESENT',
    });

    const changed = assetMemory({
      ...fixture.asset,
      sourceVersionV1: { ...fixture.sourceVersion, sourceVersionSha256: '9'.repeat(64) },
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1', expectedStateSha256: null, nextRecord: initial,
    }, changed.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'NEXT_STATE_INVALID',
    });

    const raced = assetMemory(fixture.asset, false);
    await expect(persistMediaSourcePtsCadenceMapAssetStateV2({
      assetId: 'asset-1', userId: 'user-1', expectedStateSha256: null, nextRecord: initial,
    }, raced.ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
  });

  it('rejects a partial or tampered persisted V2 pair', () => {
    const fixture = ownerFixture();
    const record = createMediaSourcePtsCadenceMapAssetRecordV2({
      bootstrapShard: fixture.batches[0].serialization.payload.shard,
      now: new Date('2026-08-25T00:00:00.000Z'),
    });
    const state = createMediaSourcePtsCadenceMapAssetStateV2({ asset: fixture.asset, record });
    expect(() => createMediaSourcePtsCadenceMapAssetStateV2({
      asset: { ...fixture.asset, sourcePtsCadenceMapV1: record.lifecycleV1 },
      record,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_PARALLEL_V1_STATE_FORBIDDEN');
    expect(() => createMediaSourcePtsCadenceMapAssetStateV2({
      asset: fixture.asset,
      record: { ...state.sourcePtsCadenceMapV2, lifecycleV1: { ...record.lifecycleV1, mapBindingSha256: '0'.repeat(64) } },
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_BINDING_MISMATCH');
  });
});

function ownerFixture() {
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
  const batches = [frames.slice(0, 2), frames.slice(2)].map((batchFrames, index) => {
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion, qualification, videoStreamIndex: 0, mapper,
      shardSequence: index, firstFrameOrdinal: String(index * 2), frames: batchFrames,
    });
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256: mediaSourcePtsCadenceMapBindingSha256V1(shard),
      resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100 },
      shard, frames: batchFrames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: 'R2_PRIVATE', serialization,
      }),
    };
  });
  const indexes = [1, 2].map((count) => createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256: batches[0].serialization.payload.mapBindingSha256,
    resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 },
    batches: batches.slice(0, count),
  }));
  const indexSidecars = indexes.map((manifestIndex) =>
    createMediaSourcePtsCadenceManifestIndexSidecarV2({
      storage: 'R2_PRIVATE', manifestIndex,
    }));
  const descriptorSidecars = batches.map(({ serialization }) =>
    serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: serialization.payload.mapBindingSha256,
      shard: serialization.payload.shard,
    }).sidecar);
  const objects = new Map<string, StoredObject>();
  batches.forEach(({ serialization, sidecar }) => objects.set(sidecar.objectKey, stored(serialization)));
  indexes.forEach((serialization, index) => objects.set(indexSidecars[index].objectKey, stored(serialization)));
  const storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2 = {
    read: async ({ objectKey }) => {
      const value = objects.get(objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    },
  };
  const frameBatchReader = {
    read: async ({ objectKey }: { objectKey: string }) => {
      const value = objects.get(objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    },
  };
  const claimId = 'cadence_claim_owner_v2';
  const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
    bootstrapShard: batches[0].serialization.payload.shard,
    now: new Date('2026-08-25T00:00:00.000Z'),
  });
  let current = claimMediaSourcePtsCadenceMapAssetRecordV2({
    record: initial, claimId,
    now: new Date('2026-08-25T00:10:00.000Z'),
    expiresAt: new Date('2026-08-25T01:00:00.000Z'),
  });
  const checkpoint = async (
    index: number,
    record: MediaSourcePtsCadenceMapAssetRecordV2 = current,
    manifestIndexSidecar = indexSidecars[index],
  ) => {
    const result = await checkpointMediaSourcePtsCadenceMapAssetRecordV2({
      record, claimId,
      frameBatch: batches[index].serialization,
      descriptorSidecar: descriptorSidecars[index],
      manifestIndex: indexes[index], manifestIndexSidecar,
      previousManifestIndex: index === 0 ? null : indexes[index - 1],
      storedObjectReader, frameBatchReader,
      now: () => new Date(`2026-08-25T00:${20 + index * 10}:00.000Z`),
    });
    if (result.disposition === 'CHECKPOINTED') current = result.record;
    return result;
  };
  const complete = async (record: MediaSourcePtsCadenceMapAssetRecordV2, index = 1) => {
    const lifecycleManifest = serializeMediaSourcePtsCadenceManifestSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: record.lifecycleV1.mapBindingSha256,
      checkpoint: record.lifecycleV1.checkpoint,
    });
    objects.set(lifecycleManifest.sidecar.objectKey, stored(lifecycleManifest));
    return completeMediaSourcePtsCadenceMapAssetRecordV2({
      record, claimId,
      coverage: createMediaSourcePtsCadenceSourceCoverageV2({
        sourceVersion, qualification, videoStreamIndex: 0, mapper,
        coveragePolicyVersion: 'coverage-v2',
      }),
      manifestIndex: indexes[index],
      lifecycleManifest: lifecycleManifest.sidecar,
      storedObjectReader, frameBatchReader,
      now: () => new Date('2026-08-25T00:40:00.000Z'),
    });
  };
  return {
    sourceVersion,
    qualification,
    asset: { assetId: 'asset-1', type: 'video', sourceVersionV1: sourceVersion, sourceQualificationV1: qualification },
    batches,
    indexes,
    indexSidecars,
    descriptorSidecars,
    objects,
    storedObjectReader,
    frameBatchReader,
    claimId,
    record: current,
    checkpoint,
    complete,
  };
}

type StoredObject = Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
type StorableSerialization = Readonly<{
  canonicalJson: string;
  byteLength?: number;
  contentSha256?: string;
  sidecar?: Readonly<{ byteLength: number; contentSha256: string }>;
}>;

function stored(value: StorableSerialization): StoredObject {
  const byteLength = value.byteLength ?? value.sidecar?.byteLength;
  const contentSha256 = value.contentSha256 ?? value.sidecar?.contentSha256;
  if (!byteLength || !contentSha256) throw new Error('TEST_SERIALIZATION_METADATA_MISSING');
  return {
    canonicalJson: value.canonicalJson,
    byteLength,
    contentSha256,
  };
}

function qualificationRecord(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
): MediaSourceQualificationRecordV1 {
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
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL', assetId: 'asset-1',
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    sourceBindingSha256: 'c'.repeat(64), requestId: 'media-source-probe:fixture',
    attemptCount: 1, requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z', completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function assetMemory(asset: MediaSourcePtsCadenceMapAssetStateInputV2, replaceResult = true) {
  const memory = { asset: { ...asset } };
  const replace = vi.fn(async (input: Parameters<MediaSourcePtsCadenceMapAssetStorePortsV2['replace']>[0]) => {
    if (!replaceResult) return false;
    const currentHash = memory.asset.sourcePtsCadenceMapStateSha256V2 ?? null;
    if (currentHash !== (input.expectedState?.sourcePtsCadenceMapStateSha256V2 ?? null)) return false;
    Object.assign(memory.asset, input.nextState, {
      sourcePtsCadenceMapV1: null,
      sourcePtsCadenceMapStateSha256V1: null,
    });
    return true;
  });
  return {
    asset: memory.asset,
    replace,
    ports: {
      load: vi.fn(async () => memory.asset),
      replace,
    } satisfies MediaSourcePtsCadenceMapAssetStorePortsV2,
  };
}
