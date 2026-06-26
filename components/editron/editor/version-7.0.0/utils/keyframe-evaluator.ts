/**
 * Keyframe Evaluation Utility
 *
 * Evaluates keyframe tracks at a given frame to produce interpolated values.
 * Uses Remotion's interpolate() for smooth easing between keyframe values.
 *
 * Keyframe frames are LOCAL to the overlay (0 = overlay start).
 * This is separate from overlay.startFrom (clip trim) which affects SOURCE
 * content display, not keyframe timing.
 */

import { interpolate, Easing } from 'remotion';
import type { KeyframeTrack, Keyframe } from '../types';

// ─── Easing Mapping ──────────────────────────────────────────────

type EasingFunction = (t: number) => number;

const EASING_MAP: Record<string, EasingFunction> = {
  'linear': (t: number) => t,
  'ease-in': Easing.in(Easing.ease),
  'ease-out': Easing.out(Easing.ease),
  'ease-in-out': Easing.inOut(Easing.ease),
};

function getEasing(name: string): EasingFunction {
  return EASING_MAP[name] || EASING_MAP['linear'];
}

// ─── Single Track Evaluation ─────────────────────────────────────

/**
 * Evaluate a single keyframe track at a given local frame.
 *
 * @param track - The keyframe track to evaluate
 * @param localFrame - Frame offset from overlay start (0-based)
 * @returns Interpolated value at the given frame
 */
export function evaluateKeyframeTrack(
  track: KeyframeTrack,
  localFrame: number,
): number {
  const kfs = track.keyframes;
  if (!kfs || kfs.length === 0) return 0;

  // Single keyframe — constant value
  if (kfs.length === 1) return kfs[0].value;

  // Sort by frame (should already be sorted, but be safe)
  const sorted = [...kfs].sort((a, b) => a.frame - b.frame);

  // Before first keyframe — hold first value
  if (localFrame <= sorted[0].frame) return sorted[0].value;

  // After last keyframe — hold last value
  if (localFrame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;

  // Find the two surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];

    if (localFrame >= from.frame && localFrame <= to.frame) {
      // Interpolate between from and to
      return interpolate(
        localFrame,
        [from.frame, to.frame],
        [from.value, to.value],
        {
          easing: getEasing(from.easing),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      );
    }
  }

  // Fallback (shouldn't reach here)
  return sorted[sorted.length - 1].value;
}

// ─── Multi-Track Evaluation ──────────────────────────────────────

/**
 * Evaluate all keyframe tracks at once.
 * Returns a map of property name → interpolated value.
 * Only includes properties that have active tracks.
 *
 * @param tracks - Array of keyframe tracks
 * @param localFrame - Frame offset from overlay start (0-based)
 * @returns Record of property → value (only tracked properties)
 */
export function evaluateAllTracks(
  tracks: KeyframeTrack[],
  localFrame: number,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const track of tracks) {
    if (track.keyframes && track.keyframes.length > 0) {
      result[track.property] = evaluateKeyframeTrack(track, localFrame);
    }
  }

  return result;
}

// ─── Speed Segment Computation ───────────────────────────────────

export interface SpeedSegment {
  /** Where this segment starts in the composition timeline (local frame) */
  compositionStartFrame: number;
  /** Where this segment ends in the composition timeline (local frame) */
  compositionEndFrame: number;
  /** Constant playback rate for this segment */
  playbackRate: number;
  /** Where in the SOURCE video to start (accounting for frames consumed at previous rates) */
  sourceStartFrame: number;
}

/**
 * Compute speed segments from a speed curve.
 * Each segment has a constant playbackRate and knows where in the SOURCE
 * video it starts (accounting for consumed frames at previous rates).
 *
 * Example:
 *   speedCurve: [{frame:0, value:1.0}, {frame:60, value:0.3}, {frame:90, value:1.0}]
 *   totalDurationFrames: 120
 *
 *   Segment 1: comp 0–60,  rate=1.0, sourceStart=0   (consumes 60 source frames)
 *   Segment 2: comp 60–90, rate=0.3, sourceStart=60  (consumes 30×0.3=9 source frames)
 *   Segment 3: comp 90–120, rate=1.0, sourceStart=69 (consumes 30 source frames)
 */
export function computeSpeedSegments(
  speedCurve: Keyframe[],
  totalDurationFrames: number,
): SpeedSegment[] {
  if (!speedCurve || speedCurve.length === 0) {
    return [{
      compositionStartFrame: 0,
      compositionEndFrame: totalDurationFrames,
      playbackRate: 1,
      sourceStartFrame: 0,
    }];
  }

  const sorted = [...speedCurve].sort((a, b) => a.frame - b.frame);
  const segments: SpeedSegment[] = [];
  let sourceOffset = 0;

  // Lead-in coverage: a speed curve whose first keyframe is after frame 0 leaves the span
  // [0, firstFrame) with NO segment. video-layer-content maps each segment to a <Sequence>/
  // <OffthreadVideo>, so an uncovered span mounts NO video and the clip renders BLACK there —
  // in BOTH the live preview and the Lambda render. (Observed: clip with curve starting at
  // frame 119 went black for local 0–118.) Cover the lead-in at normal speed so the clip plays
  // its footage up to the ramp; rate 1.0 consumes source frames 1:1, keeping the ramp segments
  // below source-continuous.
  if (sorted[0].frame > 0) {
    segments.push({
      compositionStartFrame: 0,
      compositionEndFrame: sorted[0].frame,
      playbackRate: 1,
      sourceStartFrame: 0,
    });
    sourceOffset = sorted[0].frame;
  }

  for (let i = 0; i < sorted.length; i++) {
    const startFrame = sorted[i].frame;
    const endFrame = i < sorted.length - 1 ? sorted[i + 1].frame : totalDurationFrames;
    const rate = Math.max(0.1, Math.min(sorted[i].value, 4.0)); // Clamp 0.1-4.0

    const compDuration = endFrame - startFrame;
    const sourceFramesConsumed = Math.round(compDuration * rate);

    segments.push({
      compositionStartFrame: startFrame,
      compositionEndFrame: endFrame,
      playbackRate: rate,
      sourceStartFrame: sourceOffset,
    });

    sourceOffset += sourceFramesConsumed;
  }

  return segments;
}
