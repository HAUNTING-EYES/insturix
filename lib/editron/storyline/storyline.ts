/**
 * Storyline - the neutral, rich "lightweight EDL" the composer emits. It is NOT a
 * Remotion/ffmpeg format: it is an engine-neutral plan that a downstream renderer
 * (Editron's director / Remotion) translates. Keeping it neutral is deliberate (render
 * dig): the plan carries intent (order, role, fit, transitions), the renderer carries
 * pixels.
 *
 * Every field here is a lesson from the Edit Mind assembly dig:
 *  - explicit `order` on each clip (Edit Mind loses sequence to vector-store return order);
 *  - `role` (Edit Mind has no A-roll/B-roll/hook notion);
 *  - per-clip `fit` (Edit Mind hardcodes pillarbox for everything);
 *  - a REAL validity contract (Edit Mind's validator is dead code that passes zero-length clips);
 *  - one pinned render target (Edit Mind proves you must normalize into a single canvas).
 */

import type { AspectRatio } from '../production-brief/production-brief';

export type ClipRole = 'hook' | 'a-roll' | 'b-roll' | 'body' | 'outro';

/** How a clip fills the render canvas when its aspect differs from the target. */
export type FitPolicy = 'contain' | 'cover' | 'pad';

export interface Transition {
  type: string; // e.g. 'cut' | 'crossfade' - renderer-interpreted
  durationSec: number;
}

export interface StorylineClip {
  /** 0-based contiguous sequence index. The renderer MUST honor this, not array position. */
  order: number;
  /** Stable ref back to the source Scene (its id). */
  sourceRef: string;
  /** Source asset ref/path. */
  source: string;
  /** In/out points in the SOURCE, seconds. Invariant: out > in. */
  in: number;
  out: number;
  /** out - in, seconds. */
  durationSec: number;
  role: ClipRole;
  fit: FitPolicy;
  /** Transition INTO this clip (absent on the first clip). */
  transitionIn?: Transition;
}

export interface RenderTarget {
  aspectRatio: AspectRatio;
  fps: number;
  width: number;
  height: number;
  container: string;
  videoCodec: string;
  audioCodec: string;
}

export interface Storyline {
  /** Clips sorted by `order`, contiguous 0..n-1. May be empty (no viable scenes). */
  clips: StorylineClip[];
  renderTarget: RenderTarget;
  /** Sum of clip durations, seconds. */
  totalDurationSec: number;
  /** How condensed this cut is: kept output / available source, 0..1. 1 = faithful (nothing
   *  cut); ->0 = heavily condensed. Replaces the old reel/auto-edit binary; drives ordering
   *  and is carried for provenance/telemetry. */
  condensationRatio: number;
  /** The brief's target length (null = "follow the content"). Carried for provenance. */
  targetDurationSec: number | null;
}

export interface StorylineIssue {
  code: string;
  message: string;
  clipOrder?: number;
}

export interface StorylineValidation {
  valid: boolean;
  issues: StorylineIssue[];
}

/**
 * Minimum clip length. Anything shorter is a flicker, not a shot.
 * INVENTED-PLACEHOLDER (calibrate from real edits); directly fixes Edit Mind's dead
 * validator that let 0-length clips reach ffmpeg.
 */
export const MIN_CLIP_DURATION_SEC = 0.4;

/** Tolerance (seconds) for the total-vs-target duration check. INVENTED-PLACEHOLDER. */
export const DURATION_TOLERANCE_SEC = 1.0;

/** Standard pixel dimensions per aspect ratio, long edge pinned to 1080. */
const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

/** Build the single pinned render target from the brief's aspect ratio. */
export function renderTargetForAspect(aspectRatio: AspectRatio, fps = 30): RenderTarget {
  const { width, height } = ASPECT_DIMENSIONS[aspectRatio] ?? ASPECT_DIMENSIONS['16:9'];
  return {
    aspectRatio,
    fps, // 30 = standard default
    width,
    height,
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
  };
}

/**
 * Validate a storyline against the real contract (the thing Edit Mind never enforced).
 * Never throws - returns every issue found so a caller can decide. `valid` is true only
 * when there are zero issues.
 */
export function validateStoryline(
  storyline: Storyline,
  opts?: { minClipDurationSec?: number; durationToleranceSec?: number },
): StorylineValidation {
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;
  const tolerance = opts?.durationToleranceSec ?? DURATION_TOLERANCE_SEC;
  const issues: StorylineIssue[] = [];

  storyline.clips.forEach((clip, index) => {
    if (clip.order !== index) {
      issues.push({ code: 'order_not_contiguous', message: `clip at index ${index} has order ${clip.order}`, clipOrder: clip.order });
    }
    if (!clip.sourceRef || !clip.source) {
      issues.push({ code: 'missing_source', message: `clip ${clip.order} is missing a source ref`, clipOrder: clip.order });
    }
    if (!(clip.out > clip.in)) {
      issues.push({ code: 'nonpositive_duration', message: `clip ${clip.order} has out (${clip.out}) <= in (${clip.in})`, clipOrder: clip.order });
    } else if (clip.out - clip.in < minClip) {
      issues.push({ code: 'below_min_duration', message: `clip ${clip.order} is ${(clip.out - clip.in).toFixed(2)}s < min ${minClip}s`, clipOrder: clip.order });
    }
    if (Math.abs(clip.durationSec - (clip.out - clip.in)) > 1e-6) {
      issues.push({ code: 'duration_mismatch', message: `clip ${clip.order} durationSec is inconsistent with in/out`, clipOrder: clip.order });
    }
  });

  const summed = storyline.clips.reduce((acc, c) => acc + c.durationSec, 0);
  if (Math.abs(summed - storyline.totalDurationSec) > 1e-6) {
    issues.push({ code: 'total_duration_mismatch', message: `totalDurationSec ${storyline.totalDurationSec} != sum of clips ${summed}` });
  }
  if (storyline.targetDurationSec !== null && storyline.clips.length > 0) {
    if (storyline.totalDurationSec > storyline.targetDurationSec + tolerance) {
      issues.push({ code: 'over_target', message: `total ${storyline.totalDurationSec.toFixed(2)}s exceeds target ${storyline.targetDurationSec}s + tol ${tolerance}s` });
    }
  }

  return { valid: issues.length === 0, issues };
}
