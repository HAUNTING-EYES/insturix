import { describe, expect, it } from 'vitest';

import { runQualityReview } from '../../lib/editron/services/quality-review-service';

describe('quality review signal-owned pacing', () => {
  const fps = 30;

  it('keeps CRG pacing issue severity independent of content labels', () => {
    const overlays = Array.from({ length: 5 }, (_unused, index) => videoOverlay(index + 1, index * 90, 90));

    const report = runQualityReview(overlays, fps, 450, undefined, undefined, 'interview');
    const pacingIssue = report.issues.find((issue) => issue.type === 'pacing_monotony');

    expect(pacingIssue?.severity).toBe('warning');
  });

  it('does not infer raw-footage pacing issues from content-type labels', () => {
    const overlays = [
      videoOverlay(1, 0, 1800),
      videoOverlay(2, 1800, 1800),
    ];
    const analyses = new Map<string, any>([['__rawFootage', rawFootageAnalysis('music-video')]]);

    const report = runQualityReview(overlays, fps, 3600, analyses);

    expect(report.issues.some((issue) => issue.type === 'pacing_too_slow')).toBe(false);
    expect(report.suggestions.join(' ')).not.toMatch(/Content type/i);
    expect(report.suggestions.join(' ')).toContain('Raw-footage clean duration: 120s.');
  });

  it('uses signal-derived genre parameters when reviewing raw-footage pacing', () => {
    const overlays = [
      videoOverlay(1, 0, 1800),
      videoOverlay(2, 1800, 1800),
    ];
    const analyses = new Map<string, any>([['__rawFootage', rawFootageAnalysis('talking-head')]]);

    const report = runQualityReview(
      overlays,
      fps,
      3600,
      analyses,
      undefined,
      undefined,
      { pacing_tolerance: 4, transition_density: 20 },
    );
    const pacingIssue = report.issues.find((issue) => issue.type === 'pacing_too_slow');

    expect(pacingIssue?.description).toContain('source: genre_parameters');
    expect(pacingIssue?.description).toContain('signal-derived expected range');
    expect(pacingIssue?.suggestedFix).not.toMatch(/B-roll|aggressive silence/i);
  });
});

function videoOverlay(id: number, from: number, durationInFrames: number) {
  return {
    id,
    type: 'video',
    from,
    durationInFrames,
    row: 0,
    assetId: `asset-${id}`,
    styles: {},
    metadata: {},
  };
}

function rawFootageAnalysis(contentType: string) {
  return {
    silenceRemovalPlan: [],
    silenceGaps: [],
    contentTypeDetection: {
      contentType,
      silenceThreshold: { removeAboveMs: 500 },
    },
    estimatedCleanDurationMs: 120000,
  };
}