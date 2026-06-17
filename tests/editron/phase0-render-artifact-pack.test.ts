import { describe, expect, it } from 'vitest';

import { buildPhase0FixtureManifest } from '../../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../../lib/editron/services/phase0-render-artifact-pack';

describe('phase0 render artifact pack', () => {
  it('builds the existing rendered-aesthetic harness input for all audited visual families', () => {
    const project = projectFixture();
    const manifest = buildPhase0FixtureManifest(project, {
      capturedAt: '2026-06-14T00:00:00.000Z',
      artifactDir: '.calibration-temp/phase0-fixtures/proj_pack',
    });

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_pack',
    });

    expect(pack).toMatchObject({
      version: 'editron-phase0-render-artifact-pack-v1',
      projectId: 'proj_pack',
      status: 'ready',
      issues: [],
      paths: {
        renderInput: '.calibration-temp/phase0-fixtures/proj_pack/render-input.json',
        renderedAestheticDir: '.calibration-temp/phase0-fixtures/proj_pack/rendered-aesthetic',
        renderedAestheticJson: '.calibration-temp/phase0-fixtures/proj_pack/rendered-aesthetic/rendered-aesthetic.json',
        renderedAestheticHtml: '.calibration-temp/phase0-fixtures/proj_pack/rendered-aesthetic/report.html',
      },
      renderInput: {
        projectId: 'proj_pack',
        tag: 'proj-pack-phase0',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 180,
      },
      samplePlan: {
        maxSamples: 24,
        droppedSampleCount: 0,
      },
      familyCoverage: {
        auditedVisualCount: 4,
        auditedMotionCount: 1,
        auditedAudioCount: 1,
        auditedOverlayCount: 6,
        counts: {
          'motion-graphic': 1,
          caption: 1,
          transition: 1,
          image: 1,
          zoom: 1,
          sound: 1,
        },
        countsByFamily: {
          caption: 1,
          media: 1,
          'motion-graphic': 1,
          sfx: 1,
          transition: 1,
          zoom: 1,
        },
        presentRequiredFamilies: ['caption', 'motion-graphic', 'sfx', 'transition', 'zoom'],
        missingRequiredFamilies: [],
        incompleteFamilies: [],
        evidenceCompleteness: {
          caption: { count: 1, auditableCount: 1, issues: [], sampleOverlayIds: [] },
          sfx: { count: 1, auditableCount: 1, issues: [], sampleOverlayIds: [] },
          transition: { count: 1, auditableCount: 1, issues: [], sampleOverlayIds: [] },
          zoom: { count: 1, auditableCount: 1, issues: [], sampleOverlayIds: [] },
        },
      },
    });
    expect(pack.familyCoverage.auditedVisualTypes).toContain('transition');
    expect(pack.familyCoverage.auditedMotionTypes).toEqual(['zoom']);
    expect(pack.familyCoverage.auditedAudioTypes).toEqual(['audio', 'sound']);
    expect(pack.renderInput.overlays).toHaveLength(7);
    expect(pack.renderInput.sampleFrames).toEqual(pack.samplePlan.sampledFrames);
    expect(pack.renderInput.samplePlan).toEqual(pack.samplePlan);
    expect(pack.samplePlan.sampledFrames).toEqual([
      28, 38, 48, 63, 64, 77, 82, 90, 92, 93, 94, 96, 98, 108, 127, 142,
    ]);
    expect(pack.samplePlan.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        frame: 64,
        roles: ['hold'],
        sourceOverlayIds: ['caption-1', 'zoom-1'],
        sourceOverlayTypes: ['caption', 'zoom'],
        sourceFamilies: ['caption', 'zoom'],
        evidenceKinds: ['visual', 'motion'],
      }),
      expect.objectContaining({
        frame: 90,
        sourceOverlayIds: ['sound-1', 'transition-1'],
        sourceOverlayTypes: ['sound', 'transition'],
        sourceFamilies: ['sfx', 'transition'],
        evidenceKinds: ['visual', 'audio'],
      }),
      expect.objectContaining({
        frame: 48,
        sourceOverlayIds: ['zoom-1'],
        sourceFamilies: ['zoom'],
        evidenceKinds: ['motion'],
      }),
    ]));
    expect(pack.renderCommand).toContain('scripts/render-editron-aesthetic.ts');
    expect(pack.renderCommand).toContain('render-input.json');
    expect(pack.renderCommand).toContain('--overlay-only');
  });

  it('bounds sample windows deterministically instead of rendering every overlay state', () => {
    const project = projectFixture();
    const manifest = buildPhase0FixtureManifest(project);

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_pack',
      maxSamples: 5,
    });

    expect(pack.samplePlan.maxSamples).toBe(5);
    expect(pack.samplePlan.sampledFrames).toEqual([28, 64, 92, 96, 142]);
    expect(pack.samplePlan.droppedSampleCount).toBe(11);
    expect(pack.samplePlan.samples.every((sample) => sample.frame >= 0 && sample.frame < 180)).toBe(true);
  });

  it('counts video-attached zoom receipts as zoom motion evidence', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_video_zoom',
      fps: 30,
      durationInFrames: 120,
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [
        {
          id: 'clip-zoom',
          type: 'video',
          from: 0,
          durationInFrames: 120,
          sourceStartFrame: 0,
          keyframeTracks: [{
            property: 'scale',
            keyframes: [
              { frame: 30, value: 1, easing: 'ease-in' },
              { frame: 48, value: 1.08, easing: 'ease-out' },
            ],
          }],
          metadata: {
            atomicOverlayReceipts: [{
              family: 'zoom',
              frame: 30,
              durationFrames: 18,
              target: { overlayId: 'clip-zoom', localFrame: 30 },
              payload: { zoomType: 'punch-in', direction: 'push-in' },
            }],
          },
        },
        { id: 'mg-1', type: 'motion-graphic', from: 20, durationInFrames: 30, content: 'hook' },
        {
          id: 'caption-1',
          type: 'caption',
          from: 5,
          durationInFrames: 40,
          captions: [{ text: 'hello world' }],
          metadata: { atomicOverlayReceipt: { family: 'caption' } },
        },
        {
          id: 'transition-1',
          type: 'transition',
          from: 60,
          durationInFrames: 12,
          metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1' } },
        },
        {
          id: 'sound-1',
          type: 'sound',
          from: 60,
          durationInFrames: 12,
          assetId: 'sfx_asset_1',
          metadata: { atomicSfxForm: { role: 'impact' } },
        },
      ],
    };
    const manifest = buildPhase0FixtureManifest(project);

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_video_zoom',
    });

    expect(pack.status).toBe('ready');
    expect(pack.issues).toEqual([]);
    expect(pack.familyCoverage.counts.zoom).toBe(1);
    expect(pack.familyCoverage.countsByFamily.zoom).toBe(1);
    expect(pack.familyCoverage.auditedMotionCount).toBe(1);
    expect(pack.familyCoverage.presentRequiredFamilies).toEqual([
      'caption',
      'motion-graphic',
      'sfx',
      'transition',
      'zoom',
    ]);
    expect(pack.familyCoverage.missingRequiredFamilies).toEqual([]);
    expect(pack.familyCoverage.evidenceCompleteness.zoom).toEqual({
      count: 1,
      auditableCount: 1,
      issues: [],
      sampleOverlayIds: [],
    });
    expect(pack.samplePlan.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        frame: 30,
        roles: ['zoom-anchor'],
        sourceOverlayIds: ['clip-zoom'],
        sourceOverlayTypes: ['video'],
        sourceFamilies: ['zoom'],
        evidenceKinds: ['motion'],
      }),
      expect.objectContaining({
        frame: 39,
        roles: ['zoom-motion'],
        sourceOverlayIds: ['clip-zoom'],
        sourceOverlayTypes: ['video'],
        sourceFamilies: ['zoom'],
        evidenceKinds: ['motion'],
      }),
    ]));
  });

  it('marks packs not-renderable instead of pretending missing visual evidence exists', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_audio_only',
      fps: 30,
      durationInFrames: 90,
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [{
        id: 'sound-1',
        type: 'sound',
        from: 0,
        durationInFrames: 60,
        assetId: 'sfx_asset_1',
        metadata: { atomicSfxForm: { role: 'impact' } },
      }],
    };
    const manifest = buildPhase0FixtureManifest(project);

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_audio_only',
    });

    expect(pack.status).toBe('not-renderable');
    expect(pack.issues).toEqual(['no-audited-visual-overlays']);
    expect(pack.familyCoverage.auditedVisualCount).toBe(0);
    expect(pack.familyCoverage.auditedAudioCount).toBe(1);
    expect(pack.familyCoverage.countsByFamily).toEqual({ sfx: 1 });
    expect(pack.familyCoverage.presentRequiredFamilies).toEqual(['sfx']);
    expect(pack.familyCoverage.missingRequiredFamilies).toEqual([
      'caption',
      'motion-graphic',
      'transition',
      'zoom',
    ]);
  });

  it('does not count non-MG families as auditable when required evidence is missing', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_weak_families',
      fps: 30,
      durationInFrames: 120,
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [
        { id: 'caption-empty', type: 'caption', from: 10, durationInFrames: 60, captions: [] },
        { id: 'transition-weak', type: 'transition', from: 55, durationInFrames: 12 },
        { id: 'zoom-weak', type: 'zoom', from: 30, durationInFrames: 20 },
        { id: 'sound-weak', type: 'sound', from: 55, durationInFrames: 10 },
      ],
    };
    const manifest = buildPhase0FixtureManifest(project);

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_weak_families',
    });

    expect(pack.status).toBe('not-renderable');
    expect(pack.issues).toEqual([
      'incomplete-caption-evidence',
      'incomplete-sfx-evidence',
      'incomplete-transition-evidence',
      'incomplete-zoom-evidence',
    ]);
    expect(pack.familyCoverage.incompleteFamilies).toEqual(['caption', 'sfx', 'transition', 'zoom']);
    expect(pack.familyCoverage.evidenceCompleteness.caption).toMatchObject({
      count: 1,
      auditableCount: 0,
      issues: ['missing-caption-text', 'missing-caption-receipt-or-evidence'],
      sampleOverlayIds: ['caption-empty'],
    });
    expect(pack.familyCoverage.evidenceCompleteness.transition).toMatchObject({
      issues: ['missing-atomic-transition-form'],
      sampleOverlayIds: ['transition-weak'],
    });
    expect(pack.familyCoverage.evidenceCompleteness.zoom).toMatchObject({
      issues: ['missing-atomic-zoom-form'],
      sampleOverlayIds: ['zoom-weak'],
    });
    expect(pack.familyCoverage.evidenceCompleteness.sfx).toMatchObject({
      issues: ['missing-atomic-sfx-form', 'missing-sfx-asset-evidence'],
      sampleOverlayIds: ['sound-weak'],
    });
  });

  it('fails the artifact pack contract when canvas or duration truth is missing', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_invalid_render',
      overlays: [{ id: 'mg-1', type: 'motion-graphic', from: 0, durationInFrames: 0 }],
    };
    const manifest = buildPhase0FixtureManifest(project);

    const pack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: '.calibration-temp/phase0-fixtures/proj_invalid_render',
    });

    expect(pack.status).toBe('not-renderable');
    expect(pack.issues).toEqual(['missing-canvas-dimensions', 'missing-duration']);
  });
});

function projectFixture(): Phase0FixtureProject {
  return {
    projectId: 'proj_pack',
    fps: 30,
    durationInFrames: 180,
    playerDimensions: { width: 1080, height: 1920 },
    overlays: [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 180, sourceStartFrame: 0 },
      { id: 'mg-1', type: 'motion-graphic', from: 30, durationInFrames: 60, content: '40%' },
      {
        id: 'caption-1',
        type: 'caption',
        from: 20,
        durationInFrames: 80,
        content: 'caption',
        metadata: { atomicOverlayReceipt: { family: 'caption' } },
      },
      {
        id: 'transition-1',
        type: 'transition',
        from: 88,
        durationInFrames: 12,
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1' } },
      },
      { id: 'image-1', type: 'image', from: 100, durationInFrames: 50, width: 700, height: 900 },
      {
        id: 'zoom-1',
        type: 'zoom',
        from: 40,
        durationInFrames: 45,
        metadata: { atomicZoomForm: { version: 'atomic-zoom-form-v1' } },
      },
      {
        id: 'sound-1',
        type: 'sound',
        from: 88,
        durationInFrames: 10,
        assetId: 'sfx_asset_1',
        metadata: { atomicSfxForm: { role: 'impact' } },
      },
    ],
  };
}
