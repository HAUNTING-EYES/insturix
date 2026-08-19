import { describe, expect, it } from 'vitest';

import {
  cutTimelineRange,
  mapTimelineFrameAfterRangeCutV1,
  mapTimelineRangeAfterRangeCutV1,
} from '@/lib/editron/services/timeline-range-cut';

describe('timeline range cut coordinate mapping', () => {
  it('emits the exact half-open transform and split-child lineage from the real cut', () => {
    const result = cutTimelineRange({
      overlays: [
        sourceVideo(10, 'host'),
        sourceDialogue(11, 'dialogue'),
        {
          id: 12,
          type: 'sound',
          assetId: 'bgm',
          row: 5,
          from: 0,
          durationInFrames: 480,
          startFromSound: 0,
        },
      ],
      startFrame: 151,
      endFrame: 196,
      fps: 30,
      durationInFrames: 480,
    });

    expect(result.timelineCoordinateTransform).toEqual({
      schemaVersion: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1',
      beforeDurationInFrames: 480,
      afterDurationInFrames: 435,
      removedRange: { startFrame: 151, endFrame: 196 },
      shiftAfterRemovedRangeFrames: -45,
      mapRule: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1',
    });
    expect(result.splitChildren).toEqual([
      {
        beforeOverlayId: 10,
        leftOverlayId: 10,
        rightOverlayId: 13,
        overlayType: 'video',
        assetId: 'host',
        leftBeforeTimelineRange: { startFrame: 0, endFrame: 151 },
        leftAfterTimelineRange: { startFrame: 0, endFrame: 151 },
        rightBeforeTimelineRange: { startFrame: 196, endFrame: 480 },
        rightAfterTimelineRange: { startFrame: 151, endFrame: 435 },
        rightTimelineStartFrame: 151,
        rightSourceCoordinateField: 'sourceStartFrame',
        rightSourceStartFrame: 196,
      },
      {
        beforeOverlayId: 11,
        leftOverlayId: 11,
        rightOverlayId: 14,
        overlayType: 'sound',
        assetId: 'dialogue',
        leftBeforeTimelineRange: { startFrame: 0, endFrame: 151 },
        leftAfterTimelineRange: { startFrame: 0, endFrame: 151 },
        rightBeforeTimelineRange: { startFrame: 196, endFrame: 480 },
        rightAfterTimelineRange: { startFrame: 151, endFrame: 435 },
        rightTimelineStartFrame: 151,
        rightSourceCoordinateField: 'startFromSound',
        rightSourceStartFrame: 196,
      },
    ]);
  });

  it('maps only surviving frames and ranges', () => {
    const transform = cutTimelineRange({
      overlays: [],
      startFrame: 151,
      endFrame: 196,
      fps: 30,
      durationInFrames: 480,
    }).timelineCoordinateTransform;

    expect(mapTimelineFrameAfterRangeCutV1(transform, 150)).toBe(150);
    expect(mapTimelineFrameAfterRangeCutV1(transform, 151)).toBeNull();
    expect(mapTimelineFrameAfterRangeCutV1(transform, 195)).toBeNull();
    expect(mapTimelineFrameAfterRangeCutV1(transform, 196)).toBe(151);
    expect(mapTimelineFrameAfterRangeCutV1(transform, 205)).toBe(160);
    expect(mapTimelineFrameAfterRangeCutV1(transform, 479)).toBe(434);
    expect(mapTimelineRangeAfterRangeCutV1(transform, { startFrame: 60, endFrame: 151 })).toEqual({
      startFrame: 60,
      endFrame: 151,
    });
    expect(mapTimelineRangeAfterRangeCutV1(transform, { startFrame: 196, endFrame: 330 })).toEqual({
      startFrame: 151,
      endFrame: 285,
    });
    expect(mapTimelineRangeAfterRangeCutV1(transform, { startFrame: 150, endFrame: 197 })).toBeNull();
  });

  it('fails loudly for invalid coordinates and untraceable split identities', () => {
    const transform = cutTimelineRange({
      overlays: [],
      startFrame: 10,
      endFrame: 20,
      fps: 30,
      durationInFrames: 100,
    }).timelineCoordinateTransform;

    expect(() => mapTimelineFrameAfterRangeCutV1(transform, 1.5)).toThrow(/integer frame/);
    expect(() => mapTimelineFrameAfterRangeCutV1(transform, 100)).toThrow(/outside/);
    expect(() => mapTimelineRangeAfterRangeCutV1(transform, { startFrame: 25, endFrame: 101 })).toThrow(
      /Invalid before-timeline range/,
    );
    expect(() => cutTimelineRange({
      overlays: [{ ...sourceVideo(10, 'host'), id: undefined }],
      startFrame: 10,
      endFrame: 20,
      fps: 30,
      durationInFrames: 480,
    })).toThrow(/before overlay must have a non-negative safe-integer id/);
  });

  it('returns no split lineage when a cut creates no source-bound child', () => {
    const result = cutTimelineRange({
      overlays: [{ id: 1, type: 'shape', row: 1, from: 0, durationInFrames: 100 }],
      startFrame: 20,
      endFrame: 30,
      fps: 30,
      durationInFrames: 100,
    });

    expect(result.splitChildren).toEqual([]);
    expect(result.overlays).toHaveLength(1);
    expect(result.overlays[0]).toMatchObject({ id: 1, from: 0, durationInFrames: 90 });
  });
});

function sourceVideo(id: number, assetId: string) {
  return {
    id,
    type: 'video',
    assetId,
    row: 0,
    from: 0,
    durationInFrames: 480,
    sourceStartFrame: 0,
    videoStartTime: 0,
  };
}

function sourceDialogue(id: number, assetId: string) {
  return {
    id,
    type: 'sound',
    assetId,
    row: 4,
    from: 0,
    durationInFrames: 480,
    startFromSound: 0,
    metadata: { role: 'dialogue' },
  };
}
