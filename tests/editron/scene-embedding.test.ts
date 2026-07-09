import { describe, expect, it } from 'vitest';

import {
  cosineSimilarity,
  embedScenes,
  makeEmbeddingScorer,
  type SceneEmbed,
  sceneEmbeddingText,
} from '@/lib/editron/storyline/scene-embedding';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}

describe('sceneEmbeddingText - MULTIMODAL (said + shown)', () => {
  it('fuses transcript with visual facts', () => {
    const t = sceneEmbeddingText(scene({ transcription: 'buy now', visualMode: 'talking-head', actionType: 'gesturing', detectedText: ['SALE'] }));
    expect(t).toContain('buy now');
    expect(t).toContain('talking-head');
    expect(t).toContain('SALE');
  });

  it('★ a SILENT b-roll clip still produces embeddable text from its visuals', () => {
    const t = sceneEmbeddingText(scene({ transcription: '', visualMode: 'product-shot', detectedText: ['NEW'] }));
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain('product-shot');
  });

  it('a fully feature-less clip yields empty (nothing to embed)', () => {
    expect(sceneEmbeddingText(scene({ transcription: '' }))).toBe('');
  });
});

describe('cosineSimilarity', () => {
  it('identical -> 1, orthogonal -> 0, opposite -> 0 (clamped)', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0);
  });
  it('mismatched length / zero vector -> 0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('embedScenes - precompute at the edge', () => {
  const embed: SceneEmbed = async (text) => [text.length, 1];

  it('sets an embedding per scene via the injected embedder', async () => {
    const s = scene({ transcription: 'hello' });
    const out = await embedScenes([s], embed);
    expect(out[0].embedding).toEqual([sceneEmbeddingText(s).length, 1]); // embed returns [text.length, 1]
  });

  it('leaves a feature-less scene un-embedded (scorer falls back)', async () => {
    const out = await embedScenes([scene({ transcription: '' })], embed);
    expect(out[0].embedding).toBeUndefined();
  });

  it('skips a scene whose embed call throws, keeps the rest', async () => {
    const flaky: SceneEmbed = async (t) => { if (t.includes('boom')) throw new Error('down'); return [1, 1]; };
    const out = await embedScenes([scene({ transcription: 'boom' }), scene({ transcription: 'ok' })], flaky);
    expect(out[0].embedding).toBeUndefined();
    expect(out[1].embedding).toEqual([1, 1]);
  });
});

describe('makeEmbeddingScorer - semantic selection', () => {
  const intent = [1, 0]; // "the thing the user asked for"

  it('a scene semantically CLOSE to intent outranks a FAR one', () => {
    const near = scene({ importance: 0.5, embedding: [1, 0.1] });
    const far = scene({ importance: 0.5, embedding: [0, 1] });
    const s = makeEmbeddingScorer(intent);
    expect(s(near, undefined as never)).toBeGreaterThan(s(far, undefined as never));
  });

  it('★ a SILENT b-roll clip matching intent VISUALLY beats a talking clip that does not', () => {
    const brollMatches = scene({ transcription: '', visualMode: 'product-shot', importance: 0.4, embedding: [1, 0] }); // visual vector matches intent
    const talkingOffTopic = scene({ transcription: 'unrelated chatter', importance: 0.4, embedding: [0, 1] });
    const s = makeEmbeddingScorer(intent);
    expect(s(brollMatches, undefined as never)).toBeGreaterThan(s(talkingOffTopic, undefined as never));
  });

  it('degrades to importance when a scene has no embedding, and to 0.5 with neither', () => {
    const s = makeEmbeddingScorer(intent);
    expect(s(scene({ importance: 0.73 }), undefined as never)).toBe(0.73); // no embedding
    expect(s(scene({ embedding: [1, 0] }), undefined as never)).toBe(cosineSimilarity([1, 0], intent)); // no importance -> rel
    expect(s(scene({}), undefined as never)).toBe(0.5); // neither
  });

  it('no intent vector -> importance alone', () => {
    const s = makeEmbeddingScorer(null);
    expect(s(scene({ importance: 0.6, embedding: [1, 0] }), undefined as never)).toBe(0.6);
  });
});
