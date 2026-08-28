import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import { createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3 } from '@/lib/editron/services/media-source-pts-cadence-epoch-boundary-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
  parseMediaSourcePtsCadenceEpochIndexV3,
  type CreateMediaSourcePtsCadenceEpochIndexInputV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import {
  parseMediaSourcePtsCadenceFrameBatchV2,
  serializeMediaSourcePtsCadenceFrameBatchV2,
} from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceFrameInputV1,
} from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence epoch index V3', () => {
  it('persists reset and gap epochs over unchanged V2 batch bytes', () => {
    const fixture = epochFixture();
    const originalBatchHashes = fixture.batches.map(({ serialization }) => serialization.contentSha256);

    const serialization = createMediaSourcePtsCadenceEpochIndexV3(fixture.input);
    const parsed = parseMediaSourcePtsCadenceEpochIndexV3(serialization.canonicalJson);
    const sidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
      storage: 'R2_PRIVATE',
      serialization,
    });

    expect(parsed).toEqual(serialization.index);
    expect(parsed.epochs).toMatchObject([
      {
        epoch: { epochId: 'epoch-0', boundaryKind: 'INITIAL', canonicalStartTime: { ticks: '0' } },
        firstBatchSequence: 0, endExclusiveBatchSequence: 1,
        firstFrameOrdinal: '0', endExclusiveFrameOrdinal: '2',
        boundary: {
          classificationBasis: 'FIRST_DECODED_PRESENTATION',
          previousEpochId: null,
          previousBatchContentSha256: null,
        },
      },
      {
        epoch: {
          epochId: 'epoch-1', boundaryKind: 'TIMESTAMP_RESET',
          sourceStartPresentationTimestampTicks: '-2000', canonicalStartTime: { ticks: '2' },
        },
        firstFrameOrdinal: '2', endExclusiveFrameOrdinal: '4',
        boundary: {
          classificationBasis: 'DEMUXER_DISCONTINUITY_MARKER',
          previousEpochId: 'epoch-0',
          externalEvidence: { contentSha256: 'e'.repeat(64), epochId: 'epoch-1' },
        },
      },
      {
        epoch: {
          epochId: 'epoch-2', boundaryKind: 'GAP',
          sourceStartPresentationTimestampTicks: '2000', canonicalStartTime: { ticks: '6' },
        },
        firstFrameOrdinal: '4', endExclusiveFrameOrdinal: '6',
        boundary: {
          classificationBasis: 'PTS_DELTA',
          previousEpochId: 'epoch-1', externalEvidence: null,
        },
      },
    ]);
    expect(parsed.batches.map(({ epochId, firstFrameOrdinal }) => ({ epochId, firstFrameOrdinal })))
      .toEqual([
        { epochId: 'epoch-0', firstFrameOrdinal: '0' },
        { epochId: 'epoch-1', firstFrameOrdinal: '2' },
        { epochId: 'epoch-2', firstFrameOrdinal: '4' },
      ]);
    expect(parsed.epochs.every(({ boundary }) =>
      /^[a-f0-9]{64}$/.test(boundary.boundaryEvidenceSha256))).toBe(true);
    expect(fixture.batches.map(({ serialization }) => serialization.contentSha256))
      .toEqual(originalBatchHashes);
    expect(parseMediaSourcePtsCadenceFrameBatchV2(
      fixture.batches[1]!.serialization.canonicalJson,
    ).frames).toEqual([
      { presentationTimestampTicks: '-2000', durationTicks: '500' },
      { presentationTimestampTicks: '-1500', durationTicks: '1500' },
    ]);
    expect(sidecar).toMatchObject({
      epochCount: 3,
      batchCount: 3,
      endExclusiveFrameOrdinal: '6',
      contentSha256: serialization.contentSha256,
    });
    expect(sidecar.objectKey).toContain('/v3/');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.epochs[0]!.boundary)).toBe(true);
  });

  it('represents a PTS overlap while keeping canonical playback monotonic', () => {
    const fixture = epochFixture([
      epochSpec('0', ['1000', '1000'], '0', 'INITIAL'),
      epochSpec('1000', ['500', '500'], '2', 'OVERLAP'),
    ]);
    const result = createMediaSourcePtsCadenceEpochIndexV3(fixture.input);

    expect(result.index.epochs[1]).toMatchObject({
      epoch: {
        boundaryKind: 'OVERLAP',
        sourceStartPresentationTimestampTicks: '1000',
        canonicalStartTime: { ticks: '2', timescale: '1' },
      },
      boundary: { classificationBasis: 'PTS_DELTA', externalEvidence: null },
    });
  });

  it.each([
    ['WRAP', 'COUNTER_WRAP_METADATA'],
    ['EDIT_LIST', 'CONTAINER_EDIT_LIST'],
  ] as const)('requires explicit evidence for %s boundaries', (boundaryKind, classificationBasis) => {
    const fixture = epochFixture([
      epochSpec('0', ['1000', '1000'], '0', 'INITIAL'),
      epochSpec('-1000', ['1000', '1000'], '2', boundaryKind, {
        classificationBasis,
        externalEvidenceContentSha256: 'a'.repeat(64),
      }),
    ]);

    expect(createMediaSourcePtsCadenceEpochIndexV3(fixture.input).index.epochs[1])
      .toMatchObject({
        epoch: { boundaryKind },
        boundary: {
          classificationBasis,
          externalEvidence: { contentSha256: 'a'.repeat(64), epochId: 'epoch-1' },
        },
      });
  });

  it('rejects a discontinuity hidden inside one declared epoch', () => {
    const fixture = epochFixture([
      epochSpec('0', ['1000', '1000'], '0', 'INITIAL'),
      epochSpec('4000', ['1000', '1000'], '4', 'GAP'),
    ]);
    const first = fixture.input.epochs[0]!;
    const second = fixture.input.epochs[1]!;
    const hidden: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
      ...fixture.input,
      epochs: [{
        ...first,
        epoch: {
          ...first.epoch,
          sourceEndExclusivePresentationTimestampTicks:
            second.epoch.sourceEndExclusivePresentationTimestampTicks,
        },
        batches: [...first.batches, ...second.batches],
      }],
    };

    expect(() => createMediaSourcePtsCadenceEpochIndexV3(hidden))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_UNDECLARED_DISCONTINUITY');
  });

  it('rejects missing, mismatched, or unnecessary boundary evidence', () => {
    const fixture = epochFixture();
    const reset = fixture.input.epochs[1]!;
    const gap = fixture.input.epochs[2]!;
    const resetWithoutEvidence: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? { ...reset, boundary: { ...reset.boundary, externalEvidence: null } }
        : entry),
    };
    expect(() => createMediaSourcePtsCadenceEpochIndexV3(resetWithoutEvidence))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASIS_OR_EVIDENCE_INVALID');

    const resetMislabeled: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? {
            ...reset,
            boundary: {
              ...reset.boundary,
              classificationBasis: 'PTS_DELTA',
              externalEvidence: null,
            },
          }
        : entry),
    };
    expect(() => createMediaSourcePtsCadenceEpochIndexV3(resetMislabeled))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASIS_OR_EVIDENCE_INVALID');

    const unnecessaryEvidence = createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3({
      evidenceContractVersion: 'boundary-evidence-fixture-v3',
      storage: 'R2_PRIVATE',
      byteLength: 128,
      contentSha256: 'b'.repeat(64),
      mapBindingSha256: fixture.input.mapBindingSha256,
      epochId: gap.epoch.epochId,
    });
    const gapWithEvidence: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 2
        ? { ...gap, boundary: { ...gap.boundary, externalEvidence: unnecessaryEvidence } }
        : entry),
    };
    expect(() => createMediaSourcePtsCadenceEpochIndexV3(gapWithEvidence))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASIS_OR_EVIDENCE_INVALID');
  });

  it('rejects cross-map and forged boundary evidence references', () => {
    const fixture = epochFixture();
    const reset = fixture.input.epochs[1]!;
    const validEvidence = reset.boundary.externalEvidence;
    if (validEvidence === null) throw new Error('TEST_FIXTURE_RESET_EVIDENCE_MISSING');

    const crossMapEvidence = createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3({
      evidenceContractVersion: validEvidence.evidenceContractVersion,
      storage: validEvidence.storage,
      byteLength: validEvidence.byteLength,
      contentSha256: validEvidence.contentSha256,
      mapBindingSha256: 'f'.repeat(64),
      epochId: reset.epoch.epochId,
    });
    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? { ...reset, boundary: { ...reset.boundary, externalEvidence: crossMapEvidence } }
        : entry),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BOUNDARY_EVIDENCE_SCOPE_MISMATCH');

    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? {
            ...reset,
            boundary: {
              ...reset.boundary,
              externalEvidence: {
                ...validEvidence,
                objectKey: `${validEvidence.objectKey}.forged`,
              },
            },
          }
        : entry),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_BINDING_INVALID');
  });

  it.each([
    ['reset canonical shift', 1, { ticks: '3', timescale: '1' },
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BACKWARD_CANONICAL_HANDOFF_INVALID'],
    ['gap duration loss', 2, { ticks: '5', timescale: '1' },
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_GAP_CANONICAL_DURATION_MISMATCH'],
  ] as const)('rejects %s', (_label, epochIndex, canonicalStartTime, error) => {
    const fixture = epochFixture();
    const candidate = fixture.input.epochs[epochIndex]!;
    const input: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === epochIndex
        ? { ...candidate, epoch: { ...candidate.epoch, canonicalStartTime } }
        : entry),
    };

    expect(() => createMediaSourcePtsCadenceEpochIndexV3(input)).toThrow(error);
  });

  it('rejects cross-source scope, forged sidecars, and resource overflow', () => {
    const fixture = epochFixture();
    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      sourceVersionSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SCOPE_MISMATCH');

    const candidate = fixture.input.epochs[1]!;
    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? {
            ...candidate,
            batches: candidate.batches.map((batch) => ({
              ...batch,
              sidecar: { ...batch.sidecar, objectKey: `${batch.sidecar.objectKey}.forged` },
            })),
          }
        : entry),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SIDECAR_MISMATCH');

    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      resourcePolicy: { ...fixture.input.resourcePolicy, maxBatchEntries: 2 },
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_COUNT_INVALID');
  });

  it('rejects reordered global ordinals even across declared epochs', () => {
    const fixture = epochFixture();
    const candidate = fixture.input.epochs[1]!;
    const original = candidate.batches[0]!;
    const parsed = JSON.parse(original.serialization.canonicalJson) as Record<string, unknown>;
    const shard = parsed.shard as Record<string, unknown>;
    shard.firstFrameOrdinal = '9';
    delete shard.shardSha256;
    shard.shardSha256 = hashEditronCanonicalJsonV1(shard);
    const forgedCanonical = canonicalizeEditronJsonV1(parsed);
    const forgedSerialization = {
      ...original.serialization,
      canonicalJson: forgedCanonical,
      byteLength: Buffer.byteLength(forgedCanonical, 'utf8'),
      contentSha256: hashUtf8(forgedCanonical),
    };
    const forgedSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
      storage: 'R2_PRIVATE',
      serialization: forgedSerialization,
    });

    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      epochs: fixture.input.epochs.map((entry, index) => index === 1
        ? {
            ...candidate,
            batches: [{ serialization: forgedSerialization, sidecar: forgedSidecar }],
          }
        : entry),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_ORDER_INVALID');
  });

  it('rejects tampered boundary hashes, membership, fields, and noncanonical JSON', () => {
    const serialization = createMediaSourcePtsCadenceEpochIndexV3(epochFixture().input);
    const boundaryTamper = JSON.parse(serialization.canonicalJson) as Record<string, unknown>;
    const epochs = boundaryTamper.epochs as Array<Record<string, unknown>>;
    const boundary = epochs[1]!.boundary as Record<string, unknown>;
    boundary.detectorVersion = 'tampered-detector';
    expect(() => parseMediaSourcePtsCadenceEpochIndexV3(
      canonicalizeEditronJsonV1(boundaryTamper),
    )).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_HASH_MISMATCH');

    const membershipTamper = JSON.parse(serialization.canonicalJson) as Record<string, unknown>;
    const batches = membershipTamper.batches as Array<Record<string, unknown>>;
    batches[1]!.epochId = 'epoch-0';
    expect(() => parseMediaSourcePtsCadenceEpochIndexV3(
      canonicalizeEditronJsonV1(membershipTamper),
    )).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_EPOCH_MISMATCH');

    const fieldTamper = JSON.parse(serialization.canonicalJson) as Record<string, unknown>;
    fieldTamper.unversionedFallback = true;
    expect(() => parseMediaSourcePtsCadenceEpochIndexV3(
      canonicalizeEditronJsonV1(fieldTamper),
    )).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_FIELDS_INVALID');

    expect(() => parseMediaSourcePtsCadenceEpochIndexV3(` ${serialization.canonicalJson}`))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_JSON_NON_CANONICAL');
  });

  it('enforces canonical JSON byte and epoch-count policy limits', () => {
    const fixture = epochFixture();
    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      resourcePolicy: { ...fixture.input.resourcePolicy, maxEpochEntries: 2 },
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_COUNT_INVALID');
    expect(() => createMediaSourcePtsCadenceEpochIndexV3({
      ...fixture.input,
      resourcePolicy: { ...fixture.input.resourcePolicy, maxCanonicalJsonBytes: 1 },
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BYTE_LIMIT_EXCEEDED');
  });
});

type EpochSpec = Readonly<{
  start: string;
  durations: readonly string[];
  canonicalStart: string;
  boundaryKind: PresentationEpochV1['boundaryKind'];
  classificationBasis: CreateMediaSourcePtsCadenceEpochIndexInputV3['epochs'][number]['boundary']['classificationBasis'];
  externalEvidenceContentSha256: string | null;
}>;

function epochSpec(
  start: string,
  durations: readonly string[],
  canonicalStart: string,
  boundaryKind: PresentationEpochV1['boundaryKind'],
  evidence: Partial<Pick<EpochSpec, 'classificationBasis' | 'externalEvidenceContentSha256'>> = {},
): EpochSpec {
  const defaults = {
    INITIAL: { classificationBasis: 'FIRST_DECODED_PRESENTATION', externalEvidenceContentSha256: null },
    GAP: { classificationBasis: 'PTS_DELTA', externalEvidenceContentSha256: null },
    OVERLAP: { classificationBasis: 'PTS_DELTA', externalEvidenceContentSha256: null },
    TIMESTAMP_RESET: {
      classificationBasis: 'DEMUXER_DISCONTINUITY_MARKER',
      externalEvidenceContentSha256: 'e'.repeat(64),
    },
    WRAP: { classificationBasis: 'COUNTER_WRAP_METADATA', externalEvidenceContentSha256: 'e'.repeat(64) },
    EDIT_LIST: { classificationBasis: 'CONTAINER_EDIT_LIST', externalEvidenceContentSha256: 'e'.repeat(64) },
  } as const;
  return { start, durations, canonicalStart, boundaryKind, ...defaults[boundaryKind], ...evidence };
}

function epochFixture(specs: readonly EpochSpec[] = [
  epochSpec('10000', ['1000', '1000'], '0', 'INITIAL'),
  epochSpec('-2000', ['500', '1500'], '2', 'TIMESTAMP_RESET'),
  epochSpec('2000', ['1000', '1000'], '6', 'GAP'),
]) {
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-epoch-v3',
    mediaKind: 'video',
    byteLength: 99_999,
    contentSha256: '1'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'media/epoch-source.mkv' },
      byteLength: 99_999,
      providerVersion: { kind: 'R2_ETAG', value: 'epoch-etag' },
    }),
  });
  const qualification = qualificationFixture(sourceVersion.storageVersion, sourceTimebase);
  const mapper = {
    mapperVersion: 'pts-epoch-mapper-v3',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'pts-epoch-policy-v3',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  let firstFrameOrdinal = BigInt(0);
  const shards = specs.map((spec, sequence) => {
    const frames = framesFromSpec(spec);
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion,
      qualification,
      videoStreamIndex: 0,
      mapper,
      shardSequence: sequence,
      firstFrameOrdinal: firstFrameOrdinal.toString(),
      frames,
    });
    firstFrameOrdinal += BigInt(frames.length);
    return { shard, frames };
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shards[0]!.shard);
  const batches = shards.map(({ shard, frames }) => {
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: {
        policyVersion: mapper.commandPolicyVersion,
        maxCanonicalJsonBytes: 64_000,
        maxFrameRecords: 100,
      },
      shard,
      frames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: 'R2_PRIVATE',
        serialization,
      }),
    };
  });
  const epochs = specs.map((spec, index) => ({
    epoch: presentationEpoch(spec, index),
    boundary: {
      classificationBasis: spec.classificationBasis,
      detectorVersion: 'epoch-detector-v3',
      externalEvidence: spec.externalEvidenceContentSha256 === null
        ? null
        : createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3({
            evidenceContractVersion: 'boundary-evidence-fixture-v3',
            storage: 'R2_PRIVATE',
            byteLength: 128,
            contentSha256: spec.externalEvidenceContentSha256,
            mapBindingSha256,
            epochId: `epoch-${index}`,
          }),
    },
    batches: [batches[index]!],
  }));
  const input: CreateMediaSourcePtsCadenceEpochIndexInputV3 = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase,
    resourcePolicy: {
      policyVersion: 'pts-epoch-index-policy-v3',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 100,
      maxBatchEntries: 100,
    },
    epochs,
  };
  return { input, batches, sourceVersion };
}

function presentationEpoch(spec: EpochSpec, index: number): PresentationEpochV1 {
  const end = spec.durations.reduce((pts, duration) => pts + BigInt(duration), BigInt(spec.start));
  return {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `epoch-${index}`,
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: '1000' },
    sourceStartPresentationTimestampTicks: spec.start,
    sourceEndExclusivePresentationTimestampTicks: end.toString(),
    canonicalStartTime: { ticks: spec.canonicalStart, timescale: '1' },
    boundaryKind: spec.boundaryKind,
  };
}

function framesFromSpec(spec: EpochSpec): readonly MediaSourcePtsCadenceFrameInputV1[] {
  let pts = BigInt(spec.start);
  return spec.durations.map((durationTicks) => {
    const frame = { presentationTimestampTicks: pts.toString(), durationTicks };
    pts += BigInt(durationTicks);
    return frame;
  });
}

function qualificationFixture(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>,
) {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'matroska', durationMilliseconds: 20_000, startTimeMilliseconds: -2_000,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase,
      sourceStartPts: '-2000', sourceDurationTicks: '20000',
      averageFrameRate: { numerator: '24', denominator: '1' },
      realFrameRate: { numerator: '24', denominator: '1' }, frameCount: '6',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709',
      colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: 'asset-epoch-v3',
    locator: { provider: 'R2' as const, objectKey: 'media/epoch-source.mkv' },
    sourceBindingSha256: '2'.repeat(64), requestId: 'epoch-index-fixture', attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z', startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z', storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
