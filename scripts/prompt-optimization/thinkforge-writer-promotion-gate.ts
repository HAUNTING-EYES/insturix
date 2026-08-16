export const THINKFORGE_WRITER_JUDGE_DIMENSIONS = [
  'brandAdherence',
  'grounding',
  'specificity',
  'platformFit',
  'ctaUsefulness',
  'clickatronReadiness',
] as const;

export type WriterPromotionJudgeDimension = typeof THINKFORGE_WRITER_JUDGE_DIMENSIONS[number];

export const THINKFORGE_WRITER_PROMOTION_THRESHOLDS = {
  minimumCaseCount: 10,
  minimumDistinctRunsPerCase: 10,
  maxDuplicateRuns: 0,
  deterministicMin: 0.95,
  deterministicAverage: 0.95,
  editorialQualityMin: 0.95,
  editorialQualityAverage: 0.95,
  judgeMin: 95,
  judgeAverage: 95,
  judgeDimensionMin: 95,
  judgeDimensionAverage: 95,
  judgeCoverage: 1,
  maxGenerationErrors: 0,
  maxJudgeErrors: 0,
  maxFabricationHardFails: 0,
  maxInternalLeakageHardFails: 0,
} as const;

export interface WriterPromotionJudgeResult {
  overall: number;
  brandAdherence: number;
  grounding: number;
  specificity: number;
  platformFit: number;
  ctaUsefulness: number;
  clickatronReadiness: number;
  fabricationHardFail: boolean;
  internalLeakageHardFail: boolean;
}

export interface WriterPromotionRun {
  caseId: number;
  caseName: string;
  seed: number;
  deterministicScore: number;
  editorialQualityScore: number;
  error?: string;
  judge?: WriterPromotionJudgeResult;
  judgeError?: string;
}

export interface WriterPromotionVerdict {
  eligible: boolean;
  passed: boolean;
  thresholds: typeof THINKFORGE_WRITER_PROMOTION_THRESHOLDS;
  metrics: {
    submittedRunCount: number;
    runCount: number;
    caseCount: number;
    minimumDistinctRunsPerCase: number;
    duplicateRuns: number;
    deterministicMin: number;
    deterministicAverage: number;
    editorialQualityMin: number;
    editorialQualityAverage: number;
    judgeMin: number;
    judgeAverage: number;
    judgeDimensionMin: Record<WriterPromotionJudgeDimension, number>;
    judgeDimensionAverage: Record<WriterPromotionJudgeDimension, number>;
    judgeCoverage: number;
    generationErrors: number;
    judgeErrors: number;
    fabricationHardFails: number;
    internalLeakageHardFails: number;
    promotionScore: number;
  };
  failures: string[];
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function evaluateWriterPromotionGate(
  runs: WriterPromotionRun[],
  eligible: boolean,
): WriterPromotionVerdict {
  const thresholds = THINKFORGE_WRITER_PROMOTION_THRESHOLDS;
  const uniqueRunsByKey = new Map<string, WriterPromotionRun>();
  for (const run of runs) {
    const key = `${run.caseId}:${run.seed}`;
    if (!uniqueRunsByKey.has(key)) uniqueRunsByKey.set(key, run);
  }
  const uniqueRuns = [...uniqueRunsByKey.values()];
  const duplicateRuns = runs.length - uniqueRuns.length;
  const distinctSeedsByCase = new Map<number, Set<number>>();
  for (const run of uniqueRuns) {
    const seeds = distinctSeedsByCase.get(run.caseId) ?? new Set<number>();
    seeds.add(run.seed);
    distinctSeedsByCase.set(run.caseId, seeds);
  }
  const minimumDistinctRunsPerCase = distinctSeedsByCase.size > 0
    ? Math.min(...[...distinctSeedsByCase.values()].map((seeds) => seeds.size))
    : 0;
  const deterministicScores = uniqueRuns.map((run) => run.error ? 0 : run.deterministicScore);
  const editorialQualityScores = uniqueRuns.map((run) => run.error ? 0 : run.editorialQualityScore);
  const judgedRuns = uniqueRuns.filter((run) => run.judge !== undefined);
  const judgeScores = judgedRuns.map((run) => run.judge!.overall);
  const judgeDimensionMin = Object.fromEntries(
    THINKFORGE_WRITER_JUDGE_DIMENSIONS.map((dimension) => {
      const scores = judgedRuns.map((run) => run.judge![dimension]);
      return [dimension, scores.length > 0 ? Math.min(...scores) : 0];
    }),
  ) as Record<WriterPromotionJudgeDimension, number>;
  const judgeDimensionAverage = Object.fromEntries(
    THINKFORGE_WRITER_JUDGE_DIMENSIONS.map((dimension) => [
      dimension,
      average(judgedRuns.map((run) => run.judge![dimension])),
    ]),
  ) as Record<WriterPromotionJudgeDimension, number>;
  const generationErrors = uniqueRuns.filter((run) => run.error).length;
  const judgeErrors = uniqueRuns.filter((run) => run.judgeError).length;
  const fabricationHardFails = judgedRuns.filter((run) => run.judge!.fabricationHardFail).length;
  const internalLeakageHardFails = judgedRuns.filter((run) => run.judge!.internalLeakageHardFail).length;
  const deterministicMin = deterministicScores.length > 0 ? Math.min(...deterministicScores) : 0;
  const deterministicAverage = average(deterministicScores);
  const editorialQualityMin = editorialQualityScores.length > 0 ? Math.min(...editorialQualityScores) : 0;
  const editorialQualityAverage = average(editorialQualityScores);
  const judgeMin = judgeScores.length > 0 ? Math.min(...judgeScores) : 0;
  const judgeAverage = average(judgeScores);
  const judgeCoverage = uniqueRuns.length > 0 ? judgedRuns.length / uniqueRuns.length : 0;
  const promotionScore = Math.min(
    deterministicMin * 100,
    deterministicAverage * 100,
    editorialQualityMin * 100,
    editorialQualityAverage * 100,
    judgeMin,
    judgeAverage,
    ...Object.values(judgeDimensionMin),
    ...Object.values(judgeDimensionAverage),
  );
  const failures: string[] = [];

  if (!eligible) failures.push('run_not_promotion_eligible');
  if (uniqueRuns.length === 0) failures.push('no_runs');
  if (distinctSeedsByCase.size < thresholds.minimumCaseCount) {
    failures.push(`case_count:${distinctSeedsByCase.size}/${thresholds.minimumCaseCount}`);
  }
  if (minimumDistinctRunsPerCase < thresholds.minimumDistinctRunsPerCase) {
    failures.push(
      `runs_per_case_min:${minimumDistinctRunsPerCase}/${thresholds.minimumDistinctRunsPerCase}`,
    );
  }
  if (duplicateRuns > thresholds.maxDuplicateRuns) {
    failures.push(`duplicate_runs:${duplicateRuns}`);
  }
  if (generationErrors > thresholds.maxGenerationErrors) {
    failures.push(`generation_errors:${generationErrors}`);
  }
  if (judgeErrors > thresholds.maxJudgeErrors) {
    failures.push(`judge_errors:${judgeErrors}`);
  }
  if (deterministicMin < thresholds.deterministicMin) {
    failures.push(`deterministic_min:${deterministicMin.toFixed(4)}`);
  }
  if (deterministicAverage < thresholds.deterministicAverage) {
    failures.push(`deterministic_average:${deterministicAverage.toFixed(4)}`);
  }
  if (editorialQualityMin < thresholds.editorialQualityMin) {
    failures.push(`editorial_quality_min:${editorialQualityMin.toFixed(4)}`);
  }
  if (editorialQualityAverage < thresholds.editorialQualityAverage) {
    failures.push(`editorial_quality_average:${editorialQualityAverage.toFixed(4)}`);
  }
  if (judgeCoverage < thresholds.judgeCoverage) {
    failures.push(`judge_coverage:${judgeCoverage.toFixed(4)}`);
  }
  if (judgeMin < thresholds.judgeMin) {
    failures.push(`judge_min:${judgeMin.toFixed(2)}`);
  }
  if (judgeAverage < thresholds.judgeAverage) {
    failures.push(`judge_average:${judgeAverage.toFixed(2)}`);
  }
  for (const dimension of THINKFORGE_WRITER_JUDGE_DIMENSIONS) {
    if (judgeDimensionMin[dimension] < thresholds.judgeDimensionMin) {
      failures.push(`judge_${dimension}_min:${judgeDimensionMin[dimension].toFixed(2)}`);
    }
    if (judgeDimensionAverage[dimension] < thresholds.judgeDimensionAverage) {
      failures.push(`judge_${dimension}_average:${judgeDimensionAverage[dimension].toFixed(2)}`);
    }
  }
  if (fabricationHardFails > thresholds.maxFabricationHardFails) {
    failures.push(`fabrication_hard_fails:${fabricationHardFails}`);
  }
  if (internalLeakageHardFails > thresholds.maxInternalLeakageHardFails) {
    failures.push(`internal_leakage_hard_fails:${internalLeakageHardFails}`);
  }

  return {
    eligible,
    passed: eligible && failures.length === 0,
    thresholds,
    metrics: {
      submittedRunCount: runs.length,
      runCount: uniqueRuns.length,
      caseCount: distinctSeedsByCase.size,
      minimumDistinctRunsPerCase,
      duplicateRuns,
      deterministicMin,
      deterministicAverage,
      editorialQualityMin,
      editorialQualityAverage,
      judgeMin,
      judgeAverage,
      judgeDimensionMin,
      judgeDimensionAverage,
      judgeCoverage,
      generationErrors,
      judgeErrors,
      fabricationHardFails,
      internalLeakageHardFails,
      promotionScore,
    },
    failures,
  };
}
