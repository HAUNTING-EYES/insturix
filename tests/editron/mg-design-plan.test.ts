/**
 * MG design-plan contract battle test (design-then-code Phase 1). The decisive case is TEXT-ONLY REJECTION —
 * tonight's evidence: both GLM-5V and gemini-3.1-pro emitted bare text-lists for a list fact and the text-based
 * judge rationalized them as designed. The contract now makes that a DETERMINISTIC violation before any render.
 */
import { describe, expect, it } from 'vitest';

import {
  designOutputMode,
  deriveNumericProps,
  mgVideoDesignPlanSchema,
  parseMgVideoDesignPlan,
  validateDesignPlan,
  salvageDesignPlan,
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
  targetBar: 'clarity',
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
  // the P4 look axis: this design USES plates, so it must declare the panel look with its reason
  look: 'panel',
  panelReason: 'a stepped scorecard: three data-bearing cards need a surfaced readout',
  ...over,
});

const listCtx: MgDesignPlanMomentContext = { momentId: 'm_list', factKind: 'list', contentProps: ['items', 'label'] };

const plan = (moments: MgMomentDesignPlan[], declined: MgVideoDesignPlan['declined'] = []): MgVideoDesignPlan =>
  ({ brief, moments, declined });

describe('salvageDesignPlan — keep the valid moments, decline the bad ones (Fix A, 2026-07-19)', () => {
  const statCtx: MgDesignPlanMomentContext = { momentId: 'm_stat', factKind: 'bounded-stat', contentProps: ['value'], numericProps: ['value'], startMs: 5000 };
  // The exact failure the Hormozi stress run hit: a ring (quantitative mark) bound to no numeric prop.
  const badRing: MgMomentDesignPlan = {
    momentId: 'm_stat', lane: 'overlay-kit', concept: 'a ring bound to nothing', targetBar: 'clarity',
    structure: { placement: 'center', grouping: 'ring', readingOrder: 'ring' },
    elements: [{ kind: 'ring', role: 'progress indicator', dataProps: [] }],
    motion: { enterOrder: [0], build: 'ring draws', hold: 'still', syncTo: 'phases-only' },
    look: 'integrated',
  };

  it('★ one bad moment no longer voids the whole plan — it is dropped, the valid moment survives', () => {
    const p = plan([designedList(), badRing]);
    const ctx = [listCtx, statCtx];
    expect(validateDesignPlan(p, ctx).ok).toBe(false); // the ring triggers the grounding problem
    const s = salvageDesignPlan(p, ctx);
    expect(s).not.toBeNull();
    expect(s!.plan.moments.map((m) => m.momentId)).toEqual(['m_list']); // valid moment kept
    expect(s!.dropped).toContain('m_stat');
    expect(s!.plan.declined.some((d) => d.momentId === 'm_stat')).toBe(true); // bad moment declined with a reason
    expect(validateDesignPlan(s!.plan, ctx).ok).toBe(true); // the salvaged plan is fully valid — every beat covered
  });

  it('an already-valid plan passes through untouched (dropped: [])', () => {
    const p = plan([designedList()]);
    const s = salvageDesignPlan(p, [listCtx]);
    expect(s).not.toBeNull();
    expect(s!.dropped).toEqual([]);
    expect(s!.plan).toBe(p);
  });

  it('when ALL moments are bad, salvage yields a 0-moment plan (the session then returns null → free-form)', () => {
    const s = salvageDesignPlan(plan([badRing]), [statCtx]);
    expect(s).not.toBeNull();
    expect(s!.plan.moments.length).toBe(0);
    expect(s!.plan.declined.some((d) => d.momentId === 'm_stat')).toBe(true);
  });
});

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

  it('4b-3 output-mode routing: opaque ONLY for a full-frame illustrated scene — declared from the plan, never pixels', () => {
    const illustrated = designedList({
      lane: 'illustrated-overlay',
      elements: [{ kind: 'headline', role: 'title over the scene', dataProps: ['label'] }],
      imagery: { scenePrompt: 'a workshop scene', mode: 'still', paletteDirection: 'warm gold on charcoal' },
      motion: { enterOrder: [0], build: 'headline rises', hold: 'breathe', syncTo: 'landing' },
    });
    expect(designOutputMode(illustrated, 'full-frame')).toBe('opaque-scene');
    expect(designOutputMode(illustrated, undefined)).toBe('opaque-scene'); // moment-input defaults region to full-frame
    expect(designOutputMode(illustrated, 'right-third')).toBe('alpha-overlay'); // windowed scene stays an overlay
    expect(designOutputMode(designedList(), 'full-frame')).toBe('alpha-overlay'); // overlay-kit is NEVER opaque
    expect(designOutputMode(designedList({ lane: 'cutaway-scene' }), 'full-frame')).toBe('alpha-overlay'); // cutaway has no component render
  });

  it('coverage: every licensed moment must be designed; invented + duplicate moments rejected', () => {
    const other: MgDesignPlanMomentContext = { momentId: 'm_stat', factKind: 'magnitude-stat', contentProps: ['value', 'unit', 'label'] };
    const missing = validateDesignPlan(plan([designedList()]), [listCtx, other]);
    expect(missing.problems.join(' ')).toMatch(/m_stat: beat has NO design and NO decline/);

    const invented = validateDesignPlan(plan([designedList({ momentId: 'm_ghost' })]), [listCtx]);
    expect(invented.problems.join(' ')).toMatch(/does not exist/);

    const dup = validateDesignPlan(plan([designedList(), designedList()]), [listCtx]);
    expect(dup.problems.join(' ')).toMatch(/duplicate design plan/);
  });
});

describe('MG design plan — beat licensing (the P3.5 door)', () => {
  const narrativeCtx: MgDesignPlanMomentContext = { momentId: 'b_cat', factKind: 'narrative', contentProps: [] };

  it('a declined beat with a reason satisfies coverage — designed XOR declined', () => {
    const v = validateDesignPlan(
      plan([designedList()], [{ momentId: 'b_cat', reason: 'greeting filler, nothing to visualize' }]),
      [listCtx, narrativeCtx],
    );
    expect(v.ok).toBe(true);
  });

  it('designing over the density budget is a deterministic reject', () => {
    const two = [designedList(), designedList({ momentId: 'b_cat', lane: 'cutaway-scene', imagery: { scenePrompt: 'a small cat curled on a windowsill, soft morning light', mode: 'still', paletteDirection: 'warm gold on deep charcoal' }, elements: [{ kind: 'texture', role: 'ornament grain', dataProps: [] }], motion: { enterOrder: [0], build: 'scene breathes', hold: 'slow drift', syncTo: 'phases-only' } })];
    const v = validateDesignPlan(plan(two), [listCtx, narrativeCtx], { maxMoments: 1 });
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/over the density budget/);
  });

  it('declining a beat that does not exist / declining a designed beat / duplicate declines are rejected', () => {
    const ghost = validateDesignPlan(plan([designedList()], [{ momentId: 'b_ghost', reason: 'x' }]), [listCtx]);
    expect(ghost.problems.join(' ')).toMatch(/declines a beat that does not exist/);

    const both = validateDesignPlan(plan([designedList()], [{ momentId: 'm_list', reason: 'x' }]), [listCtx]);
    expect(both.problems.join(' ')).toMatch(/both designed AND declined/);

    const dup = validateDesignPlan(
      plan([designedList()], [{ momentId: 'b_cat', reason: 'x' }, { momentId: 'b_cat', reason: 'y' }]),
      [listCtx, narrativeCtx],
    );
    expect(dup.problems.join(' ')).toMatch(/duplicate decline/);
  });

  it('declining EVERY beat is an honest, valid plan (no-MG beats a forced bad one)', () => {
    const v = validateDesignPlan(
      plan([], [{ momentId: 'm_list', reason: 'idea already on screen' }, { momentId: 'b_cat', reason: 'filler' }]),
      [listCtx, narrativeCtx],
      { maxMoments: 2 },
    );
    expect(v.ok).toBe(true);
  });
});

describe('P4 — the structural look axis', () => {
  it("★ an 'integrated' design containing a plate is REJECTED (boxless has teeth, not opinions)", () => {
    const boxed = designedList({ look: 'integrated', panelReason: undefined });
    const v = validateDesignPlan(plan([boxed]), [listCtx]);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/integrated' cannot contain a 'plate'/);
  });

  it("★ look 'panel' without panelReason is REJECTED; with a reason it passes", () => {
    const unreasoned = designedList({ panelReason: undefined });
    expect(validateDesignPlan(plan([unreasoned]), [listCtx]).problems.join(' ')).toMatch(/panel' without panelReason/);
    expect(validateDesignPlan(plan([designedList()]), [listCtx]).ok).toBe(true);
  });

  it('★ quantitative mark (bar/ring/plot) with no numeric prop bound is REJECTED when numericProps is known', () => {
    const overreach = designedList({
      elements: [
        { kind: 'plot', role: 'quality outweighing quantity', dataProps: ['label'] },
        { kind: 'headline', role: 'title', dataProps: ['label'] },
      ],
      look: 'integrated' as const, panelReason: undefined,
      motion: { enterOrder: [0, 1], build: 'plot draws', hold: 'settle', syncTo: 'phases-only' },
    });
    const ctx = { ...listCtx, numericProps: [] };
    expect(validateDesignPlan(plan([overreach]), [ctx]).problems.join(' ')).toMatch(/binds no numeric data prop/);
    // bound to a real numeric prop → passes; legacy caller (no numericProps) → rule skipped
    const grounded = { ...ctx, contentProps: ['label', 'value'], numericProps: ['value'] };
    const bar = designedList({
      elements: [
        { kind: 'bar', role: 'the true ratio', dataProps: ['value'] },
        { kind: 'headline', role: 'title', dataProps: ['label'] },
      ],
      look: 'integrated' as const, panelReason: undefined,
      motion: { enterOrder: [0, 1], build: 'bar grows', hold: 'settle', syncTo: 'beats' },
    });
    expect(validateDesignPlan(plan([bar]), [grounded]).ok).toBe(true);
    expect(validateDesignPlan(plan([overreach]), [listCtx]).ok).toBe(true);
  });

  it('★ deriveNumericProps: a series values-array counts as numeric; a plot bound to it PASSES (P4 matrix false-positive fix)', () => {
    // the exact matrix case that false-rejected: series values is an all-number array → plottable
    expect(deriveNumericProps({ values: [12, 34, 58, 91], unit: 'k', label: 'signups' })).toEqual(['values']);
    expect(deriveNumericProps({ value: 73, unit: '%', label: 'x' })).toEqual(['value']);
    expect(deriveNumericProps({ items: ['a', 'b'], label: 'steps' })).toEqual([]); // string list is NOT numeric
    expect(deriveNumericProps({ line: 'a spoken sentence' })).toEqual([]);

    const seriesCtx = { momentId: 'm_series', factKind: 'series', contentProps: ['values', 'unit', 'label'], numericProps: deriveNumericProps({ values: [12, 34, 58, 91], unit: 'k', label: 'signups' }) };
    const plot = designedList({
      momentId: 'm_series',
      elements: [
        { kind: 'plot', role: 'the growth trajectory', dataProps: ['values'] },
        { kind: 'headline', role: 'label', dataProps: ['label'] },
      ],
      look: 'integrated' as const, panelReason: undefined,
      motion: { enterOrder: [0, 1], build: 'plot draws point by point', hold: 'settle', syncTo: 'beats' },
    });
    expect(validateDesignPlan(plan([plot]), [seriesCtx]).ok).toBe(true);
  });

  it('★ cutaway without footageRedundancy attestation → reject; with it → pass (founder-approved 2026-07-19)', () => {
    const cutaway = (over: Partial<MgMomentDesignPlan> = {}) => designedList({
      momentId: 'b_cat', lane: 'cutaway-scene',
      elements: [{ kind: 'texture', role: 'grain', dataProps: [] }],
      imagery: { scenePrompt: 'a cat curled on a windowsill, soft light', mode: 'still', paletteDirection: 'warm gold on charcoal' },
      motion: { enterOrder: [0], build: 'scene breathes', hold: 'drift', syncTo: 'phases-only' },
      look: 'integrated' as const, panelReason: undefined,
      ...over,
    });
    const catCtx: MgDesignPlanMomentContext = { momentId: 'b_cat', factKind: 'narrative', contentProps: ['line'] };
    expect(validateDesignPlan(plan([cutaway()]), [catCtx]).problems.join(' ')).toMatch(/footageRedundancy/);
    expect(validateDesignPlan(plan([cutaway({ footageRedundancy: 'speaker on camera throughout; no cat ever visible' })]), [catCtx]).ok).toBe(true);
  });

  it('★ two cutaways within 60s → reject; spaced or untimed → pass', () => {
    const mk = (id: string) => designedList({
      momentId: id, lane: 'cutaway-scene',
      elements: [{ kind: 'texture', role: 'grain', dataProps: [] }],
      imagery: { scenePrompt: 'scene', mode: 'still', paletteDirection: 'gold' },
      motion: { enterOrder: [0], build: 'breathes', hold: 'drift', syncTo: 'phases-only' },
      look: 'integrated' as const, panelReason: undefined,
      footageRedundancy: 'not shown in footage',
    });
    const ctx = (id: string, startMs?: number): MgDesignPlanMomentContext => ({ momentId: id, factKind: 'narrative', contentProps: ['line'], ...(startMs !== undefined ? { startMs } : {}) });
    const close = validateDesignPlan(plan([mk('c1'), mk('c2')]), [ctx('c1', 5_000), ctx('c2', 40_000)]);
    expect(close.problems.join(' ')).toMatch(/spaced/);
    expect(validateDesignPlan(plan([mk('c1'), mk('c2')]), [ctx('c1', 5_000), ctx('c2', 70_000)]).ok).toBe(true);
    expect(validateDesignPlan(plan([mk('c1'), mk('c2')]), [ctx('c1'), ctx('c2')]).ok).toBe(true); // legacy: no startMs → skipped
  });

  it('look defaults to integrated when the designer omits it (the mandate is the default)', () => {
    const parsed = parseMgVideoDesignPlan(plan([designedList({ elements: [
      { kind: 'headline', role: 'title', dataProps: ['label'] },
      { kind: 'rule', role: 'motif underline', dataProps: [] },
    ], look: undefined as never, panelReason: undefined })]));
    expect(parsed.moments[0]!.look).toBe('integrated');
  });
});

describe('P3.5 door — prompt contract snapshot (KIT e1.10)', () => {
  it('coder mandates boxless-first, designer licenses within budget, judge penalizes unmotivated boxes', async () => {
    const { CODER_STABLE_PREFIX } = await import('@/lib/editron/motion-graphics/codegen/design/coder-prompt');
    const { DESIGNER_STABLE_PREFIX } = await import('@/lib/editron/motion-graphics/codegen/design/designer-prompt');
    const { JUDGE_PROMPT } = await import('@/lib/editron/motion-graphics/codegen/prompt');
    const { KIT_VERSION } = await import('@/lib/editron/motion-graphics/codegen/codegen-service');

    expect(KIT_VERSION).toBe('e1.10');
    expect(CODER_STABLE_PREFIX).toMatch(/THE LOOK IS LAW/);
    expect(DESIGNER_STABLE_PREFIX).toMatch(/THE LOOK/);
    expect(DESIGNER_STABLE_PREFIX).toMatch(/COMPLETE spoken thought/);
    expect(CODER_STABLE_PREFIX).toMatch(/BOXLESS FIRST/);
    expect(CODER_STABLE_PREFIX).toMatch(/Plate\s+scrim is the EXCEPTION/);
    expect(DESIGNER_STABLE_PREFIX).toMatch(/<licensing>/);
    expect(DESIGNER_STABLE_PREFIX).toMatch(/SCENE-INTEGRATED FIRST \(boxless\)/);
    expect(DESIGNER_STABLE_PREFIX).toMatch(/"declined"/);
    expect(JUDGE_PROMPT).toMatch(/BOXLESS IS THE PROFESSIONAL DEFAULT/);
  });
});
