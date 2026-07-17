/**
 * MG design-plan contract battle test (design-then-code Phase 1). The decisive case is TEXT-ONLY REJECTION —
 * tonight's evidence: both GLM-5V and gemini-3.1-pro emitted bare text-lists for a list fact and the text-based
 * judge rationalized them as designed. The contract now makes that a DETERMINISTIC violation before any render.
 */
import { describe, expect, it } from 'vitest';

import {
  mgVideoDesignPlanSchema,
  parseMgVideoDesignPlan,
  validateDesignPlan,
  type MgDesignPlanMomentContext,
  type MgMomentDesignPlan,
  type MgVideoDesignPlan,
} from '@/lib/editron/motion-graphics/codegen/design/design-plan';

const brief = {
  styleName: 'clean-modern',
  motifLanguage: 'a thin gold rule that draws under every key term',
  paletteMoves: 'deep charcoal base, gold accent, cream text; shade the surface for plates',
  motionPersonality: 'snappy entrances, gentle holds',
  formVariety: 'cards for the list, a ring for the stat, kinetic display for the hook — no two adjacent moments share a family',
};

const designedList = (over: Partial<MgMomentDesignPlan> = {}): MgMomentDesignPlan => ({
  momentId: 'm_list',
  lane: 'overlay-kit',
  concept: 'three steps as staggered numbered cards climbing the negative space',
  targetBar: 'vox-clarity',
  structure: {
    placement: 'center-right negative space, clear of subject and caption',
    grouping: 'three plate cards, one per step, each with a dot marker + label',
    readingOrder: 'headline enters first, then cards build top-to-bottom on word onsets',
  },
  elements: [
    { kind: 'headline', role: 'the section title', dataProps: ['label'] },
    { kind: 'plate', role: 'card for each step', dataProps: [], hints: { surface: 'raised' } },
    { kind: 'dot', role: 'step marker per card', dataProps: [] },
    { kind: 'text', role: 'step label inside each card', dataProps: ['items'] },
    { kind: 'rule', role: 'the motif underline beneath the headline', dataProps: [] },
  ],
  motion: { enterOrder: [0, 4, 1, 2, 3], build: 'cards stagger in 4f apart, rising', hold: 'gentle float on the card stack', syncTo: 'word-onsets' },
  ...over,
});

const listCtx: MgDesignPlanMomentContext = { momentId: 'm_list', factKind: 'list', contentProps: ['items', 'label'] };

const plan = (moments: MgMomentDesignPlan[]): MgVideoDesignPlan => ({ brief, moments });

describe('MG design plan — schema strictness', () => {
  it('parses a valid designed plan; rejects unknown keys and >24 moments', () => {
    expect(() => parseMgVideoDesignPlan(plan([designedList()]))).not.toThrow();
    expect(() => mgVideoDesignPlanSchema.parse({ ...plan([designedList()]), surprise: 1 })).toThrow();
    expect(() => mgVideoDesignPlanSchema.parse(plan(Array.from({ length: 25 }, (_, i) => designedList({ momentId: `m${i}` }))))).toThrow();
  });
});

describe('MG design plan — the deterministic form floor', () => {
  it('★ THE LAZY-LIST KILLER: a text-only design (headline + text lines, no form element, no imagery) is REJECTED', () => {
    const lazy = designedList({
      elements: [
        { kind: 'headline', role: 'title', dataProps: ['label'] },
        { kind: 'text', role: 'the three items as lines', dataProps: ['items'] },
      ],
      motion: { enterOrder: [0, 1], build: 'lines fade in', hold: 'static', syncTo: 'phases-only' },
    });
    const v = validateDesignPlan(plan([lazy]), [listCtx]);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/TEXT-ONLY design/);
  });

  it('a designed list (cards + markers + rule) PASSES the floor', () => {
    expect(validateDesignPlan(plan([designedList()]), [listCtx])).toEqual({ ok: true, problems: [] });
  });

  it('text-only WITH imagery passes the floor (the illustrated-overlay lane carries the form)', () => {
    const illustrated = designedList({
      lane: 'illustrated-overlay',
      elements: [{ kind: 'headline', role: 'title over the scene', dataProps: ['label'] }],
      imagery: { scenePrompt: 'a workbench with three tools arranged left to right, warm workshop light', mode: 'still', paletteDirection: 'warm gold on deep charcoal' },
      motion: { enterOrder: [0], build: 'headline rises as the scene parallaxes', hold: 'breathe', syncTo: 'landing' },
    });
    expect(validateDesignPlan(plan([illustrated]), [listCtx]).ok).toBe(true);
  });
});

describe('MG design plan — grounding + lane guards', () => {
  it('cutaway-scene on a DATA fact is rejected (generative scenes never carry data)', () => {
    const cutaway = designedList({
      lane: 'cutaway-scene',
      elements: [{ kind: 'motif', role: 'ornament', dataProps: [] }],
      imagery: { scenePrompt: 'an editing timeline morphing into a single clean frame', mode: 'motion', paletteDirection: 'muted premium' },
    });
    const v = validateDesignPlan(plan([cutaway]), [{ ...listCtx, factKind: 'comparison' }]);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/generative scenes never carry data/);
  });

  it('cutaway elements binding dataProps are rejected; generative lanes require imagery; overlay-kit must not carry it', () => {
    const boundCutaway = designedList({
      lane: 'cutaway-scene',
      elements: [{ kind: 'ring', role: 'a gauge', dataProps: ['items'] }],
      imagery: { scenePrompt: 'abstract scene', mode: 'still', paletteDirection: 'muted' },
    });
    expect(validateDesignPlan(plan([boundCutaway]), [listCtx]).problems.join(' ')).toMatch(/must not bind data props/);

    const noImagery = designedList({ lane: 'illustrated-overlay' });
    expect(validateDesignPlan(plan([noImagery]), [listCtx]).problems.join(' ')).toMatch(/requires an imagery spec/);

    const overlayWithImagery = designedList({ imagery: { scenePrompt: 'scene', mode: 'still', paletteDirection: 'gold' } });
    expect(validateDesignPlan(plan([overlayWithImagery]), [listCtx]).problems.join(' ')).toMatch(/must not carry imagery/);
  });

  it('unknown dataProp = fabrication-by-reference, rejected; out-of-range enterOrder rejected', () => {
    const phantom = designedList({
      elements: [
        { kind: 'bar', role: 'a bar bound to a prop that does not exist', dataProps: ['growthRate'] },
        { kind: 'headline', role: 'title', dataProps: ['label'] },
      ],
      motion: { enterOrder: [0, 1], build: 'bar grows', hold: 'settle', syncTo: 'beats' },
    });
    const v = validateDesignPlan(plan([phantom]), [listCtx]);
    expect(v.problems.join(' ')).toMatch(/unknown data prop 'growthRate'/);

    const badOrder = designedList({ motion: { enterOrder: [0, 9], build: 'x', hold: 'y', syncTo: 'phases-only' } });
    expect(validateDesignPlan(plan([badOrder]), [listCtx]).problems.join(' ')).toMatch(/out of range/);
  });

  it('coverage: every licensed moment must be designed; invented + duplicate moments rejected', () => {
    const other: MgDesignPlanMomentContext = { momentId: 'm_stat', factKind: 'magnitude-stat', contentProps: ['value', 'unit', 'label'] };
    const missing = validateDesignPlan(plan([designedList()]), [listCtx, other]);
    expect(missing.problems.join(' ')).toMatch(/m_stat: moment has NO design plan/);

    const invented = validateDesignPlan(plan([designedList({ momentId: 'm_ghost' })]), [listCtx]);
    expect(invented.problems.join(' ')).toMatch(/does not exist/);

    const dup = validateDesignPlan(plan([designedList(), designedList()]), [listCtx]);
    expect(dup.problems.join(' ')).toMatch(/duplicate design plan/);
  });
});
