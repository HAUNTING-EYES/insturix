import { describe, expect, it } from 'vitest';

import { constrainFinalOverlayGeometry } from '../../components/editron/editor/version-7.0.0/components/core/final-overlay-geometry';

describe('final overlay geometry', () => {
  it('clamps the transformed text rect after keyframe scale and rotation', () => {
    const result = constrainFinalOverlayGeometry({
      overlayType: 'text',
      left: 930,
      top: 20,
      width: 320,
      height: 140,
      scale: 1.35,
      rotationDegrees: 18,
      transformOrigin: 'center center',
      canvasWidth: 1080,
      canvasHeight: 1920,
    });

    expect(result.constrained).toBe(true);
    expect(result.bounds.left).toBeGreaterThanOrEqual(108 - 0.001);
    expect(result.bounds.right).toBeLessThanOrEqual(972 + 0.001);
    expect(result.bounds.top).toBeGreaterThanOrEqual(192 - 0.001);
    expect(result.bounds.bottom).toBeLessThanOrEqual(1728 + 0.001);
  });

  it('does not shrink an intentional full-frame HTML scene', () => {
    const result = constrainFinalOverlayGeometry({
      overlayType: 'html-scene',
      left: 0,
      top: 0,
      width: 1080,
      height: 1920,
      scale: 1,
      rotationDegrees: 0,
      transformOrigin: 'center center',
      canvasWidth: 1080,
      canvasHeight: 1920,
    });

    expect(result).toMatchObject({
      left: 0,
      top: 0,
      scale: 1,
      constrained: false,
      bounds: { left: 0, top: 0, right: 1080, bottom: 1920 },
    });
  });

  it('honors CSS vertical-first transform-origin keywords', () => {
    const result = constrainFinalOverlayGeometry({
      overlayType: 'text',
      left: 0,
      top: 0,
      width: 300,
      height: 120,
      scale: 1,
      rotationDegrees: 0,
      transformOrigin: 'top left',
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(result.bounds.left).toBeGreaterThanOrEqual(192 - 0.001);
    expect(result.bounds.top).toBeGreaterThanOrEqual(108 - 0.001);
  });
});
