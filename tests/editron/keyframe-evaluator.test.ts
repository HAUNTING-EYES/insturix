import { describe, expect, it } from 'vitest';

import { computeSpeedSegments } from '../../components/editron/editor/version-7.0.0/utils/keyframe-evaluator';

describe('computeSpeedSegments', () => {
  it('keeps fast tail ramps inside the selected clip source range', () => {
    const segments = computeSpeedSegments([
      { frame: 0, value: 1, easing: 'linear' },
      { frame: 50, value: 4, easing: 'ease-in-out' },
    ], 60);

    expect(segments).toEqual([
      {
        compositionStartFrame: 0,
        compositionEndFrame: 50,
        playbackRate: 1,
        sourceStartFrame: 0,
      },
      {
        compositionStartFrame: 50,
        compositionEndFrame: 60,
        playbackRate: 1,
        sourceStartFrame: 50,
      },
    ]);
    expect(maxSourceEnd(segments)).toBeLessThanOrEqual(60);
  });

  it('preserves normal speed curves when requested source use fits the clip', () => {
    const segments = computeSpeedSegments([
      { frame: 0, value: 1, easing: 'linear' },
      { frame: 60, value: 0.3, easing: 'ease-in-out' },
      { frame: 90, value: 1, easing: 'ease-out' },
    ], 120);

    expect(segments).toEqual([
      {
        compositionStartFrame: 0,
        compositionEndFrame: 60,
        playbackRate: 1,
        sourceStartFrame: 0,
      },
      {
        compositionStartFrame: 60,
        compositionEndFrame: 90,
        playbackRate: 0.3,
        sourceStartFrame: 60,
      },
      {
        compositionStartFrame: 90,
        compositionEndFrame: 120,
        playbackRate: 1,
        sourceStartFrame: 69,
      },
    ]);
    expect(maxSourceEnd(segments)).toBe(99);
  });
});

function maxSourceEnd(segments: Array<{
  compositionStartFrame: number;
  compositionEndFrame: number;
  playbackRate: number;
  sourceStartFrame: number;
}>): number {
  return Math.max(...segments.map((segment) =>
    segment.sourceStartFrame
    + ((segment.compositionEndFrame - segment.compositionStartFrame) * segment.playbackRate)
  ));
}