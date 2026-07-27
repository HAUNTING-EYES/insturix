import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  composeStoryline,
  defaultSceneScorer,
  fitToDuration,
  orderScenes,
  selectScenes,
} from '@/lib/editron/storyline/compose';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import { validateStoryline } from '@/lib/editron/storyline/storyline';

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

describe('selectScenes', () => {
  it('drops invalid-window and micro-duration scenes', () => {
    const scenes = [
      scene({ startTime: 0, endTime: 2 }), // ok
      scene({ startTime: 0, endTime: 0 }), // zero window
      scene({ startTime: 0, endTime: 0.2 }), // micro (< 0.4)
      scene({ startTime: 5, endTime: 3 }), // reversed
    ];
    expect(selectScenes(scenes, brief())).toHaveLength(1);
  });

  it('defaultSceneScorer rewards speech and intent overlap', () => {
    const withSpeech = scene({ transcription: 'launch the product today' });
    const silent = scene({ transcription: '' });
    const b = brief({ intent: 'product launch' });
    expect(defaultSceneScorer(withSpeech, b)).toBeGreaterThan(defaultSceneScorer(silent, b));
  });

  it('scores stay within 0..1', () => {
    const s = scene({ transcription: 'product launch amazing', shotType: 'close-up' });
    const v = defaultSceneScorer(s, brief({ format: 'auto-edit', intent: 'product launch amazing' }));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('defaultSceneScorer - ranks on real fused importance when present', () => {
  it('importance is the spine: a higher-importance scene outranks a lower one', () => {
    const b = brief();
    expect(defaultSceneScorer(scene({ importance: 0.9 }), b))
      .toBeGreaterThan(defaultSceneScorer(scene({ importance: 0.2 }), b));
  });

  it('★ does NOT double-count speech: a SILENT high-importance scene beats a SPEAKING trivial one', () => {
    const silentImportant = scene({ importance: 0.9, transcription: '' });
    const speakingTrivial = scene({ importance: 0.15, transcription: 'blah blah words' });
    expect(defaultSceneScorer(silentImportant, brief()))
      .toBeGreaterThan(defaultSceneScorer(speakingTrivial, brief()));
  });

  it('with no intent tokens, the score IS the importance (no invented base added)', () => {
    expect(defaultSceneScorer(scene({ importance: 0.73 }), brief({ intent: undefined }))).toBe(0.73);
  });

  it('blends a small intent-relevance lift on top of importance (0.8*imp + 0.2*rel)', () => {
    const s = scene({ importance: 0.5, transcription: 'pricing tiers explained' });
    const matched = defaultSceneScorer(s, brief({ intent: 'pricing' }));
    const unmatched = defaultSceneScorer(s, brief({ intent: 'gardening' }));
    expect(matched).toBeCloseTo(0.6); // 0.8*0.5 + 0.2*1.0
    expect(unmatched).toBeCloseTo(0.4); // 0.8*0.5 + 0.2*0.0
    expect(matched).toBeGreaterThan(unmatched);
  });

  it('falls back to the heuristic (speech reward) ONLY when importance is absent', () => {
    const withSpeech = scene({ transcription: 'launch the product today' });
    const silent = scene({ transcription: '' });
    const b = brief({ intent: 'product launch' });
    expect(defaultSceneScorer(withSpeech, b)).toBeGreaterThan(defaultSceneScorer(silent, b));
  });
});

describe('defaultSceneScorer - intent matching is multilingual (Unicode-aware)', () => {
  it('★ matches a Devanagari (Hindi) intent that the old [a-z0-9] regex erased to nothing', () => {
    const b = brief({ intent: 'कैमरा' }); // "camera"
    const match = scene({ transcription: 'मेरे पास सबसे अच्छा कैमरा है' }); // "...the best camera..."
    const noMatch = scene({ transcription: 'यह एक कुर्सी है' }); // "this is a chair"
    expect(defaultSceneScorer(match, b)).toBeGreaterThan(defaultSceneScorer(noMatch, b));
  });

  it('matches code-mixed Hinglish intent against a code-mixed transcript', () => {
    const b = brief({ intent: 'कैमरा quality' }); // Hindi + English in one intent
    const match = scene({ transcription: 'yaar is phone ka कैमरा quality best hai' });
    const noMatch = scene({ transcription: 'aaj main ghar par hoon' });
    expect(defaultSceneScorer(match, b)).toBeGreaterThan(defaultSceneScorer(noMatch, b));
  });
});

describe('fitToDuration', () => {
  it('null target keeps everything', () => {
    const scored = selectScenes([scene({ endTime: 2 }), scene({ source: 'b', endTime: 3 })], brief());
    expect(fitToDuration(scored, null)).toHaveLength(2);
  });

  it('picks the best-scoring subset within budget and packs smaller after larger', () => {
    const s1 = scene({ source: 'a', startTime: 0, endTime: 8, transcription: 'speech here' });
    const s2 = scene({ source: 'b', startTime: 0, endTime: 5 });
    const s3 = scene({ source: 'c', startTime: 0, endTime: 2, transcription: 'more speech' });
    const picked = fitToDuration(selectScenes([s1, s2, s3], brief()), 10);
    const total = picked.reduce((a, p) => a + (p.scene.endTime - p.scene.startTime), 0);
    expect(total).toBeLessThanOrEqual(10);
    expect(picked.map((p) => p.scene.source).sort()).toEqual(['a', 'c']); // 8 + 2, skips the 5
  });

  it('trims the single best scene when no whole scene fits the budget', () => {
    const picked = fitToDuration(selectScenes([scene({ source: 'a', startTime: 10, endTime: 40 })], brief()), 5);
    expect(picked).toHaveLength(1);
    expect(picked[0].outOverride).toBe(15); // start 10 + budget 5
  });
});

describe('orderScenes', () => {
  it('faithful (ratio 1) orders chronologically by createdAt, blocks intact', () => {
    const a = scene({ source: 'x', startTime: 10, endTime: 12, createdAt: 200 });
    const b = scene({ source: 'y', startTime: 0, endTime: 2, createdAt: 100 });
    const ordered = orderScenes(selectScenes([a, b], brief()), 1);
    expect(ordered.map((s) => s.scene.source)).toEqual(['y', 'x']);
  });

  it('★ condensed (low ratio) leads with the highest-importance block, against source time', () => {
    const early = scene({ source: 'x', startTime: 0, endTime: 2, importance: 0.2, createdAt: 100 });
    const late = scene({ source: 'y', startTime: 0, endTime: 2, importance: 0.9, createdAt: 200 });
    const ordered = orderScenes(selectScenes([early, late], brief()), 0.2);
    expect(ordered[0].scene.source).toBe('y'); // importance wins when condensing
  });

  it('faithful keeps chronology even when a later block is more important', () => {
    const early = scene({ source: 'x', startTime: 0, endTime: 2, importance: 0.2, createdAt: 100 });
    const late = scene({ source: 'y', startTime: 0, endTime: 2, importance: 0.9, createdAt: 200 });
    const ordered = orderScenes(selectScenes([early, late], brief()), 1);
    expect(ordered.map((s) => s.scene.source)).toEqual(['x', 'y']); // chronology wins when faithful
  });

  it('★ never reorders WITHIN a source, even heavily condensed (no split thoughts)', () => {
    const s1 = scene({ source: 'pod', startTime: 0, endTime: 2, importance: 0.1, createdAt: 100 });
    const s2 = scene({ source: 'pod', startTime: 2, endTime: 4, importance: 0.9, createdAt: 100 });
    const ordered = orderScenes(selectScenes([s1, s2], brief()), 0.1);
    expect(ordered.map((s) => s.scene.startTime)).toEqual([0, 2]); // source order preserved
  });
});

describe('composeStoryline', () => {
  it('composes an ordered, valid, budget-respecting reel', () => {
    const scenes = [
      scene({ source: 'a', startTime: 0, endTime: 4, transcription: 'intro hook', shotType: 'close-up' }),
      scene({ source: 'b', startTime: 0, endTime: 4 }),
      scene({ source: 'c', startTime: 0, endTime: 4, transcription: 'the point' }),
    ];
    const story = composeStoryline(scenes, brief({ aspectRatio: '9:16', targetDurationSec: 8 }));
    expect(story.condensationRatio).toBeCloseTo(8 / 12); // kept 8s of 12s available
    expect(story.condensationRatio).toBeLessThan(1); // condensed, not faithful
    expect(story.renderTarget).toMatchObject({ width: 1080, height: 1920 });
    expect(story.totalDurationSec).toBeLessThanOrEqual(8);
    expect(story.clips[0].role).toBe('hook');
    expect(story.clips.map((c) => c.order)).toEqual(story.clips.map((_, i) => i));
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('empty input yields an empty but valid storyline (no crash)', () => {
    const story = composeStoryline([], brief());
    expect(story.clips).toHaveLength(0);
    expect(story.totalDurationSec).toBe(0);
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('is deterministic - identical input yields identical output', () => {
    const scenes = [
      scene({ source: 'a', startTime: 0, endTime: 3, transcription: 'one' }),
      scene({ source: 'b', startTime: 0, endTime: 3, transcription: 'two' }),
      scene({ source: 'c', startTime: 1, endTime: 4 }),
    ];
    const b = brief({ format: 'reel', targetDurationSec: 6 });
    expect(JSON.stringify(composeStoryline(scenes, b))).toBe(JSON.stringify(composeStoryline(scenes, b)));
  });

  it('trims a single over-budget scene into a valid one-clip storyline', () => {
    const story = composeStoryline(
      [scene({ source: 'a', startTime: 0, endTime: 60, transcription: 'talk' })],
      brief({ format: 'reel', targetDurationSec: 10 }),
    );
    expect(story.clips).toHaveLength(1);
    expect(story.clips[0].out).toBe(10);
    expect(story.totalDurationSec).toBe(10);
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('keeps a single-source podcast in chronological order for auto-edit', () => {
    const scenes = [
      scene({ source: 'pod.mp4', startTime: 20, endTime: 24, createdAt: 100 }),
      scene({ source: 'pod.mp4', startTime: 0, endTime: 4, createdAt: 100 }),
      scene({ source: 'pod.mp4', startTime: 10, endTime: 14, createdAt: 100 }),
    ];
    const story = composeStoryline(scenes, brief({ format: 'auto-edit' }));
    expect(story.clips.map((c) => c.in)).toEqual([0, 10, 20]);
  });

  it('fits a large pile of footage into a short reel and never exceeds the budget', () => {
    const scenes = Array.from({ length: 20 }, (_, i) =>
      scene({ source: `v${i}.mp4`, startTime: 0, endTime: 5, transcription: i % 2 ? 'talk' : '' }),
    );
    const story = composeStoryline(scenes, brief({ format: 'reel', targetDurationSec: 15 }));
    expect(story.totalDurationSec).toBeLessThanOrEqual(15);
    expect(story.clips.length).toBeLessThanOrEqual(3);
    expect(validateStoryline(story).valid).toBe(true);
  });
});
