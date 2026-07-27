import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { AnalysisReadDb, ProjectAssetAnalysisDoc } from '@/lib/editron/storyline/asset-analysis-reader';
import {
  orderStorylineForProject,
  orderStorylineWithLLM,
} from '@/lib/editron/storyline/order-storyline-service';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import type { NarrativeSignalSource } from '@/lib/editron/storyline/signal-enricher';

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

// ─── B1: scenes are enriched so the ordering LLM sees narrative signals ───

describe('orderStorylineWithLLM - narrative enrichment reaches the LLM prompt', () => {
  const okPlan = async () =>
    JSON.stringify({ order: [{ ref: 'c0', linkFromPrev: null }, { ref: 'c1', linkFromPrev: 'therefore' }] });

  it('★ phase + position are live with ZERO dependencies (computed from the scenes themselves)', async () => {
    let captured = '';
    const capture: typeof okPlan = async () => okPlan();
    const llm = async (prompt: string) => { captured = prompt; return capture(); };
    // one source, an energy arc: s0 early/low -> opening, s1 late/peak -> closing.
    const s0 = scene({ source: 'v.mp4', startTime: 0, endTime: 3, importance: 0.2 });
    const s1 = scene({ source: 'v.mp4', startTime: 20, endTime: 23, importance: 0.9 });
    const r = await orderStorylineWithLLM([s0, s1], brief(), llm);
    expect(r.planApplied).toBe(true);
    expect(captured).toContain('phase:opening');
    expect(captured).toContain('phase:closing');
  });

  it('narrativeSources light up the full event tags (cta, entities) in the prompt', async () => {
    let captured = '';
    const llm = async (prompt: string) => { captured = prompt; return okPlan(); };
    const s0 = scene({ source: 'v', startTime: 0, endTime: 5 });
    const s1 = scene({ source: 'v', startTime: 5, endTime: 10 });
    const sources: ReadonlyMap<string, NarrativeSignalSource> = new Map([
      ['v', { events: [
        { timestampMs: 2000, kind: 'cta' },
        { timestampMs: 3000, kind: 'name', context: 'Acme' },
      ], durationMs: 10_000 }],
    ]);
    await orderStorylineWithLLM([s0, s1], brief(), llm, { narrativeSources: sources });
    expect(captured).toContain('cta');
    expect(captured).toContain('entities: Acme');
  });

  it('ordering behaviour is unchanged by enrichment (deterministic fallback identical)', async () => {
    const s0 = scene({ source: 'a', startTime: 0, endTime: 3, importance: 0.9 });
    const s1 = scene({ source: 'b', startTime: 0, endTime: 3, importance: 0.1, createdAt: 50 });
    const r = await orderStorylineWithLLM([s0, s1], brief(), async () => { throw new Error('boom'); });
    expect(r.planApplied).toBe(false);
    expect(r.storyline.clips).toHaveLength(2); // still composes, enrichment did not drop/scramble clips
  });
});

// ─── B7: the order-intent mode reaches the ordering prompt ───

describe('orderStorylineWithLLM - order-intent policy shapes the prompt (B7)', () => {
  const okPlan = async () =>
    JSON.stringify({ order: [{ ref: 'c0', linkFromPrev: null }, { ref: 'c1', linkFromPrev: 'and-then' }] });

  it('★ procedural content-type -> the LLM gets the PROCEDURAL prompt (not the story hook)', async () => {
    let captured = '';
    const llm = async (p: string) => { captured = p; return okPlan(); };
    const r = await orderStorylineWithLLM(
      [scene({ source: 'a', transcription: 'First, crack the eggs.' }), scene({ source: 'b', transcription: 'Finally, serve it hot.' })],
      brief(), llm, { contentType: 'recipe' },
    );
    expect(r.policy?.mode).toBe('procedural');
    expect(captured).toMatch(/PROCESS|STEP \/ CAUSAL|RECOVER/);
    expect(captured).not.toContain('tell the strongest story');
  });

  it('narrative content -> the LLM gets the story prompt + policy.mode narrative', async () => {
    let captured = '';
    const llm = async (p: string) => { captured = p; return okPlan(); };
    const r = await orderStorylineWithLLM(
      [scene({ source: 'a', transcription: 'our product is amazing' }), scene({ source: 'b', transcription: 'buy it now' })],
      brief(), llm, { contentType: 'ad' },
    );
    expect(r.policy?.mode).toBe('narrative');
    expect(captured).toContain('tell the strongest story');
  });

  it('surfaces lowConfidence when clips are silent and no script (flag to the user)', async () => {
    const r = await orderStorylineWithLLM(
      [scene({ source: 'a', transcription: '' }), scene({ source: 'b', transcription: '' })],
      brief(), okPlan,
    );
    expect(r.policy?.lowConfidence).toBe(true);
  });
});
