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
import { resolveSemanticMgLedgerGate } from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';
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

  it('removes creative-knowledge-graph schema placeholders before MG planning and rendering', async () => {
    const placeholderPattern = /person\/brand name from transcript or brief|role\/description \(optional\)|numeric \(300%\)|count-up \| pop \| fade|slide-in from left \| fade-in/i;
    const normalized = normalizeMotionGraphicContent({
      name: 'person/brand name from transcript or brief',
      title: 'role/description (optional)',
      format: 'numeric (300%) | currency ($49) | count (10x)',
      animation: 'count-up | pop | fade',
      text: 'Psychology',
      semanticAtoms: {
        identity: {
          name: 'person/brand name from transcript or brief',
          role: 'role/description (optional)',
        },
        text: {
          primary: 'Psychology',
          secondary: 'How attention gets shaped',
        },
        claim: 'Psychology changes attention',
        evidencePhrase: 'psychology changes how attention gets shaped',
      },
      contextPhrase: 'psychology changes how attention gets shaped',
      contextStartMs: 1200,
      contextEndMs: 2400,
    });

    expect(JSON.stringify(normalized.content)).not.toMatch(placeholderPattern);
    expect(JSON.stringify(normalized.semanticAtoms)).not.toMatch(placeholderPattern);
    expect(normalized.content.name).toBeUndefined();
    expect(normalized.content.title).toBe('Psychology');
    expect(normalized.content.body).toBe('Psychology changes attention');
    expect(normalized.structure.primaryChannel).not.toBe('identity');

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
      projectId: 'mg-content-atoms-placeholder-scrub',
      generatedAt: new Date('2026-06-20T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 60,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'semantic-placeholder-guard',
        reason: 'KG example defaults must not render as MG content',
        confidence: 0.95,
        params: {
          creativeDecisionType: 'graphic_lower_third',
          name: 'person/brand name from transcript or brief',
          title: 'role/description (optional)',
          animation: 'slide-in from left | fade-in',
          text: 'Psychology',
          semanticAtoms: {
            identity: {
              name: 'person/brand name from transcript or brief',
              role: 'role/description (optional)',
            },
            text: {
              primary: 'Psychology',
              secondary: 'How attention gets shaped',
            },
            claim: 'Psychology changes attention',
            evidencePhrase: 'psychology changes how attention gets shaped',
          },
          contextPhrase: 'psychology changes how attention gets shaped',
          contextStartMs: 1200,
          contextEndMs: 2400,
          signals: {
            visual_significance: 0.74,
            speech_energy: 0.82,
            emotional_arousal: 0.66,
            visual_complexity: 0.12,
            text_on_screen: 0.08,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    await executeEDL(edl, 'mg-content-atoms-placeholder-scrub', 'user-1', overlays, { width: 1920, height: 1080 });

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    expect(motionGraphic).toBeDefined();
    expect(JSON.stringify(motionGraphic.content)).not.toMatch(placeholderPattern);
    expect(JSON.stringify(motionGraphic.metadata.contentStructure)).not.toMatch(placeholderPattern);
    expect(JSON.stringify(motionGraphic.metadata.semanticAtoms)).not.toMatch(placeholderPattern);
    expect(motionGraphic.content.title).toBe('Psychology');
    expect(motionGraphic.content.name).toBeUndefined();
  });

  it('does not license semanticAtoms-only display facts without timed transcript evidence', () => {
    const normalized = normalizeMotionGraphicContent({
      semanticAtoms: {
        quantity: {
          displayText: '700%',
          label: 'synthetic lift from generated card',
          kind: 'percentage',
          denominator: 100,
          bounded: true,
        },
        salience: 0.9,
      },
    });

    expect(normalized.semanticMgCandidateLedger.candidates).toHaveLength(0);
    expect(resolveSemanticMgLedgerGate(normalized.semanticMgCandidateLedger)).toEqual(expect.objectContaining({
      allow: false,
      reasons: expect.arrayContaining([
        'semantic-ledger:no-licensed-candidate',
        'semantic-ledger:missing-source-span',
      ]),
    }));
    expect(normalized.semanticMgCandidateLedger.suppressed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factKind: 'bounded-stat',
        hardGate: expect.objectContaining({
          blockedBy: expect.arrayContaining(['missing-source-span']),
        }),
      }),
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
          contextStartMs: 3200,
          contextEndMs: 4600,
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

  it('blocks weak unlicensed stat MGs through the semantic ledger before rendering', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
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
      projectId: 'mg-content-atoms-weak-stat',
      generatedAt: new Date('2026-06-12T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 60,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'entity.number',
        reason: 'number_mentioned',
        confidence: 0.92,
        params: {
          creativeDecisionType: 'graphic_stat_counter',
          value: '0.03',
          label: 'events per day',
          contextPhrase: 'it was about 0.03 events per day',
          signals: {
            speech_energy: 0.8,
            word_importance: 0.78,
            visual_significance: 0.36,
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

    await executeEDL(edl, 'mg-content-atoms-weak-stat', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(overlays.some((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC)).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('SKIPPED by semantic MG ledger gate'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('semantic-ledger:weak-stat-needs-salience-or-relation'));
  });
});
