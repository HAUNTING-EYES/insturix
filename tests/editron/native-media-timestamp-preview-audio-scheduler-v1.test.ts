import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createNativeMediaTimestampPreviewWebAudioRuntimeV1,
  planNativeMediaTimestampPreviewAudioScheduleV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-scheduler-v1';
import { assertNativeMediaTimestampPreviewSessionWindowV1 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';

describe('native media timestamp preview audio scheduler V1', () => {
  it('plans fractional buffer phase and playback-rate-adjusted context timing exactly', () => {
    const current = planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [fractionalSession()],
      currentProjectFrame: 301,
      contextStartTimeSeconds: 10,
      playbackRate: 2,
      gainsByOverlayId: { '42': 0.5 },
    });
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      contextStartTimeSeconds: 10,
      playbackRate: 2,
      gain: 0.5,
      expectedSampleFrameCount: 3_201,
      expectedWavByteLength: 25_652,
      bufferOffsetSamplePosition: position('3201', '2'),
      contentDurationSamplePosition: position('1600'),
      timelineDelaySamplePosition: position('0'),
    });
    expect(current[0].bufferOffsetSeconds).toBeCloseTo(1_600.5 / 48_000, 12);
    expect(current[0].contentDurationSeconds).toBeCloseTo(1 / 30, 12);
    expect(current[0].audibleDurationSeconds).toBeCloseTo(1 / 60, 12);

    const future = planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [fractionalSession()],
      currentProjectFrame: 299,
      contextStartTimeSeconds: 10,
      playbackRate: 2,
    });
    expect(future[0].timelineDelaySamplePosition).toEqual(position('1600'));
    expect(future[0].contextStartTimeSeconds).toBeCloseTo(10 + 1 / 60, 12);
    expect(future[0].bufferOffsetSamplePosition).toEqual(position('1', '2'));
  });

  it('keeps explicit silence and video-only sessions silent', () => {
    for (const sessionWindow of [silentSession(), videoOnlySession()]) {
      expect(planNativeMediaTimestampPreviewAudioScheduleV1({
        sessionWindows: [sessionWindow],
        currentProjectFrame: 0,
        contextStartTimeSeconds: 1,
        playbackRate: 1,
      })).toEqual([]);
    }
  });

  it('rejects overlapping windows instead of double-playing an overlay', () => {
    expect(() => planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [smallPcmSession(0), smallPcmSession(0, 2)],
      currentProjectFrame: 0,
      contextStartTimeSeconds: 1,
      playbackRate: 1,
    })).toThrowError('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOWS_OVERLAP');
  });

  it('gives the same content on separate overlays distinct stable schedules', () => {
    const first = smallPcmSession(0);
    const second = assertNativeMediaTimestampPreviewSessionWindowV1({
      ...first,
      pictureWindow: { ...first.pictureWindow, overlayId: '84' },
      audioWindow: first.audioWindow ? { ...first.audioWindow, overlayId: '84' } : null,
    });
    const entries = planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [first, second],
      currentProjectFrame: 0,
      contextStartTimeSeconds: 1,
      playbackRate: 1,
    });
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(({ scheduleId }) => scheduleId)).size).toBe(2);
  });

  it('validates and decodes canonical S32LE WAV before scheduling it', async () => {
    const entry = planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [smallPcmSession(0)],
      currentProjectFrame: 0,
      contextStartTimeSeconds: 5,
      playbackRate: 1,
      gainsByOverlayId: { '42': 0.75 },
    })[0];
    const wav = canonicalWav([
      [-2_147_483_648, 2_147_483_647],
      [0, 1_073_741_824],
    ], 48_000);
    const fake = fakeAudioContext();
    const runtime = createNativeMediaTimestampPreviewWebAudioRuntimeV1({
      audioContextFactory: () => fake.context,
      fetchImplementation: vi.fn(async () => audioResponse(wav, entry.segmentIdentitySha256)),
    });

    const decoded = await runtime.loadSegment(entry);
    expect(decoded).toMatchObject({
      sampleRate: 48_000,
      channelCount: 2,
      sampleFrameCount: 2,
      segmentIdentitySha256: entry.segmentIdentitySha256,
    });
    expect(fake.channels[0][0]).toBe(-1);
    expect(fake.channels[0][1]).toBe(0);
    expect(fake.channels[1][0]).toBeCloseTo(2_147_483_647 / 2_147_483_648, 8);
    expect(fake.channels[1][1]).toBe(0.5);

    await runtime.resume();
    expect(fake.state.value).toBe('running');
    const scheduled = runtime.schedule(entry, decoded);
    expect(fake.source.start).toHaveBeenCalledWith(5, 0, 2 / 48_000);
    expect(fake.source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 5);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, 5);
    scheduled.setGain(0.25, 5.5);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.25, 5.5);
    scheduled.stop();
    scheduled.stop();
    expect(fake.source.stop).toHaveBeenCalledTimes(1);
    await runtime.close();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('rejects forged response identity and missed scheduling deadlines', async () => {
    const entry = planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: [smallPcmSession(0)],
      currentProjectFrame: 0,
      contextStartTimeSeconds: 5,
      playbackRate: 1,
    })[0];
    const wav = canonicalWav([[0, 0], [0, 0]], 48_000);
    const forged = createNativeMediaTimestampPreviewWebAudioRuntimeV1({
      audioContextFactory: () => fakeAudioContext().context,
      fetchImplementation: vi.fn(async () => audioResponse(wav, hex('e'))),
    });
    await expect(forged.loadSegment(entry)).rejects.toThrowError(
      'NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_INVALID',
    );
    await forged.close();

    const tampered = createNativeMediaTimestampPreviewWebAudioRuntimeV1({
      audioContextFactory: () => fakeAudioContext().context,
      fetchImplementation: vi.fn(async () => audioResponse(
        wav,
        entry.segmentIdentitySha256,
        hex('f'),
      )),
    });
    await expect(tampered.loadSegment(entry)).rejects.toThrowError(
      'NATIVE_MEDIA_PREVIEW_AUDIO_INTEGRITY_MISMATCH',
    );
    await tampered.close();

    const fake = fakeAudioContext();
    const runtime = createNativeMediaTimestampPreviewWebAudioRuntimeV1({
      audioContextFactory: () => fake.context,
      fetchImplementation: vi.fn(async () => audioResponse(wav, entry.segmentIdentitySha256)),
    });
    const decoded = await runtime.loadSegment(entry);
    fake.currentTime.value = 6;
    expect(() => runtime.schedule(entry, decoded)).toThrowError(
      'NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DEADLINE_MISSED',
    );
    await runtime.close();
  });
});

function fractionalSession() {
  return sessionWindow({
    localStartFrame: 300,
    durationInFrames: 2,
    canonicalStart: position('480000'),
    canonicalEnd: position('483200'),
    segment: {
      kind: 'PCM' as const,
      audioEpochId: 'audio-epoch-1',
      audioHandle: `nmpa1_${hex('a')}`,
      segmentIdentitySha256: hex('b'),
      sourceStartSampleFrame: '0',
      sourceEndExclusiveSampleFrame: '3201',
      decodedStartSamplePosition: position('1', '2'),
      decodedEndExclusiveSamplePosition: position('6401', '2'),
      timelineStartSamplePosition: position('480000'),
      timelineEndExclusiveSamplePosition: position('483200'),
    },
  });
}

function smallPcmSession(localStartFrame: number, identity = 1) {
  const sampleStart = localStartFrame * 2;
  return sessionWindow({
    localStartFrame,
    durationInFrames: 1,
    canonicalStart: position(String(sampleStart)),
    canonicalEnd: position(String(sampleStart + 2)),
    identity,
    segment: {
      kind: 'PCM' as const,
      audioEpochId: 'audio-epoch-1',
      audioHandle: `nmpa1_${hex(String(identity + 1))}`,
      segmentIdentitySha256: hex(String(identity + 2)),
      sourceStartSampleFrame: String(sampleStart),
      sourceEndExclusiveSampleFrame: String(sampleStart + 2),
      decodedStartSamplePosition: position(String(sampleStart)),
      decodedEndExclusiveSamplePosition: position(String(sampleStart + 2)),
      timelineStartSamplePosition: position(String(sampleStart)),
      timelineEndExclusiveSamplePosition: position(String(sampleStart + 2)),
    },
  });
}

function silentSession() {
  return sessionWindow({
    localStartFrame: 0,
    durationInFrames: 1,
    canonicalStart: position('0'),
    canonicalEnd: position('2'),
    segment: {
      kind: 'SILENCE' as const,
      reason: 'LEADING_STREAM_OFFSET' as const,
      precedingAudioEpochId: null,
      nextAudioEpochId: 'audio-epoch-1',
      timelineStartSamplePosition: position('0'),
      timelineEndExclusiveSamplePosition: position('2'),
    },
  });
}

function videoOnlySession() {
  const value = sessionWindow({
    localStartFrame: 0,
    durationInFrames: 1,
    canonicalStart: position('0'),
    canonicalEnd: position('2'),
    segment: {
      kind: 'SILENCE' as const,
      reason: 'LEADING_STREAM_OFFSET' as const,
      precedingAudioEpochId: null,
      nextAudioEpochId: 'audio-epoch-1',
      timelineStartSamplePosition: position('0'),
      timelineEndExclusiveSamplePosition: position('2'),
    },
  });
  return assertNativeMediaTimestampPreviewSessionWindowV1({
    ...value,
    pictureWindow: {
      ...value.pictureWindow,
      audioOwnership: {
        disposition: 'NO_AUDIO_MAPPING_REQUESTED',
        audioMappingSha256: null,
        decoderMaySupplyOrReplaceAudio: false,
      },
    },
    audioWindow: null,
  });
}

function sessionWindow(input: Readonly<{
  localStartFrame: number;
  durationInFrames: number;
  canonicalStart: ReturnType<typeof position>;
  canonicalEnd: ReturnType<typeof position>;
  segment: Record<string, unknown>;
  identity?: number;
}>) {
  const identity = input.identity ?? 1;
  const lease = {
    leaseId: `nmpwl2_${hex(String(identity + 3))}`,
    issuedAtEpochMs: 1_000,
    renewAfterEpochMs: 2_000,
    expiresAtEpochMs: 3_000,
  };
  const mapping = hex('c');
  return assertNativeMediaTimestampPreviewSessionWindowV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_V1',
    pictureWindow: {
      schemaVersion: 2,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
      receiptSha256: hex(String(identity + 4)),
      decoderRequestSha256: hex(String(identity + 5)),
      projectId: 'project-1', sequenceId: 'main', overlayId: '42',
      projectRevision: revision(),
      overlayFromFrame: 0, overlayDurationInFrames: 1_000,
      windowLocalStartFrame: input.localStartFrame,
      windowDurationInFrames: input.durationInFrames,
      lease,
      audioOwnership: {
        disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
        audioMappingSha256: mapping,
        decoderMaySupplyOrReplaceAudio: false,
      },
      frames: Array.from({ length: input.durationInFrames }, (_, offset) => ({
        localFrame: input.localStartFrame + offset,
        projectFrame: input.localStartFrame + offset,
        pictureHandle: `nmpv1_${hex(String(identity + 6 + offset))}`,
        decoderPictureRequestSha256: hex(String(identity + 20 + offset)),
        decodedPictureContentSha256: hex(String(identity + 40 + offset)),
      })),
    },
    audioWindow: {
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1',
      windowSha256: hex(String(identity + 60)),
      projectId: 'project-1', sequenceId: 'main', overlayId: '42',
      projectRevision: revision(),
      audioMappingSha256: mapping,
      audioSampleEpochMapSha256: hex(String(identity + 61)),
      decodedPcmSha256: hex(String(identity + 62)),
      sampleRate: 48_000, channelCount: 2,
      windowLocalStartFrame: input.localStartFrame,
      windowDurationInFrames: input.durationInFrames,
      windowProjectStartFrame: input.localStartFrame,
      windowProjectEndExclusiveFrame: input.localStartFrame + input.durationInFrames,
      canonicalWindowStartSamplePosition: input.canonicalStart,
      canonicalWindowEndExclusiveSamplePosition: input.canonicalEnd,
      lease,
      segments: [input.segment],
    },
  });
}

function audioResponse(
  bytes: Uint8Array,
  segmentIdentity: string,
  wavContentSha256 = createHash('sha256').update(bytes).digest('hex'),
): Response {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body.buffer, {
    status: 200,
    headers: {
      'content-type': 'audio/wav',
      'content-length': String(bytes.byteLength),
      etag: `"sha256-${wavContentSha256}"`,
      'x-editron-preview-status': 'CURRENT',
      'x-editron-audio-segment': segmentIdentity,
    },
  });
}

function canonicalWav(frames: readonly (readonly number[])[], sampleRate: number): Uint8Array {
  const channelCount = frames[0]?.length ?? 0;
  const bytes = new Uint8Array(44 + frames.length * channelCount * 4);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 4, true);
  view.setUint16(32, channelCount * 4, true);
  view.setUint16(34, 32, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, bytes.byteLength - 44, true);
  frames.forEach((frame, frameIndex) => frame.forEach((sample, channel) => {
    view.setInt32(44 + (frameIndex * channelCount + channel) * 4, sample, true);
  }));
  return bytes;
}

function fakeAudioContext() {
  const state = { value: 'suspended' as AudioContextState };
  const currentTime = { value: 4 };
  const channels: Float32Array[] = [];
  const source = {
    buffer: null as AudioBuffer | null,
    playbackRate: { setValueAtTime: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const gain = {
    gain: { setValueAtTime: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(),
  };
  const close = vi.fn(async () => { state.value = 'closed'; });
  const context = {
    get currentTime() { return currentTime.value; },
    get state() { return state.value; },
    destination: {},
    createBuffer(channelCount: number, length: number, sampleRate: number) {
      channels.splice(0, channels.length);
      for (let index = 0; index < channelCount; index += 1) {
        channels.push(new Float32Array(length));
      }
      return {
        length, sampleRate, numberOfChannels: channelCount,
        duration: length / sampleRate,
        getChannelData: (channel: number) => channels[channel],
      } as AudioBuffer;
    },
    createBufferSource: () => source,
    createGain: () => gain,
    resume: vi.fn(async () => { state.value = 'running'; }),
    close,
  } as unknown as AudioContext;
  return { context, state, currentTime, channels, source, gain, close };
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function revision() {
  return { schemaVersion: 1, value: 1, compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z' };
}

function position(numerator: string, denominator = '1') {
  return {
    numerator,
    denominator,
    disposition: denominator === '1' ? 'INTEGER_SAMPLE_FRAME' : 'BETWEEN_SAMPLE_FRAMES',
  } as const;
}

function hex(character: string): string {
  return character.repeat(64).slice(0, 64);
}
