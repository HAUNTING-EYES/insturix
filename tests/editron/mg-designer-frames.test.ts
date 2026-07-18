import { describe, expect, it, vi } from 'vitest';

// visual-evidence imports the Lambda still renderer + sharp at module load; the frame-index math needs neither,
// so stub both to keep this a fast pure-function test.
vi.mock('@remotion/lambda/client', () => ({ renderStillOnLambda: vi.fn() }));
vi.mock('sharp', () => ({ default: vi.fn() }));

import { selectDesignerFrameIndices } from '@/lib/editron/motion-graphics/codegen/visual-evidence';

describe('selectDesignerFrameIndices — video-level designer frame sampling (Phase D)', () => {
  it('spreads N frames evenly across the duration, inside the head/tail', () => {
    expect(selectDesignerFrameIndices(1000, 4)).toEqual([200, 400, 600, 800]);
    expect(selectDesignerFrameIndices(900, 2)).toEqual([300, 600]);
  });

  it('never returns frame 0 or the last frame (avoids black/transition stills)', () => {
    const idx = selectDesignerFrameIndices(500, 6);
    expect(idx[0]).toBeGreaterThan(0);
    expect(idx[idx.length - 1]).toBeLessThan(500);
  });

  it('clamps the count to 8 and dedupes on a tiny duration; returns [] under 2 frames', () => {
    expect(selectDesignerFrameIndices(1, 4)).toEqual([]);
    expect(selectDesignerFrameIndices(0, 4)).toEqual([]);
    expect(selectDesignerFrameIndices(3000, 100).length).toBeLessThanOrEqual(8);
    expect(new Set(selectDesignerFrameIndices(6, 8)).size).toBe(selectDesignerFrameIndices(6, 8).length); // deduped
  });
});
