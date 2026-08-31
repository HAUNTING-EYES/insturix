import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTranscription } from '@/lib/editron/services/media/transcription-service';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  getAnalysisModel: vi.fn(),
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
  isR2Available: () => false,
  getR2PresignedReadUrl: vi.fn(),
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
});
