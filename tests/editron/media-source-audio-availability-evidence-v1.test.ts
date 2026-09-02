import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import {
  assertMediaSourceAudioAvailabilityEvidenceV1,
  captureMediaSourceAudioAvailabilityEvidenceV1,
  mediaSourceAudioAvailabilityAssetViewV1,
  mediaSourceAudioAvailabilityEvidenceScopeV1,
  retainMediaSourceAudioAvailabilityEvidenceV1,
  type MediaSourceAudioAvailabilityEvidenceStorePortsV1,
  type MediaSourceAudioAvailabilityEvidenceV1,
} from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  createMediaSourceAudioAvailabilityEvidenceMongoPortsV1,
  type MediaSourceAudioAvailabilityEvidenceMongoCollectionV1,
} from '@/lib/editron/services/media-source-audio-availability-evidence-mongo-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

const NOW = new Date('2026-08-30T20:00:00.000Z');

describe('MediaSourceAudioAvailabilityEvidenceV1', () => {
  it('captures and re-proves a source-version-bound no-audio result', () => {
    const fixture = sourceFixture('silent', 'video', []);
    const record = captureMediaSourceAudioAvailabilityEvidenceV1(fixture.asset);

    expect(record).toMatchObject({
      sourceVersionV1: {
        assetId: fixture.sourceVersion.assetId,
        sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
      },
      availability: {
        disposition: 'NO_AUDIO_STREAMS_OBSERVED',
        technicalObservationSha256:
          fixture.qualification.observation?.observationSha256,
      },
    });
    expect(assertMediaSourceAudioAvailabilityEvidenceV1(record)).toEqual(record);
    expect(mediaSourceAudioAvailabilityAssetViewV1(record)).toEqual(fixture.asset);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('captures only a complete decoded set and rejects partial materialization', () => {
    const fixture = sourceFixture('decoded', 'video', [7, 2]);
    const completeAsset = assetWithArtifacts(fixture, [7, 2]);
    const record = captureMediaSourceAudioAvailabilityEvidenceV1(completeAsset);

    expect(record.availability).toMatchObject({
      disposition: 'DECODED_ARTIFACT_SET',
      sourceAudioArtifactsV1: {
        records: [{ audioStreamIndex: 2 }, { audioStreamIndex: 7 }],
      },
    });
    expect(assertMediaSourceAudioAvailabilityEvidenceV1(record)).toEqual(record);
    expect(mediaSourceAudioAvailabilityAssetViewV1(record))
      .toEqual(completeAsset);
    expect(() => captureMediaSourceAudioAvailabilityEvidenceV1(
      assetWithArtifacts(fixture, [2]),
    )).toThrow('MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_SET_INCOMPLETE');
  });

  it('rejects impossible, tampered and contradictory source evidence', async () => {
    const silent = sourceFixture('adversarial', 'video', []);
    const tampered = structuredClone(silent.asset);
    const tamperedQualification = tampered.sourceQualificationV1 as
      MediaSourceQualificationRecordV1;
    tamperedQualification.observation!.videoStreams = [];
    expect(() => captureMediaSourceAudioAvailabilityEvidenceV1(tampered))
      .toThrow('MEDIA_SOURCE_AUDIO_AVAILABILITY_OBSERVATION_INVALID');

    const malformedVideo = structuredClone(silent.asset);
    const malformedQualification = malformedVideo.sourceQualificationV1 as
      MediaSourceQualificationRecordV1;
    malformedQualification.observation!.videoStreams = [{} as never];
    const { observationSha256: _ignored, ...malformedObservation } =
      malformedQualification.observation!;
    malformedQualification.observation!.observationSha256 =
      hashEditronCanonicalJsonV1(malformedObservation);
    expect(() => captureMediaSourceAudioAvailabilityEvidenceV1(malformedVideo))
      .toThrow('MEDIA_SOURCE_AUDIO_AVAILABILITY_NO_AUDIO_PROOF_INVALID');

    const emptyAudio = sourceFixture('empty-audio', 'audio', []);
    expect(() => captureMediaSourceAudioAvailabilityEvidenceV1(emptyAudio.asset))
      .toThrow('MEDIA_SOURCE_AUDIO_AVAILABILITY_NO_AUDIO_PROOF_INVALID');

    const first = captureMediaSourceAudioAvailabilityEvidenceV1(silent.asset);
    const changedFixture = sourceFixture('adversarial', 'video', [], 'ffprobe-8.2');
    const conflicting = captureMediaSourceAudioAvailabilityEvidenceV1(
      changedFixture.asset,
    );
    expect(conflicting.evidenceSha256).not.toBe(first.evidenceSha256);
    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(
      conflicting,
      memoryStore(first).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'CONFLICTING_EVIDENCE',
      retryable: false,
    });

    expect(() => assertMediaSourceAudioAvailabilityEvidenceV1({
      ...first,
      availability: {
        ...first.availability,
        technicalObservationSha256: 'f'.repeat(64),
      },
    })).toThrow('MEDIA_SOURCE_AUDIO_AVAILABILITY_HASH_OR_STATE_MISMATCH');
  });

  it('replays deterministically and classifies bounded store failures', async () => {
    const candidate = captureMediaSourceAudioAvailabilityEvidenceV1(
      sourceFixture('retention', 'video', []).asset,
    );
    const memory = memoryStore();
    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(
      candidate,
      memory.ports,
    )).resolves.toMatchObject({
      disposition: 'RETAINED', writeDisposition: 'APPLIED',
    });
    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(
      candidate,
      memory.ports,
    )).resolves.toMatchObject({
      disposition: 'RETAINED', writeDisposition: 'UNCHANGED',
    });

    const raced = memoryStore(null, 2);
    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(
      candidate,
      raced.ports,
    )).resolves.toEqual({
      disposition: 'REJECTED', reason: 'RACE_EXHAUSTED', retryable: true,
    });
    expect(raced.compareAndSet).toHaveBeenCalledTimes(2);

    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(candidate, {
      load: vi.fn(async () => { throw new Error('ATLAS_DOWN'); }),
      compareAndSet: vi.fn(),
    })).resolves.toEqual({
      disposition: 'REJECTED', reason: 'STORE_LOAD_FAILED', retryable: true,
    });
    await expect(retainMediaSourceAudioAvailabilityEvidenceV1(candidate, {
      load: vi.fn(async () => null),
      compareAndSet: vi.fn(async () => { throw new Error('ATLAS_DOWN'); }),
    })).resolves.toEqual({
      disposition: 'REJECTED', reason: 'STORE_CAS_FAILED', retryable: true,
    });
  });

  it('persists with a unique scope, primary reads and majority CAS reproof', async () => {
    const candidate = captureMediaSourceAudioAvailabilityEvidenceV1(
      sourceFixture('mongo', 'video', []).asset,
    );
    const mongo = memoryMongoCollection();
    const ports = createMediaSourceAudioAvailabilityEvidenceMongoPortsV1({
      loadCollection: async () => mongo.collection,
    });
    const scope = mediaSourceAudioAvailabilityEvidenceScopeV1(candidate);

    await expect(ports.load(scope)).resolves.toBeNull();
    await expect(ports.compareAndSet({
      scope,
      expectedEvidenceSha256: null,
      next: candidate,
    })).resolves.toBe(true);
    await expect(ports.load(scope)).resolves.toEqual(candidate);
    expect(mongo.createIndex).toHaveBeenCalledOnce();
    expect(mongo.findOne.mock.calls.at(-1)?.[1])
      .toEqual({ readPreference: 'primary' });
    expect(mongo.updateOne.mock.calls[0]?.[2])
      .toEqual({ upsert: true, writeConcern: { w: 'majority' } });
    await expect(ports.compareAndSet({
      scope,
      expectedEvidenceSha256: null,
      next: candidate,
    })).resolves.toBe(false);

    mongo.mutate((document) => ({
      ...document,
      evidenceSha256: 'f'.repeat(64),
    }));
    await expect(ports.load(scope)).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_AVAILABILITY_MONGO_DOCUMENT_RECORD_INVALID',
    );
  });
});

function memoryStore(
  initial: MediaSourceAudioAvailabilityEvidenceV1 | null = null,
  forcedRaces = 0,
) {
  let current = initial;
  let races = forcedRaces;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<MediaSourceAudioAvailabilityEvidenceStorePortsV1[
    'compareAndSet'
  ]>[0]) => {
    if (races > 0) {
      races -= 1;
      return false;
    }
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) {
      return false;
    }
    current = next;
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies
      MediaSourceAudioAvailabilityEvidenceStorePortsV1,
    compareAndSet,
  };
}

function memoryMongoCollection() {
  let stored: Record<string, unknown> | null = null;
  const createIndex = vi.fn(async () => 'availability-index');
  const findOne = vi.fn(async (
    filter: Readonly<Record<string, unknown>>,
    _options: unknown,
  ) => (
    stored && stored._id === filter._id ? structuredClone(stored) : null
  ));
  const updateOne = vi.fn(async (
    filter: Readonly<Record<string, unknown>>,
    update: Readonly<{
      $set?: Readonly<Record<string, unknown>>;
      $setOnInsert?: Readonly<Record<string, unknown>>;
    }>,
    _options: unknown,
  ) => {
    if (update.$setOnInsert) {
      if (stored !== null) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      stored = {
        _id: structuredClone(filter._id),
        ...structuredClone(update.$setOnInsert),
      };
      return { matchedCount: 0, upsertedCount: 1 };
    }
    if (!stored || stored._id !== filter._id
      || stored.evidenceSha256 !== filter.evidenceSha256) {
      return { matchedCount: 0, upsertedCount: 0 };
    }
    stored = { ...stored, ...structuredClone(update.$set ?? {}) };
    return { matchedCount: 1, upsertedCount: 0 };
  });
  return {
    collection: {
      createIndex,
      findOne,
      updateOne,
    } as unknown as MediaSourceAudioAvailabilityEvidenceMongoCollectionV1,
    createIndex,
    findOne,
    updateOne,
    mutate: (change: (
      document: Record<string, unknown>,
    ) => Record<string, unknown>) => {
      if (!stored) throw new Error('TEST_DOCUMENT_MISSING');
      stored = change(structuredClone(stored));
    },
  };
}

function assetWithArtifacts(
  fixture: ReturnType<typeof sourceFixture>,
  streamIndexes: readonly number[],
): MediaSourceAudioArtifactAssetStateInputV1 {
  const state = createMediaSourceAudioArtifactAssetStateV1({
    asset: fixture.asset,
    records: streamIndexes.map((streamIndex, index) => (
      createArtifactRecord(fixture, streamIndex, index + 1)
    )),
  });
  return { ...fixture.asset, ...state };
}

function createArtifactRecord(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
  seed: number,
) {
  const pcm = Uint8Array.from(
    { length: 80 },
    (_, index) => (index + seed) % 256,
  );
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    audioStreamIndex,
  });
  const map = createMediaSourceAudioSampleEpochMapV1({
    binding,
    toolchain: {
      adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
      ffmpegVersion: 'ffmpeg-8.1',
      ffprobeVersion: 'ffprobe-8.1',
    },
    resourcePolicy: {
      policyVersion: 'availability-evidence-test-v1',
      maxSourceBytes: 1_000,
      maxCanonicalJsonBytes: 100_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 100,
      maxDecodedPcmBytes: 1_000,
      timeoutMs: 1_000,
    },
    frames: [{
      presentationTimestampTicks: '0',
      decodedSampleFrameCount: '10',
    }],
    pcm: {
      decodedByteLength: pcm.byteLength,
      decodedPcmSha256: digest(pcm),
    },
  });
  const policy: MediaSourceAudioPrivateArtifactPolicyV1 = {
    policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxChunkBytes: 32,
    maxChunkCount: 10,
    maxManifestBytes: 100_000,
    maxReadBytes: 100_000,
  };
  const mapSerialization = serializeMediaSourceAudioSampleEpochMapV1(map);
  const epochMapArtifact = createMediaSourceAudioEpochMapArtifactReferenceV1({
    serialization: mapSerialization,
  });
  const pcmChunks = createMediaSourceAudioPcmChunkPlanV1({ map, policy }).map(
    (entry) => createMediaSourceAudioPcmChunkReferenceV1({
      map,
      planEntry: entry,
      contentSha256: digest(pcm.subarray(
        Number(BigInt(entry.startSampleFrame) * BigInt(8)),
        Number(BigInt(entry.endExclusiveSampleFrame) * BigInt(8)),
      )),
    }),
  );
  return createMediaSourceAudioArtifactAssetRecordV1({
    asset: fixture.asset,
    mapSerialization,
    manifestSerialization: serializeMediaSourceAudioPrivateArtifactManifestV1(
      createMediaSourceAudioPrivateArtifactManifestV1({
        map,
        epochMapArtifact,
        pcmChunks,
        policy,
      }),
    ),
    publishedAt: NOW,
  });
}

function sourceFixture(
  tag: string,
  mediaKind: 'audio' | 'video',
  audioStreamIndexes: readonly number[],
  probeVersion = 'ffprobe-8.1',
) {
  const locator = {
    provider: 'R2' as const,
    objectKey: `tests/audio-availability-${tag}.mov`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-availability' },
    assetId: `asset-availability-${tag}`,
    mediaKind,
    byteLength: storageVersion.byteLength,
    contentSha256: digest(Buffer.from(`source-${tag}`)),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: locator.objectKey,
    },
    now: NOW,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion,
    formatName: mediaKind === 'audio' ? 'wav' : 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: mediaKind === 'video' ? [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30', denominator: '1' },
      realFrameRate: { numerator: '30', denominator: '1' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }] : [],
    audioStreams: audioStreamIndexes.map((streamIndex) => ({
      streamIndex,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    })),
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  const asset: MediaSourceAudioArtifactAssetStateInputV1 = {
    assetId: sourceVersion.assetId,
    type: mediaKind,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return { asset, qualification, sourceVersion };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
