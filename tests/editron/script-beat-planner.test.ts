import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { orderStorylineWithLLM } from '@/lib/editron/storyline/order-storyline-service';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import { planStorylineFromScript } from '@/lib/editron/storyline/script-beat-planner';

function scene(overrides: Partial<SceneInput>): Scene {
  return makeScene({
    source: 'source.mp4',
    startTime: 0,
    endTime: 3,
    objects: [],
    faces: [],
    detectedText: [],
    transcription: '',
    ...overrides,
  });
}

function brief(targetDurationSec: number | null = null): ProductionBrief {
  return {
    output: {
      platform: 'youtube',
      format: 'auto-edit',
      count: 1,
      aspectRatio: '16:9',
      targetDurationSec,
    },
    brand: null,
    entryPoint: 'upload',
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}

function queuedLlm(...responses: string[]) {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    llm: async (prompt: string) => {
      prompts.push(prompt);
      const response = responses[index];
      index += 1;
      if (response === undefined) throw new Error(`unexpected LLM call ${index}`);
      return response;
    },
  };
}

function vectorFor(text: string): number[] {
  const lower = text.toLocaleLowerCase();
  if (lower.includes('mood')) return [1, 0, 0, 0];
  if (lower.includes('pattern')) return [0, 1, 0, 0];
  if (lower.includes('zardozi') || lower.includes('karigar')) return [0, 0, 1, 0];
  if (lower.includes('garment') || lower.includes('final')) return [0, 0, 0, 1];
  return [];
}

describe('script-beat planner - grounded multi-asset authority', () => {
  it('preserves a Hinglish/Devanagari script and orders distinct visual evidence by beat', async () => {
    const footage = [
      scene({
        id: 'mood',
        source: 'mood.mp4',
        description: 'Designer arranges reference swatches on a mood board.',
        objects: ['fabric swatches', 'mood board'],
        embedding: [1, 0, 0, 0],
      }),
      scene({
        id: 'pattern',
        source: 'pattern.mp4',
        description: 'Pattern maker draws garment lines with a ruler.',
        objects: ['ruler', 'paper pattern'],
        embedding: [0, 1, 0, 0],
      }),
      scene({
        id: 'zardozi',
        source: 'zardozi.mp4',
        description: 'Karigar performs zardozi embroidery by hand.',
        objects: ['embroidery frame', 'beads'],
        embedding: [0, 0, 1, 0],
      }),
      scene({
        id: 'garment',
        source: 'garment.mp4',
        description: 'Finished garment is displayed on a mannequin.',
        objects: ['finished garment', 'mannequin'],
        embedding: [0, 0, 0, 1],
      }),
    ];
    const script = 'Mood board se direction clear hoti hai. Pattern making se silhouette banti hai. '
      + 'Phir karigar zardozi karta hai. Ant mein final garment taiyar hai.';
    const model = queuedLlm(
      JSON.stringify({ beats: [
        { unitRefs: ['u0'], visualIntent: 'mood board and fabric references', relationFromPrevious: null },
        { unitRefs: ['u1'], visualIntent: 'pattern drafting with ruler', relationFromPrevious: 'therefore' },
        { unitRefs: ['u2'], visualIntent: 'karigar doing zardozi embroidery', relationFromPrevious: 'and-then' },
        { unitRefs: ['u3'], visualIntent: 'finished garment reveal', relationFromPrevious: 'therefore' },
      ] }),
      JSON.stringify({ assignments: [
        { beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'mood board and swatches are visible' },
        { beatId: 'b1', coverage: 'covered', sceneRefs: ['c1'], evidence: 'ruler and paper pattern are visible' },
        { beatId: 'b2', coverage: 'covered', sceneRefs: ['c2'], evidence: 'zardozi embroidery is visible' },
        { beatId: 'b3', coverage: 'covered', sceneRefs: ['c3'], evidence: 'finished garment is displayed' },
      ], rationale: 'Follow the construction process.' }),
    );

    const result = await orderStorylineWithLLM(footage, brief(), model.llm, {
      script,
      hasScript: true,
      scriptQueryEmbed: async (text) => vectorFor(text),
      ctx: { language: 'hi' },
    });

    expect(result.planApplied).toBe(true);
    expect(result.scriptPlan?.status).toBe('planned');
    expect(result.scriptPlan?.units.map((unit) => unit.text).join(' ')).toBe(script);
    expect(result.storyline.clips.map((clip) => clip.sourceRef)).toEqual(['mood', 'pattern', 'zardozi', 'garment']);
    expect(result.scriptPlan?.retrieval).toEqual({
      beatCount: 4,
      embeddedBeatCount: 4,
      sceneCount: 4,
      embeddedSceneCount: 4,
      degraded: false,
    });
    expect(model.prompts[1]).toContain('Designer arranges reference swatches');
  });

  it('rejects reversed chronology from one source and applies one structured repair', async () => {
    const footage = [
      scene({ id: 'early', source: 'same.mp4', startTime: 0, endTime: 3, transcription: 'first step', embedding: [1, 0] }),
      scene({ id: 'late', source: 'same.mp4', startTime: 10, endTime: 13, transcription: 'second step', embedding: [0, 1] }),
    ];
    const model = queuedLlm(
      JSON.stringify({ beats: [
        { unitRefs: ['u0'], visualIntent: 'first step', relationFromPrevious: null },
        { unitRefs: ['u1'], visualIntent: 'second step', relationFromPrevious: 'therefore' },
      ] }),
      JSON.stringify({ assignments: [
        { beatId: 'b0', coverage: 'covered', sceneRefs: ['c1'], evidence: 'late step' },
        { beatId: 'b1', coverage: 'covered', sceneRefs: ['c0'], evidence: 'early step' },
      ] }),
      JSON.stringify({ assignments: [
        { beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'first step transcript' },
        { beatId: 'b1', coverage: 'covered', sceneRefs: ['c1'], evidence: 'second step transcript' },
      ] }),
    );

    const result = await planStorylineFromScript({
      scenes: footage,
      script: 'First step. Second step.',
      brief: brief(),
      llm: model.llm,
      queryEmbed: async (text) => text.includes('First') ? [1, 0] : [0, 1],
    });

    expect(result.status).toBe('planned');
    expect(result.selectedSceneIds).toEqual(['early', 'late']);
    expect(result.attempts).toBe(3);
    expect(model.prompts[2]).toContain('source_order_violation');
  });

  it('repairs an over-duration selection by leaving unsupported coverage explicit', async () => {
    const footage = [
      scene({ id: 'one', source: 'one.mp4', endTime: 4, transcription: 'one', embedding: [1, 0] }),
      scene({ id: 'two', source: 'two.mp4', endTime: 4, transcription: 'two', embedding: [0, 1] }),
    ];
    const model = queuedLlm(
      JSON.stringify({ beats: [
        { unitRefs: ['u0'], visualIntent: 'one', relationFromPrevious: null },
        { unitRefs: ['u1'], visualIntent: 'two', relationFromPrevious: 'and-then' },
      ] }),
      JSON.stringify({ assignments: [
        { beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'one' },
        { beatId: 'b1', coverage: 'covered', sceneRefs: ['c1'], evidence: 'two' },
      ] }),
      JSON.stringify({ assignments: [
        { beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'one' },
        { beatId: 'b1', coverage: 'missing', sceneRefs: [], evidence: '' },
      ] }),
    );

    const result = await planStorylineFromScript({
      scenes: footage,
      script: 'One. Two.',
      brief: brief(5),
      llm: model.llm,
      queryEmbed: async (text) => text.includes('One') ? [1, 0] : [0, 1],
    });

    expect(result.status).toBe('partial');
    expect(result.selectedSceneIds).toEqual(['one']);
    expect(model.prompts[2]).toContain('over_budget');
  });

  it('fails after repair when a clip is still reused across beats', async () => {
    const repeated = JSON.stringify({ assignments: [
      { beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'same clip' },
      { beatId: 'b1', coverage: 'covered', sceneRefs: ['c0'], evidence: 'same clip again' },
    ] });
    const model = queuedLlm(
      JSON.stringify({ beats: [
        { unitRefs: ['u0'], visualIntent: 'one', relationFromPrevious: null },
        { unitRefs: ['u1'], visualIntent: 'two', relationFromPrevious: 'and-then' },
      ] }),
      repeated,
      repeated,
    );
    const result = await planStorylineFromScript({
      scenes: [
        scene({ id: 'one', source: 'one.mp4', transcription: 'one', embedding: [1, 0] }),
        scene({ id: 'two', source: 'two.mp4', transcription: 'two', embedding: [0, 1] }),
      ],
      script: 'One. Two.',
      brief: brief(),
      llm: model.llm,
      queryEmbed: async () => [1, 0],
    });

    expect(result.status).toBe('failed');
    expect(result.errors.join(' ')).toContain('reused');
  });

  it('reports an unavailable semantic seam instead of pretending a script was applied', async () => {
    let called = false;
    const result = await orderStorylineWithLLM(
      [scene({ id: 'one', transcription: 'one' }), scene({ id: 'two', source: 'two.mp4', transcription: 'two' })],
      brief(),
      async () => { called = true; return '{}'; },
      { script: 'One. Two.', hasScript: true },
    );

    expect(called).toBe(false);
    expect(result.planApplied).toBe(false);
    expect(result.fallbackReason).toBe('script_planner_unavailable');
  });
});
