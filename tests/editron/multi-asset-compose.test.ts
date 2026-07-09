import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { ProjectAssetAnalysisDoc } from '@/lib/editron/storyline/asset-analysis-reader';
import {
  assetContextFromMediaAsset,
  buildAssetContextMap,
  composeStorylineFromAssetAnalyses,
  type MediaAssetLike,
} from '@/lib/editron/storyline/multi-asset-compose';
import type { EditronAssetContext, EditronSegment } from '@/lib/editron/storyline/scene-adapter';
import { validateStoryline } from '@/lib/editron/storyline/storyline';

function brief(over: Partial<ProductionBrief['output']> = {}): ProductionBrief {
  return {
    output: { platform: 'youtube', targetDurationSec: null, aspectRatio: '16:9', count: 1, format: 'auto-edit', ...over },
    brand: null,
    entryPoint: 'upload',
    sourceDurationSec: null,
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}
function seg(startMs: number, endMs: number, text = 'talk'): EditronSegment {
  return { startMs, endMs, transcript: { text, wordCount: text.split(' ').length } };
}
function analysisDoc(assetId: string, segments: EditronSegment[], words = true): ProjectAssetAnalysisDoc {
  return {
    projectId: 'p1',
    assetId,
    segmentAnalysis: { segments },
    rawFootageAnalysis: words
      ? { transcription: { words: [{ word: 'talk', startMs: segments[0]?.startMs ?? 0, endMs: (segments[0]?.startMs ?? 0) + 500 }] } }
      : undefined,
  };
}
function ctx(assetId: string, over: Partial<EditronAssetContext> = {}): EditronAssetContext {
  return { assetId, source: `${assetId}.mp4`, ...over };
}

describe('composeStorylineFromAssetAnalyses — multi-asset -> one storyline', () => {
  it('composes ONE ordered, valid storyline from TWO assets', () => {
    const docs = [
      analysisDoc('a', [seg(0, 4000), seg(4000, 8000)]),
      analysisDoc('b', [seg(0, 5000)]),
    ];
    const contexts = new Map([
      ['a', ctx('a', { createdAt: 100 })],
      ['b', ctx('b', { createdAt: 200 })],
    ]);
    const story = composeStorylineFromAssetAnalyses(docs, brief(), { assetContexts: contexts });

    expect(story.clips.length).toBe(3);
    // auto-edit orders by createdAt: asset a (100) before asset b (200)
    expect(story.clips.map((c) => c.source)).toEqual(['a.mp4', 'a.mp4', 'b.mp4']);
    expect(story.clips.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('skips Phase-1-only docs (no segments) but composes the rest', () => {
    const docs: ProjectAssetAnalysisDoc[] = [
      analysisDoc('ready', [seg(0, 4000)]),
      { projectId: 'p1', assetId: 'phase1', rawFootageAnalysis: { transcription: { words: [] } } }, // no segments
    ];
    const story = composeStorylineFromAssetAnalyses(docs, brief(), {
      assetContexts: new Map([['ready', ctx('ready')]]),
    });
    expect(story.clips.map((c) => c.source)).toEqual(['ready.mp4']);
  });

  it('empty input -> empty but valid storyline (no crash)', () => {
    const story = composeStorylineFromAssetAnalyses([], brief());
    expect(story.clips).toHaveLength(0);
    expect(validateStoryline(story).valid).toBe(true);
  });

  it('falls back to assetId as source when no context is supplied', () => {
    const story = composeStorylineFromAssetAnalyses([analysisDoc('lonely', [seg(0, 3000)])], brief());
    expect(story.clips[0].source).toBe('lonely');
  });

  it('is deterministic - identical input yields identical output', () => {
    const docs = [analysisDoc('a', [seg(0, 3000)]), analysisDoc('b', [seg(0, 3000)])];
    const opts = { assetContexts: new Map([['a', ctx('a', { createdAt: 1 })], ['b', ctx('b', { createdAt: 2 })]]) };
    expect(JSON.stringify(composeStorylineFromAssetAnalyses(docs, brief(), opts)))
      .toBe(JSON.stringify(composeStorylineFromAssetAnalyses(docs, brief(), opts)));
  });
});

describe('assetContextFromMediaAsset + buildAssetContextMap', () => {
  it('maps a MediaAsset to a Scene context (cachedUrl -> source, Date -> ms, first color)', () => {
    const m: MediaAssetLike = {
      assetId: 'a', cachedUrl: 'https://cdn/a.mp4', gcsPath: 'gs://x', thumbnailUrl: 't.jpg',
      createdAt: new Date(1000), dominantColors: ['', '#0af'],
    };
    expect(assetContextFromMediaAsset(m)).toEqual({
      assetId: 'a', source: 'https://cdn/a.mp4', thumbnailUrl: 't.jpg', createdAt: 1000,
      dominantColor: { hex: '#0af', name: '#0af' },
    });
  });

  it('falls back to gcsPath when cachedUrl is empty; leaves unknowns undefined', () => {
    const c = assetContextFromMediaAsset({ assetId: 'a', cachedUrl: '', gcsPath: 'gs://b' });
    expect(c.source).toBe('gs://b');
    expect(c.createdAt).toBeUndefined();
    expect(c.dominantColor).toBeUndefined();
  });

  it('buildAssetContextMap keys by assetId', () => {
    const map = buildAssetContextMap([{ assetId: 'a', cachedUrl: 'a.mp4' }, { assetId: 'b', cachedUrl: 'b.mp4' }]);
    expect(map.get('a')?.source).toBe('a.mp4');
    expect(map.size).toBe(2);
  });
});
