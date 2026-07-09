import { describe, expect, it } from 'vitest';

import { buildOrderingDigest } from '@/lib/editron/storyline/ordering-digest';
import { buildOrderingPrompt, parseOrderingResponse } from '@/lib/editron/storyline/ordering-prompt';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a.mp4', startTime: 0, endTime: 3,
    objects: [], faces: [], detectedText: [], transcription: 'hello',
    ...over,
  });
}

describe('buildOrderingPrompt', () => {
  const digests = buildOrderingDigest([
    scene({ source: 'a', transcription: 'the hook', importance: 0.9 }),
    scene({ source: 'b', transcription: 'the payoff' }),
  ]);

  it('has the required XML sections with data (clips) LAST', () => {
    const p = buildOrderingPrompt(digests, { platform: 'tiktok', targetDurationSec: 12 });
    for (const tag of ['<role>', '<sequencing_moves>', '<rules>', '<output_format>', '<context>', '<clips']) {
      expect(p).toContain(tag);
    }
    expect(p.indexOf('<clips')).toBeGreaterThan(p.indexOf('<output_format>')); // data last
  });

  it('renders the moves, the clip refs, and source tags', () => {
    const p = buildOrderingPrompt(digests);
    expect(p).toContain('hook-first');
    expect(p).toContain('[c0 · s0]');
    expect(p).toContain('[c1 · s1]');
    expect(p).toContain('transcript: the hook');
  });

  it('carries the language instruction (multilingual / keep code-mixing)', () => {
    expect(buildOrderingPrompt(digests, { language: 'hi' })).toContain('hi');
    expect(buildOrderingPrompt(digests)).toMatch(/keep that natural mix|do not clean it up/i);
  });

  it('accepts an injected moves menu (ThinkForge SEQUENCING_MOVES swaps in here)', () => {
    const p = buildOrderingPrompt(digests, {}, [{ name: 'my-move', effect: 'do the thing' }]);
    expect(p).toContain('my-move: do the thing');
    expect(p).not.toContain('hook-first');
  });
});

describe('parseOrderingResponse', () => {
  const scenes = [scene({ source: 'a' }), scene({ source: 'b' }), scene({ source: 'c' })];
  const digests = buildOrderingDigest(scenes);

  it('maps short refs back to real scene ids, preserving links + hook', () => {
    const raw = JSON.stringify({
      hookRef: 'c1',
      order: [
        { ref: 'c1', linkFromPrev: null, reason: 'strong open' },
        { ref: 'c0', linkFromPrev: 'therefore' },
        { ref: 'c2', linkFromPrev: 'but' },
      ],
      rationale: 'built a story',
    });
    const { plan, error } = parseOrderingResponse(raw, digests);
    expect(error).toBeUndefined();
    expect(plan!.order.map((o) => o.sourceRef)).toEqual([scenes[1].id, scenes[0].id, scenes[2].id]);
    expect(plan!.order[1].linkFromPrev).toBe('therefore');
    expect(plan!.hookRef).toBe(scenes[1].id);
    expect(plan!.rationale).toBe('built a story');
  });

  it('strips a ```json fence the model may add', () => {
    const raw = '```json\n{"order":[{"ref":"c0"}]}\n```';
    expect(parseOrderingResponse(raw, digests).plan!.order[0].sourceRef).toBe(scenes[0].id);
  });

  it('drops unknown and duplicate refs', () => {
    const raw = JSON.stringify({ order: [{ ref: 'c0' }, { ref: 'ghost' }, { ref: 'c0' }] });
    const { plan } = parseOrderingResponse(raw, digests);
    expect(plan!.order.map((o) => o.sourceRef)).toEqual([scenes[0].id]);
  });

  it('drops an invalid linkFromPrev value', () => {
    const raw = JSON.stringify({ order: [{ ref: 'c0' }, { ref: 'c1', linkFromPrev: 'nonsense' }] });
    const { plan } = parseOrderingResponse(raw, digests);
    expect(plan!.order[1].linkFromPrev).toBeUndefined();
  });

  it('returns an error (not a throw) on malformed JSON, so the caller can fall back', () => {
    expect(parseOrderingResponse('not json {', digests).error).toBeDefined();
    expect(parseOrderingResponse(JSON.stringify({ order: 'nope' }), digests).error).toBeDefined();
    expect(parseOrderingResponse(JSON.stringify({ order: [{ ref: 'ghost' }] }), digests).error).toBeDefined();
  });
});
