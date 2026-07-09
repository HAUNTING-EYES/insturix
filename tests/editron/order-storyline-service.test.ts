import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { AnalysisReadDb, ProjectAssetAnalysisDoc } from '@/lib/editron/storyline/asset-analysis-reader';
import {
  orderStorylineForProject,
  orderStorylineWithLLM,
} from '@/lib/editron/storyline/order-storyline-service';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a.mp4', startTime: 0, endTime: 3,
    objects: [], faces: [], detectedText: [], transcription: 'talk',
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

describe('orderStorylineWithLLM - applies a valid plan, falls back on any failure', () => {
  const a = scene({ source: 'a', createdAt: 100 });
  const b = scene({ source: 'b', createdAt: 200 });
  // picked (null target) preserves input order -> c0 = a, c1 = b.

  it('applies a valid LLM plan (overrides the deterministic order)', async () => {
    const llm = async () => JSON.stringify({ hookRef: 'c1', order: [{ ref: 'c1', linkFromPrev: null }, { ref: 'c0', linkFromPrev: 'therefore' }], rationale: 'hook then context' });
    const r = await orderStorylineWithLLM([a, b], brief(), llm);
    expect(r.planApplied).toBe(true);
    expect(r.storyline.clips.map((c) => c.source)).toEqual(['b', 'a']); // deterministic would be a,b
    expect(r.rationale).toBe('hook then context');
  });

  it('falls back to deterministic when the LLM throws', async () => {
    const r = await orderStorylineWithLLM([a, b], brief(), async () => { throw new Error('boom'); });
    expect(r.planApplied).toBe(false);
    expect(r.fallbackReason).toBe('llm_error');
    expect(r.storyline.clips.map((c) => c.source)).toEqual(['a', 'b']); // chronological
  });

  it('falls back on malformed JSON (parse_error)', async () => {
    const r = await orderStorylineWithLLM([a, b], brief(), async () => 'not json {');
    expect(r.planApplied).toBe(false);
    expect(r.fallbackReason).toBe('parse_error');
  });

  it('★ falls back when the plan breaks the coherence contract (invalid_plan)', async () => {
    const s1 = scene({ source: 'pod', startTime: 0, endTime: 3 });
    const s2 = scene({ source: 'pod', startTime: 10, endTime: 13 });
    // c0 = s1 (start 0), c1 = s2 (start 10); reversing scrambles the single source.
    const llm = async () => JSON.stringify({ order: [{ ref: 'c1' }, { ref: 'c0' }] });
    const r = await orderStorylineWithLLM([s1, s2], brief(), llm);
    expect(r.planApplied).toBe(false);
    expect(r.fallbackReason).toBe('invalid_plan');
    expect(r.validation?.valid).toBe(false);
    expect(r.storyline.clips.map((c) => c.in)).toEqual([0, 10]); // deterministic keeps source order
  });

  it('skips the LLM entirely for fewer than two clips (too_few_clips)', async () => {
    let called = false;
    const r = await orderStorylineWithLLM([a], brief(), async () => { called = true; return '{}'; });
    expect(called).toBe(false);
    expect(r.fallbackReason).toBe('too_few_clips');
    expect(r.storyline.clips).toHaveLength(1);
  });
});

// ─── project entry: read analyses (mock db) -> scenes -> order ───

function analysisDoc(assetId: string, startMs: number, endMs: number): ProjectAssetAnalysisDoc {
  return {
    projectId: 'p1',
    assetId,
    segmentAnalysis: { segments: [{ startMs, endMs, transcript: { text: 'talk', wordCount: 1 } }] },
  } as ProjectAssetAnalysisDoc;
}

function mockDb(docs: ProjectAssetAnalysisDoc[]): AnalysisReadDb {
  return {
    collection() {
      return {
        findOne: async () => null,
        find: (f: Record<string, unknown>) => ({ toArray: async () => docs.filter((d) => d.projectId === f.projectId) }),
      };
    },
  };
}

describe('orderStorylineForProject - reads analyses then orders', () => {
  it('reads composable analyses, builds scenes, and applies a valid plan', async () => {
    const db = mockDb([analysisDoc('assetA', 0, 3000), analysisDoc('assetB', 0, 4000)]);
    // scenes come out in doc order -> c0 = assetA, c1 = assetB.
    const llm = async () => JSON.stringify({ order: [{ ref: 'c1', linkFromPrev: null }, { ref: 'c0', linkFromPrev: 'but' }] });
    const r = await orderStorylineForProject('p1', brief(), { db, llm });
    expect(r.planApplied).toBe(true);
    expect(r.storyline.clips.map((c) => c.source)).toEqual(['assetB', 'assetA']);
  });

  it('a project with no composable assets yields an empty (valid) storyline, no LLM call', async () => {
    let called = false;
    const r = await orderStorylineForProject('p1', brief(), { db: mockDb([]), llm: async () => { called = true; return '{}'; } });
    expect(called).toBe(false);
    expect(r.storyline.clips).toHaveLength(0);
    expect(r.fallbackReason).toBe('too_few_clips');
  });
});
