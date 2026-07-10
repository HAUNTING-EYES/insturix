import { describe, expect, it } from 'vitest';

import { buildStorylineSeamTransitionEdl } from '@/lib/editron/services/storyline-seam-transitions';

describe('buildStorylineSeamTransitionEdl', () => {
  it('turns Storyline rhetorical links into transition boundary evidence', () => {
    const edl = buildStorylineSeamTransitionEdl('proj_story', [
      {
        id: 'clip-a',
        type: 'video',
        from: 0,
        durationInFrames: 90,
        storyline: { source: 'storyline', sourceRef: 'scene-a', order: 0, role: 'hook' },
      },
      {
        id: 'clip-b',
        type: 'image',
        from: 90,
        durationInFrames: 120,
        storyline: { source: 'storyline', sourceRef: 'scene-b', order: 1, role: 'b-roll', linkFromPrev: 'but' },
      },
    ], 30);

    expect(edl).not.toBeNull();
    expect(edl?.totalDecisions).toBe(1);
    expect(edl?.decisions[0]).toEqual(expect.objectContaining({
      type: 'transition',
      frame: 90,
      source: 'storyline-seam',
      signal: 'storyline.but',
      confidence: 0.76,
    }));
    expect(edl?.decisions[0].params).toEqual(expect.objectContaining({
      boundaryAtom: 'storyline-seam',
      boundaryFrame: 90,
      clipAId: 'clip-a',
      clipBId: 'clip-b',
      relation: 'but',
      transitionJob: 'reset-attention',
      transitionIntent: 'impact-transfer',
      semanticContrast: 0.9,
    }));
    expect(edl?.decisions[0].params.signals).toEqual(expect.objectContaining({
      storyline_relation: 'but',
      topic_shift: 0.78,
    }));
  });

  it('does not invent seams for invalid links or non-adjacent clips', () => {
    expect(buildStorylineSeamTransitionEdl('proj_story', [
      { id: 'a', type: 'video', from: 0, durationInFrames: 90, storyline: { order: 0 } },
      { id: 'b', type: 'video', from: 95, durationInFrames: 90, storyline: { order: 1, linkFromPrev: 'therefore' } },
      { id: 'c', type: 'video', from: 185, durationInFrames: 90, storyline: { order: 2, linkFromPrev: 'nonsense' } },
    ], 30)).toBeNull();
  });
});
