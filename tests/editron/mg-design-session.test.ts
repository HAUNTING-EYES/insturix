import { describe, expect, it, vi } from 'vitest';

import { runVideoDesignSession, type MgDesignerGenerate } from '@/lib/editron/motion-graphics/codegen/design/design-session';
import { buildDesignerPrompt } from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
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
    primaryCommunicativeJob: 'emphasize', semanticPayload: 'quality outruns quantity',
    intentionalDeviations: [],
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

const acceptedReview = JSON.stringify({
  accepted: true,
  packageFailures: { repetitiveWithinVideo: false },
  moments: [{
    momentId: 'b0', accepted: true,
    hardFailures: {
      decorativeFormOnly: false, primitiveChecklist: false, genericPrimitiveStack: false, missingVisualEncoding: false,
      flatHierarchy: false, decorativeMotionOnly: false, footageConflict: false,
    },
    issues: [],
  }],
  issues: [],
});

const rejectedReview = JSON.stringify({
  accepted: false,
  packageFailures: { repetitiveWithinVideo: false },
  moments: [{
    momentId: 'b0', accepted: false,
    hardFailures: {
      decorativeFormOnly: true, primitiveChecklist: true, genericPrimitiveStack: false, missingVisualEncoding: true,
      flatHierarchy: false, decorativeMotionOnly: true, footageConflict: false,
    },
    issues: ['a headline plus underline does not visually explain the licensed idea'],
  }],
  issues: [],
});

const genericPrimitiveReview = JSON.stringify({
  accepted: false,
  packageFailures: { repetitiveWithinVideo: false },
  moments: [{
    momentId: 'b0', accepted: false,
    hardFailures: {
      decorativeFormOnly: false, primitiveChecklist: false, genericPrimitiveStack: true,
      missingVisualEncoding: false, flatHierarchy: false, decorativeMotionOnly: false, footageConflict: false,
    },
    issues: ['the standard mark, readout, and label could be reused unchanged for an unrelated fact'],
  }],
  issues: [],
});

describe('MG video design session — the injected brain', () => {
  it('a valid plan on the first attempt is returned (attempts=1)', async () => {
    const gen = fakeGen([JSON.stringify(validPlan), acceptedReview]);
    const r = await runVideoDesignSession({ designer, contexts }, { generate: gen });
    expect(r.plan).not.toBeNull();
    expect(r.attempts).toBe(1);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('★ an invalid plan retries ONCE with the reason fed back, then succeeds (attempts=2)', async () => {
    // attempt 1: a text-only design (no form element) → validator rejects; attempt 2: the valid plan
    const badPlan = { ...validPlan, moments: [{ ...validPlan.moments[0], elements: [{ kind: 'headline', role: 'x', dataProps: ['line'] }], look: 'integrated', motion: { enterOrder: [0], build: 'fade', hold: 'still', syncTo: 'phases-only' } }] };
    const gen = fakeGen([JSON.stringify(badPlan), JSON.stringify(validPlan), acceptedReview]);
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

  it('★ F2: an over-budget plan is TRIMMED to the top-N by salience, not voided', async () => {
    const overBudget = {
      ...validPlan,
      moments: [validPlan.moments[0], { ...validPlan.moments[0], momentId: 'b1' }],
    };
    const twoCtx = [...contexts, { momentId: 'b1', factKind: 'narrative', contentProps: ['line'], numericProps: [], startMs: 3000 }];
    const twoMoments = [moment, { ...moment, momentId: 'b1', salience: 0.2 }]; // b1 lower salience → trimmed first
    const r = await runVideoDesignSession(
      { designer: { ...designer, moments: twoMoments, budget: { maxMoments: 1, minSpacingSec: 3, rationale: 't' } }, contexts: twoCtx },
      { generate: fakeGen([JSON.stringify(overBudget), acceptedReview]) },
    );
    expect(r.plan).not.toBeNull();
    expect(r.plan!.moments.map((m) => m.momentId)).toEqual(['b0']); // the higher-salience beat survives
    expect(r.plan!.declined.some((d) => d.momentId === 'b1' && /trimmed/.test(d.reason))).toBe(true); // the rest → declined
  });
});

describe('MG design-quality ownership', () => {
  it('rejects a generic primitive stack and sends the specific failure back to the designer', async () => {
    const gen = fakeGen([
      JSON.stringify(validPlan),
      genericPrimitiveReview,
      JSON.stringify(validPlan),
      acceptedReview,
    ]);

    const result = await runVideoDesignSession({ designer, contexts }, { generate: gen });

    expect(result.plan).not.toBeNull();
    expect(result.attempts).toBe(2);
    const retryParts = (gen as unknown as { mock: { calls: unknown[][] } }).mock.calls[2][0] as Array<{ kind: string; text?: string }>;
    const retryFeedback = [...retryParts].reverse().find((part) => part.kind === 'text')?.text ?? '';
    expect(retryFeedback).toContain('genericPrimitiveStack');
    expect(buildDesignerPrompt(designer)).toContain('same arrangement could be reused');
  });

  it('routes a weak but structurally valid plan back to the designer before code generation', async () => {
    const strengthenedPlan: MgVideoDesignPlan = {
      ...validPlan,
      moments: [{
        ...validPlan.moments[0],
        concept: 'a visual balance resolves from quantity toward quality',
        structure: {
          placement: 'center-right',
          grouping: 'contrasting weighted terms connected by a resolving path',
          readingOrder: 'quantity tension, path movement, quality resolution',
        },
        elements: [
          { kind: 'headline', role: 'the quality outcome', dataProps: ['line'] },
          { kind: 'reveal', role: 'the relationship resolving toward quality', dataProps: [] },
          { kind: 'dot', role: 'the visual weight carried by quantity', dataProps: [] },
        ],
        motion: {
          enterOrder: [2, 1, 0],
          build: 'weight appears, path resolves it, quality lands on the final word onset',
          hold: 'the resolved relationship remains legible',
          syncTo: 'word-onsets',
        },
      }],
    };
    const gen = fakeGen([
      JSON.stringify(validPlan),
      rejectedReview,
      JSON.stringify(strengthenedPlan),
      acceptedReview,
    ]);

    const result = await runVideoDesignSession({ designer, contexts }, { generate: gen });

    expect(result.plan?.moments[0]?.concept).toContain('visual balance');
    expect(result.attempts).toBe(2);
    const retryParts = (gen as unknown as { mock: { calls: unknown[][] } }).mock.calls[2][0] as Array<{ kind: string; text?: string }>;
    const retryFeedback = [...retryParts].reverse().find((part) => part.kind === 'text')?.text ?? '';
    expect(retryFeedback).toContain('design-quality review rejected');
    expect(retryFeedback).toContain('headline plus underline');
  });

  it('★ a repeated per-moment design-quality rejection salvages to an honest ALL-DECLINED plan (never unavailable)', async () => {
    const gen = fakeGen([
      JSON.stringify(validPlan),
      rejectedReview,
      JSON.stringify(validPlan),
      rejectedReview,
    ]);

    const result = await runVideoDesignSession({ designer, contexts }, { generate: gen });

    // Not plan:null → not a system-level 'unavailable'. The single designed beat is honestly DECLINED with its
    // critic reason so the pre-pass records a per-moment decline (brief §7.2), exactly the live-repro fix.
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moments).toHaveLength(0);
    expect(result.plan!.declined.some((d) => d.momentId === 'b0' && /does not visually explain|decorative/.test(d.reason))).toBe(true);
    expect(result.reason).toContain('quality-salvaged');
    expect(result.attempts).toBe(2);
  });

  it('keeps independently accepted moments when a sibling repeatedly fails design quality', async () => {
    const secondMoment = { ...moment, momentId: 'b1', sourceText: 'a second complete thought', salience: 0.5 };
    const twoMomentPlan: MgVideoDesignPlan = {
      ...validPlan,
      moments: [validPlan.moments[0], { ...validPlan.moments[0], momentId: 'b1', concept: 'a weak sibling design' }],
    };
    const partialReview = JSON.stringify({
      accepted: false,
      packageFailures: { repetitiveWithinVideo: false },
      moments: [
        {
          momentId: 'b0', accepted: true,
          hardFailures: {
            decorativeFormOnly: false, primitiveChecklist: false, genericPrimitiveStack: false, missingVisualEncoding: false,
            flatHierarchy: false, decorativeMotionOnly: false, footageConflict: false,
          },
          issues: [],
        },
        {
          momentId: 'b1', accepted: false,
          hardFailures: {
            decorativeFormOnly: true, primitiveChecklist: false, genericPrimitiveStack: false, missingVisualEncoding: true,
            flatHierarchy: false, decorativeMotionOnly: false, footageConflict: false,
          },
          issues: ['the sibling is ornamental rather than explanatory'],
        },
      ],
      issues: [],
    });
    const result = await runVideoDesignSession(
      {
        designer: {
          ...designer,
          moments: [moment, secondMoment],
          budget: { maxMoments: 2, minSpacingSec: 3, rationale: 'test' },
        },
        contexts: [contexts[0], { ...contexts[0], momentId: 'b1', startMs: 5_000 }],
      },
      { generate: fakeGen([JSON.stringify(twoMomentPlan), partialReview, JSON.stringify(twoMomentPlan), partialReview]) },
    );

    expect(result.plan?.moments.map((entry) => entry.momentId)).toEqual(['b0']);
    expect(result.plan?.declined).toEqual(expect.arrayContaining([
      expect.objectContaining({ momentId: 'b1', reason: expect.stringContaining('quality review') }),
    ]));
    expect(result.reason).toContain('quality-salvaged');
  });

  it('rejects critic output that omits a designed moment instead of treating it as accepted', async () => {
    const twoMomentPlan: MgVideoDesignPlan = {
      ...validPlan,
      moments: [validPlan.moments[0], { ...validPlan.moments[0], momentId: 'b1' }],
    };
    const result = await runVideoDesignSession(
      {
        designer: {
          ...designer,
          moments: [moment, { ...moment, momentId: 'b1' }],
          budget: { maxMoments: 2, minSpacingSec: 3, rationale: 'test' },
        },
        contexts: [contexts[0], { ...contexts[0], momentId: 'b1', startMs: 5_000 }],
      },
      { generate: fakeGen([JSON.stringify(twoMomentPlan), acceptedReview, JSON.stringify(twoMomentPlan), acceptedReview]) },
    );

    expect(result.plan).toBeNull();
    expect(result.reason).toContain('coverage invalid');
  });

  it('rejects an unexplained package-level failure even when every moment receipt says accepted', async () => {
    const inconsistentReview = JSON.stringify({
      ...JSON.parse(acceptedReview),
      accepted: false,
    });
    const result = await runVideoDesignSession(
      { designer, contexts },
      { generate: fakeGen([JSON.stringify(validPlan), inconsistentReview, JSON.stringify(validPlan), inconsistentReview]) },
    );

    expect(result.plan).toBeNull();
    expect(result.reason).toContain('critic rejected the design without a reason');
  });
});

describe('designer prompt — the subject box reaches the designer (P5-2b)', () => {
  it('renders a beat\'s real subject box when present, and omits the line when absent', () => {
    const withBox = buildDesignerPrompt({ ...designer, moments: [{ ...moment, subjectBox: { x: 0.5, y: 0.15, width: 0.2, height: 0.5 } }] });
    expect(withBox).toMatch(/subject box \(design clear of it/);
    expect(withBox).toContain('x=0.50 y=0.15 w=0.20 h=0.50');
    expect(buildDesignerPrompt(designer)).not.toMatch(/subject box/); // no box on the beat → no line
  });
});
