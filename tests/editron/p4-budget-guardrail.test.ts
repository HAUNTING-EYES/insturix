import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
    })),
  })),
}));
vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadGeneratedImage: vi.fn(async () => 'https://example.com/generated.png'),
  uploadGeneratedVideo: vi.fn(async () => 'https://example.com/generated.mp4'),
}));

import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { DecisionBudget } from '../../lib/editron/services/decision-budget';
import { computeDecisionBudget, validateAndGate } from '../../lib/editron/services/creative-brief';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import type { GenreParameters } from '../../lib/editron/services/graph-query';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';

describe('P4 budget as guardrail, not guide rail', () => {
  it('does not source-cap grounded graphic facts by graphic_density or LLM confidence', () => {
    const budget = computeDecisionBudget(genre({ graphic_density: 0.1 }), 120);
    const raw = {
      video_understanding: {},
      narrative_arc: [],
      decisions: Array.from({ length: 5 }, (_unused, index) => ({
        type: 'graphic_callout',
        target_word_idx: index,
        confidence: 0.55 + index * 0.05,
        reason: 'emphasis_word',
        params: {
          title: `Concept ${index + 1}`,
          body: `Evidence phrase ${index + 1}`,
          semanticAtoms: {
            concept: `concept-${index + 1}`,
            evidencePhrase: `evidence phrase ${index + 1}`,
            truth: { warranted: true },
          },
        },
      })),
      audio_design: {},
      caption_style: 'key_phrases',
      overall_pacing: 'balanced',
    };

    const brief = validateAndGate(raw, 0, budget, 'speech');

    expect(budget.graphic.max).toBeGreaterThan(1);
    expect(brief?.decisions.filter((decision) => decision.type.startsWith('graphic_'))).toHaveLength(5);
  });

  it('lets distinct nearby graphics survive while rejecting duplicate/stacked clutter', () => {
    const budget = new DecisionBudget(30_000, 30);
    const stat = graphicDecision(60, 'graphic_stat_counter', { value: '73%', label: 'retention' });
    const lowerThird = graphicDecision(80, 'graphic_lower_third', { name: 'Hank Green', title: 'Creator' });
    const duplicateStat = graphicDecision(82, 'graphic_stat_counter', { value: '73%', label: 'retention' });
    const quote = graphicDecision(85, 'graphic_quote_card', { quote: 'The data does not lie' });

    expect(budget.evaluate(stat).allowed).toBe(true);
    budget.commit(stat);
    expect(budget.evaluate(lowerThird).allowed).toBe(true);
    budget.commit(lowerThird);
    expect(budget.evaluate(duplicateStat)).toEqual(expect.objectContaining({ allowed: false, ruleId: 'G-102' }));
    expect(budget.evaluate(quote)).toEqual(expect.objectContaining({ allowed: false, ruleId: 'G-101' }));
  });

  it('executes two distinct graphic facts 20 frames apart', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([
      {
        type: 'graphic',
        frame: 60,
        durationFrames: 90,
        confidence: 0.95,
        reason: 'number fact deserves an MG',
        params: {
          creativeDecisionType: 'graphic_stat_counter',
          value: '73%',
          label: 'retention',
          contextPhrase: 'seventy three percent retention',
          contextStartMs: 2000,
          contextEndMs: 3300,
          semanticAtoms: {
            quantity: { displayText: '73%', label: 'retention', kind: 'percentage', unit: '%', denominator: 100, bounded: true },
            evidencePhrase: '73 percent retention',
            truth: { warranted: true },
          },
          signals: { visual_significance: 0.82, speech_energy: 0.78, text_on_screen: 0.1 },
        },
      },
      {
        type: 'graphic',
        frame: 80,
        durationFrames: 90,
        confidence: 0.95,
        reason: 'entity introduction deserves a lower-third',
        params: {
          creativeDecisionType: 'graphic_lower_third',
          name: 'Hank Green',
          title: 'Creator',
          contextPhrase: 'Hank Green explains the idea',
          contextStartMs: 2600,
          contextEndMs: 3900,
          semanticAtoms: {
            identity: { name: 'Hank Green', role: 'Creator' },
            evidencePhrase: 'Hank Green explains',
            truth: { warranted: true },
          },
          signals: { visual_significance: 0.74, speech_energy: 0.64, text_on_screen: 0.1 },
        },
      },
    ]);

    const result = await executeEDL(edl, 'p4-distinct-graphics-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const graphics = overlays.filter((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC || overlay.type === OverlayType.HTML_SCENE);
    expect(result.decisionsExecuted).toBe(2);
    expect(result.overlaysCreated).toBe(2);
    expect(graphics).toHaveLength(2);
  });
});

function graphicDecision(frame: number, creativeDecisionType: string, params: Record<string, unknown>) {
  return {
    type: 'graphic',
    frame,
    durationFrames: 90,
    confidence: 0.95,
    params: {
      creativeDecisionType,
      ...params,
    },
  };
}

function genre(overrides: Partial<GenreParameters>): GenreParameters {
  return {
    pacing_tolerance: 5,
    energy_baseline: 0.4,
    transition_density: 8,
    graphic_density: 1,
    silence_tolerance: 1,
    zoom_budget: 4,
    sfx_density: 0.3,
    color_temperature: 0,
    formality: 0.5,
    ...overrides,
  };
}

function decisionList(decisions: Array<Record<string, any>>): EditDecisionList {
  return {
    projectId: 'p4-budget-guardrail-test',
    generatedAt: new Date('2026-06-22T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions: decisions.map((decision, index) => ({
      priority: 3,
      source: 'signal-executor:test',
      signal: 'semantic-graphic',
      ...decision,
      id: decision.id ?? `decision-${index}`,
    })) as any,
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: decisions.length,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: 0.95,
    },
  };
}

function videoOverlay(): Overlay {
  return {
    id: 901,
    type: OverlayType.VIDEO,
    from: 0,
    durationInFrames: 240,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    content: 'https://example.com/source.mp4',
    src: 'https://example.com/source.mp4',
    styles: { opacity: 1 },
  } as Overlay;
}