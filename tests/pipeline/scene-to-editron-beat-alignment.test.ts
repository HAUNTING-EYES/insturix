import { describe, expect, it } from 'vitest';

import {
  alignCutsToBeats,
  alignCutsToBeatsWithEvidence,
  ROW,
} from '../../lib/pipeline/scene-to-editron';

describe('alignCutsToBeats', () => {
  it('aligns contiguous video/image cuts on the primary visual track', () => {
    const overlays = [
      { id: 1, type: 'video', row: ROW.VIDEO, from: 0, durationInFrames: 60 },
      { id: 2, type: 'image', row: ROW.VIDEO, from: 60, durationInFrames: 60 },
      { id: 3, type: 'image', row: ROW.MOTION_GRAPHICS, from: 60, durationInFrames: 30 },
    ];

    const snapped = alignCutsToBeats(
      overlays,
      [{ frame: 64, isDownbeat: true }],
      30,
    );

    expect(snapped).toBe(1);
    expect(overlays[0]).toMatchObject({ from: 0, durationInFrames: 64 });
    expect(overlays[1]).toMatchObject({ from: 64, durationInFrames: 56 });
    expect(overlays[2]).toMatchObject({ from: 60, durationInFrames: 30 });
  });

  it('refuses a snap that would violate the one-second minimum on either side', () => {
    const overlays = [
      { id: 1, type: 'video', row: ROW.VIDEO, from: 0, durationInFrames: 30 },
      { id: 2, type: 'video', row: ROW.VIDEO, from: 30, durationInFrames: 60 },
    ];

    const snapped = alignCutsToBeats(
      overlays,
      [{ frame: 20, isDownbeat: false }],
      30,
    );

    expect(snapped).toBe(0);
    expect(overlays).toMatchObject([
      { from: 0, durationInFrames: 30 },
      { from: 30, durationInFrames: 60 },
    ]);
  });

  it('retains compatibility with legacy montage markers that lack a row', () => {
    const overlays = [
      {
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 45,
        metadata: { isMontageSub: true },
      },
      {
        id: 2,
        type: 'video',
        from: 45,
        durationInFrames: 45,
        metadata: { isMontageSub: true },
      },
    ];

    expect(alignCutsToBeats(
      overlays,
      [{ frame: 48, isDownbeat: true }],
      30,
    )).toBe(1);
    expect(overlays).toMatchObject([
      { from: 0, durationInFrames: 48 },
      { from: 48, durationInFrames: 42 },
    ]);
  });

  it('aligns the inferred editor track while preserving source time and linked transitions', () => {
    const overlays = [
      {
        id: 10,
        type: 'video',
        row: 0,
        assetId: 'asset-a',
        from: 0,
        durationInFrames: 60,
        sourceStartFrame: 0,
        videoStartTime: 0,
      },
      {
        id: 11,
        type: 'video',
        row: 0,
        assetId: 'asset-b',
        from: 60,
        durationInFrames: 60,
        sourceStartFrame: 12,
        videoStartTime: 12,
      },
      {
        id: 12,
        type: 'transition',
        clipAId: 10,
        clipBId: 11,
        from: 59,
        durationInFrames: 2,
        metadata: { boundaryFrame: 60 },
      },
    ];

    const result = alignCutsToBeatsWithEvidence(
      overlays,
      [{ frame: 63, isDownbeat: true }],
      30,
      {
        maxSnapFrames: 3,
        minClipFrames: 1,
        requireSourceHandles: true,
        sourceDurationFramesByAssetId: { 'asset-a': 120, 'asset-b': 120 },
      },
    );

    expect(result).toMatchObject({
      snappedCount: 1,
      trackOverlayIds: [10, 11],
      changes: [{
        clipAId: 10,
        clipBId: 11,
        originalFrame: 60,
        alignedFrame: 63,
        shiftFrames: 3,
        transitionOverlayIds: [12],
      }],
    });
    expect(overlays[0]).toMatchObject({ durationInFrames: 63 });
    expect(overlays[1]).toMatchObject({
      from: 63,
      durationInFrames: 57,
      sourceStartFrame: 15,
      videoStartTime: 15,
    });
    expect(overlays[2]).toMatchObject({ from: 62, metadata: { boundaryFrame: 63 } });
  });

  it('does not displace a semantic speech boundary to satisfy a nearby beat', () => {
    const overlays = [
      { id: 20, type: 'image', row: 0, from: 0, durationInFrames: 60 },
      { id: 21, type: 'image', row: 0, from: 60, durationInFrames: 60 },
    ];

    const result = alignCutsToBeatsWithEvidence(
      overlays,
      [{ frame: 62, isDownbeat: true }],
      30,
      {
        maxSnapFrames: 3,
        minClipFrames: 1,
        protectedBoundaryFrames: [60],
      },
    );

    expect(result.snappedCount).toBe(0);
    expect(result.rejections).toEqual([expect.objectContaining({
      boundaryFrame: 60,
      beatFrame: 62,
      reason: 'speech-boundary-priority',
    })]);
    expect(overlays).toMatchObject([
      { from: 0, durationInFrames: 60 },
      { from: 60, durationInFrames: 60 },
    ]);
  });

  it('refuses to extend video past the proven source duration', () => {
    const overlays = [
      {
        id: 30,
        type: 'video',
        row: 0,
        assetId: 'asset-short',
        from: 0,
        durationInFrames: 60,
        videoStartTime: 0,
      },
      {
        id: 31,
        type: 'image',
        row: 0,
        from: 60,
        durationInFrames: 60,
      },
    ];

    const result = alignCutsToBeatsWithEvidence(
      overlays,
      [{ frame: 63, isDownbeat: true }],
      30,
      {
        maxSnapFrames: 3,
        minClipFrames: 1,
        requireSourceHandles: true,
        sourceDurationFramesByAssetId: { 'asset-short': 60 },
      },
    );

    expect(result.snappedCount).toBe(0);
    expect(result.rejections).toEqual([expect.objectContaining({
      reason: 'insufficient-source-handle',
    })]);
  });
});
