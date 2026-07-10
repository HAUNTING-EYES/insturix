import { describe, expect, it, vi } from 'vitest';
import {
  buildAssetDeepAnalysisTimeline,
  runAssetDeepAnalysis,
  type AssetDeepAnalysisDependencies,
} from '@/lib/editron/services/asset-deep-analysis';

describe('asset deep analysis', () => {
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
        actionType: 'speaking',
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
    const dependencies: AssetDeepAnalysisDependencies = { analyzeVjepa, analyzeWav2vec, analyzeMusic };

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

    expect(analyzeVjepa).toHaveBeenCalledOnce();
    expect(analyzeWav2vec).toHaveBeenCalledWith(
      'https://cdn.example/mixed.mp4',
      [{ startMs: 1_000, endMs: 2_000 }, { startMs: 5_000, endMs: 6_000 }],
    );
    expect(analyzeMusic).toHaveBeenCalledOnce();
    expect(result.diagnostics).toMatchObject({
      status: 'complete',
      speechWindowCount: 2,
      providers: { vjepa: 'complete', wav2vec: 'complete', music: 'complete' },
    });
    expect(result.momentWeightMap.weights.some((weight) => weight.sources.vjepa !== null)).toBe(true);
    expect(result.momentWeightMap.weights.some((weight) => weight.sources.wav2vec !== null)).toBe(true);
    expect(result.segmentAnalysis?.meta).toMatchObject({ hasVjepa: true, hasWav2vec: true });
  });

  it('records provider degradation instead of inventing visual confidence', async () => {
    const result = await runAssetDeepAnalysis({
      videoUrl: 'https://cdn.example/degraded.mp4',
      durationMs: 5_000,
      sourceAnalysis: { durationMs: 5_000, speechSegments: [] },
    }, {
      analyzeVjepa: vi.fn().mockRejectedValue(new Error('modal unavailable')),
      analyzeWav2vec: vi.fn(),
      analyzeMusic: vi.fn().mockResolvedValue(null),
    });

    expect(result.diagnostics).toMatchObject({
      status: 'degraded',
      providers: { vjepa: 'failed', wav2vec: 'not-applicable', music: 'missing' },
    });
    expect(result.diagnostics.errors).toContain('vjepa: modal unavailable');
    expect(result.momentWeightMap.weights.every((weight) => weight.sources.vjepa === null)).toBe(true);
  });
});
