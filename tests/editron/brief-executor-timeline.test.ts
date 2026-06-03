import { describe, it, expect } from 'vitest';
import {
  mapOriginalFrameToCutTimeline,
  mapCutFrameToOriginalFrame,
} from '../../lib/editron/services/brief-executor';

// Timeline-coordinate fix (2026-06-03): MG decision frames are on the CUT timeline; V-JEPA /
// Wav2Vec segments are on the ORIGINAL timeline. signalsAtFrame must map cut→original before the
// lookup, or later decisions land in removed-silence gaps and starve (the 6/13 missing-signal bug).
describe('cut <-> original frame mapping', () => {
  // Two kept clips with a removed silence gap (original 200..500) between them:
  //   original [100,200) -> cut [0,100)
  //   original [500,600) -> cut [100,200)
  const clips = [
    { from: 0, durationInFrames: 100, sourceStartFrame: 100 },
    { from: 100, durationInFrames: 100, sourceStartFrame: 500 },
  ];
  const fps = 30;

  it('maps a cut frame back to the correct original frame', () => {
    expect(mapCutFrameToOriginalFrame(0, clips)).toBe(100);
    expect(mapCutFrameToOriginalFrame(50, clips)).toBe(150);
    expect(mapCutFrameToOriginalFrame(100, clips)).toBe(500); // crosses the removed gap
    expect(mapCutFrameToOriginalFrame(150, clips)).toBe(550);
    expect(mapCutFrameToOriginalFrame(199, clips)).toBe(599);
  });

  it('round-trips: original -> cut -> original is identity inside clips', () => {
    for (const orig of [100, 150, 199, 500, 550, 599]) {
      const cut = mapOriginalFrameToCutTimeline(orig, clips, fps);
      expect(cut, `original ${orig} should map into the cut timeline`).not.toBeNull();
      expect(mapCutFrameToOriginalFrame(cut!.frame, clips)).toBe(orig);
    }
  });

  it('returns null for a cut frame beyond all clips', () => {
    expect(mapCutFrameToOriginalFrame(999, clips)).toBeNull();
  });

  it('demonstrates the bug it fixes: the raw cut frame != the true original time', () => {
    // Cut frame 150 is really original 550 (~13.3s later at 30fps). Querying segments with the raw
    // 150 — as the old code did — lands in the removed gap and misses. The map corrects it.
    const mapped = mapCutFrameToOriginalFrame(150, clips);
    expect(mapped).toBe(550);
    expect(mapped).not.toBe(150);
  });
});
