import { describe, expect, it } from 'vitest';

import {
  mgMomentDesignPlanSchema,
  validateDesignPlan,
  type MgDesignPlanMomentContext,
  type MgMomentDesignPlan,
} from '@/lib/editron/motion-graphics/codegen/design/design-plan';

const brief = {
  styleName: 'clean', motifLanguage: 'thin gold rule under key terms', paletteMoves: 'charcoal + gold',
  motionPersonality: 'snappy', formVariety: 'type then structure',
};
const ctxA: MgDesignPlanMomentContext = { momentId: 'b0', factKind: 'narrative', contentProps: ['line'], numericProps: [], startMs: 0 };

const baseMoment = () => ({
  momentId: 'b0', lane: 'overlay-kit', concept: 'a kinetic line lands the idea', targetBar: 'energy',
  primaryCommunicativeJob: 'emphasize',
  structure: { placement: 'center', grouping: 'headline + rule', readingOrder: 'headline then rule' },
  elements: [
    { kind: 'headline', role: 'the spoken line', dataProps: ['line'] },
    { kind: 'rule', role: 'motif underline', dataProps: [] },
  ],
  motion: { enterOrder: [0], build: 'headline enters', hold: 'float', syncTo: 'word-onsets' },
  look: 'integrated',
});

describe('Phase-3 plan extension (brief §6.6)', () => {
  it('primaryCommunicativeJob is REQUIRED on every designed moment', () => {
    const noJob: Partial<ReturnType<typeof baseMoment>> = { ...baseMoment() };
    delete noJob.primaryCommunicativeJob;
    expect(() => mgMomentDesignPlanSchema.parse(noJob)).toThrow(/primaryCommunicativeJob/);
  });

  it('an invalid communicative job value is rejected (local semantic enum, not a genre label)', () => {
    expect(() => mgMomentDesignPlanSchema.parse({ ...baseMoment(), primaryCommunicativeJob: 'talking-head' })).toThrow();
  });

  it('new fields default safely: intentionalDeviations = []; taste contract absent', () => {
    const parsed = mgMomentDesignPlanSchema.parse(baseMoment());
    expect(parsed.intentionalDeviations).toEqual([]);
    expect(parsed.tasteContractId).toBeUndefined();
    expect(parsed.semanticPayload).toBeUndefined();
  });

  it('accepts the full taste-aware moment (contract id+hash, payload, deviations)', () => {
    const parsed = mgMomentDesignPlanSchema.parse({
      ...baseMoment(),
      tasteContractId: 'vtc-abc123',
      tasteContractHash: 'deadbeef',
      semanticPayload: 'quality outruns quantity',
      intendedViewerResponse: 'the claim now feels inevitable',
      visualMetaphor: 'a line overtaking another line',
      intentionalDeviations: [{ property: 'accent', reason: 'the licensed number is the only accent this video' }],
    });
    expect(parsed.tasteContractId).toBe('vtc-abc123');
    expect(parsed.intentionalDeviations).toHaveLength(1);
  });

  it('validation enforces tasteContract id+hash pairing (both or neither, §6.6/§21)', () => {
    const half = { ...baseMoment(), tasteContractId: 'vtc-x', tasteContractHash: undefined, intentionalDeviations: [] } as unknown as MgMomentDesignPlan;
    const r = validateDesignPlan({ brief, moments: [half], declined: [] }, [ctxA]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => /tasteContractId and tasteContractHash/.test(p))).toBe(true);
    const both = { ...baseMoment(), tasteContractId: 'vtc-x', tasteContractHash: 'h', intentionalDeviations: [] } as unknown as MgMomentDesignPlan;
    expect(validateDesignPlan({ brief, moments: [both], declined: [] }, [ctxA]).ok).toBe(true);
  });
});
