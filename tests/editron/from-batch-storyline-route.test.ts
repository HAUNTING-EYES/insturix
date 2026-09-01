import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateCreativeBrief,
  resolveCreativeBriefRequestTimeoutMs,
} from '../../lib/editron/services/creative-brief';
import {
  buildDirectorDeliveryFailureAudit,
  parseDirectorDeliveryFailure,
} from '../../lib/editron/services/director-delivery-failure';
import { ASSET_DEEP_ANALYSIS_VERSION } from '../../lib/editron/services/asset-deep-analysis';
import {
  buildMediaUploadBatchSummary,
  DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
} from '../../lib/editron/services/media-upload-batch';
import { buildDeepAnalysisFailureUpdate } from '../../lib/editron/services/semantic-visual-retry';
import type { ProductionBrief } from '../../lib/editron/production-brief/production-brief';
import { planStorylineFromScript } from '../../lib/editron/storyline/script-beat-planner';
import { makeScene } from '../../lib/editron/storyline/scene';


const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  createProject: vi.fn(),
  deductCredits: vi.fn(),
  fetch: vi.fn(),
  getDatabase: vi.fn(),
  findProject: vi.fn(),
  getAnalysisModel: vi.fn(),
  coverageGenerateContent: vi.fn(),
  getCreativeDocCachedModel: vi.fn(),
  hydrateStorylineAnalysesForBatch: vi.fn(),
  intakeSignalsFromProject: vi.fn(),
  isR2Available: vi.fn(),
  embedScenes: vi.fn(),
  generateEditronEmbedding: vi.fn(),
  buildSignalTimeline: vi.fn(),
  buildMultiAssetDirectorContext: vi.fn(),
  buildSignalTimelineFromAnalysis: vi.fn(),
  bulkWriteAssets: vi.fn(),
  updateAsset: vi.fn(),
  narrativeSourceFromTimeline: vi.fn(),
  makeEmbeddingScorer: vi.fn(),
  orderStorylineWithLLM: vi.fn(),
  scenesFromAssetAnalyses: vi.fn(),
  synthesizeImageScenes: vi.fn(),
  readProjectAssetAnalyses: vi.fn(),
  refundCredits: vi.fn(),
  refundForWallet: vi.fn(),
  receiverVerify: vi.fn(),
  resolveAssetUrl: vi.fn(),
  resolveProductionBrief: vi.fn(),
  resolveEffectiveBrandWithProfile: vi.fn(),
  recordDirectorDeliveryFailureV1: vi.fn(),
  loadProjectForMutation: vi.fn(),
  saveProjectWithReceipt: vi.fn(),
  recordPipelineDirectorIntentV1: vi.fn(),
  preparePipelineDirectorDispatchV1: vi.fn(),
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
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
}));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { refundForWallet: mocks.refundForWallet },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    recordDirectorDeliveryFailureV1: mocks.recordDirectorDeliveryFailureV1,
    loadProjectForMutation: mocks.loadProjectForMutation,
    saveProjectWithReceipt: mocks.saveProjectWithReceipt,
    recordPipelineDirectorIntentV1: mocks.recordPipelineDirectorIntentV1,
    preparePipelineDirectorDispatchV1: mocks.preparePipelineDirectorDispatchV1,
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
vi.mock('@/lib/editron/services/multi-asset-director-context', () => ({
  buildMultiAssetDirectorContext: mocks.buildMultiAssetDirectorContext,
  // assist-lane's per-asset validity predicate; fixture docs are "complete" when
  // they carry a rawFootageAnalysis (mirrors the real rule closely enough here).
  isCanonicalAnalysisComplete: (doc: unknown) =>
    Boolean((doc as { rawFootageAnalysis?: unknown } | null | undefined)?.rawFootageAnalysis),
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
vi.mock('@/lib/editron/storyline/scene-embedding', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/editron/storyline/scene-embedding')>(),
  embedScenes: mocks.embedScenes,
  makeEmbeddingScorer: mocks.makeEmbeddingScorer,
}));
vi.mock('@/lib/editron/services/gemini-embedding', () => ({
  generateEditronEmbedding: mocks.generateEditronEmbedding,
}));
vi.mock('@/lib/editron/services/gemini-context-cache', () => ({
  getCreativeDocCachedModel: mocks.getCreativeDocCachedModel,
}));
vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getAnalysisModel: mocks.getAnalysisModel,
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
let mediaAssets: Array<Record<string, any>>;

function mockDb() {
  batchDocument = {
    uploadBatchId: 'batch_1',
    userId: 'user_1',
    orgId: 'org_1',
    assetIds: ['video_1', 'image_1'],
    productionBriefIntake: { userIntent: 'make a concise product proof cut', script: 'Show the proof, then the result.' },
  };
  mediaAssets = [
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
      deepAnalysisStatus: 'complete',
      deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
      deepAnalysisDiagnostics: {
        semanticVisualWindowCount: 2,
        providers: { semanticVisual: 'complete' },
      },
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
          find: vi.fn(() => {
            const cursor = {
              toArray: vi.fn(async () => mediaAssets),
              sort: vi.fn(),
            };
            cursor.sort.mockReturnValue(cursor);
            return cursor;
          }),
          bulkWrite: mocks.bulkWriteAssets,
          updateOne: mocks.updateAsset,
        };
      }
      if (name === 'projects') {
        return { findOne: mocks.findProject, updateOne: mocks.updateProject };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

describe('vision-verified script grounding', () => {
  const scriptBrief: ProductionBrief = {
    output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null },
    brand: null,
    entryPoint: 'upload',
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
  const proofScene = makeScene({
    source: 'https://cdn.test/proof.mp4',
    startTime: 4,
    endTime: 7,
    objects: ['garment'],
    faces: [],
    detectedText: [],
    transcription: '',
    description: 'hands embroidering a garment',
    embedding: [1, 0],
  });

  function scriptLlm() {
    return vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        beats: [{ unitRefs: ['u0'], visualIntent: 'visible embroidery work', relationFromPrevious: null }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        assignments: [{ beatId: 'b0', coverage: 'covered', sceneRefs: ['c0'], evidence: 'hands embroidering' }],
      }));
  }

  it('does not execute an embedding/LLM match that visual verification rejects', async () => {
    const result = await planStorylineFromScript({
      scenes: [proofScene],
      script: 'Show the embroidery being made.',
      brief: scriptBrief,
      llm: scriptLlm(),
      queryEmbed: async () => [1, 0],
      coverageVerify: async () => ({ confirmed: false, note: 'finished garment only' }),
    });

    expect(result.status).toBe('failed');
    expect(result.failureKind).toBe('coverage_gap');
    expect(result.selectedSceneIds).toEqual([]);
    expect(result.assignments[0]).toEqual(expect.objectContaining({
      coverage: 'partial',
      verification: expect.objectContaining({ status: 'unconfirmed' }),
    }));
  });

  it('classifies verifier transport failures as retryable provider errors', async () => {
    vi.useFakeTimers();
    const coverageVerify = vi.fn()
      .mockRejectedValue(Object.assign(new Error('vision provider unavailable'), { status: 503 }));
    const pending = planStorylineFromScript({
      scenes: [proofScene],
      script: 'Show the embroidery being made.',
      brief: scriptBrief,
      llm: scriptLlm(),
      queryEmbed: async () => [1, 0],
      coverageVerify,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(coverageVerify).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('failed');
    expect(result.failureKind).toBe('provider_error');
    expect(result.assignments[0]?.verification?.status).toBe('unavailable');
  });

  it('retries a message-encoded Gemini 500 and keeps the confirmed scene', async () => {
    vi.useFakeTimers();
    const coverageVerify = vi.fn()
      .mockRejectedValueOnce(new Error(
        '[GoogleGenerativeAI Error]: Error fetching from Gemini: [500 Internal Server Error] Internal error encountered.',
      ))
      .mockResolvedValueOnce({ confirmed: true, note: 'hands visibly embroidering a garment' });
    const pending = planStorylineFromScript({
      scenes: [proofScene],
      script: 'Show the embroidery being made.',
      brief: scriptBrief,
      llm: scriptLlm(),
      queryEmbed: async () => [1, 0],
      coverageVerify,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(coverageVerify).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('planned');
    expect(result.failureKind).toBeUndefined();
    expect(result.selectedSceneIds).toEqual([proofScene.id]);
    expect(result.assignments[0]?.verification?.status).toBe('confirmed');
  });

  it('does not discard a confirmed scene when a sibling scene exhausts provider retries', async () => {
    vi.useFakeTimers();
    const alternateScene = makeScene({
      source: 'https://cdn.test/alternate-proof.mp4',
      startTime: 8,
      endTime: 11,
      objects: ['garment'],
      faces: [],
      detectedText: [],
      transcription: '',
      description: 'hands visibly embroidering a garment',
      embedding: [0.99, 0.01],
    });
    const llm = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        beats: [{ unitRefs: ['u0'], visualIntent: 'visible embroidery work', relationFromPrevious: null }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        assignments: [{ beatId: 'b0', coverage: 'covered', sceneRefs: ['c0', 'c1'], evidence: 'embroidery work' }],
      }));
    const coverageVerify = vi.fn(async (_query, scene) => {
      if (scene.id === proofScene.id) {
        throw Object.assign(new Error('vision provider unavailable'), { status: 503 });
      }
      return { confirmed: true, note: 'hands visibly embroidering a garment' };
    });
    const pending = planStorylineFromScript({
      scenes: [proofScene, alternateScene],
      script: 'Show the embroidery being made.',
      brief: scriptBrief,
      llm,
      queryEmbed: async () => [1, 0],
      coverageVerify,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(coverageVerify).toHaveBeenCalledTimes(4);
    expect(result.status).toBe('planned');
    expect(result.failureKind).toBeUndefined();
    expect(result.selectedSceneIds).toEqual([alternateScene.id]);
    expect(result.assignments[0]?.verification).toEqual(expect.objectContaining({
      status: 'confirmed',
      sceneIds: [alternateScene.id],
    }));
  });

  it('classifies malformed verifier output as a terminal invalid response', async () => {
    const result = await planStorylineFromScript({
      scenes: [proofScene],
      script: 'Show the embroidery being made.',
      brief: scriptBrief,
      llm: scriptLlm(),
      queryEmbed: async () => [1, 0],
      coverageVerify: async () => { throw new Error('Coverage verifier response omitted boolean confirmed'); },
    });

    expect(result.status).toBe('failed');
    expect(result.failureKind).toBe('invalid_response');
    expect(result.assignments[0]?.verification?.status).toBe('unavailable');
  });
});

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
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.refundForWallet.mockResolvedValue({ success: true });
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
    mocks.buildMultiAssetDirectorContext.mockReturnValue({
      rawFootageAnalysis: { timelineCoordinateSpace: 'canonical-edited-v1', transcription: { words: [{ word: 'Proof', startMs: 0, endMs: 300 }] } },
      segmentAnalysis: { version: 1, segments: [{ startMs: 0, endMs: 2000 }], globalContext: {}, meta: { segmentCount: 1 } },
      vjepaAnalysis: { segments: [{ startMs: 0, endMs: 2000 }], modelVersion: 'test', processingTimeMs: 1 },
      wav2vecAnalysis: { segments: [{ startMs: 0, endMs: 500 }], modelVersion: 'test', processingTimeMs: 1 },
      momentWeightMap: { weights: [{ segment_start_ms: 0, segment_end_ms: 2000 }], default_weight: 0.5, computation_phase: 2 },
      musicAnalysis: { bpm: 100, beats: [], sections: [], musicPresence: 0, key: null, energyCurve: [], durationMs: 2000, processingTimeMs: 1 },
      provenance: {
        version: 'multi-asset-director-context-v1',
        coordinateSpace: 'canonical-edited-v1',
        selectedVideoClipCount: 1,
        sourceAssetCount: 1,
      },
    });
    mocks.scenesFromAssetAnalyses.mockReturnValue([{ id: 'scene_video', source: 'video_1', startTime: 1, endTime: 3, durationSec: 2 }]);
    mocks.synthesizeImageScenes.mockResolvedValue([{ id: 'scene_image', source: 'image_1', startTime: 0, endTime: 4, durationSec: 4 }]);
    mocks.embedScenes.mockImplementation(async (scenes: unknown) => scenes);
    mocks.makeEmbeddingScorer.mockReturnValue('semantic-scorer');
    mocks.generateEditronEmbedding.mockResolvedValue([1, 0, 0]);
    mocks.coverageGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ confirmed: true, note: 'visible proof' }) },
    });
    mocks.getAnalysisModel.mockResolvedValue({ generateContent: mocks.coverageGenerateContent });
    mocks.buildSignalTimeline.mockReturnValue({ eventSignals: [{ timestampMs: 1000, signal: 'entity.name', value: 'Proof', context: 'Proof' }], gridSignals: new Map(), globalSignals: {}, fps: 30, totalFrames: 240, gridInterval: 15 });
    mocks.buildSignalTimelineFromAnalysis.mockReturnValue({ eventSignals: [], gridSignals: new Map(), globalSignals: {}, fps: 30, totalFrames: 240, gridInterval: 15 });
    mocks.bulkWriteAssets.mockImplementation(async (operations: Array<any>) => {
      let modifiedCount = 0;
      for (const operation of operations) {
        const asset = mediaAssets.find((entry) => entry.assetId === operation.updateOne?.filter?.assetId);
        if (!asset || asset.analysisStatus === 'complete') continue;
        Object.assign(asset, operation.updateOne.update.$set);
        modifiedCount += 1;
      }
      return { acknowledged: true, modifiedCount };
    });
    mocks.updateAsset.mockImplementation(async (filter: Record<string, any>, update: Record<string, any>) => {
      const asset = mediaAssets.find((entry) => entry.assetId === filter.assetId);
      if (!asset) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      if (update.$set) Object.assign(asset, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete asset[key];
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
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
    mocks.loadProjectForMutation.mockResolvedValue({
      project: {
        projectId: 'proj_batch_1',
        userId: 'user_1',
        overlays: [],
        aspectRatio: '16:9',
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 0,
      },
      revision: { schemaVersion: 1, value: 1, compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z' },
    });
    mocks.saveProjectWithReceipt.mockResolvedValue({
      schemaVersion: 1,
      projectId: 'proj_batch_1',
      revision: { schemaVersion: 1, value: 2, compatibilityUpdatedAt: '2026-09-01T00:00:01.000Z' },
      committedAt: '2026-09-01T00:00:01.000Z',
    });
    mocks.recordPipelineDirectorIntentV1.mockResolvedValue({
      disposition: 'RECORDED',
      receipt: {
        schemaVersion: 1,
        projectId: 'proj_batch_1',
        revision: { schemaVersion: 1, value: 3, compatibilityUpdatedAt: '2026-09-01T00:00:02.000Z' },
        committedAt: '2026-09-01T00:00:02.000Z',
      },
    });
    mocks.preparePipelineDirectorDispatchV1.mockResolvedValue({
      disposition: 'PREPARED',
      dispatch: {
        schemaVersion: 1,
        batchId: 'batch_1',
        profileId: 'A-01',
        dispatchToken: 'pipeline_director_dispatch_batch_1',
        preparedAt: '2026-09-01T00:00:03.000Z',
      },
    });
    mocks.updateProject.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    mocks.findProject.mockResolvedValue(null);
    mocks.updateBatch.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.unstubAllGlobals();
  });

  it('rejects missing production queue configuration before reading a batch or charging credits', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    delete process.env.QSTASH_TOKEN;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');

    const response = await POST(request({ uploadBatchId: 'batch_1' }) as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Durable batch orchestration is unavailable because its publisher token or signing keys are not configured.',
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('derives video readiness from semantic capability evidence instead of aggregate completion', () => {
    const requirements = {
      semanticVisual: {
        version: ASSET_DEEP_ANALYSIS_VERSION,
        maxRetries: DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
      },
    };
    const summary = buildMediaUploadBatchSummary([
      {
        assetId: 'semantic-ready', filename: 'ready.mp4', type: 'video', size: 1, analysisStatus: 'complete',
        deepAnalysisStatus: 'complete', deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
        deepAnalysisDiagnostics: { semanticVisualWindowCount: 2, providers: { semanticVisual: 'complete' } },
      },
      {
        assetId: 'stale', filename: 'stale.mp4', type: 'video', size: 1, analysisStatus: 'complete',
        deepAnalysisStatus: 'complete', deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION - 1,
      },
      {
        assetId: 'pending', filename: 'pending.mp4', type: 'video', size: 1, analysisStatus: 'complete',
        deepAnalysisStatus: 'queued', deepAnalysisTargetVersion: ASSET_DEEP_ANALYSIS_VERSION,
      },
      {
        assetId: 'exhausted', filename: 'exhausted.mp4', type: 'video', size: 1, analysisStatus: 'complete',
        deepAnalysisStatus: 'degraded', deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
        deepAnalysisRetryVersion: ASSET_DEEP_ANALYSIS_VERSION,
        deepAnalysisRetryCount: DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
        deepAnalysisDiagnostics: { semanticVisualWindowCount: 0, providers: { semanticVisual: 'missing' } },
      },
      { assetId: 'image', filename: 'proof.png', type: 'image', size: 1, analysisStatus: 'complete' },
    ], requirements);

    expect(summary.counts).toMatchObject({ total: 5, ready: 2, queued: 2, failed: 1 });
    expect(summary.assets.find((asset) => asset.assetId === 'semantic-ready')).toMatchObject({
      readiness: 'ready', semanticVisualReadiness: 'ready', blockingReason: null,
    });
    expect(summary.assets.find((asset) => asset.assetId === 'stale')).toMatchObject({
      readiness: 'queued', semanticVisualReadiness: 'retryable', blockingReason: 'semantic_visual_analysis_required',
    });
    expect(summary.assets.find((asset) => asset.assetId === 'exhausted')).toMatchObject({
      readiness: 'failed', semanticVisualReadiness: 'failed', needsAttention: true,
    });

    const completedAt = new Date('2026-07-22T00:00:00.000Z');
    expect(buildDeepAnalysisFailureUpdate('provider failed', completedAt)).toEqual({
      $set: {
        analysisStatus: 'complete',
        deepAnalysisStatus: 'failed',
        deepAnalysisError: 'provider failed',
        deepAnalysisCompletedAt: completedAt,
      },
      $unset: { analysisError: '', deepAnalysisTargetVersion: '' },
    });
  });

  it('atomically requeues degraded semantic video analysis before composition', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    Object.assign(mediaAssets[0], {
      deepAnalysisStatus: 'degraded',
      deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
      deepAnalysisDiagnostics: { semanticVisualWindowCount: 0, providers: { semanticVisual: 'missing' } },
    });
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(),
    };

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 1, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual(expect.objectContaining({ orchestrationStatus: 'waiting_analysis' }));
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'video_1',
        deepAnalysisStatus: { $nin: ['queued', 'analyzing'] },
        deepAnalysisTargetVersion: { $ne: ASSET_DEEP_ANALYSIS_VERSION },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          analysisStatus: 'analyzing',
          deepAnalysisStatus: 'queued',
          deepAnalysisRetryCount: 1,
        }),
      }),
    );
    const deepDispatch = mocks.fetch.mock.calls.find(
      ([url]) => String(url).includes('/api/internal/workers/asset-deep-analysis'),
    );
    expect(deepDispatch).toBeDefined();
    expect(JSON.parse(String((deepDispatch?.[1] as RequestInit).body))).toEqual({
      assetId: 'video_1',
      userId: 'user_1',
      url: 'https://cdn.test/video_1',
      duration: 8,
    });
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          orchestrationSemanticRetryAssetIds: ['video_1'],
          orchestrationSemanticRetryOutcomes: [
            { assetId: 'video_1', status: 'queued', retryCount: 1 },
          ],
        }),
      }),
    );
  });

  it('bounds semantic dispatch retries and composes from truthful survivors', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    Object.assign(mediaAssets[0], {
      deepAnalysisStatus: 'degraded',
      deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
      deepAnalysisDiagnostics: { semanticVisualWindowCount: 0, providers: { semanticVisual: 'missing' } },
    });
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(),
    };
    let semanticDispatchAttempts = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (!url.includes('/api/internal/workers/asset-deep-analysis')) {
        return new Response(JSON.stringify({ messageId: 'msg_1' }), { status: 200 });
      }
      semanticDispatchAttempts += 1;
      if (semanticDispatchAttempts === 1) throw new Error('network unavailable');
      return new Response('provider unavailable', { status: 503 });
    });

    const first = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 1, failureCount: 0 },
    }, true) as never);
    expect(first.status).toBe(202);
    expect(mediaAssets[0]).toMatchObject({
      analysisStatus: 'complete',
      deepAnalysisStatus: 'dispatch_failed',
      deepAnalysisRetryCount: 1,
    });

    const second = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 2, failureCount: 0 },
    }, true) as never);

    expect(second.status).toBe(200);
    expect(mediaAssets[0]).toMatchObject({
      analysisStatus: 'complete',
      deepAnalysisStatus: 'dispatch_failed',
      deepAnalysisRetryCount: DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
    });
    expect(mocks.fetch.mock.calls.filter(
      ([url]) => String(url).includes('/api/internal/workers/asset-deep-analysis'),
    )).toHaveLength(DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT);
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledOnce();
    expect(mocks.saveProjectWithReceipt.mock.calls[0][2].overlays).toEqual([
      expect.objectContaining({ type: 'image', assetId: 'image_1' }),
    ]);
    expect(mocks.saveProjectWithReceipt.mock.calls[0][3]).toEqual(expect.objectContaining({
      projectUpdates: expect.objectContaining({ sourceAssetIds: ['image_1'] }),
    }));
  });

  it('assist lane: chronological lay-down + evidence hydration, storyline and director never run', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(),
    };
    mocks.findProject.mockResolvedValue({
      editMode: 'assist',
      projectRevision: 2,
      updatedAt: new Date('2026-09-01T00:00:01.000Z'),
    });

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 1, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      status: 'ready_for_chat',
      clipCount: 2,
      degradedAssetIds: [],
    }));

    // Zero-edit invariant: both assets laid down in uploadedAt order, video untrimmed at full 8s.
    expect(mocks.saveProject).toHaveBeenCalledOnce();
    const overlays = mocks.saveProject.mock.calls[0][2].overlays as Array<Record<string, unknown>>;
    expect(overlays.map((o) => o.assetId)).toEqual(['video_1', 'image_1']);
    expect(overlays[0]).toMatchObject({ type: 'video', sourceStartFrame: 0, videoStartTime: 0, durationInFrames: 240 });

    // The load-bearing negatives: NO storyline machinery, NO director handoff.
    expect(mocks.orderStorylineWithLLM).not.toHaveBeenCalled();
    expect(mocks.scenesFromAssetAnalyses).not.toHaveBeenCalled();
    expect(mocks.synthesizeImageScenes).not.toHaveBeenCalled();
    expect(mocks.embedScenes).not.toHaveBeenCalled();

    // Hydration wrote the project-level evidence fields chat grounds in + the lane status.
    // Filter carries the cancel-wins guard: a cancelled project is never resurrected.
    expect(mocks.buildMultiAssetDirectorContext).toHaveBeenCalledOnce();
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_batch_1',
        userId: 'user_1',
        editMode: 'assist',
        assistCreditTransactionId: 'credit_tx_1',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          autoEditStatus: 'ready_for_chat',
          assistDegradedAssetIds: [],
          rawFootageAnalysis: expect.anything(),
          segmentAnalysis: expect.anything(),
          multiAssetDirectorContext: expect.anything(),
        }),
      }),
    );
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ uploadBatchId: 'batch_1' }),
      expect.objectContaining({ $set: expect.objectContaining({ orchestrationStatus: 'assist_ready' }) }),
    );

    // Assist deducts at lay-down (REV 5 #5) — the deduction that precedes the divergence fired.
    expect(mocks.deductCredits).toHaveBeenCalledOnce();
  });

  it('assist lane: a terminal compose failure refunds and surfaces scan_failed, never auto failed', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(),
    };
    mocks.findProject
      .mockResolvedValueOnce({
        editMode: 'assist',
        projectRevision: 2,
        updatedAt: new Date('2026-09-01T00:00:01.000Z'),
      })
      .mockResolvedValueOnce({
        editMode: 'assist',
        autoEditStatus: 'composing',
        projectRevision: 3,
        updatedAt: new Date('2026-09-01T00:00:02.000Z'),
      })
      .mockResolvedValue({
        editMode: 'assist',
        autoEditStatus: 'composing',
        assistCreditTransactionId: 'credit_tx_1',
        assistChargedCredits: 10,
        userId: 'user_1',
        projectRevision: 4,
        updatedAt: new Date('2026-09-01T00:00:03.000Z'),
      });
    mocks.saveProject.mockRejectedValue(new Error('storage write exploded'));

    await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 1, failureCount: 99 },
    }, true) as never);

    // The deduction preceded the failure and no director was dispatched → full refund.
    expect(mocks.refundForWallet).toHaveBeenCalledOnce();
    // The user-facing truth is the lane's failure state, not auto's.
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_batch_1',
        userId: 'user_1',
        assistCreditTransactionId: 'credit_tx_1',
      }),
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'scan_failed', assistRefundPending: true }) }),
    );
    expect(mocks.orderStorylineWithLLM).not.toHaveBeenCalled();
  });

  it('repairs an already-ready Assist batch projection without charging or composing again', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'composing',
      orchestrationRequestedAt: new Date(),
    };
    mocks.findProject.mockResolvedValue({ editMode: 'assist', autoEditStatus: 'ready_for_chat' });

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 2, failureCount: 0 },
    }, true) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: 'ready_for_chat',
      recoveredBatchProjection: true,
    });
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_batch_1' }),
      expect.objectContaining({ $set: expect.objectContaining({ orchestrationStatus: 'assist_ready' }) }),
    );
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
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
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledOnce();
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'proj_batch_1',
      expect.objectContaining({
        aspectRatio: '16:9',
        playerDimensions: { width: 1920, height: 1080 },
      }),
      expect.objectContaining({
        expectedRevision: expect.objectContaining({ value: 1 }),
        projectUpdates: expect.objectContaining({
          editMode: 'auto',
          autoEditMode: 'batch',
          autoEditStatus: 'analyzing',
          sourceUploadBatchId: 'batch_1',
        }),
      }),
    );
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

    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledTimes(2);
    const savedState = mocks.saveProjectWithReceipt.mock.calls[1][2];
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
    expect(mocks.buildMultiAssetDirectorContext).toHaveBeenCalledWith({
      analyses: expect.any(Array),
      overlays: savedState.overlays,
      fps: 30,
      durationInFrames: 180,
    });


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
        hasScript: true,
        script: 'Show the proof, then the result.',
        scriptQueryEmbed: expect.any(Function),
        scriptCoverageVerify: expect.any(Function),
      }),
    );

    const orderOptions = mocks.orderStorylineWithLLM.mock.calls[0][3];
    expect(orderOptions.narrativeSources.get('video_1')).toEqual(expect.objectContaining({ durationMs: 8000 }));
    const verified = await orderOptions.scriptCoverageVerify(
      { text: 'show the visible proof' },
      makeScene({
        source: 'https://cdn.test/video_1.mp4',
        startTime: 1,
        endTime: 3,
        objects: [],
        faces: [],
        detectedText: [],
        transcription: '',
      }),
    );
    expect(verified).toEqual({ confirmed: true, note: 'visible proof' });
    expect(mocks.coverageGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [expect.objectContaining({
        parts: [
          {
            fileData: { fileUri: 'https://cdn.test/video_1.mp4', mimeType: 'video/mp4' },
            videoMetadata: { startOffset: '1.000s', endOffset: '3.000s' },
          },
          expect.objectContaining({ text: expect.stringContaining('1.00s-3.00s') }),
        ],
      })],
      generationConfig: expect.objectContaining({
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            confirmed: { type: 'boolean' },
            note: { type: 'string' },
          },
          required: ['confirmed', 'note'],
        },
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 256,
      }),
    }));
    expect(mocks.generateEditronEmbedding).toHaveBeenCalledWith(
      'make a concise product proof cut\n\nShow the proof, then the result.',
      { taskType: 'RETRIEVAL_QUERY' },
    );

    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'proj_batch_1',
      expect.any(Object),
      expect.objectContaining({
        expectedRevision: expect.objectContaining({ value: 1 }),
        overlayAuthority: 'server',
        projectUpdates: expect.objectContaining({
          autoEditMode: 'batch',
          autoEditStatus: 'analysis_complete',
          sourceUploadBatchId: 'batch_1',
          sourceAssetIds: ['video_1', 'image_1'],
          rawFootageAnalysis: expect.objectContaining({ timelineCoordinateSpace: 'canonical-edited-v1' }),
          segmentAnalysis: expect.objectContaining({ version: 1 }),
          vjepaAnalysis: expect.objectContaining({ modelVersion: 'test' }),
          wav2vecAnalysis: expect.objectContaining({ modelVersion: 'test' }),
          momentWeightMap: expect.objectContaining({ computation_phase: 2 }),
          musicAnalysis: expect.objectContaining({ bpm: 100 }),
          multiAssetDirectorContext: expect.objectContaining({ coordinateSpace: 'canonical-edited-v1' }),
          storylinePlan: expect.objectContaining({
            source: 'storyline',
            planApplied: true,
            rationale: 'hook then proof image',
            clipCount: 2,
            composerClipCount: 2,
          }),
        }),
      }),
    );
    expect(mocks.recordPipelineDirectorIntentV1).toHaveBeenCalledWith('user_1', 'proj_batch_1', {
      expectedRevision: expect.objectContaining({ value: 2 }),
      profileId: 'A-01',
    });
    expect(mocks.preparePipelineDirectorDispatchV1).toHaveBeenCalledWith('user_1', 'proj_batch_1', {
      expectedRevision: expect.objectContaining({ value: 3 }),
      batchId: 'batch_1',
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.test/v2/publish/http://app.test/api/internal/workers/director',
      expect.objectContaining({ method: 'POST' }),
    );
    const directorDispatch = mocks.fetch.mock.calls.find(
      ([url]) => String(url).includes('/api/internal/workers/director'),
    );
    expect(directorDispatch).toBeDefined();
    const directorRequest = directorDispatch?.[1] as RequestInit;
    expect(directorRequest.headers).toEqual(expect.objectContaining({
      'Upstash-Retries': '0',
      'Upstash-Timeout': '800s',
      'Upstash-Failure-Callback': 'http://app.test/api/internal/workers/director/failure',
      'Upstash-Failure-Callback-Retries': '2',
      'Upstash-Failure-Callback-Timeout': '30s',
    }));
    const directorPayload = JSON.parse(String((directorDispatch?.[1] as RequestInit).body));
    expect(directorPayload.userIntent).toBe(
      'make a concise product proof cut\n\nUser-provided script or outline:\nShow the proof, then the result.',
    );
    expect(directorPayload.editorialPreferences).toEqual({
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.7, intensity: 0.8 },
        transitions: { mode: 'off' },
      },
      pacing: { mode: 'prefer', intensity: 0.35 },
      notes: 'Keep the proof sequence clear.',
    });
    expect(directorPayload.pipelineDirectorDispatchToken).toBe('pipeline_director_dispatch_batch_1');
    expect(mocks.updateProject.mock.calls.some(([, update]) => (
      (update as { $set?: { directorMessageId?: unknown } })?.$set?.directorMessageId !== undefined
    ))).toBe(false);
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_batch_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          orchestrationStatus: 'director_queued',
          directorMessageId: 'msg_1',
        }),
        $unset: expect.objectContaining({ directorFailure: '' }),
      }),
    );
  });

  it.each([
    { failureKind: 'coverage_gap' as const, expectedStatus: 'needs_input' },
    { failureKind: 'invalid_response' as const, expectedStatus: 'failed' },
  ])(
    'does not save, retry, or dispatch when authoritative script grounding has terminal $failureKind',
    async ({ failureKind, expectedStatus }) => {
      const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
      batchDocument = {
        ...batchDocument,
        projectId: 'proj_batch_1',
        orchestrationStatus: 'requested',
        orchestrationRequestedAt: new Date(),
      };
      mocks.orderStorylineWithLLM.mockResolvedValueOnce({
        planApplied: false,
        fallbackReason: 'script_plan_failed',
        scriptPlan: {
          status: 'failed',
          failureKind,
          units: [],
          beats: [],
          assignments: [],
          selectedSceneIds: [],
          errors: ['no grounded scenes selected for the script'],
          attempts: 3,
        },
        storyline: {
          clips: [],
          renderTarget: { aspectRatio: '16:9', fps: 30, width: 1920, height: 1080, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
          totalDurationSec: 0,
          condensationRatio: 0,
          targetDurationSec: null,
        },
      });

      const response = await POST(request({
        uploadBatchId: 'batch_1',
        _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 0, failureCount: 0 },
      }, true) as never);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual(expect.objectContaining({
        success: false,
        status: expectedStatus,
        scriptCoverage: expect.objectContaining({ assetIdsAtFailure: ['video_1', 'image_1'] }),
      }));
      expect(mocks.saveProject).not.toHaveBeenCalled();
      expect(mocks.refundCredits).toHaveBeenCalledOnce();
      expect(mocks.updateBatch).toHaveBeenCalledWith(
        { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_batch_1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            orchestrationStatus: expectedStatus,
            orchestrationError: expect.stringContaining('could not be grounded'),
            scriptCoverage: expect.objectContaining({ assetIdsAtFailure: ['video_1', 'image_1'] }),
          }),
        }),
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('pauses a partially grounded authoritative script and persists each missing beat', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'requested',
      orchestrationRequestedAt: new Date(),
    };
    mocks.orderStorylineWithLLM.mockResolvedValueOnce({
      planApplied: true,
      scriptPlan: {
        status: 'partial',
        units: [{ id: 'unit_1', text: 'Show the proof' }, { id: 'unit_2', text: 'Show the result' }],
        beats: [
          { id: 'beat_1', unitIds: ['unit_1'], scriptText: 'Show the proof', visualIntent: 'Hands demonstrate the proof' },
          { id: 'beat_2', unitIds: ['unit_2'], scriptText: 'Show the result', visualIntent: 'Finished result in use' },
        ],
        assignments: [
          { beatId: 'beat_1', coverage: 'covered', sceneIds: ['scene_video'], candidateCount: 1, highestSimilarity: 0.9 },
          {
            beatId: 'beat_2',
            coverage: 'missing',
            sceneIds: [],
            candidateCount: 0,
            highestSimilarity: null,
            verification: { status: 'unconfirmed', sceneIds: [], notes: ['No uploaded shot shows the finished result.'] },
          },
        ],
        selectedSceneIds: ['scene_video'],
        errors: [],
        attempts: 1,
        failureKind: 'coverage_gap',
      },
      storyline: {
        clips: [{ order: 0, sourceRef: 'scene_video', source: 'video_1', in: 1, out: 3, durationSec: 2, role: 'proof', fit: 'cover' }],
        renderTarget: { aspectRatio: '16:9', fps: 30, width: 1920, height: 1080, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        totalDurationSec: 2,
        condensationRatio: 0.5,
        targetDurationSec: null,
      },
    });

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 0, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(payload).toEqual(expect.objectContaining({
      success: false,
      status: 'needs_input',
      scriptCoverage: expect.objectContaining({
        assetIdsAtFailure: ['video_1', 'image_1'],
        beats: expect.arrayContaining([expect.objectContaining({ id: 'beat_2', visualIntent: 'Finished result in use' })]),
        assignments: expect.arrayContaining([expect.objectContaining({ beatId: 'beat_2', coverage: 'missing' })]),
      }),
    }));
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/api/internal/workers/director'))).toBe(false);
  });

  it('resumes a needs-input batch on the same project after new footage is uploaded', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'needs_input',
      assetIds: ['video_1', 'image_1', 'video_2'],
      scriptCoverage: { assetIdsAtFailure: ['video_1', 'image_1'], beats: [], assignments: [] },
    };
    mediaAssets.push({
      assetId: 'video_2',
      userId: 'user_1',
      orgId: 'org_1',
      filename: 'missing-result.mp4',
      type: 'video',
      size: 900,
      duration: 5,
      cachedUrl: 'cached-result.mp4',
      uploadedAt: new Date('2026-07-10T00:00:02.000Z'),
      analysisStatus: 'complete',
      deepAnalysisStatus: 'complete',
      deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
      deepAnalysisDiagnostics: { semanticVisualWindowCount: 1, providers: { semanticVisual: 'complete' } },
    });
    mocks.findProject.mockResolvedValueOnce({ projectId: 'proj_batch_1' });

    const response = await POST(request({ uploadBatchId: 'batch_1', resumeCoverage: true }) as never);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      resumedCoverage: true,
      addedVisualAssetIds: ['video_2'],
    }));
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj_batch_1',
      userId: 'user_1',
      sourceUploadBatchId: 'batch_1',
      autoEditStatus: 'needs_input',
    }), expect.any(Object));
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_batch_1', orchestrationStatus: 'needs_input' }),
      expect.objectContaining({ $set: expect.objectContaining({ orchestrationStatus: 'requested' }) }),
    );
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_batch_1', userId: 'user_1' }),
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'analyzing' }) }),
    );
  });

  it('does not resume coverage until the batch contains a newly uploaded visual asset', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'needs_input',
      scriptCoverage: { assetIdsAtFailure: ['video_1', 'image_1'], beats: [], assignments: [] },
    };
    mocks.findProject.mockResolvedValueOnce({ projectId: 'proj_batch_1' });

    const response = await POST(request({ uploadBatchId: 'batch_1', resumeCoverage: true }) as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Upload new video or image footage'),
    }));
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.updateBatch).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('restores needs-input state when durable recovery dispatch fails', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'needs_input',
      assetIds: ['video_1', 'image_1', 'video_2'],
      scriptCoverage: { assetIdsAtFailure: ['video_1', 'image_1'], beats: [], assignments: [] },
    };
    mediaAssets.push({
      assetId: 'video_2',
      userId: 'user_1',
      filename: 'new-footage.mp4',
      type: 'video',
      size: 800,
      duration: 4,
      cachedUrl: 'new-footage.mp4',
      uploadedAt: new Date('2026-07-10T00:00:02.000Z'),
      analysisStatus: 'complete',
      deepAnalysisStatus: 'complete',
      deepAnalysisVersion: ASSET_DEEP_ANALYSIS_VERSION,
      deepAnalysisDiagnostics: { semanticVisualWindowCount: 1, providers: { semanticVisual: 'complete' } },
    });
    mocks.findProject.mockResolvedValueOnce({ projectId: 'proj_batch_1' });
    mocks.fetch.mockRejectedValueOnce(new Error('QStash unavailable'));

    const response = await POST(request({ uploadBatchId: 'batch_1', resumeCoverage: true }) as never);

    expect(response.status).toBe(503);
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_batch_1', orchestrationStatus: 'requested' }),
      expect.objectContaining({
        $set: expect.objectContaining({
          orchestrationStatus: 'needs_input',
          orchestrationError: 'QStash unavailable',
          scriptCoverage: expect.objectContaining({ assetIdsAtFailure: ['video_1', 'image_1'] }),
        }),
      }),
    );
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_batch_1', userId: 'user_1' }),
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'needs_input' }) }),
    );
  });

  it('retries transient script-grounding provider failures without dispatching Director', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'requested',
      orchestrationRequestedAt: new Date(),
    };
    mocks.orderStorylineWithLLM.mockResolvedValueOnce({
      planApplied: false,
      fallbackReason: 'script_plan_failed',
      scriptPlan: {
        status: 'failed',
        failureKind: 'provider_error',
        units: [],
        beats: [],
        assignments: [],
        selectedSceneIds: [],
        errors: ['visual coverage verification failed: provider unavailable'],
        attempts: 3,
      },
      storyline: {
        clips: [],
        renderTarget: { aspectRatio: '16:9', fps: 30, width: 1920, height: 1080, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        totalDurationSec: 0,
        condensationRatio: 0,
        targetDurationSec: null,
      },
    });

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 0, failureCount: 0 },
    }, true) as never);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual(expect.objectContaining({ success: true, retryScheduled: true }));
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_batch_1' },
      expect.objectContaining({ $set: expect.objectContaining({ orchestrationStatus: 'retryable_error' }) }),
    );
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/api/internal/workers/director'))).toBe(false);
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

  it('persists the requested aspect ratio before async composition starts', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    const response = await POST(request({ uploadBatchId: 'batch_1', aspectRatio: '9:16' }) as never);

    expect(response.status).toBe(202);
    expect(mocks.createProject).toHaveBeenCalledWith('user_1', expect.any(String), expect.objectContaining({
      aspectRatio: '9:16',
    }));
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'proj_batch_1',
      expect.objectContaining({
        aspectRatio: '9:16',
        playerDimensions: { width: 1080, height: 1920 },
      }),
      expect.objectContaining({
        projectUpdates: expect.objectContaining({
          autoEditStatus: 'analyzing',
        }),
      }),
    );
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it('re-dispatches a stale existing batch exactly once without creating or charging again', async () => {
    process.env.EDITRON_BATCH_ORCHESTRATION_RECOVERY_STALE_MS = '60000';
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'requested',
      orchestrationRequestedAt: new Date(Date.now() - 5 * 60 * 1000),
      orchestrationAttempt: 0,
    };

    const response = await POST(request({ uploadBatchId: 'batch_1' }) as never);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_batch_1',
      status: 'processing',
      recoveryDispatched: true,
      messageId: 'msg_1',
    }));
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.test/v2/publish/http://app.test/api/services/editron/auto-edit/from-batch',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not duplicate a fresh existing batch dispatch', async () => {
    process.env.EDITRON_BATCH_ORCHESTRATION_RECOVERY_STALE_MS = '60000';
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'requested',
      orchestrationRequestedAt: new Date(),
      orchestrationAttempt: 0,
    };

    const response = await POST(request({ uploadBatchId: 'batch_1' }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      projectId: 'proj_batch_1',
      status: 'existing',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
  });

  it('composes from successful assets when transcription is terminal-failed but analysis is stale', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    mediaAssets[1].analysisStatus = 'queued';
    mediaAssets[1].batchTranscriptionStatus = 'failed';
    mediaAssets[1].batchTranscriptionError = 'undecodable audio';
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(),
    };

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 2, failureCount: 0 },
    }, true) as never);

    expect(response.status).toBe(200);
    expect(mocks.bulkWriteAssets).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledOnce();
    expect(mocks.saveProjectWithReceipt.mock.calls[0][2].overlays).toHaveLength(1);
    expect(mocks.saveProjectWithReceipt.mock.calls[0][3]).toEqual(expect.objectContaining({
      projectUpdates: expect.objectContaining({ sourceAssetIds: ['video_1'] }),
    }));
  });

  it('marks only wedged assets terminal at max-wait and composes from successful survivors', async () => {
    process.env.EDITRON_BATCH_ORCHESTRATION_DEADLINE_MS = String(5 * 60 * 1000);
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    mediaAssets[1].analysisStatus = 'uploaded';
    mediaAssets[1].batchTranscriptionStatus = 'complete';
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(Date.now() - 6 * 60 * 1000),
    };

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 30, failureCount: 0 },
    }, true) as never);

    expect(response.status).toBe(200);
    expect(mocks.bulkWriteAssets).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({ assetId: 'image_1', userId: 'user_1' }),
          update: {
            $set: expect.objectContaining({
              analysisStatus: 'orchestration_timed_out',
              analysisError: expect.stringContaining('5 minutes'),
            }),
          },
        }),
      }),
    ], { ordered: false });
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledOnce();
    expect(mocks.saveProjectWithReceipt.mock.calls[0][2].overlays).toHaveLength(1);
    expect(mocks.checkCredits).toHaveBeenLastCalledWith(
      'user_1',
      'editron',
      'auto_edit_analysis',
      expect.objectContaining({ requestType: 'standard' }),
      // P2: the resolved billing wallet — personal here (flag off in tests).
      { type: 'user', clerkUserId: 'user_1' },
    );
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_batch_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          orchestrationTimedOutAssetIds: ['image_1'],
          orchestrationFailForwardAt: expect.any(Date),
        }),
      }),
    );
  });
  it('preserves an asset that completes while the deadline write is racing', async () => {
    process.env.EDITRON_BATCH_ORCHESTRATION_DEADLINE_MS = String(5 * 60 * 1000);
    const { POST } = await import('@/app/api/services/editron/auto-edit/from-batch/route');
    mediaAssets[1].analysisStatus = 'analyzing';
    mediaAssets[1].batchTranscriptionStatus = 'complete';
    mocks.bulkWriteAssets.mockImplementationOnce(async () => {
      mediaAssets[1].analysisStatus = 'complete';
      mediaAssets[1].analysisCompletedAt = new Date();
      return { acknowledged: true, modifiedCount: 0 };
    });
    batchDocument = {
      ...batchDocument,
      projectId: 'proj_batch_1',
      orchestrationStatus: 'waiting_analysis',
      orchestrationRequestedAt: new Date(Date.now() - 6 * 60 * 1000),
    };

    const response = await POST(request({
      uploadBatchId: 'batch_1',
      _orchestration: { userId: 'user_1', orgId: 'org_1', pollAttempt: 30, failureCount: 0 },
    }, true) as never);

    expect(response.status).toBe(200);
    expect(mocks.saveProjectWithReceipt.mock.calls[0][2].overlays).toHaveLength(2);
    expect(mocks.saveProjectWithReceipt.mock.calls[0][3]).toEqual(expect.objectContaining({
      projectUpdates: expect.objectContaining({ sourceAssetIds: ['video_1', 'image_1'] }),
    }));
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_batch_1' },
      expect.objectContaining({
        $set: expect.objectContaining({ orchestrationTimedOutAssetIds: [] }),
      }),
    );
  });
  it('bounds Creative Brief transport time and does not retry a hung model request', async () => {
    delete process.env.EDITRON_CREATIVE_BRIEF_REQUEST_TIMEOUT_MS;
    const generateContent = vi.fn().mockRejectedValue(new Error('request timed out'));
    const errorSwallowed = vi.fn();
    mocks.getCreativeDocCachedModel.mockResolvedValue({ generateContent });

    const brief = await generateCreativeBrief(
      { transcription: [], totalDurationSec: 10, segmentCount: 1 },
      {},
      undefined,
      undefined,
      'speech',
      { errorSwallowed } as never,
    );

    expect(brief).toBeNull();
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ generationConfig: expect.objectContaining({ seed: 42 }) }),
      { timeout: 280_000 },
    );
    expect(errorSwallowed).toHaveBeenCalledWith(
      'director',
      expect.any(Error),
      'creative brief model request',
    );
    expect(resolveCreativeBriefRequestTimeoutMs('1000')).toBe(15_000);
    expect(resolveCreativeBriefRequestTimeoutMs('999999')).toBe(400_000);
  });

  it('parses and bounds a QStash Director delivery failure audit', () => {
    const failure = parseDirectorDeliveryFailure({
      status: 504,
      retried: 0,
      maxRetries: 0,
      dlqId: 'dlq_1',
      sourceMessageId: 'msg_director_1',
      sourceBody: Buffer.from(JSON.stringify({
        projectId: 'proj_batch_1',
        userId: 'user_1',
        pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
      })).toString('base64'),
      body: Buffer.from('FUNCTION_INVOCATION_TIMEOUT').toString('base64'),
    });

    expect(failure).toEqual({
      projectId: 'proj_batch_1',
      userId: 'user_1',
      sourceMessageId: 'msg_director_1',
      pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
      status: 504,
      retried: 0,
      maxRetries: 0,
      dlqId: 'dlq_1',
      errorMessage: 'Director delivery failed with HTTP 504: FUNCTION_INVOCATION_TIMEOUT',
    });
    expect(buildDirectorDeliveryFailureAudit(
      failure,
      new Date('2026-07-13T00:00:00.000Z'),
    )).toEqual(expect.objectContaining({
      source: 'qstash-failure-callback',
      sourceMessageId: 'msg_director_1',
      pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
      status: 504,
      failedAt: new Date('2026-07-13T00:00:00.000Z'),
    }));
  });

  it('persists a signed Director delivery failure without overwriting another run', async () => {
    const { POST } = await import('@/app/api/internal/workers/director/failure/route');
    const beforeProjectRevision = {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: '2026-07-13T00:00:00.000Z',
    };
    const mutationReceipt = {
      schemaVersion: 1 as const,
      projectId: 'proj_batch_1',
      revision: {
        schemaVersion: 1 as const,
        value: 8,
        compatibilityUpdatedAt: '2026-07-13T00:00:01.000Z',
      },
      committedAt: '2026-07-13T00:00:01.000Z',
    };
    mocks.recordDirectorDeliveryFailureV1.mockResolvedValue({
      disposition: 'RECORDED',
      sourceUploadBatchId: 'batch_1',
      beforeRevision: beforeProjectRevision,
      receipt: mutationReceipt,
    });

    const response = await POST(new Request('http://app.test/api/internal/workers/director/failure', {
      method: 'POST',
      body: JSON.stringify({
        status: 504,
        retried: 0,
        maxRetries: 0,
        sourceMessageId: 'msg_director_1',
        sourceBody: Buffer.from(JSON.stringify({
          projectId: 'proj_batch_1',
          userId: 'user_1',
          pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
        })).toString('base64'),
        body: Buffer.from('FUNCTION_INVOCATION_TIMEOUT').toString('base64'),
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      projectId: 'proj_batch_1',
      beforeProjectRevision,
      mutationReceipt,
    });
    expect(mocks.recordDirectorDeliveryFailureV1).toHaveBeenCalledWith(
      'user_1',
      'proj_batch_1',
      expect.objectContaining({
        sourceMessageId: 'msg_director_1',
        pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
        errorMessage: 'Director delivery failed with HTTP 504: FUNCTION_INVOCATION_TIMEOUT',
        audit: expect.objectContaining({
          source: 'qstash-failure-callback',
          sourceMessageId: 'msg_director_1',
          pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
          error: 'Director delivery failed with HTTP 504: FUNCTION_INVOCATION_TIMEOUT',
        }),
      }),
    );
    expect(mocks.updateProject).not.toHaveBeenCalled();
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadBatchId: 'batch_1',
        projectId: 'proj_batch_1',
        orchestrationStatus: 'director_queued',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ orchestrationStatus: 'failed' }),
      }),
    );

    mocks.recordDirectorDeliveryFailureV1.mockClear();
    mocks.updateBatch.mockClear();
    mocks.recordDirectorDeliveryFailureV1.mockResolvedValue({
      disposition: 'STALE_SOURCE_MESSAGE',
      sourceUploadBatchId: null,
    });
    const staleResponse = await POST(new Request('http://app.test/api/internal/workers/director/failure', {
      method: 'POST',
      body: JSON.stringify({
        status: 504,
        sourceMessageId: 'msg_director_1',
        sourceBody: Buffer.from(JSON.stringify({
          projectId: 'proj_batch_1',
          userId: 'user_1',
          pipelineDirectorDispatchToken: 'pipeline_director_dispatch_batch_1',
        })).toString('base64'),
      }),
    }) as never);

    expect(await staleResponse.json()).toEqual({ success: true, skipped: 'stale_message' });
    expect(mocks.recordDirectorDeliveryFailureV1).toHaveBeenCalledOnce();
    expect(mocks.updateProject).not.toHaveBeenCalled();
    expect(mocks.updateBatch).not.toHaveBeenCalled();
  });
});
