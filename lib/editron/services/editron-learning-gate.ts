export const CRITICAL_QUALITY_ISSUE_ATTENTION_THRESHOLD = 5;

export interface EditronLearningOutcomeInput {
  qualityScore?: unknown;
  score?: unknown;
  criticalCount?: unknown;
  hasQualityReview?: unknown;
  autoEditHealth?: unknown;
  projectStatus?: unknown;
  diagnostic?: unknown;
  dryRun?: unknown;
}

export interface EditronLearningOutcomeDecision {
  shouldRecord: boolean;
  qualityScore: number | null;
  criticalCount: number;
  reason?: string;
}

export function resolveEditronLearningOutcome(
  input: EditronLearningOutcomeInput,
): EditronLearningOutcomeDecision {
  const qualityScore = readFiniteNumber(input.qualityScore, readFiniteNumber(input.score, NaN));
  const normalizedQualityScore = Number.isFinite(qualityScore) ? qualityScore : null;
  const criticalCount = Math.max(0, Math.round(readFiniteNumber(input.criticalCount, 0)));

  if (input.diagnostic === true || input.dryRun === true) {
    return skip(normalizedQualityScore, criticalCount, 'diagnostic_run');
  }

  if (input.hasQualityReview === false) {
    return skip(normalizedQualityScore, criticalCount, 'missing_quality_review');
  }

  if (input.autoEditHealth === 'needs_review' || input.projectStatus === 'needs-attention') {
    return skip(normalizedQualityScore, criticalCount, 'project_needs_review');
  }

  if (normalizedQualityScore === null) {
    return skip(null, criticalCount, 'missing_quality_score');
  }

  if (normalizedQualityScore <= 0) {
    return skip(normalizedQualityScore, criticalCount, 'non_positive_quality_score');
  }

  if (criticalCount > CRITICAL_QUALITY_ISSUE_ATTENTION_THRESHOLD) {
    return skip(normalizedQualityScore, criticalCount, 'too_many_critical_issues');
  }

  return {
    shouldRecord: true,
    qualityScore: normalizedQualityScore,
    criticalCount,
  };
}

function skip(
  qualityScore: number | null,
  criticalCount: number,
  reason: string,
): EditronLearningOutcomeDecision {
  return {
    shouldRecord: false,
    qualityScore,
    criticalCount,
    reason,
  };
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
