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
  captureMediaSourceAudioAvailabilityEvidenceV1,
  type MediaSourceAudioAvailabilityEvidenceStorePortsV1,
  type MediaSourceAudioAvailabilityEvidenceV1,
} from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import { backfillMediaSourceAudioEvidenceV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
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
import type {
  MediaSourceVersionEvidenceRecordV1,
  MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

const NOW = new Date('2026-08-30T21:00:00.000Z');

describe('MediaSourceAudioEvidenceBackfillV1', () => {
  it('backfills and replays canonical no-audio proof without legacy inference', async () => {
    const fixture = sourceFixture('silent', 'video', []);
    const availability = availabilityStore();
    const legacy = legacyStore();
    const ports = {
      availabilityEvidenceStorePorts: availability.ports,
      legacyEvidenceStorePorts: legacy.ports,
    };

    await expect(backfillMediaSourceAudioEvidenceV1(fixture.asset, ports))
      .resolves.toMatchObject({
        disposition: 'BACKFILLED',
        audioDisposition: 'NO_AUDIO_STREAMS_OBSERVED',
        availabilityWriteDisposition: 'APPLIED',
        legacyWriteDisposition: 'NOT_REQUIRED',
        legacyEvidenceSha256: null,
      });
    await expect(backfillMediaSourceAudioEvidenceV1(fixture.asset, ports))
      .resolves.toMatchObject({
        disposition: 'BACKFILLED',
        availabilityWriteDisposition: 'UNCHANGED',
      });
    expect(legacy.load).not.toHaveBeenCalled();
    expect(legacy.compareAndSet).not.toHaveBeenCalled();
  });

  it('retains canonical decoded proof before the mergeable legacy root', async () => {
    const fixture = sourceFixture('decoded', 'video', [3]);
    const asset = withArtifacts(fixture, [3]);
    const order: string[] = [];
    const availability = availabilityStore(null, order);
    const legacy = legacyStore(null, order);

    const result = await backfillMediaSourceAudioEvidenceV1(asset, {
      availabilityEvidenceStorePorts: availability.ports,
      legacyEvidenceStorePorts: legacy.ports,
    });

    expect(result).toMatchObject({
      disposition: 'BACKFILLED',
      audioDisposition: 'DECODED_ARTIFACT_SET',
      availabilityWriteDisposition: 'APPLIED',
      legacyWriteDisposition: 'APPLIED',
      availabilityEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      legacyEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(order).toEqual(['canonical', 'legacy']);
    expect(legacy.current()?.sourceAudioArtifactsV1?.records)
      .toHaveLength(1);
    expect(legacy.current()?.sourcePtsCadenceMapV3).toBeNull();
  });

  it('skips image and incomplete decoded sources without evidence writes', async () => {
    const image = sourceFixture('image', 'image', []);
    const incomplete = sourceFixture('incomplete', 'video', [3]);
    const availability = availabilityStore();
    const legacy = legacyStore();
    const ports = {
      availabilityEvidenceStorePorts: availability.ports,
      legacyEvidenceStorePorts: legacy.ports,
    };

    await expect(backfillMediaSourceAudioEvidenceV1(image.asset, ports))
      .resolves.toEqual({
        disposition: 'NOT_APPLICABLE', reason: 'IMAGE_SOURCE',
      });
    await expect(backfillMediaSourceAudioEvidenceV1(incomplete.asset, ports))
      .resolves.toEqual({
        disposition: 'NOT_APPLICABLE',
        reason: 'AUDIO_TERMINAL_STATE_ABSENT',
      });
    expect(availability.compareAndSet).not.toHaveBeenCalled();
    expect(legacy.compareAndSet).not.toHaveBeenCalled();
  });

  it('stops at a canonical conflict before touching legacy evidence', async () => {
    const current = sourceFixture('conflict', 'video', [], 'ffprobe-8.0');
    const candidate = sourceFixture('conflict', 'video', [], 'ffprobe-8.1');
    const availability = availabilityStore(
      captureMediaSourceAudioAvailabilityEvidenceV1(current.asset),
    );
    const legacy = legacyStore();

    await expect(backfillMediaSourceAudioEvidenceV1(candidate.asset, {
      availabilityEvidenceStorePorts: availability.ports,
      legacyEvidenceStorePorts: legacy.ports,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'CANONICAL_CONFLICT',
      retryable: false,
    });
    expect(legacy.load).not.toHaveBeenCalled();
  });

  it('replays canonical proof after a retryable legacy-store outage', async () => {
    const fixture = sourceFixture('resume', 'video', [3]);
    const availability = availabilityStore();
    const legacy = legacyStore(null, [], 1);
    const ports = {
      availabilityEvidenceStorePorts: availability.ports,
      legacyEvidenceStorePorts: legacy.ports,
    };

    await expect(backfillMediaSourceAudioEvidenceV1(
      withArtifacts(fixture, [3]),
      ports,
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'LEGACY_STORE_CAS_FAILED',
      retryable: true,
    });
    expect(availability.current()).not.toBeNull();
    await expect(backfillMediaSourceAudioEvidenceV1(
      withArtifacts(fixture, [3]),
      ports,
    )).resolves.toMatchObject({
      disposition: 'BACKFILLED',
      availabilityWriteDisposition: 'UNCHANGED',
      legacyWriteDisposition: 'APPLIED',
    });
  });

  it('does not reinterpret zero-stream audio essence as no-audio video', async () => {
    const fixture = sourceFixture('invalid-audio', 'audio', []);
    await expect(backfillMediaSourceAudioEvidenceV1(fixture.asset, {
      availabilityEvidenceStorePorts: availabilityStore().ports,
      legacyEvidenceStorePorts: legacyStore().ports,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_STATE_INVALID',
      retryable: false,
    });
  });
});

function availabilityStore(
  initial: MediaSourceAudioAvailabilityEvidenceV1 | null = null,
  order: string[] = [],
) {
  let current = initial;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<
    MediaSourceAudioAvailabilityEvidenceStorePortsV1['compareAndSet']
  >[0]) => {
    order.push('canonical');
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
    current: () => current,
  };
}

function legacyStore(
  initial: MediaSourceVersionEvidenceRecordV1 | null = null,
  order: string[] = [],
  casFailures = 0,
) {
  let current = initial;
  let failures = casFailures;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<MediaSourceVersionEvidenceStorePortsV1['compareAndSet']>[0]) => {
    order.push('legacy');
    if (failures > 0) {
      failures -= 1;
      throw new Error('ATLAS_UNAVAILABLE');
    }
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) {
      return false;
    }
    current = next;
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies
      MediaSourceVersionEvidenceStorePortsV1,
    load,
    compareAndSet,
    current: () => current,
  };
}

function withArtifacts(
  fixture: ReturnType<typeof sourceFixture>,
  streamIndexes: readonly number[],
): MediaSourceAudioArtifactAssetStateInputV1 {
  const state = createMediaSourceAudioArtifactAssetStateV1({
    asset: fixture.asset,
    records: streamIndexes.map((streamIndex) => artifactRecord(
      fixture,
      streamIndex,
    )),
  });
  return { ...fixture.asset, ...state };
}

function artifactRecord(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
) {
  const pcm = Uint8Array.from({ length: 80 }, (_, index) => index % 256);
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
      policyVersion: 'audio-backfill-test-v1',
      maxSourceBytes: 1_000,
      maxCanonicalJsonBytes: 100_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 100,
      maxDecodedPcmBytes: 1_000,
      timeoutMs: 1_000,
    },
    frames: [{
      presentationTimestampTicks: '0', decodedSampleFrameCount: '10',
    }],
    pcm: { decodedByteLength: pcm.byteLength, decodedPcmSha256: digest(pcm) },
  });
  const policy = {
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
        map, epochMapArtifact, pcmChunks, policy,
      }),
    ),
    publishedAt: NOW,
  });
}

function sourceFixture(
  tag: string,
  mediaKind: 'audio' | 'image' | 'video',
  audioStreamIndexes: readonly number[],
  probeVersion = 'ffprobe-8.1',
) {
  const locator = {
    provider: 'R2' as const,
    objectKey: `tests/audio-backfill-${tag}.mov`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio-backfill' },
    assetId: `asset-audio-backfill-${tag}`,
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
