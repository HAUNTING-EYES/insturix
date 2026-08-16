import { describe, expect, it } from 'vitest';
import { buildThinkForgeWriterInvocationTrace } from '../../lib/thinkforge/provenance/generation-trace';
import {
  evaluateWriterPromotionGate,
  type WriterPromotionJudgeResult,
  type WriterPromotionRun,
} from '../../scripts/prompt-optimization/thinkforge-writer-promotion-gate';
import {
  createWriterPromotionEvidence,
  type WriterPromotionRepositoryState,
} from '../../scripts/prompt-optimization/thinkforge-writer-promotion-evidence';

const CLEAN_REPOSITORY: WriterPromotionRepositoryState = {
  commitSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  branch: 'test',
  clean: true,
  dirtyEntryCount: 0,
};

const PASSING_WRITER_TRACE = buildThinkForgeWriterInvocationTrace({
  writerType: 'post',
  editorialPlan: { kind: 'test-post-plan' },
  selectedTechniques: [],
  promptTemplate: 'Reviewed post writer prompt template.',
  provider: 'gemini',
  model: 'gemini-test',
  cacheStatus: 'inline',
  generatedAt: '2026-08-16T00:00:00.000Z',
});

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
  const caseId = overrides.caseId ?? 9;
  const runId = overrides.runId ?? 1;
  return {
    caseId,
    caseName: 'Held-out B2B SaaS post',
    runId,
    outputFingerprint: overrides.outputFingerprint ?? `case-${caseId}-run-${runId}`,
    writerPath: 'post',
    deterministicScore: 0.96,
    editorialQualityScore: 0.96,
    writerTrace: PASSING_WRITER_TRACE,
    judge: passingJudge(),
    ...overrides,
  };
}

function passingCorpus(): WriterPromotionRun[] {
  return Array.from({ length: 15 }, (_, caseOffset) => (
    Array.from({ length: 10 }, (_, runOffset) => passingRun({
      caseId: 9 + caseOffset,
      caseName: `Held-out case ${9 + caseOffset}`,
      runId: runOffset + 1,
    }))
  )).flat();
}

function evaluate(runs: WriterPromotionRun[], eligible = true) {
  const caseIds = [...new Set(runs.map((run) => run.caseId))];
  const evidence = eligible
    ? createWriterPromotionEvidence({
        repositoryBefore: CLEAN_REPOSITORY,
        repositoryAfter: CLEAN_REPOSITORY,
        corpus: { version: 1, caseIds },
        corpusCaseIds: caseIds,
        judge: { provider: 'deepseek', model: 'deepseek-chat' },
        providerBudgetSnapshot: { providerRequests: runs.length * 2 },
        runs,
      })
    : undefined;
  return evaluateWriterPromotionGate(runs, eligible, evidence);
}

describe('ThinkForge writer promotion gate', () => {
  it('passes a complete held-out run with 100% contract validity and publish-ready evidence', () => {
    const verdict = evaluate(passingCorpus());

    expect(verdict.passed).toBe(true);
    expect(verdict.metrics).toMatchObject({
      runCount: 150,
      caseCount: 15,
      minimumDistinctRunsPerCase: 10,
      duplicateRuns: 0,
      duplicateOutputs: 0,
      deterministicPassRate: 1,
      publishReadyRate: 1,
    });
    expect(verdict.metrics.promotionScore).toBeCloseTo(96, 10);
    expect(verdict.failures).toEqual([]);
  });

  it('defines 95% as a publish-ready run rate instead of an every-sample minimum', () => {
    const runs = passingCorpus();
    for (let index = 0; index < 7; index += 1) {
      runs[index] = { ...runs[index], judge: passingJudge({ overall: 94 }) };
    }
    const verdict = evaluate(runs);

    expect(verdict.metrics.publishReadyRate).toBeCloseTo(143 / 150, 10);
    expect(verdict.passed).toBe(true);
  });

  it('fails when more than five percent of outputs need editorial revision', () => {
    const runs = passingCorpus().map((run) => ({
      ...run,
      deterministicScore: 1,
      editorialQualityScore: 1,
    }));
    for (let index = 0; index < 8; index += 1) {
      runs[index] = { ...runs[index], editorialQualityScore: 0.75 };
    }
    const verdict = evaluate(runs);

    expect(verdict.metrics.deterministicAverage).toBe(1);
    expect(verdict.metrics.editorialQualityMin).toBe(0.75);
    expect(verdict.metrics.publishReadyRate).toBeCloseTo(142 / 150, 10);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('publish_ready_rate:0.9467');
  });

  it('counts generation errors as zero instead of excluding them from the aggregate', () => {
    const runs = passingCorpus();
    runs[1] = { ...runs[1], error: 'writer timed out', judge: undefined };
    const verdict = evaluate(runs);

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
    const verdict = evaluate(runs);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.judgeCoverage).toBeCloseTo(149 / 150, 10);
    expect(verdict.failures).toEqual(expect.arrayContaining([
      'judge_errors:1',
      'judge_coverage:0.9933',
      'fabrication_hard_fails:1',
      'internal_leakage_hard_fails:1',
    ]));
  });

  it('does not promote partial or exploratory runs', () => {
    const verdict = evaluate([passingRun()], false);

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('run_not_promotion_eligible');
  });

  it('requires all fifteen cases and ten distinct reruns for every case', () => {
    const fourteenCases = evaluate(passingCorpus().slice(0, 140));
    const shortCase = evaluate(passingCorpus().slice(0, 149));

    expect(fourteenCases.passed).toBe(false);
    expect(fourteenCases.failures).toContain('case_count:14/15');
    expect(shortCase.passed).toBe(false);
    expect(shortCase.failures).toContain('runs_per_case_min:9/10');
  });

  it('rejects duplicate case and run-id evidence', () => {
    const runs = passingCorpus();
    runs.push({ ...runs[0] });

    const verdict = evaluate(runs);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics).toMatchObject({ submittedRunCount: 151, runCount: 150, duplicateRuns: 1 });
    expect(verdict.failures).toContain('duplicate_runs:1');
  });

  it('rejects repeated output fingerprints masquerading as independent runs', () => {
    const runs = passingCorpus();
    runs[1] = { ...runs[1], outputFingerprint: runs[0]!.outputFingerprint };

    const verdict = evaluate(runs);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.duplicateOutputs).toBe(1);
    expect(verdict.failures).toContain('duplicate_outputs:1');
  });

  it('does not hide weak Clickatron readiness behind a perfect overall score', () => {
    const runs = passingCorpus();
    for (let index = 0; index < 8; index += 1) {
      runs[index] = {
        ...runs[index],
        judge: passingJudge({ overall: 100, clickatronReadiness: 90 }),
      };
    }

    const verdict = evaluate(runs);

    expect(verdict.passed).toBe(false);
    expect(verdict.metrics.publishReadyRate).toBeCloseTo(142 / 150, 10);
    expect(verdict.failures).toContain('publish_ready_rate:0.9467');
  });

  it('cannot promote a mathematically passing run without bound evidence', () => {
    const verdict = evaluateWriterPromotionGate(passingCorpus(), true);

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain('missing_promotion_evidence');
  });
});
