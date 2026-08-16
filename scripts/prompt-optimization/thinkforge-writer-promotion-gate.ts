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
  maxDuplicateOutputs: 0,
  deterministicPassScore: 0.95,
  deterministicPassRate: 1,
  publishReadyScore: 0.95,
  publishReadyRate: 0.95,
  judgeAverage: 95,
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
  runId: number;
  outputFingerprint: string;
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
    duplicateOutputs: number;
    missingOutputFingerprints: number;
    deterministicPassRate: number;
    publishReadyRate: number;
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

function atLeast(actual: number, threshold: number): boolean {
  return actual + Number.EPSILON * 16 >= threshold;
}

export function evaluateWriterPromotionGate(
  runs: WriterPromotionRun[],
  eligible: boolean,
): WriterPromotionVerdict {
  const thresholds = THINKFORGE_WRITER_PROMOTION_THRESHOLDS;
  const uniqueRunsByKey = new Map<string, WriterPromotionRun>();
  for (const run of runs) {
    const key = `${run.caseId}:${run.runId}`;
    if (!uniqueRunsByKey.has(key)) uniqueRunsByKey.set(key, run);
  }
  const uniqueRuns = [...uniqueRunsByKey.values()];
  const duplicateRuns = runs.length - uniqueRuns.length;
  const distinctRunsByCase = new Map<number, Set<number>>();
  for (const run of uniqueRuns) {
    const runIds = distinctRunsByCase.get(run.caseId) ?? new Set<number>();
    runIds.add(run.runId);
    distinctRunsByCase.set(run.caseId, runIds);
  }
  const minimumDistinctRunsPerCase = distinctRunsByCase.size > 0
    ? Math.min(...[...distinctRunsByCase.values()].map((runIds) => runIds.size))
    : 0;
  const outputKeys = new Set<string>();
  let duplicateOutputs = 0;
  let missingOutputFingerprints = 0;
  for (const run of uniqueRuns) {
    if (run.error) continue;
    if (!run.outputFingerprint.trim()) {
      missingOutputFingerprints += 1;
      continue;
    }
    const outputKey = `${run.caseId}:${run.outputFingerprint}`;
    if (outputKeys.has(outputKey)) duplicateOutputs += 1;
    else outputKeys.add(outputKey);
  }
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
  const deterministicPasses = uniqueRuns.filter((run) => (
    !run.error && atLeast(run.deterministicScore, thresholds.deterministicPassScore)
  )).length;
  const deterministicPassRate = uniqueRuns.length > 0 ? deterministicPasses / uniqueRuns.length : 0;
  const publishReadyRuns = uniqueRuns.filter((run) => (
    !run.error
    && !run.judgeError
    && atLeast(run.deterministicScore, thresholds.deterministicPassScore)
    && atLeast(run.editorialQualityScore, thresholds.publishReadyScore)
    && run.judge !== undefined
    && atLeast(run.judge.overall / 100, thresholds.publishReadyScore)
    && THINKFORGE_WRITER_JUDGE_DIMENSIONS.every((dimension) => (
      atLeast(run.judge![dimension] / 100, thresholds.publishReadyScore)
    ))
    && !run.judge.fabricationHardFail
    && !run.judge.internalLeakageHardFail
  )).length;
  const publishReadyRate = uniqueRuns.length > 0 ? publishReadyRuns / uniqueRuns.length : 0;
  const promotionScore = Math.min(
    deterministicPassRate * 100,
    publishReadyRate * 100,
    judgeAverage,
    ...Object.values(judgeDimensionAverage),
  );
  const failures: string[] = [];

  if (!eligible) failures.push('run_not_promotion_eligible');
  if (uniqueRuns.length === 0) failures.push('no_runs');
  if (distinctRunsByCase.size < thresholds.minimumCaseCount) {
    failures.push(`case_count:${distinctRunsByCase.size}/${thresholds.minimumCaseCount}`);
  }
  if (minimumDistinctRunsPerCase < thresholds.minimumDistinctRunsPerCase) {
    failures.push(
      `runs_per_case_min:${minimumDistinctRunsPerCase}/${thresholds.minimumDistinctRunsPerCase}`,
    );
  }
  if (duplicateRuns > thresholds.maxDuplicateRuns) {
    failures.push(`duplicate_runs:${duplicateRuns}`);
  }
  if (duplicateOutputs > thresholds.maxDuplicateOutputs) {
    failures.push(`duplicate_outputs:${duplicateOutputs}`);
  }
  if (missingOutputFingerprints > 0) {
    failures.push(`missing_output_fingerprints:${missingOutputFingerprints}`);
  }
  if (generationErrors > thresholds.maxGenerationErrors) {
    failures.push(`generation_errors:${generationErrors}`);
  }
  if (judgeErrors > thresholds.maxJudgeErrors) {
    failures.push(`judge_errors:${judgeErrors}`);
  }
  if (!atLeast(deterministicPassRate, thresholds.deterministicPassRate)) {
    failures.push(`deterministic_pass_rate:${deterministicPassRate.toFixed(4)}`);
  }
  if (!atLeast(publishReadyRate, thresholds.publishReadyRate)) {
    failures.push(`publish_ready_rate:${publishReadyRate.toFixed(4)}`);
  }
  if (judgeCoverage < thresholds.judgeCoverage) {
    failures.push(`judge_coverage:${judgeCoverage.toFixed(4)}`);
  }
  if (!atLeast(judgeAverage, thresholds.judgeAverage)) {
    failures.push(`judge_average:${judgeAverage.toFixed(2)}`);
  }
  for (const dimension of THINKFORGE_WRITER_JUDGE_DIMENSIONS) {
    if (!atLeast(judgeDimensionAverage[dimension], thresholds.judgeDimensionAverage)) {
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
      caseCount: distinctRunsByCase.size,
      minimumDistinctRunsPerCase,
      duplicateRuns,
      duplicateOutputs,
      missingOutputFingerprints,
      deterministicPassRate,
      publishReadyRate,
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
