import { describe, expect, it } from 'vitest';

import { CANONICAL_CAPTION_TRACK_SOURCE } from '@/lib/editron/services/canonical-caption-track';
import { planChatCanonicalCaptionTrack } from '@/lib/editron/services/chat-canonical-caption-adapter';
import {
  EDITRON_CAPTION_SAFE_BOTTOM_MARGIN,
  EDITRON_CAPTION_SAFE_TOP_MARGIN,
} from '@/lib/editron/shared/overlay-safe-zone-contract';

const words = [
  { word: 'Make', startMs: 200, endMs: 460 },
  { word: 'this', startMs: 500, endMs: 720 },
  { word: 'easy', startMs: 760, endMs: 1040 },
  { word: 'to', startMs: 1100, endMs: 1240 },
  { word: 'read', startMs: 1280, endMs: 1560 },
];

function project(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    projectId: 'caption-project',
    fps: 30,
    durationInFrames: 180,
    playerDimensions: { width: 1920, height: 1080 },
    overlays: [
      {
        id: 1,
        type: 'video',
        assetId: 'asset-1',
        from: 0,
        durationInFrames: 180,
        sourceStartFrame: 0,
        row: 1,
      },
    ],
    rawFootageAnalysis: {
      timelineCoordinateSpace: 'canonical-edited-v1',
      originalDurationMs: 6000,
      transcription: { words },
    },
    genreParametersSignalComputed: {
      formality: 0.4,
      energy_baseline: 0.65,
      pacing_tolerance: 7,
    },
    ...overrides,
  };
}

describe('chat canonical caption adapter', () => {
  it('creates one canonical track inside the shared title-safe region', () => {
    const result = planChatCanonicalCaptionTrack(project(), {
      requestedStyle: 'bold',
      displayMode: 'phrase',
      wordsPerGroup: 4,
    });

    expect(result.status).toBe('generated');
    if (result.status !== 'generated') return;

    const captions = result.overlays.filter((overlay) => overlay.type === 'caption');
    expect(captions).toHaveLength(1);
    expect(result.captionOverlay.metadata?.source).toBe(CANONICAL_CAPTION_TRACK_SOURCE);
    expect(result.result).toMatchObject({ created: 1, removedGenerated: 0, wordCount: 5 });
    const centerY = (
      Number(result.captionOverlay.top)
      + (Number(result.captionOverlay.height) / 2)
    ) / 1080;
    expect(centerY).toBeGreaterThanOrEqual(EDITRON_CAPTION_SAFE_TOP_MARGIN);
    expect(centerY).toBeLessThanOrEqual(1 - EDITRON_CAPTION_SAFE_BOTTOM_MARGIN);
  });

  it('protects an unmarked existing caption track as manual work', () => {
    const result = planChatCanonicalCaptionTrack(project({
      overlays: [
        ...project().overlays,
        {
          id: 2,
          type: 'caption',
          from: 0,
          durationInFrames: 90,
          captions: [],
        },
      ],
    }), { overwrite: true });

    expect(result).toMatchObject({
      status: 'needs-choice',
      reason: 'manual-caption-track-present',
    });
  });

  it('regenerates a legacy generated track atomically in the returned plan', () => {
    const result = planChatCanonicalCaptionTrack(project({
      overlays: [
        ...project().overlays,
        {
          id: 2,
          type: 'caption',
          sourceVideoId: 1,
          from: 0,
          durationInFrames: 180,
          captions: [],
        },
      ],
    }), { overwrite: true });

    expect(result.status).toBe('generated');
    if (result.status !== 'generated') return;
    expect(result.result.removedGenerated).toBe(1);
    expect(result.overlays.filter((overlay) => overlay.type === 'caption')).toHaveLength(1);
    expect(result.captionOverlay.sourceVideoId).toBeUndefined();
    expect(result.captionOverlay.metadata?.source).toBe(CANONICAL_CAPTION_TRACK_SOURCE);
  });

  it('returns a no-op when a generated track already exists without overwrite', () => {
    const result = planChatCanonicalCaptionTrack(project({
      overlays: [
        ...project().overlays,
        {
          id: 2,
          type: 'caption',
          from: 0,
          durationInFrames: 180,
          metadata: { source: CANONICAL_CAPTION_TRACK_SOURCE },
        },
      ],
    }), {});

    expect(result).toMatchObject({
      status: 'no-op',
      reason: 'canonical-track-already-present',
    });
  });

  it('declines when canonical word timings are unavailable', () => {
    const result = planChatCanonicalCaptionTrack(project({
      rawFootageAnalysis: {
        timelineCoordinateSpace: 'canonical-edited-v1',
        transcription: { words: [] },
      },
    }), {});

    expect(result).toMatchObject({
      status: 'declined',
      reason: 'canonical-transcript-unavailable',
    });
  });

  it('declines a multi-clip timeline with incomplete source mapping', () => {
    const result = planChatCanonicalCaptionTrack(project({
      overlays: [
        {
          id: 1,
          type: 'video',
          assetId: 'asset-1',
          from: 0,
          durationInFrames: 90,
          sourceStartFrame: 0,
        },
        {
          id: 2,
          type: 'video',
          assetId: 'asset-2',
          from: 90,
          durationInFrames: 90,
        },
      ],
      rawFootageAnalysis: {
        originalDurationMs: 6000,
        transcription: { words },
      },
    }), {});

    expect(result).toMatchObject({
      status: 'declined',
      reason: 'unsafe-source-mapping',
    });
  });
});
