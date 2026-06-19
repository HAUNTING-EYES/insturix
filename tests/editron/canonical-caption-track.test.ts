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

  it('splits caption text at edited clip boundaries only when the speech gap is readable', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 90, sourceStartFrame: 300 },
      { id: 11, type: 'video', from: 90, durationInFrames: 90, sourceStartFrame: 900 },
    ];
    const editedContext = context(['before', 'cut', 'after', 'lands']);
    editedContext.transcription = [
      { word: 'before', startMs: 2500, endMs: 2680, originalStartMs: 10_000, originalEndMs: 10_180 },
      { word: 'cut', startMs: 2720, endMs: 2900, originalStartMs: 10_220, originalEndMs: 10_400 },
      { word: 'after', startMs: 3320, endMs: 3500, originalStartMs: 20_000, originalEndMs: 20_180 },
      { word: 'lands', startMs: 3540, endMs: 3720, originalStartMs: 20_220, originalEndMs: 20_400 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: {
        ...presentation,
        wordsPerGroup: 8,
      },
    });

    expect(result).toMatchObject({ created: 1, captionCount: 2 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.captions.map((item: any) => item.text)).toEqual(['before cut', 'after lands']);
    expect(caption.captions[0].endMs).toBeLessThan(3000);
    expect(caption.captions[1].startMs).toBeGreaterThanOrEqual(3000);
    expect(caption.metadata.evidence.clipBoundaryCount).toBe(1);
  });

  it('does not create unreadable caption flashes just because speech crosses a cut', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 90, sourceStartFrame: 300 },
      { id: 11, type: 'video', from: 90, durationInFrames: 90, sourceStartFrame: 900 },
    ];
    const editedContext = context(['before', 'cut', 'after', 'lands']);
    editedContext.transcription = [
      { word: 'before', startMs: 2500, endMs: 2680, originalStartMs: 10_000, originalEndMs: 10_180 },
      { word: 'cut', startMs: 2720, endMs: 2960, originalStartMs: 10_220, originalEndMs: 10_460 },
      { word: 'after', startMs: 3020, endMs: 3220, originalStartMs: 20_000, originalEndMs: 20_200 },
      { word: 'lands', startMs: 3260, endMs: 3480, originalStartMs: 20_240, originalEndMs: 20_460 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: {
        ...presentation,
        wordsPerGroup: 8,
      },
    });

    expect(result).toMatchObject({ created: 1, captionCount: 1 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.captions.map((item: any) => item.text)).toEqual(['before cut after lands']);
    expect(caption.metadata.evidence.clipBoundaryCount).toBe(0);
  });

  it('merges subsecond punctuation groups into readable caption windows', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    const editedContext = context(['And', 'yeah,', 'we', 'keep', 'going']);
    editedContext.sourceClips = [
      { from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    editedContext.transcription = [
      { word: 'And', startMs: 120, endMs: 210, originalStartMs: 10_000, originalEndMs: 10_090 },
      { word: 'yeah,', startMs: 230, endMs: 360, originalStartMs: 10_110, originalEndMs: 10_240 },
      { word: 'we', startMs: 390, endMs: 510, originalStartMs: 10_270, originalEndMs: 10_390 },
      { word: 'keep', startMs: 540, endMs: 700, originalStartMs: 10_420, originalEndMs: 10_580 },
      { word: 'going', startMs: 730, endMs: 930, originalStartMs: 10_610, originalEndMs: 10_810 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: {
        ...presentation,
        wordsPerGroup: 8,
      },
    });

    expect(result).toMatchObject({ created: 1, captionCount: 1 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.captions.map((item: any) => item.text)).toEqual(['And yeah, we keep going']);
    expect(caption.captions[0].endMs - caption.captions[0].startMs).toBeGreaterThanOrEqual(700);
  });

  it('pads short standalone caption groups into nearby silence without crossing the next segment', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    const editedContext = context(['Yes.', 'Then', 'continue']);
    editedContext.sourceClips = [
      { from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    editedContext.transcription = [
      { word: 'Yes.', startMs: 1000, endMs: 1120, originalStartMs: 10_000, originalEndMs: 10_120 },
      { word: 'Then', startMs: 1500, endMs: 1680, originalStartMs: 10_500, originalEndMs: 10_680 },
      { word: 'continue', startMs: 1720, endMs: 1940, originalStartMs: 10_720, originalEndMs: 10_940 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: {
        ...presentation,
        wordsPerGroup: 8,
      },
    });

    expect(result).toMatchObject({ created: 1, captionCount: 2 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.captions[0].text).toBe('Yes.');
    expect(caption.captions[0].startMs).toBeLessThan(1000);
    expect(caption.captions[0].endMs).toBeLessThanOrEqual(1420);
    expect(caption.captions[0].endMs - caption.captions[0].startMs).toBeGreaterThanOrEqual(560);
  });

  it('splits caption groups at speech-pause moment boundaries inside a long clip', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    const editedContext = context(['setup', 'point', 'new', 'thought']);
    editedContext.sourceClips = [
      { from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    editedContext.transcription = [
      { word: 'setup', startMs: 300, endMs: 520, originalStartMs: 10_000, originalEndMs: 10_220 },
      { word: 'point', startMs: 560, endMs: 780, originalStartMs: 10_260, originalEndMs: 10_480 },
      { word: 'new', startMs: 1550, endMs: 1740, originalStartMs: 11_250, originalEndMs: 11_440 },
      { word: 'thought', startMs: 1780, endMs: 2020, originalStartMs: 11_480, originalEndMs: 11_720 },
    ];

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: {
        ...presentation,
        wordsPerGroup: 8,
      },
    });

    expect(result).toMatchObject({ created: 1, captionCount: 2 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.captions.map((item: any) => item.text)).toEqual(['setup point', 'new thought']);
    expect(caption.metadata.evidence).toMatchObject({
      captionBoundaryCount: 1,
      clipBoundaryCount: 0,
      speechPauseBoundaryCount: 1,
      speechPauseBoundaryMs: 380,
    });
    expect(caption.metadata.evidence.calibration).toBeUndefined();
    expect(caption.metadata.calibration.fields).toContain('maxGroupDurationMs');
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
    expect(caption.displayConfig).toMatchObject({ mode: 'phrase', wordsPerGroup: 1, maxWordsPerLine: 4 });
    expect(caption.width).toBe(1120);
    expect(caption.height).toBeLessThanOrEqual(150);
    expect(caption.top).toBeGreaterThan(800);
    expect(caption.styles).toMatchObject({
      backgroundColor: 'rgba(0,0,0,0.88)',
      fontSize: '38px',
      lineHeight: 1.26,
      backdropFilter: 'blur(3px)',
      highlight: expect.objectContaining({
        backgroundColor: 'rgba(0,0,0,0.82)',
      }),
    });
    expect(caption.metadata.evidence.captionAesthetic).toMatchObject({
      layout: 'subtitle-lower',
      surface: 'subtitle-panel',
    });
    expect(caption.metadata.evidence.readability).toMatchObject({
      version: 'caption-readability-policy-v1',
      sourceMode: 'karaoke',
      renderMode: 'phrase',
      maxWordsPerLine: 4,
      maxCharsPerCaption: 84,
      groupWordsPerCaption: 14,
      contrastFloor: 4.5,
      status: 'invented-needs-calibration',
    });
  });

  it('separates karaoke caption timing windows from the visible word window', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 240, sourceStartFrame: 300 },
    ];
    const resolved = resolveAtomicCaptionPresentation({
      requestedStyle: 'word_by_word',
      genreParams: {
        formality: 0.7,
        energy_baseline: 0.45,
        pacing_tolerance: 8,
      },
    });
    const editedContext = context(['But', 'I', 'wanna', 'make', 'a', 'hypothesis', 'here', 'that', 'allows', 'me']);
    editedContext.sourceClips = [
      { from: 0, durationInFrames: 240, sourceStartFrame: 300 },
    ];
    editedContext.transcription = editedContext.transcription.map((word, index) => ({
      ...word,
      startMs: 1000 + index * 170,
      endMs: 1120 + index * 170,
    }));

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: resolved,
    });

    expect(result.created).toBe(1);
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.displayConfig).toMatchObject({
      mode: 'phrase',
      wordsPerGroup: 1,
      maxWordsPerLine: 4,
    });
    expect(caption.captions).toHaveLength(1);
    expect(caption.captions[0].words).toHaveLength(10);
    expect(caption.captions[0].words.length).toBeGreaterThan(caption.displayConfig.wordsPerGroup);
    expect(caption.metadata.evidence).toMatchObject({
      sourceDisplayMode: 'karaoke',
      renderDisplayMode: 'phrase',
    });
    expect(caption.metadata.evidence.readability).toMatchObject({
      sourceMode: 'karaoke',
      renderMode: 'phrase',
      wordsPerGroup: 1,
      groupWordsPerCaption: 14,
      maxWordsPerLine: 4,
    });
  });

  it('absorbs terminal one-word flashes into karaoke timing windows', () => {
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
    const editedContext = context(['what', 'we', 'are', 'looking', 'at', 'down', 'in', 'the', 'comments', 'is', 'selection', 'bias.']);
    editedContext.sourceClips = [
      { from: 0, durationInFrames: 180, sourceStartFrame: 300 },
    ];
    editedContext.durationFrames = 180;
    editedContext.durationMs = 6000;
    editedContext.transcription = editedContext.transcription.map((word, index) => ({
      ...word,
      startMs: index === 11 ? 3920 : 1000 + index * 260,
      endMs: index === 11 ? 4180 : 1160 + index * 260,
    }));

    const result = installCanonicalCaptionTrack({
      overlays,
      editedTimelineContext: editedContext,
      playerDimensions: { width: 1920, height: 1080 },
      presentation: resolved,
    });

    expect(result.created).toBe(1);
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION);
    expect(caption.displayConfig).toMatchObject({ mode: 'phrase', wordsPerGroup: 1 });
    expect(caption.captions).toHaveLength(1);
    expect(caption.captions[0].text).toContain('selection bias.');
    expect(caption.captions[0].words).toHaveLength(12);
    expect(caption.metadata.evidence.readability.maxMergedGroupDurationMs).toBeGreaterThanOrEqual(5200);
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
      backgroundColor: 'rgba(0,0,0,0.56)',
      backdropFilter: 'blur(3px)',
      padding: '8px 14px',
      highlight: expect.objectContaining({
        backgroundColor: 'rgba(0,0,0,0.88)',
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

  it('keeps global captions in the lower lane when only video context reports bottom text occupancy', () => {
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
    expect(caption.top).toBeGreaterThan(800);
    expect(caption.metadata.evidence).toMatchObject({
      protectedRegionCount: 0,
      selectedRegion: 'bottom-center',
    });
  });

  it('moves global captions out of protected bottom regions from concrete overlays', () => {
    const overlays: any[] = [
      { id: 10, type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 300 },
      {
        id: 11,
        type: 'motion-graphic',
        from: 0,
        durationInFrames: 180,
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
    expect(caption.top).toBeGreaterThanOrEqual(129);
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
