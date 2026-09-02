import { describe, expect, it } from 'vitest';

import { canonicalizeEditronJsonV1, hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
  expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2,
  parseMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { verifyMediaSourcePtsCadenceManifestIndexV2 } from '@/lib/editron/services/media-source-pts-cadence-index-verifier-v2';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceManifestIndexV2', () => {
  it('makes every ordered frame batch recoverable through exact immutable private references', () => {
    const fixture = batches();
    const index = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    });

    expect(index.index.batches).toHaveLength(2);
    expect(index.index.batches.map(({ shardSequence }) => shardSequence)).toEqual([0, 1]);
    expect(index.index.batches[1]!.firstFrameOrdinal).toBe('2');
    expect(parseMediaSourcePtsCadenceManifestIndexV2(index.canonicalJson)).toEqual(index.index);
    expect(Object.isFrozen(parseMediaSourcePtsCadenceManifestIndexV2(index.canonicalJson))).toBe(true);
    expect(expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2(
      fixture.mapBindingSha256,
      index.contentSha256,
    )).toContain(`/manifest-indexes/${index.contentSha256}.json`);
  });

  it('rejects missing, reordered, cross-bound, or noncontiguous batches before an index can exist', () => {
    const fixture = batches();
    const input = {
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    };

    expect(() => createMediaSourcePtsCadenceManifestIndexV2({
      ...input,
      batches: [fixture.batches[1]!, fixture.batches[0]!],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BOOTSTRAP_INVALID');
    expect(() => createMediaSourcePtsCadenceManifestIndexV2({
      ...input,
      batches: [{
        ...fixture.batches[1]!,
        sidecar: {
          ...fixture.batches[1]!.sidecar,
          contentSha256: 'f'.repeat(64),
        },
      }],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_BINDING_INVALID');
    expect(() => createMediaSourcePtsCadenceManifestIndexV2({
      ...input,
      mapBindingSha256: 'd'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BATCH_BINDING_MISMATCH');
    expect(() => createMediaSourcePtsCadenceManifestIndexV2({
      ...input,
      resourcePolicy: { ...indexPolicy(), policyVersion: 'other-policy' },
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_BINDING_MISMATCH');

    const serialized = createMediaSourcePtsCadenceManifestIndexV2(input);
    expect(() => parseMediaSourcePtsCadenceManifestIndexV2(canonicalizeEditronJsonV1({
      ...serialized.index,
      batches: [
        serialized.index.batches[0],
        {
          ...serialized.index.batches[1]!,
          firstFrameOrdinal: '3',
        },
      ],
    }))).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_NON_CONTIGUOUS');
  });

  it('rejects noncanonical stored indexes and resource-policy violations', () => {
    const fixture = batches();
    const index = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    });

    expect(() => parseMediaSourcePtsCadenceManifestIndexV2(` ${index.canonicalJson}`))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_JSON_NON_CANONICAL');
    expect(() => createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: { ...indexPolicy(), maxBatchEntries: 1 },
      batches: fixture.batches,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BATCH_COUNT_INVALID');
  });
});

describe('MediaSourcePtsCadenceManifestIndexVerifierV2', () => {
  it('reads every indexed batch and reports only indexed-range integrity', async () => {
    const fixture = batches();
    const manifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    });
    const result = await verifyMediaSourcePtsCadenceManifestIndexV2({
      manifestIndex,
      reader: readerFor(fixture.batches),
    });

    expect(result).toMatchObject({
      disposition: 'INDEX_INTEGRITY_VERIFIED',
      verifiedBatchCount: 2,
      verifiedFrameCount: '4',
      indexedRange: {
        firstFrameOrdinal: '0',
        endExclusiveFrameOrdinal: '4',
        startPresentationTimestampTicks: '0',
        endExclusivePresentationTimestampTicks: '12012',
      },
      observedCadence: { kind: 'UNIFORM_INDEXED_RANGE', durationTicks: '3003' },
    });
  });

  it('fails closed when a private batch cannot be read or no longer matches its indexed bytes', async () => {
    const fixture = batches();
    const manifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    });
    await expect(verifyMediaSourcePtsCadenceManifestIndexV2({
      manifestIndex,
      reader: { read: async () => { throw new Error('unavailable'); } },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SIDECAR_READ_FAILED',
      failedShardSequence: 0,
    });
    await expect(verifyMediaSourcePtsCadenceManifestIndexV2({
      manifestIndex,
      reader: {
        read: async (sidecar) => ({
          canonicalJson: '{}',
          byteLength: 2,
          contentSha256: sidecar.contentSha256,
        }),
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SIDECAR_BYTE_LENGTH_MISMATCH',
      failedShardSequence: 0,
    });
  });

  it('reports variable timing only for the verified indexed range', async () => {
    const fixture = batches({ variableSecondBatch: true });
    const manifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.mapBindingSha256,
      resourcePolicy: indexPolicy(),
      batches: fixture.batches,
    });
    await expect(verifyMediaSourcePtsCadenceManifestIndexV2({
      manifestIndex,
      reader: readerFor(fixture.batches),
    })).resolves.toMatchObject({
      disposition: 'INDEX_INTEGRITY_VERIFIED',
      observedCadence: { kind: 'VARIABLE_INDEXED_RANGE' },
    });
  });
});

function batches(input: { variableSecondBatch?: boolean } = {}) {
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'media/source.mp4' },
      byteLength: 12_345,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
    }),
  });
  const batch = (sequence: number, firstOrdinal: string, frames: readonly { presentationTimestampTicks: string; durationTicks: string }[]) => {
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion,
      qualification: qualification(sourceVersion.storageVersion),
      videoStreamIndex: 0,
      mapper: {
        mapperVersion: 'media-pts-mapper-v2',
        ffprobeVersion: 'ffprobe-8.1',
        commandPolicyVersion: 'policy-v2',
        timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      },
      shardSequence: sequence,
      firstFrameOrdinal: firstOrdinal,
      frames,
    });
    const actualBinding = mediaSourcePtsCadenceMapBindingSha256V1(shard);
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256: actualBinding,
      resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100 },
      shard,
      frames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({ storage: 'R2_PRIVATE', serialization }),
    };
  };
  const first = batch(0, '0', [
    { presentationTimestampTicks: '0', durationTicks: '3003' },
    { presentationTimestampTicks: '3003', durationTicks: '3003' },
  ]);
  const second = batch(1, '2', [
    { presentationTimestampTicks: '6006', durationTicks: input.variableSecondBatch ? '3004' : '3003' },
    { presentationTimestampTicks: input.variableSecondBatch ? '9010' : '9009', durationTicks: '3003' },
  ]);
  return { mapBindingSha256: first.serialization.payload.mapBindingSha256, batches: [first, second] as const };
}

function qualification(storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>) {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1',
    formatName: 'mov',
    durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '1111050',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '370',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: 'asset-1',
    locator: { provider: 'R2' as const, objectKey: 'media/source.mp4' },
    sourceBindingSha256: 'c'.repeat(64),
    requestId: 'media-source-probe:fixture',
    attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function indexPolicy() {
  return { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 };
}

function readerFor(batches: readonly { serialization: { canonicalJson: string; byteLength: number; contentSha256: string }; sidecar: { contentSha256: string } }[]) {
  return {
    read: async (sidecar: { contentSha256: string }) => {
      const batch = batches.find(({ sidecar: known }) => known.contentSha256 === sidecar.contentSha256);
      if (!batch) throw new Error('missing batch');
      return batch.serialization;
    },
  };
}
