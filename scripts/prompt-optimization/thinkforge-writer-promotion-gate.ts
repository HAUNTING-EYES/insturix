export const THINKFORGE_WRITER_PROMOTION_THRESHOLDS = {
  deterministicMin: 0.90,
  deterministicAverage: 0.95,
  judgeMin: 80,
  judgeAverage: 95,
  judgeCoverage: 1,
  maxGenerationErrors: 0,
  maxJudgeErrors: 0,
  maxFabricationHardFails: 0,
  maxInternalLeakageHardFails: 0,
} as const;

export interface WriterPromotionJudgeResult {
  overall: number;
  fabricationHardFail: boolean;
  internalLeakageHardFail: boolean;
}

export interface WriterPromotionRun {
  caseId: number;
  caseName: string;
  seed: number;
  deterministicScore: number;
  error?: string;
  judge?: WriterPromotionJudgeResult;
  judgeError?: string;
}

export interface WriterPromotionVerdict {
  eligible: boolean;
  passed: boolean;
  thresholds: typeof THINKFORGE_WRITER_PROMOTION_THRESHOLDS;
  metrics: {
    runCount: number;
    caseCount: number;
    deterministicMin: number;
    deterministicAverage: number;
    judgeMin: number;
    judgeAverage: number;
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
  const deterministicScores = runs.map((run) => run.error ? 0 : run.deterministicScore);
  const judgedRuns = runs.filter((run) => run.judge !== undefined);
  const judgeScores = judgedRuns.map((run) => run.judge!.overall);
  const generationErrors = runs.filter((run) => run.error).length;
  const judgeErrors = runs.filter((run) => run.judgeError).length;
  const fabricationHardFails = judgedRuns.filter((run) => run.judge!.fabricationHardFail).length;
  const internalLeakageHardFails = judgedRuns.filter((run) => run.judge!.internalLeakageHardFail).length;
  const deterministicMin = deterministicScores.length > 0 ? Math.min(...deterministicScores) : 0;
  const deterministicAverage = average(deterministicScores);
  const judgeMin = judgeScores.length > 0 ? Math.min(...judgeScores) : 0;
  const judgeAverage = average(judgeScores);
  const judgeCoverage = runs.length > 0 ? judgedRuns.length / runs.length : 0;
  const promotionScore = Math.min(deterministicAverage * 100, judgeAverage);
  const failures: string[] = [];

  if (!eligible) failures.push('run_not_promotion_eligible');
  if (runs.length === 0) failures.push('no_runs');
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
  if (judgeCoverage < thresholds.judgeCoverage) {
    failures.push(`judge_coverage:${judgeCoverage.toFixed(4)}`);
  }
  if (judgeMin < thresholds.judgeMin) {
    failures.push(`judge_min:${judgeMin.toFixed(2)}`);
  }
  if (judgeAverage < thresholds.judgeAverage) {
    failures.push(`judge_average:${judgeAverage.toFixed(2)}`);
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
      runCount: runs.length,
      caseCount: new Set(runs.map((run) => run.caseId)).size,
      deterministicMin,
      deterministicAverage,
      judgeMin,
      judgeAverage,
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
