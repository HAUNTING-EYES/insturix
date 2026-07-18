import { describe, expect, it, vi } from 'vitest';

import { runVideoDesignSession, type MgDesignerGenerate } from '@/lib/editron/motion-graphics/codegen/design/design-session';
import type { MgDesignerInput, MgDesignerMoment } from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
import type { MgDesignPlanMomentContext, MgVideoDesignPlan } from '@/lib/editron/motion-graphics/codegen/design/design-plan';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { resolveVideoStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

const moment: MgDesignerMoment = {
  momentId: 'b0', factKind: 'narrative', sourceText: 'quality over quantity wins every time',
  contentProps: [{ name: 'line', kind: 'text' }], tier: 'standard', salience: 0.6,
  room: 'center-right band, clear of subject', durationFrames: 75,
};
const designer: MgDesignerInput = {
  intent: 'tutorial', videoStyle: resolveVideoStyle({ brandFont: INSTURIX.fontSans, videoSignals: { energy: 0.5 } }),
  brand: INSTURIX, moments: [moment], budget: { maxMoments: 1, minSpacingSec: 3, rationale: 'test' },
};
const contexts: MgDesignPlanMomentContext[] = [
  { momentId: 'b0', factKind: 'narrative', contentProps: ['line'], numericProps: [], startMs: 0 },
];

const validPlan: MgVideoDesignPlan = {
  brief: { styleName: 'clean', motifLanguage: 'thin gold rule under key terms', paletteMoves: 'charcoal + gold', motionPersonality: 'snappy', formVariety: 'type then structure' },
  moments: [{
    momentId: 'b0', lane: 'overlay-kit', concept: 'kinetic line, quality dominates quantity', targetBar: 'energy',
    structure: { placement: 'center-right', grouping: 'headline + underline', readingOrder: 'headline then rule' },
    elements: [
      { kind: 'headline', role: 'the spoken line', dataProps: ['line'] },
      { kind: 'rule', role: 'motif underline', dataProps: [] },
    ],
    motion: { enterOrder: [0, 1], build: 'headline enters, rule draws', hold: 'gentle float', syncTo: 'word-onsets' },
    look: 'integrated',
  }],
  declined: [],
};

const fakeGen = (responses: string[]): MgDesignerGenerate => {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
};

describe('MG video design session — the injected brain', () => {
  it('a valid plan on the first attempt is returned (attempts=1)', async () => {
    const gen = fakeGen([JSON.stringify(validPlan)]);
    const r = await runVideoDesignSession({ designer, contexts }, { generate: gen });
    expect(r.plan).not.toBeNull();
    expect(r.attempts).toBe(1);
    expect(gen).toHaveBeenCalledOnce();
  });

  it('★ an invalid plan retries ONCE with the reason fed back, then succeeds (attempts=2)', async () => {
    // attempt 1: a text-only design (no form element) → validator rejects; attempt 2: the valid plan
    const badPlan = { ...validPlan, moments: [{ ...validPlan.moments[0], elements: [{ kind: 'headline', role: 'x', dataProps: ['line'] }], look: 'integrated', motion: { enterOrder: [0], build: 'fade', hold: 'still', syncTo: 'phases-only' } }] };
    const gen = fakeGen([JSON.stringify(badPlan), JSON.stringify(validPlan)]);
    const r = await runVideoDesignSession({ designer, contexts }, { generate: gen });
    expect(r.plan).not.toBeNull();
    expect(r.attempts).toBe(2);
    // the retry received the rejection reason in its parts
    const secondCallParts = (gen as unknown as { mock: { calls: unknown[][] } }).mock.calls[1][0] as Array<{ kind: string; text?: string }>;
    const lastText = [...secondCallParts].reverse().find((p) => p.kind === 'text')?.text ?? '';
    expect(lastText).toMatch(/previous_attempt_feedback/);
  });

  it('★ an unfixable plan returns { plan: null, reason } — honest fallback, never fabricated', async () => {
    const garbage = 'not json at all';
    const r = await runVideoDesignSession({ designer, contexts }, { generate: fakeGen([garbage, garbage]) });
    expect(r.plan).toBeNull();
    expect(r.reason).toBeTruthy();
    expect(r.attempts).toBe(2);
  });

  it('a model exception is caught, retried, and resolves to null — never throws', async () => {
    const gen = vi.fn(async () => { throw new Error('429 rate limited'); });
    const r = await runVideoDesignSession({ designer, contexts }, { generate: gen });
    expect(r.plan).toBeNull();
    expect(r.reason).toMatch(/model call failed/);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('★ enforces the density budget: a plan over maxMoments is rejected', async () => {
    const overBudget = {
      ...validPlan,
      moments: [validPlan.moments[0], { ...validPlan.moments[0], momentId: 'b1' }],
    };
    const twoCtx = [...contexts, { momentId: 'b1', factKind: 'narrative', contentProps: ['line'], numericProps: [], startMs: 3000 }];
    const r = await runVideoDesignSession({ designer: { ...designer, budget: { maxMoments: 1, minSpacingSec: 3, rationale: 't' } }, contexts: twoCtx }, { generate: fakeGen([JSON.stringify(overBudget)]) });
    expect(r.plan).toBeNull();
    expect(r.reason).toMatch(/budget/);
  });
});
