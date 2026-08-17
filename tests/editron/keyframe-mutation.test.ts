import { describe, expect, it } from 'vitest';

import { buildKeyframeMutationPatch } from '@/lib/editron/services/keyframe-mutation';

describe('keyframe mutation patch', () => {
  it('persists a resolved scale track and subject focal point without changing other styles', () => {
    const result = buildKeyframeMutationPatch({
      overlay: {
        styles: { opacity: 0.8 },
        keyframeTracks: [{ property: 'opacity', keyframes: [{ frame: 0, value: 1, easing: 'linear' }] }],
      },
      property: 'scale',
      keyframes: [
        { frame: 3, value: 1, easing: 'ease-out' },
        { frame: 14, value: 1.12, easing: 'ease-out' },
      ],
      focalPoint: { x: 0.745, y: 0.5 },
    });

    expect(result).toMatchObject({
      focal: { x: 0.745, y: 0.5, transformOrigin: '74.5% 50%' },
      patch: {
        styles: { opacity: 0.8, transformOrigin: '74.5% 50%' },
        keyframeTracks: [
          { property: 'opacity' },
          { property: 'scale', keyframes: [{ frame: 3, value: 1 }, { frame: 14, value: 1.12 }] },
        ],
      },
    });
  });

  it('persists speed curves and rejects focal points on non-scale tracks', () => {
    const speed = buildKeyframeMutationPatch({
      overlay: {},
      property: 'speed',
      keyframes: [
        { frame: 0, value: 1, easing: 'linear' },
        { frame: 20, value: 0.5, easing: 'ease-out' },
      ],
    });
    expect(speed.patch.speedCurve).toEqual(speed.patch.keyframeTracks[0].keyframes);
    expect(() => buildKeyframeMutationPatch({
      overlay: {},
      property: 'x',
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 10, value: 10, easing: 'linear' },
      ],
      focalPoint: { x: 0.5, y: 0.5 },
    })).toThrow('KEYFRAME_MUTATION_FOCAL_REQUIRES_SCALE');
  });
});
