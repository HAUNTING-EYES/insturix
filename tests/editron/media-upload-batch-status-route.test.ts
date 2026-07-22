import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  batch: {
    uploadBatchId: 'batch_1',
    userId: 'user_1',
    assetIds: ['video_1', 'image_1'],
  } as Record<string, unknown> | null,
  assets: [] as Array<Record<string, unknown>>,
  projection: null as Record<string, unknown> | null,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: state.userId })),
}));

vi.mock('@/lib/editron/services/asset-deep-analysis', () => ({
  ASSET_DEEP_ANALYSIS_VERSION: 2,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_UPLOAD_BATCHES: 'mediaUploadBatches',
    MEDIA_ASSETS: 'mediaAssets',
  },
  getDatabase: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'mediaUploadBatches') {
        return { findOne: vi.fn(async () => state.batch) };
      }
      if (name === 'mediaAssets') {
        return {
          find: vi.fn((_filter, options) => {
            state.projection = options?.projection ?? null;
            return {
              sort: vi.fn(() => ({ toArray: vi.fn(async () => state.assets) })),
            };
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  })),
}));

import { GET } from '../../app/api/services/editron/media/batches/[uploadBatchId]/route';

function routeParams(uploadBatchId = 'batch_1') {
  return { params: Promise.resolve({ uploadBatchId }) };
}

describe('media upload batch status route', () => {
  beforeEach(() => {
    state.userId = 'user_1';
    state.batch = {
      uploadBatchId: 'batch_1',
      userId: 'user_1',
      assetIds: ['video_1', 'image_1'],
    };
    state.assets = [];
    state.projection = null;
  });

  it('does not report a video ready when semantic visual evidence is stale', async () => {
    state.assets = [{
      assetId: 'video_1',
      filename: 'clip.mp4',
      type: 'video',
      size: 100,
      analysisStatus: 'complete',
      deepAnalysisStatus: 'complete',
      deepAnalysisVersion: 1,
      deepAnalysisRetryCount: 0,
      deepAnalysisDiagnostics: {
        semanticVisualWindowCount: 4,
        providers: { semanticVisual: 'complete' },
      },
    }];

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(payload.batch).toMatchObject({
      status: 'analyzing',
      canCreateProject: false,
      counts: { queued: 1, ready: 0 },
    });
    expect(payload.batch.assets[0]).toMatchObject({
      readiness: 'queued',
      semanticVisualReadiness: 'retryable',
      blockingReason: 'semantic_visual_analysis_required',
    });
    expect(state.projection).toMatchObject({
      deepAnalysisStatus: 1,
      deepAnalysisVersion: 1,
      deepAnalysisRetryVersion: 1,
      deepAnalysisRetryCount: 1,
      deepAnalysisDiagnostics: 1,
    });
  });

  it('reports current semantic evidence ready without imposing it on images', async () => {
    state.assets = [
      {
        assetId: 'video_1',
        filename: 'clip.mp4',
        type: 'video',
        size: 100,
        analysisStatus: 'complete',
        deepAnalysisStatus: 'complete',
        deepAnalysisVersion: 2,
        deepAnalysisDiagnostics: {
          semanticVisualWindowCount: 3,
          providers: { semanticVisual: 'complete' },
        },
      },
      {
        assetId: 'image_1',
        filename: 'still.png',
        type: 'image',
        size: 20,
        analysisStatus: 'complete',
      },
    ];

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(payload.batch).toMatchObject({
      status: 'ready',
      canCreateProject: true,
      counts: { ready: 2 },
    });
    expect(payload.batch.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'video_1', semanticVisualReadiness: 'ready' }),
      expect.objectContaining({ assetId: 'image_1', semanticVisualReadiness: 'not-required' }),
    ]));
  });
});
