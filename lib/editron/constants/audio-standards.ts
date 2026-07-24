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

  /** BGM volume when voiceover is active (ducked) — ~-21 dB, CKG music_under_speech_level_range (-24..-18).
   *  Signal-driven per-video levels come from bgm-mix-levels.ts; this is the static chat-tool fallback. */
  BGM_WITH_VO: 0.089,

  /** BGM volume when no voiceover is playing — ~-9 dB, CKG music_solo_level_range (-12..-6).
   *  Was 0.75 (~-2.5dB), ~9dB hotter than the CKG's own ceiling (the "music too loud" defect). */
  BGM_WITHOUT_VO: 0.355,

  /** SFX peak volume — ~-3.7 dB */
  SFX_PEAK: 0.65,

  /** SFX volume when ducked under voiceover — ~-10 dB */
  SFX_DUCK_UNDER_VO: 0.30,

  /** Ambient room tone level — ~-16 dB */
  AMBIENT_ROOM_TONE: 0.15,
} as const;

/** Ducking ramp timing (milliseconds) */
export const DUCKING_DEFAULTS = {
  /** Volume level when ducked (0-1) — ~-21 dB, CKG music_under_speech_level_range (bgm-mix-levels.ts). Was 0.20. */
  duckLevel: 0.089,

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

/** Fix 31: Platform-specific loudness targets (LUFS) and delivery specs (Fix 30).
 *  Sources: EBU R 128, AES Streaming Guidelines, platform documentation. */
export const PLATFORM_SPECS = {
  youtube: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 43200, // 12 hours
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 20000,
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  instagram_reel: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 90,
    resolution: { width: 1080, height: 1920 },
    codec: 'H.264',
    maxBitrateKbps: 10000,
    aspectRatios: ['9:16', '1:1', '4:5'],
  },
  instagram_feed: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 60,
    resolution: { width: 1080, height: 1350 },
    codec: 'H.264',
    maxBitrateKbps: 10000,
    aspectRatios: ['1:1', '4:5', '16:9'],
  },
  tiktok: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 600,
    resolution: { width: 1080, height: 1920 },
    codec: 'H.264',
    maxBitrateKbps: 15000,
    aspectRatios: ['9:16'],
  },
  linkedin: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 600,
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 10000,
    aspectRatios: ['16:9', '1:1', '9:16'],
  },
  twitter: {
    lufs: -14,
    truePeakDbtp: -1,
    maxDurationSec: 140,
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 12000,
    aspectRatios: ['16:9', '1:1'],
  },
  broadcast: {
    lufs: -24,
    truePeakDbtp: -2,
    maxDurationSec: Infinity,
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 50000,
    aspectRatios: ['16:9'],
  },
  broadcast_ebu: {
    lufs: -23,
    truePeakDbtp: -1,
    maxDurationSec: Infinity,
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 50000,
    aspectRatios: ['16:9'],
  },
  broadcast_atsc: {
    lufs: -24,
    truePeakDbtp: -2,
    maxDurationSec: Infinity,
    resolution: { width: 1920, height: 1080 },
    codec: 'H.264',
    maxBitrateKbps: 50000,
    aspectRatios: ['16:9'],
  },
} as const;

export type Platform = keyof typeof PLATFORM_SPECS;

export interface AudioLoudnessTarget {
  platform: Platform | 'universal';
  integratedLufs: number;
  truePeakDbtp: number;
}

export const UNIVERSAL_AUDIO_LOUDNESS_TARGET: AudioLoudnessTarget = {
  platform: 'universal',
  integratedLufs: -14,
  truePeakDbtp: -1,
};

const AUDIO_PLATFORM_ALIASES: Record<string, Platform> = {
  'youtube-shorts': 'youtube',
  'instagram-reels': 'instagram_reel',
  'instagram-reel': 'instagram_reel',
  'instagram-feed': 'instagram_feed',
  x: 'twitter',
  broadcast: 'broadcast',
  'broadcast-ebu': 'broadcast_ebu',
  'broadcast-atsc': 'broadcast_atsc',
};

export function resolveAudioLoudnessTarget(platform?: string | null): AudioLoudnessTarget {
  const normalized = platform?.trim().toLowerCase().replace(/_/g, '-') || '';
  const platformKey = AUDIO_PLATFORM_ALIASES[normalized]
    ?? (normalized in PLATFORM_SPECS ? normalized as Platform : undefined);
  if (!platformKey) return UNIVERSAL_AUDIO_LOUDNESS_TARGET;

  const spec = PLATFORM_SPECS[platformKey];
  return {
    platform: platformKey,
    integratedLufs: spec.lufs,
    truePeakDbtp: spec.truePeakDbtp,
  };
}
