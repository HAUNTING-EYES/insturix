import { describe, expect, it } from 'vitest';

import {
  buildOverlayAtomicReceipt,
  overlayAtom,
} from '@/lib/editron/engine/atomic-overlay-core';
import { scoreRenderedFrameAesthetic } from '@/lib/editron/motion-graphics/engine/eval/rendered-aesthetic';
import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';
import { groupWordsIntoCaptions } from '@/lib/editron/utils/caption-utils';

const READABILITY = {
  version: 'caption-readability-policy-v1',
  renderMode: 'phrase',
  minGroupDurationMs: 1_000,
  groupWordsPerCaption: 4,
  maxCharsPerCaption: 30,
  maxGroupDurationMs: 1_900,
  maxMergeWords: 6,
  maxMergeChars: 38,
  maxMergedGroupDurationMs: 1_900,
  maxCaptionPreRollMs: 260,
  maxCaptionPostRollMs: 500,
  minCaptionGapMs: 80,
  speechPauseBoundaryMs: 500,
  punctuationClipBoundaryGapMs: 140,
};

describe('timeline range cut caption readability', () => {
  it.each([
    ['English phrase at the opening', 15, 53],
    ['Devanagari phrase inside a group', 158, 196],
  ])('resegments dense captions after removing %s', (_label, startFrame, endFrame) => {
    const words = fixtureWords();
    const caption = {
      id: 30,
      type: 'caption',
      from: 0,
      durationInFrames: 600,
      row: 4,
      words,
      captions: groupWordsIntoCaptions(words, {
        wordsPerGroup: 4,
        maxGroupDuration: 2_200,
        maxCharsPerLine: 42,
      }),
      metadata: {
        source: 'canonical-caption-track',
        evidence: { readability: READABILITY },
      },
    };

    const result = cutTimelineRange({
      overlays: [caption],
      startFrame,
      endFrame,
      fps: 30,
      durationInFrames: 600,
    });

    const repaired = result.overlays[0];
    expect(repaired.metadata.evidence.timelineReadabilityRepair).toMatchObject({
      version: 'caption-timeline-readability-repair-v1',
      beforeViolationCount: 1,
      afterViolationCount: 0,
    });
    expect(repaired.captions.every((groupValue: { startMs: number; endMs: number }) => (
      groupValue.endMs - groupValue.startMs >= 1_000
    ))).toBe(true);
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

function fixtureWords() {
  return [
    'pricing', 'is', 'simple',
    'the', 'pricing', 'model', 'matters', 'because', 'value', 'is', 'clear',
    'कीमत', 'आसान', 'है',
    'pricing', 'simple', 'hai',
    'this', 'is', 'the', 'key', 'point',
    'now', 'watch', 'this', 'keep', 'it', 'clear',
  ].map((value, index) => {
    const startFrame = 15 + (index * 13);
    return word(
      value,
      Math.round((startFrame / 30) * 1_000),
      Math.round(((startFrame + 12) / 30) * 1_000),
    );
  });
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
