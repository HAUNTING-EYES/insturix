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
const isDesignReview = (parts: Parameters<MgDesignerGenerate>[0]): boolean => parts.some(
  (part) => part.kind === 'text' && part.text.includes('independent motion-design PLAN critic'),
);
const acceptedReviewFor = (parts: Parameters<MgDesignerGenerate>[0]): string => {
  const payload = parts.find((part) => part.kind === 'text' && part.text.includes('<design_plan>'));
  const match = payload?.kind === 'text' ? payload.text.match(/<design_plan>([\s\S]*?)<\/design_plan>/) : null;
  if (!match) throw new Error('design-review fixture did not receive the reviewed plan');
  const plan = JSON.parse(match[1]) as MgVideoDesignPlan;
  return JSON.stringify({
    accepted: true,
    packageFailures: { repetitiveWithinVideo: false },
    moments: plan.moments.map((entry) => ({
      momentId: entry.momentId,
      accepted: true,
      hardFailures: {
        decorativeFormOnly: false,
        primitiveChecklist: false,
        genericPrimitiveStack: false,
        missingVisualEncoding: false,
        flatHierarchy: false,
        decorativeMotionOnly: false,
        footageConflict: false,
      },
      issues: [],
    })),
    issues: [],
  });
};
const fakeGen = (text: string): MgDesignerGenerate => vi.fn(async (parts) => (
  isDesignReview(parts) ? acceptedReviewFor(parts) : text
));

const rejectingReviewFor = (parts: Parameters<MgDesignerGenerate>[0], opts: { packageFailure?: boolean } = {}): string => {
  const payload = parts.find((part) => part.kind === 'text' && part.text.includes('<design_plan>'));
  const match = payload?.kind === 'text' ? payload.text.match(/<design_plan>([\s\S]*?)<\/design_plan>/) : null;
  if (!match) throw new Error('reject-review fixture did not receive the reviewed plan');
  const plan = JSON.parse(match[1]) as MgVideoDesignPlan;
  return JSON.stringify({
    accepted: false,
    packageFailures: { repetitiveWithinVideo: opts.packageFailure ?? false },
    moments: plan.moments.map((entry) => ({
      momentId: entry.momentId,
      accepted: false,
      hardFailures: {
        decorativeFormOnly: true,
        primitiveChecklist: false,
        genericPrimitiveStack: true,
        missingVisualEncoding: false,
        flatHierarchy: false,
        decorativeMotionOnly: false,
        footageConflict: false,
      },
      issues: ['lone rule and a dot — decorative primitives, not a composed visual system'],
    })),
    issues: opts.packageFailure ? ['repetitive within video'] : [],
  });
};
const fakeReviewReject = (text: string, opts?: { packageFailure?: boolean }): MgDesignerGenerate => (
  vi.fn(async (parts) => (isDesignReview(parts) ? rejectingReviewFor(parts, opts) : text))
);

describe('runDesignPrepass — video-level design authority ledger', () => {
  it('★ maps each designed moment back to its opaque key (the decision reference)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.dispositions.size).toBe(2);
    expect(r.dispositions.get(keyA)).toMatchObject({ status: 'approved', design: { plan: { momentId: 'b0' } } });
    expect(r.dispositions.get(keyB)).toMatchObject({ status: 'approved', design: { plan: { momentId: 'b1' } } });
    expect(r.dispositions.get(keyA)).toMatchObject({ design: { brief: { motifLanguage: expect.stringContaining('gold rule') } } });
  });

  it('★ preserves a designer decline as an explicit authority outcome', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0')], declined: [{ momentId: 'b1', reason: 'already on screen' }] };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.dispositions.get(keyA)?.status).toBe('approved');
    expect(r.dispositions.get(keyB)).toEqual({ status: 'declined', reason: 'already on screen' });
  });

  it('a failed session marks every offered beat unavailable instead of licensing free-form output', async () => {
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, { generate: fakeGen('not json') });
    expect(r.dispositions.size).toBe(2);
    expect(r.dispositions.get(keyA)).toMatchObject({ status: 'unavailable', reason: expect.any(String) });
    expect(r.dispositions.get(keyB)).toMatchObject({ status: 'unavailable', reason: expect.any(String) });
    expect(r.reason).toBeTruthy();
  });

  it('★ a critic reject of ALL designed moments salvages to honest per-moment DECLINED — never unavailable (live-repro: 240-char fix + one-bad-plan-kills-everything trap)', async () => {
    // Mirrors the live vlogbrothers run: designer designs ONE beat; the plan critic rejects it
    // (decorativeFormOnly / genericPrimitiveStack). Fix: per-moment decline with the critic reason,
    // not a wholesale "video-level designer unavailable" that voids every beat.
    const plan: MgVideoDesignPlan = {
      brief,
      moments: [designedMoment('b0')],
      declined: [{ momentId: 'b1', reason: 'already on screen' }],
    };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, {
      generate: fakeReviewReject(JSON.stringify(plan)),
      maxAttempts: 1,
    });
    expect(r.dispositions.size).toBe(2);
    expect(r.dispositions.get(keyA)?.status).toBe('declined');
    expect(r.dispositions.get(keyA)).toMatchObject({ reason: expect.stringContaining('decorative') });
    expect(r.dispositions.get(keyB)).toEqual({ status: 'declined', reason: 'already on screen' });
    expect([...r.dispositions.values()].every((d) => d.status !== 'unavailable')).toBe(true);
  });

  it('a true PACKAGE failure still voids the session to unavailable (designer/quality rejection ≠ system failure, but package ≠ decline)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    const r = await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget }, {
      generate: fakeReviewReject(JSON.stringify(plan), { packageFailure: true }),
      maxAttempts: 1,
    });
    expect(r.dispositions.get(keyA)).toMatchObject({ status: 'unavailable' });
    expect(r.dispositions.get(keyB)).toMatchObject({ status: 'unavailable' });
  });

  it('no beats → empty map, zero attempts, no model call', async () => {
    const gen = fakeGen('unused');
    const r = await runDesignPrepass({ beats: [], videoStyle, brand: INSTURIX, budget }, { generate: gen });
    expect(r.dispositions.size).toBe(0);
    expect(r.attempts).toBe(0);
    expect(gen).not.toHaveBeenCalled();
  });

  it('★ passes sampled footage frames through to the designer session (multimodal, Phase D)', async () => {
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    let receivedParts: Array<{ kind: string; data?: string }> = [];
    const gen: MgDesignerGenerate = vi.fn(async (parts) => {
      receivedParts = parts;
      return isDesignReview(parts) ? acceptedReviewFor(parts) : JSON.stringify(plan);
    });
    const images = { footageFrames: [{ mimeType: 'image/webp', data: 'Zm9vdGFnZQ==' }] };
    await runDesignPrepass({ beats, videoStyle, brand: INSTURIX, budget, images }, { generate: gen });
    expect(receivedParts.some((p) => p.kind === 'image' && p.data === 'Zm9vdGFnZQ==')).toBe(true); // the real frame reached the model
  });

  it('★ F2: over-budget keeps the top-N approved and records the rest as declined', async () => {
    const tightBudget: MgDensityBudget = { maxMoments: 1, minSpacingSec: 3, rationale: 'tight' };
    const rankedBeats: Array<MgDesignPrepassBeat<{ id: string }>> = [
      { key: keyA, moment: { ...mkMoment('b0'), salience: 0.8 }, context: mkContext('b0', 0) }, // higher salience → kept
      { key: keyB, moment: { ...mkMoment('b1'), salience: 0.3 }, context: mkContext('b1', 5_000) }, // trimmed → declined
    ];
    const plan: MgVideoDesignPlan = { brief, moments: [designedMoment('b0'), designedMoment('b1')], declined: [] };
    const r = await runDesignPrepass({ beats: rankedBeats, videoStyle, brand: INSTURIX, budget: tightBudget }, { generate: fakeGen(JSON.stringify(plan)) });
    expect(r.dispositions.get(keyA)?.status).toBe('approved');
    expect(r.dispositions.get(keyB)).toMatchObject({ status: 'declined', reason: expect.stringContaining('trimmed') });
  });
});
