import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import {
  createMediaSourcePtsCadenceSourceCoverageV2,
  verifyMediaSourcePtsCadenceSourceCoverageV2,
} from '@/lib/editron/services/media-source-pts-cadence-source-coverage-v2';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceSourceCoverageV2', () => {
  it('requires the index to span the exact qualified source PTS range before issuing CFR', async () => {
    const fixture = completeFixture();
    const result = await verifyMediaSourcePtsCadenceSourceCoverageV2({
      coverage: fixture.coverage,
      manifestIndex: fixture.manifestIndex,
      reader: fixture.reader,
    });

    expect(result).toMatchObject({
      disposition: 'SOURCE_PRESENTATION_COVERAGE_VERIFIED',
      sourceCadence: { kind: 'CFR', durationTicks: '3003' },
      sourceStartPresentationTimestampTicks: '0',
      sourceEndExclusivePresentationTimestampTicks: '12012',
    });
  });

  it('fails closed for partial qualified-source coverage and forged coverage expectations', async () => {
    const fixture = completeFixture();
    const partialManifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: fixture.manifestIndex.index.mapBindingSha256,
      resourcePolicy: fixture.manifestIndex.index.resourcePolicy,
      batches: [fixture.batches[0]],
    });
    await expect(verifyMediaSourcePtsCadenceSourceCoverageV2({
      coverage: fixture.coverage,
      manifestIndex: partialManifestIndex,
      reader: fixture.reader,
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_RANGE_INCOMPLETE' });
    await expect(verifyMediaSourcePtsCadenceSourceCoverageV2({
      coverage: { ...fixture.coverage, coverageSha256: '0'.repeat(64) },
      manifestIndex: fixture.manifestIndex,
      reader: fixture.reader,
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_COVERAGE_INVALID' });
  });

  it('reports VFR only for a fully verified variable-duration source and rejects another map', async () => {
    const uniform = completeFixture();
    const variable = completeFixture(['3003', '3004', '3003', '3004']);

    await expect(verifyMediaSourcePtsCadenceSourceCoverageV2({
      coverage: variable.coverage,
      manifestIndex: variable.manifestIndex,
      reader: variable.reader,
    })).resolves.toMatchObject({
      disposition: 'SOURCE_PRESENTATION_COVERAGE_VERIFIED',
      sourceCadence: { kind: 'VFR' },
    });
    await expect(verifyMediaSourcePtsCadenceSourceCoverageV2({
      coverage: uniform.coverage,
      manifestIndex: variable.manifestIndex,
      reader: variable.reader,
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'MAP_BINDING_MISMATCH' });
  });
});

function completeFixture(frameDurations: readonly string[] = ['3003', '3003', '3003', '3003']) {
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' }, assetId: 'asset-1', mediaKind: 'video',
    byteLength: 12_345, contentSha256: 'b'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'media/source.mp4' }, byteLength: 12_345,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
    }),
  });
  const qualified = qualification(
    sourceVersion.storageVersion,
    frameDurations.reduce((total, duration) => total + BigInt(duration), BigInt(0)).toString(),
  );
  const mapper = {
    mapperVersion: 'media-pts-mapper-v2', ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'policy-v2', timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const makeBatch = (sequence: number, firstFrameOrdinal: string, frames: readonly { presentationTimestampTicks: string; durationTicks: string }[]) => {
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion, qualification: qualified, videoStreamIndex: 0, mapper,
      shardSequence: sequence, firstFrameOrdinal, frames,
    });
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256: mediaSourcePtsCadenceMapBindingSha256V1(shard),
      resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100 },
      shard, frames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({ storage: 'R2_PRIVATE', serialization }),
    };
  };
  const frames = frameDurations.reduce<readonly { presentationTimestampTicks: string; durationTicks: string }[]>(
    (result, duration) => {
      const start = result.length === 0
        ? BigInt(0)
        : BigInt(result[result.length - 1]!.presentationTimestampTicks)
          + BigInt(result[result.length - 1]!.durationTicks);
      return [...result, { presentationTimestampTicks: start.toString(), durationTicks: duration }];
    },
    [],
  );
  const batches = [
    makeBatch(0, '0', frames.slice(0, 2)),
    makeBatch(1, '2', frames.slice(2)),
  ] as const;
  const manifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256: batches[0].serialization.payload.mapBindingSha256,
    resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 },
    batches,
  });
  const coverageInput = {
    sourceVersion,
    qualification: qualified,
    videoStreamIndex: 0,
    mapper,
    coveragePolicyVersion: 'coverage-v2',
  };
  return {
    sourceVersion,
    coverageInput,
    coverage: createMediaSourcePtsCadenceSourceCoverageV2(coverageInput),
    manifestIndex,
    batches,
    reader: {
      read: async (sidecar: { contentSha256: string }) => {
        const batch = batches.find(({ sidecar: known }) => known.contentSha256 === sidecar.contentSha256);
        if (!batch) throw new Error('missing');
        return batch.serialization;
      },
    },
  };
}

function qualification(storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>, durationTicks: string) {
  const observation = {
    schemaVersion: 1 as const, kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1', formatName: 'mov', durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: durationTicks,
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' }, frameCount: '4',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709', colorRange: 'tv',
      timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1 as const, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const, assetId: 'asset-1',
    locator: { provider: 'R2' as const, objectKey: 'media/source.mp4' },
    sourceBindingSha256: 'c'.repeat(64), requestId: 'media-source-probe:fixture', attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z', startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z', storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) }, diagnostic: null,
  };
}
