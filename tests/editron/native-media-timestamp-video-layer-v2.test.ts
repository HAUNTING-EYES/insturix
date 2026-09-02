import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let currentFrame = 0;

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
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    pauseWhenLoading?: boolean;
    maxRetries?: number;
  }) => React.createElement('img', {
    ...props,
    src,
    'data-pause-when-loading': String(pauseWhenLoading),
    'data-max-retries': maxRetries,
  }),
  Video: (props: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
  OffthreadVideo: (props: React.VideoHTMLAttributes<HTMLVideoElement> & Record<string, unknown>) =>
    React.createElement('video', props),
}));

import { VideoLayerContent } from '../../components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content';
import { RenderingProvider } from '../../components/editron/editor/version-7.0.0/contexts/rendering-context';
import { Main } from '../../components/editron/editor/version-7.0.0/remotion/main';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
  type NativeMediaTimestampPreviewHydrationV1,
} from '../../components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-hydration-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2,
  type NativeMediaTimestampPreviewWindowV2,
} from '../../components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';
import {
  OverlayType,
  type ClipOverlay,
} from '../../components/editron/editor/version-7.0.0/types';

type RenderingProviderProps = React.ComponentProps<typeof RenderingProvider>;
const Provider = RenderingProvider as React.ComponentType<
  Omit<RenderingProviderProps, 'children'> & { children?: React.ReactNode }
>;

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HANDLE_A = `nmpv1_${'1'.repeat(64)}`;
const HANDLE_B = `nmpv1_${'2'.repeat(64)}`;

function clip(overrides: Partial<ClipOverlay> = {}): ClipOverlay {
  return {
    id: 1,
    type: OverlayType.VIDEO,
    content: 'https://example.com/interview.mp4',
    from: 100,
    durationInFrames: 4,
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

function previewWindow(
  overrides: Partial<NativeMediaTimestampPreviewWindowV2> = {},
): NativeMediaTimestampPreviewWindowV2 {
  return {
    schemaVersion: 2,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2,
    receiptSha256: HASH_A,
    decoderRequestSha256: HASH_B,
    projectId: 'project-1',
    sequenceId: 'sequence-1',
    overlayId: '1',
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    overlayFromFrame: 100,
    overlayDurationInFrames: 4,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 2,
    lease: {
      leaseId: `nmpwl2_${'3'.repeat(64)}`,
      issuedAtEpochMs: 1_000,
      renewAfterEpochMs: 2_000,
      expiresAtEpochMs: 3_000,
    },
    audioOwnership: {
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
      audioMappingSha256: HASH_A,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: [
      {
        localFrame: 0,
        projectFrame: 100,
        pictureHandle: HANDLE_A,
        decoderPictureRequestSha256: HASH_A,
        decodedPictureContentSha256: HASH_A,
      },
      {
        localFrame: 1,
        projectFrame: 101,
        pictureHandle: HANDLE_B,
        decoderPictureRequestSha256: HASH_B,
        decodedPictureContentSha256: HASH_B,
      },
    ],
    ...overrides,
  };
}

function v1Hydration(): NativeMediaTimestampPreviewHydrationV1 {
  return {
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
    receiptSha256: HASH_A,
    projectId: 'project-1',
    sequenceId: 'sequence-1',
    overlayId: '1',
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    overlayFromFrame: 100,
    overlayDurationInFrames: 4,
    audioOwnership: {
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
      audioMappingSha256: HASH_A,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: Array.from({ length: 4 }, (_, localFrame) => ({
      localFrame,
      projectFrame: 100 + localFrame,
      pictureHandle: localFrame % 2 === 0 ? HANDLE_A : HANDLE_B,
      decoderPictureRequestSha256: localFrame % 2 === 0 ? HASH_A : HASH_B,
      decodedPictureContentSha256: localFrame % 2 === 0 ? HASH_A : HASH_B,
    })),
  };
}

function renderWindow(input: Readonly<{
  overlay?: ClipOverlay;
  value?: NativeMediaTimestampPreviewWindowV2;
  hydration?: NativeMediaTimestampPreviewHydrationV1;
  isRendering?: boolean;
}> = {}): string {
  const overlay = input.overlay ?? clip();
  return renderToStaticMarkup(
    React.createElement(
      Provider,
      {
        isRendering: input.isRendering ?? false,
        overlays: [overlay],
        timestampPreviewHydrations: input.hydration ? [input.hydration] : [],
        timestampPreviewWindows: [input.value ?? previewWindow()],
      },
      React.createElement(VideoLayerContent, { overlay }),
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_500);
  currentFrame = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('native media timestamp rolling-window video-layer integration', () => {
  it('renders the exact current V2 picture without duplicating paired session audio', () => {
    currentFrame = 1;
    const html = renderWindow();

    expect(html).toContain(`src="/api/services/editron/media/timestamp-preview/${HANDLE_B}"`);
    expect(html).toContain(`data-editron-native-timestamp-picture="${HASH_B}"`);
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('src="https://example.com/interview.mp4"');
    expect(html).not.toContain('<video');
  });

  it('blocks unloaded seeks, expired leases, and changed live overlay scope', () => {
    currentFrame = 3;
    expect(() => renderWindow()).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_FRAME_NOT_LOADED');

    currentFrame = 1;
    vi.setSystemTime(3_000);
    expect(() => renderWindow()).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_EXPIRED');

    vi.setSystemTime(1_500);
    expect(() => renderWindow({ overlay: clip({ durationInFrames: 5 }) }))
      .toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_SCOPE_MISMATCH');
  });

  it('rejects competing V1 and V2 ownership for the same overlay', () => {
    expect(() => renderWindow({ hydration: v1Hydration() }))
      .toThrow('NATIVE_MEDIA_PREVIEW_VERSION_CONFLICT');
  });

  it('forbids both direct layer and Main final-render use of preview windows', () => {
    expect(() => renderWindow({ isRendering: true }))
      .toThrow('NATIVE_MEDIA_PREVIEW_FINAL_RENDER_FORBIDDEN');

    expect(() => renderToStaticMarkup(React.createElement(Main, {
      overlays: [],
      setSelectedOverlayId: () => undefined,
      selectedOverlayId: null,
      changeOverlay: () => undefined,
      durationInFrames: 4,
      fps: 30,
      width: 1920,
      height: 1080,
      isRendering: true,
      timestampPreviewWindows: [previewWindow()],
    }))).toThrow('Timestamp preview inputs are not a final-render media source');
  });
});
