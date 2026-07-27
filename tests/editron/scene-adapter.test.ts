import { describe, expect, it } from 'vitest';

import {
  type EditronAssetContext,
  type EditronSegment,
  type EditronWord,
  sceneFromSegment,
  scenesFromAssets,
  scenesFromSegments,
} from '@/lib/editron/storyline/scene-adapter';

function asset(over: Partial<EditronAssetContext> = {}): EditronAssetContext {
  return { assetId: 'asset-1', source: 'https://cdn/a.mp4', createdAt: 1000, ...over };
}
function seg(over: Partial<EditronSegment> = {}): EditronSegment {
  return { startMs: 2000, endMs: 5000, transcript: { text: 'hello world', wordCount: 2 }, ...over };
}

describe('sceneFromSegment - core mapping', () => {
  it('converts ms -> seconds for the segment window', () => {
    const s = sceneFromSegment(seg({ startMs: 2000, endMs: 5000 }), asset());
    expect(s.startTime).toBe(2);
    expect(s.endTime).toBe(5);
    expect(s.durationSec).toBe(3);
  });

  it('maps transcript text and derives hasSpeech from wordCount', () => {
    expect(sceneFromSegment(seg({ transcript: { text: 'hi', wordCount: 1 } }), asset()).hasSpeech).toBe(true);
    expect(sceneFromSegment(seg({ transcript: { text: '', wordCount: 0 } }), asset()).hasSpeech).toBe(false);
    expect(sceneFromSegment(seg({ transcript: null }), asset()).hasSpeech).toBe(false);
  });

  it('★ fills detectedText from the semanticVisual.ocrText channel (not dropped)', () => {
    const s = sceneFromSegment(
      seg({ semanticVisual: { ocrText: ['Revenue', '  ', '$1.2M'] } }),
      asset(),
    );
    expect(s.detectedText).toEqual(['Revenue', '$1.2M']); // trimmed + empties dropped
  });

  it('leaves objects/faces EMPTY (SegmentRecord carries counts, not labels)', () => {
    const s = sceneFromSegment(seg({ visual: { objectCount: 5, faceCount: 2 } }), asset());
    expect(s.objects).toEqual([]);
    expect(s.faces).toEqual([]);
  });

  it('denormalizes asset context onto the scene', () => {
    const s = sceneFromSegment(
      seg(),
      asset({ aspectRatio: '9:16', thumbnailUrl: 't.jpg', createdAt: 42, dominantColor: { hex: '#000', name: 'black' } }),
    );
    expect(s.aspectRatio).toBe('9:16');
    expect(s.thumbnailUrl).toBe('t.jpg');
    expect(s.createdAt).toBe(42);
    expect(s.dominantColor).toEqual({ hex: '#000', name: 'black' });
  });

  it('uses asset.source, falling back to assetId when source is empty/null', () => {
    expect(sceneFromSegment(seg(), asset({ source: 'https://cdn/x.mp4' })).source).toBe('https://cdn/x.mp4');
    expect(sceneFromSegment(seg(), asset({ source: '' })).source).toBe('asset-1');
    expect(sceneFromSegment(seg(), asset({ source: null })).source).toBe('asset-1');
  });
});

describe('sceneFromSegment - shotType heuristic (INVENTED, flagged)', () => {
  it('maps main-subject height to shot tightness; unknown when absent/null-visual', () => {
    const st = (mainSubjectHeight: number | null | undefined) =>
      sceneFromSegment(seg({ visual: { mainSubjectHeight } }), asset()).shotType;
    expect(st(0.7)).toBe('close-up');
    expect(st(0.4)).toBe('medium');
    expect(st(0.2)).toBe('long');
    expect(st(0.05)).toBe('wide');
    expect(st(undefined)).toBe('unknown');
    expect(sceneFromSegment(seg({ visual: null }), asset()).shotType).toBe('unknown');
  });
});

describe('sceneFromSegment - emotions', () => {
  it('emits a face-driven emotion with clamped confidence; empty when no faceEmotion', () => {
    expect(sceneFromSegment(seg({ visual: { faceEmotion: 'joy', significance: 1.5 } }), asset()).emotions)
      .toEqual([{ emotion: 'joy', confidence: 1 }]); // significance clamped to 1
    expect(sceneFromSegment(seg({ visual: { faceEmotion: null } }), asset()).emotions).toEqual([]);
    expect(sceneFromSegment(seg({ visual: null }), asset()).emotions).toEqual([]);
  });
});

describe('sceneFromSegment - word slicing', () => {
  const words: EditronWord[] = [
    { word: 'a', startMs: 500, endMs: 1500 }, // before window (ends at 1.5, window starts 2.0) - excluded
    { word: 'b', startMs: 2100, endMs: 2600, confidence: 0.9 }, // inside
    { word: 'c', startMs: 4800, endMs: 5200 }, // straddles end - overlaps, included
    { word: 'd', startMs: 6000, endMs: 6500 }, // after window - excluded
  ];
  it('keeps only words overlapping [start,end), remapped to seconds, confidence preserved', () => {
    const s = sceneFromSegment(seg({ startMs: 2000, endMs: 5000 }), asset(), words);
    expect(s.transcriptionWords?.map((w) => w.word)).toEqual(['b', 'c']);
    expect(s.transcriptionWords?.[0]).toEqual({ word: 'b', start: 2.1, end: 2.6, confidence: 0.9 });
    expect(s.transcriptionWords?.[1].confidence).toBeUndefined(); // no confidence on 'c'
  });
  it('empty word list when none supplied (no crash)', () => {
    expect(sceneFromSegment(seg(), asset()).transcriptionWords).toEqual([]);
  });
});

describe('sceneFromSegment - null/adversarial robustness', () => {
  it('all optional channels null -> valid Scene, no crash, honest empties', () => {
    const s = sceneFromSegment(
      { startMs: 0, endMs: 3000, transcript: null, visual: null, vocal: null, semanticVisual: null },
      asset(),
    );
    expect(s.detectedText).toEqual([]);
    expect(s.emotions).toEqual([]);
    expect(s.shotType).toBe('unknown');
    expect(s.transcription).toBe('');
    expect(s.hasSpeech).toBe(false);
    expect(s.durationSec).toBe(3);
  });

  it('is deterministic - identical input yields an identical scene (stable id)', () => {
    const a = sceneFromSegment(seg(), asset());
    const b = sceneFromSegment(seg(), asset());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('scenesFromSegments - batch', () => {
  it('maps each segment and drops non-positive windows', () => {
    const scenes = scenesFromSegments(
      [
        seg({ startMs: 0, endMs: 2000 }),
        seg({ startMs: 2000, endMs: 2000 }), // zero window - dropped
        seg({ startMs: 6000, endMs: 3000 }), // reversed - dropped
        seg({ startMs: 3000, endMs: 5000 }),
      ],
      asset(),
    );
    expect(scenes).toHaveLength(2);
    expect(scenes.map((s) => s.startTime)).toEqual([0, 3]);
  });

  it('empty input -> empty output (no crash)', () => {
    expect(scenesFromSegments([], asset())).toEqual([]);
  });
});

describe('scenesFromAssets - multi-media -> one combined Scene[]', () => {
  it('concatenates scenes from many assets, each keeping its own source', () => {
    const scenes = scenesFromAssets([
      { segments: [seg({ startMs: 0, endMs: 2000 })], asset: asset({ assetId: 'a', source: 'a.mp4' }) },
      { segments: [seg({ startMs: 0, endMs: 3000 }), seg({ startMs: 3000, endMs: 6000 })], asset: asset({ assetId: 'b', source: 'b.mp4' }) },
    ]);
    expect(scenes).toHaveLength(3);
    expect(scenes.map((s) => s.source)).toEqual(['a.mp4', 'b.mp4', 'b.mp4']);
  });

  it('dedupes identical scenes across assets (same source + window = same id)', () => {
    const dup = { segments: [seg({ startMs: 0, endMs: 2000 })], asset: asset({ assetId: 'a', source: 'a.mp4' }) };
    expect(scenesFromAssets([dup, dup])).toHaveLength(1);
  });

  it('drops per-asset invalid windows and handles empty input', () => {
    expect(scenesFromAssets([])).toEqual([]);
    const scenes = scenesFromAssets([
      { segments: [seg({ startMs: 5, endMs: 5 })], asset: asset({ assetId: 'a', source: 'a.mp4' }) }, // zero window
      { segments: [seg({ startMs: 0, endMs: 2000 })], asset: asset({ assetId: 'b', source: 'b.mp4' }) },
    ]);
    expect(scenes.map((s) => s.source)).toEqual(['b.mp4']);
  });
});

describe('sceneFromSegment - analysis signals (the report card)', () => {
  it('maps moment-weight finalWeight -> importance (+ confidence)', () => {
    const s = sceneFromSegment(seg({ weight: { finalWeight: 0.82, confidence: 'high' } }), asset());
    expect(s.importance).toBe(0.82);
    expect(s.importanceConfidence).toBe('high');
  });

  it('★ importance is undefined (NOT 0) when no weight is present - honest "no signal"', () => {
    expect(sceneFromSegment(seg({ weight: null }), asset()).importance).toBeUndefined();
    expect(sceneFromSegment(seg(), asset()).importance).toBeUndefined();
    expect(sceneFromSegment(seg({ weight: { finalWeight: null } }), asset()).importance).toBeUndefined();
  });

  it('clamps out-of-range importance/salience into 0..1', () => {
    const s = sceneFromSegment(
      seg({ weight: { finalWeight: 1.4 }, semanticVisual: { salience: -0.2 } }),
      asset(),
    );
    expect(s.importance).toBe(1);
    expect(s.salience).toBe(0);
  });

  it('maps the vocal channel: energy, arousal, and valence LABEL (not a number)', () => {
    const s = sceneFromSegment(
      seg({ vocal: { energy: 0.7, emotionIntensity: 0.6, emotionalValence: 'positive' } }),
      asset(),
    );
    expect(s.vocalEnergy).toBe(0.7);
    expect(s.vocalArousal).toBe(0.6);
    expect(s.vocalValence).toBe('positive');
  });

  it('★ maps primaryVisualMode to visualMode, NOT description (description stays unset)', () => {
    const s = sceneFromSegment(seg({ semanticVisual: { primaryVisualMode: 'screen-share' } }), asset());
    expect(s.visualMode).toBe('screen-share');
    expect(s.description).toBeUndefined();
  });

  it('maps visual action/motion + semanticVisual salience/visuallyExplains', () => {
    const s = sceneFromSegment(
      seg({
        visual: { actionType: 'demonstrating', motionIntensity: 0.5 },
        semanticVisual: { salience: 0.9, visuallyExplains: true },
      }),
      asset(),
    );
    expect(s.actionType).toBe('demonstrating');
    expect(s.motionIntensity).toBe(0.5);
    expect(s.salience).toBe(0.9);
    expect(s.visuallyExplains).toBe(true);
  });

  it('all signal channels absent -> all signal fields undefined (no fabrication)', () => {
    const s = sceneFromSegment({ startMs: 0, endMs: 3000 }, asset());
    for (const v of [
      s.importance, s.importanceConfidence, s.visualMode, s.salience, s.visuallyExplains,
      s.actionType, s.motionIntensity, s.vocalEnergy, s.vocalArousal, s.vocalValence,
    ]) {
      expect(v).toBeUndefined();
    }
  });
});
