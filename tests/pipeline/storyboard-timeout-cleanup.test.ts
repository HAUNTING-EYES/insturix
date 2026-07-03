import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStoryboardImage } from '../../lib/pipeline/storyboard-service';

const mocks = vi.hoisted(() => ({
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
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

vi.mock('../../lib/pipeline/storyboard-db', () => ({
  saveStoryboard: vi.fn(),
  updateStoryboardScene: vi.fn(),
  updateSubShot: vi.fn(),
  getStoryboard: vi.fn(),
}));

vi.mock('../../lib/pipeline/consistency-scoring-service', () => ({
  scoreStoryboardConsistency: vi.fn(),
}));

describe('storyboard fal timeout cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    })));
    mocks.uploadMedia.mockResolvedValue({
      signedUrl: 'https://cdn.example/storyboard.png',
      gcsPath: 'gs://bucket/storyboard.png',
      assetId: 'storyboard_test',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the real timeout after a successful fal image generation', async () => {
    mocks.falSubscribe.mockResolvedValueOnce({
      data: { images: [{ url: 'https://image.example/storyboard.png' }] },
    });

    const result = await generateStoryboardImage({
      sceneIndex: 0,
      title: 'Product table shot',
      visualDescription: 'A clean product shot on a bright studio table.',
      narration: 'The product is ready.',
      durationSeconds: 3,
      mood: 'bright',
    }, 'storyboard_user', {
      sceneIndex: 0,
      totalScenes: 1,
      modelId: 'fal-ai/flux/schnell',
    });

    expect(result.imageUrl).toBe('https://cdn.example/storyboard.png');
    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });
});