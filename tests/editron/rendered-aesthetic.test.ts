import { describe, expect, it } from 'vitest';

import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
  type AtomicOverlayFamily,
  type AtomicOverlayReceipt,
} from '../../lib/editron/engine/atomic-overlay-core';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { buildAtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import { planComposition } from '../../lib/editron/motion-graphics/engine/composition-planner';
import {
  scoreRenderedFrameAesthetic,
  type RenderedOverlayEvidence,
} from '../../lib/editron/motion-graphics/engine/eval/rendered-aesthetic';

const FRAME = {
  width: 1080,
  height: 1920,
  fps: 30,
};

describe('rendered frame aesthetic scoring', () => {
  it('passes a readable caption with clean rendered evidence', () => {
    const receipt = captionReceipt({
      words: ['one', 'clear', 'idea', 'wins'],
      maxWordsPerLine: 2,
      durationFrames: 66,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 10.5, alphaMean: 1 },
      overlays: [{
        id: 'caption-clean',
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

    expect(result.status).toBe('pass');
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.issues).toHaveLength(0);
  });

  it('warns captions centered inside platform unsafe zones', () => {
    const receipt = captionReceipt({
      words: ['this', 'is', 'covered'],
      maxWordsPerLine: 3,
      durationFrames: 66,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 10.5, alphaMean: 1 },
      overlays: [{
        id: 'caption-bottom-ui-zone',
        receipt,
        box: {
          x: 220,
          y: 1580,
          width: 640,
          height: 180,
          opacity: 1,
          visiblePixelRatio: 0.08,
          contrastRatio: 5.8,
          textPixelHeight: 68,
        },
      }],
    });

    expect(result.status).toBe('warn');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'safe-area',
        severity: 'warn',
        message: expect.stringContaining('caption_unsafe_zone'),
        evidence: expect.stringContaining('constraint=overlay.caption_unsafe_zone'),
      }),
    ]));
  });

  it('warns captions centered in the top platform unsafe zone', () => {
    const receipt = captionReceipt({
      words: ['too', 'high'],
      maxWordsPerLine: 2,
      durationFrames: 66,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 10.5, alphaMean: 1 },
      overlays: [{
        id: 'caption-top-ui-zone',
        receipt,
        box: {
          x: 220,
          y: 40,
          width: 640,
          height: 180,
          opacity: 1,
          visiblePixelRatio: 0.08,
          contrastRatio: 5.8,
          textPixelHeight: 68,
        },
      }],
    });

    expect(result.status).toBe('warn');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'safe-area',
        severity: 'warn',
        message: expect.stringContaining('caption_unsafe_zone'),
      }),
    ]));
  });

  it('does not fail captions against their own text-occupancy placement hint', () => {
    const receipt = captionReceipt({
      words: ['one', 'clear', 'idea', 'wins'],
      maxWordsPerLine: 2,
      durationFrames: 66,
      signals: {
        text_on_screen: 1,
        text_coverage: 0.72,
      },
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 10.5, alphaMean: 1 },
      overlays: [{
        id: 'caption-self-text-occupancy',
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

    expect(result.status).toBe('pass');
    expect(result.issues.some((issue) => issue.dimension === 'occlusion')).toBe(false);
  });

  it('fails blank or missing rendered output before trusting overlay metadata', () => {
    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 0.2, alphaMean: 1 },
      overlays: [],
    });

    expect(result.status).toBe('fail');
    expect(result.render.status).toMatchObject({ ok: false, reason: 'blank' });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'render', severity: 'fail' }),
    ]));
  });

  it('fails overlays that are clipped by the actual frame', () => {
    const receipt = textReceipt('Framework not motivation', 'top-left', {
      x: -18,
      y: 260,
      width: 560,
      height: 120,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 12, alphaMean: 1 },
      overlays: [{
        id: 'clipped-text',
        receipt,
        box: {
          x: -18,
          y: 260,
          width: 560,
          height: 120,
          opacity: 1,
          visiblePixelRatio: 0.04,
          contrastRatio: 6,
          textPixelHeight: 54,
        },
      }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'safe-area',
        severity: 'fail',
        message: expect.stringContaining('clipped'),
      }),
    ]));
  });

  it('fails rendered overlays covering protected V-JEPA subject regions', () => {
    const receipt = buildOverlayAtomicReceipt({
      family: 'motion-graphic',
      intent: 'keyword-emphasis',
      frame: 42,
      durationFrames: 30,
      signals: {
        face_present: true,
        visual_eye_contact: true,
        visual_complexity: 0.62,
        main_subject_x: 0.5,
        main_subject_y: 0.42,
        main_subject_width: 0.34,
        main_subject_height: 0.48,
      },
      atoms: [
        overlayAtom('text-content', 'content.text', 'ONE THING', 1, 'transcript'),
        overlayAtom('font-size', 'text.font_size', '76', 1, 'decision-param'),
        overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      ],
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'subject-covered',
        receipt,
        box: {
          x: 360,
          y: 600,
          width: 360,
          height: 360,
          opacity: 1,
          visiblePixelRatio: 0.08,
          contrastRatio: 5,
        },
      }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'occlusion', severity: 'fail' }),
    ]));
  });

  it('does not score licensed full-frame MGs as accidental text-occupancy occlusion', () => {
    const receipt = buildOverlayAtomicReceipt({
      family: 'motion-graphic',
      intent: 'full-frame-concept',
      frame: 42,
      durationFrames: 90,
      target: { x: 0, y: 0, width: FRAME.width, height: FRAME.height },
      signals: {
        text_on_screen: 0.62,
        text_coverage: 0.18,
      },
      atoms: [
        overlayAtom('text-content', 'content.text', 'selection bias', 1, 'transcript'),
        overlayAtom('font-size', 'text.font_size', '78', 1, 'decision-param'),
        overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      ],
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'full-frame-mg',
        receipt,
        visualIntentStageMode: 'full-frame-graphic-scene',
        box: {
          x: 0,
          y: 0,
          width: FRAME.width,
          height: FRAME.height,
          opacity: 1,
          visiblePixelRatio: 0.08,
          contrastRatio: 3.4,
          textPixelHeight: 78,
        },
      }],
    });

    expect(result.status).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });

  it('fails dense one-row captions with low local contrast', () => {
    const receipt = captionReceipt({
      words: ['this', 'is', 'the', 'one', 'thing', 'that', 'changed', 'everything', 'forever'],
      maxWordsPerLine: 9,
      durationFrames: 42,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 13, alphaMean: 1 },
      overlays: [{
        id: 'dense-caption',
        receipt,
        box: {
          x: 180,
          y: 1360,
          width: 720,
          height: 190,
          opacity: 1,
          visiblePixelRatio: 0.1,
          contrastRatio: 1.7,
          textPixelHeight: 64,
        },
      }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'text', severity: 'fail' }),
      expect.objectContaining({ dimension: 'contrast', severity: 'fail' }),
    ]));
  });

  it('trusts declared text-on-panel contrast for readable caption surfaces', () => {
    const receipt = captionReceipt({
      words: ['but', 'I', 'wanna', 'make', 'a', 'hypothesis'],
      maxWordsPerLine: 6,
      durationFrames: 90,
      backgroundColor: 'rgba(0,0,0,0.74)',
      textColor: '#ffffff',
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 13, alphaMean: 1 },
      overlays: [{
        id: 'panel-caption',
        receipt,
        box: {
          x: 320,
          y: 86,
          width: 1280,
          height: 130,
          opacity: 1,
          visiblePixelRatio: 0.1,
          contrastRatio: 1.7,
          textPixelHeight: 34,
        },
      }],
    });

    expect(result.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'contrast' }),
    ]));
  });

  it('downgrades low contrast during a planned exit-prep fade', () => {
    const receipt = textReceipt('Hank Speaker', 'center', {
      x: 420,
      y: 820,
      width: 280,
      height: 160,
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 13, alphaMean: 1 },
      overlays: [{
        id: 'exiting-mg',
        receipt,
        sampleRoles: ['exit-prep'],
        box: {
          x: 420,
          y: 820,
          width: 280,
          height: 160,
          opacity: 1,
          visiblePixelRatio: 0.05,
          contrastRatio: 1.7,
          textPixelHeight: 64,
        },
      }],
    });

    expect(result.status).toBe('pass');
    expect(result.issues).toEqual([
      expect.objectContaining({
        dimension: 'contrast',
        severity: 'info',
        message: expect.stringContaining('exit fade'),
        evidence: expect.stringContaining('sampleRoles=exit-prep'),
      }),
    ]);
  });

  it('fails overlapping and cluttered rendered overlay combinations', () => {
    const overlays = [
      visualOverlay('shape-a', 'shape', { x: 200, y: 500, width: 300, height: 220 }),
      visualOverlay('shape-b', 'shape', { x: 260, y: 540, width: 300, height: 220 }),
      visualOverlay('sticker-a', 'sticker', { x: 700, y: 360, width: 180, height: 180 }),
      visualOverlay('image-a', 'image', { x: 140, y: 1180, width: 190, height: 190 }),
      visualOverlay('mg-a', 'motion-graphic', { x: 650, y: 1260, width: 260, height: 160 }),
    ];

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 15, alphaMean: 1 },
      overlays,
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'overlap',
        severity: 'warn',
        message: expect.stringContaining('overlay_spatial_overlap'),
        evidence: expect.stringContaining('constraint=overlay.overlay_spatial_overlap'),
      }),
      expect.objectContaining({ dimension: 'clutter', severity: 'fail' }),
    ]));
  });

  it('warns caption and graphic reading-task overlap even below generic overlap threshold', () => {
    const caption = captionReceipt({
      words: ['read', 'one', 'thing'],
      maxWordsPerLine: 3,
      durationFrames: 60,
    });
    const graphic = motionGraphicReceipt('the other thing');

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 15, alphaMean: 1 },
      overlays: [
        {
          id: 'caption-zone-caption',
          receipt: caption,
          box: {
            x: 220,
            y: 1280,
            width: 640,
            height: 180,
            opacity: 1,
            visiblePixelRatio: 0.08,
            contrastRatio: 5.8,
            textPixelHeight: 68,
          },
        },
        {
          id: 'caption-zone-mg',
          receipt: graphic,
          box: {
            x: 712,
            y: 1430,
            width: 260,
            height: 160,
            opacity: 1,
            visiblePixelRatio: 0.032,
            contrastRatio: 5.2,
            textPixelHeight: 74,
          },
        },
      ],
    });

    expect(result.status).toBe('warn');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'overlap',
        severity: 'warn',
        message: expect.stringContaining('graphic_in_caption_zone'),
        evidence: expect.stringContaining('constraint=overlay.graphic_in_caption_zone'),
      }),
    ]));
  });

  it('warns clean overlay pairs above the CRG spatial-overlap threshold', () => {
    const overlays = [
      visualOverlay('shape-a', 'shape', { x: 240, y: 620, width: 300, height: 200 }),
      visualOverlay('shape-b', 'shape', { x: 477, y: 620, width: 300, height: 200 }),
    ];

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 15, alphaMean: 1 },
      overlays,
    });

    expect(result.status).toBe('warn');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'overlap',
        severity: 'warn',
        message: expect.stringContaining('overlay_spatial_overlap'),
        evidence: expect.stringContaining('ratio=0.21'),
      }),
    ]));
  });

  it('scores generated MG plan atoms against actual rendered frame evidence', () => {
    const signals = {
      enthusiasm: 0.9,
      emotional_arousal: 0.86,
      pacing_velocity: 0.8,
      visceral_impact: 0.7,
      visual_dependency: 0.3,
      caption_redundancy: 0.12,
    };
    const tokens = resolveMotionTokens(signals, {
      accentColor: '#f43f5e',
      primaryColor: '#ffffff',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    });
    const content = {
      value: '1/3',
      label: 'of the room understood',
      quantityKind: 'fraction',
      denominator: 3,
      bounded: true,
      warranted: true,
      salience: 0.93,
    };
    const recipe = planComposition({ content }, tokens, signals);
    const atomic = buildAtomicOverlayPlan(recipe, tokens, content, signals);
    const primaryElement = atomic.elements.find((element) => element.role === 'counter') ?? atomic.elements[0];
    const receipt = buildOverlayAtomicReceipt({
      family: 'motion-graphic',
      intent: atomic.recipeId,
      frame: 96,
      durationFrames: 36,
      signals,
      atoms: [
        overlayAtom('text-content', 'content.text', primaryElement?.structure.text?.lines.join(' ') ?? content.value, 1, 'decision-param'),
        overlayAtom('font-size', 'text.font_size', primaryElement?.typography?.sizePx ?? 48, 1, 'decision-param'),
        overlayAtom('text-color', 'text.color', primaryElement?.color.text ?? tokens.color.accent, 1, 'decision-param'),
      ],
    });

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 9, alphaMean: 1 },
      overlays: [{
        id: 'generated-mg-bad-render',
        receipt,
        box: {
          x: 420,
          y: 820,
          width: 220,
          height: 92,
          opacity: 1,
          visiblePixelRatio: 0.002,
          contrastRatio: 1.6,
          textPixelHeight: 18,
        },
      }],
    });

    expect(atomic.recipeId).toBe('composed-numeric');
    expect(atomic.elements.some((element) => element.role === 'proportion-boundary-rule')).toBe(true);
    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'visibility', severity: 'fail' }),
      expect.objectContaining({ dimension: 'text' }),
      expect.objectContaining({ dimension: 'contrast', severity: 'fail' }),
    ]));
  });

  it('fails sparse-rate MGs that render as generic stat shells or cards', () => {
    const receipt = motionGraphicReceipt('0.02 human beings per day', [
      overlayAtom('shape-kind', 'recipe.role.sm-backdrop', 'sm-backdrop', 1, 'decision-param'),
      overlayAtom('shape-kind', 'scene.atom.semantic-stat-field', 'semantic-stat-field', 1, 'decision-param'),
    ]);

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'sparse-rate-shell',
        receipt,
        box: {
          x: 80,
          y: 360,
          width: 920,
          height: 820,
          opacity: 1,
          visiblePixelRatio: 0.018,
          contrastRatio: 5.2,
          textPixelHeight: 74,
        },
      }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'motion-graphic',
        severity: 'fail',
        message: expect.stringContaining('generic stat shell/card'),
      }),
    ]));
  });

  it('passes sparse-rate MG evidence when it uses a licensed trace instead of a shell', () => {
    const receipt = motionGraphicReceipt('0.02 human beings per day', [
      overlayAtom('shape-kind', 'recipe.role.numeric-sparse-rate-trace', 'numeric-sparse-rate-trace', 1, 'decision-param'),
      overlayAtom('shape-kind', 'recipe.role.numeric-rate-rule', 'numeric-rate-rule', 1, 'decision-param'),
    ]);

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'sparse-rate-trace',
        receipt,
        box: {
          x: 220,
          y: 760,
          width: 640,
          height: 240,
          opacity: 1,
          visiblePixelRatio: 0.032,
          contrastRatio: 5.2,
          textPixelHeight: 74,
        },
      }],
    });

    expect(result.status).toBe('pass');
    expect(result.issues).toHaveLength(0);
    expect(result.subscores['motion-graphic']).toBe(1);
  });

  it('warns rendered MG text below the CRG graphic-too-small floor', () => {
    const receipt = motionGraphicReceipt('clear but tiny claim');

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'undersized-mg-text',
        receipt,
        box: {
          x: 220,
          y: 760,
          width: 640,
          height: 240,
          opacity: 1,
          visiblePixelRatio: 0.032,
          contrastRatio: 5.2,
          textPixelHeight: 54,
        },
      }],
    });

    expect(result.status).toBe('warn');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'text',
        severity: 'warn',
        message: expect.stringContaining('graphic_too_small'),
        evidence: expect.stringContaining('requiredPx=72.0'),
      }),
    ]));
  });

  it('fails tiny concept MGs even when the renderer technically paints pixels', () => {
    const receipt = motionGraphicReceipt('selection bias');

    const result = scoreRenderedFrameAesthetic({
      ...FRAME,
      image: { lumaStdDev: 11, alphaMean: 1 },
      overlays: [{
        id: 'tiny-concept',
        receipt,
        box: {
          x: 120,
          y: 231,
          width: 843,
          height: 21,
          opacity: 1,
          visiblePixelRatio: 0.03,
          contrastRatio: 6,
        },
      }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'motion-graphic',
        severity: 'fail',
        message: expect.stringContaining('tiny dead concept'),
      }),
    ]));
  });
});

function captionReceipt(input: {
  words: string[];
  maxWordsPerLine: number;
  durationFrames?: number;
  textColor?: string;
  backgroundColor?: string;
  signals?: Record<string, unknown>;
}): AtomicOverlayReceipt {
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('caption-mode', 'caption.mode', 'phrase', 1, 'decision-param'),
    overlayAtom('caption-words-per-group', 'caption.words_per_group', input.words.length, 1, 'decision-param'),
    overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', input.maxWordsPerLine, 1, 'decision-param'),
    overlayAtom('text-row-strategy', 'text.row_strategy', 'timed-fill', 1, 'decision-param'),
    overlayAtom('text-row-capacity', 'text.row_capacity', input.maxWordsPerLine, 1, 'decision-param'),
    overlayAtom('text-wrap-unit', 'text.wrap_unit', 'word', 1, 'decision-param'),
    overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
    overlayAtom('font-size', 'text.font_size', '68', 1, 'decision-param'),
    overlayAtom('text-color', 'text.color', input.textColor ?? '#ffffff', 1, 'decision-param'),
    overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
  ];
  if (input.backgroundColor) {
    atoms.push(overlayAtom('background-color', 'style.background_color', input.backgroundColor, 1, 'decision-param'));
  }

  input.words.forEach((word, index) => {
    atoms.push(overlayAtom('caption-word', `caption.word.${index}`, word, 1, 'transcript'));
    atoms.push(overlayAtom('glyph-line-index', `caption.word.${index}.line_index`, Math.floor(index / input.maxWordsPerLine), 1, 'decision-param'));
  });

  return buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'keyword-caption',
    frame: 24,
    durationFrames: input.durationFrames ?? 54,
    signals: input.signals ?? { negative_space_bottom: 0.7 },
    atoms,
  });
}

function textReceipt(
  text: string,
  region: string,
  target: Record<string, number>,
): AtomicOverlayReceipt {
  return buildOverlayAtomicReceipt({
    family: 'text',
    intent: 'supporting-text',
    frame: 60,
    durationFrames: 72,
    signals: { screen_region: region },
    target,
    atoms: [
      overlayAtom('text-content', 'content.text', text, 1, 'transcript'),
      overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
      overlayAtom('font-size', 'text.font_size', '54', 1, 'decision-param'),
      overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
    ],
  });
}

function visualOverlay(
  id: string,
  family: AtomicOverlayFamily,
  box: { x: number; y: number; width: number; height: number },
): RenderedOverlayEvidence {
  return {
    id,
    receipt: buildOverlayAtomicReceipt({
      family,
      intent: 'visual-accent',
      frame: 80,
      durationFrames: 24,
      target: box,
    }),
    box: {
      ...box,
      opacity: 1,
      visiblePixelRatio: 0.03,
    },
  };
}

function motionGraphicReceipt(rawText: string, extraAtoms: AtomicOverlayAtom[] = []): AtomicOverlayReceipt {
  const words = rawText.split(/\s+/).filter(Boolean);
  return buildOverlayAtomicReceipt({
    family: 'motion-graphic',
    intent: 'composed-numeric',
    frame: 36,
    durationFrames: 90,
    source: 'test',
    atoms: [
      overlayAtom('text-content', 'content.text', rawText, 1, 'transcript'),
      overlayAtom('font-family', 'text.font_family', 'JetBrains Mono', 1, 'decision-param'),
      overlayAtom('font-size', 'text.font_size', '74', 1, 'decision-param'),
      overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
      overlayAtom('text-row-capacity', 'text.row_capacity', Math.max(1, words.length), 1, 'decision-param'),
      overlayAtom('text-target-row-count', 'text.target_row_count', 2, 1, 'decision-param'),
      ...words.map((word, index) => overlayAtom('caption-word', `mg.word.${index}`, word, 1, 'transcript')),
      ...extraAtoms,
    ],
  });
}
