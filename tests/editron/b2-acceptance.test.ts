/**
 * B2 acceptance suite - 10 product-requirement scenarios exercising the multi-asset primitives
 * TOGETHER (compose + coverage + feasibility + cutting + planner + image), not as units. Each
 * reads like a requirement the multi-asset system must satisfy. Deterministic fakes stand in for
 * the vision/embedding models (injected everywhere), so these run with no API.
 */
import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeStoryline } from '@/lib/editron/storyline/compose';
import { assessCoverage, type CoverageVerify } from '@/lib/editron/storyline/coverage';
import { cutToMoment, type VlmCut } from '@/lib/editron/storyline/cutting';
import { assessFeasibility, type ShotRequest } from '@/lib/editron/storyline/feasibility';
import { sceneFromImage } from '@/lib/editron/storyline/image-scene';
import { buildEditPlan } from '@/lib/editron/storyline/planner';
import { cosineSimilarity } from '@/lib/editron/storyline/scene-embedding';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import { validateStoryline } from '@/lib/editron/storyline/storyline';

function s(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'x', startTime: 0, endTime: 4, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return { output: { platform: 'tiktok', format: 'reel', count: 1, aspectRatio: '9:16', targetDurationSec: null, ...output }, brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] } };
}
// a realistic small project: a product-ad shoot
const FOOTAGE: Scene[] = [
  s({ source: 'frustration', importance: 0.9, transcription: 'my old camera takes blurry photos', visualMode: 'talking-head', embedding: [1, 0, 0, 0], createdAt: 100 }),
  s({ source: 'product', importance: 0.7, transcription: '', visualMode: 'product-shot', embedding: [0, 1, 0, 0], createdAt: 200 }),
  s({ source: 'proof', importance: 0.6, transcription: 'tested by fifty people', visualMode: 'talking-head', embedding: [0, 0, 1, 0], createdAt: 300 }),
  s({ source: 'cta', importance: 0.5, transcription: 'buy now at the link', visualMode: 'text-card', embedding: [0, 0, 0, 1], createdAt: 400 }),
];
/** A vision model that confirms a scene for a request only when the frame genuinely matches it
 *  (near-identical embeddings) — request-aware, like a real VLM. */
const visionMatches: CoverageVerify = async (q, sc) => ({
  confirmed: !!q.embedding && !!sc.embedding && q.embedding.length === sc.embedding.length && cosineSimilarity(sc.embedding, q.embedding) > 0.9,
});
const rejectAll: CoverageVerify = async () => ({ confirmed: false });

describe('B2 acceptance', () => {
  it('1. multi-clip upload becomes ONE ordered, valid, budget-respecting cut', () => {
    const story = composeStoryline(FOOTAGE, brief({ targetDurationSec: 8 }));
    expect(story.totalDurationSec).toBeLessThanOrEqual(8);
    expect(story.clips.map((c) => c.order)).toEqual(story.clips.map((_, i) => i));
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('2. a wanted moment we HAVE is located with a real timecode', async () => {
    const r = await assessCoverage({ text: 'the product shot', embedding: [0, 1, 0, 0] }, FOOTAGE, visionMatches);
    expect(r.verdict).toBe('have');
    expect(r.best?.scene.source).toBe('product');
    expect(r.statement).toMatch(/product-shot|:/);
  });

  it('3. a wanted moment we LACK is honestly flagged to film', async () => {
    const r = await assessCoverage({ text: 'an aerial drone shot', embedding: [0, 0, 0, 0] }, FOOTAGE, visionMatches);
    expect(r.verdict).toBe('missing');
    expect(r.statement).toMatch(/film it/i);
  });

  it('4. the system NEVER claims a moment on similarity alone (vision gates the claim)', async () => {
    // request retrieves "product" strongly, but the vision check rejects it
    const r = await assessCoverage({ text: 'the product', embedding: [0, 1, 0, 0] }, FOOTAGE, rejectAll);
    expect(r.verdict).not.toBe('have');
  });

  it('5. a shot list with everything covered is READY', async () => {
    const requests: ShotRequest[] = [
      { id: 'p', text: 'product', embedding: [0, 1, 0, 0] },
      { id: 'c', text: 'cta', embedding: [0, 0, 0, 1] },
    ];
    const r = await assessFeasibility(requests, FOOTAGE, visionMatches);
    expect(r.status).toBe('ready');
  });

  it('6. a missing ESSENTIAL shot BLOCKS and names what to film', async () => {
    const requests: ShotRequest[] = [
      { id: 'p', text: 'product', embedding: [0, 1, 0, 0], priority: 'nice' },
      { id: 'd', text: 'drone flyover', embedding: [0, 0, 0, 0], priority: 'must' },
    ];
    const r = await assessFeasibility(requests, FOOTAGE, visionMatches);
    expect(r.status).toBe('blocked');
    expect(r.statement).toContain('drone');
  });

  it('7. a clip is trimmed to EXACTLY the requested moment', async () => {
    const clip = s({ source: 'long', startTime: 0, endTime: 30 });
    const vlm: VlmCut = async () => ({ present: true, windows: [{ startSec: 8, endSec: 12, confidence: 0.9 }] });
    const r = await cutToMoment(clip, { text: 'the reveal' }, vlm);
    expect(r.verdict).toBe('cut');
    expect([r.clips[0].startTime, r.clips[0].endTime]).toEqual([8, 12]);
  });

  it('8. a clip with the moment TWICE is split into usable pieces', async () => {
    const clip = s({ source: 'long', startTime: 0, endTime: 30 });
    const vlm: VlmCut = async () => ({ present: true, windows: [{ startSec: 3, endSec: 6, confidence: 0.9 }, { startSec: 20, endSec: 24, confidence: 0.8 }] });
    expect((await cutToMoment(clip, { text: 'the laugh' }, vlm)).verdict).toBe('split');
  });

  it('9. the edit plan explains what was kept/trimmed and what to film', async () => {
    const feasibility = await assessFeasibility(
      [{ id: 'd', text: 'drone flyover', embedding: [0, 0, 0, 0], priority: 'nice' }],
      FOOTAGE,
      visionMatches,
    );
    const plan = buildEditPlan(FOOTAGE, brief({ targetDurationSec: 8 }), { feasibility });
    expect(plan.decisions.some((d) => d.action === 'retain' || d.action === 'trim')).toBe(true);
    expect(plan.decisions.some((d) => d.action === 'request-coverage' && d.ref === 'd')).toBe(true);
    expect(plan.statement).toMatch(/clip/i);
  });

  it('10. images and video compose into ONE ordered timeline (mixed media)', () => {
    const logo = sceneFromImage({ assetId: 'logo', source: 'logo.png', createdAt: 50 }, { visualMode: 'text-card', detectedText: ['BrandName'], importance: 0.4 });
    const story = composeStoryline([...FOOTAGE, logo], brief());
    expect(story.clips.some((c) => c.source === 'logo.png')).toBe(true);
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('11. a Hinglish request finds the right clip (multilingual coverage)', async () => {
    const hing = s({ source: 'hing', transcription: 'yaar iska camera ekdum sharp hai', visualMode: 'product-shot', embedding: [0, 1, 0, 0] });
    const r = await assessCoverage({ text: 'camera sharp wala shot', embedding: [0, 1, 0, 0] }, [hing, ...FOOTAGE], visionMatches);
    expect(r.verdict).toBe('have');
    expect(r.best?.scene.source).toBe('hing');
  });
});
