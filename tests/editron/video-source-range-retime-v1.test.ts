import { describe, expect, it } from 'vitest';

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { retimeIsolatedVideoSourceRangeV1 } from '@/lib/editron/services/video-source-range-retime-v1';

describe('retimeIsolatedVideoSourceRangeV1', () => {
  it('preserves the full source range, shortens the target and ripples later content', () => {
    const overlays = [
      video({ id: 1, from: 0, durationInFrames: 120, sourceStartFrame: 0, sourceEndFrame: 120 }),
      video({ id: 2, from: 120, durationInFrames: 120, sourceStartFrame: 120, sourceEndFrame: 240 }),
    ];

    const result = retimeIsolatedVideoSourceRangeV1({
      overlays,
      projectDurationInFrames: 240,
      overlayId: 1,
      verifiedSourceStartFrame: 0,
      verifiedSourceEndFrameExclusive: 120,
      playbackRate: 2,
    });

    expect(result).toMatchObject({
      disposition: 'APPLIED',
      overlays: [
        {
          id: 1, from: 0, durationInFrames: 60,
          sourceStartFrame: 0, sourceEndFrame: 120,
          speedCurve: [{ frame: 0, value: 2 }, { frame: 59, value: 2 }],
        },
        {
          id: 2, from: 60, durationInFrames: 120,
          sourceStartFrame: 120, sourceEndFrame: 240,
        },
      ],
      effect: {
        beforeTimelineRange: { startFrame: 0, endFrame: 120 },
        afterTimelineRange: { startFrame: 0, endFrame: 60 },
        shiftedBeforeRange: { startFrame: 120, endFrame: 240 },
        shiftedAfterRange: { startFrame: 60, endFrame: 180 },
        beforeProjectDurationInFrames: 240,
        afterProjectDurationInFrames: 180,
        deltaFrames: -60,
        affectedOverlayIds: [1, 2],
      },
    });
    expect(overlays[0]).not.toHaveProperty('speedCurve');
    expect(overlays[1]?.from).toBe(120);
  });

  it.each([
    { name: 'overlapping caption', extras: [caption()], reason: 'OVERLAPPING_DEPENDENT_OVERLAY' },
    { name: 'existing retime', extras: [], reason: 'EXISTING_RETIME_STATE', targetOverrides: { speed: 1.5 } },
    {
      name: 'existing local keyframes', extras: [], reason: 'EXISTING_LOCAL_KEYFRAMES',
      targetOverrides: {
        keyframeTracks: [{ property: 'x', keyframes: [{ frame: 0, value: 0, easing: 'linear' }] }],
      },
    },
    { name: 'non-integral duration', extras: [], reason: 'NON_INTEGRAL_OUTPUT_DURATION', playbackRate: 1.7 },
  ] as Array<{
    name: string;
    extras: Overlay[];
    reason: string;
    targetOverrides?: Record<string, unknown>;
    playbackRate?: number;
  }>)('safe-stops for $name', ({ extras, reason, targetOverrides = {}, playbackRate = 2 }) => {
    const result = retimeIsolatedVideoSourceRangeV1({
      overlays: [
        video({ id: 1, from: 0, durationInFrames: 120, sourceStartFrame: 0, sourceEndFrame: 120, ...targetOverrides }),
        ...extras,
      ] as Overlay[],
      projectDurationInFrames: 240,
      overlayId: 1,
      verifiedSourceStartFrame: 0,
      verifiedSourceEndFrameExclusive: 120,
      playbackRate,
    });
    expect(result).toEqual({ disposition: 'SAFE_STOP', reason });
  });

  it('safe-stops when the verified source range disagrees with stored coordinates', () => {
    expect(retimeIsolatedVideoSourceRangeV1({
      overlays: [video({ id: 1, from: 0, durationInFrames: 120, sourceStartFrame: 5, sourceEndFrame: 125 })],
      projectDurationInFrames: 120,
      overlayId: 1,
      verifiedSourceStartFrame: 0,
      verifiedSourceEndFrameExclusive: 120,
      playbackRate: 2,
    })).toEqual({ disposition: 'SAFE_STOP', reason: 'SOURCE_RANGE_MISMATCH' });
  });
});

function video(overrides: Record<string, unknown>): Overlay {
  return {
    id: 1, type: OverlayType.VIDEO, content: '', assetId: 'asset-1',
    from: 0, durationInFrames: 120, row: 0, left: 0, top: 0,
    width: 1920, height: 1080, rotation: 0, isDragging: false,
    styles: {}, ...overrides,
  } as Overlay;
}

function caption(): Overlay {
  return {
    id: 3, type: OverlayType.CAPTION, captions: [],
    from: 80, durationInFrames: 20, row: 2, left: 0, top: 0,
    width: 100, height: 50, rotation: 0, isDragging: false,
    styles: {},
  } as unknown as Overlay;
}
