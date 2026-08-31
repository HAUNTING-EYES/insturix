import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  assertNativeMediaTimestampPreviewAudioWindowV1,
  nativeMediaTimestampPreviewAudioRoutePathV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-window-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  materializeNativeMediaTimestampPreviewAudioWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_DEFAULT_POLICY_V1,
  verifyNativeMediaTimestampAudioPcmWindowV1,
} from '@/lib/editron/services/native-media-timestamp-preview-audio-materializer-v1';
import type { VideoSourceTimestampConformV3 } from '@/lib/editron/services/video-source-time-transform-v1';

const ASSET_ID = 'asset-audio-1';
const SOURCE_SHA = '1'.repeat(64);
const STORAGE_SHA = '2'.repeat(64);
const SOURCE_BINDING_SHA = '3'.repeat(64);
const OBSERVATION_SHA = '4'.repeat(64);
const MAP_SHA = '5'.repeat(64);
const STREAM_BINDING_SHA = '6'.repeat(64);
const DECODED_PCM_SHA = '7'.repeat(64);
const MANIFEST_SHA = '8'.repeat(64);
const LEASE_EXPIRY = 1_900_003_600_000;
const PROJECT_RATE = { numerator: '2', denominator: '1' } as const;
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
};
const LEASE = {
  leaseId: 'nmpwl2_' + 'a'.repeat(64),
  issuedAtEpochMs: 1_900_000_000_000,
  renewAfterEpochMs: 1_900_003_000_000,
  expiresAtEpochMs: LEASE_EXPIRY,
};
const MANIFEST_REFERENCE = {
  schemaVersion: 1 as const,
  storage: 'R2_PRIVATE' as const,
  artifactKind: 'MANIFEST' as const,
  objectKey: 'private/editron/media-source-audio/v1/'
    + SOURCE_SHA + '/' + MAP_SHA + '/manifests/' + MANIFEST_SHA + '.json',
  byteLength: 1_024,
  contentSha256: '9'.repeat(64),
};

type AudioMappingV3 = NonNullable<VideoSourceTimestampConformV3['audioMapping']>;

function position(numerator: string, denominator = '1') {
  return {
    numerator,
    denominator,
    disposition: denominator === '1'
      ? 'INTEGER_SAMPLE_FRAME' as const
      : 'BETWEEN_SAMPLE_FRAMES' as const,
  };
}

function mapping(): AudioMappingV3 {
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_VERIFIED_AUDIO_SAMPLE_TIME_MAPPING_V3' as const,
    assetId: ASSET_ID,
    sourceVersionSha256: SOURCE_SHA,
    storageVersionSha256: STORAGE_SHA,
    sourceBindingSha256: SOURCE_BINDING_SHA,
    technicalObservationSha256: OBSERVATION_SHA,
    audioSampleEpochMapSha256: MAP_SHA,
    audioStreamBindingSha256: STREAM_BINDING_SHA,
    decodedPcmSha256: DECODED_PCM_SHA,
    streamId: 'audio-1',
    audioStreamIndex: 1,
    sampleRate: '3',
    channelCount: 1,
    decodedSampleFrameCount: '5',
    timelineStartFrame: '0',
    endExclusiveTimelineFrame: '4',
    canonicalTimelineStartSamplePosition: position('0'),
    canonicalTimelineEndExclusiveSamplePosition: position('6'),
    policy: {
      epochAlignment: 'PAIRED_VERIFIED_VIDEO_AUDIO_EPOCH_ORDINAL_V1' as const,
      samplePhase: 'PRESERVE_EXACT_RATIONAL_NO_ROUNDING' as const,
      gaps: 'EXPLICIT_SILENCE_SEGMENTS' as const,
      overlapsAndResets: 'VERIFIED_CANONICAL_EPOCH_HANDOFF' as const,
      resampling: 'FORBIDDEN' as const,
      channelRemix: 'FORBIDDEN' as const,
    },
    segments: [
      {
        kind: 'PCM' as const,
        audioEpochId: 'audio-epoch-0',
        canonicalStartSamplePosition: position('0'),
        canonicalEndExclusiveSamplePosition: position('3'),
        decodedStartSamplePosition: position('0'),
        decodedEndExclusiveSamplePosition: position('3'),
      },
      {
        kind: 'SILENCE' as const,
        reason: 'DECLARED_SOURCE_GAP' as const,
        precedingAudioEpochId: 'audio-epoch-0',
        nextAudioEpochId: 'audio-epoch-1',
        canonicalStartSamplePosition: position('3'),
        canonicalEndExclusiveSamplePosition: position('9', '2'),
      },
      {
        kind: 'PCM' as const,
        audioEpochId: 'audio-epoch-1',
        canonicalStartSamplePosition: position('9', '2'),
        canonicalEndExclusiveSamplePosition: position('6'),
        decodedStartSamplePosition: position('3'),
        decodedEndExclusiveSamplePosition: position('9', '2'),
      },
    ],
  };
  return {
    ...material,
    audioMappingSha256: hashEditronCanonicalJsonV1(material),
  };
}

function input(overrides: Partial<Parameters<
  typeof materializeNativeMediaTimestampPreviewAudioWindowV1
>[0]> = {}) {
  return {
    leaseScope: {
      userId: 'user-owner',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'video-1',
      projectRevision: REVISION,
    },
    lease: LEASE,
    mapping: mapping(),
    projectRate: PROJECT_RATE,
    overlayFromFrame: 0,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 4,
    expectedAssetId: ASSET_ID,
    manifestSha256: MANIFEST_SHA,
    manifestReference: MANIFEST_REFERENCE,
    ...overrides,
  };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function pcmBytes(start: string, end: string): Uint8Array {
  const frameCount = Number(BigInt(end) - BigInt(start));
  return Uint8Array.from(
    { length: frameCount * 4 },
    (_, index) => (Number(start) * 17 + index) % 256,
  );
}

function createPorts(options: Readonly<{
  alterRange?: (range: ReturnType<typeof rangeFor>) => ReturnType<typeof rangeFor>;
  failSurfaceWriteAt?: number;
  failCleanup?: boolean;
}> = {}) {
  const readPcmSampleRange = vi.fn(async (request: Readonly<{
    manifestReference: typeof MANIFEST_REFERENCE;
    startSampleFrame: string;
    endExclusiveSampleFrame: string;
  }>) => {
    const range = rangeFor(request.startSampleFrame, request.endExclusiveSampleFrame);
    return options.alterRange?.(range) ?? range;
  });
  let writeCount = 0;
  const putAudioSegment = vi.fn(async () => {
    writeCount += 1;
    if (options.failSurfaceWriteAt === writeCount) {
      throw new Error('TEST_AUDIO_SURFACE_WRITE_FAILED');
    }
    const digit = String(writeCount);
    return {
      audioHandle: 'nmpa1_' + digit.repeat(64),
      segmentIdentitySha256: (digit === '1' ? 'b' : 'c').repeat(64),
      expiresAtEpochMs: LEASE_EXPIRY,
    };
  });
  const deleteAudioSegment = vi.fn(async () => {
    if (options.failCleanup) throw new Error('TEST_AUDIO_SURFACE_DELETE_FAILED');
  });
  return {
    ports: {
      pcmReader: { readPcmSampleRange },
      surfaceStore: { putAudioSegment, deleteAudioSegment },
    },
    readPcmSampleRange,
    putAudioSegment,
    deleteAudioSegment,
  };
}

function rangeFor(startSampleFrame: string, endExclusiveSampleFrame: string) {
  const bytes = pcmBytes(startSampleFrame, endExclusiveSampleFrame);
  return {
    manifestSha256: MANIFEST_SHA,
    audioSampleEpochMapSha256: MAP_SHA,
    decodedPcmSha256: DECODED_PCM_SHA,
    streamId: 'audio-1',
    sampleRate: '3',
    channelCount: 1,
    startSampleFrame,
    endExclusiveSampleFrame,
    pcmBytes: bytes,
    rangeSha256: digest(bytes),
  };
}

describe('native media timestamp preview audio materializer V1', () => {
  it('verifies exact PCM ranges without exposing bytes or writing browser surfaces', async () => {
    const runtime = createPorts();

    const result = await verifyNativeMediaTimestampAudioPcmWindowV1(
      input(),
      { pcmReader: runtime.ports.pcmReader },
    );

    expect(result).toMatchObject({
      disposition: 'PCM_WINDOW_VERIFIED',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'video-1',
      projectRevision: REVISION,
      sourceVersionSha256: SOURCE_SHA,
      storageVersionSha256: STORAGE_SHA,
      manifestSha256: MANIFEST_SHA,
      audioMappingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      audioSampleEpochMapSha256: MAP_SHA,
      decodedPcmSha256: DECODED_PCM_SHA,
      readOperations: 2,
      totalPcmBytes: 20,
      pcmSegmentCount: 2,
      silenceSegmentCount: 1,
      segments: [
        {
          kind: 'PCM',
          sourceStartSampleFrame: '0',
          sourceEndExclusiveSampleFrame: '3',
          pcmByteLength: 12,
          rangeSha256: digest(pcmBytes('0', '3')),
        },
        {
          kind: 'SILENCE',
          reason: 'DECLARED_SOURCE_GAP',
        },
        {
          kind: 'PCM',
          sourceStartSampleFrame: '3',
          sourceEndExclusiveSampleFrame: '5',
          pcmByteLength: 8,
          rangeSha256: digest(pcmBytes('3', '5')),
        },
      ],
      proofSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(runtime.readPcmSampleRange).toHaveBeenCalledTimes(2);
    expect(runtime.putAudioSegment).not.toHaveBeenCalled();
    expect(runtime.deleteAudioSegment).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(MANIFEST_REFERENCE.objectKey);
    expect(serialized).not.toContain('"pcmBytes"');
  });

  it('rejects a forged PCM range hash without writing browser surfaces', async () => {
    const runtime = createPorts({
      alterRange: (range) => ({ ...range, rangeSha256: 'f'.repeat(64) }),
    });

    await expect(verifyNativeMediaTimestampAudioPcmWindowV1(
      input(),
      { pcmReader: runtime.ports.pcmReader },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PCM_SCOPE_MISMATCH',
      diagnostic: 'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_RANGE_SCOPE_MISMATCH',
    });
    expect(runtime.putAudioSegment).not.toHaveBeenCalled();
    expect(runtime.deleteAudioSegment).not.toHaveBeenCalled();
  });

  it('materializes exact PCM/silence coverage and a browser-safe leased schedule', async () => {
    const runtime = createPorts();

    const result = await materializeNativeMediaTimestampPreviewAudioWindowV1(
      input(),
      runtime.ports,
    );

    expect(result).toMatchObject({
      disposition: 'AUDIO_WINDOW_MATERIALIZED',
      window: {
        projectId: 'project-1',
        projectRevision: REVISION,
        sampleRate: 3,
        channelCount: 1,
        windowProjectStartFrame: 0,
        windowProjectEndExclusiveFrame: 4,
        canonicalWindowStartSamplePosition: position('0'),
        canonicalWindowEndExclusiveSamplePosition: position('6'),
        lease: LEASE,
        segments: [
          {
            kind: 'PCM',
            sourceStartSampleFrame: '0',
            sourceEndExclusiveSampleFrame: '3',
            audioHandle: 'nmpa1_' + '1'.repeat(64),
          },
          {
            kind: 'SILENCE',
            reason: 'DECLARED_SOURCE_GAP',
            timelineStartSamplePosition: position('3'),
            timelineEndExclusiveSamplePosition: position('9', '2'),
          },
          {
            kind: 'PCM',
            sourceStartSampleFrame: '3',
            sourceEndExclusiveSampleFrame: '5',
            audioHandle: 'nmpa1_' + '2'.repeat(64),
          },
        ],
        windowSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(runtime.readPcmSampleRange.mock.calls.map(([request]) => ({
      start: request.startSampleFrame,
      end: request.endExclusiveSampleFrame,
    }))).toEqual([
      { start: '0', end: '3' },
      { start: '3', end: '5' },
    ]);
    expect(runtime.putAudioSegment).toHaveBeenCalledTimes(2);
    expect(runtime.deleteAudioSegment).not.toHaveBeenCalled();

    if (result.disposition !== 'AUDIO_WINDOW_MATERIALIZED') {
      throw new Error('TEST_AUDIO_WINDOW_REQUIRED');
    }
    expect(assertNativeMediaTimestampPreviewAudioWindowV1(result.window))
      .toEqual(result.window);
    expect(nativeMediaTimestampPreviewAudioRoutePathV1(
      result.window.projectId,
      result.window.segments[0]!.kind === 'PCM'
        ? result.window.segments[0]!.audioHandle
        : '',
    )).toBe(
      '/api/services/editron/media/timestamp-preview/audio/project-1/nmpa1_'
        + '1'.repeat(64),
    );
  });

  it('preserves fractional phase when a frame window clips a PCM segment', async () => {
    const runtime = createPorts();

    const result = await materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ windowLocalStartFrame: 1, windowDurationInFrames: 1 }),
      runtime.ports,
    );

    expect(result).toMatchObject({
      disposition: 'AUDIO_WINDOW_MATERIALIZED',
      window: {
        canonicalWindowStartSamplePosition: position('3', '2'),
        canonicalWindowEndExclusiveSamplePosition: position('3'),
        segments: [{
          kind: 'PCM',
          sourceStartSampleFrame: '1',
          sourceEndExclusiveSampleFrame: '3',
          decodedStartSamplePosition: position('3', '2'),
          decodedEndExclusiveSamplePosition: position('3'),
          timelineStartSamplePosition: position('3', '2'),
          timelineEndExclusiveSamplePosition: position('3'),
        }],
      },
    });
    expect(runtime.readPcmSampleRange).toHaveBeenCalledWith({
      manifestReference: MANIFEST_REFERENCE,
      startSampleFrame: '1',
      endExclusiveSampleFrame: '3',
    });
  });

  it('rejects browser-contract coverage gaps and duplicate opaque handles', async () => {
    const result = await materializeNativeMediaTimestampPreviewAudioWindowV1(
      input(),
      createPorts().ports,
    );
    if (result.disposition !== 'AUDIO_WINDOW_MATERIALIZED') {
      throw new Error('TEST_AUDIO_WINDOW_REQUIRED');
    }
    const [first, silence, last] = result.window.segments;
    if (first?.kind !== 'PCM' || silence?.kind !== 'SILENCE' || last?.kind !== 'PCM') {
      throw new Error('TEST_AUDIO_WINDOW_SEGMENTS_REQUIRED');
    }
    expect(() => assertNativeMediaTimestampPreviewAudioWindowV1({
      ...result.window,
      segments: [
        first,
        {
          ...silence,
          timelineStartSamplePosition: position('7', '2'),
        },
        last,
      ],
    })).toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_COVERAGE_INVALID');
    expect(() => assertNativeMediaTimestampPreviewAudioWindowV1({
      ...result.window,
      segments: [
        first,
        silence,
        { ...last, audioHandle: first.audioHandle },
      ],
    })).toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_HANDLE_DUPLICATE');
  });

  it('represents an all-silence frame window without reading or inventing PCM', async () => {
    const runtime = createPorts();

    const result = await materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ windowLocalStartFrame: 2, windowDurationInFrames: 1 }),
      runtime.ports,
    );

    expect(result).toMatchObject({
      disposition: 'AUDIO_WINDOW_MATERIALIZED',
      window: {
        segments: [{
          kind: 'SILENCE',
          timelineStartSamplePosition: position('3'),
          timelineEndExclusiveSamplePosition: position('9', '2'),
        }],
      },
    });
    expect(runtime.readPcmSampleRange).not.toHaveBeenCalled();
    expect(runtime.putAudioSegment).not.toHaveBeenCalled();
  });

  it('rejects mapping/asset/range tamper before returning an audio window', async () => {
    const changedMapping = {
      ...mapping(),
      decodedPcmSha256: 'f'.repeat(64),
    };
    const mappingRuntime = createPorts();
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ mapping: changedMapping }),
      mappingRuntime.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INPUT_INVALID',
      diagnostic: 'NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_HASH_INVALID',
    });
    expect(mappingRuntime.readPcmSampleRange).not.toHaveBeenCalled();

    const assetRuntime = createPorts();
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ expectedAssetId: 'other-asset' }),
      assetRuntime.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INPUT_INVALID',
      diagnostic: 'NATIVE_MEDIA_PREVIEW_AUDIO_ASSET_SCOPE_MISMATCH',
    });

    const rangeRuntime = createPorts({
      alterRange: (range) => ({ ...range, audioSampleEpochMapSha256: 'f'.repeat(64) }),
    });
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ windowDurationInFrames: 1 }),
      rangeRuntime.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'PCM_SCOPE_MISMATCH',
    });
    expect(rangeRuntime.putAudioSegment).not.toHaveBeenCalled();
  });

  it('cleans earlier handles after a later write fails and reports cleanup failure honestly', async () => {
    const runtime = createPorts({ failSurfaceWriteAt: 2 });
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input(),
      runtime.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SURFACE_WRITE_FAILED',
      diagnostic: 'TEST_AUDIO_SURFACE_WRITE_FAILED',
    });
    expect(runtime.deleteAudioSegment).toHaveBeenCalledWith(
      'nmpa1_' + '1'.repeat(64),
    );

    const cleanupFailure = createPorts({
      failSurfaceWriteAt: 2,
      failCleanup: true,
    });
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input(),
      cleanupFailure.ports,
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'CLEANUP_FAILED',
      diagnostic: 'SURFACE_WRITE_FAILED',
    });
  });

  it('enforces aggregate PCM resource limits before a surface write', async () => {
    const runtime = createPorts();
    await expect(materializeNativeMediaTimestampPreviewAudioWindowV1(
      input({ windowDurationInFrames: 1 }),
      runtime.ports,
      {
        ...NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_DEFAULT_POLICY_V1,
        maxTotalPcmBytes: 4,
      },
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
      diagnostic: 'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_BYTE_LIMIT_EXCEEDED',
    });
    expect(runtime.putAudioSegment).not.toHaveBeenCalled();
  });
});
