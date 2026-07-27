import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_DEEP_ANALYSIS_VERSION,
  buildAssetDeepAnalysisClaimFilter,
  buildAssetDeepAnalysisTimeline,
  runAssetDeepAnalysis,
  type AssetDeepAnalysisDependencies,
} from '@/lib/editron/services/asset-deep-analysis';
import { sceneFromSegment } from '@/lib/editron/storyline/scene-adapter';
import { buildOrderingDigest, formatDigestForPrompt } from '@/lib/editron/storyline/ordering-digest';

describe('asset deep analysis', () => {
  it('reclaims terminal analyses produced by an older capability version', () => {
    const now = new Date('2026-07-23T10:00:00.000Z');
    expect(buildAssetDeepAnalysisClaimFilter('asset-1', 'user-1', { now })).toEqual({
      assetId: 'asset-1',
      userId: 'user-1',
      $or: [
        { deepAnalysisStatus: { $nin: ['analyzing', 'complete', 'degraded'] } },
        {
          deepAnalysisStatus: 'analyzing',
          deepAnalysisStartedAt: { $lt: new Date('2026-07-23T09:55:00.000Z') },
        },
        {
          deepAnalysisStatus: { $in: ['complete', 'degraded'] },
          deepAnalysisVersion: { $ne: ASSET_DEEP_ANALYSIS_VERSION },
        },
      ],
    });
  });

  it('creates full-duration visual evidence for footage with no speech', () => {
    const timeline = buildAssetDeepAnalysisTimeline({
      videoUrl: 'https://cdn.example/visual-only.mp4',
      durationMs: 12_000,
      sourceAnalysis: { durationMs: 12_000, speechSegments: [] },
    });

    expect(timeline.speechWindows).toEqual([]);
    expect(timeline.visualWindows.length).toBeGreaterThan(0);
    expect(timeline.visualWindows[0]).toMatchObject({ startMs: 0 });
    expect(timeline.visualWindows.at(-1)?.endMs).toBe(12_000);
    expect(timeline.rawFootageAnalysis.segments).toHaveLength(timeline.visualWindows.length);
  });

  it('joins visual, vocal, and music evidence on one canonical source timeline', async () => {
    const analyzeVjepa = vi.fn(async (_url: string, windows: Array<{ startMs: number; endMs: number }>) => ({
      segments: windows.map((window, index) => ({
        ...window,
        visualSignificance: index === 0 ? 0.8 : 0.6,
        motionIntensity: 0.4,
        actionType: 'other',
      })),
      requestedSegmentCount: windows.length,
      analyzedSegmentCount: windows.length,
      droppedSegmentCount: 0,
      coverageRatio: 1,
      partial: false,
      failedBatchCount: 0,
      processingTimeMs: 10,
      modelVersion: 'test-vjepa',
    }) as any);
    const analyzeWav2vec = vi.fn(async () => ({
      segments: [
        { startMs: 1_000, endMs: 2_000, emotionIntensity: 0.9, energy: 0.8 },
        { startMs: 5_000, endMs: 6_000, emotionIntensity: 0.4, energy: 0.5 },
      ],
      processingTimeMs: 10,
      modelVersion: 'test-wav2vec',
    }) as any);
    const analyzeMusic = vi.fn(async () => ({
      bpm: 120,
      beats: [500, 1_000],
      sections: [],
      energyCurve: [0.4, 0.7],
      musicPresence: 0.8,
      processingTimeMs: 10,
    }) as any);
    const analyzeSemanticVisual = vi.fn(async () => ({
      sourceVideoUrl: 'https://cdn.example/mixed.mp4',
      contentType: 'product-demo',
      platform: 'general',
      title: 'Garment construction',
      overallMusicPrompt: '',
      globalEditDirections: {
        colorGrade: 'neutral',
        pacing: 'medium',
        graphicsDensity: 'minimal',
        musicMood: '',
        narrativeArc: 'three-act',
      },
      visualPerceptionWindows: [{
        startSec: 0,
        endSec: 4,
        visualMode: 'product-demo',
        subjects: ['embroidery frame', 'black fabric'],
        actions: ['hands stitch beads into fabric'],
        visibleStateChanges: ['bead pattern becomes denser'],
        ocrText: [],
        visuallyExplains: true,
        visualExplainability: 'high',
        screenClutter: 0.4,
        salience: 0.9,
        confidence: 0.95,
        negativeSpacePreference: 'right',
        issues: [],
      }],
      scenes: [],
      analyzedAt: new Date().toISOString(),
    }) as any);
    const dependencies: AssetDeepAnalysisDependencies = {
      analyzeSemanticVisual,
      analyzeVjepa,
      analyzeWav2vec,
      analyzeMusic,
    };

    const result = await runAssetDeepAnalysis({
      videoUrl: 'https://cdn.example/mixed.mp4',
      durationMs: 8_000,
      sourceAnalysis: {
        durationMs: 8_000,
        speechSegments: [
          { startMs: 1_000, endMs: 2_000, text: 'First thought' },
          { startMs: 5_000, endMs: 6_000, text: 'Second thought' },
        ],
      },
    }, dependencies);

    expect(analyzeSemanticVisual).toHaveBeenCalledWith('https://cdn.example/mixed.mp4', 8);
    expect(analyzeVjepa).toHaveBeenCalledOnce();
    expect(analyzeWav2vec).toHaveBeenCalledWith(
      'https://cdn.example/mixed.mp4',
      [{ startMs: 1_000, endMs: 2_000 }, { startMs: 5_000, endMs: 6_000 }],
    );
    expect(analyzeMusic).toHaveBeenCalledOnce();
    expect(result.diagnostics).toMatchObject({
      version: ASSET_DEEP_ANALYSIS_VERSION,
      status: 'complete',
      speechWindowCount: 2,
      semanticVisualWindowCount: 1,
      providers: { semanticVisual: 'complete', vjepa: 'complete', wav2vec: 'complete', music: 'complete' },
    });
    expect(result.momentWeightMap.weights.some((weight) => weight.sources.vjepa !== null)).toBe(true);
    expect(result.momentWeightMap.weights.some((weight) => weight.sources.wav2vec !== null)).toBe(true);
    expect(result.segmentAnalysis?.meta).toMatchObject({ hasVjepa: true, hasWav2vec: true });

    const firstSegment = result.segmentAnalysis?.segments[0];
    expect(firstSegment?.semanticVisual).toEqual(expect.objectContaining({
      primaryVisualMode: 'product-demo',
      visuallyExplains: true,
      salience: 0.9,
    }));

    const scene = sceneFromSegment(firstSegment!, { assetId: 'asset-garment' });
    expect(scene.objects).toEqual(['embroidery frame', 'black fabric']);
    expect(scene.actionType).toBe('hands stitch beads into fabric');
    expect(scene.description).toContain('bead pattern becomes denser');
    const promptDigest = formatDigestForPrompt(buildOrderingDigest([scene]));
    expect(promptDigest).toContain('visual: subjects: embroidery frame, black fabric');
    expect(promptDigest).toContain('subjects: embroidery frame, black fabric');
  });

  it('records provider degradation instead of inventing visual confidence', async () => {
    const result = await runAssetDeepAnalysis({
      videoUrl: 'https://cdn.example/degraded.mp4',
      durationMs: 5_000,
      sourceAnalysis: { durationMs: 5_000, speechSegments: [] },
    }, {
      analyzeSemanticVisual: vi.fn().mockResolvedValue(null),
      analyzeVjepa: vi.fn().mockRejectedValue(new Error('modal unavailable')),
      analyzeWav2vec: vi.fn(),
      analyzeMusic: vi.fn().mockResolvedValue(null),
    });

    expect(result.diagnostics).toMatchObject({
      version: ASSET_DEEP_ANALYSIS_VERSION,
      status: 'degraded',
      semanticVisualWindowCount: 0,
      providers: { semanticVisual: 'missing', vjepa: 'failed', wav2vec: 'not-applicable', music: 'missing' },
    });
    expect(result.diagnostics.errors).toContain('vjepa: modal unavailable');
    expect(result.momentWeightMap.weights.every((weight) => weight.sources.vjepa === null)).toBe(true);
  });

  it('degrades a provider that does not settle before the worker deadline', async () => {
    const neverSettles = new Promise<never>(() => undefined);
    const result = await runAssetDeepAnalysis({
      videoUrl: 'https://cdn.example/wedged-provider.mp4',
      durationMs: 5_000,
      sourceAnalysis: { durationMs: 5_000, speechSegments: [] },
    }, {
      analyzeSemanticVisual: vi.fn(() => neverSettles),
      analyzeVjepa: vi.fn().mockResolvedValue({ segments: [] }),
      analyzeWav2vec: vi.fn(),
      analyzeMusic: vi.fn().mockResolvedValue(null),
    } as unknown as AssetDeepAnalysisDependencies, { providerTimeoutMs: 10 });

    expect(result.diagnostics).toMatchObject({
      status: 'degraded',
      providers: { semanticVisual: 'failed' },
    });
    expect(result.diagnostics.errors).toContain('semantic-visual: semantic-visual timed out after 10ms');
  });

  it('does not call a storyboard with no perception windows semantically complete', async () => {
    const result = await runAssetDeepAnalysis({
      videoUrl: 'https://cdn.example/empty-semantics.mp4',
      durationMs: 5_000,
      sourceAnalysis: { durationMs: 5_000, speechSegments: [] },
    }, {
      analyzeSemanticVisual: vi.fn().mockResolvedValue({
        sourceVideoUrl: 'https://cdn.example/empty-semantics.mp4',
        contentType: 'video',
        platform: 'general',
        title: 'Empty semantic output',
        overallMusicPrompt: '',
        globalEditDirections: {
          colorGrade: 'neutral',
          pacing: 'medium',
          graphicsDensity: 'minimal',
          musicMood: '',
          narrativeArc: 'three-act',
        },
        visualPerceptionWindows: [],
        scenes: [],
        analyzedAt: new Date().toISOString(),
      }),
      analyzeVjepa: vi.fn().mockResolvedValue({ segments: [] }),
      analyzeWav2vec: vi.fn(),
      analyzeMusic: vi.fn().mockResolvedValue(null),
    } as unknown as AssetDeepAnalysisDependencies);

    expect(result.diagnostics).toMatchObject({
      status: 'degraded',
      semanticVisualWindowCount: 0,
      providers: { semanticVisual: 'missing' },
    });
    expect(result.segmentAnalysis?.segments.every((segment) => segment.semanticVisual === null)).toBe(true);
  });
});
