import { describe, expect, it } from 'vitest';

import { classifyPhase0Fixture } from '../../lib/editron/services/phase0-failure-taxonomy';
import { buildPhase0FixtureManifest } from '../../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../../lib/editron/services/phase0-render-artifact-pack';
import { runQualityReview } from '../../lib/editron/services/quality-review-service';
import type { PersistedQualityReview } from '../../lib/editron/services/quality-review-persistence';

function transitionSfxReceipt(transitionId = 'tr-1') {
  return {
    family: 'sfx',
    target: { transitionOverlayId: transitionId },
    payload: {
      syncAnchor: 'transition',
      transitionJob: 'emphasize-turn',
      transitionIntent: 'impact-transfer',
      transitionEvidenceSource: 'explicit-boundary-job',
    },
    atoms: [
      { kind: 'transition-relation', key: 'transition.overlay_id', value: transitionId },
      { kind: 'transition-relation', key: 'transition.job', value: 'emphasize-turn' },
      { kind: 'transition-relation', key: 'transition.intent', value: 'impact-transfer' },
      { kind: 'transition-relation', key: 'transition.evidence_source', value: 'explicit-boundary-job' },
    ],
  };
}

describe('phase0 failure taxonomy', () => {
  it('keeps a clean fixture passable while recording read-only render/calibration state', () => {
    const project = cleanProject();
    const manifest = buildPhase0FixtureManifest(project, {
      capturedAt: '2026-06-14T00:00:00.000Z',
      artifactDir: '.calibration-temp/phase0-fixtures/proj_clean',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_clean',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.status).toBe('pass');
    expect(taxonomy.summary).toEqual({ total: 4, fail: 0, warn: 0, info: 4 });
    expect(taxonomy.classes.map((item) => item.id)).toEqual([
      'render.required_family_coverage_missing',
      'render.not_executed',
      'quality.review_metadata_missing',
      'calibration.learning_writes_blocked',
    ]);
    expect(taxonomy.classes.find((item) => item.id === 'render.required_family_coverage_missing')).toMatchObject({
      severity: 'info',
      evidence: {
        missingRequiredFamilies: ['caption', 'zoom'],
        presentRequiredFamilies: ['motion-graphic', 'sfx', 'transition'],
      },
    });
  });

  it('classifies broken fixture evidence with stable failure ids', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_broken',
      fps: 30,
      durationInFrames: 180,
      playerDimensions: { width: 1080, height: 1920 },
      rawFootageAnalysis: {
        originalDurationMs: 6000,
        estimatedCleanDurationMs: 6000,
        transcription: { words: [{ word: 'hello', startMs: 0, endMs: 200 }] },
        segments: [{ text: 'hello', startMs: 0, endMs: 200, fillerCount: 0, silenceGapCount: 0, avgWordGapMs: 0 }],
        silenceRemovalPlan: [{
          startMs: 1200,
          endMs: 1200,
          action: 'split',
          reason: 'pacing-split',
        }],
      },
      overlays: [
        { id: 'clip-1', type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { id: 'clip-2', type: 'video', from: 45, durationInFrames: 30 },
        { id: 'clip-3', type: 'video', from: 70, durationInFrames: 20, sourceStartFrame: 120 },
        { id: 'mg-1', type: 'motion-graphic', from: 12, durationInFrames: 50, content: 'weak' },
        { id: 'tr-1', type: 'transition', from: 44, durationInFrames: 12 },
        { id: 'sfx-1', type: 'sound', from: 44, durationInFrames: 12 },
      ],
      intelligence: {
        vjepaCoverageAudit: {
          status: 'warn',
          issues: ['warn:low-vjepa-duration-coverage:50%'],
          fps: 30,
          segmentCoverage: {
            segmentCount: 1,
            spanStartMs: 0,
            spanEndMs: 3000,
            coveredMs: 3000,
            gapCount: 0,
            gapTotalMs: 0,
            maxGapMs: 0,
            coverageRatio: 0.5,
            fieldCoverage: {
              visualSignificance: 1,
              motionIntensity: 1,
              actionType: 0,
              motionType: 0,
              faceEmotion: 0,
              eyeContact: 0,
              motionVector: 0,
              mainSubject: 0,
              textBoxes: 0,
              textCoverage: 0,
              negativeSpace: 0,
              objectCount: 0,
              faceCount: 0,
            },
          },
          overlayHitRate: 0,
          overlayHits: [],
        },
      },
    };
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_broken',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_broken',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.status).toBe('fail');
    expect(taxonomy.classes.map((item) => item.id)).toEqual(expect.arrayContaining([
      'cut.mid_timeline_gaps',
      'cut.overlapping_video_clips',
      'cut.pacing_split_evidence_missing',
      'cut.tail_gap',
      'timeline.source_mapping_incomplete',
      'timeline.canonical_context_not_safe',
      'decision.unified_bundle_missing',
      'vjepa.coverage_warn',
      'overlay.mg_atomic_spine_incomplete',
      'overlay.transition_form_missing',
      'overlay.transition_boundary_evidence_missing',
      'overlay.sfx_form_missing',
      'render.not_executed',
      'calibration.learning_writes_blocked',
    ]));
    expect(taxonomy.summary.fail).toBeGreaterThan(0);
    expect(taxonomy.summary.warn).toBeGreaterThan(0);
  });

  it('fails when the render artifact pack is missing or not renderable', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_no_render',
      fps: 30,
      durationInFrames: 60,
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [{ id: 'sound-1', type: 'sound', from: 0, durationInFrames: 60 }],
    };
    const manifest = buildPhase0FixtureManifest(project);
    const missingPack = classifyPhase0Fixture(manifest);
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_no_render',
    });
    const notRenderablePack = classifyPhase0Fixture(manifest, artifactPack);
    const dirtyManifest = buildPhase0FixtureManifest(project, {
      codeProvenance: {
        branch: 'infrastructure-improvs-+Editron',
        head: 'abc123',
        upstreamHead: 'def456',
        dirty: true,
        dirtyPaths: ['lib/editron/motion-graphics/engine/composition-planner.ts'],
        untrackedPaths: ['.codex-digest/'],
        capturedBy: 'test',
      },
    });
    const dirtyPack = classifyPhase0Fixture(dirtyManifest, artifactPack);

    expect(missingPack.classes.map((item) => item.id)).toContain('render.artifact_pack_missing');
    expect(notRenderablePack.classes.map((item) => item.id)).toContain('render.artifact_pack_not_ready');
    expect(dirtyPack.classes.find((item) => item.id === 'render.dirty_code_checkout')).toMatchObject({
      severity: 'warn',
      evidence: {
        branch: 'infrastructure-improvs-+Editron',
        dirtyPathCount: 1,
        dirtyPaths: ['lib/editron/motion-graphics/engine/composition-planner.ts'],
        untrackedPaths: ['.codex-digest/'],
      },
    });
  });

  it('warns when a unified bundle has no old-producer gating evidence', () => {
    const project = cleanProject();
    delete project.intelligence?.postBundleProfileActionPolicy;
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_missing_gating',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_missing_gating',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.status).toBe('warn');
    expect(taxonomy.classes.find((item) => item.id === 'decision.old_producer_gating_missing')).toMatchObject({
      severity: 'warn',
      evidence: { issue: 'post-bundle profile action policy evidence is missing' },
    });
  });

  it('classifies rendered aesthetic failures with stable ids and grouped evidence', () => {
    const project = cleanProject();
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_rendered_fail',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_rendered_fail',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack, {
      summary: {
        status: 'fail',
        score: 0.18,
        passFrames: 1,
        warnFrames: 1,
        failFrames: 2,
        sampledFrames: 4,
        animationSampleFrames: 3,
      },
      frames: [{
        frame: 12,
        report: {
          issues: [{
            dimension: 'contrast',
            severity: 'fail',
            message: 'rendered text contrast is below accessibility floor',
            overlayId: 'caption-1',
            evidence: 'contrast=1.37; required=4.5',
          }, {
            dimension: 'text',
            severity: 'warn',
            message: 'caption row is crowded',
            overlayId: 'caption-1',
            evidence: 'rowCapacity=6',
          }],
        },
      }, {
        frame: 48,
        report: {
          issues: [{
            dimension: 'occlusion',
            severity: 'fail',
            message: 'overlay covers protected main subject region',
            overlayId: 'mg-1',
            evidence: 'ratio=1.00; strength=0.45',
          }, {
            dimension: 'safe-area',
            severity: 'warn',
            message: 'text overlay leaves title-safe area',
            overlayId: 'mg-1',
            evidence: 'overflowPx=114.0',
          }, {
            dimension: 'render',
            severity: 'fail',
            message: 'render is not valid: blank',
            evidence: 'blank-ish image stats',
          }],
        },
      }],
    });
    const classIds = taxonomy.classes.map((item) => item.id);

    expect(taxonomy.status).toBe('fail');
    expect(classIds).not.toContain('render.not_executed');
    expect(classIds).toEqual(expect.arrayContaining([
      'render.aesthetic_gate_failed',
      'render.contrast_fail',
      'render.occlusion_fail',
      'render.render_fail',
      'render.safe_area_warn',
      'render.text_warn',
      'calibration.learning_writes_blocked',
    ]));
    expect(taxonomy.classes.find((item) => item.id === 'render.aesthetic_gate_failed')).toMatchObject({
      severity: 'fail',
      evidence: {
        score: 0.18,
        failFrames: 2,
        sampledFrames: 4,
      },
    });
    expect(taxonomy.classes.find((item) => item.id === 'render.contrast_fail')).toMatchObject({
      severity: 'fail',
      evidence: {
        dimension: 'contrast',
        count: 1,
        samples: [{
          frame: 12,
          overlayId: 'caption-1',
          message: 'rendered text contrast is below accessibility floor',
          evidence: 'contrast=1.37; required=4.5',
        }],
      },
    });
  });

  it('warns when persisted caption geometry contradicts its declared layout', () => {
    const project = cleanProject();
    project.playerDimensions = { width: 1920, height: 1080 };
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 0 },
      {
        id: 'caption-stale',
        type: 'caption',
        from: 0,
        durationInFrames: 180,
        top: 86,
        left: 320,
        width: 1280,
        height: 130,
        captions: [{ text: 'this is readable caption text' }],
        metadata: {
          source: 'canonical-caption-track',
          captionPresentation: {
            version: 'atomic-caption-form-v1',
            aesthetic: {
              layout: 'subtitle-lower',
              surface: 'subtitle-panel',
            },
          },
          evidence: {
            selectedRegion: 'bottom-center',
          },
        },
      },
    ];

    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_caption_mismatch',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_caption_mismatch',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.status).toBe('warn');
    expect(taxonomy.classes.find((item) => item.id === 'overlay.caption_layout_mismatch')).toMatchObject({
      severity: 'warn',
      evidence: {
        count: 1,
        canvas: { width: 1920, height: 1080 },
        samples: [{
          id: 'caption-stale',
          layout: 'subtitle-lower',
          selectedRegion: 'bottom-center',
          top: 86,
          height: 130,
          normalizedTop: 0.08,
          normalizedCenter: 0.14,
          normalizedBottom: 0.2,
          expectedRegion: 'lower-half',
        }],
      },
    });
  });

  it('does not warn when selected caption region explains safe-zone relocation', () => {
    const project = cleanProject();
    project.playerDimensions = { width: 1920, height: 1080 };
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 0 },
      {
        id: 'caption-relocated',
        type: 'caption',
        from: 0,
        durationInFrames: 180,
        top: 130,
        left: 320,
        width: 1280,
        height: 140,
        captions: [{ text: 'this is readable caption text' }],
        metadata: {
          source: 'canonical-caption-track',
          captionPresentation: {
            version: 'atomic-caption-form-v1',
            aesthetic: {
              layout: 'subtitle-lower',
              surface: 'subtitle-panel',
            },
          },
          evidence: {
            selectedRegion: 'top-center',
          },
        },
      },
    ];

    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_caption_relocated',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_caption_relocated',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.classes.find((item) => item.id === 'overlay.caption_layout_mismatch')).toBeUndefined();
  });

  it('warns when cut plan evidence is missing from a Phase 0 fixture', () => {
    const project = cleanProject();
    project.rawFootageAnalysis = undefined;
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_cut_plan_missing',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_cut_plan_missing',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.classes.find((item) => item.id === 'cut.plan_missing')).toMatchObject({
      severity: 'warn',
      evidence: {
        status: 'missing-raw-footage',
        issue: 'rawFootageAnalysis is not present on the project',
      },
    });
  });

  it('flags persisted quality review defects with severity', () => {
    const project = cleanProject();
    project.qualityReview = {
      overallScore: 0.18,
      issueCount: 2,
      criticalCount: 1,
      warningCount: 1,
      infoCount: 0,
      autoFixableCount: 1,
      issuesPersistedCount: 2,
      issuesTruncated: false,
      issues: [{
        type: 'overlay-density',
        severity: 'critical',
        description: 'too many MG overlays on one segment',
        frameRange: { start: 1, end: 24 },
        overlayId: 7,
        suggestedFix: 'reduce overlay density',
        autoFixable: false,
      }],
      suggestions: ['remove one MG at 12s'],
      analyzedAt: new Date('2026-06-14T00:00:00.000Z'),
      reviewedAt: new Date('2026-06-14T00:00:00.000Z'),
      version: 'quality-review-persistence-v1',
    } as Record<string, unknown>;
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_quality_issues',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_quality_issues',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const classIds = taxonomy.classes.map((item) => item.id);

    expect(taxonomy.status).toBe('fail');
    expect(classIds).toEqual(expect.arrayContaining([
      'quality.critical_issues',
      'quality.warning_issues',
      'quality.low_overall_score',
    ]));
    expect(taxonomy.classes.find((item) => item.id === 'quality.critical_issues')).toMatchObject({
      severity: 'fail',
      evidence: {
        criticalCount: 1,
        issueCount: 2,
      },
    });
    expect(taxonomy.classes.find((item) => item.id === 'quality.low_overall_score')).toMatchObject({
      severity: 'fail',
    });
  });

  it('does not fail cut continuity for video overlaps covered by transition handles', () => {
    const project = cleanProject();
    project.durationInFrames = 100;
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 30, durationInFrames: 60, sourceStartFrame: 60 },
      { id: 'transition-1', type: 'transition', from: 45, durationInFrames: 30, transitionStyle: 'cross-dissolve' },
    ];

    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_transition_handles',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_transition_handles',
    });
    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const classIds = taxonomy.classes.map((item) => item.id);

    expect(classIds).not.toContain('cut.overlapping_video_clips');
    expect(classIds).toContain('cut.transition_overlap_handles');
    expect(taxonomy.classes.find((item) => item.id === 'cut.transition_overlap_handles')).toMatchObject({
      severity: 'info',
      evidence: {
        count: 1,
      },
    });
  });

  it('warns when transition atomic form is not backed by boundary evidence', () => {
    const project = cleanProject();
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 60, durationInFrames: 60, sourceStartFrame: 60 },
      {
        id: 'transition-form-only',
        type: 'transition',
        from: 60,
        durationInFrames: 12,
        transitionStyle: 'whip-pan',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1' } },
      },
    ];

    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_transition_boundary_missing',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_transition_boundary_missing',
    });
    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);

    expect(taxonomy.classes.find((item) => item.id === 'overlay.transition_boundary_evidence_missing')).toMatchObject({
      severity: 'warn',
      evidence: {
        count: 1,
        withBoundaryPair: 0,
        withBoundaryReason: 0,
        samples: [{
          id: 'transition-form-only',
          from: 60,
          style: 'whip-pan',
          missing: ['boundary-pair', 'boundary-reason'],
        }],
      },
    });
  });

  it('classifies timeline-level zoom, transition, and SFX timing defects from artifact evidence', () => {
    const project = cleanProject();
    project.durationInFrames = 260;
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 260, sourceStartFrame: 0 },
      {
        id: 'mg-1',
        type: 'motion-graphic',
        from: 12,
        durationInFrames: 50,
        content: 'clean',
        metadata: {
          atomicOverlayPlan: { version: 'atomic-overlay-plan-v1' },
          atomicOverlayReceipt: { family: 'motion-graphic' },
          atomicMomentBundle: { semanticAtoms: [{ kind: 'text' }], relations: [] },
        },
      },
      {
        id: 'tr-1',
        type: 'transition',
        from: 30,
        durationInFrames: 12,
        transitionStyle: 'cross-dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'cross-dissolve' } },
      },
      {
        id: 'tr-2',
        type: 'transition',
        from: 70,
        durationInFrames: 12,
        transitionStyle: 'cross-dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'cross-dissolve' } },
      },
      {
        id: 'tr-3',
        type: 'transition',
        from: 110,
        durationInFrames: 12,
        transitionStyle: 'cross-dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'cross-dissolve' } },
      },
      {
        id: 'zoom-1',
        type: 'zoom',
        from: 150,
        durationInFrames: 30,
        metadata: { atomicZoomForm: { intent: 'emphasis-push' } },
      },
      {
        id: 'zoom-2',
        type: 'zoom',
        from: 205,
        durationInFrames: 30,
        metadata: { atomicZoomForm: { intent: 'emphasis-push' } },
      },
      {
        id: 'sfx-1',
        type: 'sound',
        from: 40,
        durationInFrames: 12,
        assetId: 'sfx-1',
        metadata: { atomicSfxForm: { role: 'whoosh' } },
      },
      {
        id: 'sfx-2',
        type: 'sound',
        from: 48,
        durationInFrames: 12,
        assetId: 'sfx-2',
        metadata: { atomicSfxForm: { role: 'impact' } },
      },
      {
        id: 'sfx-3',
        type: 'sound',
        from: 70,
        durationInFrames: 12,
        assetId: 'sfx-3',
        metadata: { atomicSfxForm: { role: 'whoosh' } },
      },
    ];
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_timing_defects',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_timing_defects',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const classIds = taxonomy.classes.map((item) => item.id);

    expect(taxonomy.status).toBe('warn');
    expect(classIds).toEqual(expect.arrayContaining([
      'timeline.transition_repetition',
      'timeline.zoom_too_dense',
      'timeline.sfx_too_dense',
      'timeline.sfx_timing_drift',
      'timeline.transition_sfx_missing',
    ]));
    expect(taxonomy.classes.find((item) => item.id === 'timeline.transition_repetition')).toMatchObject({
      severity: 'warn',
      evidence: {
        threshold: 3,
        samples: [{
          style: 'cross-dissolve',
          runLength: 3,
          startFrame: 30,
          overlayIds: ['tr-1', 'tr-2', 'tr-3'],
        }],
      },
    });
    expect(taxonomy.classes.find((item) => item.id === 'timeline.sfx_timing_drift')).toMatchObject({
      severity: 'warn',
      evidence: {
        syncWindowFrames: 3,
      },
    });
  });

  it('judges atomic SFX by sync frame instead of pre-roll start frame', () => {
    const project = cleanProject();
    project.durationInFrames = 120;
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, row: 2, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 60, durationInFrames: 60, row: 2, sourceStartFrame: 60 },
      {
        id: 'tr-1',
        type: 'transition',
        from: 60,
        durationInFrames: 12,
        row: 3,
        transitionStyle: 'cross-dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'cross-dissolve' } },
      },
      {
        id: 'sfx-1',
        type: 'sound',
        from: 53,
        durationInFrames: 18,
        row: 0,
        assetId: 'sfx-1',
        metadata: {
          atomicSfxForm: {
            role: 'whoosh',
            timing: {
              syncFrame: 60,
              startFrame: 53,
              anchor: 'transition',
            },
          },
          atomicOverlayReceipt: {
            family: 'sound',
            reason: 'overlays replaced in the editor',
          },
          atomicOverlayReceipts: [transitionSfxReceipt()],
        },
      },
    ];
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_sync_frame',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_sync_frame',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const quality = runQualityReview(project.overlays as any, project.fps, project.durationInFrames);

    expect(manifest.overlayFamilies.sfx.withTransitionEvidence).toBe(1);
    expect(manifest.overlayFamilies.sfx.transitionEvidenceMissing).toEqual([]);
    expect(taxonomy.classes.map((item) => item.id)).not.toContain('timeline.sfx_timing_drift');
    expect(taxonomy.classes.map((item) => item.id)).not.toContain('timeline.transition_sfx_missing');
    expect(quality.issues.map((issue) => issue.type)).not.toContain('orphan_sfx');
    expect(quality.issues.map((issue) => issue.type)).not.toContain('missing_transition_sfx');
  });

  it('does not call motion-peak atomic SFX random when motion evidence licenses the audio anchor', () => {
    const project = cleanProject();
    project.durationInFrames = 180;
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 180, row: 2, sourceStartFrame: 0 },
      {
        id: 'sfx-motion',
        type: 'sound',
        from: 118,
        durationInFrames: 12,
        row: 0,
        assetId: 'sfx-motion',
        metadata: {
          atomicSfxForm: {
            role: 'impact',
            timing: {
              syncFrame: 120,
              startFrame: 118,
              anchor: 'motion-peak',
            },
          },
          atomicOverlayReceipt: {
            family: 'sfx',
            payload: { syncAnchor: 'motion-peak' },
            visualContext: { motionIntensity: 0.8 },
            atoms: [{ kind: 'motion-intensity', key: 'visual.motion_intensity', value: 0.8 }],
          },
        },
      },
    ];
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_motion_peak',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_motion_peak',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const quality = runQualityReview(project.overlays as any, project.fps, project.durationInFrames);

    expect(taxonomy.classes.map((item) => item.id)).not.toContain('timeline.sfx_orphan');
    expect(quality.issues.map((issue) => issue.type)).not.toContain('orphan_sfx');
  });

  it('reviews canonical caption visible groups instead of the full-track container duration', () => {
    const overlays = [
      { id: 1, type: 'video', from: 0, durationInFrames: 90, row: 2, sourceStartFrame: 0 },
      { id: 2, type: 'video', from: 90, durationInFrames: 90, row: 2, sourceStartFrame: 90 },
      {
        id: 3,
        type: 'caption',
        from: 0,
        durationInFrames: 180,
        row: 4,
        captions: [
          { text: 'first readable group', startMs: 0, endMs: 1400 },
          { text: 'second readable group', startMs: 3100, endMs: 4500 },
        ],
        metadata: { source: 'canonical-caption-track' },
      },
    ];

    const quality = runQualityReview(overlays as any, 30, 180);
    const types = quality.issues.map((issue) => issue.type);

    expect(types).not.toContain('caption_timing');
    expect(types).not.toContain('caption_spans_cut');
  });

  it('still flags canonical caption groups that are too short or actually span a hard cut', () => {
    const overlays = [
      { id: 1, type: 'video', from: 0, durationInFrames: 90, row: 2, sourceStartFrame: 0 },
      { id: 2, type: 'video', from: 90, durationInFrames: 90, row: 2, sourceStartFrame: 90 },
      {
        id: 3,
        type: 'caption',
        from: 0,
        durationInFrames: 180,
        row: 4,
        captions: [
          { text: 'too fast', startMs: 1000, endMs: 1400 },
          { text: 'crosses the cut', startMs: 2800, endMs: 3300 },
        ],
        metadata: { source: 'canonical-caption-track' },
      },
    ];

    const quality = runQualityReview(overlays as any, 30, 180);
    const timingIssue = quality.issues.find((issue) => issue.type === 'caption_timing');
    const spansCutIssue = quality.issues.find((issue) => issue.type === 'caption_spans_cut');

    expect(timingIssue).toMatchObject({
      overlayId: 3,
      frameRange: { start: 30, end: 42 },
    });
    expect(spansCutIssue).toMatchObject({
      overlayId: 3,
      frameRange: { start: 87, end: 93 },
    });
  });

  it('warns when nearby transition SFX lacks transition provenance', () => {
    const project = cleanProject();
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, row: 2, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 60, durationInFrames: 60, row: 2, sourceStartFrame: 60 },
      {
        id: 'tr-1',
        type: 'transition',
        from: 60,
        durationInFrames: 12,
        row: 3,
        transitionStyle: 'cross-dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'cross-dissolve', job: 'emphasize-turn' } },
      },
      {
        id: 'sfx-nearby',
        type: 'sound',
        from: 53,
        durationInFrames: 18,
        row: 0,
        assetId: 'sfx-nearby',
        metadata: {
          atomicSfxForm: {
            role: 'whoosh',
            timing: {
              syncFrame: 60,
              startFrame: 53,
              anchor: 'transition',
            },
          },
          atomicOverlayReceipt: {
            family: 'sfx',
            payload: { syncAnchor: 'transition' },
          },
        },
      },
    ];
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_provenance_missing',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_sfx_provenance_missing',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const classIds = taxonomy.classes.map((item) => item.id);

    expect(classIds).toEqual(expect.arrayContaining([
      'overlay.sfx_transition_evidence_missing',
      'timeline.transition_sfx_missing',
    ]));
    expect(taxonomy.classes.find((item) => item.id === 'overlay.sfx_transition_evidence_missing')).toMatchObject({
      severity: 'warn',
      evidence: {
        count: 1,
        withTransitionAnchor: 1,
        withTransitionEvidence: 0,
        samples: [{
          id: 'sfx-nearby',
          from: 53,
          role: 'whoosh',
          missing: ['transition-overlay-id', 'transition-job-or-intent', 'transition-evidence-source'],
        }],
      },
    });
  });

  it('does not require paired SFX for intentionally silent transition forms', () => {
    const project = cleanProject();
    project.overlays = [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, row: 2, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 60, durationInFrames: 60, row: 2, sourceStartFrame: 60 },
      {
        id: 'tr-soft',
        type: 'transition',
        from: 60,
        durationInFrames: 5,
        row: 3,
        transitionStyle: 'soft-cut',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'soft-cut', sfxRole: 'none' } },
      },
      {
        id: 'tr-dissolve-silent',
        type: 'transition',
        from: 90,
        durationInFrames: 18,
        row: 3,
        transitionStyle: 'dissolve',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'dissolve', sfxRole: 'none' } },
      },
      {
        id: 'tr-profile-suppressed',
        type: 'transition',
        from: 120,
        durationInFrames: 18,
        row: 3,
        transitionStyle: 'zoom-punch',
        metadata: {
          atomicTransitionForm: { version: 'atomic-transition-form-v1', style: 'zoom-punch', sfxRole: 'impact' },
          transitionSfxPlacement: {
            version: 'transition-sfx-placement-v1',
            status: 'suppressed',
            reason: 'profile-policy-off',
            policy: 'off',
            style: 'zoom-punch',
          },
        },
      },
    ];
    const manifest = buildPhase0FixtureManifest(project, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_silent_transition',
    });
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_silent_transition',
    });

    const taxonomy = classifyPhase0Fixture(manifest, artifactPack);
    const quality = runQualityReview(project.overlays as any, project.fps, project.durationInFrames);

    expect(taxonomy.classes.map((item) => item.id)).not.toContain('timeline.transition_sfx_missing');
    expect(quality.issues.map((issue) => issue.type)).not.toContain('missing_transition_sfx');
  });
});

function cleanProject(): Phase0FixtureProject {
  return {
    projectId: 'proj_clean',
    fps: 30,
    durationInFrames: 90,
    playerDimensions: { width: 1080, height: 1920 },
    rawFootageAnalysis: {
      originalDurationMs: 3000,
      estimatedCleanDurationMs: 3000,
      transcription: { words: [{ word: 'hello', startMs: 0, endMs: 300 }] },
      segments: [{ text: 'hello', startMs: 0, endMs: 300, fillerCount: 0, silenceGapCount: 0, avgWordGapMs: 0 }],
      silenceRemovalPlan: [{
        startMs: 0,
        endMs: 0,
        action: 'split',
        reason: 'pacing-split',
        metadata: {
          kind: 'pacing-split',
          source: 'transcript-segment-boundary',
          boundaryReasons: ['transcript-segment-boundary'],
          speechGapMs: 0,
        },
      }],
    },
    overlays: [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 45, sourceStartFrame: 0 },
      { id: 'clip-2', type: 'video', from: 45, durationInFrames: 45, sourceStartFrame: 45 },
      {
        id: 'mg-1',
        type: 'motion-graphic',
        from: 12,
        durationInFrames: 50,
        content: 'clean',
        metadata: {
          atomicOverlayPlan: { version: 'atomic-overlay-plan-v1' },
          atomicOverlayReceipt: { family: 'motion-graphic' },
          atomicMomentBundle: { semanticAtoms: [{ kind: 'text' }], relations: [] },
        },
      },
      {
        id: 'tr-1',
        type: 'transition',
        from: 44,
        durationInFrames: 12,
        clipAId: 'clip-1',
        clipBId: 'clip-2',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', intent: 'continuity-blend' } },
      },
      {
        id: 'sfx-1',
        type: 'sound',
        from: 44,
        durationInFrames: 12,
        assetId: 'sfx_asset_1',
        metadata: {
          atomicSfxForm: {
            role: 'impact',
            timing: {
              syncFrame: 44,
              anchor: 'transition',
            },
          },
          atomicOverlayReceipt: transitionSfxReceipt(),
        },
      },
    ],
    vjepaAnalysis: {
      segments: [{
        startMs: 0,
        endMs: 3000,
        visualSignificance: 0.7,
        motionIntensity: 0.2,
        actionType: 'talking',
        motionType: 'stable',
        motionVectorX: 0,
        motionVectorY: 0,
        mainSubject: { x: 0.3, y: 0.1, width: 0.4, height: 0.6 },
        textBoxes: [],
        textCoverage: 0,
        negativeSpaceTop: 0.1,
        negativeSpaceRight: 0.2,
        negativeSpaceBottom: 0.1,
        negativeSpaceLeft: 0.2,
        objectCount: 1,
        faceCount: 1,
      }],
    },
    intelligence: {
      unifiedDecisionBundle: {
        source: 'creative-brief+signal-driven',
        authority: {
          version: 'unified-decision-authority-v1',
          executableProducer: 'creative-brief',
          advisoryProducers: ['signal-driven'],
          signalDecisionRole: 'advisor',
          signalDecisionsCanAddExecutable: false,
          decisionMode: 'unified-planner',
        },
        counts: { graphic: 1 },
      },
      postBundleProfileActionPolicy: {
        version: 'post-bundle-profile-action-policy-v1',
        unifiedDecisionBundleExecuted: true,
        evaluatedAt: '2026-06-14T00:00:00.000Z',
        allowedActionCount: 1,
        skippedActionCount: 1,
        allowedTools: ['quality_review'],
        skippedActions: [{
          tool: 'add_motion_graphics',
          action: 'Add legacy motion graphics',
          reason: 'primary_visual_overlays_already_owned_by_unified_bundle',
        }],
      },
    },
  };
}
