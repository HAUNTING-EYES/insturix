import { describe, expect, it } from 'vitest';
import {
  evaluateWriterPromotionGate,
  type WriterPromotionRun,
} from '../../scripts/prompt-optimization/thinkforge-writer-promotion-gate';

function passingRun(overrides: Partial<WriterPromotionRun> = {}): WriterPromotionRun {
  return {
    caseId: 9,
    caseName: 'Held-out B2B SaaS post',
    seed: 1,
    deterministicScore: 0.96,
    judge: {
      overall: 96,
      fabricationHardFail: false,
      internalLeakageHardFail: false,
    },
    ...overrides,
  };
}

describe('ThinkForge writer promotion gate', () => {
  it('passes only a complete held-out run that clears both 95% averages', () => {
    const verdict = evaluateWriterPromotionGate([
      passingRun(),
      passingRun({ caseId: 10, seed: 2, deterministicScore: 0.95, judge: {
        overall: 95,
        fabricationHardFail: false,
        internalLeakageHardFail: false,
      } }),
    ], true);

    expect(verdict.passed).toBe(true);
    expect(verdict.metrics.promotionScore).toBe(95.5);
    expect(verdict.failures).toEqual([]);
  });

  it('counts generation errors as zero instead of excluding them from the aggregate', () => {
    const verdict = evaluateWriterPromotionGate([
      passingRun(),
      passingRun({ caseId: 10, error: 'writer timed out', judge: undefined }),
    ], true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.deterministicMin).toBe(0);
    expect(verdict.metrics.generationErrors).toBe(1);
    expect(verdict.failures).toContain('generation_errors:1');
  });

  it('fails missing judgments, judge errors, fabrication, and internal leakage', () => {
    const verdict = evaluateWriterPromotionGate([
      passingRun({ judge: {
        overall: 99,
        fabricationHardFail: true,
        internalLeakageHardFail: true,
      } }),
      passingRun({ caseId: 10, judge: undefined, judgeError: 'invalid JSON' }),
    ], true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.judgeCoverage).toBe(0.5);
    expect(verdict.failures).toEqual(expect.arrayContaining([
      'judge_errors:1',
      'judge_coverage:0.5000',
      'fabrication_hard_fails:1',
      'internal_leakage_hard_fails:1',
    ]));
  });

  it('does not promote partial or exploratory runs', () => {
    const verdict = evaluateWriterPromotionGate([passingRun()], false);

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('run_not_promotion_eligible');
  });
});
