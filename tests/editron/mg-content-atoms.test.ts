import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/services/motion-graphics-service', () => ({
  findBestTemplate: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/data/transition-templates', () => ({
  DEFAULT_TRANSITION_FRAMES: {
    dissolve: 36,
    'soft-cut': 15,
  },
  createTrueDissolve: vi.fn((outgoing: any, incoming: any) => ({
    outgoing,
    incoming,
  })),
}));

import type { Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '../../lib/editron/config/editron-config';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import { normalizeMotionGraphicContent } from '../../lib/editron/services/mg-content-atoms';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';

describe('MG content atom normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (DEFAULT_CONFIG.features) DEFAULT_CONFIG.features.useCompositionEngine = true;
  });

  it('normalizes richer semantic atoms into the structural content used by the MG planner', () => {
    const normalized = normalizeMotionGraphicContent({
      contextPhrase: 'Hank Green explained the A B C cohort trend',
      contextStartMs: 1000,
      contextEndMs: 2400,
      semanticAtoms: {
        series: {
          values: [92, 78, 64],
          labels: ['A', 'B', 'C'],
        },
        identity: {
          name: 'Hank Green',
          role: 'Creator',
          image: 'https://example.com/hank.jpg',
        },
        media: {
          role: 'avatar',
          url: 'https://example.com/avatar.jpg',
        },
      },
    });

    expect(normalized.content.values).toEqual([92, 78, 64]);
    expect(normalized.content.labels).toEqual(['A', 'B', 'C']);
    expect(normalized.content.name).toBe('Hank Green');
    expect(normalized.content.title).toBe('Creator');
    expect(normalized.content.avatar).toBe('https://example.com/hank.jpg');
    expect(normalized.content.logo).toBeUndefined();
    expect(normalized.structure.primaryChannel).toBe('series');
    expect(normalized.structure.evidence.seriesCardinality).toBe(3);
    expect(normalized.semanticMgCandidateLedger.version).toBe('semantic-mg-candidate-ledger-v1');
    expect(normalized.semanticMgCandidateLedger.candidates.map((candidate) => candidate.factKind)).toEqual(expect.arrayContaining([
      'series',
      'identity',
    ]));
    expect(normalized.semanticMgCandidateLedger.candidates[0]?.sourceSpan).toEqual(expect.objectContaining({
      text: 'Hank Green explained the A B C cohort trend',
      startMs: 1000,
      endMs: 2400,
    }));
    expect(normalized.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'series-values', channel: 'series' }),
      expect.objectContaining({ role: 'name', channel: 'identity' }),
      expect.objectContaining({ role: 'avatar', channel: 'media' }),
    ]));
  });

  it('renders semanticAtoms-only series as data-viz MG and persists the content structure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    if (DEFAULT_CONFIG.features) DEFAULT_CONFIG.features.useCompositionEngine = true;

    const overlays: Overlay[] = [{
      id: 1,
      type: OverlayType.VIDEO,
      from: 0,
      durationInFrames: 240,
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
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'mg-content-atoms-series',
      generatedAt: new Date('2026-06-12T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 60,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'semantic-series',
        reason: 'Series atoms should license data-viz form',
        confidence: 0.92,
        params: {
          creativeDecisionType: 'graphic_callout',
          semanticAtoms: {
            series: {
              values: [12, 19, 31, 47, 51],
              labels: ['A', 'B', 'C', 'D', 'E'],
            },
            claim: 'Growth keeps compounding',
            evidencePhrase: 'growth keeps compounding across five cohorts',
          },
          contextPhrase: 'growth keeps compounding across five cohorts',
          signals: {
            visual_significance: 0.72,
            speech_energy: 0.8,
            emotional_arousal: 0.7,
            visual_complexity: 0.1,
            text_on_screen: 0.1,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.92,
      },
    };

    await executeEDL(edl, 'mg-content-atoms-series', 'user-1', overlays, { width: 1920, height: 1080 });

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;

    expect(motionGraphic).toBeDefined();
    expect(motionGraphic.recipe.id).toBe('composed-data-series');
    expect(motionGraphic.content.values).toEqual([12, 19, 31, 47, 51]);
    expect(motionGraphic.content.labels).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(motionGraphic.metadata.contentStructure.primaryChannel).toBe('series');
    expect(motionGraphic.metadata.contentStructure.evidence.seriesTrend).toBe('rising');
    expect(motionGraphic.metadata.semanticAtoms.series.values).toEqual([12, 19, 31, 47, 51]);
    expect(motionGraphic.metadata.semanticMgCandidateLedger.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factKind: 'series',
        licenses: expect.arrayContaining(['series-values', 'source-span']),
      }),
    ]));
    expect(JSON.stringify(motionGraphic.metadata.semanticMgCandidateLedger)).not.toMatch(/template|preset|graphicType/i);
  });
});
