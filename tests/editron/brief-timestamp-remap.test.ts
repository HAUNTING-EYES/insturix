import { describe, it, expect } from 'vitest';
import { remapBriefTimestampsToEditedTimeline } from '../../lib/editron/services/edited-timeline-context';

// Original video 0-1200 frames (40s @ 30fps); silence (frames 300-900) removed →
// cut timeline = clip1[cut 0-300 ← src 0-300] + clip2[cut 300-600 ← src 900-1200] (20s total).
const sourceClips = [
  { from: 0, durationInFrames: 300, sourceStartFrame: 0 },
  { from: 300, durationInFrames: 300, sourceStartFrame: 900 },
] as any;
const fps = 30;

describe('remapBriefTimestampsToEditedTimeline', () => {
  it('remaps original-time timestamps onto the cut timeline, drops gap ones, leaves word decisions', () => {
    const decisions: { id: string; targetTimestampMs?: number }[] = [
      { id: 'A', targetTimestampMs: 5000 },   // src frame 150 → kept clip1 → cut 5000ms (in range, unchanged)
      { id: 'B', targetTimestampMs: 31000 },  // src frame 930 → kept clip2 → cut 11000ms (was > 20s cut = "out of range")
      { id: 'C', targetTimestampMs: 20000 },  // src frame 600 → removed silence gap → dropped
      { id: 'D' },                            // word decision (no timestamp) → untouched
    ];
    const out = remapBriefTimestampsToEditedTimeline(decisions, sourceClips, fps);
    // This is the regression: 'B' at 31s used to be rejected as out-of-range; now it lands at 11s on the cut.
    expect(out.map((d) => d.id)).toEqual(['A', 'B', 'D']);
    expect(out.find((d) => d.id === 'A')!.targetTimestampMs).toBe(5000);
    expect(out.find((d) => d.id === 'B')!.targetTimestampMs).toBe(11000);
    expect(out.find((d) => d.id === 'D')!.targetTimestampMs).toBeUndefined();
  });

  it('no-ops without source clips', () => {
    const decisions = [{ id: 'A', targetTimestampMs: 31000 }];
    expect(remapBriefTimestampsToEditedTimeline(decisions, [] as any, fps)).toEqual(decisions);
  });
});
