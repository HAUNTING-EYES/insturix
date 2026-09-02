import { describe, expect, it } from 'vitest';

import { createVideoNativeAudioMixV1 } from '@/components/editron/editor/version-7.0.0/utils/video-native-audio-mix-v1';
import {
  OverlayType,
  type ClipOverlay,
  type SoundOverlay,
} from '@/components/editron/editor/version-7.0.0/types';

describe('video native audio mix V1', () => {
  it('uses one frame-addressable duck curve for Remotion and external PCM', () => {
    const clip = video();
    const mix = createVideoNativeAudioMixV1({
      overlay: clip,
      allOverlays: [clip, voiceover()],
      fps: 30,
    });

    expect(typeof mix.remotionVolume).toBe('function');
    expect(mix.gainAtProjectFrame(110)).toBe(0.8);
    expect(mix.gainAtProjectFrame(125)).toBe(0.12);
    expect(mix.gainAtProjectFrame(156)).toBe(0.8);
    expect((mix.remotionVolume as (frame: number) => number)(25)).toBe(0.12);
  });

  it('honors explicit no-speech evidence instead of legacy voiceover labels', () => {
    const clip = video();
    const silent = voiceover({
      metadata: { nativeAudioEvidence: { hasSpeech: false } },
    });
    const mix = createVideoNativeAudioMixV1({
      overlay: clip,
      allOverlays: [clip, silent],
      fps: 30,
    });

    expect(mix.remotionVolume).toBe(0.8);
    expect(mix.gainAtProjectFrame(125)).toBe(0.8);
  });

  it('rejects unbound speech evidence rather than inventing a range', () => {
    const clip = video();
    const unbound = voiceover({
      metadata: {
        nativeAudioEvidence: {
          hasSpeech: true,
          sourceAssetId: 'different-asset',
          sourceVersion: 'sha256:source-v1',
          speechRegions: [{ sourceStartFrame: 0, sourceEndFrame: 10 }],
        },
      },
    });
    expect(() => createVideoNativeAudioMixV1({
      overlay: clip,
      allOverlays: [clip, unbound],
      fps: 30,
    })).toThrowError('UNBOUND_SOUND_SPEECH_EVIDENCE');
  });

  it('fails loud for invalid mix inputs', () => {
    const clip = video();
    expect(() => createVideoNativeAudioMixV1({
      overlay: { ...clip, styles: { ...clip.styles, volume: Number.NaN } },
      allOverlays: [clip],
      fps: 30,
    })).toThrowError('VIDEO_NATIVE_AUDIO_VOLUME_INVALID');
    expect(() => createVideoNativeAudioMixV1({
      overlay: clip,
      allOverlays: [clip],
      fps: 0,
    })).toThrowError('VIDEO_NATIVE_AUDIO_FPS_INVALID');
  });
});

function video(): ClipOverlay {
  return {
    id: 1,
    type: OverlayType.VIDEO,
    content: 'https://example.com/interview.mp4',
    src: 'https://example.com/interview.mp4',
    from: 100,
    durationInFrames: 100,
    row: 2,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    hasNativeAudio: true,
    styles: { volume: 0.8 },
  };
}

function voiceover(overrides: Record<string, unknown> = {}): SoundOverlay {
  return {
    id: 2,
    type: OverlayType.SOUND,
    content: 'https://example.com/voice.wav',
    src: 'https://example.com/voice.wav',
    assetId: 'voiceover_interview',
    from: 120,
    durationInFrames: 20,
    row: 3,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    styles: { volume: 1 },
    ...overrides,
  } as SoundOverlay;
}
