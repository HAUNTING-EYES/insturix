import { describe, expect, it } from 'vitest';

import {
  createAudioFadeEnvelope,
  createDuckingVolume,
  resolveAtomicSfxRenderMix,
  toOverlayLocalRanges,
} from '@/components/editron/editor/version-7.0.0/utils/audio-ducking';

describe('atomic SFX render mix', () => {
  const metadata = {
    atomicSfxForm: {
      version: 'atomic-sfx-form-v1',
      mix: {
        volume: 0.5,
        loudnessTarget: 0.72,
        duckUnderSpeech: true,
        duckLevel: 0.7,
        fadeInFrames: 2,
        fadeOutFrames: 3,
      },
    },
  };

  it('preserves the placed overlay volume while converting the atomic duck level to an absolute gain', () => {
    const mix = resolveAtomicSfxRenderMix(metadata, 0.2);

    expect(mix).toEqual({
      baseVolume: 0.2,
      duckingConfig: {
        enabled: true,
        duckLevel: 0.14,
        rampDownMs: 300,
        rampUpMs: 600,
        lookAheadMs: 150,
      },
      fadeInFrames: 2,
      fadeOutFrames: 3,
    });
  });

  it('uses the resolved form volume when no policy or user volume was persisted', () => {
    expect(resolveAtomicSfxRenderMix(metadata, undefined)?.baseVolume).toBe(0.5);
  });

  it('fails loud when an atomic form is present with an invalid render mix', () => {
    expect(() => resolveAtomicSfxRenderMix({
      atomicSfxForm: {
        mix: {
          volume: 0.5,
          loudnessTarget: 0.72,
          duckUnderSpeech: true,
          duckLevel: 1.5,
          fadeInFrames: 2,
          fadeOutFrames: 3,
        },
      },
    }, 0.2)).toThrow(/invalid atomic SFX render mix/i);
  });

  it('composes deterministic fade-in and fade-out around the incoming volume', () => {
    const volume = createAudioFadeEnvelope(0.5, 10, {
      fadeInFrames: 2,
      fadeOutFrames: 3,
    });

    expect(volume(0)).toBe(0);
    expect(volume(1)).toBeCloseTo(0.5);
    expect(volume(7)).toBeCloseTo(0.5);
    expect(volume(9)).toBe(0);
  });

  it('converts global speech ranges to the sound overlay local frame space', () => {
    const ranges = toOverlayLocalRanges([
      { from: 105, durationInFrames: 20 },
      { from: 140, durationInFrames: 10 },
    ], 100);

    expect(ranges).toEqual([
      { from: 5, durationInFrames: 20 },
      { from: 40, durationInFrames: 10 },
    ]);

    const mix = resolveAtomicSfxRenderMix(metadata, 0.2);
    const volume = createDuckingVolume(0.2, ranges, 30, mix!.duckingConfig!);
    expect(volume(12)).toBeCloseTo(0.14);
  });

  it('leaves legacy sound overlays on their existing render path', () => {
    expect(resolveAtomicSfxRenderMix({ source: 'legacy-upload' }, 0.35)).toBeNull();
  });
});
