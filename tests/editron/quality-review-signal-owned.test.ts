import { describe, expect, it } from 'vitest';

import { runQualityReview, scoreQualityIssues, type QualityIssue } from '../../lib/editron/services/quality-review-service';

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
  it('does not let repeated advisory warnings floor the quality score', () => {
    const noisyIssues = [
      ...Array.from({ length: 500 }, () => qualityIssue('caption_reading_speed', 'warning')),
      ...Array.from({ length: 300 }, () => qualityIssue('overlapping_overlays', 'warning')),
      ...Array.from({ length: 250 }, () => qualityIssue('transition_during_speech', 'warning')),
      ...Array.from({ length: 200 }, () => qualityIssue('clip_too_long', 'warning')),
      ...Array.from({ length: 150 }, () => qualityIssue('duplicate_adjacent_transition', 'info')),
      ...Array.from({ length: 100 }, () => qualityIssue('abrupt_start', 'info')),
      ...Array.from({ length: 95 }, () => qualityIssue('abrupt_end', 'info')),
    ];

    const score = scoreQualityIssues(noisyIssues);

    expect(score).toBeGreaterThan(40);
  });

  it('caps same-type warning deductions and preserves new critical signal', () => {
    const oneWarning = scoreQualityIssues([qualityIssue('caption_reading_speed', 'warning')]);
    const manySameWarnings = scoreQualityIssues(
      Array.from({ length: 500 }, () => qualityIssue('caption_reading_speed', 'warning')),
    );
    const withNewCritical = scoreQualityIssues([
      ...Array.from({ length: 500 }, () => qualityIssue('caption_reading_speed', 'warning')),
      qualityIssue('zero_duration', 'critical'),
    ]);

    expect(manySameWarnings).toBe(oneWarning);
    expect(withNewCritical).toBe(manySameWarnings - 15);
  });

  it('does not deduct for info-only quality evidence', () => {
    const score = scoreQualityIssues([
      qualityIssue('abrupt_start', 'info'),
      qualityIssue('duplicate_adjacent_transition', 'info'),
      qualityIssue('clip_too_long', 'info'),
    ]);

    expect(score).toBe(100);
  });

  it('executes graph G9 tier A sync tolerance for numeric MG landings', () => {
    const overlays = [
      videoOverlay(1, 0, 180),
      motionGraphicOverlay(2, 10, {
        graphicType: 'stat-counter',
        signalCurves: { decisionFrame: 0, overlayFrom: 10 },
        semanticAtoms: { scalar: { displayText: '42%', kind: 'percentage' } },
      }, { value: '42%', label: 'retention lift' }),
    ];

    const report = runQualityReview(overlays, fps, 180);
    const issue = report.issues.find((candidate) => candidate.type === 'narration_sync_drift');

    expect(issue).toMatchObject({
      severity: 'warning',
      overlayId: 2,
    });
    expect(issue?.description).toContain('tierA');
    expect(issue?.description).toContain('+/-40ms');
  });

  it('allows graph G9 tier B word-anchored MGs inside the 120ms window', () => {
    const overlays = [
      videoOverlay(1, 0, 180),
      motionGraphicOverlay(2, 3, {
        graphicType: 'quote-card',
        signalCurves: { decisionFrame: 0, overlayFrom: 3 },
        semanticAtoms: { text: { role: 'quote' } },
      }, { quote: 'This changes everything' }),
    ];

    const report = runQualityReview(overlays, fps, 180);

    expect(report.issues.some((issue) => issue.type === 'narration_sync_drift')).toBe(false);
  });

  it('keeps full-video caption transition speech checks advisory', () => {
    const overlays = [
      videoOverlay(1, 0, 300),
      {
        id: 2,
        type: 'caption',
        from: 0,
        durationInFrames: 300,
        row: 1,
        content: 'caption track spans the whole edit',
      },
      {
        id: 3,
        type: 'transition',
        from: 150,
        durationInFrames: 15,
        row: 0,
        styles: { transitionStyle: 'flash' },
        metadata: {},
      },
    ];

    const report = runQualityReview(overlays, fps, 300);
    const transitionIssue = report.issues.find((issue) => issue.type === 'transition_during_speech');

    expect(transitionIssue?.severity).toBe('info');
  });

  it('requires low narrative pressure evidence before overheld clips become blocking', () => {
    const advisory = runQualityReview([videoOverlay(1, 0, 900)], fps, 900, undefined, undefined, undefined, {
      pacing_tolerance: 4,
      transition_density: 10,
    });
    const blocking = runQualityReview(
      [videoOverlay(1, 0, 900, { signals: { narrative_pressure: 0.2 } })],
      fps,
      900,
      undefined,
      undefined,
      undefined,
      { pacing_tolerance: 4, transition_density: 10 },
    );

    expect(advisory.issues.find((issue) => issue.type === 'clip_too_long')?.severity).toBe('info');
    expect(blocking.issues.find((issue) => issue.type === 'clip_too_long')?.severity).toBe('critical');
  });
});

function videoOverlay(id: number, from: number, durationInFrames: number, metadata: Record<string, unknown> = {}) {
  return {
    id,
    type: 'video',
    from,
    durationInFrames,
    row: 0,
    assetId: `asset-${id}`,
    styles: {},
    metadata,
  };
}

function motionGraphicOverlay(id: number, from: number, metadata: Record<string, unknown>, content: Record<string, unknown> = {}) {
  return {
    id,
    type: 'motion-graphic',
    from,
    durationInFrames: 90,
    row: 1,
    styles: {},
    metadata,
    content,
  };
}

function qualityIssue(type: QualityIssue['type'], severity: QualityIssue['severity']): QualityIssue {
  return {
    type,
    severity,
    description: `${type}-${severity}`,
    autoFixable: false,
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