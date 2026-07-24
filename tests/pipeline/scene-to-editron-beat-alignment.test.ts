import { describe, expect, it } from 'vitest';

import { alignCutsToBeats, ROW } from '../../lib/pipeline/scene-to-editron';

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
});
