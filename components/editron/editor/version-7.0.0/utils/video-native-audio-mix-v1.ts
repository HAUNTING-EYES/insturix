import { getSoundAudioDuckRegions } from '@/lib/editron/services/native-audio-evidence';

import { OverlayType, type ClipOverlay, type Overlay } from '../types';
import { createDuckingVolume } from './audio-ducking';

const CANONICAL_VOICEOVER_ROW = 3;
const LEGACY_VOICEOVER_ROW = 4;
const MAX_GAIN = 4;

const NATIVE_VIDEO_DUCKING = Object.freeze({
  enabled: true,
  duckLevel: 0.12,
  rampDownMs: 250,
  rampUpMs: 500,
  lookAheadMs: 150,
});

export type VideoNativeAudioRemotionVolumeV1 = number | ((localFrame: number) => number);

export type VideoNativeAudioMixV1 = Readonly<{
  remotionVolume: VideoNativeAudioRemotionVolumeV1;
  gainAtProjectFrame(projectFrame: number): number;
}>;

export function createVideoNativeAudioMixV1(input: Readonly<{
  overlay: ClipOverlay;
  allOverlays: readonly Overlay[];
  fps: number;
  audioPresent?: boolean;
}>): VideoNativeAudioMixV1 {
  if (!input?.overlay || !Array.isArray(input.allOverlays)) {
    throw new Error('VIDEO_NATIVE_AUDIO_MIX_INPUT_INVALID');
  }
  const fps = finiteInRange(input.fps, Number.MIN_VALUE, 1_000, 'VIDEO_NATIVE_AUDIO_FPS_INVALID');
  const overlayFrom = nonNegativeSafeInteger(
    input.overlay.from,
    'VIDEO_NATIVE_AUDIO_OVERLAY_RANGE_INVALID',
  );
  const baseVolume = finiteInRange(
    input.overlay.styles?.volume ?? 1,
    0,
    MAX_GAIN,
    'VIDEO_NATIVE_AUDIO_VOLUME_INVALID',
  );
  const audioPresent = input.audioPresent ?? input.overlay.hasNativeAudio === true;
  const speechRanges = audioPresent
    ? selectVoiceoverSpeechRanges(input.overlay, input.allOverlays)
    : [];
  const remotionVolume = speechRanges.length === 0
    ? baseVolume
    : createDuckingVolume(
        baseVolume,
        speechRanges.map((range) => ({
          from: range.from - overlayFrom,
          durationInFrames: range.durationInFrames,
        })),
        fps,
        NATIVE_VIDEO_DUCKING,
      );

  return Object.freeze({
    remotionVolume,
    gainAtProjectFrame(projectFrame) {
      const frame = nonNegativeSafeInteger(
        projectFrame,
        'VIDEO_NATIVE_AUDIO_PROJECT_FRAME_INVALID',
      );
      const gain = typeof remotionVolume === 'function'
        ? remotionVolume(frame - overlayFrom)
        : remotionVolume;
      return finiteInRange(gain, 0, MAX_GAIN, 'VIDEO_NATIVE_AUDIO_GAIN_INVALID');
    },
  });
}

function selectVoiceoverSpeechRanges(
  overlay: ClipOverlay,
  allOverlays: readonly Overlay[],
): Array<{ from: number; durationInFrames: number }> {
  return allOverlays.flatMap((candidate) => {
    if (candidate.id === overlay.id || candidate.type !== OverlayType.SOUND) return [];
    const evidenced = getSoundAudioDuckRegions(candidate);
    if (evidenced !== null) return evidenced;

    const assetId = candidate.assetId ?? '';
    const isLegacyVoiceover = assetId.startsWith('voiceover_')
      || assetId.startsWith('vo_')
      || candidate.row === CANONICAL_VOICEOVER_ROW
      || candidate.row === LEGACY_VOICEOVER_ROW;
    return isLegacyVoiceover
      ? [{
          from: nonNegativeSafeInteger(candidate.from, 'VIDEO_NATIVE_AUDIO_VOICE_RANGE_INVALID'),
          durationInFrames: positiveSafeInteger(
            candidate.durationInFrames,
            'VIDEO_NATIVE_AUDIO_VOICE_RANGE_INVALID',
          ),
        }]
      : [];
  });
}

function finiteInRange(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeInteger(value: unknown, code: string): number {
  const normalized = nonNegativeSafeInteger(value, code);
  if (normalized < 1) throw new Error(code);
  return normalized;
}
