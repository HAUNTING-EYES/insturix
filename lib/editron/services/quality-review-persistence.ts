import type { QualityIssue, QualityReport } from './quality-review-service';

export const QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT = 100;
const QUALITY_REVIEW_TEXT_LIMIT = 500;

export interface PersistedQualityReviewIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  frameRange: { start: number; end: number } | null;
  overlayId: number | null;
  suggestedFix: string | null;
  autoFixable: boolean;
}

export interface PersistedQualityReview {
  version: 'quality-review-persistence-v1';
  overallScore: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  autoFixableCount: number;
  issuesPersistedCount: number;
  issuesTruncated: boolean;
  issues: PersistedQualityReviewIssue[];
  suggestions: string[];
  analyzedAt: Date;
  reviewedAt: Date;
}

export function buildPersistedQualityReview(
  report: QualityReport,
  reviewedAt: Date = new Date(),
): PersistedQualityReview {
  const criticalCount = report.issues.filter((issue) => issue.severity === 'critical').length;
  const warningCount = report.issues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = report.issues.filter((issue) => issue.severity === 'info').length;
  const issues = report.issues
    .slice(0, QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT)
    .map(sanitizeQualityReviewIssue);

  return {
    version: 'quality-review-persistence-v1',
    overallScore: report.overallScore,
    issueCount: report.issues.length,
    criticalCount,
    warningCount,
    infoCount,
    autoFixableCount: report.autoFixable.length,
    issuesPersistedCount: issues.length,
    issuesTruncated: report.issues.length > issues.length,
    issues,
    suggestions: report.suggestions.slice(0, 25).map((suggestion) => clampText(suggestion)),
    analyzedAt: report.analyzedAt,
    reviewedAt,
  };
}

function sanitizeQualityReviewIssue(issue: QualityIssue): PersistedQualityReviewIssue {
  return {
    type: issue.type,
    severity: issue.severity,
    description: clampText(issue.description),
    frameRange: sanitizeFrameRange(issue.frameRange),
    overlayId: typeof issue.overlayId === 'number' && Number.isFinite(issue.overlayId) ? issue.overlayId : null,
    suggestedFix: issue.suggestedFix ? clampText(issue.suggestedFix) : null,
    autoFixable: issue.autoFixable === true,
  };
}

function sanitizeFrameRange(frameRange: QualityIssue['frameRange']) {
  if (!frameRange) return null;
  if (!Number.isFinite(frameRange.start) || !Number.isFinite(frameRange.end)) return null;
  return {
    start: Math.max(0, Math.round(frameRange.start)),
    end: Math.max(0, Math.round(frameRange.end)),
  };
}

function clampText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > QUALITY_REVIEW_TEXT_LIMIT
    ? `${normalized.slice(0, QUALITY_REVIEW_TEXT_LIMIT - 3)}...`
    : normalized;
}
