import { describe, expect, it } from 'vitest';

import {
  constrainChatOverlayPlacement,
  EDITRON_ACTION_SAFE_MARGIN,
  EDITRON_TITLE_SAFE_MARGIN,
} from '../../lib/editron/agent/chat-overlay-safe-placement';

describe('chat overlay safe placement', () => {
  it('keeps top text inside the rendered title-safe contract', () => {
    const placement = constrainChatOverlayPlacement({
      overlayType: 'text',
      bounds: { left: 240, top: 142, width: 600, height: 100 },
      canvas: { width: 1080, height: 1920 },
    });

    expect(placement).toMatchObject({
      left: 240,
      top: 192,
      width: 600,
      height: 100,
      margin: EDITRON_TITLE_SAFE_MARGIN,
      adjusted: true,
    });
  });

  it('clamps bottom-right images into action-safe bounds without changing their size', () => {
    const placement = constrainChatOverlayPlacement({
      overlayType: 'image',
      bounds: { left: 718, top: 1432, width: 400, height: 400 },
      canvas: { width: 1080, height: 1920 },
    });

    expect(placement).toMatchObject({
      left: 626,
      top: 1424,
      width: 400,
      height: 400,
      margin: EDITRON_ACTION_SAFE_MARGIN,
      adjusted: true,
    });
  });

  it('fits oversized visual overlays proportionally before clamping them', () => {
    const placement = constrainChatOverlayPlacement({
      overlayType: 'image',
      bounds: { left: -200, top: -100, width: 2160, height: 1920 },
      canvas: { width: 1080, height: 1920 },
    });

    expect(placement.width).toBeCloseTo(972);
    expect(placement.height).toBeCloseTo(864);
    expect(placement.left).toBeCloseTo(54);
    expect(placement.top).toBeGreaterThanOrEqual(96);
  });

  it('allows full-frame video while still preventing off-canvas geometry', () => {
    const placement = constrainChatOverlayPlacement({
      overlayType: 'video',
      bounds: { left: -50, top: -30, width: 1280, height: 720 },
      canvas: { width: 1280, height: 720 },
    });

    expect(placement).toMatchObject({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      margin: 0,
      adjusted: true,
    });
  });

  it('fails loud for non-finite or non-positive geometry', () => {
    expect(() => constrainChatOverlayPlacement({
      overlayType: 'text',
      bounds: { left: 0, top: 0, width: Number.NaN, height: 100 },
      canvas: { width: 1080, height: 1920 },
    })).toThrow(/finite coordinates and positive dimensions/);
  });
});
