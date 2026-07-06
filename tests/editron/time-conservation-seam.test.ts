import { describe, expect, it } from 'vitest';

import { resolveTransitionClipStartFrom } from '@/components/editron/editor/version-7.0.0/components/overlays/transitions/transition-layer-content';
import { computeSpeedSegments, type SpeedSegment } from '@/components/editron/editor/version-7.0.0/utils/keyframe-evaluator';

describe('Editron time-conservation seams', () => {
  it('keeps transition-tile playback source-continuous when the tile begins before the cut boundary', () => {
    const boundaryFrame = 100;
    const transitionFrom = 82;
    const framesIntoTransition = boundaryFrame - transitionFrom;

    const clipA = { from: 0, sourceStartFrame: 300 };
    const clipB = { from: 100, sourceStartFrame: 900 };

    const clipAStartFrom = resolveTransitionClipStartFrom(clipA, transitionFrom);
    const clipBStartFrom = resolveTransitionClipStartFrom(clipB, transitionFrom);

    expect(clipAStartFrom + framesIntoTransition).toBe(clipA.sourceStartFrame + boundaryFrame - clipA.from);
    expect(clipBStartFrom + framesIntoTransition).toBe(clipB.sourceStartFrame);
  });

  it('keeps speed-ramp segments composition-contiguous and source-contiguous without overrunning the clip', () => {
    const totalFrames = 120;
    const segments = computeSpeedSegments([
      { frame: 45, value: 1, easing: 'linear' },
      { frame: 60, value: 0.35, easing: 'ease-in-out' },
      { frame: 90, value: 1.75, easing: 'ease-out' },
    ], totalFrames);

    expect(segments[0]?.compositionStartFrame).toBe(0);
    expect(segments[segments.length - 1]?.compositionEndFrame).toBe(totalFrames);
    expect(maxSourceEnd(segments)).toBeLessThanOrEqual(totalFrames);

    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].compositionStartFrame).toBe(segments[i - 1].compositionEndFrame);
      expect(segments[i].sourceStartFrame).toBeCloseTo(sourceEnd(segments[i - 1]));
    }
  });
});

function sourceEnd(segment: SpeedSegment): number {
  return segment.sourceStartFrame
    + ((segment.compositionEndFrame - segment.compositionStartFrame) * segment.playbackRate);
}

function maxSourceEnd(segments: SpeedSegment[]): number {
  return Math.max(...segments.map(sourceEnd));
}
