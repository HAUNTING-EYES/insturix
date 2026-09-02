import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAssetDeepAnalysisTimeline: vi.fn(),
  fetch: vi.fn(),
  findOne: vi.fn(),
  generateEditronEmbedding: vi.fn(),
  getDatabase: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  runFullAnalysis: vi.fn(),
  updateAnalysis: vi.fn(),
  updateMediaAsset: vi.fn(),
}));

vi.mock('@upstash/qstash/nextjs', () => ({ verifySignatureAppRouter: (handler: unknown) => handler }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/editron/services/gemini-embedding', () => ({
  EDITRON_EMBEDDING_MODEL: 'text-embedding-005',
  generateEditronEmbedding: mocks.generateEditronEmbedding,
}));
vi.mock('@/lib/editron/services/five-track-analysis', () => ({ runFullAnalysis: mocks.runFullAnalysis }));
vi.mock('@/lib/editron/services/asset-deep-analysis', () => ({
  buildAssetDeepAnalysisTimeline: mocks.buildAssetDeepAnalysisTimeline,
}));
vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

function request(): Request {
  return new Request('http://localhost/api/internal/workers/asset-analysis', {
    method: 'POST',
    body: JSON.stringify({
      assetId: 'silent_1',
      userId: 'user_1',
      type: 'video',
      url: 'https://cdn.test/silent.mp4',
      duration: 30,
      filename: 'silent.mp4',
    }),
  });
}

describe('asset-analysis visual-only contract', () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    process.env = {
      ...oldEnv,
      QSTASH_TOKEN: 'qstash_token',
      QSTASH_URL: 'https://qstash.test',
      QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
      QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
      NEXT_PUBLIC_APP_URL: 'https://app.test',
    };
    mocks.updateMediaAsset.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    mocks.updateAnalysis.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    mocks.findOne.mockResolvedValue({
      batchTranscriptionStatus: 'complete',
      batchTranscriptionSkipReason: 'no-speech',
      transcription: null,
    });
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'mediaAssets') {
          return { updateOne: mocks.updateMediaAsset, findOne: mocks.findOne };
        }
        if (name === 'asset_analyses') {
          return { updateOne: mocks.updateAnalysis, findOne: vi.fn() };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });
    mocks.runFullAnalysis.mockResolvedValue(null);
    mocks.generateEditronEmbedding.mockResolvedValue(null);
    mocks.recordProviderCostEvent.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ messageId: 'deep_1' }), { status: 200 }));
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.unstubAllGlobals();
  });

  it('continues visual analysis when transcription completed with no speech', async () => {
    const { POST } = await import('@/app/api/internal/workers/asset-analysis/route');
    const response = await POST(request() as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      success: true,
      assetId: 'silent_1',
      deepAnalysisQueued: true,
      analysisInputMode: 'visual-only',
    }));
    expect(mocks.runFullAnalysis).toHaveBeenCalledWith(
      'silent_1',
      'user_1',
      expect.objectContaining({
        videoUrl: 'https://cdn.test/silent.mp4',
        transcript: undefined,
        words: undefined,
      }),
    );
    expect(mocks.updateAnalysis).toHaveBeenCalledWith(
      { assetId: 'silent_1', userId: 'user_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          analysisInputMode: 'visual-only',
          transcriptionSkipReason: 'no-speech',
          durationMs: 30000,
        }),
      }),
      { upsert: true },
    );
    expect(mocks.updateMediaAsset).toHaveBeenCalledWith(
      { assetId: 'silent_1', userId: 'user_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          analysisStatus: 'analyzing',
          analysisInputMode: 'visual-only',
          visualOnlyReason: 'no-speech',
        }),
      }),
    );
  });

  it('still fails loud when the transcription stage never completed', async () => {
    mocks.findOne.mockResolvedValue({ batchTranscriptionStatus: 'analyzing', transcription: null });
    const { POST } = await import('@/app/api/internal/workers/asset-analysis/route');
    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    expect(mocks.runFullAnalysis).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

