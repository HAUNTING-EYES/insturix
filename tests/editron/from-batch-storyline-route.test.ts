import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  createProject: vi.fn(),
  deductCredits: vi.fn(),
  fetch: vi.fn(),
  getDatabase: vi.fn(),
  hydrateStorylineAnalysesForBatch: vi.fn(),
  isR2Available: vi.fn(),
  orderStorylineForProject: vi.fn(),
  readProjectAssetAnalyses: vi.fn(),
  refundCredits: vi.fn(),
  resolveAssetUrl: vi.fn(),
  resolveProductionBrief: vi.fn(),
  saveProject: vi.fn(),
  updateBatch: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    saveProject: mocks.saveProject,
  },
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    resolveAssetUrl: mocks.resolveAssetUrl,
  },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: mocks.isR2Available,
  getR2PublicUrl: vi.fn(),
}));
vi.mock('@/lib/editron/services/batch-storyline-analysis-bridge', () => ({
  hydrateStorylineAnalysesForBatch: mocks.hydrateStorylineAnalysesForBatch,
}));
vi.mock('@/lib/editron/storyline/asset-analysis-reader', () => ({
  readProjectAssetAnalyses: mocks.readProjectAssetAnalyses,
}));
vi.mock('@/lib/editron/storyline/order-storyline-service', () => ({
  orderStorylineForProject: mocks.orderStorylineForProject,
}));
vi.mock('@/lib/editron/production-brief/intake-adapter', () => ({
  intakeSignalsFromProject: vi.fn(() => ({ requested: {} })),
}));
vi.mock('@/lib/editron/production-brief/intake-resolver', () => ({
  resolveProductionBrief: mocks.resolveProductionBrief,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_UPLOAD_BATCHES: 'mediaUploadBatches',
    MEDIA_ASSETS: 'mediaAssets',
    PROJECTS: 'projects',
  },
  getDatabase: mocks.getDatabase,
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/editron/auto-edit/from-batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function mockDb() {
  const batch = {
    uploadBatchId: 'batch_1',
    userId: 'user_1',
    orgId: 'org_1',
    assetIds: ['video_1', 'image_1'],
    productionBriefIntake: { userIntent: 'make a concise product proof cut' },
  };
  const assets = [
    {
      assetId: 'video_1',
      userId: 'user_1',
      orgId: 'org_1',
      filename: 'demo.mp4',
      type: 'video',
      size: 1000,
      duration: 8,
      thumbnail: 'thumb-video.jpg',
      cachedUrl: 'cached-video.mp4',
      uploadedAt: new Date('2026-07-10T00:00:00.000Z'),
      analysisStatus: 'complete',
    },
    {
      assetId: 'image_1',
      userId: 'user_1',
      orgId: 'org_1',
      filename: 'proof.png',
      type: 'image',
      size: 500,
      thumbnail: 'thumb-image.jpg',
      cachedUrl: 'cached-image.png',
      uploadedAt: new Date('2026-07-10T00:00:01.000Z'),
      analysisStatus: 'complete',
    },
  ];

  return {
    collection(name: string) {
      if (name === 'mediaUploadBatches') {
        return {
          findOne: vi.fn(async () => batch),
          updateOne: mocks.updateBatch,
        };
      }
      if (name === 'mediaAssets') {
        return {
          find: vi.fn(() => ({
            sort: vi.fn(() => ({
              toArray: vi.fn(async () => assets),
            })),
          })),
        };
      }
      if (name === 'projects') {
        return { updateOne: mocks.updateProject };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

describe('from-batch storyline route handoff', () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    process.env = { ...oldEnv, QSTASH_TOKEN: 'qstash_token', QSTASH_URL: 'https://qstash.test', NEXT_PUBLIC_APP_URL: 'http://app.test' };
    vi.stubGlobal('fetch', mocks.fetch);

    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getDatabase.mockResolvedValue(mockDb());
    mocks.checkCredits.mockResolvedValue({ allowed: true, deduct: mocks.deductCredits, refund: mocks.refundCredits });
    mocks.createProject.mockResolvedValue({ projectId: 'proj_batch_1' });
    mocks.resolveAssetUrl.mockImplementation(async (assetId: string) => `https://cdn.test/${assetId}`);
    mocks.isR2Available.mockReturnValue(false);
    mocks.hydrateStorylineAnalysesForBatch.mockResolvedValue({
      attemptedAssetCount: 2,
      sourceAnalysisCount: 2,
      persistedAssetCount: 2,
      segmentCount: 2,
      skipped: [],
    });
    mocks.readProjectAssetAnalyses.mockResolvedValue([{ assetId: 'video_1' }, { assetId: 'image_1' }]);
    mocks.resolveProductionBrief.mockReturnValue({
      output: { aspectRatio: '16:9', platform: 'youtube', targetDurationSec: null },
    });
    mocks.orderStorylineForProject.mockResolvedValue({
      planApplied: true,
      rationale: 'hook then proof image',
      storyline: {
        clips: [
          { order: 0, sourceRef: 'scene_video', source: 'video_1', in: 1, out: 3, durationSec: 2, role: 'hook', fit: 'cover' },
          { order: 1, sourceRef: 'scene_image', source: 'image_1', in: 0, out: 4, durationSec: 4, role: 'b-roll', fit: 'contain' },
        ],
        renderTarget: { aspectRatio: '16:9', fps: 30, width: 1920, height: 1080, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        totalDurationSec: 6,
        condensationRatio: 0.5,
        targetDurationSec: null,
      },
    });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ messageId: 'msg_1' }), { status: 200 }));
    mocks.saveProject.mockResolvedValue(undefined);
    mocks.updateProject.mockResolvedValue({ acknowledged: true });
    mocks.updateBatch.mockResolvedValue({ acknowledged: true });
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.unstubAllGlobals();
  });

  it('persists composer-ordered video and image overlays before dispatching Director', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    const response = await POST(request({ uploadBatchId: 'batch_1', aspectRatio: '16:9' }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      status: 'processing',
      messageId: 'msg_1',
      storylinePlan: expect.objectContaining({ source: 'storyline', planApplied: true, clipCount: 2 }),
    }));

    expect(mocks.saveProject).toHaveBeenCalledOnce();
    const savedState = mocks.saveProject.mock.calls[0][2];
    expect(savedState.durationInFrames).toBe(180);
    expect(savedState.playerDimensions).toEqual({ width: 1920, height: 1080 });
    expect(savedState.overlays).toHaveLength(2);

    expect(savedState.overlays[0]).toEqual(expect.objectContaining({
      type: 'video',
      assetId: 'video_1',
      from: 0,
      durationInFrames: 60,
      src: 'https://cdn.test/video_1',
      videoStartTime: 30,
      sourceStartFrame: 30,
      storyline: expect.objectContaining({ source: 'storyline', order: 0, role: 'hook', sourceRef: 'scene_video' }),
    }));

    expect(savedState.overlays[1]).toEqual(expect.objectContaining({
      type: 'image',
      assetId: 'image_1',
      from: 60,
      durationInFrames: 120,
      src: 'https://cdn.test/image_1',
      content: 'https://cdn.test/image_1',
      styles: expect.objectContaining({ objectFit: 'contain' }),
      storyline: expect.objectContaining({ source: 'storyline', order: 1, role: 'b-roll', sourceRef: 'scene_image' }),
    }));
    expect(savedState.overlays[1]).not.toHaveProperty('videoStartTime');
    expect(savedState.overlays[1]).not.toHaveProperty('sourceStartFrame');

    expect(mocks.updateProject).toHaveBeenCalledWith(
      { projectId: 'proj_batch_1' },
      { $set: expect.objectContaining({
        autoEditMode: 'batch',
        autoEditStatus: 'directing_queued',
        sourceUploadBatchId: 'batch_1',
        sourceAssetIds: ['video_1', 'image_1'],
        storylinePlan: expect.objectContaining({
          source: 'storyline',
          planApplied: true,
          rationale: 'hook then proof image',
          clipCount: 2,
          composerClipCount: 2,
        }),
      }) },
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.test/v2/publish/http://app.test/api/internal/workers/director',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});