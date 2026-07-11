import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  createProject: vi.fn(),
  deductCredits: vi.fn(),
  fetch: vi.fn(),
  getDatabase: vi.fn(),
  hydrateStorylineAnalysesForBatch: vi.fn(),
  intakeSignalsFromProject: vi.fn(),
  isR2Available: vi.fn(),
  embedScenes: vi.fn(),
  generateEditronEmbedding: vi.fn(),
  buildSignalTimeline: vi.fn(),
  buildSignalTimelineFromAnalysis: vi.fn(),
  narrativeSourceFromTimeline: vi.fn(),
  makeEmbeddingScorer: vi.fn(),
  orderStorylineWithLLM: vi.fn(),
  scenesFromAssetAnalyses: vi.fn(),
  synthesizeImageScenes: vi.fn(),
  readProjectAssetAnalyses: vi.fn(),
  refundCredits: vi.fn(),
  receiverVerify: vi.fn(),
  resolveAssetUrl: vi.fn(),
  resolveProductionBrief: vi.fn(),
  resolveEffectiveBrandWithProfile: vi.fn(),
  saveProject: vi.fn(),
  updateBatch: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify = mocks.receiverVerify;
  },
}));
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
  orderStorylineWithLLM: mocks.orderStorylineWithLLM,
}));
vi.mock('@/lib/editron/storyline/multi-asset-compose', () => ({
  buildAssetContextMap: vi.fn(() => new Map()),
  scenesFromAssetAnalyses: mocks.scenesFromAssetAnalyses,
}));
vi.mock('@/lib/editron/storyline/image-scene', () => ({
  synthesizeImageScenes: mocks.synthesizeImageScenes,
}));
vi.mock('@/lib/editron/storyline/scene-embedding', () => ({
  embedScenes: mocks.embedScenes,
  makeEmbeddingScorer: mocks.makeEmbeddingScorer,
}));
vi.mock('@/lib/editron/services/gemini-embedding', () => ({
  generateEditronEmbedding: mocks.generateEditronEmbedding,
}));
vi.mock('@/lib/editron/services/signal-registry', () => ({
  buildSignalTimeline: mocks.buildSignalTimeline,
  buildSignalTimelineFromAnalysis: mocks.buildSignalTimelineFromAnalysis,
}));
vi.mock('@/lib/editron/storyline/signal-enricher', () => ({
  narrativeSourceFromTimeline: mocks.narrativeSourceFromTimeline,
}));
vi.mock('@/lib/editron/production-brief/intake-adapter', () => ({
  intakeSignalsFromProject: mocks.intakeSignalsFromProject,
}));
vi.mock('@/lib/editron/production-brief/intake-resolver', () => ({
  resolveProductionBrief: mocks.resolveProductionBrief,
}));
vi.mock('@/lib/shared/brand-effective-resolver', () => ({
  resolveEffectiveBrandWithProfile: mocks.resolveEffectiveBrandWithProfile,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_UPLOAD_BATCHES: 'mediaUploadBatches',
    MEDIA_ASSETS: 'mediaAssets',
    PROJECTS: 'projects',
  },
  getDatabase: mocks.getDatabase,
}));

function request(body: Record<string, unknown>, internal = false): Request {
  return new Request('http://localhost/api/services/editron/auto-edit/from-batch', {
    method: 'POST',
    headers: internal ? { 'upstash-signature': 'signed-callback' } : undefined,
    body: JSON.stringify(body),
  });
}

let batchDocument: Record<string, unknown>;

function mockDb() {
  batchDocument = {
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
      transcription: { language: 'hi-en' },
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
      transcription: { language: 'hi-en' },
    },
  ];

  return {
    collection(name: string) {
      if (name === 'mediaUploadBatches') {
        return {
          findOne: vi.fn(async () => batchDocument),
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
    process.env = { ...oldEnv, QSTASH_TOKEN: 'qstash_token', QSTASH_URL: 'https://qstash.test', QSTASH_CURRENT_SIGNING_KEY: 'current_key', QSTASH_NEXT_SIGNING_KEY: 'next_key', NEXT_PUBLIC_APP_URL: 'http://app.test' };
    vi.stubGlobal('fetch', mocks.fetch);

    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.receiverVerify.mockResolvedValue(true);
    mocks.getDatabase.mockResolvedValue(mockDb());
    mocks.checkCredits.mockResolvedValue({ allowed: true, deduct: mocks.deductCredits, refund: mocks.refundCredits });
    mocks.createProject.mockResolvedValue({ projectId: 'proj_batch_1' });
    mocks.deductCredits.mockResolvedValue({ transactionId: 'credit_tx_1' });
    mocks.resolveAssetUrl.mockImplementation(async (assetId: string) => `https://cdn.test/${assetId}`);
    mocks.isR2Available.mockReturnValue(false);
    mocks.hydrateStorylineAnalysesForBatch.mockResolvedValue({
      attemptedAssetCount: 2,
      sourceAnalysisCount: 2,
      persistedAssetCount: 2,
      segmentCount: 2,
      skipped: [],
    });
    mocks.readProjectAssetAnalyses.mockResolvedValue([{
      assetId: 'video_1',
      rawFootageAnalysis: { transcription: { words: [{ word: 'Proof', startMs: 1000, endMs: 1300 }] }, originalDurationMs: 8000 },
    }, { assetId: 'image_1' }]);
    mocks.scenesFromAssetAnalyses.mockReturnValue([{ id: 'scene_video', source: 'video_1', startTime: 1, endTime: 3, durationSec: 2 }]);
    mocks.synthesizeImageScenes.mockResolvedValue([{ id: 'scene_image', source: 'image_1', startTime: 0, endTime: 4, durationSec: 4 }]);
    mocks.embedScenes.mockImplementation(async (scenes: unknown) => scenes);
    mocks.makeEmbeddingScorer.mockReturnValue('semantic-scorer');
    mocks.generateEditronEmbedding.mockResolvedValue([1, 0, 0]);
    mocks.buildSignalTimeline.mockReturnValue({ eventSignals: [{ timestampMs: 1000, signal: 'entity.name', value: 'Proof', context: 'Proof' }], gridSignals: new Map(), globalSignals: {}, fps: 30, totalFrames: 240, gridInterval: 15 });
    mocks.buildSignalTimelineFromAnalysis.mockReturnValue({ eventSignals: [], gridSignals: new Map(), globalSignals: {}, fps: 30, totalFrames: 240, gridInterval: 15 });
    mocks.narrativeSourceFromTimeline.mockReturnValue({ events: [{ timestampMs: 1000, kind: 'name', context: 'Proof' }], durationMs: 8000 });
    mocks.intakeSignalsFromProject.mockReturnValue({ requested: {} });
    mocks.resolveProductionBrief.mockReturnValue({
      output: { aspectRatio: '16:9', platform: 'youtube', targetDurationSec: null, count: 1, format: 'auto-edit' },
      brand: null,
      entryPoint: 'upload',
      sourceDurationSec: 120,
      resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
    });
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      source: 'brand_vault',
      brand: null,
      acceptedProfile: {
        narrative: { emotionalArc: { value: 0.7, confidence: 0.8 } },
        motion: { motionEnergy: { value: 0.65, confidence: 0.8 } },
        composition: { safeZones: { value: 0.8, confidence: 0.8 } },
      },
    });
    mocks.orderStorylineWithLLM.mockResolvedValue({
      planApplied: true,
      rationale: 'hook then proof image',
      storyline: {
        clips: [
          { order: 0, sourceRef: 'scene_video', source: 'video_1', in: 1, out: 3, durationSec: 2, role: 'hook', fit: 'cover' },
          { order: 1, sourceRef: 'scene_image', source: 'image_1', in: 0, out: 4, durationSec: 4, role: 'b-roll', fit: 'contain', linkFromPrev: 'therefore' },
        ],
        renderTarget: { aspectRatio: '16:9', fps: 30, width: 1920, height: 1080, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        totalDurationSec: 6,
        condensationRatio: 0.5,
        targetDurationSec: null,
      },
    });
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ messageId: 'msg_1' }), { status: 200 }));
    mocks.saveProject.mockResolvedValue(undefined);
    mocks.updateProject.mockResolvedValue({ acknowledged: true });
    mocks.updateBatch.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.unstubAllGlobals();
  });

  it('persists the request, then composes exactly once from a signed durable callback', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    const editorialPreferences = {
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.7, intensity: 0.8 },
        transitions: { mode: 'off', frequency: 1, intensity: 1 },
      },
      pacing: { mode: 'prefer', intensity: 0.35 },
      notes: 'Keep the proof sequence clear.',
    };
    const requested = await POST(request({
      uploadBatchId: 'batch_1', aspectRatio: '16:9', brandId: 'brand_1', editorialPreferences,
    }) as never);
    const requestedPayload = await requested.json();

    expect(requested.status).toBe(202);
    expect(requestedPayload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      status: 'processing',
      orchestrationStatus: 'requested',
      messageId: 'msg_1',
    }));
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();

    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'requested',
      orchestrationRequestedAt: new Date(),
    };
    const response = await POST(request({
      uploadBatchId: 'batch_1',
      editorialPreferences,
      brandId: 'brand_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 0, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      status: 'processing',
      messageId: 'msg_1',
      storylinePlan: expect.objectContaining({ source: 'storyline', planApplied: true, clipCount: 2 }),
    }));
    expect(mocks.receiverVerify).toHaveBeenCalledOnce();
    expect(mocks.deductCredits).toHaveBeenCalledOnce();
    expect(mocks.resolveEffectiveBrandWithProfile).toHaveBeenCalledWith('user_1', 'brand_1', {
      service: 'editron',
      orgId: 'org_1',
    });
    expect(mocks.intakeSignalsFromProject).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        hasBrand: true,
        brand: expect.objectContaining({
          vibe: expect.objectContaining({
            'narrative.emotionalArc': 0.7,
            'motion.motionEnergy': 0.65,
            'composition.safeZones': 0.8,
          }),
        }),
      }),
    );
    expect(mocks.resolveProductionBrief).toHaveBeenCalledWith(expect.objectContaining({ brandId: 'brand_1' }));

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
      storyline: expect.objectContaining({ source: 'storyline', order: 1, role: 'b-roll', sourceRef: 'scene_image', linkFromPrev: 'therefore' }),
    }));
    expect(savedState.overlays[1]).not.toHaveProperty('videoStartTime');
    expect(savedState.overlays[1]).not.toHaveProperty('sourceStartFrame');

    expect(mocks.synthesizeImageScenes).toHaveBeenCalledOnce();
    expect(mocks.embedScenes).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'scene_video' }),
      expect.objectContaining({ id: 'scene_image' }),
    ], expect.any(Function));
    expect(mocks.orderStorylineWithLLM).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: 'scene_video' }),
        expect.objectContaining({ id: 'scene_image' }),
      ],
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({
        ctx: expect.objectContaining({ language: 'hi-en', platform: 'youtube', targetDurationSec: null }),
        compose: { scorer: 'semantic-scorer' },
        narrativeSources: expect.any(Map),
      }),
    );

    const orderOptions = mocks.orderStorylineWithLLM.mock.calls[0][3];
    expect(orderOptions.narrativeSources.get('video_1')).toEqual(expect.objectContaining({ durationMs: 8000 }));

    expect(mocks.updateProject).toHaveBeenCalledWith(
      { projectId: 'proj_batch_1' },
      {
        $set: expect.objectContaining({
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
        }),
        $unset: { batchDeliverable: '' },
      },
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.test/v2/publish/http://app.test/api/internal/workers/director',
      expect.objectContaining({ method: 'POST' }),
    );
    const directorDispatch = mocks.fetch.mock.calls.find(
      ([url]) => String(url).includes('/api/internal/workers/director'),
    );
    expect(directorDispatch).toBeDefined();
    const directorPayload = JSON.parse(String((directorDispatch?.[1] as RequestInit).body));
    expect(directorPayload.editorialPreferences).toEqual({
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.7, intensity: 0.8 },
        transitions: { mode: 'off' },
      },
      pacing: { mode: 'prefer', intensity: 0.35 },
      notes: 'Keep the proof sequence clear.',
    });
  });
  it('does not compose or charge when another callback owns the orchestration lease', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'composing',
      orchestrationRequestedAt: new Date(),
      orchestrationLeaseUntil: new Date(Date.now() + 60_000),
    };
    mocks.updateBatch.mockResolvedValueOnce({ acknowledged: true, matchedCount: 0 });

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 1, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      projectId: 'proj_batch_1',
      status: 'processing',
      skipped: 'orchestration-lease-held',
    });
    expect(mocks.receiverVerify).toHaveBeenCalledOnce();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.hydrateStorylineAnalysesForBatch).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects multi-output requests before creating or charging for a project', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    const response = await POST(request({
      uploadBatchId: 'batch_1',
      title: 'Launch pack',
      deliverableSpecs: [
        { label: '15s Reel', platform: 'tiktok', targetDurationSec: 15 },
        { label: 'Full YouTube', platform: 'youtube', aspectRatio: '16:9', targetDurationSec: null },
      ],
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'Editron creates exactly one video per request. Choose one output specification.',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.hydrateStorylineAnalysesForBatch).not.toHaveBeenCalled();
    expect(mocks.orderStorylineWithLLM).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
