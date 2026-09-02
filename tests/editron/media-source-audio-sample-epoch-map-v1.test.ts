import { describe, expect, it } from 'vitest';

import {
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  assertMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  parseMediaSourceAudioSampleEpochMapV1,
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioDecodedFrameEvidenceV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { parseMediaSourceProbeResponseV1 } from '@/lib/editron/services/media-source-probe-v1';
import {
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source audio sample epoch map V1', () => {
  it('binds exact source evidence and preserves fractional phase, gaps, overlaps, and resets', () => {
    const fixture = sourceFixture();
    const binding = createMediaSourceAudioStreamBindingV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 1,
    });
    const frames: readonly MediaSourceAudioDecodedFrameEvidenceV1[] = [
      { presentationTimestampTicks: '-1', decodedSampleFrameCount: '1024' },
      { presentationTimestampTicks: '1919', decodedSampleFrameCount: '1024' },
      { presentationTimestampTicks: '4000', decodedSampleFrameCount: '1024' },
      { presentationTimestampTicks: '5000', decodedSampleFrameCount: '1024' },
      { presentationTimestampTicks: '-100', decodedSampleFrameCount: '1024' },
    ];
    const map = createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: toolchain(),
      resourcePolicy: policy(),
      frames,
      pcm: { decodedByteLength: 40_960, decodedPcmSha256: 'f'.repeat(64) },
    });

    expect(binding).toMatchObject({
      assetId: 'audio-sample-map-fixture',
      mediaKind: 'video',
      streamId: 'audio-1',
      audioStreamIndex: 1,
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '90000' },
    });
    expect(map.epochs.map((epoch) => epoch.boundaryKind)).toEqual([
      'INITIAL', 'GAP', 'OVERLAP', 'TIMESTAMP_RESET',
    ]);
    expect(map.epochs[0]).toMatchObject({
      firstDecodedFrameOrdinal: '0',
      endExclusiveDecodedFrameOrdinal: '2',
      decodedStartSampleFrame: '0',
      decodedEndExclusiveSampleFrame: '2048',
      sourceStartSamplePosition: { numerator: '-8', denominator: '15' },
    });
    expect(map.epochs[1]?.precedingDisplacementSampleFrames)
      .toEqual({ numerator: '1288', denominator: '15' });
    expect(map.frameScan).toMatchObject({
      decodedFrameCount: '5',
      decodedSampleFrameCount: '5120',
    });
    expect(map.pcm).toMatchObject({
      codec: 'PCM_S32LE',
      sampleRate: '48000',
      channelCount: 2,
      decodedSampleFrameCount: '5120',
      decodedByteLength: 40_960,
    });
    expect(map.decodePolicy).toMatchObject({
      primingAndPadding: 'FFMPEG_DECODED_OUTPUT_TIMELINE',
      editLists: 'FFMPEG_DEMUXED_OUTPUT_TIMELINE',
      gaps: 'DECLARED_AS_EPOCH_NO_SYNTHETIC_SAMPLES',
      overlaps: 'DECLARED_AS_EPOCH_NO_DROPPED_SAMPLES',
      resampling: 'FORBIDDEN',
      channelRemix: 'FORBIDDEN',
    });
    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map.epochs)).toBe(true);
  });

  it('round-trips only canonical, hash-valid serialized evidence', () => {
    const map = continuousMap();
    const serialized = serializeMediaSourceAudioSampleEpochMapV1(map);

    expect(parseMediaSourceAudioSampleEpochMapV1(serialized.canonicalJson)).toEqual(map);
    expect(serialized.byteLength).toBe(Buffer.byteLength(serialized.canonicalJson, 'utf8'));
    expect(serialized.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => parseMediaSourceAudioSampleEpochMapV1(` ${serialized.canonicalJson}`))
      .toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_JSON_NON_CANONICAL');

    const tampered = JSON.parse(serialized.canonicalJson) as Record<string, unknown>;
    (tampered.pcm as Record<string, unknown>).decodedPcmSha256 = '0'.repeat(64);
    expect(() => assertMediaSourceAudioSampleEpochMapV1(tampered))
      .toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_HASH_MISMATCH');

    const extraField = { ...map, undeclared: true };
    expect(() => assertMediaSourceAudioSampleEpochMapV1(extraField))
      .toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_FIELDS_INVALID');
  });

  it('rejects missing, duplicate, and technically incomplete stream selections', () => {
    const fixture = sourceFixture();
    expect(() => createMediaSourceAudioStreamBindingV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 99,
    })).toThrow('MEDIA_SOURCE_AUDIO_BINDING_STREAM_NOT_UNIQUE');

    const duplicate = sourceFixture({ duplicateAudioStream: true });
    expect(() => createMediaSourceAudioStreamBindingV1({
      sourceVersion: duplicate.sourceVersion,
      qualification: duplicate.qualification,
      audioStreamIndex: 1,
    })).toThrow('MEDIA_SOURCE_AUDIO_BINDING_STREAM_NOT_UNIQUE');

    const incomplete = sourceFixture({ channelLayout: null });
    expect(() => createMediaSourceAudioStreamBindingV1({
      sourceVersion: incomplete.sourceVersion,
      qualification: incomplete.qualification,
      audioStreamIndex: 1,
    })).toThrow('MEDIA_SOURCE_AUDIO_BINDING_STREAM_TECHNICAL_EVIDENCE_INCOMPLETE');
  });

  it('rejects stale storage and altered technical observations', () => {
    const fixture = sourceFixture();
    const changedStorage = createMediaSourceStorageVersionV1({
      locator: fixture.sourceVersion.storageVersion.locator,
      byteLength: fixture.sourceVersion.byteLength,
      providerVersion: { kind: 'R2_ETAG', value: 'changed-etag' },
    });
    const changedSource = createMediaSourceVersionV1({
      ...fixture.sourceVersion,
      storageVersion: changedStorage,
    });
    expect(() => createMediaSourceAudioStreamBindingV1({
      sourceVersion: changedSource,
      qualification: fixture.qualification,
      audioStreamIndex: 1,
    })).toThrow('MEDIA_SOURCE_AUDIO_BINDING_QUALIFICATION_INVALID');

    const alteredQualification = {
      ...fixture.qualification,
      observation: {
        ...fixture.qualification.observation!,
        formatName: 'tampered',
      },
    };
    expect(() => createMediaSourceAudioStreamBindingV1({
      sourceVersion: fixture.sourceVersion,
      qualification: alteredQualification,
      audioStreamIndex: 1,
    })).toThrow('MEDIA_SOURCE_AUDIO_BINDING_OBSERVATION_HASH_MISMATCH');
  });

  it('fails closed on epoch, sample, PCM, and canonical byte limits', () => {
    const fixture = sourceFixture();
    const binding = createMediaSourceAudioStreamBindingV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 1,
    });
    const discontinuous = [
      { presentationTimestampTicks: '0', decodedSampleFrameCount: '1' },
      { presentationTimestampTicks: '10', decodedSampleFrameCount: '1' },
      { presentationTimestampTicks: '20', decodedSampleFrameCount: '1' },
    ];
    expect(() => createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: toolchain(),
      resourcePolicy: { ...policy(), maxEpochEntries: 2 },
      frames: discontinuous,
      pcm: { decodedByteLength: 24, decodedPcmSha256: 'a'.repeat(64) },
    })).toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_EPOCH_LIMIT_EXCEEDED');

    expect(() => createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: toolchain(),
      resourcePolicy: { ...policy(), maxDecodedSampleFrames: 1 },
      frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '2' }],
      pcm: { decodedByteLength: 16, decodedPcmSha256: 'a'.repeat(64) },
    })).toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SAMPLE_LIMIT_EXCEEDED');

    expect(() => createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: toolchain(),
      resourcePolicy: policy(),
      frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '2' }],
      pcm: { decodedByteLength: 8, decodedPcmSha256: 'a'.repeat(64) },
    })).toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_SAMPLE_COUNT_MISMATCH');

    const byteLimitedMap = createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: toolchain(),
      resourcePolicy: { ...policy(), maxCanonicalJsonBytes: 256 },
      frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '1' }],
      pcm: { decodedByteLength: 8, decodedPcmSha256: 'a'.repeat(64) },
    });
    expect(() => serializeMediaSourceAudioSampleEpochMapV1(byteLimitedMap))
      .toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_BYTE_LIMIT_EXCEEDED');
  });
});

function continuousMap() {
  const fixture = sourceFixture({ sourceTimebase: '1/48000' });
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    audioStreamIndex: 1,
  });
  return createMediaSourceAudioSampleEpochMapV1({
    binding,
    toolchain: toolchain(),
    resourcePolicy: policy(),
    frames: [
      { presentationTimestampTicks: '0', decodedSampleFrameCount: '1024' },
      { presentationTimestampTicks: '1024', decodedSampleFrameCount: '1024' },
    ],
    pcm: { decodedByteLength: 16_384, decodedPcmSha256: 'e'.repeat(64) },
  });
}

function sourceFixture(options: Readonly<{
  sourceTimebase?: string;
  channelLayout?: string | null;
  duplicateAudioStream?: boolean;
}> = {}) {
  const sourceTimebase = options.sourceTimebase ?? '1/90000';
  const audioStream = {
    index: 1,
    codec_type: 'audio',
    codec_name: 'pcm_s16le',
    sample_rate: '48000',
    channels: 2,
    channel_layout: options.channelLayout === undefined ? 'stereo' : options.channelLayout,
    time_base: sourceTimebase,
    start_pts: '-1',
    duration_ts: '90000',
  };
  const observation = parseMediaSourceProbeResponseV1({
    ok: true,
    probe_version: 'ffprobe version 8.1',
    format: { format_name: 'matroska', duration: '1', start_time: '0' },
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'ffv1',
        width: 16,
        height: 16,
        time_base: '1/1000',
        start_pts: '0',
        duration_ts: '1000',
        avg_frame_rate: '1/1',
        r_frame_rate: '1/1',
        nb_frames: '1',
      },
      audioStream,
      ...(options.duplicateAudioStream ? [audioStream] : []),
    ],
  });
  if (!observation) throw new Error('TEST_OBSERVATION_INVALID');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'tests/audio-sample-map-fixture.mkv' },
    byteLength: 1000,
    providerVersion: { kind: 'R2_ETAG', value: 'fixture-etag' },
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: 'audio-sample-map-fixture',
      source: 'user-upload',
      r2Key: storageVersion.locator.objectKey,
    },
    now: new Date('2026-08-29T00:00:00.000Z'),
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_QUALIFICATION_CREATE_FAILED');
  const claimed = claimMediaSourceQualificationV1({
    record: created.record,
    sourceBindingSha256: created.record.sourceBindingSha256,
    now: new Date('2026-08-29T00:00:01.000Z'),
  });
  if (claimed.disposition !== 'CLAIMED') throw new Error('TEST_QUALIFICATION_CLAIM_FAILED');
  const completed = completeMediaSourceQualificationV1({
    record: claimed.record,
    sourceBindingSha256: claimed.record.sourceBindingSha256,
    result: { disposition: 'MEASURED', observation, diagnostics: [] },
    storageVersion,
    now: new Date('2026-08-29T00:00:02.000Z'),
  });
  if (completed.disposition !== 'COMPLETED') throw new Error('TEST_QUALIFICATION_COMPLETE_FAILED');
  const qualification: MediaSourceQualificationRecordV1 = completed.record;
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'audio-sample-owner' },
    assetId: qualification.assetId,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: 'b'.repeat(64),
    storageVersion,
  });
  return { qualification, sourceVersion };
}

function toolchain() {
  return {
    adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
    ffmpegVersion: 'ffmpeg version 8.1',
    ffprobeVersion: 'ffprobe version 8.1',
  };
}

function policy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-sample-epoch-test-v1',
    maxSourceBytes: 1024 * 1024,
    maxCanonicalJsonBytes: 1024 * 1024,
    maxDecodedFrameEntries: 100,
    maxEpochEntries: 100,
    maxDecodedSampleFrames: 100_000,
    maxDecodedPcmBytes: 1024 * 1024,
    timeoutMs: 20_000,
  };
}
