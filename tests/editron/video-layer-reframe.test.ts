import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let currentFrame = 0;
let renderMediaMode: 'full' | 'audio-only' = 'full';

vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => currentFrame,
  Sequence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Audio: ({
    startFrom,
    playbackRate,
    volume: _volume,
    ...props
  }: React.AudioHTMLAttributes<HTMLAudioElement> & {
    startFrom?: number;
    playbackRate?: number;
    volume?: unknown;
  }) => React.createElement('audio', {
    ...props,
    'data-start-from': startFrom,
    'data-playback-rate': playbackRate,
  }),
  Video: ({
    startFrom: _startFrom,
    playbackRate: _playbackRate,
    pauseWhenBuffering: _pauseWhenBuffering,
    volume: _volume,
    ...props
  }: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
  OffthreadVideo: ({
    startFrom: _startFrom,
    playbackRate: _playbackRate,
    toneMapped: _toneMapped,
    volume: _volume,
    ...props
  }: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
}));

vi.mock('../../components/editron/editor/version-7.0.0/contexts/rendering-context', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIsRendering: () => false,
  useRenderMediaMode: () => renderMediaMode,
  useAllOverlays: () => [],
}));

import { OverlayType, type ClipOverlay } from '../../components/editron/editor/version-7.0.0/types';
import { resolveRenderLayerBehavior } from '../../components/editron/editor/version-7.0.0/contexts/rendering-context';
import { VideoLayerContent } from '../../components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content';

function renderAt(frame: number, overlay: ClipOverlay): string {
  currentFrame = frame;
  renderMediaMode = 'full';
  return renderToStaticMarkup(React.createElement(VideoLayerContent, { overlay }));
}

function renderAudioOnly(overlay: ClipOverlay): string {
  currentFrame = 0;
  renderMediaMode = 'audio-only';
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
  it('omits every non-audio layer from the audio evidence composition', () => {
    expect(resolveRenderLayerBehavior(OverlayType.VIDEO, 'audio-only')).toBe('audio-only');
    expect(resolveRenderLayerBehavior(OverlayType.SOUND, 'audio-only')).toBe('audio-only');
    expect(resolveRenderLayerBehavior(OverlayType.CAPTION, 'audio-only')).toBe('omit');
    expect(resolveRenderLayerBehavior(OverlayType.TRANSITION, 'audio-only')).toBe('omit');
    expect(resolveRenderLayerBehavior(OverlayType.MOTION_GRAPHIC, 'audio-only')).toBe('omit');
    expect(resolveRenderLayerBehavior(OverlayType.VIDEO, 'full')).toBe('full');
    expect(() => resolveRenderLayerBehavior(OverlayType.VIDEO, 'visual-only' as never))
      .toThrow('Unsupported Editron render media mode');
  });

  it('registers clip audio without mounting a video decoder for audio-only evidence', () => {
    const html = renderAudioOnly(clip({
      videoStartTime: 24,
      speed: 1.25,
      styles: { objectFit: 'cover', volume: 0.4 },
    }));

    expect(html).toContain('<audio');
    expect(html).toContain('src="https://example.com/clip.mp4"');
    expect(html).toContain('data-start-from="24"');
    expect(html).toContain('data-playback-rate="1.25"');
    expect(html).not.toContain('<video');
  });

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
