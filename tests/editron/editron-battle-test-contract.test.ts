import { describe, expect, it } from 'vitest';

import { buildPhase0FixtureManifest } from '@/lib/editron/services/phase0-fixture-manifest';
import {
  buildEditronBattleReport,
  renderEditronBattleReportHtml,
  type BuildEditronBattleReportInput,
} from '@/lib/editron/services/editron-battle-test-contract';

function baseInput(overrides: Partial<BuildEditronBattleReportInput> = {}): BuildEditronBattleReportInput {
  const project: any = {
    projectId: 'proj_battle_test',
    autoEditStatus: 'complete',
    fps: 30,
    durationInFrames: 90,
    productionBrief: { sourceDurationSec: 3 },
    overlays: [
      { id: 'video-1', type: 'video', row: 2, from: 0, durationInFrames: 90, sourceStartFrame: 0 },
    ],
  };
  const manifest: any = buildPhase0FixtureManifest(project, { source: 'battle-test' });
  manifest.canonicalTimeline = { status: 'ok', issue: null, transcriptionWordCount: 0 };
  manifest.unifiedDecisionBundle = {
    status: 'present',
    source: 'unified-planner',
    authority: {
      executableProducer: 'unified-planner',
      creativeBriefRole: 'semantic-context',
    },
    signalDecisionHealth: {
      totalCount: 2,
      unnormalizedCandidateCount: 0,
    },
    decisionOutputTrace: {
      status: 'present',
      samples: [],
    },
  };
  manifest.finalOverlayChoreography = {
    bypassOverlayCount: 0,
    countsByFamily: {},
    topBypasses: [],
  };
  manifest.vjepaCoverage = { status: 'pass', overlayHitRate: 1 };
  manifest.renderArtifacts = {
    ...manifest.renderArtifacts,
    status: 'rendered',
    renderedSummary: {
      status: 'pass',
      score: 0.9,
      passFrames: 3,
      warnFrames: 0,
      failFrames: 0,
      sampledFrames: 3,
      animationSampleFrames: 2,
    },
    renderedIssueSamples: [],
  };

  return {
    runId: 'battle_1',
    capturedAt: '2026-07-14T00:00:00.000Z',
    mode: 'existing-project',
    scenario: 'auto',
    project,
    manifest,
    assets: [{ assetId: 'asset-1', type: 'video', duration: 3, status: 'ready' }],
    staticSuite: { status: 'passed', command: 'vitest', exitCode: 0, durationMs: 100 },
    apiEvidence: {
      projectReload: { ok: true, status: 200 },
      media: [{ assetId: 'asset-1', url: 'https://cdn.test/asset-1', ok: true, status: 206 }],
      chatIsolation: {
        status: 'passed',
        primaryProjectId: 'proj_battle_test',
        comparisonProjectId: 'proj_other',
        canarySessionId: 'session-1',
        leakedIntoComparison: false,
        cleanupSucceeded: true,
      },
    },
    batch: { assets: [{ assetId: 'asset-1', analysisStatus: 'complete', readiness: 'ready' }] },
    requireRenderedEvidence: true,
    ...overrides,
  };
}

describe('Editron battle-test contract', () => {
  it('passes a terminal, rendered, authority-owned run without requiring irrelevant overlay families', () => {
    const report = buildEditronBattleReport(baseInput());

    expect(report.verdict).toBe('pass');
    expect(report.checks.find((item) => item.id === 'authority.single-owner')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'ai-mg.lifecycle')?.status).toBe('skip');
  });

  it('accepts an executed hard cut as a licensed no-overlay boundary decision', () => {
    const input = baseInput();
    (input.manifest as any).unifiedDecisionBundle.decisionOutputTrace = {
      status: 'partial-output-links',
      samples: [{
        type: 'transition',
        outcome: 'executed',
        createdOverlayIds: [],
        modifiedOverlayIds: [],
        paramsPreview: { transitionStyle: 'hard-cut' },
      }],
    };

    const report = buildEditronBattleReport(input);
    expect(report.checks.find((item) => item.id === 'authority.output-trace')?.status).toBe('pass');
  });

  it('fails loudly when rendered evidence is missing', () => {
    const input = baseInput();
    (input.manifest as any).renderArtifacts = {
      ...(input.manifest as any).renderArtifacts,
      status: 'not-rendered',
      renderedSummary: null,
    };

    const report = buildEditronBattleReport(input);
    expect(report.verdict).toBe('fail');
    expect(report.checks.find((item) => item.id === 'quality.rendered-evidence')).toMatchObject({
      status: 'fail',
      blocking: true,
    });
  });

  it('reconciles a generated AI MG job with its sequence asset, overlay, and pixels', () => {
    const input = baseInput({ scenario: 'mg-worthy' });
    (input.project as any).overlays.push({ id: 'mg-1', type: 'mg-sequence', row: 6, from: 20, durationInFrames: 30, assetId: 'seq-1' });
    input.assets = [
      ...(input.assets ?? []),
      { assetId: 'seq-1', type: 'sequence', status: 'ready', frameCount: 30, fps: 30, frameFormat: 'webp', transparent: true, r2Prefix: 'mgseq_1_' },
    ];
    input.mgJobs = [{ _id: 'mgr_1', status: 'completed', result: { status: 'generated' } }];
    input.mgFrameProbes = [{ assetId: 'seq-1', frameUrls: ['a', 'b', 'c'], reachable: true, alphaPreserved: true, animated: true, hashes: ['1', '2', '3'] }];

    const report = buildEditronBattleReport(input);
    expect(report.checks.filter((item) => item.area === 'ai-mg').map((item) => item.status)).toEqual(['pass', 'pass', 'pass']);
  });

  it('fails a generated MG job that has no persisted sequence output', () => {
    const input = baseInput({ scenario: 'mg-worthy' });
    input.mgJobs = [{ _id: 'mgr_1', status: 'completed', result: { status: 'generated' } }];

    const report = buildEditronBattleReport(input);
    expect(report.checks.find((item) => item.id === 'ai-mg.lifecycle')).toMatchObject({ status: 'fail', blocking: true });
  });

  it('renders a self-contained HTML report and escapes evidence', () => {
    const report = buildEditronBattleReport(baseInput({ runId: '<unsafe>' }));
    const html = renderEditronBattleReportHtml(report);

    expect(html).toContain('<!doctype html>');
    expect(html).not.toContain('<unsafe>');
  });
});
