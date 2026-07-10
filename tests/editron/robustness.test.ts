/**
 * Battle test - adversarial inputs to every built module. Goal: nothing throws, every number
 * is finite and in-range, every plan/parse degrades gracefully. If a case here fails, it's a
 * real robustness bug (NaN propagation, non-finite windows, malformed input crashing).
 */
import { describe, expect, it } from 'vitest';

import { composeStoryline, defaultSceneScorer, orderScenes, selectScenes } from '@/lib/editron/storyline/compose';
import { assessCoverage, type CoverageVerify } from '@/lib/editron/storyline/coverage';
import { composeDeliverables } from '@/lib/editron/storyline/deliverables';
import { assessFeasibility } from '@/lib/editron/storyline/feasibility';
import { readTimeHold, sceneFromImage } from '@/lib/editron/storyline/image-scene';
import { buildOrderingDigest } from '@/lib/editron/storyline/ordering-digest';
import { validateOrderingPlan } from '@/lib/editron/storyline/ordering-plan';
import { buildOrderingPrompt, parseOrderingResponse } from '@/lib/editron/storyline/ordering-prompt';
import { cosineSimilarity, makeEmbeddingScorer } from '@/lib/editron/storyline/scene-embedding';
import { brandDefaultsFromProfile, normalizePlatform } from '@/lib/editron/production-brief/brand-adapter';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import { validateStoryline } from '@/lib/editron/storyline/storyline';

function s(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return { output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null, ...output }, brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] } };
}
const finite01 = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
const NASTY_NUMS = [NaN, Infinity, -Infinity, -1, 0, 1e308, -1e308];

describe('battle: cosineSimilarity numeric hardening', () => {
  it('never returns NaN/Infinity or out-of-range, on any pathological vectors', () => {
    const cases: [number[], number[]][] = [
      [[NaN, 1], [1, 0]], [[Infinity, 0], [1, 0]], [[1, 0], [NaN, NaN]],
      [[0, 0], [0, 0]], [[1e308, 1e308], [1e308, 1e308]], [[-1, -1], [1, 1]],
      [[1, 0, 0], [1, 0]], [[], []], [[-Infinity], [Infinity]],
    ];
    for (const [a, b] of cases) expect(finite01(cosineSimilarity(a, b))).toBe(true);
  });
});

describe('battle: embedding scorer', () => {
  it('finite [0,1] score with NaN importance and NaN/huge embeddings', () => {
    const scorer = makeEmbeddingScorer([1, 0]);
    for (const imp of NASTY_NUMS) {
      for (const emb of [[NaN, 1], [Infinity, 0], [1e308, 1e308], [0, 0], undefined]) {
        expect(finite01(scorer(s({ importance: imp, embedding: emb }), brief()))).toBe(true);
      }
    }
    expect(finite01(makeEmbeddingScorer(null)(s({ importance: 0.5 }), brief()))).toBe(true);
    expect(finite01(makeEmbeddingScorer([])(s({ embedding: [1] }), brief()))).toBe(true);
  });
});

describe('battle: compose (select/order/composeStoryline)', () => {
  const nasty = [
    s({ startTime: NaN, endTime: 5 }), s({ startTime: 10, endTime: -5 }),
    s({ startTime: 0, endTime: Infinity }), s({ startTime: 0, endTime: 0 }),
    s({ startTime: 0, endTime: 3, importance: NaN }), s({ startTime: -1e9, endTime: 1e9 }),
    s({ startTime: 0, endTime: 3, importance: Infinity }),
  ];

  it('defaultSceneScorer is always finite [0,1] on nasty scenes', () => {
    for (const sc of nasty) expect(finite01(defaultSceneScorer(sc, brief({ intent: 'x y z' })))).toBe(true);
  });

  it('composeStoryline never throws, emits a VALID storyline with finite clip durations', () => {
    for (const target of [null, 0, -5, NaN, Infinity, 1e12, 0.0001]) {
      const story = composeStoryline(nasty, brief({ targetDurationSec: target as number }));
      expect(story.clips.every((c) => Number.isFinite(c.durationSec) && c.durationSec > 0)).toBe(true);
      expect(Number.isFinite(story.totalDurationSec)).toBe(true);
      expect(validateStoryline(story).valid).toBe(true);
    }
  });

  it('orderScenes handles NaN ratio + huge scene counts without throwing', () => {
    const many = Array.from({ length: 2000 }, (_, i) => s({ source: `v${i}`, startTime: 0, endTime: 2, importance: (i % 7) / 7 }));
    for (const ratio of [NaN, Infinity, -1, 2, 0.5]) {
      const scored = selectScenes(many, brief());
      expect(orderScenes(scored, ratio as number).length).toBe(scored.length);
    }
  });
});

describe('battle: validateOrderingPlan + parseOrderingResponse', () => {
  const scenes = [s({ source: 'a' }), s({ source: 'b' })];
  const digests = buildOrderingDigest(scenes);

  it('validateOrderingPlan never throws on garbage plans', () => {
    const garbage = [
      { order: [] },
      { order: Array.from({ length: 5000 }, () => ({ sourceRef: 'ghost' })) },
      { order: [{ sourceRef: scenes[0].id }, { sourceRef: scenes[0].id }], hookRef: 'nope' },
      { order: [{ sourceRef: '' }] },
    ];
    for (const p of garbage) expect(() => validateOrderingPlan(p as never, scenes)).not.toThrow();
  });

  it('parseOrderingResponse returns an error (never throws) on hostile input', () => {
    const hostile = ['', '{', 'null', '[]', '{"order":123}', '{"order":[1,2,3]}', '{"order":[{"ref":42}]}', '```json\n{bad}\n```', JSON.stringify({ order: Array(9999).fill({ ref: 'x' }) })];
    for (const raw of hostile) expect(() => parseOrderingResponse(raw, digests)).not.toThrow();
  });

  it('buildOrderingPrompt never throws on huge/unicode transcripts', () => {
    const big = buildOrderingDigest([s({ transcription: 'व '.repeat(5000) + '🔥'.repeat(500) })]);
    expect(() => buildOrderingPrompt(big, { language: 'hi' })).not.toThrow();
  });
});

describe('battle: coverage + feasibility', () => {
  const verifyThrows: CoverageVerify = async () => { throw new Error('boom'); };
  it('assessCoverage never throws; verdict is one of have/partial/missing even with NaN embeddings + throwing verify', async () => {
    const scenes = [s({ embedding: [NaN, 1] }), s({ embedding: [Infinity, 0] }), s({ embedding: [1, 0] })];
    const r = await assessCoverage({ text: 'x', embedding: [NaN, 0] }, scenes, verifyThrows);
    expect(['have', 'partial', 'missing']).toContain(r.verdict);
    const r2 = await assessCoverage({ text: 'x', embedding: undefined }, scenes, async () => ({ confirmed: true }));
    expect(['have', 'partial', 'missing']).toContain(r2.verdict);
  });
  it('assessFeasibility never throws on duplicate ids / empty text / throwing verify', async () => {
    const requests = [{ id: 'a', text: '', embedding: [NaN, 1] }, { id: 'a', text: 'dup', embedding: [1, 0] as number[] }];
    const r = await assessFeasibility(requests, [s({ embedding: [1, 0] })], verifyThrows);
    expect(['ready', 'gaps', 'blocked']).toContain(r.status);
  });
});

describe('battle: image / brand / deliverables', () => {
  it('sceneFromImage + readTimeHold clamp any nasty hold/text', () => {
    for (const hold of NASTY_NUMS) {
      const sc = sceneFromImage({ assetId: 'i', holdSec: hold }, { detectedText: ['word '.repeat(10000)] });
      expect(Number.isFinite(sc.durationSec) && sc.durationSec > 0).toBe(true);
    }
    expect(Number.isFinite(readTimeHold({ detectedText: [] }))).toBe(true);
  });
  it('normalizePlatform + brandDefaultsFromProfile never throw on junk', () => {
    for (const p of ['', '   ', '🔥', 'x'.repeat(5000), null as never, undefined as never]) expect(() => normalizePlatform(p)).not.toThrow();
    expect(brandDefaultsFromProfile({ toneKeywords: [null, '', ' ok '], connectedPlatforms: [null, 'nope'], primaryPlatform: null })).toEqual({ vibe: { tone: 'ok' } });
  });
  it('composeDeliverables never throws on nasty specs', () => {
    const out = composeDeliverables([s({ importance: 0.5 })], brief(), [{ targetDurationSec: NaN }, { targetDurationSec: -5 }, { platform: 'tiktok', targetDurationSec: 1e12 }]);
    expect(out.every((d) => Number.isFinite(d.storyline.totalDurationSec))).toBe(true);
  });
});
