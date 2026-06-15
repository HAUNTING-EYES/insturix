import { describe, expect, it } from 'vitest';
import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import {
  CANONICAL_CAPTION_TRACK_SOURCE,
  installCanonicalCaptionTrack,
} from '@/lib/editron/services/canonical-caption-track';
import type { EditedTimelineContext } from '@/lib/editron/services/edited-timeline-context';
import { resolveAtomicCaptionPresentation, type AtomicCaptionPresentation } from '@/lib/editron/services/caption-form';

const presentation: AtomicCaptionPresentation = {
  version: 'atomic-caption-form-v1',
  style: 'bold',
  displayMode: 'phrase',
  wordsPerGroup: 4,
  source: 'signals',
  signals: {
    formality: 0.35,
    energy: 0.72,
    speakingRate: 168,
  },
  aesthetic: {
    layout: 'balanced-lower',
    surface: 'transparent-shadow',
    widthFraction: 0.68,
    maxWidthPx: 1040,
    heightFraction: 0.105,
    minHeightPx: 92,
    maxHeightPx: 130,
    bottomMarginFraction: 0.115,
    fontSizePx: 40,
    lineHeight: 1.1,
    emphasisScale: 1.08,
    shadowStrength: 0.88,
  },
};

function context(words = ['this', 'is', 'finally', 'canonical', 'captioning']): EditedTimelineContext {
  return {
    version: 'edited-timeline-context-v1',
    fps: 30,
    durationFrames: 180,
    durationMs: 6000,
    sourceClips: [
      { from: 0, durationInFrames: 90, sourceStartFrame: 300 },
      { from: 90, durationInFrames: 90, sourceStartFrame: 900 },
    ],
    transcription: words.map((word, index) => ({
      word,
      startMs: 300 + index * 360,
      endMs: 560 + index * 360,
      originalStartMs: 10_000 + index * 360,
      originalEndMs: 10_260 + index * 360,
    })),
    sourceRawFootage: {} as any,
    editedRawFootage: {} as any,
    evidence: {
      hasSourceMapping: true,
      isCanonicalDecisionTimeline: true,
      requiresSourceMapping: true,
      inputClipCount: 2,
      mappedClipCount: 2,
      missingSourceMappingCount: 0,
      inputWordCount: words.length,
      keptWordCount: words.length,
      droppedWordCount: 0,
      clipCount: 2,
    },
  };
}

describe('canonical caption track', () => {
  it('creates one final-timeline caption track from canonical transcript words', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 90, sourceStartFrame: 300 },
      { id: 11, type: 'video', from: 90, durationInFrames: 90, sourceStartFrame: 900 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context(),
      playerDimensions: { width: 1920, height: 1080 },
      presentation,
    });

    expect(result).toMatchObject({ created: 1, removedGenerated: 0, wordCount: 5 });
    const captions = overlays.filter((overlay) => overlay.type === OverlayType.CAPTION);
    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatchObject({
      from: 0,
      durationInFrames: 180,
      row: 4,
      position: 'custom',
      template: 'bold',
    });
    expect(captions[0].sourceVideoId).toBeUndefined();
    expect(captions[0].metadata.source).toBe(CANONICAL_CAPTION_TRACK_SOURCE);
    expect(captions[0].metadata.timeline).toBe('cut');
    expect(captions[0].metadata.calibration.status).toBe('invented-needs-calibration');
    expect(captions[0].metadata.calibration.fields).toContain('aestheticResolver');
    expect(captions[0].captions.map((caption: any) => caption.text).join(' ')).toContain('finally canonical');
  });

  it('uses signal-resolved caption aesthetics instead of a fixed full-width band', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    const resolved = resolveAtomicCaptionPresentation({
      requestedStyle: 'word_by_word',
      genreParams: {
        formality: 0.7,
        energy_baseline: 0.45,
        pacing_tolerance: 8,
      },
    });

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context(['Hank', 'is', 'explaining', 'the', 'whole', 'thing']),
      playerDimensions: { width: 1920, height: 1080 },
      presentation: resolved,
    });

    expect(result.created).toBe(1);
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.displayConfig).toMatchObject({ mode: 'karaoke', wordsPerGroup: 6 });
    expect(caption.width).toBe(1280);
    expect(caption.height).toBeLessThanOrEqual(150);
    expect(caption.top).toBeGreaterThan(800);
    expect(caption.styles).toMatchObject({
      backgroundColor: 'rgba(0,0,0,0.74)',
      fontSize: '34px',
      lineHeight: 1.26,
    });
    expect(caption.metadata.evidence.captionAesthetic).toMatchObject({
      layout: 'subtitle-lower',
      surface: 'subtitle-panel',
    });
    expect(caption.metadata.evidence.readability).toMatchObject({
      version: 'caption-readability-policy-v1',
      maxWordsPerLine: 6,
      maxCharsPerCaption: 38,
      contrastFloor: 4.5,
      status: 'invented-needs-calibration',
    });
  });

  it('keeps high-energy fancy captions expressive while enforcing readable grouping and contrast', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 240, sourceStartFrame: 300 },
    ];
    const resolved = resolveAtomicCaptionPresentation({
      requestedStyle: 'fancy',
      genreParams: {
        formality: 0.26,
        energy_baseline: 0.88,
        pacing_tolerance: 4,
      },
    });

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context(['this', 'completely', 'changed', 'everything', 'for', 'creators']),
      playerDimensions: { width: 1920, height: 1080 },
      presentation: resolved,
    });

    expect(result.created).toBe(1);
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.template).toBe('hormozi');
    expect(caption.displayConfig).toMatchObject({
      mode: 'hormozi',
      wordsPerGroup: 3,
      maxWordsPerLine: 2,
      useSpringScale: true,
    });
    expect(caption.styles).toMatchObject({
      backgroundColor: 'rgba(0,0,0,0.42)',
      backdropFilter: 'blur(2px)',
      padding: '8px 14px',
      highlight: expect.objectContaining({
        backgroundColor: 'rgba(0,0,0,0.84)',
        animation: 'bounce',
        effect: 'pop',
      }),
    });
    expect(caption.captions.every((item: any) => item.text.length <= 22)).toBe(true);
    expect(caption.metadata.evidence.readability).toMatchObject({
      wordsPerGroup: 3,
      maxWordsPerLine: 2,
      maxCharsPerCaption: 22,
      maxGroupDurationMs: 1450,
      contrastFloor: 4.5,
    });
  });

  it('moves global captions out of protected bottom text-occupancy regions', () => {
    const overlays: any[] = [
      {
        id: 10,
        type: 'video',
        from: 0,
        durationInFrames: 180,
        sourceStartFrame: 300,
        metadata: {
          atomicOverlayReceipt: {
            placementHints: {
              avoid: [{
                reason: 'text-occupancy',
                x: 0.12,
                y: 0.62,
                width: 0.76,
                height: 0.28,
                strength: 0.9,
              }],
            },
          },
        },
      },
    ];
    const resolved = resolveAtomicCaptionPresentation({
      requestedStyle: 'word_by_word',
      genreParams: {
        formality: 0.7,
        energy_baseline: 0.45,
        pacing_tolerance: 8,
      },
    });

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context(['Hank', 'is', 'explaining', 'the', 'whole', 'thing']),
      playerDimensions: { width: 1920, height: 1080 },
      presentation: resolved,
    });

    expect(result.created).toBe(1);
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.top).toBeLessThan(240);
    expect(caption.metadata.evidence).toMatchObject({
      protectedRegionCount: 1,
      selectedRegion: 'top-center',
    });
  });

  it('replaces old generated per-video captions but keeps manual captions', () => {
    const overlays: any[] = [
      { id: 1, type: 'caption', sourceVideoId: 10, captions: [{ text: 'old' }] },
      { id: 2, type: 'caption', metadata: { source: CANONICAL_CAPTION_TRACK_SOURCE }, captions: [{ text: 'old canonical' }] },
      { id: 3, type: 'caption', metadata: { userEdited: true }, captions: [{ text: 'manual' }] },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context(),
      playerDimensions: { width: 1920, height: 1080 },
      presentation,
    });

    expect(result).toMatchObject({
      created: 0,
      removedGenerated: 2,
      skippedReason: 'manual-captions-present',
    });
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe(3);
  });

  it('skips cleanly when the edited timeline has no speech words', () => {
    const overlays: any[] = [];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: context([]),
      playerDimensions: { width: 1920, height: 1080 },
      presentation,
    });

    expect(result).toMatchObject({
      created: 0,
      removedGenerated: 0,
      skippedReason: 'no-words',
      wordCount: 0,
    });
    expect(overlays).toHaveLength(0);
  });
});
