import { describe, expect, it } from 'vitest';
import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
  type AtomicOverlayReceipt,
} from '../../lib/editron/engine/atomic-overlay-core';
import {
  scoreAtomicOverlayAesthetic,
  scoreAtomicOverlayAestheticTimeline,
} from '../../lib/editron/engine/atomic-overlay-aesthetic';
import { resolveAtomicTransitionForm } from '../../lib/editron/services/transition-form';
import { resolveAtomicZoomForm } from '../../lib/editron/services/zoom-form';

describe('atomic overlay aesthetic scoring', () => {
  it('passes a theme-aware caption block with compact row shape and accent roles', () => {
    const receipt = captionReceipt({
      words: ['this', 'one', 'idea', 'changed', 'my', 'life'],
      maxWordsPerLine: 3,
      emphasized: [1, 5],
      signals: {
        speech_energy: 0.92,
        emotional_arousal: 0.84,
        visual_complexity: 0.18,
        negative_space_bottom: 0.72,
      },
    });

    const result = scoreAtomicOverlayAesthetic({ receipt });

    expect(result.status).toBe('pass');
    expect(result.score).toBeGreaterThanOrEqual(0.86);
    expect(result.issues.filter((issue) => issue.dimension === 'text')).toHaveLength(0);
  });

  it('fails dense one-row captions that would read like a subtitle slab', () => {
    const receipt = captionReceipt({
      words: ['this', 'is', 'the', 'one', 'thing', 'that', 'changed', 'everything', 'forever'],
      maxWordsPerLine: 9,
      emphasized: [3],
      signals: {
        visual_complexity: 0.72,
        text_coverage: 0.4,
      },
    });

    const result = scoreAtomicOverlayAesthetic({ receipt });

    expect(result.status).toBe('fail');
    expect(result.subscores.text).toBeLessThan(0.8);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'text', message: expect.stringContaining('row is too wide') }),
      expect.objectContaining({ dimension: 'text', message: expect.stringContaining('compressed into one row') }),
    ]));
  });

  it('fails an overlay placed directly in a V-JEPA avoid region', () => {
    const receipt = buildOverlayAtomicReceipt({
      family: 'motion-graphic',
      intent: 'keyword-emphasis',
      frame: 48,
      durationFrames: 24,
      signals: {
        face_present: true,
        visual_eye_contact: true,
        main_subject_x: 0.5,
        main_subject_y: 0.42,
        main_subject_width: 0.34,
        main_subject_height: 0.5,
        visual_complexity: 0.82,
        text_coverage: 0.18,
      },
      target: {
        x: 760,
        y: 330,
        width: 420,
        height: 180,
      },
      atoms: [
        overlayAtom('text-content', 'content.text', 'BIG CLAIM', 1, 'transcript'),
        overlayAtom('font-size', 'text.font_size', '84', 1, 'decision-param'),
        overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      ],
    });

    const result = scoreAtomicOverlayAesthetic({ receipt });

    expect(receipt.form.placement.region).toBe('middle-center');
    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'placement', severity: 'fail' }),
    ]));
  });

  it('catches aggressive zoom and transition forms on visually busy frames', () => {
    const zoomReceipt = buildOverlayAtomicReceipt({
      family: 'zoom',
      intent: 'emphasis-push',
      frame: 64,
      durationFrames: 10,
      signals: {
        visual_complexity: 0.9,
        text_on_screen: 0.82,
        motion_intensity: 0.76,
        speech_energy: 0.9,
        word_importance: 0.9,
      },
    });
    const restrainedZoom = resolveAtomicZoomForm({
      localFrame: 64,
      sceneEnd: 160,
      signals: {
        visual_complexity: 0.9,
        text_on_screen: 0.82,
        motion_intensity: 0.76,
        speech_energy: 0.9,
        word_importance: 0.9,
      },
    });
    const aggressiveZoom = {
      ...restrainedZoom,
      scaleDelta: 0.14,
      scaleTo: restrainedZoom.scaleFrom + 0.14,
    };

    const transitionReceipt = buildOverlayAtomicReceipt({
      family: 'transition',
      intent: 'impact-transfer',
      frame: 120,
      durationFrames: 8,
      signals: {
        visual_complexity: 0.88,
        text_on_screen: 0.92,
        face_present: 1,
        visual_eye_contact: 1,
      },
    });
    const restrainedTransition = resolveAtomicTransitionForm({
      params: { transitionType: 'zoom-punch' },
      signals: {
        visual_complexity: 0.88,
        text_on_screen: 0.92,
        face_present: 1,
        visual_eye_contact: 1,
      },
    });
    const harshTransition = {
      ...restrainedTransition,
      compatibilityType: 'flash' as const,
      exposure: 0.7,
      sfxRole: 'impact' as const,
    };

    expect(scoreAtomicOverlayAesthetic({ receipt: zoomReceipt, zoomForm: restrainedZoom }).status).not.toBe('fail');
    expect(scoreAtomicOverlayAesthetic({ receipt: transitionReceipt, transitionForm: restrainedTransition }).status).not.toBe('fail');

    const zoomResult = scoreAtomicOverlayAesthetic({ receipt: zoomReceipt, zoomForm: aggressiveZoom });
    const transitionResult = scoreAtomicOverlayAesthetic({ receipt: transitionReceipt, transitionForm: harshTransition });

    expect(zoomResult.status).toBe('fail');
    expect(transitionResult.status).toBe('fail');
    expect(zoomResult.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'motion', message: expect.stringContaining('zoom amplitude') }),
    ]));
    expect(transitionResult.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'motion', message: expect.stringContaining('harsh transition') }),
    ]));
  });

  it('scores a mixed overlay timeline and penalizes repetitive same-family placement', () => {
    const caption = captionReceipt({ words: ['one', 'clear', 'line'], maxWordsPerLine: 3 });
    const text = textReceipt('Framework not motivation', 'top-right');
    const zoom = buildOverlayAtomicReceipt({ family: 'zoom', intent: 'emphasis-push', frame: 90, durationFrames: 12 });
    const transition = buildOverlayAtomicReceipt({ family: 'transition', intent: 'continuity-blend', frame: 150, durationFrames: 18 });
    const mixed = scoreAtomicOverlayAestheticTimeline([
      { receipt: caption },
      { receipt: text },
      { receipt: zoom },
      { receipt: transition },
    ]);

    const repeated = scoreAtomicOverlayAestheticTimeline([
      { receipt: caption },
      { receipt: captionReceipt({ words: ['same', 'caption', 'again'], maxWordsPerLine: 3 }) },
      { receipt: captionReceipt({ words: ['same', 'caption', 'again'], maxWordsPerLine: 3 }) },
      { receipt: captionReceipt({ words: ['same', 'caption', 'again'], maxWordsPerLine: 3 }) },
    ]);

    expect(mixed.status).toBe('pass');
    expect(repeated.score).toBeLessThan(mixed.score);
    expect(repeated.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'variety', message: expect.stringContaining('same overlay family') }),
    ]));
  });
});

function captionReceipt(input: {
  words: string[];
  maxWordsPerLine: number;
  emphasized?: number[];
  signals?: Record<string, unknown>;
}): AtomicOverlayReceipt {
  const emphasized = new Set(input.emphasized ?? []);
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('caption-mode', 'caption.mode', 'phrase', 1, 'decision-param'),
    overlayAtom('caption-words-per-group', 'caption.words_per_group', input.words.length, 1, 'decision-param'),
    overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', input.maxWordsPerLine, 1, 'decision-param'),
    overlayAtom('text-row-strategy', 'text.row_strategy', 'timed-fill', 1, 'decision-param'),
    overlayAtom('text-row-capacity', 'text.row_capacity', input.maxWordsPerLine, 1, 'decision-param'),
    overlayAtom('text-flow-direction', 'text.flow_direction', 'left-to-right', 1, 'decision-param'),
    overlayAtom('text-wrap-unit', 'text.wrap_unit', 'word', 1, 'decision-param'),
    overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
    overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
    overlayAtom('font-size', 'text.font_size', '68', 1, 'decision-param'),
    overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
    overlayAtom('theme-accent-color', 'theme.color.accent', '#00ff00', 1, 'brand'),
    overlayAtom('theme-heading-font', 'theme.font.heading', 'Poppins', 1, 'brand'),
    overlayAtom('theme-body-font', 'theme.font.body', 'Inter', 1, 'brand'),
    overlayAtom('highlight-color', 'caption.highlight.color', '#050505', 1, 'decision-param'),
    overlayAtom('highlight-background-color', 'caption.highlight.background_color', '#00ff00', 1, 'decision-param'),
  ];

  input.words.forEach((word, index) => {
    atoms.push(overlayAtom('caption-word', `caption.word.${index}`, word, 1, 'transcript'));
    atoms.push(overlayAtom('glyph-line-index', `caption.word.${index}.line_index`, Math.floor(index / input.maxWordsPerLine), 1, 'decision-param'));
    if (emphasized.has(index)) {
      atoms.push(overlayAtom('glyph-role', `caption.word.${index}.role`, 'keyword', 1, 'transcript'));
      atoms.push(overlayAtom('emphasis-role', `caption.word.${index}.emphasis_type`, 'keyword', 1, 'transcript'));
      atoms.push(overlayAtom('glyph-font-role', `caption.word.${index}.font_role`, 'accent', 1, 'decision-param'));
      atoms.push(overlayAtom('glyph-color-role', `caption.word.${index}.color_role`, 'accent', 1, 'decision-param'));
      atoms.push(overlayAtom('glyph-highlight-mode', `caption.word.${index}.highlight_mode`, 'fill', 1, 'decision-param'));
    }
  });

  return buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'keyword-caption',
    frame: 24,
    durationFrames: 42,
    signals: {
      negative_space_bottom: 0.7,
      ...(input.signals ?? {}),
    },
    atoms,
  });
}

function textReceipt(text: string, region: string): AtomicOverlayReceipt {
  return buildOverlayAtomicReceipt({
    family: 'text',
    intent: 'supporting-text',
    frame: 60,
    durationFrames: 72,
    signals: { screen_region: region, negative_space_right: 0.62 },
    atoms: [
      overlayAtom('text-content', 'content.text', text, 1, 'transcript'),
      overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
      overlayAtom('font-size', 'text.font_size', '56', 1, 'decision-param'),
      overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
    ],
  });
}
