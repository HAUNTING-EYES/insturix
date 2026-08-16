import { describe, expect, it } from 'vitest';
import {
  evaluateWriterPromotionGate,
  type WriterPromotionJudgeResult,
  type WriterPromotionRun,
} from '../../scripts/prompt-optimization/thinkforge-writer-promotion-gate';

function passingJudge(
  overrides: Partial<WriterPromotionJudgeResult> = {},
): WriterPromotionJudgeResult {
  return {
    overall: 96,
    brandAdherence: 96,
    grounding: 96,
    specificity: 96,
    platformFit: 96,
    ctaUsefulness: 96,
    clickatronReadiness: 96,
    fabricationHardFail: false,
    internalLeakageHardFail: false,
    ...overrides,
  };
}

function passingRun(overrides: Partial<WriterPromotionRun> = {}): WriterPromotionRun {
  return {
    caseId: 9,
    caseName: 'Held-out B2B SaaS post',
    seed: 1,
    deterministicScore: 0.96,
    editorialQualityScore: 0.96,
    judge: passingJudge(),
    ...overrides,
  };
}

function passingCorpus(): WriterPromotionRun[] {
  return Array.from({ length: 10 }, (_, caseOffset) => (
    Array.from({ length: 10 }, (_, seedOffset) => passingRun({
      caseId: 9 + caseOffset,
      caseName: `Held-out case ${9 + caseOffset}`,
      seed: seedOffset + 1,
    }))
  )).flat();
}

describe('ThinkForge writer promotion gate', () => {
  it('passes only a complete held-out run where every result clears 95%', () => {
    const verdict = evaluateWriterPromotionGate(passingCorpus(), true);

    expect(verdict.passed).toBe(true);
    expect(verdict.metrics).toMatchObject({
      runCount: 100,
      caseCount: 10,
      minimumDistinctRunsPerCase: 10,
      duplicateRuns: 0,
    });
    expect(verdict.metrics.promotionScore).toBeCloseTo(96, 10);
    expect(verdict.failures).toEqual([]);
  });

  it('does not hide a sub-95 judge result inside a 95 average', () => {
    const runs = passingCorpus();
    runs[0] = { ...runs[0], judge: passingJudge({ overall: 100 }) };
    runs[1] = { ...runs[1], judge: passingJudge({ overall: 90 }) };
    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.metrics.judgeAverage).toBe(95.98);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('judge_min:90.00');
  });

  it('does not hide weak prose craft behind perfect structural compliance', () => {
    const runs = passingCorpus().map((run) => ({
      ...run,
      deterministicScore: 1,
      editorialQualityScore: 1,
    }));
    runs[1] = { ...runs[1], editorialQualityScore: 0.75 };
    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.metrics.deterministicAverage).toBe(1);
    expect(verdict.metrics.editorialQualityMin).toBe(0.75);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('editorial_quality_min:0.7500');
  });

  it('counts generation errors as zero instead of excluding them from the aggregate', () => {
    const runs = passingCorpus();
    runs[1] = { ...runs[1], error: 'writer timed out', judge: undefined };
    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.deterministicMin).toBe(0);
    expect(verdict.metrics.generationErrors).toBe(1);
    expect(verdict.failures).toContain('generation_errors:1');
  });

  it('fails missing judgments, judge errors, fabrication, and internal leakage', () => {
    const runs = passingCorpus();
    runs[0] = {
      ...runs[0],
      judge: passingJudge({
        overall: 99,
        fabricationHardFail: true,
        internalLeakageHardFail: true,
      }),
    };
    runs[1] = { ...runs[1], judge: undefined, judgeError: 'invalid JSON' };
    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.judgeCoverage).toBe(0.99);
    expect(verdict.failures).toEqual(expect.arrayContaining([
      'judge_errors:1',
      'judge_coverage:0.9900',
      'fabrication_hard_fails:1',
      'internal_leakage_hard_fails:1',
    ]));
  });

  it('does not promote partial or exploratory runs', () => {
    const verdict = evaluateWriterPromotionGate([passingRun()], false);

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('run_not_promotion_eligible');
  });

  it('requires ten cases and ten distinct reruns for every case', () => {
    const nineCases = evaluateWriterPromotionGate(passingCorpus().slice(0, 90), true);
    const shortCase = evaluateWriterPromotionGate(passingCorpus().slice(0, 99), true);

    expect(nineCases.passed).toBe(false);
    expect(nineCases.failures).toContain('case_count:9/10');
    expect(shortCase.passed).toBe(false);
    expect(shortCase.failures).toContain('runs_per_case_min:9/10');
  });

  it('rejects duplicate case and seed evidence', () => {
    const runs = passingCorpus();
    runs.push({ ...runs[0] });

    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics).toMatchObject({ submittedRunCount: 101, runCount: 100, duplicateRuns: 1 });
    expect(verdict.failures).toContain('duplicate_runs:1');
  });

  it('does not hide weak Clickatron readiness behind a perfect overall score', () => {
    const runs = passingCorpus();
    runs[0] = {
      ...runs[0],
      judge: passingJudge({ overall: 100, clickatronReadiness: 90 }),
    };

    const verdict = evaluateWriterPromotionGate(runs, true);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.promotionScore).toBe(90);
    expect(verdict.failures).toContain('judge_clickatronReadiness_min:90.00');
  });
});
