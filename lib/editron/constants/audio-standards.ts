/**
 * Audio Mixing Standards
 *
 * Professional audio level constants for the Editron pipeline.
 * Based on broadcast standards (-14 LUFS for dialogue, -18 to -12 dB
 * for BGM under voiceover).
 */

/** Volume levels (0-1 scale, mapped to approximate dBFS) */
export const AUDIO_LEVELS = {
  /** Voiceover target peak volume */
  VO_PEAK: 1.0, // 0 dBFS reference

  /** BGM volume when voiceover is active (ducked) — ~-14 dB */
  BGM_WITH_VO: 0.20,

  /** BGM volume when no voiceover is playing — ~-2.5 dB */
  BGM_WITHOUT_VO: 0.75,

  /** SFX peak volume — ~-3.7 dB */
  SFX_PEAK: 0.65,

  /** SFX volume when ducked under voiceover — ~-10 dB */
  SFX_DUCK_UNDER_VO: 0.30,

  /** Ambient room tone level — ~-16 dB */
  AMBIENT_ROOM_TONE: 0.15,
} as const;

/** Ducking ramp timing (milliseconds) */
export const DUCKING_DEFAULTS = {
  /** Volume level when ducked (0-1) */
  duckLevel: 0.20,

  /** How quickly BGM ramps down when VO starts (ms) */
  rampDownMs: 300,

  /** How quickly BGM ramps back up after VO ends (ms) — slower = more natural */
  rampUpMs: 600,

  /** Start ducking this many ms BEFORE VO begins — professional look-ahead */
  lookAheadMs: 200,
} as const;

/** Default ducking config for finalize route overlays */
export const DEFAULT_DUCKING_CONFIG = {
  enabled: true,
  ...DUCKING_DEFAULTS,
} as const;

/** BGM fade-out at project end (frames) */
export const BGM_FADE_OUT_FRAMES = 30; // 1 second at 30fps
