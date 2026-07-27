import { describe, expect, it } from 'vitest';

import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
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
      styles: { objectFit: 'cover', objectPosition: '20% 40%' },
    });
    expect(grounded.updates.keyframeTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        property: 'objectPositionX',
        keyframes: expect.arrayContaining([
          expect.objectContaining({ frame: 0, value: 20 }),
          expect.objectContaining({ frame: 89, value: 70 }),
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
