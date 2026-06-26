import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbState = vi.hoisted(() => ({
  projectDoc: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => mockDbState.projectDoc),
    })),
  })),
}));

import { executeEDL } from '../../lib/editron/services/edl-executor';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';

describe('EDL Path E+D merge', () => {
  beforeEach(() => {
    mockDbState.projectDoc = null;
    vi.restoreAllMocks();
  });

  it('records utility zoom scoring without letting it override atomic zoom form', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 101,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 150,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-merge-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'zoom',
          frame: 42,
          durationFrames: 12,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Path E requested weak zoom, utility curves should strengthen it',
          confidence: 0.95,
          params: {
            scaleFrom: 1,
            scaleTo: 1.01,
            signals: {
              'speech.energy': 1,
              'speech.energy_surprise': 1,
              speech_energy: 1,
              energy_surprise: 1,
              motion_intensity: 0.15,
              text_on_screen: 0,
            },
          },
        },
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 1,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    await executeEDL(edl, 'path-e-d-merge-test', 'user-1', overlays, { width: 1920, height: 1080 });

    const decision = edl.decisions[0];
    const bundle = decision.params.atomicMomentBundle;
    expect(bundle).toMatchObject({
      version: 'moment-bundle-v1',
      northstar: {
        sourceOfTruth: 'primitive-atoms',
        generatesLegacyPresetLabels: false,
      },
    });
    expect(bundle.primitiveAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'primitive', key: 'speech.energy', value: 1 }),
      expect.objectContaining({ level: 'primitive', key: 'visual.motion_intensity', value: 0.15 }),
    ]));
    expect(bundle.derivedAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'derived', key: 'moment.speech_peak' }),
    ]));
    expect(JSON.stringify(bundle)).not.toContain('punch-in');
    expect(JSON.stringify(bundle)).not.toContain('whip-pan');
    const grammar = decision.params.atomicMomentGrammar;
    expect(grammar).toMatchObject({
      version: 'moment-bundle-grammar-v1',
      anchorFrame: decision.frame,
      northstar: {
        sourceOfTruth: 'primitive-atoms',
        createsOverlays: false,
        selectsAssets: false,
        selectsTemplates: false,
      },
    });
    expect(JSON.stringify(grammar)).not.toContain('zoomType');
    expect(JSON.stringify(grammar)).not.toContain('transitionType');

    expect(decision.params.atomicUtilityScoring).toMatchObject({
      version: 'path-e-d-utility-merge-v1',
      category: 'zoom',
      winner: {
        overlayId: 'speech.zoom_punch_speech_speaker_energy_peak',
      },
    });
    expect(decision.params.scaleTo).toBe(1.01);

    const scaleTrack = overlays[0]?.keyframeTracks?.find((track) => track.property === 'scale');
    const maxScale = Math.max(...(scaleTrack?.keyframes.map((keyframe) => keyframe.value) ?? [1]));
    expect(maxScale).toBeLessThan(1.15);
    expect(maxScale).toBeGreaterThan(1);
    expect((overlays[0] as any).metadata.atomicMomentBundle).toBe(bundle);
    expect((overlays[0] as any).metadata.atomicMomentGrammar).toBe(grammar);
  });

  it('does not add synthetic utility decisions when Path E leaves a high-signal moment empty', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockDbState.projectDoc = {
      vjepaAnalysis: {
        segments: [
          { startMs: 0, endMs: 2000, visualSignificance: 0.1, motionIntensity: 0.1 },
          { startMs: 2000, endMs: 4500, visualSignificance: 1, motionIntensity: 0.4 },
        ],
      },
      wav2vecAnalysis: {
        segments: [
          { startMs: 2000, endMs: 4500, energy: 0.95, emotionIntensity: 0.9 },
        ],
      },
    };

    const overlays: Overlay[] = [
      {
        id: 201,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 140,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-supplement-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 0,
      decisions: [],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0,
      },
    };

    await executeEDL(edl, 'path-e-d-supplement-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(edl.decisions.some((decision) => decision.source.startsWith('path-e-d-supplement:'))).toBe(false);
    expect(edl.decisions).toHaveLength(0);

    const scaleTrack = overlays[0]?.keyframeTracks?.find((track) => track.property === 'scale');
    expect(scaleTrack).toBeUndefined();
  });

  it('does not let utility transition scoring erase explicit Path E transition intent', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 601,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 100,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/a.mp4',
        src: 'https://example.com/a.mp4',
        styles: { opacity: 1 },
      } as Overlay,
      {
        id: 602,
        type: OverlayType.VIDEO,
        from: 100,
        durationInFrames: 100,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/b.mp4',
        src: 'https://example.com/b.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-transition-intent-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'transition',
          frame: 100,
          durationFrames: 20,
          priority: 3,
          source: 'creative-brief:closing_zone:word',
          signal: 'closing_zone',
          reason: 'Path E requested a chapter-ending visual fade',
          confidence: 0.95,
          technique: 'transition_fade_to_black',
          params: {
            transitionType: 'dip-to-black',
            creativeDecisionType: 'transition_fade_to_black',
            signals: {
              speech_coverage: 0.7584,
              'speech.coverage': 0.7584,
              face_present: 0,
              'visual.face_present': 0,
              formality: 0.4,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 1,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    await executeEDL(edl, 'path-e-d-transition-intent-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(edl.decisions[0].params.atomicUtilityScoring).toMatchObject({
      category: 'transition',
      winner: {
        outputValues: {
          transitionType: 'l-cut',
        },
      },
    });
    expect(edl.decisions[0].params.transitionType).toBe('dip-to-black');

    const transition = overlays.find((overlay) => overlay.type === 'transition') as any;
    expect(transition?.transitionStyle).toBe('dip-to-black');
    expect(transition?.metadata.transitionType).toBe('dip-to-black');
    expect(transition?.metadata.atomicTransitionForm.compatibilityType).toBe('dip-to-black');
  });

  it('lets primitive motion signals promote an upstream hard-cut hint into a rendered transition form', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 401,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 100,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/a.mp4',
        src: 'https://example.com/a.mp4',
        styles: { opacity: 1 },
      } as Overlay,
      {
        id: 402,
        type: OverlayType.VIDEO,
        from: 100,
        durationInFrames: 100,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/b.mp4',
        src: 'https://example.com/b.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-transition-hardcut-promotion-test',
      generatedAt: new Date('2026-06-10T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'transition',
        frame: 100,
        durationFrames: 12,
        priority: 3,
        source: 'creative-chain:test',
        signal: 'motion_boundary',
        reason: 'Default hard-cut hint should yield to primitive motion atoms',
        confidence: 0.94,
        params: {
          transitionType: 'hard-cut',
          signals: {
            motion_vector_x: 0.84,
            motion_intensity: 0.88,
            beat_strength: 0.86,
            speech_energy: 0.74,
            text_on_screen: 0,
            visual_complexity: 0.1,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 1,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.94,
      },
    };

    const result = await executeEDL(edl, 'path-e-d-transition-hardcut-promotion-test', 'user-1', overlays, { width: 1920, height: 1080 });

    const transition = overlays.find((overlay) => overlay.type === 'transition') as any;
    expect(result.overlaysCreated).toBe(1);
    expect(transition?.transitionStyle).toBe('whip-pan');
    expect(transition?.metadata.atomicTransitionForm.compatibilityType).toBe('whip-pan');
    expect(transition?.metadata.atomicOverlayReceipt.payload.directionLabel).toBe('right');
  });

  it('does not add a duplicate D utility zoom near an existing Path E zoom', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockDbState.projectDoc = {
      vjepaAnalysis: {
        segments: [
          { startMs: 2000, endMs: 4500, visualSignificance: 1, motionIntensity: 0.4 },
        ],
      },
      wav2vecAnalysis: {
        segments: [
          { startMs: 2000, endMs: 4500, energy: 0.95, emotionIntensity: 0.9 },
        ],
      },
    };

    const overlays: Overlay[] = [
      {
        id: 301,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 140,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-no-duplicate-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'zoom',
          frame: 60,
          durationFrames: 16,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Path E already covered this moment',
          confidence: 0.9,
          params: { scaleFrom: 1, scaleTo: 1.08 },
        },
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 1,
        speedChangeCount: 0,
        averageConfidence: 0.9,
      },
    };

    await executeEDL(edl, 'path-e-d-no-duplicate-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(edl.decisions.filter((decision) => decision.type === 'zoom')).toHaveLength(1);
    expect(edl.decisions.some((decision) => (
      decision.type === 'zoom'
      && decision.source.startsWith('path-e-d-supplement:')
    ))).toBe(false);
  });

  it('does not re-derive a graphic preset from Path E technique inside executeEDL', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 401,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-graphic-intent-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'graphic',
          frame: 48,
          durationFrames: 60,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Path E intent should not become a graphicType preset',
          confidence: 0.9,
          technique: 'graphic_keyword_highlight',
          params: {
            text: 'one thing',
            keyword: 'one thing',
            title: 'One thing',
            body: 'Changed everything',
            contextPhrase: 'this is the one thing that changed everything',
            contextStartMs: 1500,
            contextEndMs: 3000,
            creativeDecisionType: 'graphic_keyword_highlight',
            signals: {
              speech_energy: 0.9,
              word_importance: 0.85,
              visual_significance: 0.4,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.9,
      },
    };

    await executeEDL(edl, 'path-e-d-graphic-intent-test', 'user-1', overlays, { width: 1920, height: 1080 });

    const graphic = overlays.find((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic') as any;
    expect(graphic?.metadata.graphicType).toBe('atomic-graphic');
    expect(graphic?.metadata.graphicType).not.toBe('keyword-highlight');
    expect(graphic?.content.graphicType).toBeUndefined();
    expect(graphic?.content.creativeDecisionType).toBeUndefined();
    expect(graphic?.content.title).toBe('One thing');
    expect(graphic?.content.body).toBe('Changed everything');
    expect(graphic?.content.contextPhrase).toBe('this is the one thing that changed everything');
    expect(graphic?.recipe.id).toBe('composed-structured-claim');
  });

  it('does not let transcript context alone promote weak keywords into standalone MGs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 901,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 180,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-context-only-keyword-test',
      generatedAt: new Date('2026-06-10T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'graphic',
          frame: 48,
          durationFrames: 60,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Transcript context alone should stay in captions',
          confidence: 0.9,
          technique: 'graphic_keyword_highlight',
          params: {
            text: 'these people',
            keyword: 'these people',
            contextPhrase: 'these people are not worth any more than any other two human beings',
            creativeDecisionType: 'graphic_keyword_highlight',
            signals: {
              speech_energy: 0.88,
              word_importance: 0.82,
              visual_significance: 0.35,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.9,
      },
    };

    await executeEDL(edl, 'path-e-d-context-only-keyword-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(overlays.some((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic')).toBe(false);
  });

  it('lets relation atoms reach the MG engine without legacy text fields', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 902,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 180,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-relation-atom-test',
      generatedAt: new Date('2026-06-10T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'graphic',
          frame: 60,
          durationFrames: 72,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'relation',
          reason: 'Comparison atoms should drive MG form',
          confidence: 0.95,
          technique: 'graphic_callout',
          params: {
            from: 'Manual',
            to: 'Automated',
            fromLabel: 'Before',
            toLabel: 'After',
            relation: 'arrow',
            sourceSpan: { text: 'manual edits versus automated edits', startMs: 1000, endMs: 2000 },
            creativeDecisionType: 'graphic_callout',
            signals: {
              visual_significance: 0.55,
              speech_energy: 0.72,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    await executeEDL(edl, 'path-e-d-relation-atom-test', 'user-1', overlays, { width: 1920, height: 1080 });

    const graphic = overlays.find((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic') as any;
    expect(graphic?.recipe.id).toBe('composed-comparison');
    expect(graphic?.content.from).toBe('Manual');
    expect(graphic?.content.to).toBe('Automated');
  });

  it('uses atomic graphic content and word timing instead of defaulting every MG to 90 frames', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 701,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 180,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-graphic-duration-test',
      generatedAt: new Date('2026-06-08T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'graphic',
          frame: 60,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'number',
          reason: 'Scalar stat should be readable but not bleed across the next phrase',
          confidence: 0.95,
          params: {
            value: '0.02',
            label: 'human beings per day',
            salience: 0.72,
            sourceSpan: { text: 'about 0.02 human beings per day', startMs: 2000, endMs: 2250 },
            creativeDecisionType: 'graphic_stat_counter',
            targetWordStartMs: 2000,
            targetWordEndMs: 2250,
            signals: {
              speech_energy: 0.85,
              visceral_impact: 0.75,
              enthusiasm: 0.7,
              formality: 0.4,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    await executeEDL(edl, 'path-e-d-graphic-duration-test', 'user-1', overlays, { width: 1920, height: 1080 });

    const graphic = overlays.find((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic') as any;
    expect(graphic?.metadata.graphicType).toBe('atomic-graphic');
    expect(graphic?.durationInFrames).toBeLessThan(90);
    expect(graphic?.durationInFrames).toBeGreaterThanOrEqual(36);
    expect(graphic?.recipe.id).toBe('composed-numeric');
    expect(graphic?.recipe.elements.some((element: any) => element.primitive === 'data-viz')).toBe(false);
    expect(graphic?.recipe.elements.some((element: any) => element.role === 'counter')).toBe(true);
  });

  it('keeps naked keyword emphasis in captions instead of creating weak standalone MGs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 501,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-naked-keyword-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 2,
      decisions: [
        {
          type: 'caption-emphasis',
          frame: 48,
          durationFrames: 30,
          priority: 2,
          source: 'signal-executor:test',
          signal: 'word_importance',
          reason: 'Plain word emphasis belongs in caption styling',
          confidence: 0.9,
          params: {
            emphasisWord: 'process',
            signals: {
              speech_energy: 0.88,
              word_importance: 0.92,
            },
          },
        } as any,
        {
          type: 'graphic',
          frame: 80,
          durationFrames: 60,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Naked keyword should not become a standalone MG',
          confidence: 0.9,
          params: {
            text: 'process',
            graphicType: 'keyword-highlight',
            signals: {
              speech_energy: 0.88,
              word_importance: 0.92,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.9,
      },
    };

    await executeEDL(edl, 'path-e-d-naked-keyword-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(overlays.some((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic')).toBe(false);
  });

  it('skips Path E keyword-only atomic graphics even after graphicType is removed', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 801,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source.mp4',
        src: 'https://example.com/source.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'path-e-d-atomic-keyword-skip-test',
      generatedAt: new Date('2026-06-09T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [
        {
          type: 'graphic',
          frame: 48,
          durationFrames: 60,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'emphasis',
          reason: 'Path E keyword-only MG should stay in captions',
          confidence: 0.9,
          technique: 'graphic_keyword_highlight',
          params: {
            text: 'people',
            keyword: 'people',
            creativeDecisionType: 'graphic_keyword_highlight',
            signals: {
              speech_energy: 0.88,
              word_importance: 0.82,
            },
          },
        } as any,
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.9,
      },
    };

    await executeEDL(edl, 'path-e-d-atomic-keyword-skip-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(overlays.some((overlay: any) => overlay.metadata?.sourceType === 'edl-graphic')).toBe(false);
  });
});
