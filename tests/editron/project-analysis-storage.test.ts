import { describe, expect, it } from 'vitest';

import {
  buildProjectAnalysisAssetSet,
  encodeProjectAnalysisAssetKey,
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

  it('fails loudly when an asset id is missing', () => {
    expect(() => encodeProjectAnalysisAssetKey('  ')).toThrow('assetId is required');
  });
});
