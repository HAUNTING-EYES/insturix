import { describe, expect, it, vi } from 'vitest';

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
}));

import type { Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '../../lib/editron/config/editron-config';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';

describe('EDL motion graphic signal curves', () => {
  it('serializes real timeline/audio curves onto composition-engine MG overlays', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    if (DEFAULT_CONFIG.features) DEFAULT_CONFIG.features.useCompositionEngine = true;

    const overlays: Overlay[] = [{
      id: 1,
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
      assetId: 'asset-1',
      content: 'https://example.com/source.mp4',
      src: 'https://example.com/source.mp4',
      videoStartTime: 0,
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'edl-mg-signal-curves',
      generatedAt: new Date('2026-07-06T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 30,
        durationFrames: 90,
        priority: 3,
        source: 'signal-planner:test',
        signal: 'entity.number',
        reason: 'real signal curves should drive MG hold modulation',
        confidence: 0.95,
        params: {
          creativeDecisionType: 'graphic_stat_counter',
          value: '42%',
          label: 'retention lift',
          contextPhrase: 'retention lifted forty two percent',
          contextStartMs: 900,
          contextEndMs: 1900,
          semanticAtoms: {
            scalar: {
              displayText: '42%',
              label: 'retention lift',
              kind: 'percentage',
              bounded: true,
              denominator: 100,
            },
            evidencePhrase: 'retention lifted forty two percent',
          },
          signals: {
            visual_significance: 0.7,
            speech_energy: 0.6,
            emotional_arousal: 0.58,
            bpm: 120,
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

    const analyses = new Map<string, any>([[
      'asset-1',
      {
        musicAnalysis: {
          bpm: 120,
          durationMs: 6000,
          beats: [
            { timestampMs: 1000, strength: 0.9 },
            { timestampMs: 2000, strength: 0.55 },
          ],
          energyCurve: [0.1, 0.25, 0.9, 0.35, 0.15],
          musicPresence: 0.8,
        },
        wav2vecAnalysis: {
          segments: [
            { startMs: 0, endMs: 1200, energy: 0.78, emotionIntensity: 0.66 },
            { startMs: 1200, endMs: 2400, energy: 0.42, emotionIntensity: 0.35 },
          ],
        },
        vjepaAnalysis: {
          segments: [
            { startMs: 0, endMs: 2400, motionIntensity: 0.32, visualSignificance: 0.74 },
          ],
        },
      },
    ]]);

    await executeEDL(edl, 'edl-mg-signal-curves', 'user-1', overlays, { width: 1920, height: 1080 }, analyses);

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    expect(motionGraphic).toBeDefined();
    expect(motionGraphic.signalCurves).toBeDefined();
    expect(motionGraphic.signalCurves.beat_level.some((value: number) => value > 0)).toBe(true);
    expect(motionGraphic.signalCurves.onset.some((value: number) => value > 0.5)).toBe(true);
    expect(new Set(motionGraphic.signalCurves.energy.map((value: number) => value.toFixed(2))).size).toBeGreaterThan(1);
    expect(motionGraphic.metadata.signalCurves).toMatchObject({
      version: 'mg-signal-curves-v1',
      source: 'edl-timeline-analysis',
      beatSamples: expect.any(Number),
      wav2vecSamples: expect.any(Number),
      vjepaSamples: expect.any(Number),
    });
    expect(motionGraphic.metadata.signalCurves.varyingCurves).toEqual(expect.arrayContaining(['energy']));
  });
});