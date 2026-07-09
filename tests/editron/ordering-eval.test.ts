import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeStoryline } from '@/lib/editron/storyline/compose';
import {
  aggregateRecovery,
  sequenceRecovery,
} from '@/lib/editron/storyline/ordering-eval';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

describe('sequenceRecovery', () => {
  it('identical order -> exact, pairwise 1, hook match', () => {
    const r = sequenceRecovery(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(r.exactMatch).toBe(true);
    expect(r.pairwiseAccuracy).toBe(1);
    expect(r.hookMatch).toBe(true);
  });

  it('fully reversed -> pairwise 0, no hook match', () => {
    const r = sequenceRecovery(['c', 'b', 'a'], ['a', 'b', 'c']);
    expect(r.pairwiseAccuracy).toBe(0);
    expect(r.hookMatch).toBe(false);
    expect(r.exactMatch).toBe(false);
  });

  it('one adjacent swap -> partial pairwise, degrades gracefully', () => {
    // swap b,c: pairs (a,b)ok (a,c)ok (b,c)wrong -> 2/3
    const r = sequenceRecovery(['a', 'c', 'b'], ['a', 'b', 'c']);
    expect(r.pairwiseAccuracy).toBeCloseTo(2 / 3);
    expect(r.hookMatch).toBe(true);
  });

  it('scores only shared refs; counts the missing ones', () => {
    const r = sequenceRecovery(['a', 'b'], ['a', 'b', 'c']);
    expect(r.sharedCount).toBe(2);
    expect(r.missingCount).toBe(1);
    expect(r.pairwiseAccuracy).toBe(1); // a before b, correct
  });

  it('degenerate inputs are defined and neutral', () => {
    expect(sequenceRecovery([], []).pairwiseAccuracy).toBe(1);
    expect(sequenceRecovery(['a'], ['a']).exactMatch).toBe(true);
  });
});

describe('aggregateRecovery', () => {
  it('summarizes a suite of case recoveries', () => {
    const agg = aggregateRecovery([
      sequenceRecovery(['a', 'b', 'c'], ['a', 'b', 'c']), // exact
      sequenceRecovery(['a', 'c', 'b'], ['a', 'b', 'c']), // 2/3, hook ok
    ]);
    expect(agg.cases).toBe(2);
    expect(agg.exactMatchRate).toBe(0.5);
    expect(agg.hookMatchRate).toBe(1);
    expect(agg.meanPairwiseAccuracy).toBeCloseTo((1 + 2 / 3) / 2);
  });
});

// ─── End-to-end harness demo: score a baseline orderer without any LLM ───
// Proves the eval runs against real composer output. Establishes the floor the LLM must beat;
// we assert the SCORER produces valid metrics, not that the baseline is good.

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a.mp4', startTime: 0, endTime: 3,
    objects: [], faces: [], detectedText: [], transcription: '',
    ...over,
  });
}
function brief(output: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return {
    output: { platform: 'tiktok', format: 'reel', count: 1, aspectRatio: '9:16', targetDurationSec: 12, ...output },
    brand: null,
    entryPoint: 'upload',
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}

describe('eval harness demo - deterministic baseline on a synthetic case', () => {
  // Faithful (target null) so the produced order is deterministic chronological - the demo
  // proves the harness runs on REAL composer output and the scorer computes correctly. The
  // LLM pass (scored later) is what must beat a narrative reference; here we assert mechanics.
  const s1 = scene({ source: 'a', startTime: 0, endTime: 3, createdAt: 400, importance: 0.9 });
  const s2 = scene({ source: 'b', startTime: 0, endTime: 3, createdAt: 100, importance: 0.3 });
  const s3 = scene({ source: 'c', startTime: 0, endTime: 3, createdAt: 300, importance: 0.6 });
  const s4 = scene({ source: 'd', startTime: 0, endTime: 3, createdAt: 200, importance: 0.5 });

  it('scores the composer order against the chronological reference (exact match)', () => {
    const story = composeStoryline([s1, s2, s3, s4], brief({ targetDurationSec: null }));
    const produced = story.clips.map((c) => c.sourceRef);
    const chronoReference = [s2.id, s4.id, s3.id, s1.id]; // by createdAt 100,200,300,400
    const r = sequenceRecovery(produced, chronoReference);
    expect(r.sharedCount).toBe(4);
    expect(r.exactMatch).toBe(true);
    expect(r.pairwiseAccuracy).toBe(1);
  });

  it('detects a poor match against an importance-first reference', () => {
    const story = composeStoryline([s1, s2, s3, s4], brief({ targetDurationSec: null }));
    const produced = story.clips.map((c) => c.sourceRef);
    const importanceReference = [s1.id, s3.id, s4.id, s2.id]; // desc importance = reverse of chrono
    const r = sequenceRecovery(produced, importanceReference);
    expect(r.pairwiseAccuracy).toBe(0); // faithful order is the exact reverse of importance order
    expect(r.hookMatch).toBe(false);
  });
});
