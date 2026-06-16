import { describe, expect, it } from 'vitest';
import { buildMomentBundles, evaluateMomentBundles } from '../../lib/editron/services/moment-bundle-calibration';
import type { SignalSnapshot, SignalTimeline } from '../../lib/editron/services/signal-registry';
import type { OverlayDefinition } from '../../lib/editron/engine/utility-types';
import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
} from '../../lib/editron/engine/atomic-overlay-core';

function timelineWithSignals(): SignalTimeline {
  const lowSnapshot: SignalSnapshot = {
    frame: 150,
    timestampMs: 5_000,
    'visual.significance': 0.1,
    'speech.energy': 0.2,
  };
  const sourceSnapshot: SignalSnapshot = {
    frame: 555,
    timestampMs: 18_500,
    'visual.significance': 0.92,
    'visual.motion_intensity': 0.72,
    'visual.motion_vector.x': -0.4,
    'visual.main_subject.x': 0.18,
    'visual.main_subject.y': 0.22,
    'visual.main_subject.width': 0.34,
    'visual.main_subject.height': 0.62,
    'visual.text_coverage': 0.08,
    'visual.negative_space.right': 0.82,
    'visual.action_type': 'talking',
    'speech.energy': 0.84,
    'audio.music_beat': 1,
    'composite.cinematic_moment': 0.9,
  };
  const gridSignals: SignalTimeline['gridSignals'] = new Map([
    [150, lowSnapshot],
    [555, sourceSnapshot],
  ]);

  return {
    fps: 30,
    totalFrames: 900,
    gridInterval: 15,
    globalSignals: {},
    eventSignals: [{
      frame: 550,
      timestampMs: (550 / 30) * 1000,
      signal: 'speech.keyword_emphasis',
      value: 1,
      context: 'one thing',
    }],
    gridSignals,
  };
}

describe('moment bundle calibration dataset', () => {
  it('builds cut-timeline rows using source-frame signal atoms', () => {
    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-a', type: 'video', from: 0, durationInFrames: 100, sourceStartFrame: 100 },
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
        { id: 'mg-1', type: 'motion-graphic', from: 150, durationInFrames: 45 },
      ],
      frameStride: 150,
      includeOverlayFrames: true,
    });

    const bundle = bundles.find((row) => row.frame === 150);

    expect(bundle).toBeDefined();
    expect(bundle).toEqual(expect.objectContaining({
      frame: 150,
      sourceFrame: 550,
      sourceGridFrame: 555,
    }));
    expect(bundle?.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'visual', key: 'visual.significance', value: 0.92 }),
      expect.objectContaining({ channel: 'screen', key: 'visual.negative_space.right', value: 0.82 }),
      expect.objectContaining({ channel: 'speech', key: 'speech.energy', value: 0.84 }),
      expect.objectContaining({ channel: 'speech', key: 'speech.keyword_emphasis', value: 'one thing', source: 'event' }),
      expect.objectContaining({ channel: 'overlay', key: 'active.motion-graphic', value: 'mg-1' }),
    ]));
  });

  it('captures top system candidates from the same source snapshot', () => {
    const defs: OverlayDefinition[] = [{
      id: 'graphic.keyword_pop',
      category: 'graphic',
      rank: 1,
      weight: 1,
      minScore: 0.3,
      minGapFrames: 0,
      considerations: [{
        signalId: 'visual.significance',
        curveType: 'linear',
        params: { slope: 1, exponent: 1, xShift: 0, yShift: 0 },
        invert: false,
        description: 'visual salience',
      }],
      outputParams: [{ name: 'graphicType', mode: 'fixed', fixedValue: 'keyword-highlight' }],
    }];

    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
      ],
      overlayDefinitions: defs,
      frameStride: 50,
      includeOverlayFrames: false,
    });

    const bundle = bundles.find((row) => row.frame === 150);

    expect(bundle?.systemCandidates).toEqual([expect.objectContaining({
      overlayId: 'graphic.keyword_pop',
      category: 'graphic',
      score: expect.closeTo(0.828, 5),
      outputValues: { graphicType: 'keyword-highlight' },
    })]);
  });

  it('evaluates active overlay categories against system candidates', () => {
    const defs: OverlayDefinition[] = [{
      id: 'graphic.keyword_pop',
      category: 'graphic',
      rank: 1,
      weight: 1,
      minScore: 0.3,
      minGapFrames: 0,
      considerations: [{
        signalId: 'visual.significance',
        curveType: 'linear',
        params: { slope: 1, exponent: 1, xShift: 0, yShift: 0 },
        invert: false,
        description: 'visual salience',
      }],
      outputParams: [{ name: 'graphicType', mode: 'fixed', fixedValue: 'keyword-highlight' }],
    }];
    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
        { id: 'mg-1', type: 'motion-graphic', from: 150, durationInFrames: 45 },
      ],
      overlayDefinitions: defs,
      frameStride: 150,
      includeOverlayFrames: true,
    });

    const report = evaluateMomentBundles(bundles);
    const row = report.rows.find((item) => item.frame === 150);

    expect(row).toEqual(expect.objectContaining({
      level: 'matched',
      score: 1,
      observedCategories: ['graphic'],
      candidateCategories: ['graphic'],
      missedCategories: [],
    }));
    expect(report.summary).toEqual(expect.objectContaining({
      observedRows: 1,
      matchedRows: 1,
      averageObservedScore: 1,
    }));
    expect(report.summary.categoryRecall.graphic).toEqual({
      observed: 1,
      matched: 1,
      averageScore: 1,
    });
  });

  it('flags partial matches when only some active overlay families are covered', () => {
    const defs: OverlayDefinition[] = [{
      id: 'graphic.keyword_pop',
      category: 'graphic',
      rank: 1,
      weight: 1,
      minScore: 0.3,
      minGapFrames: 0,
      considerations: [{
        signalId: 'visual.significance',
        curveType: 'linear',
        params: { slope: 1, exponent: 1, xShift: 0, yShift: 0 },
        invert: false,
        description: 'visual salience',
      }],
      outputParams: [{ name: 'graphicType', mode: 'fixed', fixedValue: 'keyword-highlight' }],
    }];
    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
        { id: 'mg-1', type: 'motion-graphic', from: 150, durationInFrames: 45 },
        { id: 'hit-1', type: 'sound', from: 150, durationInFrames: 15 },
      ],
      overlayDefinitions: defs,
      frameStride: 150,
      includeOverlayFrames: true,
    });

    const report = evaluateMomentBundles(bundles);
    const row = report.rows.find((item) => item.frame === 150);

    expect(row).toEqual(expect.objectContaining({
      level: 'partial',
      score: 0.5,
      observedCategories: ['graphic', 'sfx'],
      candidateCategories: ['graphic'],
      missedCategories: ['sfx'],
    }));
    expect(row?.notes).toContain('missed:sfx');
    expect(report.summary).toEqual(expect.objectContaining({
      observedRows: 1,
      partialRows: 1,
      averageObservedScore: 0.5,
    }));
    expect(report.summary.categoryRecall.sfx).toEqual({
      observed: 1,
      matched: 0,
      averageScore: 0,
    });
  });

  it('calibrates whether primitive visual atoms changed candidate placement decisions', () => {
    const defs: OverlayDefinition[] = [{
      id: 'graphic.safe_right_callout',
      category: 'graphic',
      rank: 1,
      weight: 1,
      minScore: 0.3,
      minGapFrames: 0,
      considerations: [{
        signalId: 'visual.negative_space.right',
        curveType: 'linear',
        params: { slope: 1, exponent: 1, xShift: 0, yShift: 0 },
        invert: false,
        description: 'right-side negative space',
      }],
      outputParams: [{ name: 'position', mode: 'fixed', fixedValue: 'top-right' }],
    }];
    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
      ],
      overlayDefinitions: defs,
      frameStride: 150,
      includeOverlayFrames: false,
    });
    const bundle = bundles.find((row) => row.frame === 150);
    const report = evaluateMomentBundles(bundles);

    expect(bundle?.primitiveInfluence).toEqual(expect.objectContaining({
      primitiveAtomCount: expect.any(Number),
      candidateDeltaCount: 1,
      changedCategories: ['graphic'],
      placementRegionChanged: true,
      baselineTopByCategory: {},
      primitiveTopByCategory: { graphic: 'graphic.safe_right_callout' },
    }));
    expect(bundle?.primitiveInfluence.primitiveAtomCount).toBeGreaterThan(0);
    expect(bundle?.systemCandidates[0]).toEqual(expect.objectContaining({
      overlayId: 'graphic.safe_right_callout',
      placementRegion: 'top-right',
    }));
    expect(report.summary).toEqual(expect.objectContaining({
      primitiveInfluenceRows: expect.any(Number),
      primitiveChangedRows: 1,
      primitivePlacementChangedRows: 1,
      primitiveChangedCategories: { graphic: 1 },
    }));
  });

  it('adds atomic aesthetic scores to moment bundles and evaluation summaries', () => {
    const badCaptionReceipt = denseCaptionReceipt();
    const bundles = buildMomentBundles({
      timeline: timelineWithSignals(),
      overlays: [
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
        {
          id: 'caption-bad',
          type: 'caption',
          from: 150,
          durationInFrames: 45,
          metadata: { atomicOverlayReceipt: badCaptionReceipt },
        },
      ],
      frameStride: 150,
      includeOverlayFrames: true,
    });
    const bundle = bundles.find((row) => row.frame === 150);
    const report = evaluateMomentBundles(bundles);

    expect(bundle?.aesthetic).toEqual(expect.objectContaining({
      scoredOverlays: 1,
      status: 'fail',
    }));
    expect(bundle?.aesthetic.score).toBeLessThan(0.82);
    expect(bundle?.aesthetic.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ overlayId: 'caption-bad', type: 'caption', dimension: 'text' }),
    ]));
    expect(bundle?.qualityLabels.notes).toContain('aesthetic-fail');
    expect(report.summary).toEqual(expect.objectContaining({
      aestheticRows: 1,
      aestheticStatusCounts: expect.objectContaining({ fail: 1 }),
    }));
    expect(report.summary.averageAestheticScore).toBeLessThan(0.82);
    expect(report.summary.aestheticIssueCounts['text:fail']).toBeGreaterThanOrEqual(1);
  });
});

function denseCaptionReceipt() {
  const words = ['this', 'is', 'the', 'one', 'thing', 'that', 'changed', 'everything', 'forever'];
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('caption-mode', 'caption.mode', 'phrase', 1, 'decision-param'),
    overlayAtom('caption-words-per-group', 'caption.words_per_group', words.length, 1, 'decision-param'),
    overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', words.length, 1, 'decision-param'),
    overlayAtom('text-row-strategy', 'text.row_strategy', 'timed-fill', 1, 'decision-param'),
    overlayAtom('text-row-capacity', 'text.row_capacity', words.length, 1, 'decision-param'),
    overlayAtom('text-flow-direction', 'text.flow_direction', 'left-to-right', 1, 'decision-param'),
    overlayAtom('text-wrap-unit', 'text.wrap_unit', 'word', 1, 'decision-param'),
    overlayAtom('text-contrast-mode', 'text.contrast_mode', 'light-on-dark', 1, 'decision-param'),
    overlayAtom('font-family', 'text.font_family', 'Inter', 1, 'decision-param'),
    overlayAtom('font-size', 'text.font_size', '68', 1, 'decision-param'),
    overlayAtom('text-color', 'text.color', '#ffffff', 1, 'decision-param'),
    overlayAtom('theme-accent-color', 'theme.color.accent', '#00ff00', 1, 'brand'),
    overlayAtom('theme-heading-font', 'theme.font.heading', 'Poppins', 1, 'brand'),
  ];

  words.forEach((word, index) => {
    atoms.push(overlayAtom('caption-word', `caption.word.${index}`, word, 1, 'transcript'));
    atoms.push(overlayAtom('glyph-line-index', `caption.word.${index}.line_index`, 0, 1, 'decision-param'));
  });

  return buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'keyword-caption',
    frame: 150,
    durationFrames: 45,
    signals: {
      visual_complexity: 0.72,
      text_coverage: 0.4,
    },
    atoms,
  });
}
