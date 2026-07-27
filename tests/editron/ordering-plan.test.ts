import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeStoryline } from '@/lib/editron/storyline/compose';
import {
  type OrderingPlan,
  validateOrderingPlan,
} from '@/lib/editron/storyline/ordering-plan';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a.mp4', startTime: 0, endTime: 2,
    objects: [], faces: [], detectedText: [], transcription: '',
    ...over,
  });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return {
    output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null, ...output },
    brand: null,
    entryPoint: 'upload',
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}
function plan(refs: string[], over: Partial<OrderingPlan> = {}): OrderingPlan {
  return {
    order: refs.map((sourceRef, i) => ({ sourceRef, linkFromPrev: i === 0 ? undefined : 'therefore' })),
    ...over,
  };
}

describe('validateOrderingPlan - hard contracts', () => {
  it('accepts a well-formed plan (known refs, source order kept, hook-first, in budget)', () => {
    const a = scene({ source: 'x', startTime: 0, endTime: 2 });
    const b = scene({ source: 'y', startTime: 0, endTime: 2 });
    const v = validateOrderingPlan(plan([b.id, a.id], { hookRef: b.id }), [a, b], { targetDurationSec: 10 });
    expect(v.valid).toBe(true);
    expect(v.issues).toHaveLength(0);
  });

  it('rejects an unknown ref', () => {
    const a = scene({ source: 'x' });
    const v = validateOrderingPlan(plan([a.id, 'ghost']), [a]);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'unknown_ref')).toBe(true);
  });

  it('rejects a duplicate ref', () => {
    const a = scene({ source: 'x' });
    const v = validateOrderingPlan(plan([a.id, a.id]), [a]);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'duplicate_ref')).toBe(true);
  });

  it('★ rejects scrambling a single source against its own chronology (coherence contract)', () => {
    const early = scene({ source: 'pod', startTime: 0, endTime: 2 });
    const late = scene({ source: 'pod', startTime: 10, endTime: 12 });
    // plan puts the later clip before the earlier one -> splits the recording
    const v = validateOrderingPlan(plan([late.id, early.id]), [early, late]);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'source_order_violation')).toBe(true);
  });

  it('allows interleaving DIFFERENT sources freely (only intra-source order is fixed)', () => {
    const a = scene({ source: 'a', startTime: 10, endTime: 12 });
    const b = scene({ source: 'b', startTime: 0, endTime: 2 });
    const v = validateOrderingPlan(plan([a.id, b.id]), [a, b]);
    expect(v.valid).toBe(true);
  });

  it('rejects a hookRef that is not the first clip', () => {
    const a = scene({ source: 'x' });
    const b = scene({ source: 'y' });
    const v = validateOrderingPlan(plan([a.id, b.id], { hookRef: b.id }), [a, b]);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'hook_not_first')).toBe(true);
  });

  it('rejects an over-budget ordering', () => {
    const a = scene({ source: 'x', startTime: 0, endTime: 8 });
    const b = scene({ source: 'y', startTime: 0, endTime: 8 });
    const v = validateOrderingPlan(plan([a.id, b.id]), [a, b], { targetDurationSec: 5 });
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'over_budget')).toBe(true);
  });
});

describe('validateOrderingPlan - warnings (advisory, still valid)', () => {
  it('★ flags weak "and-then" links but stays valid (and-but-therefore rule)', () => {
    const a = scene({ source: 'x' });
    const b = scene({ source: 'y' });
    const p: OrderingPlan = { order: [{ sourceRef: a.id }, { sourceRef: b.id, linkFromPrev: 'and-then' }] };
    const v = validateOrderingPlan(p, [a, b]);
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.code === 'weak_link')).toBe(true);
  });

  it('flags a missing rhetorical link', () => {
    const a = scene({ source: 'x' });
    const b = scene({ source: 'y' });
    const p: OrderingPlan = { order: [{ sourceRef: a.id }, { sourceRef: b.id }] };
    expect(validateOrderingPlan(p, [a, b]).warnings.some((w) => w.code === 'missing_link')).toBe(true);
  });

  it('flags dropped picked scenes but stays valid', () => {
    const a = scene({ source: 'x' });
    const b = scene({ source: 'y' });
    const v = validateOrderingPlan(plan([a.id]), [a, b]);
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.code === 'dropped_scenes')).toBe(true);
  });
});

describe('composeStoryline - applies a valid ordering plan, falls back on an invalid one', () => {
  it('a valid plan overrides the deterministic order', () => {
    const a = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 100 });
    const b = scene({ source: 'b', startTime: 0, endTime: 3, createdAt: 200 });
    // deterministic faithful order would be a (createdAt 100) then b; the plan flips it.
    const story = composeStoryline([a, b], brief(), {
      orderingPlan: plan([b.id, a.id], { hookRef: b.id }),
    });
    expect(story.clips.map((c) => c.source)).toEqual(['b', 'a']);
    expect(story.clips[0].order).toBe(0);
  });

  it('★ an invalid plan (scrambled source) falls back to deterministic order, never crashes', () => {
    const early = scene({ source: 'pod', startTime: 0, endTime: 3, createdAt: 100 });
    const late = scene({ source: 'pod', startTime: 10, endTime: 13, createdAt: 100 });
    const story = composeStoryline([early, late], brief(), {
      orderingPlan: plan([late.id, early.id]), // violates source order -> rejected
    });
    // deterministic keeps the single source in chronological order
    expect(story.clips.map((c) => c.in)).toEqual([0, 10]);
  });

  it('a plan that omits a picked scene appends it (ordering is not cutting)', () => {
    const a = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 100 });
    const b = scene({ source: 'b', startTime: 0, endTime: 3, createdAt: 200 });
    const story = composeStoryline([a, b], brief(), { orderingPlan: plan([b.id]) });
    expect(story.clips.map((c) => c.source)).toEqual(['b', 'a']); // b placed, a appended
  });
});
