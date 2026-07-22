import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let currentFrame = 0;

vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => currentFrame,
  Sequence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Video: (props: React.VideoHTMLAttributes<HTMLVideoElement>) => React.createElement('video', props),
  OffthreadVideo: (props: React.VideoHTMLAttributes<HTMLVideoElement>) => React.createElement('video', props),
}));

vi.mock('../../components/editron/editor/version-7.0.0/contexts/rendering-context', () => ({
  useIsRendering: () => false,
  useAllOverlays: () => [],
}));

import { OverlayType, type ClipOverlay } from '../../components/editron/editor/version-7.0.0/types';
import { VideoLayerContent } from '../../components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content';

function renderAt(frame: number, overlay: ClipOverlay): string {
  currentFrame = frame;
  return renderToStaticMarkup(React.createElement(VideoLayerContent, { overlay }));
}

function clip(overrides: Partial<ClipOverlay> = {}): ClipOverlay {
  return {
    id: 1,
    type: OverlayType.VIDEO,
    content: 'https://example.com/clip.mp4',
    from: 0,
    durationInFrames: 101,
    left: 0,
    top: 0,
    width: 1080,
    height: 1920,
    row: 2,
    isDragging: false,
    rotation: 0,
    styles: { objectFit: 'cover' },
    ...overrides,
  };
}

describe('VideoLayerContent subject-aware reframing', () => {
  it('honors a persisted static object position', () => {
    const html = renderAt(0, clip({ styles: { objectFit: 'cover', objectPosition: '28% 44%' } }));
    expect(html).toContain('object-position:28% 44%');
  });

  it('interpolates the focal point from canonical keyframe tracks', () => {
    const overlay = clip({
      keyframeTracks: [
        {
          property: 'objectPositionX',
          keyframes: [
            { frame: 0, value: 20, easing: 'linear' },
            { frame: 100, value: 80, easing: 'linear' },
          ],
        },
        {
          property: 'objectPositionY',
          keyframes: [
            { frame: 0, value: 30, easing: 'linear' },
            { frame: 100, value: 70, easing: 'linear' },
          ],
        },
      ],
    });

    expect(renderAt(50, overlay)).toContain('object-position:50% 50%');
  });

  it('clamps focal tracks before they reach CSS', () => {
    const overlay = clip({
      keyframeTracks: [
        { property: 'objectPositionX', keyframes: [{ frame: 0, value: -25, easing: 'linear' }] },
        { property: 'objectPositionY', keyframes: [{ frame: 0, value: 140, easing: 'linear' }] },
      ],
    });

    expect(renderAt(0, overlay)).toContain('object-position:0% 100%');
  });
});
