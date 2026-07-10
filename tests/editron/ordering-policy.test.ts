import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { resolveOrderingPolicy } from '@/lib/editron/storyline/ordering-policy';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(transcription: string, over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 's', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription, ...over });
}
function silent(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 's', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return {
    output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null, ...output },
    brand: null, entryPoint: 'upload', resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}

describe('resolveOrderingPolicy - mode from content-type (the reliable primary signal)', () => {
  it('recipe content-type -> procedural, high confidence', () => {
    const p = resolveOrderingPolicy([scene('crack the eggs'), scene('serve hot')], brief(), { contentType: 'recipe' });
    expect(p.mode).toBe('procedural');
    expect(p.confidence).toBe('high');
  });

  it('ad content-type -> narrative, high confidence', () => {
    const p = resolveOrderingPolicy([scene('our product is amazing'), scene('buy now')], brief(), { contentType: 'ad' });
    expect(p.mode).toBe('narrative');
    expect(p.confidence).toBe('high');
  });

  it('reads content-type from the brief intent/style too (not just opts)', () => {
    const p = resolveOrderingPolicy([scene('open the app'), scene('save it')], brief({ intent: 'software tutorial walkthrough' }));
    expect(p.mode).toBe('procedural');
  });
});

describe('resolveOrderingPolicy - procedural via corroborated sequence cues (no content-type)', () => {
  it('"first / second / finally" across clips -> procedural', () => {
    const scenes = [scene('First, check the drainage.'), scene('Second, water less often.'), scene('Finally, watch them thrive.')];
    const p = resolveOrderingPolicy(scenes, brief());
    expect(p.mode).toBe('procedural');
    expect(p.signals.some((s) => s.startsWith('sequence-cues'))).toBe(true);
  });

  it('Hinglish ordinals ("sabse pehle / doosra") -> procedural (multilingual)', () => {
    const scenes = [scene('Sabse pehle drainage check karo.'), scene('Doosra, kam paani do.'), scene('Finally, dekho kaise grow karte hain.')];
    const p = resolveOrderingPolicy(scenes, brief());
    expect(p.mode).toBe('procedural');
  });
});

describe('resolveOrderingPolicy - ADVERSARIAL: must NOT misfire (Rule 29)', () => {
  it('★ bare "then / next" narration is NOT a step cue ("then he said" is a story, not a process)', () => {
    const scenes = [
      scene('So then he looked at me and said the funniest thing.'),
      scene('And next thing you know we were both laughing.'),
      scene('After that the whole trip changed.'),
    ];
    const p = resolveOrderingPolicy(scenes, brief());
    expect(p.mode).toBe('narrative'); // no strong cues, no content-type
  });

  it('★ a single incidental "first of all" in an ad does NOT flip the whole edit', () => {
    const scenes = [
      scene('First of all, this thing completely changed my mornings.'),
      scene('The coffee comes out perfect every time.'),
      scene('Honestly the best purchase this year.'),
    ];
    const p = resolveOrderingPolicy(scenes, brief());
    expect(p.mode).toBe('narrative'); // 1 cue scene < min 2 -> not corroborated
    expect(p.signals.some((s) => s.startsWith('weak-cues'))).toBe(true);
  });

  it('★ narrative content-type WINS over step language (an ad that walks first->then problem/solution)', () => {
    const scenes = [scene('First, the problem: mornings were chaos.'), scene('Second, we found the fix.')];
    const p = resolveOrderingPolicy(scenes, brief(), { contentType: 'brand ad' });
    expect(p.mode).toBe('narrative');
  });
});

describe('resolveOrderingPolicy - order source + conviction', () => {
  it('a provided script is the authoritative order source, high confidence', () => {
    const p = resolveOrderingPolicy([scene('a'), scene('b')], brief(), { hasScript: true });
    expect(p.orderSource).toBe('script');
    expect(p.confidence).toBe('high');
    expect(p.lowConfidence).toBe(false);
  });

  it('★ all-silent clips with no script -> insufficient, lowConfidence (flag to the user, do not fake it)', () => {
    const p = resolveOrderingPolicy([silent(), silent(), silent()], brief());
    expect(p.orderSource).toBe('insufficient');
    expect(p.lowConfidence).toBe(true);
    expect(p.reason).toMatch(/ask the user|Not enough signal/i);
  });

  it('speech-bearing clips -> content is the order source', () => {
    const p = resolveOrderingPolicy([scene('hello there'), scene('welcome back')], brief());
    expect(p.orderSource).toBe('content');
  });

  it('mostly-silent (coverage < 0.5) still uses partial speech but flags lower confidence', () => {
    const scenes = [scene('one line'), silent(), silent(), silent()];
    const p = resolveOrderingPolicy(scenes, brief());
    expect(p.orderSource).toBe('content');
    expect(p.signals.some((s) => s.startsWith('partial-speech'))).toBe(true);
  });
});

describe('resolveOrderingPolicy - robustness', () => {
  it('empty scenes does not throw', () => {
    const p = resolveOrderingPolicy([], brief());
    expect(p.orderSource).toBe('insufficient');
    expect(p.lowConfidence).toBe(true);
  });

  it('every result carries a reason and at least one signal', () => {
    const p = resolveOrderingPolicy([scene('First, do this.'), scene('Second, do that.')], brief(), { contentType: 'tutorial' });
    expect(p.reason.length).toBeGreaterThan(0);
    expect(p.signals.length).toBeGreaterThan(0);
  });
});
