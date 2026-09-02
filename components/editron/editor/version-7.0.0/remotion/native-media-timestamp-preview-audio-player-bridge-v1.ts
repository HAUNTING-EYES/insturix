import type { PlayerRef } from '@remotion/player';

import type { VideoNativeAudioMixV1 } from '../utils/video-native-audio-mix-v1';
import type {
  NativeMediaTimestampPreviewAudioSessionCoordinatorV1,
} from './native-media-timestamp-preview-audio-session-v1';
import type {
  NativeMediaTimestampPreviewSessionWindowV1,
} from './native-media-timestamp-preview-session-window-v1';

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 2;
const MAX_PLAYER_VOLUME = 1;

export type NativeMediaTimestampPreviewAudioPlayerMediaV1 = Readonly<{
  sessionWindows: readonly NativeMediaTimestampPreviewSessionWindowV1[];
  mixesByOverlayId: ReadonlyMap<
    string,
    Pick<VideoNativeAudioMixV1, 'gainAtProjectFrame'>
  >;
  playbackRate: number;
}>;

export type NativeMediaTimestampPreviewAudioPlayerBridgeV1 = Readonly<{
  updateMedia(input: NativeMediaTimestampPreviewAudioPlayerMediaV1): void;
  dispose(): void;
}>;

export function createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
  player: PlayerRef,
  coordinator: NativeMediaTimestampPreviewAudioSessionCoordinatorV1,
): NativeMediaTimestampPreviewAudioPlayerBridgeV1 {
  assertPlayer(player);
  if (!coordinator || typeof coordinator.update !== 'function'
    || typeof coordinator.subscribe !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_COORDINATOR_INVALID');
  }

  let media: NativeMediaTimestampPreviewAudioPlayerMediaV1 | null = null;
  let playbackRate = 1;
  let transportEpoch = 0;
  let playing = player.isPlaying();
  let waiting = false;
  let disposed = false;

  const onPlay = () => {
    playing = true;
    waiting = false;
    bumpTransportEpoch();
    reconcile();
  };
  const onPause = () => {
    playing = false;
    reconcile();
  };
  const onEnded = () => {
    playing = false;
    bumpTransportEpoch();
    reconcile();
  };
  const onSeeked = ({ detail }: { detail: { frame: number } }) => {
    bumpTransportEpoch();
    reconcile(detail.frame);
  };
  const onRateChange = ({ detail }: { detail: { playbackRate: number } }) => {
    playbackRate = rate(detail.playbackRate);
    bumpTransportEpoch();
    reconcile();
  };
  const onFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
    reconcile(detail.frame);
  };
  const onVolumeChange = () => reconcile();
  const onMuteChange = () => reconcile();
  const onWaiting = () => {
    waiting = true;
    bumpTransportEpoch();
    reconcile();
  };
  const onResume = () => {
    waiting = false;
    playing = player.isPlaying();
    bumpTransportEpoch();
    reconcile();
  };
  const onError = () => {
    waiting = true;
    playing = false;
    bumpTransportEpoch();
    reconcile();
  };

  player.addEventListener('play', onPlay);
  player.addEventListener('pause', onPause);
  player.addEventListener('ended', onEnded);
  player.addEventListener('seeked', onSeeked);
  player.addEventListener('ratechange', onRateChange);
  player.addEventListener('frameupdate', onFrameUpdate);
  player.addEventListener('volumechange', onVolumeChange);
  player.addEventListener('mutechange', onMuteChange);
  player.addEventListener('waiting', onWaiting);
  player.addEventListener('resume', onResume);
  player.addEventListener('error', onError);

  const unsubscribe = coordinator.subscribe((snapshot) => {
    if (!disposed && snapshot.disposition !== 'READY' && player.isPlaying()) {
      player.pause();
    }
  });

  return Object.freeze({
    updateMedia(input) {
      if (disposed) return;
      let normalized: NativeMediaTimestampPreviewAudioPlayerMediaV1;
      try {
        normalized = normalizeMedia(input);
      } catch (error) {
        playing = false;
        waiting = true;
        if (player.isPlaying()) player.pause();
        reconcile();
        throw error;
      }
      if (normalized.playbackRate !== playbackRate) bumpTransportEpoch();
      media = normalized;
      playbackRate = normalized.playbackRate;
      playing = player.isPlaying();
      reconcile();
    },
    dispose() {
      if (disposed) return;
      playing = false;
      waiting = true;
      reconcile();
      disposed = true;
      unsubscribe();
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('seeked', onSeeked);
      player.removeEventListener('ratechange', onRateChange);
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('volumechange', onVolumeChange);
      player.removeEventListener('mutechange', onMuteChange);
      player.removeEventListener('waiting', onWaiting);
      player.removeEventListener('resume', onResume);
      player.removeEventListener('error', onError);
      media = null;
    },
  });

  function reconcile(frameOverride?: number): void {
    if (disposed || !media) return;
    const currentProjectFrame = frame(
      frameOverride === undefined ? player.getCurrentFrame() : frameOverride,
    );
    const playerVolume = finiteInRange(
      player.getVolume(),
      0,
      MAX_PLAYER_VOLUME,
      'NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_VOLUME_INVALID',
    );
    const muted = player.isMuted();
    if (typeof muted !== 'boolean') {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_MUTE_STATE_INVALID');
    }
    const gainsByOverlayId: Record<string, number> = {};
    for (const overlayId of pcmOverlayIds(media.sessionWindows)) {
      const mix = media.mixesByOverlayId.get(overlayId);
      if (!mix || typeof mix.gainAtProjectFrame !== 'function') {
        stopForFailure(currentProjectFrame);
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_MIX_REQUIRED');
      }
      gainsByOverlayId[overlayId] = mix.gainAtProjectFrame(currentProjectFrame)
        * (muted ? 0 : playerVolume);
    }
    coordinator.update({
      sessionWindows: media.sessionWindows,
      currentProjectFrame,
      playing: playing && !waiting,
      playbackRate,
      transportEpoch,
      gainsByOverlayId,
    });
  }

  function stopForFailure(currentProjectFrame: number): void {
    playing = false;
    waiting = true;
    if (player.isPlaying()) player.pause();
    coordinator.update({
      sessionWindows: media?.sessionWindows ?? [],
      currentProjectFrame,
      playing: false,
      playbackRate,
      transportEpoch,
      gainsByOverlayId: {},
    });
  }

  function bumpTransportEpoch(): void {
    if (transportEpoch === Number.MAX_SAFE_INTEGER) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_EPOCH_EXHAUSTED');
    }
    transportEpoch += 1;
  }
}

function normalizeMedia(
  input: NativeMediaTimestampPreviewAudioPlayerMediaV1,
): NativeMediaTimestampPreviewAudioPlayerMediaV1 {
  if (!input || !Array.isArray(input.sessionWindows)
    || !input.mixesByOverlayId || typeof input.mixesByOverlayId.get !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_MEDIA_INVALID');
  }
  const playbackRate = rate(input.playbackRate);
  const sessionWindows = Object.freeze([...input.sessionWindows]);
  for (const overlayId of pcmOverlayIds(sessionWindows)) {
    const mix = input.mixesByOverlayId.get(overlayId);
    if (!mix || typeof mix.gainAtProjectFrame !== 'function') {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_MIX_REQUIRED');
    }
  }
  return Object.freeze({
    sessionWindows,
    mixesByOverlayId: input.mixesByOverlayId,
    playbackRate,
  });
}

function pcmOverlayIds(
  windows: readonly NativeMediaTimestampPreviewSessionWindowV1[],
): ReadonlySet<string> {
  return new Set(windows.flatMap((window) => (
    window.audioWindow?.segments.some((segment) => segment.kind === 'PCM')
      ? [window.pictureWindow.overlayId]
      : []
  )));
}

function assertPlayer(player: PlayerRef): void {
  if (!player || typeof player.addEventListener !== 'function'
    || typeof player.removeEventListener !== 'function'
    || typeof player.getCurrentFrame !== 'function'
    || typeof player.getVolume !== 'function'
    || typeof player.isMuted !== 'function'
    || typeof player.isPlaying !== 'function'
    || typeof player.pause !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_INVALID');
  }
}

function rate(value: unknown): number {
  return finiteInRange(
    value,
    MIN_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
    'NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_RATE_INVALID',
  );
}

function frame(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_FRAME_INVALID');
  }
  return Number(value);
}

function finiteInRange(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < minimum || value > maximum) throw new Error(code);
  return value;
}
