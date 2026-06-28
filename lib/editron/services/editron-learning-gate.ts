export const CRITICAL_QUALITY_ISSUE_ATTENTION_THRESHOLD = 5;

export interface EditronLearningOutcomeInput {
  qualityScore?: unknown;
  score?: unknown;
  criticalCount?: unknown;
  qualityEvidenceSource?: unknown;
  renderedQualityStatus?: unknown;
  renderedAestheticStatus?: unknown;
  artifactStatus?: unknown;
  renderedAestheticFailFrameCount?: unknown;
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

export interface DirectorQualityReviewSnapshot {
  overallScore?: unknown;
  criticalCount?: unknown;
}

export interface DirectorRenderedQualityEvidenceSnapshot {
  qualityEvidenceSource?: unknown;
  renderedQualityStatus?: unknown;
  renderedAestheticStatus?: unknown;
  artifactStatus?: unknown;
  qualityScore?: unknown;
  renderedAestheticFailFrameCount?: unknown;
}

export interface DirectorCompletionHealth {
  hasQualityReview: boolean;
  qualityScore: number;
  criticalCount: number;
  needsQualityAttention: boolean;
  autoEditStatus: 'complete' | 'needs_review';
  warning?: string;
}

export function resolveDirectorCompletionHealth(
  qualityReview: DirectorQualityReviewSnapshot | null | undefined,
  renderedQualityEvidence?: DirectorRenderedQualityEvidenceSnapshot | null,
): DirectorCompletionHealth {
  const hasQualityReview = !!qualityReview;
  const metadataQualityScore = readFiniteNumber(qualityReview?.overallScore, 0);
  const renderedQualityScore = readFiniteNumber(renderedQualityEvidence?.qualityScore, NaN);
  const qualityScore = Number.isFinite(renderedQualityScore) ? renderedQualityScore : metadataQualityScore;
  const criticalCount = Math.max(0, Math.round(readFiniteNumber(qualityReview?.criticalCount, 0)));
  const learningDecision = resolveEditronLearningOutcome({
    hasQualityReview,
    qualityScore,
    criticalCount,
    qualityEvidenceSource: renderedQualityEvidence?.qualityEvidenceSource,
    renderedQualityStatus: renderedQualityEvidence?.renderedQualityStatus,
    renderedAestheticStatus: renderedQualityEvidence?.renderedAestheticStatus,
    artifactStatus: renderedQualityEvidence?.artifactStatus,
    renderedAestheticFailFrameCount: renderedQualityEvidence?.renderedAestheticFailFrameCount,
  });
  const needsQualityAttention = !learningDecision.shouldRecord;

  return {
    hasQualityReview,
    qualityScore,
    criticalCount,
    needsQualityAttention,
    autoEditStatus: needsQualityAttention ? 'needs_review' : 'complete',
    ...(needsQualityAttention && {
      warning: !hasQualityReview
        ? 'Director completed without a persisted quality review.'
        : learningDecision.reason === 'rendered_quality_failed'
          ? `Director completed, but rendered Phase 0 quality failed with score ${qualityScore}. Review rendered artifacts before learning or calibration.`
          : `Director completed with quality score ${qualityScore} and ${criticalCount} critical issue(s).`,
    }),
  };
}

export function resolveEditronLearningOutcome(
  input: EditronLearningOutcomeInput,
): EditronLearningOutcomeDecision {
  const qualityScore = readFiniteNumber(input.qualityScore, readFiniteNumber(input.score, NaN));
  const normalizedQualityScore = Number.isFinite(qualityScore) ? qualityScore : null;
  const criticalCount = Math.max(0, Math.round(readFiniteNumber(input.criticalCount, 0)));
  const renderedStatus = readRenderedStatus(
    input.renderedQualityStatus ?? input.renderedAestheticStatus ?? input.artifactStatus,
  );
  const hasRenderedEvidence =
    input.qualityEvidenceSource === 'rendered-aesthetic' || renderedStatus !== null;
  const renderedFailFrameCount = Math.max(0, Math.round(readFiniteNumber(input.renderedAestheticFailFrameCount, 0)));

  if (input.diagnostic === true || input.dryRun === true) {
    return skip(normalizedQualityScore, criticalCount, 'diagnostic_run');
  }

  if (input.hasQualityReview === false) {
    return skip(normalizedQualityScore, criticalCount, 'missing_quality_review');
  }

  if (input.autoEditHealth === 'needs_review' || input.projectStatus === 'needs-attention') {
    return skip(normalizedQualityScore, criticalCount, 'project_needs_review');
  }

  if (hasRenderedEvidence && (renderedStatus === 'fail' || renderedFailFrameCount > 0)) {
    return skip(normalizedQualityScore, criticalCount, 'rendered_quality_failed');
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

function readRenderedStatus(value: unknown): 'pass' | 'warn' | 'fail' | null {
  return value === 'pass' || value === 'warn' || value === 'fail' ? value : null;
}
