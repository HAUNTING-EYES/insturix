import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/editron/services/edl-executor', () => ({
  snapToClipBoundary: vi.fn(() => null),
}));

import { translateCreativeIntentToEDL } from '../../lib/editron/services/intent-translator';
import type { CreativeIntentPlan, SceneIntent } from '../../lib/editron/services/unified-edit-intelligence';

type GraphicIntent = SceneIntent['graphicIntents'][number];

function buildPlan(graphicIntents: GraphicIntent[]): CreativeIntentPlan {
  return {
    projectId: 'intent-translator-mg-no-preset',
    generatedAt: new Date('2026-06-14T00:00:00.000Z'),
    sceneIntents: [{
      sceneIndex: 0,
      decisiveMoment: 'middle of the scene',
      zoomIntent: 'none',
      pacingIntent: 'hold-natural',
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut',
      audioIntent: { nativeAudio: 'keep-full' },
      graphicIntents,
      shakeIntent: 'none',
      reasoning: 'test fixture',
    }],
    stats: {
      totalScenes: 1,
      zoomCount: 0,
      graphicCount: graphicIntents.filter((graphic) => graphic.type !== 'none').length,
      transitionCount: 0,
    },
  };
}

function translate(
  plan: CreativeIntentPlan,
  onScreenText: string[] = [],
  voiceoverWords: Array<{ word: string; startMs: number; endMs: number }> = [],
) {
  return translateCreativeIntentToEDL(
    plan,
    [{
      sceneIndex: 0,
      fromFrame: 30,
      durationFrames: 180,
      voiceoverWords,
      onScreenText,
    }],
    new Map(),
    [],
    30,
    'heavy',
    {
      formality: 0.8,
      energy_baseline: 0.9,
      warmth: 0.35,
      visceral_impact: 0.7,
      visual_dependency: 0.85,
    },
  );
}

describe('intent translator MG contract', () => {
  it('translates numeric visual evidence without emitting a graphicType preset', () => {
    const result = translate(buildPlan([{
      type: 'visual-explanation',
      kind: 'numeric',
      value: '42%',
      label: 'conversion lift',
      triggerMoment: 'at scene start',
    }]));

    const graphic = result.decisions.find((decision) => decision.type === 'graphic');

    expect(graphic?.params).toMatchObject({
      kind: 'numeric',
      value: '42%',
      label: 'conversion lift',
      signals: {
        formality: 0.8,
        enthusiasm: 0.9,
        visual_dependency: 0.85,
      },
    });
    expect(graphic?.params).not.toHaveProperty('graphicType');
  });

  it('preserves comparison atoms instead of collapsing them into a text preset', () => {
    const result = translate(buildPlan([{
      type: 'visual-explanation',
      kind: 'comparison',
      from: 'Manual review',
      to: 'Automated review',
      fromLabel: 'Before',
      toLabel: 'After',
      relation: 'arrow',
      triggerMoment: 'at decisive moment',
    }]));

    const graphic = result.decisions.find((decision) => decision.type === 'graphic');

    expect(graphic?.params).toMatchObject({
      kind: 'comparison',
      from: 'Manual review',
      to: 'Automated review',
      fromLabel: 'Before',
      toLabel: 'After',
      relation: 'arrow',
    });
    expect(graphic?.params).not.toHaveProperty('graphicType');
    expect(graphic?.params).not.toHaveProperty('text');
  });

  it('keeps the on-screen text safety net from choosing keyword-highlight', () => {
    const result = translate(buildPlan([]), ['Launch velocity']);

    const graphic = result.decisions.find((decision) => decision.type === 'graphic');

    expect(graphic?.sources).toContain('onScreenText-safety-net');
    expect(graphic?.params).toEqual({ text: 'Launch velocity' });
    expect(graphic?.params).not.toHaveProperty('graphicType');
  });

  it('injects licensed transcript semantic facts without promoting weak tiny-rate stats', () => {
    const result = translate(
      buildPlan([]),
      [],
      timedWords('We moved from manual review to automated checks. 90% completion is visible. It was 0.02 humans spoken to per day.'),
    );

    const semanticGraphics = result.decisions.filter((decision) => (
      decision.type === 'graphic' && decision.sources.includes('semantic-fact-extractor')
    ));
    const factKinds = semanticGraphics.map((decision) => decision.params.semanticFactSource?.factKind);

    expect(factKinds).toEqual(expect.arrayContaining(['comparison', 'bounded-stat']));
    expect(semanticGraphics).toHaveLength(2);
    expect(semanticGraphics.some((decision) => decision.params.value === '0.02')).toBe(false);
    expect(JSON.stringify(semanticGraphics)).not.toMatch(/graphicType|template|preset/i);
  });
});

function timedWords(text: string): Array<{ word: string; startMs: number; endMs: number }> {
  return text.split(/\s+/).map((word, index) => ({
    word,
    startMs: index * 180,
    endMs: index * 180 + 120,
  }));
}
