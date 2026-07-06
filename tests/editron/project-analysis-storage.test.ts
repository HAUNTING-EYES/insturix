import { describe, expect, it, vi } from 'vitest';

import {
  buildProjectAnalysisAssetSet,
  buildProjectAssetAnalysisDocumentUpdate,
  encodeProjectAnalysisAssetKey,
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
});