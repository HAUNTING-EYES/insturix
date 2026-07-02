import { describe, expect, it } from 'vitest';

import {
  PHASE0_LIVE_TRUTH_VERSION,
  buildPhase0LiveTruthSnapshot,
} from '../../lib/editron/services/phase0-live-truth';
import {
  buildPhase0FixtureManifest,
  type Phase0FixtureProject,
} from '../../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../../lib/editron/services/phase0-render-artifact-pack';

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

  it('promotes rendered evidence only when a real rendered report is supplied', () => {
    const project = projectFixture({
      overlays: [
        { id: 1, type: 'video', from: 0, durationInFrames: 180, row: 2, assetId: 'asset_video' },
        {
          id: 'mg-1',
          type: 'motion-graphic',
          from: 30,
          durationInFrames: 60,
          content: 'rendered proof',
          metadata: { atomicOverlayReceipt: { family: 'motion-graphic' } },
        },
      ],
    });
    const baseManifest = buildPhase0FixtureManifest(project, {
      artifactDir: 'fixtures/proj_phase0_live_truth',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, baseManifest, {
      artifactDir: 'fixtures/proj_phase0_live_truth',
    });

    const snapshot = buildPhase0LiveTruthSnapshot(project, {
      capturedAt: '2026-06-28T00:03:00.000Z',
      source: 'phase0-fixture:fixtures/proj_phase0_live_truth',
      artifactDir: 'fixtures/proj_phase0_live_truth',
      artifactPack,
      renderedAestheticReport: {
        outputDir: 'fixtures/proj_phase0_live_truth/rendered-aesthetic',
        jsonReport: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/rendered-aesthetic.json',
        htmlReport: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/report.html',
        summary: {
          status: 'warn',
          score: 0.64,
          passFrames: 1,
          warnFrames: 2,
          failFrames: 0,
          sampledFrames: 3,
          animationSampleFrames: 1,
        },
        frames: [{
          frame: 45,
          activeOverlayIds: ['mg-1'],
          activeOverlayTypes: ['motion-graphic'],
          fullStill: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/f00045/full.png',
          baselineStill: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/f00045/baseline.png',
          report: {
            status: 'warn',
            score: 0.64,
            issues: [{
              dimension: 'readability',
              severity: 'warn',
              overlayId: 'mg-1',
              message: 'Text contrast is close to floor.',
              evidence: 'contrast=3.1',
            }],
          },
        }],
      },
    });

    expect(snapshot.renderArtifacts.status).toBe('rendered');
    expect(snapshot.renderArtifacts.renderedIssueCount).toBe(1);
    expect(snapshot.renderArtifacts.renderedSummary).toMatchObject({
      status: 'warn',
      score: 0.64,
      sampledFrames: 3,
    });
    expect(snapshot.qualityEvidence).toMatchObject({
      qualityEvidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'warn',
      renderedQualityStatus: 'warn',
      artifactStatus: 'warn',
      qualityScore: 64,
      renderedAestheticIssueCount: 1,
      renderedAestheticJson: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/rendered-aesthetic.json',
      renderedAestheticHtml: 'fixtures/proj_phase0_live_truth/rendered-aesthetic/report.html',
    });

    const failureClassIds = snapshot.failureClasses.map((item) => item.id);
    expect(failureClassIds).not.toContain('render.artifact_pack_missing');
    expect(failureClassIds).toEqual(expect.arrayContaining([
      'render.aesthetic_gate_warn',
      'render.readability_warn',
    ]));
    expect(snapshot.failureClasses.find((item) => item.id === 'render.readability_warn')?.evidence).toMatchObject({
      dimension: 'readability',
      count: 1,
      samples: [{
        frame: 45,
        overlayId: 'mg-1',
        message: 'Text contrast is close to floor.',
        evidence: 'contrast=3.1',
      }],
    });
  });
});
