import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  readMediaSourcePtsCadencePresentationWindowV2,
} from '@/lib/editron/services/media-source-pts-cadence-index-verifier-v2';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  createVideoSourceTimestampConformV2,
  createVideoSourceTimestampConformFromManifestIndexV2,
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type VerifiedVideoSourceTimeBindingV1,
} from '@/lib/editron/services/video-source-time-transform-v1';

describe('hash-verified timestamp conform from a V2 manifest index', () => {
  it('reads only the batch intersecting an exact ordinal window', async () => {
    const fixture = indexedFixture();
    const recording = recordingReader(fixture);

    const result = await readMediaSourcePtsCadencePresentationWindowV2({
      manifestIndex: fixture.manifestIndex,
      reader: recording.reader,
      expectedSource: expectedSource(fixture),
      firstFrameOrdinal: '2',
      endExclusiveFrameOrdinal: '4',
      resourcePolicy: windowPolicy(),
    });

    expect(result).toMatchObject({
      disposition: 'PRESENTATION_WINDOW_VERIFIED',
      evidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW',
      firstFrameOrdinal: '2',
      endExclusiveFrameOrdinal: '4',
      startPresentationTimestampTicks: '0',
      endExclusivePresentationTimestampTicks: '2000',
      verifiedBatchCount: 1,
      frames: [
        { sourceFrameOrdinal: '2', presentationTimestampTicks: '0', durationTicks: '500' },
        { sourceFrameOrdinal: '3', presentationTimestampTicks: '500', durationTicks: '1500' },
      ],
    });
    expect(recording.readShardSequences).toEqual([1]);
    expect(result.disposition === 'PRESENTATION_WINDOW_VERIFIED'
      && result.presentationWindowEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('consumes a cross-batch VFR/negative-PTS window without deriving audio from video', async () => {
    const fixture = indexedFixture();
    const recording = recordingReader(fixture);
    const sourceBinding = binding(fixture);

    const result = await createVideoSourceTimestampConformFromManifestIndexV2({
      sourceBinding,
      manifestIndex: fixture.manifestIndex,
      frameBatchReader: recording.reader,
      videoStreamIndex: 0,
      firstFrameOrdinal: '1',
      endExclusiveFrameOrdinal: '5',
      presentationWindowResourcePolicy: windowPolicy(),
      streamId: 'video-0',
      epoch: epoch(),
      projectRate: { numerator: '2', denominator: '1' },
      timelineStartFrame: '0',
      timelineFrameQueries: ['0', '1', '2'],
      sourceAnchor: {
        sourceVersionSha256: sourceBinding.sourceVersionSha256,
        streamId: 'video-0',
        epochId: 'epoch-1',
        presentationTimestampTicks: '0',
        secondsPerSourceTick: fixture.sourceTimebase,
      },
      resourcePolicy: {
        policyVersion: 'timestamp-conform-index-fixture-v1',
        maxSourceFrames: 100,
        maxFrameQueries: 100,
      },
      audio: {
        sourceRange: {
          startSampleFrame: '0', endExclusiveSampleFrame: '96000', sampleRate: '48000',
        },
        sourceAnchorSampleFrame: '0',
        endExclusiveTimelineFrame: '3',
      },
    });

    expect(result.disposition).toBe('CONFORM_CREATED');
    if (result.disposition !== 'CONFORM_CREATED') throw new Error('expected conform');
    expect(recording.readShardSequences).toEqual([0, 1, 2]);
    expect(result.presentationWindow.frames.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['1', '2', '3', '4']);
    expect(result.transform).toMatchObject({
      evidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW_CONSUMED_NOT_RENDERER_WIRED',
      presentationWindowEvidenceSha256: result.presentationWindow.presentationWindowEvidenceSha256,
      frameSelections: [
        { timelineFrame: '0', sourceFrameOrdinal: '2', presentationTimestampTicks: '0' },
        { timelineFrame: '1', sourceFrameOrdinal: '3', presentationTimestampTicks: '500' },
        { timelineFrame: '2', sourceFrameOrdinal: '3', presentationTimestampTicks: '500' },
      ],
      audioMapping: {
        startSamplePosition: { numerator: '0', denominator: '1' },
        endExclusiveSamplePosition: { numerator: '72000', denominator: '1' },
      },
    });
  });

  it('fails closed before reads for stale map scope, outside windows, and resource overflow', async () => {
    const fixture = indexedFixture();
    const stale = recordingReader(fixture);
    await expect(readMediaSourcePtsCadencePresentationWindowV2({
      manifestIndex: fixture.manifestIndex,
      reader: stale.reader,
      expectedSource: { ...expectedSource(fixture), mapBindingSha256: 'f'.repeat(64) },
      firstFrameOrdinal: '0',
      endExclusiveFrameOrdinal: '2',
      resourcePolicy: windowPolicy(),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'WINDOW_SOURCE_SCOPE_MISMATCH',
    });
    expect(stale.readShardSequences).toEqual([]);

    const outside = recordingReader(fixture);
    await expect(readMediaSourcePtsCadencePresentationWindowV2({
      manifestIndex: fixture.manifestIndex,
      reader: outside.reader,
      expectedSource: expectedSource(fixture),
      firstFrameOrdinal: '5',
      endExclusiveFrameOrdinal: '7',
      resourcePolicy: windowPolicy(),
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'WINDOW_OUTSIDE_INDEX' });
    expect(outside.readShardSequences).toEqual([]);

    const limited = recordingReader(fixture);
    await expect(readMediaSourcePtsCadencePresentationWindowV2({
      manifestIndex: fixture.manifestIndex,
      reader: limited.reader,
      expectedSource: expectedSource(fixture),
      firstFrameOrdinal: '1',
      endExclusiveFrameOrdinal: '5',
      resourcePolicy: { ...windowPolicy(), maxBatchReads: 2 },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'WINDOW_RESOURCE_LIMIT_EXCEEDED',
    });
    expect(limited.readShardSequences).toEqual([]);
  });

  it.each([
    ['source version', { sourceVersionSha256: 'f'.repeat(64) }],
    ['video stream', { videoStreamIndex: 1 }],
    ['source timebase', { sourceTimebase: { numerator: '1', denominator: '90000' } }],
  ])('rejects a stale %s binding after verifying the selected sidecar', async (_label, override) => {
    const fixture = indexedFixture();
    const recording = recordingReader(fixture);
    await expect(readMediaSourcePtsCadencePresentationWindowV2({
      manifestIndex: fixture.manifestIndex,
      reader: recording.reader,
      expectedSource: { ...expectedSource(fixture), ...override },
      firstFrameOrdinal: '2',
      endExclusiveFrameOrdinal: '4',
      resourcePolicy: windowPolicy(),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'WINDOW_SOURCE_SCOPE_MISMATCH', failedShardSequence: 1,
    });
    expect(recording.readShardSequences).toEqual([1]);
  });

  it('returns no transform for unreadable or tampered selected bytes', async () => {
    const fixture = indexedFixture();
    const unreadable = recordingReader(fixture, { failShardSequence: 1 });
    await expect(conformRequest(fixture, unreadable.reader)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'SIDECAR_READ_FAILED', failedShardSequence: 1,
    });

    const tampered = recordingReader(fixture, { tamperShardSequence: 1 });
    await expect(conformRequest(fixture, tampered.reader)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'SIDECAR_BYTE_LENGTH_MISMATCH', failedShardSequence: 1,
    });
  });

  it('rejects hash-verified evidence asserted through the pre-resolved fixture API', () => {
    const forged = {
      presentationWindowEvidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW',
    } as unknown as Parameters<typeof createVideoSourceTimestampConformV2>[0];

    expect(() => createVideoSourceTimestampConformV2(forged))
      .toThrow('VIDEO_SOURCE_CONFORM_PRE_RESOLVED_EVIDENCE_STATUS_INVALID');
  });

  it('rejects unqualified proxy/master state before private sidecar access', async () => {
    const fixture = indexedFixture();
    const recording = recordingReader(fixture);
    await expect(conformRequest(fixture, recording.reader, {
      proxyMasterMapping: { disposition: 'UNQUALIFIED', relationSha256: 'a'.repeat(64) },
    })).rejects.toThrow('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
    expect(recording.readShardSequences).toEqual([]);
  });
});

function indexedFixture() {
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
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
  const frames = [
    { presentationTimestampTicks: '-3000', durationTicks: '1000' },
    { presentationTimestampTicks: '-2000', durationTicks: '2000' },
    { presentationTimestampTicks: '0', durationTicks: '500' },
    { presentationTimestampTicks: '500', durationTicks: '1500' },
    { presentationTimestampTicks: '2000', durationTicks: '1000' },
    { presentationTimestampTicks: '3000', durationTicks: '1000' },
  ] as const;
  const makeBatch = (shardSequence: number) => {
    const firstFrameOrdinal = String(shardSequence * 2);
    const batchFrames = frames.slice(shardSequence * 2, shardSequence * 2 + 2);
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion,
      qualification: qualification(sourceVersion.storageVersion, sourceTimebase),
      videoStreamIndex: 0,
      mapper: {
        mapperVersion: 'media-pts-mapper-v2', ffprobeVersion: 'ffprobe-8.1',
        commandPolicyVersion: 'policy-v2', timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      },
      shardSequence,
      firstFrameOrdinal,
      frames: batchFrames,
    });
    const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shard);
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100 },
      shard,
      frames: batchFrames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({ storage: 'R2_PRIVATE', serialization }),
    };
  };
  const batches = [makeBatch(0), makeBatch(1), makeBatch(2)] as const;
  const mapBindingSha256 = batches[0].serialization.payload.mapBindingSha256;
  const manifestIndex = createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256,
    resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 },
    batches,
  });
  return { sourceTimebase, sourceVersion, frames, batches, mapBindingSha256, manifestIndex };
}

function expectedSource(fixture: ReturnType<typeof indexedFixture>) {
  return {
    mapBindingSha256: fixture.mapBindingSha256,
    sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
    videoStreamIndex: 0,
    sourceTimebase: fixture.sourceTimebase,
  };
}

function binding(fixture: ReturnType<typeof indexedFixture>): VerifiedVideoSourceTimeBindingV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: fixture.sourceVersion.assetId,
    sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
    sourcePtsMapStateSha256: 'c'.repeat(64),
    mapBindingSha256: fixture.mapBindingSha256,
    terminalReceiptSha256: 'd'.repeat(64),
    sourceTimebase: fixture.sourceTimebase,
    sourceCadence: { kind: 'VFR' as const },
    sourceStartPresentationTimestampTicks: '-3000',
    sourceEndExclusivePresentationTimestampTicks: '4000',
    totalSourceFrameCount: '6',
  };
  return { ...material, bindingSha256: hashEditronCanonicalJsonV1(material) };
}

function epoch() {
  return {
    schemaVersion: 1 as const,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch' as const,
    epochId: 'epoch-1',
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: '1000' },
    sourceStartPresentationTimestampTicks: '-3000',
    sourceEndExclusivePresentationTimestampTicks: '4000',
    canonicalStartTime: { ticks: '0', timescale: '1' },
    boundaryKind: 'INITIAL' as const,
  };
}

function windowPolicy() {
  return { policyVersion: 'window-policy-v1', maxFrameRecords: 100, maxBatchReads: 10 };
}

function recordingReader(
  fixture: ReturnType<typeof indexedFixture>,
  options: { failShardSequence?: number; tamperShardSequence?: number } = {},
) {
  const readShardSequences: number[] = [];
  return {
    readShardSequences,
    reader: {
      read: async (sidecar: { contentSha256: string }) => {
        const batch = fixture.batches.find(({ sidecar: known }) =>
          known.contentSha256 === sidecar.contentSha256);
        if (!batch) throw new Error('missing batch');
        const sequence = batch.serialization.payload.shard.shardSequence;
        readShardSequences.push(sequence);
        if (sequence === options.failShardSequence) throw new Error('read failed');
        if (sequence === options.tamperShardSequence) {
          return { canonicalJson: '{}', byteLength: 2, contentSha256: sidecar.contentSha256 };
        }
        return batch.serialization;
      },
    },
  };
}

function conformRequest(
  fixture: ReturnType<typeof indexedFixture>,
  frameBatchReader: ReturnType<typeof recordingReader>['reader'],
  overrides: Partial<Parameters<typeof createVideoSourceTimestampConformFromManifestIndexV2>[0]> = {},
) {
  const sourceBinding = binding(fixture);
  return createVideoSourceTimestampConformFromManifestIndexV2({
    sourceBinding,
    manifestIndex: fixture.manifestIndex,
    frameBatchReader,
    videoStreamIndex: 0,
    firstFrameOrdinal: '2',
    endExclusiveFrameOrdinal: '4',
    presentationWindowResourcePolicy: windowPolicy(),
    streamId: 'video-0',
    epoch: epoch(),
    projectRate: { numerator: '2', denominator: '1' },
    timelineStartFrame: '0',
    timelineFrameQueries: ['0'],
    sourceAnchor: {
      sourceVersionSha256: sourceBinding.sourceVersionSha256,
      streamId: 'video-0', epochId: 'epoch-1', presentationTimestampTicks: '0',
      secondsPerSourceTick: fixture.sourceTimebase,
    },
    resourcePolicy: {
      policyVersion: 'timestamp-conform-index-fixture-v1', maxSourceFrames: 100, maxFrameQueries: 100,
    },
    ...overrides,
  });
}

function qualification(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>,
) {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov', durationMilliseconds: 7_000, startTimeMilliseconds: -3_000,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase,
      sourceStartPts: '-3000', sourceDurationTicks: '7000',
      averageFrameRate: { numerator: '6', denominator: '7' },
      realFrameRate: { numerator: '6', denominator: '7' }, frameCount: '6',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709',
      colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: 'asset-1',
    locator: { provider: 'R2' as const, objectKey: 'media/source.mp4' },
    sourceBindingSha256: 'e'.repeat(64), requestId: 'pts-window-fixture', attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z', startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z', storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}
