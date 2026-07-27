/**
 * Audio Ducking Utility
 *
 * Creates frame-accurate volume callbacks for Remotion's <Audio> component.
 * Automatically lowers BGM when voiceover is active, with professional
 * asymmetric ramps (fast down, slow up) and look-ahead.
 *
 * Usage in sound-layer-content.tsx:
 *   const volumeFn = createDuckingVolume(bgmOverlay, voOverlays, fps);
 *   <Audio volume={volumeFn} ... />
 */

import { interpolate, Easing } from 'remotion';

export interface DuckingConfig {
  enabled: boolean;
  /** Target volume when ducked (0-1). Default 0.20 (~-14 dB) */
  duckLevel: number;
  /** Ramp down duration in ms. Default 300ms */
  rampDownMs: number;
  /** Ramp up duration in ms. Default 600ms (slower = natural) */
  rampUpMs: number;
  /** Start ducking this many ms before VO begins. Default 200ms */
  lookAheadMs: number;
}

interface OverlayTimeRange {
  from: number; // Start frame
  durationInFrames: number;
}

type VolumeCallback = (frame: number) => number;

export interface AtomicSfxRenderMix {
  baseVolume: number;
  duckingConfig?: DuckingConfig;
  fadeInFrames: number;
  fadeOutFrames: number;
}

interface AudioFadeEnvelope {
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

const ATOMIC_SFX_DUCK_TIMING_MS = {
  rampDownMs: 300,
  rampUpMs: 600,
  lookAheadMs: 150,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeFrame(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Converts the resolved atomic SFX mix into values the renderer can consume.
 * The persisted overlay volume remains authoritative because policy/user edits
 * may intentionally reduce the form volume after resolution.
 */
export function resolveAtomicSfxRenderMix(
  metadata: unknown,
  persistedVolume: number | undefined,
): AtomicSfxRenderMix | null {
  if (!isRecord(metadata) || metadata.atomicSfxForm === undefined) return null;
  const form = metadata.atomicSfxForm;
  const mix = isRecord(form) ? form.mix : undefined;
  if (
    !isRecord(mix)
    || !isUnitNumber(mix.volume)
    || !isUnitNumber(mix.loudnessTarget)
    || typeof mix.duckUnderSpeech !== 'boolean'
    || !isUnitNumber(mix.duckLevel)
    || !isNonNegativeFrame(mix.fadeInFrames)
    || !isNonNegativeFrame(mix.fadeOutFrames)
  ) {
    throw new Error('Invalid atomic SFX render mix: resolved form metadata is incomplete or out of range.');
  }

  const baseVolume = typeof persistedVolume === 'number' && Number.isFinite(persistedVolume) && persistedVolume >= 0
    ? persistedVolume
    : mix.volume;
  const duckingConfig = mix.duckUnderSpeech
    ? {
        enabled: true,
        duckLevel: Number((baseVolume * mix.duckLevel).toFixed(6)),
        ...ATOMIC_SFX_DUCK_TIMING_MS,
      }
    : undefined;

  return {
    baseVolume,
    duckingConfig,
    fadeInFrames: mix.fadeInFrames,
    fadeOutFrames: mix.fadeOutFrames,
  };
}

export function toOverlayLocalRanges(
  ranges: OverlayTimeRange[],
  overlayStartFrame: number,
): OverlayTimeRange[] {
  return ranges.map((range) => ({
    from: range.from - overlayStartFrame,
    durationInFrames: range.durationInFrames,
  }));
}

/**
 * Create a volume callback that ducks BGM under voiceover.
 *
 * @param baseVolume - The overlay's base volume (e.g. 0.75)
 * @param voiceoverOverlays - All voiceover overlays (row 4 sound overlays)
 * @param fps - Timeline frames per second
 * @param config - Ducking parameters
 * @returns A function (frame: number) => number for Remotion's volume prop
 */
export function createDuckingVolume(
  baseVolume: number,
  voiceoverOverlays: OverlayTimeRange[],
  fps: number,
  config: DuckingConfig,
): (frame: number) => number {
  if (!config.enabled || voiceoverOverlays.length === 0) {
    return () => baseVolume;
  }

  const { duckLevel, rampDownMs, rampUpMs, lookAheadMs } = config;
  const rampDownFrames = Math.ceil((rampDownMs / 1000) * fps);
  const rampUpFrames = Math.ceil((rampUpMs / 1000) * fps);
  const lookAheadFrames = Math.ceil((lookAheadMs / 1000) * fps);

  // Pre-compute VO regions with look-ahead applied
  const voRegions = voiceoverOverlays.map((vo) => ({
    // Duck begins lookAheadFrames BEFORE VO starts
    duckStart: vo.from - lookAheadFrames,
    // Duck ends at VO end (ramp-up starts here)
    duckEnd: vo.from + vo.durationInFrames,
  }));

  return (frame: number): number => {
    let minVolume = baseVolume;

    for (const region of voRegions) {
      const { duckStart, duckEnd } = region;
      const rampUpEnd = duckEnd + rampUpFrames;

      if (frame < duckStart || frame > rampUpEnd) {
        // Outside this VO region entirely
        continue;
      }

      let regionVolume: number;

      if (frame < duckStart + rampDownFrames) {
        // Ramping down (fast, ease-in)
        regionVolume = interpolate(
          frame,
          [duckStart, duckStart + rampDownFrames],
          [baseVolume, duckLevel],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) },
        );
      } else if (frame <= duckEnd) {
        // Fully ducked
        regionVolume = duckLevel;
      } else {
        // Ramping up (slow, ease-out — natural swell)
        regionVolume = interpolate(
          frame,
          [duckEnd, rampUpEnd],
          [duckLevel, baseVolume],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) },
        );
      }

      // If multiple VO regions overlap, use the lowest volume
      minVolume = Math.min(minVolume, regionVolume);
    }

    return minVolume;
  };
}

export function createAudioFadeEnvelope(
  baseVolume: number | VolumeCallback,
  durationInFrames: number,
  envelope: AudioFadeEnvelope,
): VolumeCallback {
  const baseVolumeAt = typeof baseVolume === 'function'
    ? baseVolume
    : () => baseVolume;
  const duration = Math.max(1, Math.floor(durationInFrames));
  const fadeInFrames = Math.max(0, Math.min(duration, Math.floor(envelope.fadeInFrames ?? 0)));
  const fadeOutFrames = Math.max(0, Math.min(duration, Math.floor(envelope.fadeOutFrames ?? 0)));
  const fadeInEnd = Math.max(0, fadeInFrames - 1);
  const fadeOutStart = Math.max(0, duration - fadeOutFrames);
  const fadeOutEnd = duration - 1;

  return (frame: number): number => {
    let multiplier = 1;

    if (fadeInFrames > 1 && frame < fadeInFrames) {
      multiplier *= interpolate(
        frame,
        [0, fadeInEnd],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) },
      );
    }

    if (fadeOutFrames > 0 && frame >= fadeOutStart) {
      const fadeOutMultiplier = fadeOutEnd === fadeOutStart
        ? 0
        : interpolate(
            frame,
            [fadeOutStart, fadeOutEnd],
            [1, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) },
          );
      multiplier *= fadeOutMultiplier;
    }

    return baseVolumeAt(frame) * multiplier;
  };
}

export function createTailFadeVolume(
  baseVolume: number | VolumeCallback,
  durationInFrames: number,
  fadeOutFrames: number,
): VolumeCallback {
  return createAudioFadeEnvelope(baseVolume, durationInFrames, { fadeOutFrames });
}
