import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getSourceBoundAnalysisV2: vi.fn(),
  saveSourceBoundAnalysisV2: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_ASSETS: 'mediaAssets',
    PROJECTS: 'projects',
  },
  getDatabase: mocks.getDatabase,
}));

vi.mock('@/lib/editron/services/asset-analysis-source-cache-v2', async (importOriginal) => {
  const actual = await importOriginal<
  typeof import('@/lib/editron/services/asset-analysis-source-cache-v2')
  >();
  return {
    ...actual,
    getSourceBoundAnalysisV2: mocks.getSourceBoundAnalysisV2,
    saveSourceBoundAnalysisV2: mocks.saveSourceBoundAnalysisV2,
  };
});

import {
  createAssetAnalysisSourceBindingV2,
} from '@/lib/editron/services/asset-analysis-source-cache-v2';
import {
  createFiveTrackAnalysisInputSha256V2,
  runFullAnalysis,
  type AssetAnalysis,
} from '@/lib/editron/services/five-track-analysis';

describe('five-track exact source cache boundary V2', () => {
  beforeEach(() => {
    mocks.getDatabase.mockReset();
    mocks.getSourceBoundAnalysisV2.mockReset();
    mocks.saveSourceBoundAnalysisV2.mockReset();
  });

  it('returns an exact source-bound hit without reading the legacy assetId cache', async () => {
    const options = { durationMs: 1_000 } as const;
    const sourceBindingV2 = binding({
      analysisInputSha256: createFiveTrackAnalysisInputSha256V2(options),
    });
    const cached = completeAnalysis();
    mocks.getSourceBoundAnalysisV2.mockResolvedValue(cached);
    mocks.getDatabase.mockRejectedValue(
      new Error('LEGACY_ASSET_ID_CACHE_MUST_NOT_BE_READ'),
    );

    const result = await runFullAnalysis(
      'asset-1',
      'user-1',
      { ...options, sourceBindingV2 },
    );

    expect(result).toBe(cached);
    expect(result).toMatchObject({ _analysisCacheHit: true });
    expect(mocks.getSourceBoundAnalysisV2).toHaveBeenCalledOnce();
    expect(mocks.getSourceBoundAnalysisV2).toHaveBeenCalledWith(sourceBindingV2);
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it('rejects a valid binding for another asset before any cache or provider work', async () => {
    const options = { durationMs: 1_000 } as const;
    const sourceBindingV2 = binding({
      assetId: 'asset-2',
      analysisInputSha256: createFiveTrackAnalysisInputSha256V2(options),
    });

    await expect(runFullAnalysis('asset-1', 'user-1', {
      durationMs: 1_000,
      sourceBindingV2,
    })).rejects.toThrow('FIVE_TRACK_ANALYSIS_SOURCE_BINDING_SCOPE_MISMATCH');
    expect(mocks.getSourceBoundAnalysisV2).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it('rejects a binding created for different analysis inputs before cache work', async () => {
    const sourceBindingV2 = binding({ analysisInputSha256: 'c'.repeat(64) });

    await expect(runFullAnalysis('asset-1', 'user-1', {
      durationMs: 1_000,
      transcript: 'material transcript input',
      sourceBindingV2,
    })).rejects.toThrow('FIVE_TRACK_ANALYSIS_SOURCE_BINDING_INPUT_MISMATCH');
    expect(mocks.getSourceBoundAnalysisV2).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
});

function binding(overrides: Partial<{
  userId: string;
  assetId: string;
  analysisInputSha256: string;
}> = {}) {
  return createAssetAnalysisSourceBindingV2({
    userId: 'user-1',
    assetId: 'asset-1',
    sourceRole: 'PROXY',
    sourceVersionSha256: 'a'.repeat(64),
    storageVersionSha256: 'b'.repeat(64),
    analysisInputSha256: 'c'.repeat(64),
    ...overrides,
  });
}

function completeAnalysis(): AssetAnalysis {
  return {
    assetId: 'asset-1',
    userId: 'user-1',
    status: 'complete',
    durationMs: 1_000,
    analyzedAt: new Date('2026-08-31T12:00:00.000Z'),
    shots: [],
    motionSegments: [],
    motionPeaks: [],
    audio: null,
    keyframeAnalyses: [],
    subjectTracks: [],
    speechSegments: [],
    musicStructure: null,
    naturalCutPoints: [],
    audioSyncPoints: [],
  };
}
