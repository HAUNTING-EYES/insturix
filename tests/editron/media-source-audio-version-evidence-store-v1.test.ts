import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  captureMediaSourceAudioAvailabilityEvidenceV1,
  type MediaSourceAudioAvailabilityEvidenceStorePortsV1,
  type MediaSourceAudioAvailabilityEvidenceV1,
} from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  createMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetStateV1,
  persistMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
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
  createMediaSourceAudioAvailabilityBoundStorePortsV1,
  MediaSourceAudioVersionEvidenceErrorV1,
} from '@/lib/editron/services/media-source-audio-version-evidence-store-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
}
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourceAudioVersionEvidenceStoreV1', () => {
  it('keeps a partial multi-stream set mutable and retains only the exact terminal set', async () => {
    const fixture = sourceFixture('multi', [1, 2]);
    const order: string[] = [];
    const active = activeStore(fixture.asset, order);
    const availability = availabilityStore(null, 0, order);
    const evidence = evidenceStore(null, 0, order);
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidence.ports,
    });
    const first = await persistArtifact(fixture, ports, null, 2, 20);
    expect(first.disposition).toBe('APPLIED');
    expect(availability.compareAndSet).not.toHaveBeenCalled();
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
    expect(order).toEqual(['asset']);

    if (first.disposition !== 'APPLIED') throw new Error('TEST_PARTIAL_WRITE_FAILED');
    order.length = 0;
    const complete = await persistArtifact(
      fixture,
      ports,
      first.state.sourceAudioArtifactsStateSha256V1,
      1,
      10,
    );
    expect(complete.disposition).toBe('APPLIED');
    expect(order).toEqual(['availability', 'evidence', 'asset']);
    expect(availability.current()?.availability.disposition)
      .toBe('DECODED_ARTIFACT_SET');
    expect(evidence.current()?.sourceAudioArtifactsV1?.records.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    )).toEqual([1, 2]);
  });

  it('retains a one-stream source before its first active audio write', async () => {
    const fixture = sourceFixture('single', [3]);
    const order: string[] = [];
    const active = activeStore(fixture.asset, order);
    const availability = availabilityStore(null, 0, order);
    const evidence = evidenceStore(null, 0, order);
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidence.ports,
    });

    await expect(persistArtifact(fixture, ports, null, 3, 30))
      .resolves.toMatchObject({ disposition: 'APPLIED' });
    expect(order).toEqual(['availability', 'evidence', 'asset']);
    expect(evidence.current()).toMatchObject({
      sourceAudioArtifactsV1: { records: [{ audioStreamIndex: 3 }] },
    });
    expect(availability.current()?.availability).toMatchObject({
      disposition: 'DECODED_ARTIFACT_SET',
      sourceAudioArtifactsV1: { records: [{ audioStreamIndex: 3 }] },
    });
  });

  it('retains terminal audio independently of an active nonterminal V3 slot', async () => {
    const fixture = sourceFixture('independent', [3]);
    const active = activeStore({
      ...fixture.asset,
      sourcePtsCadenceMapV3: { status: 'PENDING' },
      sourcePtsCadenceMapStateSha256V3: digest(Buffer.from('pending-v3')),
    });
    const availability = availabilityStore();
    const evidence = evidenceStore();
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidence.ports,
    });

    await expect(persistArtifact(fixture, ports, null, 3, 30))
      .resolves.toMatchObject({ disposition: 'APPLIED' });
    expect(evidence.current()).toMatchObject({
      sourcePtsCadenceMapV3: null,
      sourcePtsCadenceMapStateSha256V3: null,
      sourceAudioArtifactsV1: { records: [{ audioStreamIndex: 3 }] },
    });
    expect(active.current()).toMatchObject({
      sourcePtsCadenceMapV3: { status: 'PENDING' },
      sourceAudioArtifactsV1: { records: [{ audioStreamIndex: 3 }] },
    });
    expect(availability.current()?.availability.disposition)
      .toBe('DECODED_ARTIFACT_SET');
  });

  it('blocks the terminal active write for conflicting historical audio evidence', async () => {
    const fixture = sourceFixture('conflict', [1]);
    const conflictingState = createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [createRecord(fixture, 1, 99)],
    });
    const conflicting = captureMediaSourceVersionEvidenceV1({
      ...fixture.asset,
      ...conflictingState,
    });
    const active = activeStore(fixture.asset);
    const availability = availabilityStore();
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidenceStore(conflicting).ports,
    });

    const error = await persistArtifact(fixture, ports, null, 1, 10)
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(MediaSourceAudioVersionEvidenceErrorV1);
    expect(error).toMatchObject({
      reason: 'SOURCE_VERSION_EVIDENCE_CONFLICT', retryable: false,
    });
    expect(availability.current()?.availability.disposition)
      .toBe('DECODED_ARTIFACT_SET');
    expect(active.replace).not.toHaveBeenCalled();
  });

  it('blocks decoded activation when canonical evidence already proves no audio', async () => {
    const fixture = sourceFixture('availability-conflict', [1]);
    const noAudio = sourceFixture('availability-conflict', []);
    const canonicalNoAudio = captureMediaSourceAudioAvailabilityEvidenceV1(
      noAudio.asset,
    );
    const active = activeStore(fixture.asset);
    const evidence = evidenceStore();
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts:
        availabilityStore(canonicalNoAudio).ports,
      evidenceStorePorts: evidence.ports,
    });

    const error = await persistArtifact(fixture, ports, null, 1, 10)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      reason: 'SOURCE_AUDIO_AVAILABILITY_CONFLICT', retryable: false,
    });
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
    expect(active.replace).not.toHaveBeenCalled();
  });

  it('exhausts bounded evidence races without mutating the active terminal set', async () => {
    const fixture = sourceFixture('race', [1]);
    const active = activeStore(fixture.asset);
    const availability = availabilityStore();
    const evidence = evidenceStore(null, 2);
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidence.ports,
    });

    const error = await persistArtifact(fixture, ports, null, 1, 10)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      reason: 'SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED', retryable: true,
    });
    expect(evidence.compareAndSet).toHaveBeenCalledTimes(2);
    expect(availability.current()?.availability.disposition)
      .toBe('DECODED_ARTIFACT_SET');
    expect(active.replace).not.toHaveBeenCalled();
  });

  it('exhausts canonical availability races before legacy or active writes', async () => {
    const fixture = sourceFixture('availability-race', [1]);
    const active = activeStore(fixture.asset);
    const availability = availabilityStore(null, 2);
    const evidence = evidenceStore();
    const ports = createMediaSourceAudioAvailabilityBoundStorePortsV1({
      assetStorePorts: active.ports,
      availabilityEvidenceStorePorts: availability.ports,
      evidenceStorePorts: evidence.ports,
    });

    const error = await persistArtifact(fixture, ports, null, 1, 10)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      reason: 'SOURCE_AUDIO_AVAILABILITY_RACE_EXHAUSTED', retryable: true,
    });
    expect(availability.compareAndSet).toHaveBeenCalledTimes(2);
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
    expect(active.replace).not.toHaveBeenCalled();
  });
});

async function persistArtifact(
  fixture: ReturnType<typeof sourceFixture>,
  ports: MediaSourceAudioArtifactAssetStorePortsV1,
  expectedStateSha256: string | null,
  audioStreamIndex: number,
  pcmSeed: number,
) {
  return persistMediaSourceAudioArtifactAssetStateV1({
    assetId: fixture.sourceVersion.assetId,
    userId: 'user-1',
    expectedStateSha256,
    ...artifactFixture(fixture, audioStreamIndex, pcmSeed),
    publishedAt: new Date('2026-08-30T12:00:00.000Z'),
  }, ports);
}

function activeStore(
  initial: MediaSourceAudioArtifactAssetStateInputV1,
  order: string[] = [],
) {
  let asset = initial;
  const load = vi.fn(async () => asset);
  const replace = vi.fn(async ({ nextState }: Parameters<
    MediaSourceAudioArtifactAssetStorePortsV1['replace']
  >[0]) => {
    asset = { ...asset, ...nextState };
    order.push('asset');
    return true;
  });
  return {
    ports: { load, replace } satisfies MediaSourceAudioArtifactAssetStorePortsV1,
    load,
    replace,
    current: () => asset,
  };
}

function evidenceStore(
  initial: MediaSourceVersionEvidenceRecordV1 | null = null,
  forcedRaces = 0,
  order: string[] = [],
) {
  let current = initial;
  let races = forcedRaces;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<MediaSourceVersionEvidenceStorePortsV1['compareAndSet']>[0]) => {
    if (races > 0) {
      races -= 1;
      return false;
    }
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) return false;
    current = next;
    order.push('evidence');
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies MediaSourceVersionEvidenceStorePortsV1,
    compareAndSet,
    current: () => current,
  };
}

function availabilityStore(
  initial: MediaSourceAudioAvailabilityEvidenceV1 | null = null,
  forcedRaces = 0,
  order: string[] = [],
) {
  let current = initial;
  let races = forcedRaces;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<
    MediaSourceAudioAvailabilityEvidenceStorePortsV1['compareAndSet']
  >[0]) => {
    if (races > 0) {
      races -= 1;
      return false;
    }
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) return false;
    current = next;
    order.push('availability');
    return true;
  });
  return {
    ports: {
      load,
      compareAndSet,
    } satisfies MediaSourceAudioAvailabilityEvidenceStorePortsV1,
    compareAndSet,
    current: () => current,
  };
}

function createRecord(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
  pcmSeed: number,
) {
  return createMediaSourceAudioArtifactAssetRecordV1({
    asset: fixture.asset,
    ...artifactFixture(fixture, audioStreamIndex, pcmSeed),
    publishedAt: new Date('2026-08-30T12:00:00.000Z'),
  });
}

function artifactFixture(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
  pcmSeed: number,
) {
  const pcm = Uint8Array.from({ length: 80 }, (_, index) => (index + pcmSeed) % 256);
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
      policyVersion: 'audio-version-evidence-test-v1',
      maxSourceBytes: 1_000,
      maxCanonicalJsonBytes: 100_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 100,
      maxDecodedPcmBytes: 1_000,
      timeoutMs: 1_000,
    },
    frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '10' }],
    pcm: { decodedByteLength: pcm.byteLength, decodedPcmSha256: digest(pcm) },
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
  const pcmChunks = createMediaSourceAudioPcmChunkPlanV1({ map, policy }).map((entry) => (
    createMediaSourceAudioPcmChunkReferenceV1({
      map,
      planEntry: entry,
      contentSha256: digest(pcm.subarray(
        Number(BigInt(entry.startSampleFrame) * BigInt(8)),
        Number(BigInt(entry.endExclusiveSampleFrame) * BigInt(8)),
      )),
    })
  ));
  const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(
    createMediaSourceAudioPrivateArtifactManifestV1({
      map,
      epochMapArtifact,
      pcmChunks,
      policy,
    }),
  );
  return { mapSerialization, manifestSerialization };
}

function sourceFixture(tag: string, audioStreamIndexes: readonly number[]) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/audio-version-${tag}.mov` },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: `asset-audio-version-${tag}`,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: digest(Buffer.from(`source-${tag}`)),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: storageVersion.locator.objectKey,
    },
    now: new Date('2026-08-30T00:00:00.000Z'),
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
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
    }],
    audioStreams: audioStreamIndexes.map((streamIndex) => ({
      streamIndex,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '10',
    })),
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  const asset: MediaSourceAudioArtifactAssetStateInputV1 = {
    assetId: sourceVersion.assetId,
    type: 'video',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return { asset, qualification, sourceVersion };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
