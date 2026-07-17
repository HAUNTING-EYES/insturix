import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveAssetUrl: vi.fn(),
  searchStockImages: vi.fn(),
  searchStockVideos: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
  process.env.VERCEL_URL = 'preview.example.test';
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: mocks.resolveAssetUrl,
  },
}));

vi.mock('@/lib/pipeline/pixabay-service', () => ({
  searchStockImages: mocks.searchStockImages,
  searchStockVideos: mocks.searchStockVideos,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';

const PROJECT = {
  projectId: 'proj_provider_asset',
  userId: 'user_provider_asset',
  name: 'Provider and asset fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1280, height: 720 },
  fps: 30,
  durationInFrames: 600,
  selectedOverlayId: 10,
  overlays: [
    {
      id: 10,
      type: 'sound',
      from: 90,
      durationInFrames: 45,
      src: 'https://cdn.example.com/old-whoosh.wav',
      content: 'https://cdn.example.com/old-whoosh.wav',
      role: 'sfx',
    },
    {
      id: 20,
      type: 'video',
      from: 180,
      durationInFrames: 120,
      src: 'https://cdn.example.com/generated-scene.mp4',
      assetId: 'asset-generated',
      row: 0,
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      metadata: { sceneIndex: 2, narrativeRole: 'proof' },
    },
  ],
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  visibility: 'private',
};

function toolNamed(name: string) {
  const candidate = createTools('user_provider_asset', 'proj_provider_asset')
    .find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as { invoke: (input: Record<string, unknown>) => Promise<string> };
}

function parseResult(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'error';
    data?: Record<string, any>;
    error?: { message: string; code?: string } | null;
  };
}

describe('chat provider and user-asset tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(structuredClone(PROJECT) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('replaces the selected SFX source without changing its timeline placement', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue(undefined as any);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        url: 'https://cdn.example.com/paper-whoosh.wav',
        title: 'Soft paper whoosh',
        duration: 1.2,
        source: 'freesound',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = parseResult(await toolNamed('replace_sfx').invoke({ query: 'soft paper whoosh' }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        data: { overlayId: 10, title: 'Soft paper whoosh', duration: 1.2, source: 'freesound' },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.example.test/api/services/editron/sfx-library/search?q=soft%20paper%20whoosh&limit=1',
    );
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      10,
      {
        content: 'https://cdn.example.com/paper-whoosh.wav',
        src: 'https://cdn.example.com/paper-whoosh.wav',
      },
    );
  });

  it('does not mutate SFX when the provider returns no candidates', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlay');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const result = parseResult(await toolNamed('replace_sfx').invoke({
      overlayId: 10,
      query: 'nonexistent acoustic texture',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'No SFX found for "nonexistent acoustic texture". Try different keywords.' },
    });
    expect(updateOverlay).not.toHaveBeenCalled();
  });

  it('searches stock video with the requested duration constraints without mutating the project', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlay');
    mocks.searchStockVideos.mockResolvedValue([{
      id: 701,
      videoUrl: 'https://stock.example.com/embroidery-720.mp4',
      videoUrlHD: 'https://stock.example.com/embroidery-1080.mp4',
      duration: 8,
      thumbnailUrl: 'https://stock.example.com/embroidery.jpg',
      tags: ['embroidery', 'hands', 'craft', 'needle', 'textile', 'extra'],
    }]);

    const result = parseResult(await toolNamed('search_stock_footage').invoke({
      query: 'hand embroidery close up',
      type: 'video',
      minDuration: 4,
      maxDuration: 12,
      limit: 3,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        data: {
          results: [{ id: 701, duration: 8, tags: ['embroidery', 'hands', 'craft', 'needle', 'textile'] }],
        },
      },
    });
    expect(mocks.searchStockVideos).toHaveBeenCalledWith('hand embroidery close up', {
      minDuration: 4,
      maxDuration: 12,
      limit: 3,
    });
    expect(updateOverlay).not.toHaveBeenCalled();
  });

  it('searches stock images through the image provider branch', async () => {
    mocks.searchStockImages.mockResolvedValue([{
      id: 801,
      imageUrl: 'https://stock.example.com/moodboard-large.jpg',
      previewUrl: 'https://stock.example.com/moodboard-preview.jpg',
      width: 1920,
      height: 1080,
      tags: ['fashion', 'moodboard'],
    }]);

    const result = parseResult(await toolNamed('search_stock_footage').invoke({
      query: 'fashion moodboard',
      type: 'image',
      limit: 2,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: { data: { results: [{ id: 801, width: 1920, height: 1080 }] } },
    });
    expect(mocks.searchStockImages).toHaveBeenCalledWith('fashion moodboard', { limit: 2 });
  });

  it('swaps a scene to resolved user footage while preserving timing and geometry', async () => {
    mocks.resolveAssetUrl.mockResolvedValue('https://cdn.example.com/user-embroidery.mp4');
    const updateOverlay = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue(undefined as any);

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      sceneIndex: 2,
      assetId: 'asset-user-embroidery',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        data: { sceneIndex: 2, oldAssetId: 'asset-generated', newAssetId: 'asset-user-embroidery' },
      },
    });
    expect(mocks.resolveAssetUrl).toHaveBeenCalledWith('asset-user-embroidery', 'user_provider_asset');
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      20,
      {
        src: 'https://cdn.example.com/user-embroidery.mp4',
        assetId: 'asset-user-embroidery',
        metadata: {
          sceneIndex: 2,
          narrativeRole: 'proof',
          swappedFrom: 'asset-generated',
          swapSource: 'user_footage',
        },
      },
    );
  });

  it('rejects missing scenes before resolving or mutating an asset', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlay');

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      sceneIndex: 999,
      assetId: 'asset-user-embroidery',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'No video overlay found for scene 999' },
    });
    expect(mocks.resolveAssetUrl).not.toHaveBeenCalled();
    expect(updateOverlay).not.toHaveBeenCalled();
  });
});
