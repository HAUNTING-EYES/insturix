import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTranscription,
  transcribeLeasedMediaSourceWithProviderV2,
} from '@/lib/editron/services/media/transcription-service';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  getAnalysisModel: vi.fn(),
  getR2PresignedReadUrl: vi.fn(),
  isR2Available: vi.fn(),
  refreshSignedUrl: vi.fn(),
  transcribeMedia: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: mocks.getDatabase,
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: mocks.isR2Available,
  getR2PresignedReadUrl: mocks.getR2PresignedReadUrl,
}));

vi.mock('@/lib/editron/services/gcs-service', () => ({
  refreshSignedUrl: mocks.refreshSignedUrl,
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: mocks.falConfig,
    subscribe: mocks.falSubscribe,
  },
}));

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getAnalysisModel: mocks.getAnalysisModel,
}));

vi.mock('@/lib/editron/services/deepgram-service', () => ({
  transcribeMedia: mocks.transcribeMedia,
}));

describe('transcription provider timing basis V2', () => {
  const originalXaiKey = process.env.XAI_API_KEY;
  const originalGrokKey = process.env.GROK_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.XAI_API_KEY;
    delete process.env.GROK_API_KEY;
    mocks.isR2Available.mockReturnValue(false);

    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collections = {
      mediaAssets: {
        findOne: vi.fn().mockResolvedValue({
          assetId: 'asset-1',
          userId: 'user-1',
          type: 'audio',
          source: 'upload',
          cachedUrl: 'https://media.example.com/asset-1.wav',
        }),
        updateOne,
      },
      storyboards: {
        findOne: vi.fn().mockResolvedValue(null),
      },
    };
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: keyof typeof collections) => collections[name]),
    });
    mocks.transcribeMedia.mockResolvedValue({
      words: [
        { word: 'measured', startMs: 120, endMs: 440, confidence: 0.98 },
        { word: 'speech', startMs: 460, endMs: 810, confidence: 0.97 },
      ],
      durationMs: 1_000,
      detectedLanguage: 'en',
      confidence: 0.975,
      transcript: 'measured speech',
    });
  });

  afterEach(() => {
    if (originalXaiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalXaiKey;
    if (originalGrokKey === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = originalGrokKey;
  });

  it('skips estimated Fal and Gemini routes for measured-word requests', async () => {
    const transcription = await getTranscription('asset-1', 'user-1', {
      preferWordLevel: true,
    });

    expect(transcription.transcript).toBe('measured speech');
    expect(mocks.falSubscribe).not.toHaveBeenCalled();
    expect(mocks.getAnalysisModel).not.toHaveBeenCalled();
    expect(mocks.transcribeMedia).toHaveBeenCalledWith(
      'https://media.example.com/asset-1.wav',
      expect.objectContaining({
        telemetry: expect.objectContaining({
          strategy: 'deepgram_fallback',
          preferWordLevel: true,
        }),
      }),
    );
  });

  it('uses only the lease URL even when stale asset and R2 URLs are available', async () => {
    mocks.isR2Available.mockReturnValue(true);
    mocks.getR2PresignedReadUrl.mockResolvedValue(
      'https://stale-r2.example.com/asset-1.wav',
    );
    mocks.refreshSignedUrl.mockResolvedValue({
      url: 'https://stale-gcs.example.com/asset-1.wav',
    });

    const result = await transcribeLeasedMediaSourceWithProviderV2({
      asset: {
        assetId: 'asset-1',
        userId: 'user-1',
        type: 'audio',
        filename: 'asset-1.wav',
        source: 'user-upload',
        gcsPath: 'stale/object.wav',
        cachedUrl: 'https://stale-cdn.example.com/asset-1.wav',
        urlExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
        size: 1_024,
        uploadedAt: new Date('2026-08-31T00:00:00.000Z'),
      },
      userId: 'user-1',
      sourceUrl: 'https://lease.example.com/exact-source.wav?signature=bound',
      precision: 'MEASURED_WORD_REQUIRED',
    });

    expect(result.timingEvidence.timingBasis).toBe('MEASURED_WORD');
    expect(mocks.transcribeMedia).toHaveBeenCalledWith(
      'https://lease.example.com/exact-source.wav?signature=bound',
      expect.any(Object),
    );
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.getR2PresignedReadUrl).not.toHaveBeenCalled();
    expect(mocks.refreshSignedUrl).not.toHaveBeenCalled();
  });
});
