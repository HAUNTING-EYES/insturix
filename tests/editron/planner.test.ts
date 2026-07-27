import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeStoryline } from '@/lib/editron/storyline/compose';
import type { FeasibilityReport } from '@/lib/editron/storyline/feasibility';
import { buildEditPlan, decisionsFromStoryline } from '@/lib/editron/storyline/planner';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: 'talk', ...over });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return { output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null, ...output }, brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] } };
}

describe('decisionsFromStoryline', () => {
  it('RETAIN for a clip kept whole', () => {
    const s = scene({ source: 'a', startTime: 0, endTime: 3 });
    const d = decisionsFromStoryline(composeStoryline([s], brief()), [s]);
    expect(d[0].action).toBe('retain');
  });

  it('TRIM when the source is cut to the budget', () => {
    const big = scene({ source: 'a', startTime: 0, endTime: 60 });
    const story = composeStoryline([big], brief({ targetDurationSec: 10 }));
    expect(story.clips[0].out).toBe(10);
    expect(decisionsFromStoryline(story, [big]).some((d) => d.action === 'trim')).toBe(true);
  });

  it('★ REORDER note when the timeline departs from capture order', () => {
    const a = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 100 });
    const b = scene({ source: 'b', startTime: 0, endTime: 3, createdAt: 200 });
    const story = composeStoryline([a, b], brief(), { orderingPlan: { order: [{ sourceRef: b.id }, { sourceRef: a.id }] } });
    expect(story.clips.map((c) => c.source)).toEqual(['b', 'a']); // out of createdAt order
    expect(decisionsFromStoryline(story, [a, b]).some((d) => d.action === 'reorder')).toBe(true);
  });

  it('no reorder note for a chronological cut', () => {
    const a = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 100 });
    const b = scene({ source: 'b', startTime: 0, endTime: 3, createdAt: 200 });
    const story = composeStoryline([a, b], brief()); // faithful -> a, b in order
    expect(decisionsFromStoryline(story, [a, b]).some((d) => d.action === 'reorder')).toBe(false);
  });
});

describe('buildEditPlan', () => {
  it('composes, explains as decisions, and folds coverage gaps into request-coverage', () => {
    const s = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 100 });
    const feasibility: FeasibilityReport = {
      status: 'gaps',
      assessments: [],
      coverageGaps: [{ request: { id: 'r1', text: 'the unboxing' }, verdict: 'missing', coverage: { verdict: 'missing', candidates: [], statement: '' } }],
      statement: 'one moment to film',
    };
    const plan = buildEditPlan([s], brief(), { feasibility });
    expect(plan.storyline.clips).toHaveLength(1);
    expect(plan.decisions.some((d) => d.action === 'retain')).toBe(true);
    expect(plan.decisions.some((d) => d.action === 'request-coverage' && d.ref === 'r1')).toBe(true);
    expect(plan.statement).toMatch(/clip/i);
    expect(plan.statement).toMatch(/film/i);
  });

  it('without a feasibility report, no request-coverage decisions', () => {
    const s = scene({ source: 'a' });
    const plan = buildEditPlan([s], brief());
    expect(plan.decisions.some((d) => d.action === 'request-coverage')).toBe(false);
    expect(plan.feasibility).toBeUndefined();
  });
});
