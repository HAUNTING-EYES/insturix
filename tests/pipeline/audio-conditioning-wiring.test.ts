import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.APP_ENV = 'development';
  return {
    auth: vi.fn(),
    getStoryboard: vi.fn(),
    deductCredits: vi.fn(),
    refundCredits: vi.fn(),
    createProject: vi.fn(),
    findProjectBySessionId: vi.fn(),
    saveProject: vi.fn(),
    getDatabase: vi.fn(),
    dbFindOne: vi.fn(),
    dbUpdateOne: vi.fn(),
    dbInsertOne: vi.fn(),
    addProjectToLink: vi.fn(),
    resolveBrandReferenceIssue: vi.fn(),
    generateBackgroundMusic: vi.fn(),
    buildMusicPrompt: vi.fn(),
    isBGMAvailable: vi.fn(),
    dispatchAudioJob: vi.fn(),
    isSFXAvailable: vi.fn(),
    generateSFXForScenes: vi.fn(),
    applyEditDirections: vi.fn(),
    getAnalysis: vi.fn(),
    selectBestSegment: vi.fn(),
    alignCutsToBeats: vi.fn(),
    analyzeBeatsFull: vi.fn(),
    decodeAudio: vi.fn(),
    detectBeats: vi.fn(),
    transitionProjectStatus: vi.fn(),
    emitBrandEvent: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
}));
vi.mock('@/lib/pipeline/storyboard-db', () => ({ getStoryboard: mocks.getStoryboard }));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: {
    deductCredits: mocks.deductCredits,
    refundCredits: mocks.refundCredits,
  },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    findProjectBySessionId: mocks.findProjectBySessionId,
    saveProject: mocks.saveProject,
  },
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    PROJECTS: 'projects',
    MEDIA_ASSETS: 'mediaAssets',
  },
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/pipeline/bgm-service', () => ({
  generateBackgroundMusic: mocks.generateBackgroundMusic,
  buildMusicPrompt: mocks.buildMusicPrompt,
  isBGMAvailable: mocks.isBGMAvailable,
}));
vi.mock('@/lib/editron/services/audio-worker-dispatch', () => ({
  dispatchAudioJob: mocks.dispatchAudioJob,
}));
vi.mock('@/lib/pipeline/sfx-service', () => ({
  generateSFXForScenes: mocks.generateSFXForScenes,
  isSFXAvailable: mocks.isSFXAvailable,
}));
vi.mock('@/lib/pipeline/edit-direction-applier', () => ({
  applyEditDirections: mocks.applyEditDirections,
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({
  ROW: {
    VIDEO: 1,
    VOICEOVER: 2,
    BGM: 3,
    SFX: 4,
  },
  alignCutsToBeats: mocks.alignCutsToBeats,
}));
vi.mock('@/lib/editron/services/five-track-analysis', () => ({
  getAnalysis: mocks.getAnalysis,
  selectBestSegment: mocks.selectBestSegment,
}));
vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLink: mocks.addProjectToLink,
}));
vi.mock('@/lib/pipeline/storyboard-brand-reference-guard', () => ({
  resolveStoryboardBrandReferenceIssue: mocks.resolveBrandReferenceIssue,
}));
vi.mock('@/lib/editron/services/media/beat-detection-service', () => ({
  analyzeBeatsFull: mocks.analyzeBeatsFull,
}));
vi.mock('@/lib/editron/services/beat-detection-service', () => ({
  detectBeats: mocks.detectBeats,
}));
vi.mock('@/lib/shared/brand-events', () => ({
  emitBrandEvent: mocks.emitBrandEvent,
}));
vi.mock('@/lib/shared/project-status', () => ({
  transitionProjectStatus: mocks.transitionProjectStatus,
}));
vi.mock('audio-decode', () => ({ default: mocks.decodeAudio }));

import {
  assertConditionedBGMResult,
  resolveAudioPlatformEvidence,
} from '../../lib/pipeline/bgm-conditioning-contract';
import { resolveAudioLoudnessTarget } from '../../lib/editron/constants/audio-standards';
import { POST as finalizeStoryboard } from '../../app/api/services/pipeline/storyboard/[id]/finalize/route';
import { POST as runAudioWorker } from '../../app/api/internal/workers/pipeline/audio/route';

function makeConditionedBgm(targetFrames: number, fps = 30, platform?: string | null) {
  const durationMs = (targetFrames / fps) * 1_000;
  const loudnessTarget = resolveAudioLoudnessTarget(platform);
  return {
    audioUrl: 'https://cdn.example.com/bgm.flac',
    gcsPath: null,
    audioAssetId: 'bgm_conditioned',
    durationMs,
    filename: 'bgm_conditioned.flac',
    contentType: 'audio/flac',
    buffer: Buffer.from('conditioned-flac-bytes'),
    conditioning: {
      targetFrames,
      durationMs,
      sourceDurationMs: 8_000,
      sampleRate: 48_000,
      channels: 2,
      measuredInputLufs: -20,
      measuredOutputLufs: loudnessTarget.integratedLufs,
      truePeakDbtp: loudnessTarget.truePeakDbtp,
      targetLufs: loudnessTarget.integratedLufs,
      targetTruePeakDbtp: loudnessTarget.truePeakDbtp,
      loudnessPlatform: loudnessTarget.platform,
      wasLooped: true,
      wasTrimmed: false,
      loopsAdded: 1,
      crossfadeMs: 250,
    },
  };
}

function makeStoryboard(beatSyncActive: boolean) {
  return {
    storyboardId: 'sb_audio',
    userId: 'user_1',
    title: 'Conditioned audio project',
    status: 'ready',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    overallMusicPrompt: 'restrained electronic instrumental',
    beatSyncActive,
    productionManifest: {
      version: 1,
      sourceService: 'thinkforge',
      expectedSceneCount: 1,
      expectedStoryboardImages: 1,
      expectedVideoClips: 1,
      coveragePolicy: 'production-require-all-scenes',
      warnings: [],
      thinkforgeContext: {
        version: 1,
        briefSnapshot: {
          output: {
            platform: 'instagram-reels',
          },
        },
        sidecarSourceRefs: [],
        avatarDirectives: [],
      },
    },
    scenes: [
      {
        sceneIndex: 0,
        imageUrl: 'https://cdn.example.com/scene.png',
        imageAssetId: 'image_1',
        videoUrl: 'https://cdn.example.com/scene.mp4',
        videoAssetId: 'video_1',
        videoDurationMs: 5_000,
        status: 'generated',
        generationHistory: [],
        descriptor: {
          sceneIndex: 0,
          title: 'Opening',
          narration: 'The opening line.',
          visualDescription: 'A complete generated scene.',
          durationSeconds: 5,
          mood: 'confident',
          assetRecommendation: 'ai-video',
        },
      },
    ],
  };
}

function installDatabase() {
  const database = {
    collection: vi.fn((collectionName: string) => ({
      findOne: (...args: unknown[]) => mocks.dbFindOne(collectionName, ...args),
      updateOne: (...args: unknown[]) => mocks.dbUpdateOne(collectionName, ...args),
      insertOne: (...args: unknown[]) => mocks.dbInsertOne(collectionName, ...args),
    })),
  };
  mocks.getDatabase.mockResolvedValue(database);
  return database;
}

function makeRequest(body: Record<string, unknown>) {
  return { json: vi.fn().mockResolvedValue(body) };
}

describe('conditioned BGM contract', () => {
  it('uses the first concrete platform evidence and skips placeholders', () => {
    expect(resolveAudioPlatformEvidence([
      { value: 'auto', source: 'payload' },
      { value: ' youtube ', source: 'project.productionBrief.output.platform' },
    ])).toEqual({
      platform: 'youtube',
      source: 'project.productionBrief.output.platform',
    });
  });

  it('rejects raw or mismatched music before a project can consume it', () => {
    expect(() => assertConditionedBGMResult({
      ...makeConditionedBgm(300),
      filename: 'raw.mp3',
      contentType: 'audio/mpeg',
      conditioning: undefined,
    }, 300)).toThrow('refusing to mutate the project');
  });
});

describe('storyboard finalize audio conditioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDatabase();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.deductCredits.mockResolvedValue({
      success: true,
      creditsDeducted: 6,
      transactionId: 'tx_audio',
    });
    mocks.refundCredits.mockResolvedValue({ success: true });
    mocks.createProject.mockResolvedValue({ projectId: 'proj_audio' });
    mocks.findProjectBySessionId.mockResolvedValue(null);
    mocks.saveProject.mockResolvedValue(undefined);
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.dbInsertOne.mockResolvedValue({ acknowledged: true });
    mocks.addProjectToLink.mockResolvedValue(false);
    mocks.resolveBrandReferenceIssue.mockResolvedValue(null);
    mocks.isBGMAvailable.mockReturnValue(true);
    mocks.isSFXAvailable.mockReturnValue(false);
    mocks.applyEditDirections.mockResolvedValue({ totalFrameShift: 0 });
    mocks.getAnalysis.mockResolvedValue(null);
    mocks.generateBackgroundMusic.mockImplementation(
      (_prompt, _userId, _durationSec, options) => (
        Promise.resolve(makeConditionedBgm(
          options.conditioning.targetFrames,
          options.conditioning.fps,
          options.conditioning.platform,
        ))
      ),
    );
    mocks.detectBeats.mockResolvedValue({
      bpm: 120,
      beats: [0, 15, 30],
      downbeats: [0],
      source: 'bpm-heuristic',
    });
    mocks.dispatchAudioJob.mockResolvedValue({ dispatched: true, mode: 'qstash' });
    mocks.transitionProjectStatus.mockResolvedValue(undefined);
    mocks.emitBrandEvent.mockResolvedValue(undefined);
  });

  it('conditions and persists beat-sync BGM after the initial project save', async () => {
    mocks.getStoryboard.mockResolvedValue(makeStoryboard(true));

    const response = await finalizeStoryboard(makeRequest({}) as any, {
      params: Promise.resolve({ id: 'sb_audio' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.generateBackgroundMusic).toHaveBeenCalledWith(
      'restrained electronic instrumental',
      'user_1',
      5,
      {
        conditioning: {
          targetFrames: 150,
          fps: 30,
          platform: 'instagram-reels',
        },
      },
    );
    expect(mocks.dispatchAudioJob).not.toHaveBeenCalled();

    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.metadata?.source === 'finalize-sync-beat-sync'
      ),
    );
    expect(projectOverlayMutation).toBeDefined();
    expect(projectOverlayMutation?.[2].$push.overlays).toMatchObject({
      durationInFrames: 150,
      _workerAdded: true,
      metadata: {
        audioConditioning: {
          requestedPlatform: 'instagram-reels',
          platformEvidenceSource:
            'storyboard.productionManifest.thinkforgeContext.briefSnapshot.output.platform',
          targetFrames: 150,
        },
      },
    });

    const assetMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, filter]) => (
        collectionName === 'mediaAssets' && filter?.assetId === 'bgm_conditioned'
      ),
    );
    expect(assetMutation?.[2].$setOnInsert).toMatchObject({
      filename: 'bgm_conditioned.flac',
      contentType: 'audio/flac',
      source: 'generated',
      size: Buffer.from('conditioned-flac-bytes').length,
      durationMs: 5_000,
    });
  });

  it('passes exact timeline and platform evidence to the async worker path', async () => {
    mocks.getStoryboard.mockResolvedValue(makeStoryboard(false));

    const response = await finalizeStoryboard(makeRequest({}) as any, {
      params: Promise.resolve({ id: 'sb_audio' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
    expect(mocks.dispatchAudioJob).toHaveBeenCalledWith({
      type: 'bgm',
      projectId: 'proj_audio',
      userId: 'user_1',
      storyboardId: 'sb_audio',
      musicPrompt: 'restrained electronic instrumental',
      totalDurationSec: 5,
      totalFrames: 150,
      fps: 30,
      platform: 'instagram-reels',
    }, 'BGM');
  });
});

describe('audio worker conditioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDatabase();
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.dbInsertOne.mockResolvedValue({ acknowledged: true });
    mocks.alignCutsToBeats.mockReturnValue(0);
    mocks.analyzeBeatsFull.mockResolvedValue({ beats: [] });
    mocks.decodeAudio.mockResolvedValue({
      sampleRate: 48_000,
      channelData: [new Float32Array(480)],
    });
    let projectRead = 0;
    mocks.dbFindOne.mockImplementation(async (collectionName: string) => {
      if (collectionName !== 'projects') return null;
      projectRead += 1;
      if (projectRead === 1) {
        return {
          projectId: 'proj_worker',
          userId: 'user_1',
          productionBrief: { output: { platform: 'youtube' } },
        };
      }
      return { projectId: 'proj_worker', userId: 'user_1', overlays: [] };
    });
  });

  it('conditions exact frames and reuses returned bytes for beat analysis', async () => {
    mocks.generateBackgroundMusic.mockImplementation(
      (_prompt, _userId, _durationSec, options) => (
        Promise.resolve(makeConditionedBgm(
          options.conditioning.targetFrames,
          options.conditioning.fps,
          options.conditioning.platform,
        ))
      ),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'measured electronic score',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
      platform: 'tiktok',
    }) as any);

    expect(response.status).toBe(200);
    expect(mocks.generateBackgroundMusic).toHaveBeenCalledWith(
      'measured electronic score',
      'user_1',
      15,
      {
        conditioning: {
          targetFrames: 450,
          fps: 30,
          platform: 'tiktok',
        },
      },
    );
    expect(mocks.decodeAudio).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.metadata?.source === 'audio-worker'
      ),
    );
    expect(projectOverlayMutation?.[2].$push.overlays).toMatchObject({
      durationInFrames: 450,
      _workerAdded: true,
      metadata: {
        audioConditioning: {
          requestedPlatform: 'tiktok',
          platformEvidenceSource: 'audio-worker-payload.platform',
          targetFrames: 450,
        },
      },
    });
  });

  it('derives platform evidence from the project when the dispatch payload omits it', async () => {
    mocks.generateBackgroundMusic.mockImplementation(
      (_prompt, _userId, _durationSec, options) => (
        Promise.resolve(makeConditionedBgm(
          options.conditioning.targetFrames,
          options.conditioning.fps,
          options.conditioning.platform,
        ))
      ),
    );

    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'project-derived platform score',
      totalDurationSec: 10,
      totalFrames: 300,
      fps: 30,
    }) as any);

    expect(response.status).toBe(200);
    expect(mocks.generateBackgroundMusic).toHaveBeenCalledWith(
      'project-derived platform score',
      'user_1',
      10,
      {
        conditioning: {
          targetFrames: 300,
          fps: 30,
          platform: 'youtube',
        },
      },
    );
    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.metadata?.source === 'audio-worker'
      ),
    );
    expect(projectOverlayMutation?.[2].$push.overlays.metadata.audioConditioning).toMatchObject({
      requestedPlatform: 'youtube',
      platformEvidenceSource: 'project.productionBrief.output.platform',
      loudnessPlatform: 'youtube',
    });
  });

  it('fails before overlay or asset mutation when conditioning evidence is invalid', async () => {
    mocks.generateBackgroundMusic.mockResolvedValue({
      ...makeConditionedBgm(450),
      filename: 'bgm_raw.mp3',
      contentType: 'audio/mpeg',
      conditioning: undefined,
    });

    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'unconditioned score',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
    }) as any);

    expect(response.status).toBe(500);
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName]) => collectionName === 'mediaAssets',
    )).toBe(false);
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => (
        collectionName === 'projects' && Boolean(mutation?.$push?.overlays)
      ),
    )).toBe(false);
  });
});
