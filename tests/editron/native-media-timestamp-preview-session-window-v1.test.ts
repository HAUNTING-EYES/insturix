import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaTimestampPreviewAudioWindowV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-window-v1';
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';
import {
  assertNativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

describe('native media timestamp preview session window V1', () => {
  it('binds a no-audio picture window only when audio is absent', () => {
    const pictureWindow = picture('NO_AUDIO_MAPPING_REQUESTED');
    expect(assertNativeMediaTimestampPreviewSessionWindowV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
      pictureWindow,
      audioWindow: null,
    })).toMatchObject({ pictureWindow, audioWindow: null });
    expect(() => assertNativeMediaTimestampPreviewSessionWindowV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
      pictureWindow,
      audioWindow: audio(),
    })).toThrow('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_UNEXPECTED');
  });

  it('requires and binds exact audio under the same scope and lease', () => {
    const pictureWindow = picture('EXACT_SAMPLE_MAPPING_BOUND');
    const audioWindow = audio();
    expect(assertNativeMediaTimestampPreviewSessionWindowV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
      pictureWindow,
      audioWindow,
    })).toMatchObject({ pictureWindow, audioWindow });
    expect(() => assertNativeMediaTimestampPreviewSessionWindowV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
      pictureWindow,
      audioWindow: null,
    })).toThrow('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_REQUIRED');
  });

  it('rejects mapping, project-frame and lease mismatches', () => {
    const pictureWindow = picture('EXACT_SAMPLE_MAPPING_BOUND');
    for (const candidate of [
      { ...audio(), audioMappingSha256: hex('9') },
      { ...audio(), windowProjectStartFrame: 11, windowProjectEndExclusiveFrame: 13 },
      { ...audio(), lease: { ...audio().lease, expiresAtEpochMs: 5_001 } },
    ]) {
      expect(() => assertNativeMediaTimestampPreviewSessionWindowV1({
        schemaVersion: 1,
        kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
        pictureWindow,
        audioWindow: candidate,
      })).toThrow();
    }
  });
});

function picture(
  audioDisposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED',
) {
  return assertNativeMediaTimestampPreviewWindowV2({
    schemaVersion: 2,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
    receiptSha256: hex('1'),
    decoderRequestSha256: hex('2'),
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 'overlay-1',
    projectRevision: revision(),
    overlayFromFrame: 10,
    overlayDurationInFrames: 20,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 2,
    lease: lease(),
    audioOwnership: {
      disposition: audioDisposition,
      audioMappingSha256: audioDisposition === 'EXACT_SAMPLE_MAPPING_BOUND'
        ? hex('3')
        : null,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: [0, 1].map((localFrame) => ({
      localFrame,
      projectFrame: 10 + localFrame,
      pictureHandle: `nmpv1_${hex(String(4 + localFrame))}`,
      decoderPictureRequestSha256: hex(String(6 + localFrame)),
      decodedPictureContentSha256: hex(String(8 + localFrame)),
    })),
  });
}

function audio() {
  return assertNativeMediaTimestampPreviewAudioWindowV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1',
    windowSha256: hex('a'),
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 'overlay-1',
    projectRevision: revision(),
    audioMappingSha256: hex('3'),
    audioSampleEpochMapSha256: hex('b'),
    decodedPcmSha256: hex('c'),
    sampleRate: 48_000,
    channelCount: 2,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 2,
    windowProjectStartFrame: 10,
    windowProjectEndExclusiveFrame: 12,
    canonicalWindowStartSamplePosition: position('0'),
    canonicalWindowEndExclusiveSamplePosition: position('3200'),
    lease: lease(),
    segments: [{
      kind: 'SILENCE',
      reason: 'LEADING_STREAM_OFFSET',
      precedingAudioEpochId: null,
      nextAudioEpochId: 'audio-epoch-1',
      timelineStartSamplePosition: position('0'),
      timelineEndExclusiveSamplePosition: position('3200'),
    }],
  });
}

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 4,
    compatibilityUpdatedAt: '2026-08-29T12:00:00.000Z',
  };
}

function lease() {
  return {
    leaseId: `nmpwl2_${hex('d')}`,
    issuedAtEpochMs: 1_000,
    renewAfterEpochMs: 4_000,
    expiresAtEpochMs: 5_000,
  };
}

function position(numerator: string) {
  return {
    numerator,
    denominator: '1',
    disposition: 'INTEGER_SAMPLE_FRAME' as const,
  };
}

function hex(character: string): string {
  return character.repeat(64);
}
