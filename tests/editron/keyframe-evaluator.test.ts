import { describe, expect, it } from 'vitest';

import {
  computeSpeedSegments,
  evaluateKeyframeTrack,
} from '../../components/editron/editor/version-7.0.0/utils/keyframe-evaluator';

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

  it('uses an explicit source span for a source-preserving shortened retime', () => {
    const segments = computeSpeedSegments([
      { frame: 0, value: 2, easing: 'linear' },
      { frame: 59, value: 2, easing: 'linear' },
    ], 60, 120);

    expect(segments).toEqual([
      {
        compositionStartFrame: 0,
        compositionEndFrame: 59,
        playbackRate: 2,
        sourceStartFrame: 0,
      },
      {
        compositionStartFrame: 59,
        compositionEndFrame: 60,
        playbackRate: 2,
        sourceStartFrame: 118,
      },
    ]);
    expect(maxSourceEnd(segments)).toBe(120);
  });

  it('rejects an invalid source-frame budget', () => {
    expect(() => computeSpeedSegments([
      { frame: 0, value: 1, easing: 'linear' },
      { frame: 1, value: 1, easing: 'linear' },
    ], 2, Number.NaN)).toThrow('availableSourceFrames');
  });
});

describe('evaluateKeyframeTrack', () => {
  it.each([
    ['linear', [0.25, 0.5, 0.75]],
    ['ease-in', [0.09346465071882487, 0.31535681257253934, 0.6218618691748903]],
    ['ease-out', [0.3781381308251097, 0.6846431874274607, 0.9065353492811752]],
    ['ease-in-out', [0.15767840628626967, 0.5, 0.8423215937137303]],
    ['snap-out', [0.68359375, 0.9375, 0.99609375]],
  ] as const)('preserves the deployed %s easing curve', (easing, expected) => {
    const track = {
      property: 'scale' as const,
      keyframes: [
        { frame: 0, value: 0, easing },
        { frame: 100, value: 1, easing: 'linear' as const },
      ],
    };

    [25, 50, 75].forEach((frame, index) => {
      expect(evaluateKeyframeTrack(track, frame)).toBeCloseTo(expected[index], 7);
    });
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
