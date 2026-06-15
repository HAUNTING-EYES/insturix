import { describe, expect, it } from 'vitest';

import { generateEditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { detectCinematicMoments } from '../../lib/editron/services/cinematic-moment-detector';
import type { AssetAnalysis } from '../../lib/editron/services/five-track-analysis';

function baseAnalysis(overrides: Partial<AssetAnalysis> = {}): AssetAnalysis {
  return {
    assetId: 'asset-reactive-mg-no-preset',
    userId: 'user-1',
    status: 'complete',
    durationMs: 4000,
    analyzedAt: new Date('2026-06-14T00:00:00.000Z'),
    shots: [],
    motionSegments: [],
    motionPeaks: [],
    audio: null,
    keyframeAnalyses: [],
    subjectTracks: [],
    speechSegments: [],
    musicStructure: null,
    naturalCutPoints: [],
    audioSyncPoints: [],
    analysisQuality: 'high',
    ...overrides,
  };
}

describe('reactive MG producer contract', () => {
  it('translates legacy speech suggestedGraphicType into semantic evidence only', () => {
    const edl = generateEditDecisionList([baseAnalysis({
      speechSegments: [{
        startMs: 0,
        endMs: 1200,
        startFrame: 0,
        endFrame: 36,
        text: 'Revenue grew 42 percent this quarter',
        contentType: 'statistic',
        entities: [{ type: 'percentage', value: '42%', unit: '%' }],
        suggestedGraphicType: 'counter-animation',
        suggestedGraphicData: { label: 'revenue growth' },
        confidence: 0.92,
        keywordHighlights: [],
      }],
    })], 4000, { graphicDensity: 'heavy' });

    const graphic = edl.decisions.find(decision => decision.type === 'graphic');

    expect(graphic?.params).toMatchObject({
      kind: 'numeric',
      value: '42%',
      label: 'revenue growth',
      contentType: 'statistic',
    });
    expect(graphic?.params).not.toHaveProperty('graphicType');
    expect(graphic?.params).not.toHaveProperty('graphicData');
  });

  it('emits subject graphics as identity or structured atoms, not lower-third/callout/logo presets', () => {
    const edl = generateEditDecisionList([baseAnalysis({
      subjectTracks: [
        {
          subjectId: 'person-1',
          label: 'Ava Chen',
          category: 'person',
          frames: [{ frame: 0, box: { x: 0.2, y: 0.1, w: 0.3, h: 0.7 }, confidence: 0.95 }],
          totalScreenTimeMs: 3000,
        },
        {
          subjectId: 'product-1',
          label: 'Analytics dashboard',
          category: 'product',
          frames: [{ frame: 90, box: { x: 0.55, y: 0.2, w: 0.35, h: 0.4 }, confidence: 0.88 }],
          totalScreenTimeMs: 2000,
        },
      ],
    })], 4000, { graphicDensity: 'heavy' });

    const graphics = edl.decisions.filter(decision => decision.type === 'graphic');

    expect(graphics).toEqual(expect.arrayContaining([
      expect.objectContaining({ params: expect.objectContaining({ kind: 'identity', name: 'Ava Chen' }) }),
      expect.objectContaining({ params: expect.objectContaining({ kind: 'structured', title: 'Analytics dashboard' }) }),
    ]));
    expect(graphics.every(graphic => !('graphicType' in graphic.params))).toBe(true);
  });

  it('emits reactive cinematic speech/music graphics as semantic emphasis atoms', () => {
    const analysis = baseAnalysis({
      speechSegments: [{
        startMs: 0,
        endMs: 1500,
        startFrame: 0,
        endFrame: 45,
        text: 'This is the key moment',
        contentType: 'emphasis',
        entities: [],
        suggestedGraphicType: 'none',
        suggestedGraphicData: {},
        confidence: 0.9,
        keywordHighlights: [],
      }],
      musicStructure: {
        bpm: 120,
        sections: [],
        energyCurve: [{ timestampMs: 0, energy: 0.95 }],
        tensionCurve: [{ timestampMs: 0, tension: 0.1 }],
        drops: [],
        builds: [],
        breakdowns: [],
        stingers: [],
      },
    });

    const edl = generateEditDecisionList([analysis], 4000, { graphicDensity: 'heavy' });
    const graphic = edl.decisions.find(decision => (
      decision.type === 'graphic' && decision.source === 'cinematic-moment'
    ));

    expect(graphic?.params).toMatchObject({
      kind: 'emphasis',
      text: 'Speech emphasis',
      sourceTracks: ['music', 'speech'],
    });
    expect(graphic?.params).not.toHaveProperty('graphicType');
  });

  it('keeps standalone cinematic detector suggestions free of graphicType presets', () => {
    const moments = detectCinematicMoments(baseAnalysis({
      speechSegments: [{
        startMs: 0,
        endMs: 1500,
        startFrame: 0,
        endFrame: 45,
        text: 'This is the key moment',
        contentType: 'emphasis',
        entities: [],
        suggestedGraphicType: 'none',
        suggestedGraphicData: {},
        confidence: 0.9,
        keywordHighlights: [],
      }],
      musicStructure: {
        bpm: 120,
        sections: [],
        energyCurve: [{ timestampMs: 0, energy: 0.95 }],
        tensionCurve: [{ timestampMs: 0, tension: 0.1 }],
        drops: [],
        builds: [],
        breakdowns: [],
        stingers: [],
      },
    }));

    expect(moments[0]?.suggestedEdit.type).toBe('graphic-reveal');
    expect(moments[0]?.suggestedEdit.params).toMatchObject({
      kind: 'emphasis',
      sourceTracks: ['music', 'speech'],
    });
    expect(moments[0]?.suggestedEdit.params).not.toHaveProperty('graphicType');
  });
});
