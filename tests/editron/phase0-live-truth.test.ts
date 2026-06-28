import { describe, expect, it } from 'vitest';

import {
  PHASE0_LIVE_TRUTH_VERSION,
  buildPhase0LiveTruthSnapshot,
} from '../../lib/editron/services/phase0-live-truth';
import type { Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';

function projectFixture(overrides: Partial<Phase0FixtureProject> = {}): Phase0FixtureProject {
  return {
    projectId: 'proj_phase0_live_truth',
    fps: 30,
    durationInFrames: 180,
    playerDimensions: { width: 1080, height: 1920 },
    aspectRatio: '9:16',
    overlays: [
      { id: 1, type: 'video', from: 0, durationInFrames: 180, row: 2, assetId: 'asset_video' },
      {
        id: 2,
        type: 'caption',
        from: 0,
        durationInFrames: 180,
        row: 5,
        captions: [{ startFrame: 15, endFrame: 75, text: 'final saved caption' }],
        styles: { top: 70, left: 10, width: 80, height: 15 },
      },
    ],
    qualityReview: {
      version: 'quality-review-persistence-v1',
      overallScore: 72,
      issueCount: 1,
      criticalCount: 0,
      warningCount: 1,
      infoCount: 0,
      autoFixableCount: 0,
      issuesPersistedCount: 1,
      issuesTruncated: false,
      issues: [{
        type: 'caption_timing',
        severity: 'warning',
        description: 'Caption group is too fast.',
        frameRange: { start: 15, end: 30 },
        overlayId: 2,
        suggestedFix: 'Extend caption hold.',
        autoFixable: false,
      }],
      suggestions: ['Review caption timing.'],
      analyzedAt: new Date('2026-06-28T00:00:00.000Z'),
      reviewedAt: new Date('2026-06-28T00:01:00.000Z'),
    },
    intelligence: {
      unifiedDecisionBundle: {
        version: 'unified-decision-bundle-summary-v1',
        authority: {
          version: 'decision-authority-v1',
          executableProducer: 'unified-planner',
          advisoryProducers: ['creative-brief', 'signal-driven'],
          signalDecisionRole: 'candidate-source',
          signalDecisionsCanAddExecutable: true,
          decisionMode: 'unified-planner',
        },
      },
    },
    ...overrides,
  };
}

describe('phase0 live truth snapshot', () => {
  it('summarizes the final saved project and refuses to fake rendered evidence', () => {
    const snapshot = buildPhase0LiveTruthSnapshot(projectFixture(), {
      capturedAt: '2026-06-28T00:02:00.000Z',
      source: 'director-final-save',
    });

    expect(snapshot).toMatchObject({
      version: PHASE0_LIVE_TRUTH_VERSION,
      capturedAt: '2026-06-28T00:02:00.000Z',
      source: 'director-final-save',
      projectId: 'proj_phase0_live_truth',
      overlayCounts: { video: 1, caption: 1 },
      qualityEvidence: {
        qualityEvidenceSource: 'metadata-only',
        renderedAestheticStatus: 'missing',
        renderedQualityStatus: 'missing',
      },
      calibrationSafety: {
        renderQualityRequiredBeforeWrites: true,
        learningWritesAllowed: false,
      },
    });
    expect(snapshot.qualityReview.status).toBe('present');
    expect(snapshot.qualityReview.issueCount).toBe(1);
    expect(snapshot.renderArtifacts.status).toBe('not-rendered');
    expect(snapshot.failureClasses.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'render.artifact_pack_missing',
        'calibration.learning_writes_blocked',
      ]),
    );
  });
});
