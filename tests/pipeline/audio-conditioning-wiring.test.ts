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
    loadProject: vi.fn(),
    updateOverlay: vi.fn(),
    addOverlay: vi.fn(),
    deleteOverlay: vi.fn(),
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
    loadProject: mocks.loadProject,
    updateOverlay: mocks.updateOverlay,
    addOverlay: mocks.addOverlay,
    deleteOverlay: mocks.deleteOverlay,
  },
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
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
  resolveMusicGenerationPolicy,
} from '../../lib/pipeline/bgm-conditioning-contract';
import { resolveAudioLoudnessTarget } from '../../lib/editron/constants/audio-standards';
import { resolveRuntimeMusicCoveragePlan } from '../../lib/editron/services/music-coverage-runtime';
import { analyzeConditionedMusicBeatGrid } from '../../lib/editron/services/music-beat-grid';
import { createTools } from '../../lib/editron/agent/tools';
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

function makeBeatAnalysis(durationMs = 5_000) {
  return {
    beats: [
      { timeMs: 0, strength: 1, isDownbeat: true },
      { timeMs: 500, strength: 0.8, isDownbeat: false },
      { timeMs: 1_000, strength: 0.9, isDownbeat: false },
    ],
    bpm: 120,
    bpmConfidence: 0.92,
    durationMs,
    timeSignatureNumerator: 4,
    energyPeaks: [],
    rawOnsets: [
      { timeMs: 0, strength: 1 },
      { timeMs: 500, strength: 0.8 },
      { timeMs: 1_000, strength: 0.9 },
      { timeMs: 1_500, strength: 0.75 },
    ],
  };
}

function makeFullCoveragePlan(totalFrames: number, fps = 30) {
  return resolveRuntimeMusicCoveragePlan({
    totalFrames,
    fps,
    authoredMusicIntent: { coverage: 'full', source: 'test.authored-music' },
  });
}

function makeSectionCoveragePlan(totalFrames: number, fps = 30) {
  return resolveRuntimeMusicCoveragePlan({
    totalFrames,
    fps,
    contentType: 'vlog',
    speechSegments: [
      { startFrame: 0, endFrame: 120 },
      { startFrame: 240, endFrame: 330 },
    ],
  });
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

function regenerateBgmTool() {
  const candidate = createTools('user_1', 'proj_audio').find(tool => tool.name === 'regenerate_bgm');
  expect(candidate, 'regenerate_bgm should be registered').toBeDefined();
  return candidate as unknown as {
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
}

describe('conditioned music beat evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decodeAudio.mockResolvedValue({
      sampleRate: 48_000,
      channelData: [new Float32Array(480)],
    });
  });

  it('rejects a fabricated default tempo with zero analysis confidence', async () => {
    mocks.analyzeBeatsFull.mockResolvedValue({
      ...makeBeatAnalysis(),
      bpmConfidence: 0,
    });

    await expect(analyzeConditionedMusicBeatGrid({
      buffer: Buffer.from('conditioned-flac-bytes'),
      fps: 30,
      totalFrames: 150,
    })).rejects.toMatchObject({
      name: 'MusicBeatGridError',
      code: 'INSUFFICIENT_BEAT_EVIDENCE',
    });
  });

  it('rejects analyzed beats outside the conditioned timeline', async () => {
    mocks.analyzeBeatsFull.mockResolvedValue({
      ...makeBeatAnalysis(),
      beats: [{ timeMs: 5_000, strength: 1, isDownbeat: true }],
    });

    await expect(analyzeConditionedMusicBeatGrid({
      buffer: Buffer.from('conditioned-flac-bytes'),
      fps: 30,
      totalFrames: 150,
    })).rejects.toMatchObject({
      name: 'MusicBeatGridError',
      code: 'INVALID_BEAT_GRID',
    });
  });
});

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

  it('treats legacy none and editorial music off as provenance-bearing hard vetoes', () => {
    expect(resolveMusicGenerationPolicy({
      musicPreferences: [{ value: ' NONE ', source: 'request.musicPreference' }],
      editorialPreferences: [],
    })).toMatchObject({
      allowed: false,
      reason: 'music-preference-none',
      musicPreference: 'none',
      musicPreferenceSource: 'request.musicPreference',
    });

    expect(resolveMusicGenerationPolicy({
      musicPreferences: [],
      editorialPreferences: [{
        value: { families: { music: { mode: 'off' } } },
        source: 'request.editorialPreferences',
      }],
    })).toMatchObject({
      allowed: false,
      reason: 'user-policy-off:music',
      editorialPreferencesSource: 'request.editorialPreferences',
      editorialPolicy: {
        executionAllowed: false,
        reason: 'user-policy-off:music',
      },
    });
  });

  it('projects raw-footage speech evidence onto the edited timeline before planning sections', () => {
    const plan = resolveRuntimeMusicCoveragePlan({
      totalFrames: 300,
      fps: 30,
      project: {
        rawFootageAnalysis: {
          contentTypeDetection: { contentType: 'vlog' },
          originalDurationMs: 10_000,
          transcription: {
            words: [
              { word: 'opening', startMs: 0, endMs: 1_000 },
              { word: 'closing', startMs: 7_000, endMs: 8_000 },
            ],
          },
        },
      },
      overlays: [{
        type: 'video',
        from: 0,
        durationInFrames: 300,
        sourceStartFrame: 0,
      }],
    });

    expect(plan).toMatchObject({
      mode: 'sections',
      sections: [{ startFrame: 34, endFrame: 206, intent: 'speech-gap' }],
      evidence: {
        contentType: 'vlog',
        speechCoverage: 0.2,
        temporalEvidence: { speechSegments: 2 },
      },
    });
  });

  it('fails loud when raw speech cannot be mapped to a multi-clip edited timeline', () => {
    expect(() => resolveRuntimeMusicCoveragePlan({
      totalFrames: 300,
      fps: 30,
      project: {
        rawFootageAnalysis: {
          transcription: { words: [{ word: 'speech', startMs: 0, endMs: 1_000 }] },
        },
      },
      overlays: [
        { type: 'video', from: 0, durationInFrames: 150 },
        { type: 'video', from: 150, durationInFrames: 150 },
      ],
    })).toThrow('cannot map 1 speech words onto the edited timeline');
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
    mocks.decodeAudio.mockResolvedValue({
      sampleRate: 48_000,
      channelData: [new Float32Array(480)],
    });
    mocks.analyzeBeatsFull.mockResolvedValue(makeBeatAnalysis());
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
    expect(mocks.decodeAudio).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeBeatsFull).toHaveBeenCalledTimes(1);
    expect(mocks.detectBeats).not.toHaveBeenCalled();

    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.$each?.some(
          (overlay: any) => overlay?.metadata?.source === 'finalize-sync-beat-sync',
        )
      ),
    );
    expect(projectOverlayMutation).toBeDefined();
    expect(projectOverlayMutation?.[2].$push.overlays.$each).toHaveLength(1);
    expect(projectOverlayMutation?.[2].$push.overlays.$each[0]).toMatchObject({
      from: 0,
      durationInFrames: 150,
      startFromSound: 0,
      _workerAdded: true,
      metadata: {
        musicCoverage: {
          version: 'music-coverage-plan-v1',
          mode: 'full',
          sectionIndex: 0,
          reasonCodes: ['authored-full-direction'],
        },
        audioConditioning: {
          requestedPlatform: 'instagram-reels',
          platformEvidenceSource:
            'storyboard.productionManifest.thinkforgeContext.briefSnapshot.output.platform',
          targetFrames: 150,
        },
        beatGrid: {
          bpm: 120,
          bpmConfidence: 0.92,
          beats: [
            { frame: 0, isDownbeat: true },
            { frame: 15, isDownbeat: false },
            { frame: 30, isDownbeat: false },
          ],
          downbeats: [0],
          firstBeatOffsetFrames: 0,
          source: 'audio-analysis',
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
    expect(assetMutation?.[2].$set).toMatchObject({
      beatAnalysis: makeBeatAnalysis(),
      beatGrid: {
        bpm: 120,
        bpmConfidence: 0.92,
        beats: [
          { frame: 0, isDownbeat: true },
          { frame: 15, isDownbeat: false },
          { frame: 30, isDownbeat: false },
        ],
        downbeats: [0],
        firstBeatOffsetFrames: 0,
        source: 'audio-analysis',
      },
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
      musicPreference: null,
      editorialPreferences: null,
      musicCoveragePlan: expect.objectContaining({
        version: 'music-coverage-plan-v1',
        mode: 'full',
        reasonCodes: ['authored-full-direction'],
        evidence: expect.objectContaining({
          authoredMusicIntent: {
            coverage: 'full',
            source: 'storyboard.overallMusicPrompt',
          },
        }),
      }),
    }, 'BGM');
  });

  it('spends zero BGM credits when the storyboard has no authored or temporal music evidence', async () => {
    const storyboard = makeStoryboard(false);
    delete (storyboard as any).overallMusicPrompt;
    mocks.getStoryboard.mockResolvedValue(storyboard);

    const response = await finalizeStoryboard(makeRequest({}) as any, {
      params: Promise.resolve({ id: 'sb_audio' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
    expect(mocks.dispatchAudioJob).not.toHaveBeenCalled();
    expect(mocks.deductCredits.mock.calls.some(
      ([, , action]) => action === 'bgm_generation',
    )).toBe(false);
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$set?.musicCoveragePlan?.mode === 'none'
        && mutation?.$set?.musicCoveragePlan?.reasonCodes?.includes('no-licensed-sections')
      ),
    )).toBe(true);
  });

  it.each([
    ['legacy none on beat-sync finalize', { musicPreference: 'none' }, true, 'music-preference-none'],
    ['legacy none on async finalize', { musicPreference: 'none' }, false, 'music-preference-none'],
    [
      'editorial off on beat-sync finalize',
      { editorialPreferences: { families: { music: { mode: 'off' } } } },
      true,
      'user-policy-off:music',
    ],
    [
      'editorial off on async finalize',
      { editorialPreferences: { families: { music: { mode: 'off' } } } },
      false,
      'user-policy-off:music',
    ],
  ])('CRITICAL: %s produces zero music overlays and spends zero BGM credits', async (
    _label,
    body,
    beatSyncActive,
    expectedReason,
  ) => {
    mocks.getStoryboard.mockResolvedValue(makeStoryboard(beatSyncActive));

    const response = await finalizeStoryboard(makeRequest(body) as any, {
      params: Promise.resolve({ id: 'sb_audio' }),
    });
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.audioGenerating).toBe(false);
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
    expect(mocks.dispatchAudioJob).not.toHaveBeenCalled();
    expect(mocks.deductCredits.mock.calls.some(
      ([, , action]) => action === 'bgm_generation',
    )).toBe(false);
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => {
        if (collectionName !== 'projects' || !mutation?.$push?.overlays) return false;
        const pushed = mutation.$push.overlays.$each || [mutation.$push.overlays];
        return pushed.some((overlay: any) => overlay?.row === 3);
      },
    )).toBe(false);
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$set?.musicGenerationPolicy?.reason === expectedReason
      ),
    )).toBe(true);
  });
});

describe('audio worker conditioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDatabase();
    mocks.dbUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.dbInsertOne.mockResolvedValue({ acknowledged: true });
    mocks.alignCutsToBeats.mockReturnValue(0);
    mocks.analyzeBeatsFull.mockResolvedValue(makeBeatAnalysis(15_000));
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
      musicCoveragePlan: makeFullCoveragePlan(450),
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
    expect(mocks.analyzeBeatsFull).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.$each?.some(
          (overlay: any) => overlay?.metadata?.source === 'audio-worker',
        )
      ),
    );
    expect(projectOverlayMutation?.[2].$push.overlays.$each).toHaveLength(1);
    expect(projectOverlayMutation?.[2].$push.overlays.$each[0]).toMatchObject({
      from: 0,
      durationInFrames: 450,
      startFromSound: 0,
      _workerAdded: true,
      metadata: {
        musicCoverage: {
          mode: 'full',
          sectionIndex: 0,
        },
        audioConditioning: {
          requestedPlatform: 'tiktok',
          platformEvidenceSource: 'audio-worker-payload.platform',
          targetFrames: 450,
        },
        beatGrid: {
          source: 'audio-analysis',
          bpm: 120,
          beats: [
            { frame: 0, isDownbeat: true },
            { frame: 15, isDownbeat: false },
            { frame: 30, isDownbeat: false },
          ],
        },
      },
    });
    expect(mocks.alignCutsToBeats).toHaveBeenCalledWith(
      expect.any(Array),
      [
        { frame: 0, isDownbeat: true },
        { frame: 15, isDownbeat: false },
        { frame: 30, isDownbeat: false },
      ],
      30,
    );
    const assetMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, filter]) => (
        collectionName === 'mediaAssets' && filter?.assetId === 'bgm_conditioned'
      ),
    );
    expect(assetMutation?.[2].$set).toMatchObject({
      beatAnalysis: makeBeatAnalysis(15_000),
      beatGrid: {
        source: 'audio-analysis',
        bpm: 120,
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
      musicCoveragePlan: makeFullCoveragePlan(300),
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
        && mutation?.$push?.overlays?.$each?.some(
          (overlay: any) => overlay?.metadata?.source === 'audio-worker',
        )
      ),
    );
    expect(projectOverlayMutation?.[2].$push.overlays.$each[0].metadata.audioConditioning).toMatchObject({
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
      musicCoveragePlan: makeFullCoveragePlan(450),
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

  it('places section coverage at matching timeline and source offsets', async () => {
    mocks.generateBackgroundMusic.mockImplementation(
      (_prompt, _userId, _durationSec, options) => Promise.resolve(
        makeConditionedBgm(
          options.conditioning.targetFrames,
          options.conditioning.fps,
          options.conditioning.platform,
        ),
      ),
    );
    const plan = makeSectionCoveragePlan(450);

    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'section-aware score',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
      musicCoveragePlan: plan,
    }) as any);

    expect(response.status).toBe(200);
    expect(plan.mode).toBe('sections');
    const projectOverlayMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, , mutation]) => (
        collectionName === 'projects' && Array.isArray(mutation?.$push?.overlays?.$each)
      ),
    );
    expect(projectOverlayMutation?.[2].$push.overlays.$each).toMatchObject([
      {
        from: 120,
        durationInFrames: 120,
        startFromSound: 120,
        metadata: { musicCoverage: { sectionIndex: 0, mode: 'sections' } },
      },
      {
        from: 330,
        durationInFrames: 120,
        startFromSound: 330,
        metadata: { musicCoverage: { sectionIndex: 1, mode: 'sections' } },
      },
    ]);
  });

  it('rejects a tampered coverage plan before provider or asset mutation', async () => {
    const tamperedPlan = {
      ...makeFullCoveragePlan(450),
      sections: [{ ...makeFullCoveragePlan(450).sections[0], endFrame: 449 }],
    };

    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'must not reach provider',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
      musicCoveragePlan: tamperedPlan,
    }) as any);

    expect(response.status).toBe(400);
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName]) => collectionName === 'mediaAssets',
    )).toBe(false);
  });

  it.each([
    ['legacy none', { musicPreference: 'none' }, 'music-preference-none'],
    [
      'editorial off',
      { editorialPreferences: { families: { music: { mode: 'off' } } } },
      'user-policy-off:music',
    ],
  ])('CRITICAL: worker %s retry produces zero music overlays', async (
    _label,
    preferencePayload,
    expectedReason,
  ) => {
    const response = await runAudioWorker(makeRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      storyboardId: 'sb_worker',
      musicPrompt: 'must not reach provider',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
      ...preferencePayload,
    }) as any);
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody).toMatchObject({
      success: true,
      type: 'bgm',
      skipped: true,
      reason: expectedReason,
    });
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
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

describe('chat BGM policy enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['legacy none', { musicPreference: 'none' }, 'music-preference-none'],
    [
      'editorial off',
      {
        productionBriefIntake: {
          editorialPreferences: { families: { music: { mode: 'off' } } },
        },
      },
      'user-policy-off:music',
    ],
  ])('CRITICAL: regenerate_bgm with %s fails loud and creates zero music overlays', async (
    _label,
    projectPolicy,
    expectedReason,
  ) => {
    mocks.loadProject.mockResolvedValue({
      projectId: 'proj_audio',
      userId: 'user_1',
      fps: 30,
      durationInFrames: 300,
      overlays: [],
      ...projectPolicy,
    });

    const result = JSON.parse(await regenerateBgmTool().invoke({ mood: 'cinematic' }));

    expect(result).toMatchObject({
      status: 'error',
      nextAction: 'stop',
      error: {
        code: 'BGM_DISABLED_BY_POLICY',
        details: {
          musicGenerationPolicy: {
            allowed: false,
            reason: expectedReason,
          },
        },
      },
    });
    expect(mocks.generateBackgroundMusic).not.toHaveBeenCalled();
    expect(mocks.updateOverlay).not.toHaveBeenCalled();
    expect(mocks.addOverlay).not.toHaveBeenCalled();
    expect(mocks.deleteOverlay).not.toHaveBeenCalled();
    expect(mocks.dbUpdateOne).not.toHaveBeenCalled();
  });
});
