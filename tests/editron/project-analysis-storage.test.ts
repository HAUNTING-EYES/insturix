import { describe, expect, it, vi } from 'vitest';

import {
  buildProjectAnalysisAssetSet,
  buildProjectAssetAnalysisDocumentUpdate,
  CANONICAL_ASSET_ANALYSES_COLLECTION,
  encodeProjectAnalysisAssetKey,
  loadCanonicalProjectAssetAnalyses,
  persistProjectAssetAnalysis,
  PROJECT_ASSET_ANALYSES_COLLECTION,
  projectAnalysisAssetPath,
} from '../../lib/editron/services/project-analysis-storage';

describe('project analysis per-asset storage', () => {
  it('builds Mongo-safe keyed analysis paths without clobbering sibling assets', () => {
    const updatedAt = new Date('2026-07-06T00:00:00.000Z');
    const assetId = 'asset.with.$unsafe.parts';
    const key = encodeProjectAnalysisAssetKey(assetId);

    expect(key).not.toContain('.');
    expect(key).not.toContain('$');
    expect(projectAnalysisAssetPath('rawFootageAnalysis', assetId)).toBe(`rawFootageAnalysisByAsset.${key}`);

    const set = buildProjectAnalysisAssetSet(assetId, {
      rawFootageAnalysis: { transcription: { words: [{ text: 'hello' }] } },
      segmentAnalysis: { segments: [{ id: 'seg-1' }] },
      vjepaAnalysis: null,
    }, updatedAt);

    expect(set).toEqual({
      [`analysisAssetIndex.${key}`]: { assetId, updatedAt },
      [`rawFootageAnalysisByAsset.${key}`]: { transcription: { words: [{ text: 'hello' }] } },
      [`segmentAnalysisByAsset.${key}`]: { segments: [{ id: 'seg-1' }] },
    });
  });

  it('builds a sibling collection upsert keyed by projectId and assetId', () => {
    const updatedAt = new Date('2026-07-06T00:00:00.000Z');
    const write = buildProjectAssetAnalysisDocumentUpdate(' proj_1 ', ' asset.with.$unsafe.parts ', {
      rawFootageAnalysis: { transcription: { words: [{ text: 'hello' }] } },
      segmentAnalysis: { segments: [{ id: 'seg-1' }] },
      vjepaAnalysis: null,
      momentWeightMap: { windows: 3 },
    }, updatedAt);

    expect(write).toEqual({
      filter: { projectId: 'proj_1', assetId: 'asset.with.$unsafe.parts' },
      update: {
        $set: {
          projectId: 'proj_1',
          assetId: 'asset.with.$unsafe.parts',
          updatedAt,
          rawFootageAnalysis: { transcription: { words: [{ text: 'hello' }] } },
          segmentAnalysis: { segments: [{ id: 'seg-1' }] },
          momentWeightMap: { windows: 3 },
        },
        $setOnInsert: { createdAt: updatedAt },
      },
      options: { upsert: true },
    });
  });

  it('persists analysis to the sibling collection without requiring Mongo in tests', async () => {
    const updatedAt = new Date('2026-07-06T00:00:00.000Z');
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collection = vi.fn().mockReturnValue({ updateOne });

    await persistProjectAssetAnalysis({ collection }, 'proj_1', 'asset_1', {
      wav2vecAnalysis: { energy: [0.2] },
    }, updatedAt);

    expect(collection).toHaveBeenCalledWith(PROJECT_ASSET_ANALYSES_COLLECTION);
    expect(updateOne).toHaveBeenCalledWith(
      { projectId: 'proj_1', assetId: 'asset_1' },
      {
        $set: {
          projectId: 'proj_1',
          assetId: 'asset_1',
          updatedAt,
          wav2vecAnalysis: { energy: [0.2] },
        },
        $setOnInsert: { createdAt: updatedAt },
      },
      { upsert: true },
    );
  });

  it('fails loudly when a project id or asset id is missing', () => {
    expect(() => encodeProjectAnalysisAssetKey('  ')).toThrow('assetId is required');
    expect(() => buildProjectAssetAnalysisDocumentUpdate(' ', 'asset_1', {}, new Date())).toThrow('projectId is required');
    expect(() => buildProjectAssetAnalysisDocumentUpdate('proj_1', ' ', {}, new Date())).toThrow('assetId is required');
  });

  it('prefers richer complete canonical analysis over a stale project snapshot', async () => {
    const snapshot = {
      projectId: 'proj_1',
      assetId: 'asset_1',
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      snapshotOnly: true,
      segmentAnalysis: {
        version: 1,
        segments: [{ visual: { action: 'other' } }],
      },
    };
    const canonical = {
      userId: 'user_1',
      assetId: 'asset_1',
      status: 'complete',
      deepAnalysisVersion: 2,
      deepAnalysisUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      segmentAnalysis: {
        version: 2,
        segments: [{
          semanticVisual: {
            windows: [{ startSec: 0, endSec: 2, subjects: ['garment sketch'] }],
          },
        }],
      },
    };
    const projectFind = vi.fn().mockReturnValue({ toArray: async () => [snapshot] });
    const canonicalFind = vi.fn().mockReturnValue({ toArray: async () => [canonical] });
    const db = {
      collection: (name: string) => ({
        find: name === PROJECT_ASSET_ANALYSES_COLLECTION ? projectFind : canonicalFind,
      }),
    };

    const result = await loadCanonicalProjectAssetAnalyses(db, {
      projectId: 'proj_1',
      userId: 'user_1',
      assetIds: ['asset_1'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      projectId: 'proj_1',
      assetId: 'asset_1',
      snapshotOnly: true,
      deepAnalysisVersion: 2,
      segmentAnalysis: canonical.segmentAnalysis,
    });
    expect(projectFind).toHaveBeenCalledWith({
      projectId: 'proj_1',
      assetId: { $in: ['asset_1'] },
    });
    expect(canonicalFind).toHaveBeenCalledWith({
      userId: 'user_1',
      assetId: { $in: ['asset_1'] },
      status: 'complete',
    });
  });

  it('keeps a newer rich project snapshot and preserves requested asset order', async () => {
    const projectSnapshots = [
      {
        projectId: 'proj_1',
        assetId: 'asset_2',
        deepAnalysisVersion: 3,
        segmentAnalysis: {
          segments: [{
            semanticVisual: { windows: [{ startSec: 4, endSec: 6, subjects: ['new'] }] },
          }],
        },
      },
      {
        projectId: 'proj_1',
        assetId: 'asset_1',
        updatedAt: new Date('2026-07-21T00:00:00.000Z'),
        segmentAnalysis: { segments: [{ visual: { action: 'project-only' } }] },
      },
    ];
    const canonicalAssets = [{
      userId: 'user_1',
      assetId: 'asset_2',
      status: 'complete',
      deepAnalysisVersion: 2,
      segmentAnalysis: {
        segments: [{
          semanticVisual: { windows: [{ startSec: 1, endSec: 3, subjects: ['old'] }] },
        }],
      },
    }];
    const db = {
      collection: (name: string) => ({
        find: () => ({
          toArray: async () => (
            name === PROJECT_ASSET_ANALYSES_COLLECTION ? projectSnapshots : canonicalAssets
          ),
        }),
      }),
    };

    const result = await loadCanonicalProjectAssetAnalyses(db, {
      projectId: 'proj_1',
      userId: 'user_1',
      assetIds: ['asset_1', 'asset_2', 'asset_1'],
    });

    expect(result.map((analysis) => analysis.assetId)).toEqual(['asset_1', 'asset_2']);
    expect(result[0]).toMatchObject(projectSnapshots[1]);
    expect(result[1]).toMatchObject(projectSnapshots[0]);
  });

  it('returns no analysis when neither scoped nor same-user canonical evidence exists', async () => {
    const collection = vi.fn(() => ({
      find: vi.fn().mockReturnValue({
        toArray: async () => [],
      }),
    }));

    const result = await loadCanonicalProjectAssetAnalyses({ collection }, {
      projectId: 'proj_1',
      userId: 'user_1',
      assetIds: ['asset_1'],
    });

    expect(result).toEqual([]);
  });
});
