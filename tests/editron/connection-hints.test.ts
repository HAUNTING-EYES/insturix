import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeStoryline } from '@/lib/editron/storyline/compose';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
function brief(o: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return { output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null, ...o }, brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] } };
}

describe('connection hints - StorylineClip.linkFromPrev', () => {
  it('★ carries the plan\'s rhetorical relation onto the clips (absent on the first)', () => {
    const a = scene({ source: 'a', createdAt: 100 });
    const b = scene({ source: 'b', createdAt: 200 });
    const story = composeStoryline([a, b], brief(), {
      orderingPlan: { order: [{ sourceRef: b.id }, { sourceRef: a.id, linkFromPrev: 'therefore' }] },
    });
    expect(story.clips.map((c) => c.source)).toEqual(['b', 'a']);
    expect(story.clips[0].linkFromPrev).toBeUndefined(); // first clip has no incoming relation
    expect(story.clips[1].linkFromPrev).toBe('therefore');
  });

  it('no plan -> no linkFromPrev (deterministic cut carries no rhetorical relation)', () => {
    const a = scene({ source: 'a', createdAt: 100 });
    const b = scene({ source: 'b', createdAt: 200 });
    const story = composeStoryline([a, b], brief());
    expect(story.clips.every((c) => c.linkFromPrev === undefined)).toBe(true);
  });

  it('an invalid plan falls back and carries no links', () => {
    const s1 = scene({ source: 'pod', startTime: 0, endTime: 3 });
    const s2 = scene({ source: 'pod', startTime: 10, endTime: 13 });
    const story = composeStoryline([s1, s2], brief(), {
      orderingPlan: { order: [{ sourceRef: s2.id, linkFromPrev: 'but' }, { sourceRef: s1.id }] }, // scrambles the source
    });
    expect(story.clips.every((c) => c.linkFromPrev === undefined)).toBe(true);
  });
});
