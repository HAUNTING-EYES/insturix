import { describe, expect, it } from 'vitest';

import { sanitizeMotionGraphicContent } from '../../components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content';

describe('motion graphic layer content sanitization', () => {
  it('preserves primitive arrays required by data-viz MG recipes', () => {
    const sanitized = sanitizeMotionGraphicContent({
      values: [12, 19, 31, 47],
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      value: '47%',
      active: true,
      nested: { unsafe: true },
      mixedUnsafe: [1, { nope: true }],
      emptyArray: [],
    });

    expect(sanitized).toEqual({
      values: [12, 19, 31, 47],
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      value: '47%',
      active: true,
    });
  });
});
