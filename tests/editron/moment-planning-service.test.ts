import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { CoverageVerify } from '@/lib/editron/storyline/coverage';
import { checkMomentCoverage, planProjectEdit, type MomentPlanningDeps } from '@/lib/editron/storyline/moment-planning-service';
import { cosineSimilarity, type SceneEmbed } from '@/lib/editron/storyline/scene-embedding';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function s(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'x', startTime: 0, endTime: 4, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
function brief(): ProductionBrief {
  return { output: { platform: 'tiktok', format: 'reel', count: 1, aspectRatio: '9:16', targetDurationSec: null }, brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] } };
}
// deterministic embedder: keyword -> vector (applied to scene descriptors AND request text)
const embed: SceneEmbed = async (text) => {
  if (/product/i.test(text)) return [1, 0, 0];
  if (/cta|buy|link/i.test(text)) return [0, 1, 0];
  return [0, 0, 1];
};
// vision confirms when the scene's frame matches the request (near-identical embeddings)
const verify: CoverageVerify = async (q, sc) => ({
  confirmed: !!q.embedding && !!sc.embedding && q.embedding.length === sc.embedding.length && cosineSimilarity(sc.embedding, q.embedding) > 0.9,
});
const deps: MomentPlanningDeps = { embed, verify };

const FOOTAGE = [
  s({ source: 'prod', visualMode: 'product-shot', importance: 0.7, createdAt: 100 }),
  s({ source: 'cta', transcription: 'buy now at the link', importance: 0.5, createdAt: 200 }),
];

describe('planProjectEdit', () => {
  it('a covered shot list -> READY, plan retains clips, no film-list', async () => {
    const { plan, feasibility } = await planProjectEdit(FOOTAGE, brief(), [{ text: 'the product' }], deps);
    expect(feasibility.status).toBe('ready');
    expect(plan.decisions.some((d) => d.action === 'request-coverage')).toBe(false);
    expect(plan.storyline.clips.length).toBe(2);
  });

  it('★ an uncovered moment -> GAPS, plan folds in request-coverage (film this)', async () => {
    const { plan, feasibility } = await planProjectEdit(FOOTAGE, brief(), [{ text: 'a drone flyover' }], deps);
    expect(feasibility.status).toBe('gaps');
    expect(plan.decisions.some((d) => d.action === 'request-coverage')).toBe(true);
  });

  it('an embed failure for a request degrades gracefully (no crash)', async () => {
    const flaky: MomentPlanningDeps = { embed: async (t) => { if (/boom/.test(t)) throw new Error('down'); return embed(t); }, verify };
    const { plan } = await planProjectEdit(FOOTAGE, brief(), [{ text: 'boom moment' }], flaky);
    expect(plan.storyline.clips.length).toBe(2); // still produces a plan
  });

  it('empty requests -> a plan with no coverage gaps', async () => {
    const { plan, feasibility } = await planProjectEdit(FOOTAGE, brief(), [], deps);
    expect(feasibility.status).toBe('ready');
    expect(plan.decisions.some((d) => d.action === 'request-coverage')).toBe(false);
  });
});

describe('checkMomentCoverage', () => {
  it('a single "do we have this?" -> have, with the matching clip', async () => {
    const r = await checkMomentCoverage(FOOTAGE, 'the product', deps);
    expect(r.verdict).toBe('have');
    expect(r.best?.scene.source).toBe('prod');
  });

  it('a moment we lack -> missing (film it)', async () => {
    const r = await checkMomentCoverage(FOOTAGE, 'an aerial drone shot', deps);
    expect(['missing', 'partial']).toContain(r.verdict);
  });
});
