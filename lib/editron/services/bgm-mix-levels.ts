/**
 * Signal-driven BGM mix levels — grounded in the creative-knowledge-graph audio constants, NOT hardcoded and
 * NOT content-type/genre/profile driven (D-016: signals, not profiles).
 *
 * The old pipeline hardcoded `volume: 0.75` (un-ducked, ~-2.5dB) and `duckLevel: 0.20` (ducked, ~-14dB) as literals
 * in the audio worker + finalize + config. Both VIOLATE the CKG's own audio level ranges:
 *   - CKG `constant:audio.music_solo_level_range`         = -12..-6 dB   (un-ducked, between speech)
 *   - CKG `constant:audio.music_under_speech_level_range` = -24..-18 dB  (ducked, under speech)
 * i.e. 0.75 was ~9dB too hot in gaps and 0.20 ~5dB too hot under speech (the "music too loud" defect).
 *
 * These levels are a CONTINUOUS function of the video's own energy signal (energy_baseline, the
 * genre-parameter-computer's signal-derived speech/content energy), bounded by the CKG dB ranges. There is no
 * classification step — a low-energy talking-head gets a quieter bed, a high-energy edit a more present one,
 * with both always sitting a masking-safe distance below the voice.
 */

/** dBFS → linear 0-1 gain (Remotion <Audio volume> and styles.volume are linear). */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** CKG `constant:audio.music_solo_level_range` (part-6-constants.json:1693) — BGM in speech gaps. */
export const BGM_SOLO_DB = { min: -12, max: -6 } as const;
/** CKG `constant:audio.music_under_speech_level_range` (part-6-constants.json:1712) — BGM ducked under speech. */
export const BGM_UNDER_SPEECH_DB = { min: -24, max: -18 } as const;

export interface BgmMixSignals {
  /** genre-parameter-computer `energy_baseline` (0-1) — the signal-derived speech/content energy for this video. */
  energyBaseline: number;
}

export interface BgmMixLevels {
  /** Un-ducked BGM gain (0-1) → `styles.volume`. The level the bed plays at in speech gaps / no-VO stretches. */
  baseVolume: number;
  /** Ducked BGM gain (0-1) → `duckingConfig.duckLevel`. The level under active speech. */
  duckLevel: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Resolve the un-ducked + ducked BGM levels from the video's energy signal, bounded by the CKG ranges.
 * Higher energy → a more present bed (louder within both ranges); lower energy → a quieter, more restrained bed.
 * Both ends stay inside the CKG-endorsed dB windows, so speech intelligibility is preserved at every energy.
 */
export function resolveBgmMixLevels(signals: BgmMixSignals): BgmMixLevels {
  const energy = clamp01(signals.energyBaseline);
  const baseDb = lerp(BGM_SOLO_DB.min, BGM_SOLO_DB.max, energy);          // -12dB (calm) .. -6dB (energetic)
  const duckDb = lerp(BGM_UNDER_SPEECH_DB.min, BGM_UNDER_SPEECH_DB.max, energy); // -24dB (calm) .. -18dB (energetic)
  return {
    baseVolume: Number(dbToLinear(baseDb).toFixed(3)),
    duckLevel: Number(dbToLinear(duckDb).toFixed(3)),
  };
}

/** CKG-compliant defaults for callers without an energy signal (mid-energy point of both ranges). */
export const DEFAULT_BGM_MIX_LEVELS: BgmMixLevels = resolveBgmMixLevels({ energyBaseline: 0.5 });
