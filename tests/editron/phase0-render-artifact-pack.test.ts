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
      },
    });
    expect(pack.familyCoverage.auditedVisualTypes).toContain('transition');
    expect(pack.familyCoverage.auditedMotionTypes).toEqual(['zoom']);
    expect(pack.familyCoverage.auditedAudioTypes).toEqual(['audio', 'sound']);
    expect(pack.renderInput.overlays).toHaveLength(7);
    expect(pack.renderCommand).toContain('scripts/render-editron-aesthetic.ts');
    expect(pack.renderCommand).toContain('render-input.json');
    expect(pack.renderCommand).toContain('--overlay-only');
  });

  it('marks packs not-renderable instead of pretending missing visual evidence exists', () => {
    const project: Phase0FixtureProject = {
      projectId: 'proj_audio_only',
      fps: 30,
      durationInFrames: 90,
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [{ id: 'sound-1', type: 'sound', from: 0, durationInFrames: 60 }],
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
      { id: 'caption-1', type: 'caption', from: 20, durationInFrames: 80, content: 'caption' },
      { id: 'transition-1', type: 'transition', from: 88, durationInFrames: 12 },
      { id: 'image-1', type: 'image', from: 100, durationInFrames: 50, width: 700, height: 900 },
      { id: 'zoom-1', type: 'zoom', from: 40, durationInFrames: 45 },
      { id: 'sound-1', type: 'sound', from: 88, durationInFrames: 10 },
    ],
  };
}
