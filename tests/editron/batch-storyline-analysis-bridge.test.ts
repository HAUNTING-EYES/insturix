import { describe, expect, it, vi } from 'vitest';

import {
  buildComposableSegmentsFromAssetAnalysis,
  hydrateStorylineAnalysesForBatch,
} from '@/lib/editron/services/batch-storyline-analysis-bridge';
import { PROJECT_ASSET_ANALYSES_COLLECTION } from '@/lib/editron/services/project-analysis-storage';

function mockDb(analyses: any[]) {
  const updates: Array<{ name: string; filter: any; update: any; options: any }> = [];
  return {
    updates,
    db: {
      collection(name: string) {
        return {
          find: (filter: any) => ({
            toArray: async () => analyses.filter((analysis) => (
              filter.assetId?.$in?.includes(analysis.assetId) &&
              analysis.userId === filter.userId &&
              analysis.status === filter.status
            )),
          }),
          updateOne: vi.fn(async (filter: any, update: any, options: any) => {
            updates.push({ name, filter, update, options });
            return { acknowledged: true };
          }),
        };
      },
    },
  };
}

describe('batch storyline analysis bridge', () => {
  it('persists real speech segments from asset_analyses into composer-readable project analyses', async () => {
    const { db, updates } = mockDb([{
      assetId: 'asset_1',
      userId: 'user_1',
      status: 'complete',
      durationMs: 10_000,
      analysisQuality: 'high',
      confidenceBreakdown: { speech: 0.86, vision: 0.78 },
      speechSegments: [{ startMs: 1000, endMs: 4200, text: 'this moment matters', confidence: 0.91 }],
      motionSegments: [{ startFrame: 30, endFrame: 126, motionIntensity: 0.72 }],
      keyframeAnalyses: [{ frame: 60, timestampMs: 2000, energyLevel: 0.8, subjects: [{ category: 'person' }] }],
      subjectTracks: [{ category: 'person', frames: [{ frame: 60, box: { h: 0.46 } }] }],
    }]);

    const result = await hydrateStorylineAnalysesForBatch(db, {
      projectId: 'proj_1',
      userId: 'user_1',
      assets: [{ assetId: 'asset_1', type: 'video', duration: 10 }],
      now: new Date('2026-07-10T00:00:00.000Z'),
    });

    expect(result).toEqual({
      attemptedAssetCount: 1,
      sourceAnalysisCount: 1,
      persistedAssetCount: 1,
      segmentCount: 1,
      skipped: [],
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].name).toBe(PROJECT_ASSET_ANALYSES_COLLECTION);
    expect(updates[0].filter).toEqual({ projectId: 'proj_1', assetId: 'asset_1' });
    const segment = updates[0].update.$set.segmentAnalysis.segments[0];
    expect(segment.transcript).toEqual({ text: 'this moment matters', wordCount: 3 });
    expect(segment.visual).toEqual(expect.objectContaining({ motionIntensity: 0.72, faceCount: 1, mainSubjectHeight: 0.46 }));
    expect(segment.weight).toEqual({ finalWeight: 0.91, confidence: 'high' });
  });

  it('uses visual motion windows for visual-only clips without inventing OCR text', () => {
    const segments = buildComposableSegmentsFromAssetAnalysis({
      assetId: 'visual_1',
      userId: 'user_1',
      status: 'complete',
      analysisQuality: 'medium',
      confidenceBreakdown: { vision: 0.64, motion: 0.7 },
      motionSegments: [{ startFrame: 0, endFrame: 90, motionIntensity: 0.7 }],
      keyframeAnalyses: [{ frame: 45, timestampMs: 1500, energyLevel: 0.66, subjects: [{ category: 'product' }] }],
      subjectTracks: [{ category: 'object', frames: [{ frame: 45, box: { h: 0.25 } }] }],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].startMs).toBe(0);
    expect(segments[0].endMs).toBe(3000);
    expect(segments[0].transcript).toEqual({ text: '', wordCount: 0 });
    expect(segments[0].semanticVisual).not.toHaveProperty('ocrText');
    expect(segments[0].visual).toEqual(expect.objectContaining({ motionIntensity: 0.7, objectCount: 1 }));
  });

  it('reports missing source analysis instead of pretending the composer has evidence', async () => {
    const { db } = mockDb([]);
    const result = await hydrateStorylineAnalysesForBatch(db, {
      projectId: 'proj_1',
      userId: 'user_1',
      assets: [{ assetId: 'missing', type: 'video', duration: 4 }],
    });

    expect(result).toEqual({
      attemptedAssetCount: 1,
      sourceAnalysisCount: 0,
      persistedAssetCount: 0,
      segmentCount: 0,
      skipped: [{ assetId: 'missing', reason: 'missing_asset_analysis' }],
    });
  });
});
