// Pure, dependency-free zoom keyframe builder. Extracted from edl-executor so the zoom-direction
// logic can be unit-tested WITHOUT pulling edl-executor's heavy module graph (gcs/upload services
// throw at import time when GOOGLE_CLOUD_CREDENTIALS is unset). No imports, no side effects.

export type ZoomEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export interface ZoomKeyframe { frame: number; value: number; easing: ZoomEasing }

/**
 * Build the scale keyframe track for a zoom.
 * Convention (matches DECISION_REGISTRY defaultParams): scaleFrom = START scale, scaleTo = END scale.
 * A pull-back has scaleFrom > scaleTo (e.g. 1.06 -> 1.0) and must render high -> low = a real zoom-OUT.
 */
export function buildZoomKeyframes(
  zoomType: string,
  scaleFrom: number,
  scaleTo: number,
  localFrame: number,
  duration: number,
  sceneEnd: number,
): ZoomKeyframe[] {
  switch (zoomType) {
    case 'punch-in':
      // Quick zoom to target at decision frame, then HOLD at that scale (Z-010)
      return [
        { frame: Math.max(0, localFrame - 5), value: scaleFrom, easing: 'ease-in' },
        { frame: localFrame + Math.min(duration, 15), value: scaleTo, easing: 'ease-out' },
        { frame: sceneEnd, value: scaleTo, easing: 'linear' }, // HOLD — don't bounce back
      ];
    case 'pull-back':
      // Start at scaleFrom (zoomed in), pull back to scaleTo. Registry sets scaleFrom > scaleTo,
      // so this renders high -> low = a real zoom-OUT. (Bug fix 2026-06-04: the two values were
      // previously swapped here — scaleTo -> scaleFrom — so a pull-back rendered as a zoom-IN and
      // never pulled back. Verified via scripts/probe-brief-zoom-eval.ts: the brief picks
      // zoom_pull_back ~17% of zooms, yet the render probe found 0 pull-backs — all silently inverted.)
      return [
        { frame: Math.max(0, localFrame), value: scaleFrom, easing: 'ease-in-out' },
        { frame: Math.min(localFrame + duration, sceneEnd), value: scaleTo, easing: 'ease-out' },
      ];
    case 'slow-push':
    default:
      // Gentle zoom over the full scene duration (cinematic push)
      return [
        { frame: 0, value: scaleFrom, easing: 'ease-in-out' },
        { frame: sceneEnd, value: scaleTo, easing: 'ease-in-out' },
      ];
  }
}
