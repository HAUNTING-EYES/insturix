import { describe, expect, it, vi } from 'vitest';

import { runDesignPrepass, type MgDesignPrepassBeat } from '@/lib/editron/motion-graphics/codegen/design/design-prepass';
import type { MgDesignerGenerate } from '@/lib/editron/motion-graphics/codegen/design/design-session';
import type { MgDesignerMoment } from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
import type { MgMomentDesignPlan, MgDesignPlanMomentContext, MgVideoDesignPlan } from '@/lib/editron/motion-graphics/codegen/design/design-plan';
import type { MgDensityBudget } from '@/lib/editron/motion-graphics/codegen/design/density-budget';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { resolveVideoStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

// The key is an opaque handle (in production the EditDecision itself, by reference). Distinct objects here.
const keyA = { id: 'a' };
const keyB = { id: 'b' };

const mkMoment = (id: string): MgDesignerMoment => ({
  momentId: id, factKind: 'narrative', sourceText: 'quality over quantity wins every time',
  contentProps: [{ name: 'line', kind: 'text' }], tier: 'standard', salience: 0.6,
  room: 'center band, clear of subject', durationFrames: 75,
});
const mkContext = (id: string, startMs: number): MgDesignPlanMomentContext => ({
  momentId: id, factKind: 'narrative', contentProps: ['line'], numericProps: [], startMs,
});
const beats: Array<MgDesignPrepassBeat<{ id: string }>> = [
  { key: keyA, moment: mkMoment('b0'), context: mkContext('b0', 0) },
  { key: keyB, moment: mkMoment('b1'), context: mkContext('b1', 5_000) },
];

const budget: MgDensityBudget = { maxMoments: 2, minSpacingSec: 3, rationale: 'test' };
const videoStyle = resolveVideoStyle({ brandFont: INSTURIX.fontSans, videoSignals: { energy: 0.5 } });

const designedMoment = (id: string): MgMomentDesignPlan => ({
  momentId: id, lane: 'overlay-kit', concept: `kinetic line for ${id}`, targetBar: 'energy',
  structure: { placement: 'center', grouping: 'headline + underline', readingOrder: 'headline then rule' },
  elements: [
    { kind: 'headline', role: 'the spoken line', dataProps: ['line'] },
    { kind: 'rule', role: 'motif underline', dataProps: [] },
  ],
  motion: { enterOrder: [0, 1], build: 'headline enters, rule draws', hold: 'gentle float', syncTo: 'word-onsets' },
  look: 'integrated',
});
const brief: MgVideoDesignPlan['brief'] = {
  styleName: 'clean', motifLanguage: 'thin gold rule under key terms', paletteMoves: 'charcoal + gold',
  motionPersonality: 'snappy', formVariety: 'type then structure',
};
const fakeGen = (text: string): MgDesignerGenerate => vi.fn(async () => text);

describe('runDesignPrepass — video-level design pre-pass → per-decision plan map', () => {
  it('★ maps each designed moment back to its opaque key (the decision reference)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.plans.size).toBe(2);
    expect(r.plans.get(keyA)?.plan.momentId).toBe('b0'); // keyed by REFERENCE, not momentId string
    expect(r.plans.get(keyB)?.plan.momentId).toBe('b1');
    expect(r.plans.get(keyA)?.brief.motifLanguage).toContain('gold rule'); // the shared brief rides on every entry
  });

  it('★ a designer-DECLINED beat gets no key → it falls back to free-form (absent, not fabricated)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0')], declined: [{ momentId: 'b1', reason: 'already on screen' }] };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.plans.size).toBe(1);
    expect(r.plans.has(keyA)).toBe(true);
    expect(r.plans.has(keyB)).toBe(false); // declined → no design → free-form fallback downstream
  });

  it('a failed session (unparseable) → empty map, every beat falls back, never throws', async () => {
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen('not json') });
    expect(r.plans.size).toBe(0);
    expect(r.reason).toBeTruthy();
  });

  it('no beats → empty map, zero attempts, no model call', async () => {
    const gen = fakeGen('unused');
    const r = await runDesignPrepass({ beats: [], videoStyle, brand: INSTURIX, budget }, { generate: gen });
    expect(r.plans.size).toBe(0);
    expect(r.attempts).toBe(0);
    expect(gen).not.toHaveBeenCalled();
  });

  it('★ passes sampled footage frames through to the designer session (multimodal, Phase D)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    let receivedParts: Array<{ kind: string; data?: string }> = [];
    const gen: MgDesignerGenerate = vi.fn(async (parts) => { receivedParts = parts; return JSON.stringify(plan); });
    const images = { footageFrames: [{ mimeType: 'image/webp', data: 'Zm9vdGFnZQ==' }] };
    await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget, images }, { generate: gen });
    expect(receivedParts.some((p) => p.kind === 'image' && p.data === 'Zm9vdGFnZQ==')).toBe(true); // the real frame reached the model
  });

  it('★ F2: over-budget → the session TRIMS to the top-N by salience; the survivor attaches, the rest fall back', async () => {
    const tightBudget: MgDensityBudget = { maxMoments: 1, minSpacingSec: 3, rationale: 'tight' };
    const rankedBeats: Array<MgDesignPrepassBeat<{ id: string }>> = [
      { key: keyA, moment: { ...mkMoment('b0'), salience: 0.8 }, context: mkContext('b0', 0) }, // higher salience → kept
      { key: keyB, moment: { ...mkMoment('b1'), salience: 0.3 }, context: mkContext('b1', 5_000) }, // trimmed → free-form
    ];
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    const r = await runDesignPrepass({ beats: rankedBeats, videoStyle, brand: INSTURIX, budget: tightBudget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.plans.size).toBe(1);
    expect(r.plans.has(keyA)).toBe(true);
    expect(r.plans.has(keyB)).toBe(false);
  });
});
