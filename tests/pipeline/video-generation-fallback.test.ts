import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateVideoClip } from '../../lib/pipeline/video-generation-service';

const mocks = vi.hoisted(() => ({
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  falStorageUpload: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: mocks.falConfig,
    subscribe: mocks.falSubscribe,
    storage: {
      upload: mocks.falStorageUpload,
    },
  },
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

describe('video generation fal fallback policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_AI_API_KEY = 'test-fal-api-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
  });

  afterEach(() => {
    delete process.env.FAL_AI_API_KEY;
    vi.unstubAllGlobals();
  });

  it('does not fallback to Kling after a selected model generated a video but upload failed', async () => {
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { video: { url: 'https://video.example/happyhorse.mp4' } },
    });
    mocks.uploadMedia.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A gentle camera push with natural ambient sound.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse')).rejects.toThrow('Failed to persist generated video (happy-horse-v1.1): storage unavailable');

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      'alibaba/happy-horse/v1.1/image-to-video',
      expect.any(Object),
    );
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('falls back once when the selected fal endpoint rejects as unsupported before generation', async () => {
    const unsupportedModel = Object.assign(new Error('not found'), {
      status: 404,
      body: { detail: 'model not found' },
    });
    mocks.falSubscribe
      .mockRejectedValueOnce(unsupportedModel)
      .mockResolvedValueOnce({
        data: { video: { url: 'https://video.example/kling.mp4' } },
      });
    mocks.uploadMedia.mockResolvedValueOnce({
      signedUrl: 'https://cdn.example/kling.mp4',
      gcsPath: 'gs://bucket/kling.mp4',
      r2Key: 'video_kling',
      assetId: 'video_kling',
    });

    const result = await generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A slow cinematic move.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse');

    expect(result.videoUrl).toBe('https://cdn.example/kling.mp4');
    expect(mocks.falSubscribe).toHaveBeenCalledTimes(2);
    expect(mocks.falSubscribe.mock.calls[0][0]).toBe('alibaba/happy-horse/v1.1/image-to-video');
    expect(mocks.falSubscribe.mock.calls[1][0]).toBe('fal-ai/kling-video/v2.1/pro/image-to-video');
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('does not fallback on fal auth failures', async () => {
    const authError = Object.assign(new Error('unauthorized'), {
      status: 401,
      body: { detail: 'invalid key' },
    });
    mocks.falSubscribe.mockRejectedValueOnce(authError);

    await expect(generateVideoClip({
      imageUrl: 'https://images.example/storyboard.png',
      motionPrompt: 'A slow cinematic move.',
      falVideoModel: 'happy-horse-v1.1',
      provider: 'fal-ai',
      durationSeconds: 3,
    }, 'smoke_happyhorse')).rejects.toThrow('happy-horse-v1.1: invalid key (auth failed');

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });
});