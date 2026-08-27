import { describe, expect, it } from 'vitest';

import {
  buildChatAddOverlayForm,
  chatAddOverlaySchema,
  getCanvasDimensions,
} from '../../lib/editron/agent/chat-add-overlay-form';
import { EDITRON_TEXT_SHADOW_FLOOR }
  from '../../lib/editron/agent/chat-overlay-safe-placement';

describe('chat add-overlay form owner', () => {
  it('materializes a deterministic native image form with current action-safe placement', () => {
    const request = chatAddOverlaySchema.parse({
      type: 'image',
      assetId: 'rhc02-still-a',
      start: 300,
      duration: 90,
      row: 2,
      x: 0,
      y: 0,
      width: 540,
      height: 1920,
      styles: { objectFit: 'cover', opacity: 1 },
    });
    const project = { aspectRatio: '9:16', overlays: [] };
    const first = buildChatAddOverlayForm({ request, project, overlayId: 101 });
    const replay = buildChatAddOverlayForm({ request, project, overlayId: 101 });

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      row: 2,
      position: { left: 54, top: 96, width: 486, height: 1728 },
      overlay: {
        id: 101,
        type: 'image',
        assetId: 'rhc02-still-a',
        from: 300,
        durationInFrames: 90,
        row: 2,
        left: 54,
        top: 96,
        width: 486,
        height: 1728,
        rotation: 0,
        isDragging: false,
        metadata: {
          chatPlacement: {
            requested: { left: 0, top: 0, width: 540, height: 1920 },
            resolved: { left: 54, top: 96, width: 486, height: 1728 },
            safeMargin: 0.05,
            adjusted: true,
          },
        },
        styles: {
          objectFit: 'cover',
          opacity: 1,
          animation: { enter: 'fadeIn', exit: 'fadeOut', duration: 15 },
        },
      },
    });
  });

  it('uses collision-aware rows and preserves explicit legible title form', () => {
    const request = chatAddOverlaySchema.parse({
      type: 'text',
      text: 'How we shipped it',
      start: 300,
      duration: 90,
      x: 108,
      y: 786,
      width: 864,
      height: 348,
      styles: {
        fontFamily: 'font-sans',
        fontSize: 76,
        fontWeight: 700,
        textAlign: 'center',
        color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.58)',
        opacity: 1,
      },
    });
    const result = buildChatAddOverlayForm({
      request,
      project: {
        aspectRatio: '9:16',
        overlays: [{
          id: 1,
          row: 0,
          from: 270,
          durationInFrames: 150,
          type: 'video',
        }],
      },
      overlayId: 102,
    });

    expect(result).toMatchObject({
      row: 1,
      position: { left: 108, top: 786, width: 864, height: 348 },
      overlay: {
        content: 'How we shipped it',
        styles: {
          fontSize: '76',
          fontFamily: 'font-sans',
          fontWeight: '700',
          textAlign: 'center',
          color: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.58)',
          opacity: 1,
          animation: { enter: 'fade', exit: 'fade', duration: 15 },
        },
      },
    });
    expect(result.overlay.styles).not.toHaveProperty('textShadow');
  });

  it('retains the transparent-text legibility floor from the live form', () => {
    const request = chatAddOverlaySchema.parse({
      type: 'text',
      text: 'Chapter',
      start: 0,
      duration: 30,
    });
    const result = buildChatAddOverlayForm({
      request,
      project: { aspectRatio: '16:9', overlays: [] },
      overlayId: 103,
    });

    expect(result.overlay.styles).toMatchObject({
      backgroundColor: 'transparent',
      textShadow: EDITRON_TEXT_SHADOW_FLOOR,
    });
  });

  it('fails loud for missing type-specific content', () => {
    const missingText = chatAddOverlaySchema.parse({
      type: 'text', start: 0, duration: 30,
    });
    const missingAsset = chatAddOverlaySchema.parse({
      type: 'image', start: 0, duration: 30,
    });
    const project = { aspectRatio: '16:9', overlays: [] };

    expect(() => buildChatAddOverlayForm({
      request: missingText, project, overlayId: 104,
    })).toThrow("'text' field is required for type='text'");
    expect(() => buildChatAddOverlayForm({
      request: missingAsset, project, overlayId: 105,
    })).toThrow("'assetId' field is required for type='image'");
  });

  it('keeps literal external font names outside the current native schema', () => {
    const parsed = chatAddOverlaySchema.safeParse({
      type: 'text',
      text: 'How we shipped it',
      start: 300,
      duration: 90,
      styles: { fontFamily: 'Noto Sans' },
    });

    expect(parsed.success).toBe(false);
  });

  it('keeps composition dimensions separate from preview dimensions', () => {
    expect(getCanvasDimensions({ aspectRatio: '9:16' }))
      .toEqual({ width: 1080, height: 1920 });
    expect(getCanvasDimensions({ aspectRatio: '16:9' }))
      .toEqual({ width: 1280, height: 720 });
    expect(getCanvasDimensions({ aspectRatio: 'unknown' }))
      .toEqual({ width: 1920, height: 1080 });
  });
});
