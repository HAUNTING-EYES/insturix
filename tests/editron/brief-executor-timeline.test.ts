import { describe, it, expect } from 'vitest';
import {
  executeBrief,
  mapOriginalFrameToCutTimeline,
  mapCutFrameToOriginalFrame,
} from '../../lib/editron/services/brief-executor';
import { computeDecisionBudget, type BriefDecision, type CreativeBrief } from '../../lib/editron/services/creative-brief';
import type { GenreParameters } from '../../lib/editron/services/graph-query';

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

function genre(overrides: Partial<GenreParameters>): GenreParameters {
  return {
    pacing_tolerance: 5,
    energy_baseline: 0.4,
    transition_density: 8,
    graphic_density: 1,
    silence_tolerance: 1,
    zoom_budget: 4,
    sfx_density: 0.3,
    color_temperature: 0,
    formality: 0.5,
    ...overrides,
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
      params: {
        creativeDecisionType: 'transition_dissolve',
        transitionIntent: 'continuity-blend',
        transitionRelation: 'soft-topic-bridge',
        transitionCompatibilityHint: 'dissolve',
      },
    });
    expect(output.edl.decisions[1]).toMatchObject({
      type: 'graphic',
      technique: 'graphic_stat_counter',
      params: { creativeDecisionType: 'graphic_stat_counter', value: '42%', label: 'lift' },
    });
  });

  it('converts semantic MG facts into structure atoms before executeEDL', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_callout',
        targetWordIdx: 2,
        confidence: 0.9,
        reason: 'emphasis_word',
        params: {
          semanticAtoms: {
            concept: 'Selection Bias',
            claim: 'Comments overrepresent angry people',
            contrast: {
              from: 'quiet majority',
              to: 'angry commenters',
              relation: 'vs',
            },
            items: ['quiet majority', 'angry commenters'],
            annotation: 'Sample is skewed',
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions[0]).toMatchObject({
      type: 'graphic',
      technique: 'graphic_callout',
      params: {
        creativeDecisionType: 'graphic_callout',
        title: 'Selection Bias',
        body: 'Comments overrepresent angry people',
        from: 'quiet majority',
        to: 'angry commenters',
        relation: 'vs',
        items: ['quiet majority', 'angry commenters'],
        annotation: 'Sample is skewed',
      },
    });
  });

  it('lets semantic MG atoms overwrite empty registry defaults', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_callout',
        targetWordIdx: 2,
        confidence: 0.9,
        reason: 'emphasis_word',
        params: {
          title: '',
          body: '',
          semanticAtoms: {
            concept: 'Audience Bias',
            claim: 'The loudest comments distort the sample',
            evidencePhrase: 'only angry people comment',
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions[0].params).toEqual(expect.objectContaining({
      title: 'Audience Bias',
      body: 'The loudest comments distort the sample',
      contextPhrase: 'we grew fast',
      keyword: 'Audience Bias',
    }));
  });

  it('flattens quantity and truth atoms for downstream MG form resolving', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_stat_counter',
        targetWordIdx: 2,
        confidence: 0.9,
        reason: 'number_mentioned',
        params: {
          semanticAtoms: {
            quantity: {
              displayText: '1/3',
              label: 'claim being rejected',
              kind: 'fraction',
              denominator: 3,
              bounded: true,
            },
            relation: {
              kind: 'part_of_whole',
            },
            truth: {
              polarity: 'false',
              negated: true,
              refuted: true,
              warranted: true,
            },
            salience: 0.92,
            captionRedundancy: 0.15,
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions[0].params).toEqual(expect.objectContaining({
      value: '1/3',
      label: 'claim being rejected',
      quantityKind: 'fraction',
      denominator: 3,
      bounded: true,
      relationKind: 'part_of_whole',
      polarity: 'false',
      negated: true,
      refuted: true,
      warranted: true,
      salience: 0.92,
      captionRedundancy: 0.15,
    }));
  });

  it('normalizes nested semantic MG atoms into EDL params and content structure', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_callout',
        targetWordIdx: 2,
        confidence: 0.9,
        reason: 'emphasis_word',
        params: {
          semanticAtoms: {
            text: {
              primary: 'Growth Pattern',
              secondary: 'Compounding across cohorts',
              keyword: 'compounding',
            },
            series: {
              values: [12, 19, 31],
              labels: ['Jan', 'Feb', 'Mar'],
            },
            identity: {
              name: 'Hank Green',
              role: 'Creator',
              avatar: 'https://example.com/hank.jpg',
            },
            media: {
              role: 'logo',
              url: 'https://example.com/logo.png',
            },
            quote: {
              text: 'we grew fast',
              author: 'Hank Green',
            },
            truth: {
              polarity: 'true',
              warranted: true,
            },
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    const params = output.edl.decisions[0].params as Record<string, unknown>;

    expect(params).toEqual(expect.objectContaining({
      title: 'Growth Pattern',
      body: 'Compounding across cohorts',
      keyword: 'Growth Pattern',
      values: [12, 19, 31],
      labels: ['Jan', 'Feb', 'Mar'],
      name: 'Hank Green',
      avatar: 'https://example.com/hank.jpg',
      logo: 'https://example.com/logo.png',
      quote: 'we grew fast',
      author: 'Hank Green',
      polarity: 'true',
      warranted: true,
    }));
    expect(params.contentStructure).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        hasSeries: true,
        hasIdentity: true,
        hasMedia: true,
      }),
      parts: expect.arrayContaining([
        expect.objectContaining({ role: 'series-values', channel: 'series' }),
        expect.objectContaining({ role: 'name', channel: 'identity' }),
        expect.objectContaining({ role: 'avatar', channel: 'media' }),
        expect.objectContaining({ role: 'logo', channel: 'media' }),
        expect.objectContaining({ role: 'quote', channel: 'text' }),
      ]),
    }));
  });

  it('scales visible transition budget from signal-computed density instead of a fixed 2/min cap', () => {
    const calm = computeDecisionBudget(genre({
      transition_density: 4,
      energy_baseline: 0.25,
      sfx_density: 0.1,
      formality: 0.85,
    }), 120);
    const energetic = computeDecisionBudget(genre({
      transition_density: 20,
      energy_baseline: 0.72,
      sfx_density: 0.8,
      formality: 0.2,
    }), 120);

    expect(calm.transition.max).toBeLessThan(energetic.transition.max);
    expect(energetic.transition.max).toBeGreaterThan(4);
  });
});
