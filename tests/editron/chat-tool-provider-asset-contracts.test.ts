import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getDatabase: vi.fn(),
  dbUpdateOne: vi.fn(),
  falConfig: vi.fn(),
  falSubscribe: vi.fn(),
  recordChatSfxProviderCost: vi.fn(),
  recordProviderCostEvent: vi.fn(),
  resolveAssetUrl: vi.fn(),
  searchAndDownloadSFX: vi.fn(),
  searchStockImages: vi.fn(),
  searchStockVideos: vi.fn(),
  uploadMedia: vi.fn(),
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
    getAsset: mocks.getAsset,
    resolveAssetUrl: mocks.resolveAssetUrl,
  },
}));

vi.mock('@/lib/pipeline/pixabay-service', () => ({
  searchStockImages: mocks.searchStockImages,
  searchStockVideos: mocks.searchStockVideos,
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  searchAndDownloadSFX: mocks.searchAndDownloadSFX,
  isSFXLibraryAvailable: () => false,
  audioDescriptionToSearchQuery: (value: string) => value,
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

vi.mock('@/lib/editron/agent/chat-sfx-provider-cost', () => ({
  recordChatSfxProviderCost: mocks.recordChatSfxProviderCost,
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

vi.mock('@/lib/editron/db/mongodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/db/mongodb')>();
  return {
    ...actual,
    getDatabase: mocks.getDatabase,
  };
});

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
      assetId: 'asset-old-whoosh',
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
    {
      id: 'manual-clip',
      type: 'video',
      from: 330,
      durationInFrames: 150,
      src: 'https://cdn.example.com/manual-source.mp4',
      assetId: 'asset-manual-old',
      sourceStartFrame: 75,
      videoStartTime: 75,
      row: 0,
      left: 64,
      top: 36,
      width: 1152,
      height: 648,
      metadata: { narrativeRole: 'b-roll' },
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

function validWavBytes(): Buffer {
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  return bytes;
}

function directMutationResult(
  projectId: string,
  expectedRevision: { value: number; compatibilityUpdatedAt: string },
) {
  const committedAt = new Date(
    Date.parse(expectedRevision.compatibilityUpdatedAt) + 1_000,
  ).toISOString();
  return {
    mutationReceipt: {
      schemaVersion: 1 as const,
      projectId,
      revision: {
        schemaVersion: 1 as const,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt,
      },
      committedAt,
    },
    timelineChangeReceipt: {},
  } as any;
}

function spyOnOverlayUpdateAtRevisionV1() {
  return vi.spyOn(projectService, 'updateOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => directMutationResult(projectId, command.expectedRevision),
  );
}

function spyOnOverlayAddAtRevisionV1() {
  return vi.spyOn(projectService, 'addOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => directMutationResult(projectId, command.expectedRevision),
  );
}

describe('chat provider and user-asset tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(structuredClone(PROJECT) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('replaces the selected SFX source without changing its timeline placement', async () => {
    const updateOverlay = spyOnOverlayUpdateAtRevisionV1();
    const audioRights = {
      mediaRole: 'sfx' as const,
      source: 'library' as const,
      userChoice: 'attested' as const,
      licensed: true,
      evidence: {
        kind: 'library-license' as const,
        sourceAssetId: 'asset-paper-whoosh',
        licenseId: 'freesound:88:creative-commons-0',
      },
    };
    mocks.searchAndDownloadSFX.mockResolvedValue({
      audioUrl: 'https://cdn.example.com/paper-whoosh.wav',
      gcsPath: null,
      audioAssetId: 'asset-paper-whoosh',
      durationMs: 1200,
      audioRights,
      originalTitle: 'Soft paper whoosh',
      source: 'freesound',
    });

    const result = parseResult(await toolNamed('replace_sfx').invoke({ query: 'soft paper whoosh' }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        overlayId: 10,
        assetId: 'asset-paper-whoosh',
        title: 'Soft paper whoosh',
        duration: 1.2,
        source: 'freesound',
      },
    });
    expect(mocks.searchAndDownloadSFX).toHaveBeenCalledWith(
      'soft paper whoosh',
      'user_provider_asset',
      2,
      expect.objectContaining({
        version: 'atomic-sfx-form-v1',
        shouldPlace: true,
      }),
    );
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      expect.objectContaining({
        actorKind: 'AGENT',
        overlayId: 10,
        updates: expect.objectContaining({
          assetId: 'asset-paper-whoosh',
          content: 'https://cdn.example.com/paper-whoosh.wav',
          src: 'https://cdn.example.com/paper-whoosh.wav',
          audioRights,
          metadata: expect.objectContaining({
            source: 'chat-replace-sfx',
            provider: 'freesound',
            providerTitle: 'Soft paper whoosh',
          }),
        }),
      }),
    );
    const mutation = updateOverlay.mock.calls[0]?.[2].updates as Record<string, unknown>;
    expect(mutation.assetId).not.toBe('asset-old-whoosh');
    expect(mutation).not.toHaveProperty('from');
    expect(mutation).not.toHaveProperty('durationInFrames');
  });

  it('does not mutate SFX when the provider returns no candidates', async () => {
    vi.stubEnv('FAL_AI_API_KEY', '');
    const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
    mocks.searchAndDownloadSFX.mockResolvedValue(null);

    const result = parseResult(await toolNamed('replace_sfx').invoke({
      overlayId: 10,
      query: 'nonexistent acoustic texture',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('FAL_AI_API_KEY is not configured') },
    });
    expect(updateOverlay).not.toHaveBeenCalled();
  });

  it('generates and durably registers a replacement when the SFX catalog has no match', async () => {
    vi.stubEnv('FAL_AI_API_KEY', 'fal_test_key');
    mocks.searchAndDownloadSFX.mockResolvedValue(null);
    mocks.falSubscribe.mockResolvedValue({
      data: {
        audio_file: {
          url: 'https://v3.fal.media/files/test/replacement-sfx.wav',
        },
      },
    });
    mocks.uploadMedia.mockImplementation(async (
      _buffer: Buffer,
      _userId: string,
      _filename: string,
      _contentType: string,
      options: { customAssetId: string },
    ) => ({
      assetId: options.customAssetId,
      signedUrl: 'https://cdn.example.com/replacement-sfx.wav',
      gcsPath: null,
      r2Key: `users/user_provider_asset/${options.customAssetId}.wav`,
      urlExpiresAt: null,
      size: 44,
      contentType: 'audio/wav',
    }));
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        updateOne: mocks.dbUpdateOne,
      })),
    });
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(validWavBytes().toString('latin1'), {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    })));
    const updateOverlay = spyOnOverlayUpdateAtRevisionV1();

    const result = parseResult(await toolNamed('replace_sfx').invoke({
      overlayId: 10,
      query: 'soft paper whoosh',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        overlayId: 10,
        source: 'cassetteai',
        duration: 2,
      },
    });
    expect(mocks.searchAndDownloadSFX).toHaveBeenCalledTimes(1);
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      'cassetteai/sound-effects-generator',
      expect.objectContaining({
        input: {
          prompt: expect.stringContaining('soft paper whoosh'),
          duration: 2,
        },
      }),
    );
    const generatedAssetId = String(result.data?.assetId);
    expect(mocks.dbUpdateOne).toHaveBeenCalledWith(
      { assetId: generatedAssetId, userId: 'user_provider_asset' },
      expect.objectContaining({
        $set: expect.objectContaining({
          audioRights: expect.objectContaining({
            mediaRole: 'sfx',
            source: 'generated',
            licensed: true,
          }),
          cachedUrl: 'https://cdn.example.com/replacement-sfx.wav',
        }),
        $setOnInsert: expect.objectContaining({
          assetId: generatedAssetId,
          source: 'cassetteai',
          r2Key: `users/user_provider_asset/${generatedAssetId}.wav`,
          contentType: 'audio/wav',
        }),
      }),
      { upsert: true },
    );
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      expect.objectContaining({
        overlayId: 10,
        updates: expect.objectContaining({
          assetId: generatedAssetId,
          content: 'https://cdn.example.com/replacement-sfx.wav',
          src: 'https://cdn.example.com/replacement-sfx.wav',
          metadata: expect.objectContaining({
            source: 'chat-replace-sfx',
            provider: 'cassetteai',
          }),
        }),
      }),
    );
  });

  it('uses the dedicated CassetteAI SFX contract and persists renderable WAV rights', async () => {
    vi.stubEnv('FAL_AI_API_KEY', 'fal_test_key');
    mocks.searchAndDownloadSFX.mockResolvedValue(null);
    mocks.falSubscribe.mockResolvedValue({
      data: {
        audio_file: {
          url: 'https://v3.fal.media/files/test/chat-sfx.wav',
        },
      },
    });
    mocks.uploadMedia.mockImplementation(async (
      _buffer: Buffer,
      _userId: string,
      _filename: string,
      _contentType: string,
      options: { customAssetId: string },
    ) => ({
      assetId: options.customAssetId,
      signedUrl: 'https://cdn.example.com/chat-sfx.wav',
      gcsPath: null,
    }));
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        updateOne: mocks.dbUpdateOne,
      })),
    });
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(validWavBytes().toString('latin1'), {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    })));
    const addOverlay = spyOnOverlayAddAtRevisionV1();

    const result = parseResult(await toolNamed('add_sfx').invoke({
      query: 'directional paper whoosh',
      durationSeconds: 45,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        duration: 30,
        source: 'cassetteai',
      },
    });
    expect(mocks.falConfig).toHaveBeenCalledWith({ credentials: 'fal_test_key' });
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      'cassetteai/sound-effects-generator',
      {
        input: {
          prompt: 'directional paper whoosh, sound effect, ambient audio, no vocals, no music',
          duration: 30,
        },
        logs: true,
        pollInterval: 3000,
      },
    );
    const generatedAssetId = String(result.data?.assetId);
    expect(mocks.uploadMedia).toHaveBeenCalledWith(
      expect.any(Buffer),
      'user_provider_asset',
      `${generatedAssetId}.wav`,
      'audio/wav',
      { customAssetId: generatedAssetId },
    );
    const audioRights = {
      mediaRole: 'sfx',
      source: 'generated',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'generated-provider',
        sourceAssetId: generatedAssetId,
        licenseId: 'fal-ai:cassetteai/sound-effects-generator:commercial-use',
      },
    };
    expect(mocks.dbUpdateOne).toHaveBeenCalledWith(
      { assetId: generatedAssetId },
      expect.objectContaining({
        $set: { audioRights },
        $setOnInsert: expect.objectContaining({
          assetId: generatedAssetId,
          filename: `${generatedAssetId}.wav`,
          source: 'cassetteai',
        }),
      }),
      { upsert: true },
    );
    expect(addOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      expect.objectContaining({
        actorKind: 'AGENT',
        expectedRevision: expect.objectContaining({ value: 0 }),
        overlay: expect.objectContaining({
          assetId: generatedAssetId,
          content: 'https://cdn.example.com/chat-sfx.wav',
          src: 'https://cdn.example.com/chat-sfx.wav',
          audioRights,
          metadata: expect.objectContaining({
            source: 'chat-add-sfx',
            provider: 'cassetteai',
          }),
        }),
      }),
    );
    expect(mocks.recordChatSfxProviderCost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      providerBranch: 'cassetteai_fallback',
      model: 'cassetteai/sound-effects-generator',
      requestedDurationSec: 30,
      generatedMediaSeconds: 30,
      outputCount: 1,
      providerOutputProduced: true,
      bytesOut: 44,
    }));
  });

  it('records Mirelo output count and duration before placing generated scene SFX', async () => {
    vi.stubEnv('FAL_AI_API_KEY', 'fal_test_key');
    mocks.searchAndDownloadSFX.mockResolvedValue(null);
    mocks.falSubscribe.mockResolvedValue({
      data: {
        audio: [
          { url: 'https://v3.fal.media/files/test/mirelo-a.wav' },
        ],
      },
    });
    mocks.uploadMedia.mockResolvedValue({
      assetId: 'asset-mirelo',
      signedUrl: 'https://cdn.example.com/mirelo.wav',
      gcsPath: null,
    });
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        updateOne: mocks.dbUpdateOne,
      })),
    });
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(validWavBytes().toString('latin1'), {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    })));
    spyOnOverlayAddAtRevisionV1();

    const result = parseResult(await toolNamed('add_sfx').invoke({
      query: 'subtle textile movement',
      sceneIndex: 0,
      durationSeconds: 4,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        duration: 4,
        source: 'mirelo-video-to-audio',
      },
    });
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      'mirelo-ai/sfx-v1.5/video-to-audio',
      expect.objectContaining({
        input: expect.objectContaining({
          duration: 4,
          num_samples: 1,
        }),
      }),
    );
    expect(mocks.recordChatSfxProviderCost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      assetId: 'asset-mirelo',
      providerBranch: 'mirelo_video_to_audio',
      requestedDurationSec: 4,
      generatedMediaSeconds: 4,
      outputCount: 1,
      providerOutputProduced: true,
      bytesOut: 44,
    }));
  });

  it('records a zero-cost CassetteAI failure when Fal produces no output', async () => {
    vi.stubEnv('FAL_AI_API_KEY', 'fal_test_key');
    mocks.searchAndDownloadSFX.mockResolvedValue(null);
    mocks.falSubscribe.mockRejectedValue(new Error('provider unavailable'));

    const result = JSON.parse(await toolNamed('add_sfx').invoke({
      query: 'impossible acoustic texture',
      durationSeconds: 6,
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('all failed') },
    });
    expect(mocks.recordChatSfxProviderCost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      providerBranch: 'cassetteai_fallback',
      model: 'cassetteai/sound-effects-generator',
      requestedDurationSec: 6,
      generatedMediaSeconds: 0,
      outputCount: 0,
      providerOutputProduced: false,
      error: expect.any(Error),
    }));
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });

  it('keeps provider rights attached at every automated SFX overlay producer', () => {
    const edlSource = readFileSync(new URL('../../lib/editron/services/edl-executor.ts', import.meta.url), 'utf8');
    const transitionSource = readFileSync(new URL('../../lib/editron/services/transition-sfx-placer.ts', import.meta.url), 'utf8');

    expect(edlSource).toContain("audioRights: SFXLibraryResult['audioRights']");
    expect(edlSource).toContain('audioRights: result.audioRights');
    expect(edlSource).toContain('audioRights: cached.audioRights');
    expect(transitionSource).toContain("audioRights: SFXLibraryResult['audioRights']");
    expect(transitionSource).toContain('audioRights: sfx.result.audioRights');
  });

  it('searches stock video with the requested duration constraints without mutating the project', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
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
        results: [{ id: 701, duration: 8, tags: ['embroidery', 'hands', 'craft', 'needle', 'textile'] }],
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
      data: { results: [{ id: 801, width: 1920, height: 1080 }] },
    });
    expect(mocks.searchStockImages).toHaveBeenCalledWith('fashion moodboard', { limit: 2 });
  });

  it('swaps a scene to resolved user footage while preserving timing and geometry', async () => {
    mocks.getAsset.mockResolvedValue({ assetId: 'asset-user-embroidery', type: 'video' });
    mocks.resolveAssetUrl.mockResolvedValue('https://cdn.example.com/user-embroidery.mp4');
    const updateOverlay = spyOnOverlayUpdateAtRevisionV1();

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      sceneIndex: 2,
      assetId: 'asset-user-embroidery',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        overlayId: 20,
        sceneIndex: 2,
        oldAssetId: 'asset-generated',
        newAssetId: 'asset-user-embroidery',
      },
    });
    expect(mocks.resolveAssetUrl).toHaveBeenCalledWith('asset-user-embroidery', 'user_provider_asset');
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      expect.objectContaining({
        overlayId: 20,
        updates: {
          src: 'https://cdn.example.com/user-embroidery.mp4',
          assetId: 'asset-user-embroidery',
          sourceStartFrame: 0,
          videoStartTime: 0,
          metadata: {
            sceneIndex: 2,
            narrativeRole: 'proof',
            swappedFrom: 'asset-generated',
            swappedFromSourceStartFrame: 0,
            swapSource: 'user_footage',
          },
        },
      }),
    );
  });

  it('targets a manual uploaded clip by exact overlay id and resets stale source trim', async () => {
    mocks.getAsset.mockResolvedValue({ assetId: 'asset-user-detail', type: 'video' });
    mocks.resolveAssetUrl.mockResolvedValue('https://cdn.example.com/user-detail.mp4');
    const updateOverlay = spyOnOverlayUpdateAtRevisionV1();

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      overlayId: 'manual-clip',
      assetId: 'asset-user-detail',
      sourceStartFrame: 12,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: { overlayId: 'manual-clip', newAssetId: 'asset-user-detail', sourceStartFrame: 12 },
    });
    expect(updateOverlay).toHaveBeenCalledWith(
      'user_provider_asset',
      'proj_provider_asset',
      expect.objectContaining({
        overlayId: 'manual-clip',
        updates: expect.objectContaining({
          src: 'https://cdn.example.com/user-detail.mp4',
          assetId: 'asset-user-detail',
          sourceStartFrame: 12,
          videoStartTime: 12,
          metadata: expect.objectContaining({
            swappedFrom: 'asset-manual-old',
            swappedFromSourceStartFrame: 75,
          }),
        }),
      }),
    );
  });

  it('rejects conflicting overlay and scene targets without resolving the replacement asset', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      overlayId: 'manual-clip',
      sceneIndex: 2,
      assetId: 'asset-user-detail',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Video overlay manual-clip does not belong to scene 2.' },
    });
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.resolveAssetUrl).not.toHaveBeenCalled();
    expect(updateOverlay).not.toHaveBeenCalled();
  });

  it('rejects non-video replacement assets before resolving a URL', async () => {
    mocks.getAsset.mockResolvedValue({ assetId: 'asset-user-still', type: 'image' });
    const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');

    const result = parseResult(await toolNamed('use_matching_footage').invoke({
      overlayId: 'manual-clip',
      assetId: 'asset-user-still',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Asset asset-user-still is image, not video footage.' },
    });
    expect(mocks.resolveAssetUrl).not.toHaveBeenCalled();
    expect(updateOverlay).not.toHaveBeenCalled();
  });

  it('rejects missing scenes before resolving or mutating an asset', async () => {
    const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');

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
