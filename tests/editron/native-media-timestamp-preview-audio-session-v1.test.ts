import { describe, expect, it, vi } from 'vitest';

import {
  createNativeMediaTimestampPreviewAudioSessionCoordinatorV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-session-v1';
import type {
  NativeMediaTimestampPreviewAudioRuntimeV1,
  NativeMediaTimestampPreviewAudioScheduleEntryV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-scheduler-v1';
import { assertNativeMediaTimestampPreviewSessionWindowV1 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';

describe('native media timestamp preview audio session V1', () => {
  it('preloads the active and future windows but requires only current audio', async () => {
    const pending = deferredLoads();
    const runtime = fakeRuntime((entry) => pending.load(entry));
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    coordinator.update(updateInput([pcmSession(0, 1), pcmSession(1, 2)], 0, false));

    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'PREPARING', requiredSegmentCount: 1,
      loadedSegmentCount: 0, scheduledSegmentCount: 0,
    });
    expect(runtime.loadSegment).toHaveBeenCalledTimes(2);

    await pending.resolve(1);
    await waitFor(() => coordinator.snapshot().loadedSegmentCount === 1);
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', requiredSegmentCount: 1, loadedSegmentCount: 1,
    });
    expect(runtime.schedule).not.toHaveBeenCalled();

    await pending.resolve(2);
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({ loadedSegmentCount: 2 });
    await coordinator.dispose();
  });

  it('schedules once across lease renewal, updates gain, and stops on pause', async () => {
    const runtime = fakeRuntime();
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    const windows = [pcmSession(0, 1), pcmSession(1, 2)];
    coordinator.update(updateInput(windows, 0, false, 1, 1, 0.8));
    await coordinator.whenIdle();
    expect(coordinator.snapshot().disposition).toBe('READY');

    coordinator.update(updateInput(windows, 0, true, 1, 1, 0.8));
    await coordinator.whenIdle();
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    expect(runtime.schedule).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', scheduledSegmentCount: 2,
    });

    const renewed = [pcmSession(0, 1, 'a'), pcmSession(1, 2, 'b')];
    coordinator.update(updateInput(renewed, 0, true, 1, 1, 0.4));
    await coordinator.whenIdle();
    expect(runtime.schedule).toHaveBeenCalledTimes(2);
    expect(runtime.handles.every(({ setGain }) => setGain.mock.calls.some(
      ([gain]) => gain === 0.4,
    ))).toBe(true);

    coordinator.update(updateInput(renewed, 0, false, 1, 1, 0.4));
    expect(runtime.handles.every(({ stop }) => stop.mock.calls.length === 1)).toBe(true);
    expect(coordinator.snapshot().scheduledSegmentCount).toBe(0);
    await coordinator.dispose();
  });

  it('reloads identical content after a project or revision scope change', async () => {
    const pending = deferredLoads();
    const runtime = fakeRuntime((entry) => entry.projectId === 'project-1'
      ? pending.load(entry)
      : Promise.resolve(decoded(entry)));
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    coordinator.update(updateInput([pcmSession(0, 1)], 0, false));
    expect(coordinator.snapshot().disposition).toBe('PREPARING');

    coordinator.update(updateInput([
      pcmSession(0, 1, 'a', 'project-2', 2),
    ], 0, false));
    await waitFor(() => coordinator.snapshot().loadedSegmentCount === 1);
    expect(runtime.loadSegment).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot().disposition).toBe('READY');

    await pending.resolve(1);
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', loadedSegmentCount: 1, requiredSegmentCount: 1,
    });
    await coordinator.dispose();
  });

  it('ignores an obsolete lease failure after renewed content has loaded', async () => {
    let rejectObsolete = (_reason: Error): void => {
      throw new Error('Obsolete lease load was not started.');
    };
    const runtime = fakeRuntime((entry) => entry.audioHandle.includes(hex('5'))
      ? new Promise((_, reject) => { rejectObsolete = reject; })
      : Promise.resolve(decoded(entry)));
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    coordinator.update(updateInput([pcmSession(0, 1)], 0, false));
    coordinator.update(updateInput([
      pcmSession(0, 1, 'a', 'project-1', 1, '6'),
    ], 0, false));
    await waitFor(() => coordinator.snapshot().loadedSegmentCount === 1);
    expect(coordinator.snapshot().disposition).toBe('READY');

    rejectObsolete(new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_UNAVAILABLE'));
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', reason: null, prefetchFailureCount: 0,
    });
    await coordinator.dispose();
  });

  it('keeps a failed prefetch non-blocking, then blocks and explicitly retries when current', async () => {
    let failSecond = true;
    const runtime = fakeRuntime(async (entry) => {
      if (entry.segmentIdentitySha256 === hex('2') && failSecond) {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_UNAVAILABLE');
      }
      return decoded(entry);
    });
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    const windows = [pcmSession(0, 1), pcmSession(1, 2)];
    coordinator.update(updateInput(windows, 0, false));
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', prefetchFailureCount: 1,
    });

    coordinator.update(updateInput(windows, 1, false));
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'BLOCKED',
      reason: 'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_UNAVAILABLE',
    });

    failSecond = false;
    coordinator.retry();
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'READY', reason: null, prefetchFailureCount: 0,
    });
    await coordinator.dispose();
  });

  it('reanchors on a seek epoch and blocks a missed runtime schedule', async () => {
    const runtime = fakeRuntime();
    const coordinator = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(runtime.port);
    const windows = [pcmSession(0, 1), pcmSession(1, 2)];
    coordinator.update(updateInput(windows, 0, false));
    await coordinator.whenIdle();
    coordinator.update(updateInput(windows, 0, true, 1));
    await coordinator.whenIdle();
    expect(runtime.schedule).toHaveBeenCalledTimes(2);

    runtime.schedule.mockImplementationOnce(() => {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DEADLINE_MISSED');
    });
    coordinator.update(updateInput(windows, 1, true, 2));
    await coordinator.whenIdle();
    expect(coordinator.snapshot()).toMatchObject({
      disposition: 'BLOCKED',
      reason: 'NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DEADLINE_MISSED',
      scheduledSegmentCount: 0,
    });
    expect(runtime.handles.slice(0, 2).every(({ stop }) => stop.mock.calls.length === 1))
      .toBe(true);
    await coordinator.dispose();
  });

  it('does not load or schedule declared silence/video-only media and closes after late work', async () => {
    const quietRuntime = fakeRuntime();
    const quiet = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(quietRuntime.port);
    quiet.update(updateInput([silentSession()], 0, true));
    await quiet.whenIdle();
    expect(quiet.snapshot().disposition).toBe('READY');
    quiet.update(updateInput([videoOnlySession()], 0, true));
    await quiet.whenIdle();
    expect(quiet.snapshot().disposition).toBe('READY');
    expect(quietRuntime.loadSegment).not.toHaveBeenCalled();
    expect(quietRuntime.schedule).not.toHaveBeenCalled();
    await quiet.dispose();

    const pending = deferredLoads();
    const lateRuntime = fakeRuntime((entry) => pending.load(entry));
    const late = createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(lateRuntime.port);
    late.update(updateInput([pcmSession(0, 1)], 0, true));
    const disposal = late.dispose();
    await pending.resolve(1);
    await disposal;
    expect(lateRuntime.schedule).not.toHaveBeenCalled();
    expect(lateRuntime.close).toHaveBeenCalledTimes(1);
  });
});

function fakeRuntime(
  loader: (
    entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
  ) => Promise<ReturnType<typeof decoded>> = async (entry) => decoded(entry),
) {
  let contextTime = 10;
  const handles: Array<{
    stop: ReturnType<typeof vi.fn>;
    setGain: ReturnType<typeof vi.fn>;
  }> = [];
  const loadSegment = vi.fn(loader);
  const resume = vi.fn(async () => undefined);
  const schedule = vi.fn(() => {
    const handle = { stop: vi.fn(), setGain: vi.fn() };
    handles.push(handle);
    return handle;
  });
  const close = vi.fn(async () => undefined);
  const port: NativeMediaTimestampPreviewAudioRuntimeV1 = {
    contextTimeSeconds: () => contextTime,
    resume,
    loadSegment,
    schedule,
    close,
  };
  return {
    port, loadSegment, resume, schedule, close, handles,
    setContextTime(value: number) { contextTime = value; },
  };
}

function deferredLoads() {
  const resolvers = new Map<string, () => void>();
  return {
    load(entry: NativeMediaTimestampPreviewAudioScheduleEntryV1) {
      return new Promise<ReturnType<typeof decoded>>((resolve) => {
        resolvers.set(entry.segmentIdentitySha256, () => resolve(decoded(entry)));
      });
    },
    async resolve(identity: number) {
      const key = hex(String(identity));
      const finish = resolvers.get(key);
      if (!finish) throw new Error(`Missing deferred segment ${key}`);
      resolvers.delete(key);
      finish();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Condition did not settle within the bounded microtask budget.');
}

function decoded(entry: NativeMediaTimestampPreviewAudioScheduleEntryV1) {
  return {
    segmentIdentitySha256: entry.segmentIdentitySha256,
    sampleRate: entry.sampleRate,
    channelCount: entry.channelCount,
    sampleFrameCount: entry.expectedSampleFrameCount,
    audioBuffer: {
      sampleRate: entry.sampleRate,
      numberOfChannels: entry.channelCount,
      length: entry.expectedSampleFrameCount,
    } as AudioBuffer,
  };
}

function updateInput(
  sessionWindows: readonly ReturnType<typeof pcmSession>[],
  currentProjectFrame: number,
  playing: boolean,
  transportEpoch = 1,
  playbackRate = 1,
  gain = 1,
) {
  return {
    sessionWindows,
    currentProjectFrame,
    playing,
    playbackRate,
    transportEpoch,
    gainsByOverlayId: { '42': gain },
  } as const;
}

function pcmSession(
  localStartFrame: number,
  identity: number,
  leaseIdentity = '9',
  projectId = 'project-1',
  revisionValue = 1,
  audioHandleIdentity = String(identity + 4),
) {
  const sampleStart = localStartFrame * 2;
  return sessionWindow({
    localStartFrame,
    identity,
    leaseIdentity,
    projectId,
    revisionValue,
    segment: {
      kind: 'PCM' as const,
      audioEpochId: 'audio-epoch-1',
      audioHandle: `nmpa1_${hex(audioHandleIdentity)}`,
      segmentIdentitySha256: hex(String(identity)),
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
    identity: 3,
    leaseIdentity: 'c',
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
  const exact = sessionWindow({
    localStartFrame: 0,
    identity: 4,
    leaseIdentity: 'd',
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
    ...exact,
    pictureWindow: {
      ...exact.pictureWindow,
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
  identity: number;
  leaseIdentity: string;
  projectId?: string;
  revisionValue?: number;
  segment: Record<string, unknown>;
}>) {
  const lease = {
    leaseId: `nmpwl2_${hex(input.leaseIdentity)}`,
    issuedAtEpochMs: 1_000,
    renewAfterEpochMs: 2_000,
    expiresAtEpochMs: 3_000,
  };
  const sampleStart = input.localStartFrame * 2;
  const mapping = hex('a');
  const projectId = input.projectId ?? 'project-1';
  const projectRevision = revision(input.revisionValue);
  return assertNativeMediaTimestampPreviewSessionWindowV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_V1',
    pictureWindow: {
      schemaVersion: 2,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
      receiptSha256: hex(String(input.identity + 5)),
      decoderRequestSha256: hex(String(input.identity + 6)),
      projectId, sequenceId: 'main', overlayId: '42',
      projectRevision,
      overlayFromFrame: 0, overlayDurationInFrames: 10,
      windowLocalStartFrame: input.localStartFrame,
      windowDurationInFrames: 1,
      lease,
      audioOwnership: {
        disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
        audioMappingSha256: mapping,
        decoderMaySupplyOrReplaceAudio: false,
      },
      frames: [{
        localFrame: input.localStartFrame,
        projectFrame: input.localStartFrame,
        pictureHandle: `nmpv1_${hex(String(input.identity + 7))}`,
        decoderPictureRequestSha256: hex(String(input.identity + 8)),
        decodedPictureContentSha256: hex(String(input.identity + 9)),
      }],
    },
    audioWindow: {
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1',
      windowSha256: hex(String(input.identity + 10)),
      projectId, sequenceId: 'main', overlayId: '42',
      projectRevision,
      audioMappingSha256: mapping,
      audioSampleEpochMapSha256: hex(String(input.identity + 11)),
      decodedPcmSha256: hex(String(input.identity + 12)),
      sampleRate: 48_000, channelCount: 2,
      windowLocalStartFrame: input.localStartFrame,
      windowDurationInFrames: 1,
      windowProjectStartFrame: input.localStartFrame,
      windowProjectEndExclusiveFrame: input.localStartFrame + 1,
      canonicalWindowStartSamplePosition: position(String(sampleStart)),
      canonicalWindowEndExclusiveSamplePosition: position(String(sampleStart + 2)),
      lease,
      segments: [input.segment],
    },
  });
}

function position(numerator: string) {
  return { numerator, denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME' } as const;
}

function revision(value = 1) {
  return { schemaVersion: 1, value, compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z' };
}

function hex(character: string): string {
  return character.repeat(64).slice(0, 64);
}
