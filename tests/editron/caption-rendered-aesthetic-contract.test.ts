import { describe, expect, it } from 'vitest';

import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
} from '@/lib/editron/engine/atomic-overlay-core';
import { scoreRenderedFrameAesthetic } from '@/lib/editron/motion-graphics/engine/eval/rendered-aesthetic';

const FRAME = {
  width: 1080,
  height: 1920,
  fps: 30,
  image: { lumaStdDev: 10.5, alphaMean: 1 },
};

describe('caption rendered aesthetic contract', () => {
  it('judges the visible subtitle row instead of unused row capacity', () => {
    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      overlays: [{
        id: 'readable-subtitle',
        receipt: captionReceipt({
          mode: 'subtitle',
          words: ['Now', 'my', 'best', 'advice', 'is'],
          rowCapacity: 6,
        }),
        box: readableCaptionBox(),
      }],
    });

    expect(result.issues.filter((issue) => issue.message.includes('caption row'))).toEqual([]);
  });

  it('still reports a genuinely overpacked visible caption row', () => {
    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      overlays: [{
        id: 'overpacked-caption',
        receipt: captionReceipt({
          mode: 'phrase',
          words: ['seven', 'visible', 'words', 'crammed', 'into', 'one', 'row'],
          rowCapacity: 7,
        }),
        box: readableCaptionBox(),
      }],
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'text',
        message: expect.stringContaining('caption row'),
      }),
    ]));
  });
});

function captionReceipt(input: {
  mode: string;
  words: string[];
  rowCapacity: number;
}) {
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('caption-mode', 'caption.mode', input.mode, 1, 'decision-param'),
    overlayAtom('caption-words-per-group', 'caption.words_per_group', input.words.length, 1, 'decision-param'),
    overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', input.rowCapacity, 1, 'decision-param'),
    overlayAtom('text-row-capacity', 'text.row_capacity', input.rowCapacity, 1, 'layout-analysis'),
    overlayAtom('text-target-row-count', 'text.target_row_count', 1, 1, 'layout-analysis'),
    overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
    overlayAtom('font-size', 'text.font_size', '68', 1, 'decision-param'),
    overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
    overlayAtom('background-color', 'style.background_color', '#111111', 1, 'decision-param'),
    overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'derived-signal'),
  ];
  input.words.forEach((word, index) => {
    atoms.push(overlayAtom('caption-word', `caption.word.${index}`, word, 1, 'transcript'));
    atoms.push(overlayAtom('glyph-line-index', `caption.word.${index}.line_index`, 0, 1, 'layout-analysis'));
  });

  return buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'caption-readability-proof',
    frame: 24,
    durationFrames: 90,
    atoms,
  });
}

function readableCaptionBox() {
  return {
    x: 160,
    y: 1380,
    width: 760,
    height: 180,
    opacity: 1,
    visiblePixelRatio: 0.08,
    contrastRatio: 7,
    textPixelHeight: 68,
  };
}
