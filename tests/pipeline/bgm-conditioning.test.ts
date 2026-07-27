import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conditionAudio: vi.fn(),
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: mocks.falConfig,
    subscribe: mocks.falSubscribe,
  },
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

vi.mock('@/lib/pipeline/audio-conditioning', () => ({
  conditionAudio: mocks.conditionAudio,
}));

import { generateBackgroundMusic } from '../../lib/pipeline/bgm-service';

describe('BGM pre-upload conditioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_AI_API_KEY = 'test-fal-key';
    mocks.falSubscribe.mockResolvedValue({
      data: { audio: { url: 'https://provider.test/music.mp3' } },
    });
    mocks.uploadMedia.mockResolvedValue({
      assetId: 'bgm_test',
      signedUrl: 'https://assets.test/bgm_test.flac',
      gcsPath: null,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('provider-mp3'), { status: 200 })));
  });

  it('conditions provider bytes before the only upload and returns measured evidence', async () => {
    const conditionedBuffer = Buffer.from('fLaC-conditioned');
    mocks.conditionAudio.mockResolvedValue({
      buffer: conditionedBuffer,
      contentType: 'audio/flac',
      filenameExtension: 'flac',
      targetFrames: 300,
      durationMs: 10_000,
      sourceDurationMs: 8_000,
      sampleRate: 48_000,
      channels: 2,
      measuredInputLufs: -20,
      measuredOutputLufs: -14,
      truePeakDbtp: -1,
      targetLufs: -14,
      targetTruePeakDbtp: -1,
      loudnessPlatform: 'youtube',
      wasLooped: true,
      wasTrimmed: false,
      loopsAdded: 1,
      crossfadeMs: 250,
    });

    const result = await generateBackgroundMusic('calm instrumental', 'user_1', 10, {
      conditioning: {
        targetFrames: 300,
        fps: 30,
        platform: 'youtube',
      },
    });

    expect(mocks.conditionAudio).toHaveBeenCalledWith(expect.objectContaining({
      role: 'music',
      buffer: Buffer.from('provider-mp3'),
      targetFrames: 300,
      fps: 30,
      platform: 'youtube',
    }));
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).toHaveBeenCalledWith(
      conditionedBuffer,
      'user_1',
      expect.stringMatching(/^bgm_.+\.flac$/),
      'audio/flac',
      expect.objectContaining({ customAssetId: expect.stringMatching(/^bgm_/) }),
    );
    expect(result.buffer).toBe(conditionedBuffer);
    expect(result.durationMs).toBe(10_000);
    expect(result.conditioning?.measuredOutputLufs).toBe(-14);
  });

  it('keeps the raw MP3 path unchanged when conditioning is not requested', async () => {
    const result = await generateBackgroundMusic('calm instrumental', 'user_1', 10);

    expect(mocks.conditionAudio).not.toHaveBeenCalled();
    expect(mocks.uploadMedia).toHaveBeenCalledWith(
      Buffer.from('provider-mp3'),
      'user_1',
      expect.stringMatching(/^bgm_.+\.mp3$/),
      'audio/mpeg',
      expect.any(Object),
    );
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.conditioning).toBeUndefined();
  });

  it('never uploads raw provider bytes when conditioning fails', async () => {
    mocks.conditionAudio.mockRejectedValue(new Error('normalization failed'));

    await expect(generateBackgroundMusic('calm instrumental', 'user_1', 10, {
      conditioning: { targetFrames: 300, fps: 30, platform: 'youtube' },
    })).rejects.toThrow('normalization failed');

    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });
});
