/**
 * ThinkForge writer capabilities — the WRITE-TIME constraint surface the script writer
 * authors within (Master doc §1.4 "imported by the ThinkForge writer", §4, §5.1.4).
 *
 * ThinkForge is a WRITER, not a router. It must NOT know model ids, costs, or lane selection
 * (that is the GenerationRouter's job, §5.2.6). It only needs the downstream LIMITS its prose
 * has to respect so the script is producible without a re-write. Everything here derives from
 * the single source of truth — `lib/shared/capabilities.ts` — so a rig change updates the
 * writer's constraints automatically, with zero duplicated numbers.
 */

import { AVATAR_RIG } from '@/lib/shared/capabilities';

export interface WriterCapabilities {
  /** Whether an on-camera SPEAKING avatar can be produced at all. If false, the writer must
   *  default every spoken line to VO-over-visuals (no on-camera dialogue authored). */
  avatarSpeakingAvailable: boolean;
  /** Max duration of ONE on-camera speaking shot the pipeline can lip-sync in a single piece.
   *  The writer MUST split any on-camera speaking beat longer than this into segments of at
   *  most this many seconds (each becomes its own scene/sub-shot). ← Kling LipSync input cap. */
  maxSpeakingSegmentSec: number;
  /** Max duration of one authored Script Sidecar scene. Long-form scripts split at this
   *  production-unit ceiling instead of creating an unrenderable mega-scene. */
  maxSceneDurationSec: number;
  /** VO / spoken languages the voice-clone + relip rig supports. The writer must not author
   *  spoken lines in a language outside this set (captions can still be any language). */
  voiceLanguages: readonly string[];
  /** Framings the writer may request for a speaking shot (relip needs a usable face). */
  speakingFramings: readonly string[];
  /** The §5.1.4 relip-safe write rule for speaking-shot visualDescriptions. */
  relipSafe: {
    /** Face must be visible for the pipeline's face-presence gate to allow relip spend. */
    faceVisibleRequired: boolean;
    /** Max occlusion the writer may describe over the speaker's face during a spoken line. */
    maxOcclusion: 'none' | 'light' | 'moderate';
    /** Motion the writer may describe during spoken lines (too much motion breaks lip-sync). */
    motionDuringLines: 'still' | 'moderate' | 'any';
  };
}

/** Live writer constraints, derived from the shared rig. */
export const WRITER_CAPABILITIES: WriterCapabilities = {
  avatarSpeakingAvailable: true, // A0/relip lanes are the shipped speaking path
  maxSpeakingSegmentSec: AVATAR_RIG.relip.maxInputVideoSec, // 10s hard cap (Kling LipSync)
  maxSceneDurationSec: AVATAR_RIG.maxClipSec, // 60s hard cap for one renderable production unit
  voiceLanguages: AVATAR_RIG.languages, // ['en'] today; multilingual PARKED in the rig
  speakingFramings: AVATAR_RIG.framings,
  relipSafe: { faceVisibleRequired: true, maxOcclusion: 'light', motionDuringLines: 'moderate' },
};

/**
 * On-camera ratio dial (§4): the fraction of spoken lines the writer targets ON camera.
 * A cost budget, not a hard rule — higher ratio = more relip spend. User-overridable via Brief.
 * INVENTED-PLACEHOLDER default; calibrate.
 */
export const DEFAULT_ON_CAMERA_RATIO = 0.5;

/** True when a spoken beat exceeds the single-relip cap and the writer must split it. */
export function speakingBeatNeedsSplit(durationSec: number): boolean {
  return durationSec > WRITER_CAPABILITIES.maxSpeakingSegmentSec;
}

/** Whether the writer may author a spoken line in this language. */
export function canSpeakLanguage(language: string): boolean {
  return WRITER_CAPABILITIES.voiceLanguages.includes(language);
}
