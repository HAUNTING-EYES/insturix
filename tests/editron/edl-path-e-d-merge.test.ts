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

  it('lets utility curves enrich Path E zoom execution instead of keeping weak preset params', async () => {
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
    expect(decision.params.scaleTo).toBeGreaterThan(1.2);

    const scaleTrack = overlays[0]?.keyframeTracks?.find((track) => track.property === 'scale');
    expect(scaleTrack?.keyframes.some((keyframe) => keyframe.value > 1.2)).toBe(true);
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
            contextPhrase: 'this is the one thing that changed everything',
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
    expect(graphic?.content.contextPhrase).toBe('this is the one thing that changed everything');
    expect(graphic?.recipe.id).toBe('composed-structured');
  });
});
