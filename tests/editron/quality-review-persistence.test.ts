import { describe, expect, it } from 'vitest';

import {
  QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT,
  buildPersistedQualityReview,
} from '../../lib/editron/services/quality-review-persistence';
import type { QualityReport } from '../../lib/editron/services/quality-review-service';

function makeReport(issueCount: number): QualityReport {
  return {
    overallScore: 12,
    analyzedAt: new Date('2026-06-14T00:00:00.000Z'),
    suggestions: ['  Fix the failing overlays before learning.  '],
    issues: Array.from({ length: issueCount }, (_, index) => ({
      type: index % 2 === 0 ? 'graphic_occlusion' : 'caption_reading_speed',
      severity: index === 0 ? 'critical' : 'warning',
      description: index === 0
        ? `${'long '.repeat(140)}description`
        : `Issue ${index}`,
      frameRange: index === 1 ? { start: Number.NaN, end: 20 } : { start: 10.4 + index, end: 30.6 + index },
      overlayId: index,
      suggestedFix: index === 0 ? ' Move it away from the face. ' : undefined,
      autoFixable: index < 2,
    })),
    autoFixable: [],
  };
}

describe('quality review persistence', () => {
  it('persists bounded actionable issue details for failed quality reviews', () => {
    const report = makeReport(QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT + 2);
    report.autoFixable = report.issues.filter((issue) => issue.autoFixable);

    const persisted = buildPersistedQualityReview(
      report,
      new Date('2026-06-14T00:01:00.000Z'),
    );

    expect(persisted).toMatchObject({
      version: 'quality-review-persistence-v1',
      overallScore: 12,
      issueCount: QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT + 2,
      criticalCount: 1,
      warningCount: QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT + 1,
      infoCount: 0,
      autoFixableCount: 2,
      issuesPersistedCount: QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT,
      issuesTruncated: true,
      suggestions: ['Fix the failing overlays before learning.'],
    });
    expect(persisted.issues).toHaveLength(QUALITY_REVIEW_ISSUE_PERSISTENCE_LIMIT);
    expect(persisted.issues[0]).toMatchObject({
      type: 'graphic_occlusion',
      severity: 'critical',
      frameRange: { start: 10, end: 31 },
      overlayId: 0,
      suggestedFix: 'Move it away from the face.',
      autoFixable: true,
    });
    expect(persisted.issues[0].description.length).toBeLessThanOrEqual(500);
    expect(persisted.issues[1].frameRange).toBeNull();
  });
});
