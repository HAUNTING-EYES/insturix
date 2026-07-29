import { describe, expect, it } from 'vitest';

import {
  buildOverlayAtomicReceipt,
  overlayAtom,
} from '@/lib/editron/engine/atomic-overlay-core';
import { scoreRenderedFrameAesthetic } from '@/lib/editron/motion-graphics/engine/eval/rendered-aesthetic';
import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

const READABILITY = {
  version: 'caption-readability-policy-v1',
  renderMode: 'phrase',
  minGroupDurationMs: 1_000,
  maxMergeWords: 6,
  maxMergeChars: 38,
  maxMergedGroupDurationMs: 1_900,
  maxCaptionPreRollMs: 260,
  maxCaptionPostRollMs: 500,
  minCaptionGapMs: 80,
};

describe('timeline range cut caption readability', () => {
  it('reflows canonical caption groups after removing a spoken phrase', () => {
    const caption = {
      id: 30,
      type: 'caption',
      from: 0,
      durationInFrames: 300,
      row: 4,
      words: [
        word('keep', 0, 400),
        word('remove', 500, 900),
        word('this', 950, 1250),
        word('phrase', 1300, 1700),
        word('next', 1900, 2200),
        word('words', 2250, 2600),
      ],
      captions: [
        group('keep', 0, 400),
        group('remove this phrase', 500, 1700),
        group('next words', 1900, 2600),
      ],
      metadata: {
        source: 'canonical-caption-track',
        evidence: { readability: READABILITY },
      },
    };

    const result = cutTimelineRange({
      overlays: [caption],
      startFrame: 15,
      endFrame: 54,
      fps: 30,
      durationInFrames: 300,
    });

    const repaired = result.overlays[0];
    expect(repaired.captions).toHaveLength(1);
    expect(repaired.captions[0]).toMatchObject({
      text: 'keep next words',
      startMs: 0,
      endMs: 1300,
    });
    expect(repaired.metadata.evidence.timelineReadabilityRepair).toEqual({
      version: 'caption-timeline-readability-repair-v1',
      beforeGroupCount: 2,
      afterGroupCount: 1,
      beforeViolationCount: 2,
      afterViolationCount: 0,
    });
  });

  it('uses the canonical caption timing contract during rendered review', () => {
    const result = scoreCaptionTiming(['price', 'holds'], 30);

    expect(result.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'text does not stay long enough to read' }),
    ]));
  });

  it('still warns when a phrase caption is shorter than the canonical contract', () => {
    const result = scoreCaptionTiming(['far', 'too', 'many', 'words'], 12);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'text does not stay long enough to read' }),
    ]));
  });
});

function word(value: string, startMs: number, endMs: number) {
  return { word: value, startMs, endMs, confidence: 1 };
}

function group(text: string, startMs: number, endMs: number) {
  const values = text.split(' ');
  const duration = endMs - startMs;
  return {
    text,
    startMs,
    endMs,
    timestampMs: null,
    confidence: 1,
    words: values.map((value, index) => word(
      value,
      Math.round(startMs + (duration * index) / values.length),
      Math.round(startMs + (duration * (index + 1)) / values.length),
    )),
  };
}

function scoreCaptionTiming(words: string[], durationFrames: number) {
  const atoms = [
    overlayAtom('caption-mode', 'caption.mode', 'phrase', 1, 'decision-param'),
    overlayAtom('caption-words-per-group', 'caption.words_per_group', words.length, 1, 'decision-param'),
    overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', 2, 1, 'decision-param'),
    overlayAtom('font-size', 'text.font_size', '68', 1, 'decision-param'),
    overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
    overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
    ...words.map((value, index) => (
      overlayAtom('caption-word', `caption.word.${index}`, value, 1, 'transcript')
    )),
  ];
  const receipt = buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'keyword-caption',
    frame: 24,
    durationFrames,
    signals: { negative_space_bottom: 0.7 },
    atoms,
  });

  return scoreRenderedFrameAesthetic({
    width: 1080,
    height: 1920,
    fps: 30,
    image: { lumaStdDev: 10.5, alphaMean: 1 },
    overlays: [{
      id: 'caption-timing-contract',
      receipt,
      box: {
        x: 220,
        y: 1380,
        width: 640,
        height: 180,
        opacity: 1,
        visiblePixelRatio: 0.08,
        contrastRatio: 5.8,
        textPixelHeight: 68,
      },
    }],
  });
}
