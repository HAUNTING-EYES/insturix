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
    const v = defaultSceneScorer(s, brief({ format: 'explainer', intent: 'product launch amazing' }));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
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
  it('orders auto-edit chronologically (createdAt, then startTime)', () => {
    const a = scene({ source: 'x', startTime: 10, endTime: 12, createdAt: 200 });
    const b = scene({ source: 'y', startTime: 0, endTime: 2, createdAt: 100 });
    const ordered = orderScenes(selectScenes([a, b], brief()), 'auto-edit');
    expect(ordered.map((s) => s.scene.source)).toEqual(['y', 'x']);
  });

  it('orders reel by score descending (hook first)', () => {
    const dull = scene({ source: 'x', startTime: 0, endTime: 2 });
    const punchy = scene({ source: 'y', startTime: 0, endTime: 2, transcription: 'wow' });
    const ordered = orderScenes(selectScenes([dull, punchy], brief({ format: 'reel' })), 'reel');
    expect(ordered[0].scene.source).toBe('y');
  });
});

describe('composeStoryline', () => {
  it('composes an ordered, valid, budget-respecting reel', () => {
    const scenes = [
      scene({ source: 'a', startTime: 0, endTime: 4, transcription: 'intro hook', shotType: 'close-up' }),
      scene({ source: 'b', startTime: 0, endTime: 4 }),
      scene({ source: 'c', startTime: 0, endTime: 4, transcription: 'the point' }),
    ];
    const story = composeStoryline(scenes, brief({ format: 'reel', aspectRatio: '9:16', targetDurationSec: 8 }));
    expect(story.format).toBe('reel');
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
