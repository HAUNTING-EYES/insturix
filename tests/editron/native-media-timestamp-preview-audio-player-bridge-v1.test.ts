import type { PlayerRef } from '@remotion/player';
import { describe, expect, it, vi } from 'vitest';

import {
  createNativeMediaTimestampPreviewAudioPlayerBridgeV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-player-bridge-v1';
import type {
  NativeMediaTimestampPreviewAudioSessionCoordinatorV1,
  NativeMediaTimestampPreviewAudioSessionSnapshotV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-session-v1';
import type {
  NativeMediaTimestampPreviewSessionWindowV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';

describe('native media timestamp preview audio player bridge V1', () => {
  it('binds frame, play state, master volume, mute, and shared overlay gain', () => {
    const player = fakePlayer();
    const coordinator = fakeCoordinator();
    const gainAtProjectFrame = vi.fn(() => 0.8);
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player.port,
      coordinator.port,
    );
    bridge.updateMedia(media(pcmWindow(), gainAtProjectFrame));
    expect(lastUpdate(coordinator)).toMatchObject({
      currentProjectFrame: 10,
      playing: false,
      playbackRate: 1,
      transportEpoch: 0,
      gainsByOverlayId: { '42': 0.4 },
    });

    player.playing = true;
    player.emit('play');
    expect(lastUpdate(coordinator)).toMatchObject({ playing: true, transportEpoch: 1 });

    player.frame = 11;
    player.emit('frameupdate', { frame: 11 });
    expect(gainAtProjectFrame).toHaveBeenLastCalledWith(11);

    player.volume = 0.25;
    player.emit('volumechange', { volume: 0.25 });
    expect(lastUpdate(coordinator).gainsByOverlayId).toEqual({ '42': 0.2 });

    player.muted = true;
    player.emit('mutechange', { isMuted: true });
    expect(lastUpdate(coordinator).gainsByOverlayId).toEqual({ '42': 0 });
    bridge.dispose();
  });

  it('reanchors on seek/rate changes and stops during buffering', () => {
    const player = fakePlayer();
    const coordinator = fakeCoordinator();
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player.port,
      coordinator.port,
    );
    bridge.updateMedia(media(pcmWindow(), () => 1));
    player.playing = true;
    player.emit('play');
    const playEpoch = lastUpdate(coordinator).transportEpoch;

    player.frame = 50;
    player.emit('seeked', { frame: 50 });
    expect(lastUpdate(coordinator)).toMatchObject({
      currentProjectFrame: 50,
      playing: true,
    });
    expect(lastUpdate(coordinator).transportEpoch).toBeGreaterThan(playEpoch);

    player.emit('ratechange', { playbackRate: 1.5 });
    expect(lastUpdate(coordinator).playbackRate).toBe(1.5);

    player.emit('waiting', {});
    expect(lastUpdate(coordinator).playing).toBe(false);

    player.emit('resume', {});
    expect(lastUpdate(coordinator).playing).toBe(true);
    bridge.dispose();
  });

  it('pauses the real player immediately when audio is not ready', () => {
    const player = fakePlayer();
    const coordinator = fakeCoordinator();
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player.port,
      coordinator.port,
    );
    bridge.updateMedia(media(pcmWindow(), () => 1));
    player.playing = true;
    player.emit('play');

    coordinator.publish(snapshot('PREPARING', 'NATIVE_MEDIA_PREVIEW_AUDIO_PREPARING'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(lastUpdate(coordinator).playing).toBe(false);
    bridge.dispose();
  });

  it('keeps declared video-only sessions silent without requiring a mix', () => {
    const player = fakePlayer();
    const coordinator = fakeCoordinator();
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player.port,
      coordinator.port,
    );
    bridge.updateMedia({
      sessionWindows: [videoOnlyWindow()],
      mixesByOverlayId: new Map(),
      playbackRate: 1,
    });
    expect(lastUpdate(coordinator).gainsByOverlayId).toEqual({});
    bridge.dispose();
  });

  it('rejects PCM without the shared mix owner and removes listeners on dispose', () => {
    const player = fakePlayer();
    const coordinator = fakeCoordinator();
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player.port,
      coordinator.port,
    );
    bridge.updateMedia(media(pcmWindow(), () => 1));
    player.playing = true;
    player.emit('play');
    expect(() => bridge.updateMedia({
      sessionWindows: [pcmWindow()],
      mixesByOverlayId: new Map(),
      playbackRate: 1,
    })).toThrowError('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_MIX_REQUIRED');
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(lastUpdate(coordinator).playing).toBe(false);

    const beforeDispose = coordinator.update.mock.calls.length;
    bridge.dispose();
    expect(lastUpdate(coordinator).playing).toBe(false);
    player.emit('frameupdate', { frame: 20 });
    expect(coordinator.update).toHaveBeenCalledTimes(beforeDispose + 1);
  });
});

function media(
  window: NativeMediaTimestampPreviewSessionWindowV1,
  gainAtProjectFrame: (frame: number) => number,
) {
  return {
    sessionWindows: [window],
    mixesByOverlayId: new Map([['42', { gainAtProjectFrame }]]),
    playbackRate: 1,
  } as const;
}

function pcmWindow(): NativeMediaTimestampPreviewSessionWindowV1 {
  return {
    pictureWindow: { overlayId: '42' },
    audioWindow: { segments: [{ kind: 'PCM' }] },
  } as unknown as NativeMediaTimestampPreviewSessionWindowV1;
}

function videoOnlyWindow(): NativeMediaTimestampPreviewSessionWindowV1 {
  return {
    pictureWindow: { overlayId: '42' },
    audioWindow: null,
  } as unknown as NativeMediaTimestampPreviewSessionWindowV1;
}

function fakeCoordinator() {
  let listener: (value: NativeMediaTimestampPreviewAudioSessionSnapshotV1) => void = () => {};
  const update = vi.fn();
  const port = {
    update,
    retry: vi.fn(),
    snapshot: () => snapshot('READY', null),
    subscribe: vi.fn((value) => {
      listener = value;
      value(snapshot('READY', null));
      return () => { listener = () => {}; };
    }),
    whenIdle: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  } as unknown as NativeMediaTimestampPreviewAudioSessionCoordinatorV1;
  return { port, update, publish(value: NativeMediaTimestampPreviewAudioSessionSnapshotV1) {
    listener(value);
  } };
}

function snapshot(
  disposition: NativeMediaTimestampPreviewAudioSessionSnapshotV1['disposition'],
  reason: string | null,
): NativeMediaTimestampPreviewAudioSessionSnapshotV1 {
  return {
    version: 1,
    disposition,
    reason,
    requiredSegmentCount: 1,
    loadedSegmentCount: disposition === 'READY' ? 1 : 0,
    scheduledSegmentCount: 0,
    prefetchFailureCount: 0,
  };
}

function lastUpdate(coordinator: ReturnType<typeof fakeCoordinator>) {
  return coordinator.update.mock.calls.at(-1)?.[0] as Record<string, any>;
}

function fakePlayer() {
  const listeners = new Map<string, Set<(event: { detail: any }) => void>>();
  const player = {
    frame: 10,
    volume: 0.5,
    muted: false,
    playing: false,
    addEventListener(name: string, listener: (event: { detail: any }) => void) {
      const values = listeners.get(name) ?? new Set();
      values.add(listener);
      listeners.set(name, values);
    },
    removeEventListener(name: string, listener: (event: { detail: any }) => void) {
      listeners.get(name)?.delete(listener);
    },
    getCurrentFrame() { return player.frame; },
    getVolume() { return player.volume; },
    isMuted() { return player.muted; },
    isPlaying() { return player.playing; },
    pause: vi.fn(() => {
      player.playing = false;
      player.emit('pause');
    }),
    emit(name: string, detail?: any) {
      for (const listener of listeners.get(name) ?? []) listener({ detail });
    },
  };
  return Object.assign(player, { port: player as unknown as PlayerRef });
}
