import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let currentFrame = 0;
let lastImageOnError: (() => void) | null = null;

vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => currentFrame,
  Sequence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
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
  Img: ({
    src,
    pauseWhenLoading,
    maxRetries,
    onError,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    pauseWhenLoading?: boolean;
    maxRetries?: number;
  }) => {
    lastImageOnError = () => onError?.({} as React.SyntheticEvent<HTMLImageElement>);
    return React.createElement('img', {
      ...props,
      src,
      'data-pause-when-loading': String(pauseWhenLoading),
      'data-max-retries': maxRetries,
    });
  },
  Video: (props: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
  OffthreadVideo: (props: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
}));

import {
  RenderingProvider,
  type RenderMediaMode,
} from '../../components/editron/editor/version-7.0.0/contexts/rendering-context';
import { VideoLayerContent } from '../../components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
  type NativeMediaTimestampPreviewHydrationV1,
} from '../../components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-hydration-v1';
import {
  OverlayType,
  type ClipOverlay,
} from '../../components/editron/editor/version-7.0.0/types';

type RenderingProviderProps = React.ComponentProps<typeof RenderingProvider>;
const RenderingProviderWithPositionalChildren = RenderingProvider as React.ComponentType<
  Omit<RenderingProviderProps, 'children'> & { children?: React.ReactNode }
>;

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const HANDLE_A = `nmpv1_${'1'.repeat(64)}`;
const HANDLE_B = `nmpv1_${'2'.repeat(64)}`;

function clip(overrides: Partial<ClipOverlay> = {}): ClipOverlay {
  return {
    id: 1,
    type: OverlayType.VIDEO,
    content: 'https://example.com/interview.mp4',
    from: 100,
    durationInFrames: 2,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    row: 2,
    isDragging: false,
    rotation: 0,
    sourceStartFrame: 24,
    styles: { objectFit: 'cover', volume: 0.6 },
    ...overrides,
  };
}

function hydration(
  disposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED',
): NativeMediaTimestampPreviewHydrationV1 {
  return {
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
    receiptSha256: SHA_A,
    projectId: 'project-1',
    sequenceId: 'sequence-1',
    overlayId: '1',
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    overlayFromFrame: 100,
    overlayDurationInFrames: 2,
    audioOwnership: {
      disposition,
      audioMappingSha256: disposition === 'EXACT_SAMPLE_MAPPING_BOUND' ? SHA_B : null,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: [
      {
        localFrame: 0,
        projectFrame: 100,
        pictureHandle: HANDLE_A,
        decoderPictureRequestSha256: SHA_A,
        decodedPictureContentSha256: SHA_A,
      },
      {
        localFrame: 1,
        projectFrame: 101,
        pictureHandle: HANDLE_B,
        decoderPictureRequestSha256: SHA_B,
        decodedPictureContentSha256: SHA_B,
      },
    ],
  };
}

function renderHydrated(input: Readonly<{
  overlay?: ClipOverlay;
  value?: NativeMediaTimestampPreviewHydrationV1;
  isRendering?: boolean;
  mediaMode?: RenderMediaMode;
}> = {}): string {
  const overlay = input.overlay ?? clip();
  const value = input.value ?? hydration('EXACT_SAMPLE_MAPPING_BOUND');
  return renderToStaticMarkup(
    React.createElement(
      RenderingProviderWithPositionalChildren,
      {
        isRendering: input.isRendering ?? false,
        mediaMode: input.mediaMode ?? 'full',
        overlays: [overlay],
        timestampPreviewHydrations: [value],
      },
      React.createElement(VideoLayerContent, { overlay }),
    ),
  );
}

beforeEach(() => {
  currentFrame = 0;
  lastImageOnError = null;
});

describe('native media timestamp picture video-layer integration', () => {
  it('renders the exact private picture while the native source remains the audio owner', () => {
    currentFrame = 1;
    const html = renderHydrated();

    expect(html).toContain('<img');
    expect(html).toContain(`src="/api/services/editron/media/timestamp-preview/${HANDLE_B}"`);
    expect(html).toContain(`data-editron-native-timestamp-picture="${SHA_B}"`);
    expect(html).toContain('data-pause-when-loading="true"');
    expect(html).toContain('data-max-retries="2"');
    expect(html).toContain('<audio');
    expect(html).toContain('src="https://example.com/interview.mp4"');
    expect(html).toContain('data-start-from="24"');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('Video not available');

    expect(() => lastImageOnError?.()).toThrow('NATIVE_MEDIA_PREVIEW_PICTURE_LOAD_FAILED');
  });

  it('renders an explicitly no-audio picture without inventing an audio stream', () => {
    const html = renderHydrated({
      overlay: clip({ content: '' }),
      value: hydration('NO_AUDIO_MAPPING_REQUESTED'),
    });

    expect(html).toContain('<img');
    expect(html).toContain(`src="/api/services/editron/media/timestamp-preview/${HANDLE_A}"`);
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('Video not available');
  });

  it('emits no media in audio-only mode when the receipt requested no audio mapping', () => {
    expect(renderHydrated({
      value: hydration('NO_AUDIO_MAPPING_REQUESTED'),
      mediaMode: 'audio-only',
    })).toBe('');
  });

  it('blocks a hydration whose frame scope no longer matches the live overlay', () => {
    expect(() => renderHydrated({ overlay: clip({ from: 101 }) }))
      .toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_SCOPE_MISMATCH');
  });

  it('blocks direct final-render use of the expiring authenticated preview surface', () => {
    expect(() => renderHydrated({ isRendering: true }))
      .toThrow('NATIVE_MEDIA_PREVIEW_FINAL_RENDER_FORBIDDEN');
  });

  it('blocks mapped audio when the native source is absent', () => {
    expect(() => renderHydrated({ overlay: clip({ content: '' }) }))
      .toThrow('NATIVE_MEDIA_PREVIEW_NATIVE_AUDIO_SOURCE_MISSING');
  });
});
