import { describe, expect, it } from 'vitest';

import { buildPhase0RenderedQualityGate as buildSharedPhase0RenderedQualityGate } from '../../lib/editron/services/editron-learning-gate';

import {
  buildPhase0PersistUpdate,
  buildPhase0RenderedQualityGate,
  parseCliArgs,
  phase0NodeCommand,
  phase0RenderArgs,
} from '../../scripts/build-editron-phase0-fixture';

type Phase0PersistSnapshot = Parameters<typeof buildPhase0PersistUpdate>[0];
type Phase0PersistPaths = Parameters<typeof buildPhase0PersistUpdate>[1];

function phase0Snapshot(
  qualityEvidence: Partial<Phase0PersistSnapshot['qualityEvidence']> = {},
): Phase0PersistSnapshot {
  const source = qualityEvidence.qualityEvidenceSource ?? 'rendered-aesthetic';
  const rendered = source === 'rendered-aesthetic';
  return {
    capturedAt: '2026-06-28T00:00:00.000Z',
    qualityEvidence: {
      qualityEvidenceSource: source,
      renderedAestheticStatus: rendered ? 'pass' : 'missing',
      renderedQualityStatus: rendered ? 'pass' : 'missing',
      artifactStatus: rendered ? 'pass' : 'missing',
      qualityScore: rendered ? 82 : null,
      renderedAestheticScore: rendered ? 0.82 : null,
      renderedAestheticIssueCount: 0,
      renderedAestheticIssueSamples: [],
      renderedAestheticFailFrameCount: 0,
      renderedAestheticWarnFrameCount: 0,
      renderedAestheticSampledFrames: rendered ? 3 : 0,
      renderedAestheticJson: rendered ? 'fixtures/proj/rendered-aesthetic/rendered-aesthetic.json' : null,
      renderedAestheticHtml: rendered ? 'fixtures/proj/rendered-aesthetic/report.html' : null,
      ...qualityEvidence,
    },
    renderArtifacts: { status: rendered ? 'rendered' : 'not-rendered' },
  } as Phase0PersistSnapshot;
}

function phase0Paths(): Phase0PersistPaths {
  return {
    runId: 'phase0-run-1',
    runDir: 'fixtures/proj/phase0-run-1',
    manifestPath: 'fixtures/proj/phase0-run-1/manifest.json',
    renderInputPath: 'fixtures/proj/phase0-run-1/render-input.json',
    artifactPackPath: 'fixtures/proj/phase0-run-1/artifact-pack.json',
    failureTaxonomyPath: 'fixtures/proj/phase0-run-1/failure-taxonomy.json',
    renderedAestheticDir: 'fixtures/proj/phase0-run-1/rendered-aesthetic',
    renderedAestheticJson: 'fixtures/proj/phase0-run-1/rendered-aesthetic/rendered-aesthetic.json',
    renderedAestheticHtml: 'fixtures/proj/phase0-run-1/rendered-aesthetic/report.html',
  } as Phase0PersistPaths;
}

describe('build-editron-phase0-fixture cli', () => {
  it('uses environment defaults while keeping render opt-in', () => {
    const options = parseCliArgs(['proj_123'], {
      EDITRON_PHASE0_FIXTURE_DIR: '.calibration-temp/phase0-fixtures',
      EDITRON_PHASE0_RUN_ID: 'run-from-env',
      EDITRON_PHASE0_KEEP_RUNS: '7',
    });

    expect(options).toEqual({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/phase0-fixtures',
      runId: 'run-from-env',
      keepRuns: 7,
      render: false,
      persist: false,
    });
  });

  it('parses output root, run id, pruning, and rendered-evidence capture', () => {
    const options = parseCliArgs([
      'proj_123',
      '.calibration-temp/custom-phase0',
      '--render',
      '--persist',
      '--run-id=20260619T010203004Z',
      '--keep-runs=2',
    ], {});

    expect(options).toEqual({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/custom-phase0',
      runId: '20260619T010203004Z',
      keepRuns: 2,
      render: true,
      persist: true,
    });
  });

  it('does not treat flags as positional output directories', () => {
    const options = parseCliArgs(['proj_123', '--render'], {
      EDITRON_PHASE0_FIXTURE_DIR: '.calibration-temp/phase0-fixtures',
    });

    expect(options).toMatchObject({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/phase0-fixtures',
      render: true,
      persist: false,
    });
  });

  it('rejects unknown flags and extra positional arguments', () => {
    expect(parseCliArgs(['proj_123', '--wat'], {})).toBeNull();
    expect(parseCliArgs(['proj_123', 'out-a', 'out-b'], {})).toBeNull();
  });

  it('builds a shell-free child render command that preserves paths with spaces', () => {
    expect(phase0NodeCommand('C:/node/node.exe')).toBe('C:/node/node.exe');
    expect(phase0RenderArgs(
      'D:/google downloads/render-input.json',
      'D:/google downloads/rendered aesthetic',
      'phase0 tag',
    )).toEqual([
      '--import',
      'tsx',
      'scripts/render-editron-aesthetic.ts',
      'D:/google downloads/render-input.json',
      '--out=D:/google downloads/rendered aesthetic',
      '--tag=phase0 tag',
      '--overlay-only',
    ]);
  });

  it('keeps metadata-only Phase 0 persistence explicit but non-blocking', () => {
    const update = buildPhase0PersistUpdate(phase0Snapshot({
      qualityEvidenceSource: 'metadata-only',
      renderedAestheticStatus: 'missing',
      renderedQualityStatus: 'missing',
      artifactStatus: 'missing',
      qualityScore: null,
    }), phase0Paths());
    const set = update.$set as Record<string, unknown>;

    expect(set['intelligence.phase0RenderedQualityGate']).toMatchObject({
      status: 'missing_rendered_evidence',
      reason: 'missing_rendered_evidence',
      qualityEvidenceSource: 'metadata-only',
    });
    expect(set).not.toHaveProperty('autoEditStatus');
    expect(set).not.toHaveProperty('projectStatus');
  });

  it('persists rendered Phase 0 warnings as explicit non-blocking gate evidence', () => {
    const snapshot = phase0Snapshot({
      qualityEvidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'warn',
      renderedQualityStatus: 'warn',
      artifactStatus: 'warn',
      qualityScore: 74,
      renderedAestheticScore: 0.74,
      renderedAestheticIssueCount: 2,
      renderedAestheticFailFrameCount: 0,
      renderedAestheticWarnFrameCount: 2,
      renderedAestheticIssueSamples: [{
        frame: 42,
        dimension: 'contrast',
        severity: 'warn',
        overlayId: 'cap-1',
        message: 'caption contrast is close to floor',
        evidence: 'contrast=3.2',
      }],
    });
    const gate = buildPhase0RenderedQualityGate(snapshot);
    const update = buildPhase0PersistUpdate(snapshot, phase0Paths());
    const set = update.$set as Record<string, unknown>;

    expect(gate).toMatchObject({
      status: 'warn',
      reason: 'rendered_quality_warning',
      qualityScore: 74,
      renderedAestheticIssueCount: 2,
      renderedAestheticFailFrameCount: 0,
      renderedAestheticIssueSamples: [{
        frame: 42,
        dimension: 'contrast',
        severity: 'warn',
        overlayId: 'cap-1',
        message: 'caption contrast is close to floor',
        evidence: 'contrast=3.2',
      }],
    });
    expect(gate.warning).toContain('warning issue');
    expect(set['intelligence.phase0RenderedQualityGate']).toMatchObject(gate);
    expect(set).not.toHaveProperty('autoEditStatus');
    expect(set).not.toHaveProperty('projectStatus');
    expect(set).not.toHaveProperty('autoEditHealth');
  });

  it('sanitizes rendered Phase 0 issue samples before persistence', () => {
    const oversizedDimension = 'dimension-'.repeat(20);
    const samples = Array.from({ length: 26 }, (_, index) => index === 0
      ? {
          frame: -4.7,
          dimension: oversizedDimension,
          severity: 'critical',
          overlayId: { bad: true },
          message: '   ',
          evidence: true,
        }
      : {
          frame: index + 0.6,
          dimension: `dim-${index}`,
          severity: 'info',
          overlayId: `overlay-${index}`,
          message: `issue-${index}`,
          evidence: `evidence-${index}`,
        });
    const gate = buildSharedPhase0RenderedQualityGate({
      qualityEvidence: {
        qualityEvidenceSource: 'rendered-aesthetic',
        renderedAestheticStatus: 'pass',
        renderedQualityStatus: 'pass',
        artifactStatus: 'pass',
        qualityScore: 82,
        renderedAestheticFailFrameCount: 0,
        renderedAestheticIssueCount: samples.length,
        renderedAestheticIssueSamples: samples,
      },
    });

    expect(gate.renderedAestheticIssueSamples).toHaveLength(24);
    expect(gate.renderedAestheticIssueSamples[0]).toEqual({
      frame: 0,
      dimension: oversizedDimension.slice(0, 80),
      severity: 'warn',
      overlayId: null,
      message: 'Rendered aesthetic issue',
      evidence: 'true',
    });
    expect(gate.renderedAestheticIssueSamples.at(-1)).toMatchObject({
      frame: 24,
      dimension: 'dim-23',
      severity: 'info',
      overlayId: 'overlay-23',
    });
  });
  it('persists rendered Phase 0 failures as review state instead of learning-safe completion', () => {
    const snapshot = phase0Snapshot({
      qualityEvidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'fail',
      renderedQualityStatus: 'fail',
      artifactStatus: 'fail',
      qualityScore: 37,
      renderedAestheticScore: 0.37,
      renderedAestheticIssueCount: 3,
      renderedAestheticFailFrameCount: 2,
    });
    const gate = buildPhase0RenderedQualityGate(snapshot);
    const update = buildPhase0PersistUpdate(snapshot, phase0Paths());
    const set = update.$set as Record<string, unknown>;

    expect(gate).toMatchObject({
      status: 'needs_review',
      reason: 'rendered_quality_failed',
      qualityScore: 37,
      renderedAestheticFailFrameCount: 2,
    });
    expect(set['intelligence.phase0RenderedQualityGate']).toMatchObject(gate);
    expect(set).toMatchObject({
      autoEditStatus: 'needs_review',
      projectStatus: 'needs-attention',
      autoEditHealth: 'needs_review',
    });
    expect(set.autoEditWarning).toContain('Rendered Phase 0 quality failed');
  });
});
