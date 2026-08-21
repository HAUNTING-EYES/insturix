import { describe, expect, it } from 'vitest';

import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
import { evaluateKeyframeTrack } from '../../lib/editron/utils/keyframe-math';
import { buildSubjectAwareReframePlan } from '../../lib/editron/services/subject-reframe-plan';

describe('subject-aware reframe plan', () => {
  it('maps normalized subject evidence into focal tracks and contains ungrounded media', () => {
    const project = {
      projectId: 'proj_reframe',
      fps: 30,
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      overlays: [
        video(1, 'asset_grounded', 0, 90),
        video(2, 'asset_missing', 90, 90),
        { ...video(3, 'asset_pip', 0, 90), left: 100, top: 100, width: 640, height: 360 },
      ],
    };
    const analyses = [{
      projectId: project.projectId,
      assetId: 'asset_grounded',
      segmentAnalysis: {
        segments: [
          spatialSegment(0, 1_000, { x: 0.1, y: 0.2, width: 0.2, height: 0.4 }),
          spatialSegment(1_000, 3_000, { x: 0.6, y: 0.3, width: 0.2, height: 0.4 }),
        ],
      },
    }];

    const plan = buildSubjectAwareReframePlan({
      project,
      analyses,
      targetAspectRatio: '9:16',
      sourceRastersByAssetId: { asset_grounded: { width: 1920, height: 1080 } },
    });

    expect(plan.status).toBe('changed');
    expect(plan.projectUpdates).toMatchObject({
      aspectRatio: '9:16',
      playerDimensions: { width: 1080, height: 1920 },
    });
    expect(plan.subjectTrackedOverlayIds).toEqual([1]);
    expect(plan.safeContainedOverlayIds).toEqual([2]);
    expect(plan.skippedOverlayIds).toEqual([3]);

    const grounded = plan.overlayUpdates.find((update) => update.overlayId === 1)!;
    expect(grounded.trackingStatus).toBe('subject-tracked');
    expect(grounded.updates).toMatchObject({
      left: 0,
      top: 0,
      width: 1080,
      height: 1920,
      styles: { objectFit: 'cover', objectPosition: '6.11% 50%' },
    });
    expect(grounded.updates.keyframeTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        property: 'objectPositionX',
        keyframes: expect.arrayContaining([
          expect.objectContaining({ frame: 0, value: 6.11, easing: 'linear' }),
          expect.objectContaining({ frame: 89, value: 79.26, easing: 'linear' }),
        ]),
      }),
      expect.objectContaining({ property: 'objectPositionY' }),
    ]));

    const contained = plan.overlayUpdates.find((update) => update.overlayId === 2)!;
    expect(contained).toMatchObject({
      trackingStatus: 'safe-contained',
      evidenceCount: 0,
      updates: { styles: { objectFit: 'contain', objectPosition: '50% 50%' } },
    });
    expect(plan.warnings.join(' ')).toContain('normalized subject evidence was unavailable');
  });

  it('refuses to reinterpret authored picture-in-picture layouts as full-canvas media', () => {
    const plan = buildSubjectAwareReframePlan({
      project: {
        projectId: 'proj_pip_only',
        fps: 30,
        playerDimensions: { width: 1920, height: 1080 },
        overlays: [{ ...video(7, 'asset_pip', 0, 60), left: 100, top: 80, width: 640, height: 360 }],
      },
      analyses: [],
      targetAspectRatio: '9:16',
    });

    expect(plan.status).toBe('error');
    expect(plan.overlayUpdates).toEqual([]);
    expect(plan.skippedOverlayIds).toEqual([7]);
  });

  it('fails closed when spatial evidence lacks a source raster', () => {
    const plan = buildSubjectAwareReframePlan({
      project: {
        projectId: 'proj_missing_raster', fps: 30,
        playerDimensions: { width: 1920, height: 1080 },
        overlays: [video(8, 'asset_grounded', 0, 90)],
      },
      analyses: [{
        assetId: 'asset_grounded',
        segmentAnalysis: { segments: [spatialSegment(0, 1_000, { x: 0.1, y: 0.2, width: 0.2, height: 0.4 })] },
      }],
      targetAspectRatio: '9:16',
    });

    expect(plan.status).toBe('error');
    expect(plan.message).toContain('Source raster is required');
    expect(plan.overlayUpdates).toEqual([]);
  });

  it('rejects malformed or duplicated authored-layout evidence instead of silently weakening it', () => {
    const project = {
      projectId: 'proj_layout_evidence', fps: 30,
      playerDimensions: { width: 1920, height: 1080 },
      overlays: [
        video(9, 'asset_full_canvas', 0, 90),
        { ...video(10, 'brand-logo', 0, 90), left: 1700, top: 54, width: 120, height: 68 },
      ],
    };
    const malformed = buildSubjectAwareReframePlan({
      project,
      analyses: [],
      targetAspectRatio: '9:16',
      authoredLayoutEvidence: [{ overlayId: 'brand-logo' }],
    });
    const duplicated = buildSubjectAwareReframePlan({
      project,
      analyses: [],
      targetAspectRatio: '9:16',
      authoredLayoutEvidence: [
        { overlayId: 'brand-logo', safeRelation: 'top-right-5-percent' },
        { overlayId: 'brand-logo', safeRelation: 'top-left-5-percent' },
      ],
    });

    expect(malformed).toMatchObject({ status: 'error', message: 'Authored layout evidence is malformed.' });
    expect(duplicated).toMatchObject({ status: 'error', message: 'Authored layout evidence contains duplicate overlay targets.' });
  });

  it('keeps the complete moving subject visible and preserves an explicit logo safe relation', () => {
    const sampleFrames = [0, 120, 240, 360, 449];
    const centers = [0.18, 0.34, 0.52, 0.70, 0.82];
    const project = {
      projectId: 'oe-hold-05', fps: 30, aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      overlays: [
        video(501, 'h05-subject', 0, 450),
        {
          ...video(502, 'logo', 0, 450), type: OverlayType.IMAGE,
          left: 1728, top: 54, width: 96, height: 54,
          metadata: { authoredId: 'ov-logo' },
        },
      ],
    };
    const analyses = [{
      assetId: 'h05-subject',
      segmentAnalysis: {
        segments: sampleFrames.map((frame, index) => spatialSegment(
          Math.max(0, (frame - 1) / 30 * 1_000),
          Math.min(15_000, (frame + 1) / 30 * 1_000),
          { x: centers[index] - 0.075, y: 0.215, width: 0.15, height: 0.615 },
        )),
      },
    }];
    const input = {
      project, analyses, targetAspectRatio: '9:16' as const,
      sourceRastersByAssetId: { 'h05-subject': { width: 640, height: 360 } },
      authoredLayoutEvidence: [{ logoOverlayId: 'ov-logo', safeRelation: 'top-right-5-percent' }],
    };

    const plan = buildSubjectAwareReframePlan(input);
    expect(plan).toEqual(buildSubjectAwareReframePlan(input));
    expect(plan.status).toBe('changed');
    expect(plan.authoredLayoutOverlayIds).toEqual([502]);
    expect(plan.skippedOverlayIds).toEqual([]);
    expect(plan.overlayUpdates.find(({ overlayId }) => overlayId === 502)).toMatchObject({
      trackingStatus: 'authored-layout-preserved',
      updates: { left: 972, top: 96, width: 54, height: 30.38 },
    });

    const xTrack = plan.overlayUpdates.find(({ overlayId }) => overlayId === 501)!
      .updates.keyframeTracks!.find(({ property }) => property === 'objectPositionX')!;
    const renderedWidth = 640 * (640 / 360); const overflow = renderedWidth - 360;
    for (let frame = 0; frame < 450; frame += 1) {
      const center = 0.18 + (0.82 - 0.18) * frame / 449;
      const cropLeft = overflow * evaluateKeyframeTrack(xTrack, frame) / 100;
      expect((center - 0.075) * renderedWidth - cropLeft).toBeGreaterThanOrEqual(-0.01);
      expect((center + 0.075) * renderedWidth - cropLeft).toBeLessThanOrEqual(360.01);
    }
  });
});

function video(id: number, assetId: string, from: number, durationInFrames: number) {
  return {
    id,
    type: OverlayType.VIDEO,
    assetId,
    content: '',
    from,
    durationInFrames,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    row: 2,
    isDragging: false,
    rotation: 0,
    styles: { objectFit: 'cover' },
  };
}

function spatialSegment(
  startMs: number,
  endMs: number,
  mainSubject: { x: number; y: number; width: number; height: number },
) {
  return {
    startMs,
    endMs,
    transcript: { text: '' },
    visual: { mainSubject },
    semanticVisual: null,
    vocal: null,
    weight: { finalWeight: 0.8 },
  };
}
