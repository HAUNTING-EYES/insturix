import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCanonicalWav2VecAnalysis } from '@/lib/editron/services/canonical-wav2vec-analysis';

function analysis(windows: Array<{ startMs: number; endMs: number }>) {
  return {
    segments: windows.map((window) => ({
      ...window,
      emotionIntensity: 0.7,
      emotionalValence: 'positive' as const,
      energy: 0.6,
      pitchVariability: 0.5,
      stressDetected: false,
      fillerConfidence: 0.1,
    })),
    modelVersion: 'wav2vec-test',
    processingTimeMs: 10,
  };
}

function database(options: { canonical?: ReturnType<typeof analysis> | null; media?: Record<string, unknown> | null }) {
  const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
  return {
    db: {
      collection: (name: string) => ({
        findOne: vi.fn(async () => name === 'asset_analyses'
          ? options.canonical ? { wav2vecAnalysis: options.canonical } : null
          : options.media ?? null),
        updateOne,
      }),
    },
    updateOne,
  };
}

describe('canonical Wav2Vec ownership', () => {
  it('routes the production TRIBE worker through the canonical owner', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/internal/workers/tribe-analysis/route.ts'),
      'utf8',
    );
    const resolverCall = source.indexOf('return resolveCanonicalWav2VecAnalysis({');
    const directCall = source.indexOf('return analyzeAudioWithWav2Vec(videoUrl, segmentInputs);');

    expect(resolverCall).toBeGreaterThan(0);
    expect(directCall).toBe(-1);
    expect(source).toContain('source=${wav2vecResolution.provenance}');
  });

  it('reuses completed per-asset evidence without invoking Modal', async () => {
    const existing = analysis([{ startMs: 0, endMs: 1_000 }]);
    const { db } = database({ canonical: existing, media: { deepAnalysisStatus: 'complete' } });
    const analyze = vi.fn();

    const result = await resolveCanonicalWav2VecAnalysis({
      db,
      assetId: 'asset-1',
      userId: 'user-1',
      audioUrl: 'https://cdn.test/source.mp4',
      segments: [{ startMs: 100, endMs: 900 }],
      analyze,
      waitMs: 0,
    });

    expect(result.provenance).toBe('canonical-reuse');
    expect(result.providerInvoked).toBe(false);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('does not race an active durable owner', async () => {
    const { db } = database({
      canonical: null,
      media: { deepAnalysisStatus: 'analyzing', deepAnalysisStartedAt: new Date() },
    });
    const analyze = vi.fn();

    const result = await resolveCanonicalWav2VecAnalysis({
      db,
      assetId: 'asset-1',
      userId: 'user-1',
      audioUrl: 'https://cdn.test/source.mp4',
      segments: [{ startMs: 0, endMs: 1_000 }],
      analyze,
      waitMs: 0,
    });

    expect(result).toMatchObject({
      analysis: null,
      provenance: 'owner-pending-timeout',
      providerInvoked: false,
    });
    expect(analyze).not.toHaveBeenCalled();
  });

  it('extends only genuinely uncovered windows after the owner is terminal', async () => {
    const existing = analysis([{ startMs: 0, endMs: 1_000 }]);
    const { db, updateOne } = database({ canonical: existing, media: { deepAnalysisStatus: 'degraded' } });
    const analyze = vi.fn(async (_url, windows) => analysis(windows));

    const result = await resolveCanonicalWav2VecAnalysis({
      db,
      assetId: 'asset-1',
      userId: 'user-1',
      audioUrl: 'https://cdn.test/source.mp4',
      segments: [{ startMs: 100, endMs: 900 }, { startMs: 2_000, endMs: 3_000 }],
      analyze,
      waitMs: 0,
    });

    expect(analyze).toHaveBeenCalledWith(
      'https://cdn.test/source.mp4',
      [{ startMs: 2_000, endMs: 3_000 }],
    );
    expect(result).toMatchObject({
      provenance: 'canonical-extended',
      providerInvoked: true,
      uncoveredSegmentCount: 1,
      analyzedSegmentCount: 2,
    });
    expect(updateOne).toHaveBeenCalledOnce();
  });

  it('creates canonical evidence when no durable owner exists', async () => {
    const { db, updateOne } = database({ canonical: null, media: { deepAnalysisStatus: 'failed' } });
    const analyze = vi.fn(async (_url, windows) => analysis(windows));

    const result = await resolveCanonicalWav2VecAnalysis({
      db,
      assetId: 'asset-1',
      userId: 'user-1',
      audioUrl: 'https://cdn.test/source.mp4',
      segments: [{ startMs: 0, endMs: 1_000 }],
      analyze,
      waitMs: 0,
    });

    expect(result.provenance).toBe('canonical-created');
    expect(result.analysis?.segments).toHaveLength(1);
    expect(updateOne).toHaveBeenCalledOnce();
  });
});
