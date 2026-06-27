export const TRANSITION_BOUNDARY_SNAP_TOLERANCE_FRAMES = 45;

export interface TimelineBoundaryOverlay {
  id: string | number;
  type: string;
  from: number;
  durationInFrames: number;
}

export interface ClipBoundaryMatch<TOverlay extends TimelineBoundaryOverlay = TimelineBoundaryOverlay> {
  /** The clip boundary frame (end of clipA / start of clipB). */
  boundaryFrame: number;
  /** Clip ending at/before the boundary. */
  clipA: TOverlay;
  /** Clip starting at/after the boundary. */
  clipB: TOverlay;
  /** Drift in frames between requested decision frame and actual boundary. */
  drift: number;
}

export function findNearestVisualClipBoundary<TOverlay extends TimelineBoundaryOverlay>(
  decisionFrame: number,
  overlays: TOverlay[],
  maxTolerance: number = TRANSITION_BOUNDARY_SNAP_TOLERANCE_FRAMES,
): ClipBoundaryMatch<TOverlay> | null {
  const visualOverlays = overlays
    .filter((overlay) => overlay.type === 'video' || overlay.type === 'image')
    .sort((a, b) => a.from - b.from);

  const effectiveTolerance = visualOverlays.length > 20
    ? Math.max(maxTolerance, 120)
    : maxTolerance;

  let best: ClipBoundaryMatch<TOverlay> | null = null;

  for (let index = 0; index < visualOverlays.length - 1; index += 1) {
    const clipA = visualOverlays[index];
    const clipB = visualOverlays[index + 1];
    const boundaryFrame = clipA.from + clipA.durationInFrames;
    const drift = Math.abs(boundaryFrame - decisionFrame);

    if (drift <= effectiveTolerance && (!best || drift < best.drift)) {
      best = { boundaryFrame, clipA, clipB, drift };
    }
  }

  return best;
}