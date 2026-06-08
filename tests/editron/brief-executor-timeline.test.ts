import { describe, it, expect } from 'vitest';
import {
  executeBrief,
  mapOriginalFrameToCutTimeline,
  mapCutFrameToOriginalFrame,
} from '../../lib/editron/services/brief-executor';
import type { BriefDecision, CreativeBrief } from '../../lib/editron/services/creative-brief';

const transcription = [
  { word: 'we', startMs: 0, endMs: 250 },
  { word: 'grew', startMs: 300, endMs: 550 },
  { word: 'fast', startMs: 600, endMs: 900 },
];

function briefWith(decisions: BriefDecision[]): CreativeBrief {
  return {
    videoUnderstanding: {
      primaryContent: 'business update',
      shotScale: 'medium',
      lighting: 'studio',
      productionQuality: 0.8,
      environment: 'office',
      speakerCount: 1,
      hasBRoll: false,
    },
    narrativeArc: [],
    decisions,
    audioDesign: {
      ambientBed: 'none',
      duckingProfile: 'standard_speech',
    },
    captionStyle: 'key_phrases',
    overallPacing: 'balanced',
    contentMode: 'speech',
    modelVersion: 'test',
    processingTimeMs: 0,
  };
}

// Timeline-coordinate fix (2026-06-03): MG decision frames are on the CUT timeline; V-JEPA /
// Wav2Vec segments are on the ORIGINAL timeline. signalsAtFrame must map cut→original before the
// lookup, or later decisions land in removed-silence gaps and starve (the 6/13 missing-signal bug).
describe('cut <-> original frame mapping', () => {
  // Two kept clips with a removed silence gap (original 200..500) between them:
  //   original [100,200) -> cut [0,100)
  //   original [500,600) -> cut [100,200)
  const clips = [
    { from: 0, durationInFrames: 100, sourceStartFrame: 100 },
    { from: 100, durationInFrames: 100, sourceStartFrame: 500 },
  ];
  const fps = 30;

  it('maps a cut frame back to the correct original frame', () => {
    expect(mapCutFrameToOriginalFrame(0, clips)).toBe(100);
    expect(mapCutFrameToOriginalFrame(50, clips)).toBe(150);
    expect(mapCutFrameToOriginalFrame(100, clips)).toBe(500); // crosses the removed gap
    expect(mapCutFrameToOriginalFrame(150, clips)).toBe(550);
    expect(mapCutFrameToOriginalFrame(199, clips)).toBe(599);
  });

  it('round-trips: original -> cut -> original is identity inside clips', () => {
    for (const orig of [100, 150, 199, 500, 550, 599]) {
      const cut = mapOriginalFrameToCutTimeline(orig, clips, fps);
      expect(cut, `original ${orig} should map into the cut timeline`).not.toBeNull();
      expect(mapCutFrameToOriginalFrame(cut!.frame, clips)).toBe(orig);
    }
  });

  it('returns null for a cut frame beyond all clips', () => {
    expect(mapCutFrameToOriginalFrame(999, clips)).toBeNull();
  });

  it('demonstrates the bug it fixes: the raw cut frame != the true original time', () => {
    // Cut frame 150 is really original 550 (~13.3s later at 30fps). Querying segments with the raw
    // 150 — as the old code did — lands in the removed gap and misses. The map corrects it.
    const mapped = mapCutFrameToOriginalFrame(150, clips);
    expect(mapped).toBe(550);
    expect(mapped).not.toBe(150);
  });
});

describe('brief decision conversion', () => {
  it('keeps Path E zoom as intent instead of stamping legacy zoom subtype', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'zoom_pull_back',
        targetWordIdx: 1,
        confidence: 0.9,
        reason: 'narrative_resolve',
        params: {},
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions).toHaveLength(1);
    expect(output.edl.decisions[0]).toMatchObject({
      type: 'zoom',
      technique: 'zoom_pull_back',
      params: {
        creativeDecisionType: 'zoom_pull_back',
      },
    });
  });

  it('strips explicit brief form params so atomic resolvers own zoom form', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'zoom_pull_back',
        targetWordIdx: 1,
        confidence: 0.9,
        reason: 'narrative_resolve',
        params: { scaleFrom: 1.2, scaleTo: 1.03 },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions[0].params).toEqual({
      creativeDecisionType: 'zoom_pull_back',
    });
  });

  it('keeps transition and graphic decisions as intent/content, not preset form labels', () => {
    const output = executeBrief({
      brief: briefWith([
        {
          type: 'transition_dissolve',
          targetWordIdx: 1,
          confidence: 0.8,
          reason: 'topic_shift',
          params: {},
        },
        {
          type: 'graphic_stat_counter',
          targetWordIdx: 2,
          confidence: 0.85,
          reason: 'number_mentioned',
          params: { value: '42%', label: 'lift' },
        },
      ]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions).toHaveLength(2);
    expect(output.edl.decisions[0]).toMatchObject({
      type: 'transition',
      technique: 'transition_dissolve',
      params: { creativeDecisionType: 'transition_dissolve' },
    });
    expect(output.edl.decisions[1]).toMatchObject({
      type: 'graphic',
      technique: 'graphic_stat_counter',
      params: { creativeDecisionType: 'graphic_stat_counter', value: '42%', label: 'lift' },
    });
  });
});
