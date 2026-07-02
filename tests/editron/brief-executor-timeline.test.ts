import { describe, it, expect } from 'vitest';
import {
  executeBrief,
  mapOriginalFrameToCutTimeline,
  mapCutFrameToOriginalFrame,
} from '../../lib/editron/services/brief-executor';
import {
  CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT,
  CREATIVE_BRIEF_RESPONSE_SCHEMA,
  computeDecisionBudget,
  validateAndGate,
  type BriefDecision,
  type CreativeBrief,
} from '../../lib/editron/services/creative-brief';
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

describe('Creative Brief fact authority contract', () => {
  it('keeps Gemini in semantic-context mode, not final overlay authority', () => {
    expect(CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT).toContain('not the final overlay planner or renderer');
    expect(CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT).toContain('decision.type as a compatibility family tag only');
    expect(JSON.stringify(CREATIVE_BRIEF_RESPONSE_SCHEMA)).toContain('semanticAtoms');
  });

  it('marks executable-looking brief labels as semantic-context evidence during validation', () => {
    const brief = validateAndGate({
      video_understanding: {},
      narrative_arc: [],
      decisions: [
        {
          type: 'graphic_keyword_highlight',
          target_word_idx: 1,
          confidence: 0.82,
          reason: 'emphasis_word',
          params: { text: 'Psychology.' },
        },
        {
          type: 'graphic_callout',
          target_word_idx: 2,
          confidence: 0.88,
          reason: 'emphasis_word',
          params: {
            semanticAtoms: {
              concept: 'psychology',
              evidencePhrase: 'grew fast',
            },
          },
        },
      ],
      audio_design: {},
      caption_style: 'key_phrases',
      overall_pacing: 'balanced',
    }, 0, null, 'speech');

    expect(brief?.decisions).toHaveLength(2);
    expect(brief?.decisions[0].params.creativeBriefFactContract).toEqual(expect.objectContaining({
      role: 'semantic-context',
      executableAuthority: false,
      finalAuthority: 'native-planner',
      semanticAtomsPresent: false,
      groundingRequired: true,
    }));
    expect(brief?.decisions[1].params.creativeBriefFactContract).toEqual(expect.objectContaining({
      semanticAtomsPresent: true,
    }));
  });
});
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
  it('recovers a missing brief coordinate from grounded semantic evidence', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_callout',
        targetWordIdx: -1,
        confidence: 0.91,
        reason: 'emphasis_word',
        params: {
          semanticAtoms: {
            claim: 'The growth happened quickly',
            evidencePhrase: 'grew fast',
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions).toHaveLength(1);
    expect(output.stats.resolvedToFrame).toBe(1);
    expect(output.stats.recoveredSemanticAnchor).toBe(1);
    expect(output.edl.decisions[0]).toEqual(expect.objectContaining({
      frame: 9,
      source: 'creative-brief:emphasis_word:semantic-anchor',
    }));
    expect(output.edl.decisions[0].params).toEqual(expect.objectContaining({
      contextPhrase: 'we grew fast',
      creativeBriefSemanticCandidate: expect.objectContaining({
        timing: expect.objectContaining({
          source: 'semantic-anchor',
          targetWordIdx: -1,
          resolvedWordIdx: 1,
        }),
      }),
    }));
  });

  it('recovers a stale raw-video word index from grounded edited-transcript evidence', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'caption_emphasis',
        targetWordIdx: 999,
        confidence: 0.86,
        reason: 'emphasis_word',
        params: {
          text: 'grew fast',
          semanticAtoms: {
            text: { phrase: 'grew fast' },
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions).toHaveLength(1);
    expect(output.stats.recoveredSemanticAnchor).toBe(1);
    expect(output.edl.decisions[0]).toEqual(expect.objectContaining({
      frame: 9,
      source: 'creative-brief:emphasis_word:semantic-anchor',
    }));
  });

  it('does not invent timing when an invalid brief coordinate has no transcript-backed evidence', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'graphic_callout',
        targetWordIdx: -1,
        confidence: 0.88,
        reason: 'emphasis_word',
        params: {
          semanticAtoms: {
            claim: 'A useful but ungrounded fact',
            evidencePhrase: 'not present in transcript',
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    expect(output.edl.decisions).toHaveLength(0);
    expect(output.stats.resolvedToFrame).toBe(0);
    expect(output.stats.recoveredSemanticAnchor).toBe(0);
    expect(output.stats.skippedOutOfRange).toBe(1);
  });

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
        creativeDecisionAuthority: 'semantic-context',
        creativeBriefSemanticCandidate: expect.objectContaining({
          family: 'camera',
          executableAuthority: false,
          compatibilityHints: expect.objectContaining({
            zoomKind: 'pull-back',
          }),
        }),
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

    const params = output.edl.decisions[0].params as Record<string, unknown>;

    expect(params).toEqual(expect.objectContaining({
      creativeDecisionType: 'zoom_pull_back',
      creativeDecisionAuthority: 'semantic-context',
    }));
    expect(params).not.toHaveProperty('scaleFrom');
    expect(params).not.toHaveProperty('scaleTo');
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
    const transitionParams = output.edl.decisions[0].params as Record<string, unknown>;
    const graphicParams = output.edl.decisions[1].params as Record<string, unknown>;

    expect(output.edl.decisions[0]).toMatchObject({
      type: 'transition',
      technique: 'transition_dissolve',
      params: {
        creativeDecisionType: 'transition_dissolve',
        creativeDecisionAuthority: 'semantic-context',
        transitionIntent: 'continuity-blend',
        transitionRelation: 'soft-topic-bridge',
        creativeBriefSemanticCandidate: expect.objectContaining({
          family: 'transition',
          executableAuthority: false,
          compatibilityHints: expect.objectContaining({
            transitionStyle: 'dissolve',
          }),
        }),
      },
    });
    expect(transitionParams).not.toHaveProperty('transitionCompatibilityHint');
    expect(transitionParams).not.toHaveProperty('transitionType');

    expect(output.edl.decisions[1]).toMatchObject({
      type: 'graphic',
      technique: 'graphic_stat_counter',
      params: {
        creativeDecisionType: 'graphic_stat_counter',
        creativeDecisionAuthority: 'semantic-context',
        value: '42%',
        label: 'lift',
        creativeBriefSemanticCandidate: expect.objectContaining({
          family: 'graphic',
          executableAuthority: false,
          compatibilityHints: expect.objectContaining({
            graphicKind: 'stat-counter',
          }),
        }),
      },
    });
    expect(graphicParams).not.toHaveProperty('graphicType');
  });

  it('keeps SFX labels as semantic compatibility hints only', () => {
    const output = executeBrief({
      brief: briefWith([{
        type: 'sfx_whoosh',
        targetWordIdx: 1,
        confidence: 0.8,
        reason: 'emphasis_word',
        params: {
          sfxType: 'whoosh',
          sfxCue: 'whoosh',
          audioDescription: 'whoosh rise',
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    const params = output.edl.decisions[0].params as Record<string, unknown>;

    expect(params).toEqual(expect.objectContaining({
      creativeDecisionType: 'sfx_whoosh',
      creativeDecisionAuthority: 'semantic-context',
      creativeBriefSemanticCandidate: expect.objectContaining({
        family: 'audio',
        executableAuthority: false,
        compatibilityHints: expect.objectContaining({
          sfxToken: 'whoosh',
        }),
        semanticFacts: expect.objectContaining({
          audioIntent: 'whoosh rise',
        }),
      }),
    }));
    expect(params).not.toHaveProperty('sfxType');
    expect(params).not.toHaveProperty('sfxCue');
    expect(params).not.toHaveProperty('audioDescription');
  });

  it('wraps Creative Brief labels into semantic facts without executable form authority', () => {
    const output = executeBrief({
      brief: briefWith([
        {
          type: 'transition_whip_pan',
          targetWordIdx: 1,
          confidence: 0.86,
          reason: 'topic_shift',
          params: { transitionType: 'whip-pan', durationMs: 300 },
        },
        {
          type: 'zoom_push',
          targetWordIdx: 2,
          confidence: 0.83,
          reason: 'vocal_peak',
          params: { zoomType: 'push', scaleFrom: 1, scaleTo: 1.12 },
        },
        {
          type: 'caption_emphasis',
          targetWordIdx: 2,
          confidence: 0.78,
          reason: 'emphasis_word',
          params: { text: 'fast' },
        },
        {
          type: 'sfx_impact',
          targetWordIdx: 1,
          confidence: 0.76,
          reason: 'beat_accent',
          params: { sfxType: 'impact', soundDescription: 'tight hit' },
        },
      ]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    const byTechnique = new Map(output.edl.decisions.map((decision) => [decision.technique, decision]));
    const transitionParams = byTechnique.get('transition_whip_pan')?.params as Record<string, unknown>;
    const zoomParams = byTechnique.get('zoom_push')?.params as Record<string, unknown>;
    const captionParams = byTechnique.get('caption_emphasis')?.params as Record<string, unknown>;
    const sfxParams = byTechnique.get('sfx_impact')?.params as Record<string, unknown>;

    expect(transitionParams.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      compatibilityHints: expect.objectContaining({ transitionStyle: 'whip-pan' }),
      facts: expect.arrayContaining([
        expect.objectContaining({ kind: 'topic-shift', source: 'reason' }),
        expect.objectContaining({ kind: 'topic-shift', source: 'type', text: 'motion-transfer' }),
      ]),
      semanticFacts: expect.objectContaining({
        primaryFactKind: 'topic-shift',
        semanticJob: 'mark-boundary',
      }),
    }));
    expect(transitionParams).not.toHaveProperty('transitionType');
    expect(transitionParams).not.toHaveProperty('durationMs');

    expect(zoomParams.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      compatibilityHints: expect.objectContaining({ zoomKind: 'push' }),
      facts: expect.arrayContaining([
        expect.objectContaining({ kind: 'emotional-beat', source: 'reason' }),
        expect.objectContaining({ kind: 'camera-intent', source: 'type' }),
      ]),
      semanticFacts: expect.objectContaining({ semanticJob: 'heighten-beat' }),
    }));
    expect(zoomParams).not.toHaveProperty('zoomType');
    expect(zoomParams).not.toHaveProperty('scaleFrom');
    expect(zoomParams).not.toHaveProperty('scaleTo');

    expect(captionParams.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      compatibilityHints: expect.objectContaining({ captionKind: 'emphasis' }),
      facts: expect.arrayContaining([
        expect.objectContaining({ kind: 'caption-emphasis', source: 'reason' }),
      ]),
      semanticFacts: expect.objectContaining({ semanticJob: 'guide-reading' }),
    }));

    expect(sfxParams.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      compatibilityHints: expect.objectContaining({ sfxToken: 'impact' }),
      facts: expect.arrayContaining([
        expect.objectContaining({ kind: 'audio-cue', source: 'reason' }),
        expect.objectContaining({ kind: 'audio-cue', source: 'type' }),
      ]),
      semanticFacts: expect.objectContaining({ semanticJob: 'punctuate-beat' }),
    }));
    expect(sfxParams).not.toHaveProperty('sfxType');
    expect(sfxParams).not.toHaveProperty('soundDescription');
  });

  it('strips Creative Brief render-authority params while preserving facts and compatibility hints', () => {
    const output = executeBrief({
      brief: briefWith([
        {
          type: 'graphic_callout',
          targetWordIdx: 2,
          confidence: 0.9,
          reason: 'emphasis_word',
          params: {
            graphicType: 'keyword-box',
            layout: 'top-right',
            keyframes: [{ frame: 0, scale: 1.4 }],
            fontSize: 140,
            color: '#ffffff',
            assetId: 'unsafe-render-asset',
            durationFrames: 300,
            semanticAtoms: {
              claim: 'Comments overrepresent angry people',
              evidencePhrase: 'we grew fast',
            },
          },
        },
        {
          type: 'sfx_impact',
          targetWordIdx: 1,
          confidence: 0.82,
          reason: 'beat_accent',
          params: {
            sfxType: 'impact',
            volume: 1,
            sfxAssetId: 'unsafe-sfx-asset',
            assetQuery: 'cinematic impact',
            soundDescription: 'huge hit',
          },
        },
      ]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    const byTechnique = new Map(output.edl.decisions.map((decision) => [decision.technique, decision]));
    const graphicParams = byTechnique.get('graphic_callout')?.params as Record<string, unknown>;
    const sfxParams = byTechnique.get('sfx_impact')?.params as Record<string, unknown>;

    expect(graphicParams).toEqual(expect.objectContaining({
      creativeDecisionAuthority: 'semantic-context',
      semanticAtoms: expect.objectContaining({
        claim: 'Comments overrepresent angry people',
        evidencePhrase: 'we grew fast',
      }),
      creativeBriefSemanticCandidate: expect.objectContaining({
        executableAuthority: false,
        compatibilityHints: expect.objectContaining({ graphicKind: 'callout' }),
      }),
    }));
    for (const key of ['graphicType', 'layout', 'keyframes', 'fontSize', 'color', 'assetId', 'durationFrames']) {
      expect(graphicParams).not.toHaveProperty(key);
    }

    expect(sfxParams.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      compatibilityHints: expect.objectContaining({ sfxToken: 'impact' }),
    }));
    for (const key of ['sfxType', 'volume', 'sfxAssetId', 'assetQuery', 'soundDescription']) {
      expect(sfxParams).not.toHaveProperty(key);
    }
  });

  it('classifies MG semantic atoms into fact kinds before form resolving', () => {
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
            relation: {
              from: 'quiet majority',
              to: 'angry commenters',
              kind: 'contrast',
            },
            items: ['quiet majority', 'angry commenters'],
            evidencePhrase: 'we grew fast',
          },
        },
      }]),
      transcription,
      fps: 30,
      totalDurationMs: 3000,
    });

    const params = output.edl.decisions[0].params as Record<string, unknown>;
    expect(params.creativeBriefSemanticCandidate).toEqual(expect.objectContaining({
      executableAuthority: false,
      facts: expect.arrayContaining([
        expect.objectContaining({ kind: 'claim', source: 'semanticAtoms' }),
        expect.objectContaining({ kind: 'term', source: 'semanticAtoms' }),
        expect.objectContaining({ kind: 'contrast', source: 'semanticAtoms' }),
        expect.objectContaining({ kind: 'process', source: 'semanticAtoms' }),
      ]),
      semanticFacts: expect.objectContaining({
        primaryFactKind: 'claim',
        semanticJob: 'show-relationship',
      }),
    }));
    expect(params).not.toHaveProperty('graphicType');
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
