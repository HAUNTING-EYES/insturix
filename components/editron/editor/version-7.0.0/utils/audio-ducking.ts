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
