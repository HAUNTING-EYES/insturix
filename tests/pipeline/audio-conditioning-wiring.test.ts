import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    saveProjectWithReceipt: vi.fn(),
    loadProject: vi.fn(),
    loadProjectForMutation: vi.fn(),
    updateOverlay: vi.fn(),
    addOverlay: vi.fn(),
    deleteOverlay: vi.fn(),
    commitPipelineAudioDeliveryV1: vi.fn(),
    alignCutsToBeatsAtRevisionV1: vi.fn(),
    recordPipelineDirectorIntentV1: vi.fn(),
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
    saveProjectWithReceipt: mocks.saveProjectWithReceipt,
    loadProject: mocks.loadProject,
    loadProjectForMutation: mocks.loadProjectForMutation,
    updateOverlay: mocks.updateOverlay,
    addOverlay: mocks.addOverlay,
    deleteOverlay: mocks.deleteOverlay,
    commitPipelineAudioDeliveryV1: mocks.commitPipelineAudioDeliveryV1,
    alignCutsToBeatsAtRevisionV1: mocks.alignCutsToBeatsAtRevisionV1,
    recordPipelineDirectorIntentV1: mocks.recordPipelineDirectorIntentV1,
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
import { projectPipelineAudioTimelineBindingHashV1 } from '../../lib/editron/services/pipeline-audio-project-delivery-v1';
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
    musicRights: {
      source: 'generated' as const,
      userChoice: 'attested' as const,
      licensed: true,
      evidence: {
        kind: 'generated-provider' as const,
        sourceAssetId: 'bgm_conditioned',
        licenseId: 'fal-ai:cassetteai/music-generator:commercial-use',
      },
    },
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

function makeFinalizeTimelineSnapshot() {
  return {
    projectId: 'proj_audio',
    userId: 'user_1',
    fps: 30,
    durationInFrames: 150,
    overlays: [
      {
        id: 'video_initial',
        type: 'video',
        row: 1,
        from: 0,
        durationInFrames: 150,
        assetId: 'video_1',
        content: 'https://cdn.example.com/scene.mp4',
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

function makeAudioWorkerRequest(body: Record<string, unknown>) {
  return makeRequest({
    audioDeliveryId: 'audio-delivery_abcdefghijklmnopqr',
    ...body,
  });
}

function makeAudioWorkerDeliveryResult(input: Record<string, unknown>) {
  const outcome = input.outcome;
  return {
    disposition: 'APPLIED',
    deliveryReceipt: {
      deliveryId: input.deliveryId,
      kind: input.kind,
      outcome,
      afterRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: '2026-08-25T00:00:01.000Z',
      },
      rebase: 'FRESH',
      proof: outcome === 'ATTACHED'
        ? {
          required: true,
          status: 'UNVERIFIABLE',
          reason: 'NO_RENDERED_AUDIO_OR_MIX_PROOF',
        }
        : {
          required: false,
          status: null,
          reason: 'NO_AUDIO_OVERLAY_ATTACHED',
        },
    },
  };
}

function lastAudioWorkerDeliveryCommand(): Record<string, any> {
  const call = mocks.commitPipelineAudioDeliveryV1.mock.calls.at(-1);
  expect(call, 'audio worker must finalize through ProjectService').toBeDefined();
  return call![2] as Record<string, any>;
}

function expectNoRawProjectWrite() {
  expect(mocks.dbUpdateOne.mock.calls.some(
    ([collectionName]) => collectionName === 'projects',
  )).toBe(false);
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
  it('stamps provider rights at generation and persists them in every producer', () => {
    const serviceSource = readFileSync(
      resolve(process.cwd(), 'lib/pipeline/bgm-service.ts'),
      'utf8',
    );
    expect(serviceSource).toContain(
      "licenseId: 'fal-ai:cassetteai/music-generator:commercial-use'",
    );

    for (const producerPath of [
      'app/api/internal/workers/pipeline/audio/route.ts',
      'app/api/services/pipeline/storyboard/[id]/finalize/route.ts',
      'lib/editron/agent/tools.ts',
    ]) {
      const producerSource = readFileSync(resolve(process.cwd(), producerPath), 'utf8');
      expect(producerSource.match(/musicRights: bgm\.musicRights/g), producerPath).toHaveLength(2);
    }
  });

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
    mocks.saveProjectWithReceipt.mockResolvedValue({
      disposition: 'APPLIED',
      mutationReceipt: {
        revision: {
          schemaVersion: 1,
          value: 2,
          compatibilityUpdatedAt: '2026-08-25T00:00:00.500Z',
        },
      },
    });
    mocks.loadProjectForMutation.mockResolvedValue({
      project: makeFinalizeTimelineSnapshot(),
      revision: {
        schemaVersion: 1,
        value: 1,
        compatibilityUpdatedAt: '2026-08-25T00:00:00.000Z',
      },
    });
    mocks.commitPipelineAudioDeliveryV1.mockImplementation(async (
      _userId: unknown,
      _projectId: unknown,
      input: Record<string, unknown>,
    ) => makeAudioWorkerDeliveryResult(input));
    mocks.alignCutsToBeatsAtRevisionV1.mockResolvedValue({
      disposition: 'APPLIED',
      mutationReceipt: {
        revision: {
          schemaVersion: 1,
          value: 9,
          compatibilityUpdatedAt: '2026-08-25T00:00:02.000Z',
        },
      },
    });
    mocks.recordPipelineDirectorIntentV1.mockResolvedValue({
      disposition: 'RECORDED',
      receipt: {
        schemaVersion: 1,
        projectId: 'proj_audio',
        revision: {
          schemaVersion: 1,
          value: 2,
          compatibilityUpdatedAt: '2026-08-25T00:00:01.000Z',
        },
        committedAt: '2026-08-25T00:00:01.000Z',
      },
    });
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

  it('conditions and delivers beat-sync BGM through ProjectService after the initial project save', async () => {
    mocks.getStoryboard.mockResolvedValue(makeStoryboard(true));
    const expectedSnapshot = makeFinalizeTimelineSnapshot();

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

    const deliveryCall = mocks.commitPipelineAudioDeliveryV1.mock.calls.find(
      ([, projectId, command]) => (
        projectId === 'proj_audio'
        && command?.kind === 'BGM'
        && command?.outcome === 'ATTACHED'
      ),
    );
    expect(deliveryCall).toBeDefined();
    const delivery = deliveryCall?.[2] as Record<string, any>;
    expect(delivery).toMatchObject({
      expectedRevision: {
        schemaVersion: 1,
        value: 1,
        compatibilityUpdatedAt: '2026-08-25T00:00:00.000Z',
      },
      planningTimelineBindingHash: projectPipelineAudioTimelineBindingHashV1(expectedSnapshot),
      deliveryId: expect.stringMatching(/^audio-delivery_[A-Za-z0-9_-]{18}$/),
      kind: 'BGM',
      outcome: 'ATTACHED',
      musicCoveragePlan: expect.objectContaining({
        version: 'music-coverage-plan-v1',
        mode: 'full',
      }),
    });
    expect(delivery).not.toHaveProperty('beatFrames');
    expect(delivery.overlays).toHaveLength(1);
    expect(delivery.overlays[0]).toMatchObject({
      from: 0,
      durationInFrames: 150,
      startFromSound: 0,
      _workerAdded: true,
      musicRights: makeConditionedBgm(150).musicRights,
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
    expect(mocks.alignCutsToBeatsAtRevisionV1).toHaveBeenCalledWith(
      'user_1',
      'proj_audio',
      expect.objectContaining({
        expectedRevision: expect.objectContaining({ value: 8 }),
        actorKind: 'SYSTEM',
        audioOverlayId: delivery.overlays[0].id,
        evidenceSource: 'persisted-beat-grid',
      }),
    );
    expect(mocks.saveProjectWithReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.commitPipelineAudioDeliveryV1.mock.invocationCallOrder[0],
    );
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.$each?.some(
          (overlay: any) => overlay?.metadata?.source === 'finalize-sync-beat-sync',
        )
      ),
    )).toBe(false);

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
      musicRights: makeConditionedBgm(150).musicRights,
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

  it('does not raw-append BGM after ProjectService blocks the planned visual binding', async () => {
    mocks.getStoryboard.mockResolvedValue(makeStoryboard(true));
    mocks.commitPipelineAudioDeliveryV1.mockRejectedValueOnce(Object.assign(
      new Error('Pipeline audio delivery cannot safely rebase: TIMELINE_BINDING_CHANGED.'),
      { code: 'PROJECT_PIPELINE_AUDIO_DELIVERY_REBASE_BLOCKED' },
    ));

    const response = await finalizeStoryboard(makeRequest({}) as any, {
      params: Promise.resolve({ id: 'sb_audio' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.commitPipelineAudioDeliveryV1).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchAudioJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bgm',
        projectId: 'proj_audio',
        userId: 'user_1',
      }),
      'BGM',
    );
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, , mutation]) => (
        collectionName === 'projects'
        && mutation?.$push?.overlays?.$each?.some(
          (overlay: any) => overlay?.metadata?.source === 'finalize-sync-beat-sync',
        )
      ),
    )).toBe(false);
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
    expect(mocks.saveProjectWithReceipt.mock.calls.some(
      ([, , , options]) => (
        options?.projectUpdates?.musicCoveragePlan?.mode === 'none'
        && options.projectUpdates.musicCoveragePlan.reasonCodes?.includes('no-licensed-sections')
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
    expect(mocks.saveProjectWithReceipt.mock.calls.some(
      ([, , , options]) => (
        options?.projectUpdates?.musicGenerationPolicy?.reason === expectedReason
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
    mocks.loadProjectForMutation.mockResolvedValue({
      project: {
        projectId: 'proj_worker',
        userId: 'user_1',
        fps: 30,
        durationInFrames: 450,
        overlays: [],
        productionBrief: { output: { platform: 'youtube' } },
      },
      revision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-25T00:00:00.000Z',
      },
    });
    mocks.commitPipelineAudioDeliveryV1.mockImplementation(async (
      _userId: unknown,
      _projectId: unknown,
      input: Record<string, unknown>,
    ) => makeAudioWorkerDeliveryResult(input));
    mocks.alignCutsToBeatsAtRevisionV1.mockResolvedValue({
      disposition: 'APPLIED',
      mutationReceipt: {
        revision: {
          schemaVersion: 1,
          value: 9,
          compatibilityUpdatedAt: '2026-08-25T00:00:02.000Z',
        },
      },
    });
  });

  it('keeps project mutation behind ProjectService', () => {
    const workerSource = readFileSync(
      resolve(process.cwd(), 'app/api/internal/workers/pipeline/audio/route.ts'),
      'utf8',
    );
    expect(workerSource).toContain('projectService.commitPipelineAudioDeliveryV1');
    expect(workerSource).not.toContain('COLLECTIONS.PROJECTS');
    expect(workerSource).not.toContain("collection('projects')");
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

    const response = await runAudioWorker(makeAudioWorkerRequest({
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

    const delivery = lastAudioWorkerDeliveryCommand();
    expect(delivery).toMatchObject({
      deliveryId: 'audio-delivery_abcdefghijklmnopqr',
      kind: 'BGM',
      outcome: 'ATTACHED',
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-25T00:00:00.000Z',
      },
      planningTimelineBindingHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(delivery).not.toHaveProperty('beatFrames');
    expect(delivery.overlays).toHaveLength(1);
    expect(delivery.overlays[0]).toMatchObject({
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
    expect(mocks.alignCutsToBeatsAtRevisionV1).toHaveBeenCalledWith(
      'user_1',
      'proj_worker',
      expect.objectContaining({
        expectedRevision: expect.objectContaining({ value: 8 }),
        actorKind: 'SYSTEM',
        audioOverlayId: delivery.overlays[0].id,
        evidenceSource: 'persisted-beat-grid',
      }),
    );
    expect(mocks.alignCutsToBeats).not.toHaveBeenCalled();
    expectNoRawProjectWrite();
    const assetMutation = mocks.dbUpdateOne.mock.calls.find(
      ([collectionName, filter]) => (
        collectionName === 'mediaAssets' && filter?.assetId === 'bgm_conditioned'
      ),
    );
    expect(assetMutation?.[2].$set).toMatchObject({
      musicRights: makeConditionedBgm(450, 30, 'tiktok').musicRights,
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

    const response = await runAudioWorker(makeAudioWorkerRequest({
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
    const delivery = lastAudioWorkerDeliveryCommand();
    expect(delivery.overlays[0].metadata.audioConditioning).toMatchObject({
      requestedPlatform: 'youtube',
      platformEvidenceSource: 'project.productionBrief.output.platform',
      loudnessPlatform: 'youtube',
    });
    expectNoRawProjectWrite();
  });

  it('fails before overlay or asset mutation when conditioning evidence is invalid', async () => {
    mocks.generateBackgroundMusic.mockResolvedValue({
      ...makeConditionedBgm(450),
      filename: 'bgm_raw.mp3',
      contentType: 'audio/mpeg',
      conditioning: undefined,
    });

    const response = await runAudioWorker(makeAudioWorkerRequest({
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
    expect(lastAudioWorkerDeliveryCommand()).toMatchObject({
      kind: 'BGM',
      outcome: 'FAILED',
      overlays: [],
    });
    expectNoRawProjectWrite();
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

    const response = await runAudioWorker(makeAudioWorkerRequest({
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
    expect(lastAudioWorkerDeliveryCommand().overlays).toMatchObject([
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
    expectNoRawProjectWrite();
  });

  it('rejects a tampered coverage plan before provider or asset mutation', async () => {
    const tamperedPlan = {
      ...makeFullCoveragePlan(450),
      sections: [{ ...makeFullCoveragePlan(450).sections[0], endFrame: 449 }],
    };

    const response = await runAudioWorker(makeAudioWorkerRequest({
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
    expect(lastAudioWorkerDeliveryCommand()).toMatchObject({
      kind: 'BGM',
      outcome: 'FAILED',
      overlays: [],
    });
    expectNoRawProjectWrite();
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
    const response = await runAudioWorker(makeAudioWorkerRequest({
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
    const delivery = lastAudioWorkerDeliveryCommand();
    expect(delivery).toMatchObject({
      kind: 'BGM',
      outcome: 'SKIPPED',
      overlays: [],
    });
    expect(delivery).not.toHaveProperty('musicCoveragePlan');
    expectNoRawProjectWrite();
  });

  it('rejects a missing delivery identity before loading the project or generating media', async () => {
    const response = await runAudioWorker(makeRequest({
      type: 'sfx',
      projectId: 'proj_worker',
      userId: 'user_1',
      sfxInputs: [],
      sceneFrameMap: [],
    }) as any);

    expect(response.status).toBe(400);
    expect(mocks.loadProjectForMutation).not.toHaveBeenCalled();
    expect(mocks.generateSFXForScenes).not.toHaveBeenCalled();
    expect(mocks.commitPipelineAudioDeliveryV1).not.toHaveBeenCalled();
  });

  it('delivers SFX through ProjectService while retaining separate media-asset registration', async () => {
    mocks.generateSFXForScenes.mockResolvedValue(new Map([[0, {
      audioUrl: 'https://cdn.example.com/sfx-hit.mp3',
      audioAssetId: 'sfx_hit',
      audioRights: { source: 'generated', licensed: true },
      gcsPath: 'generated/sfx-hit.mp3',
    }]]));

    const response = await runAudioWorker(makeAudioWorkerRequest({
      type: 'sfx',
      projectId: 'proj_worker',
      userId: 'user_1',
      sfxInputs: [{ sceneIndex: 0, audioDescription: 'restrained impact', durationSeconds: 1 }],
      sceneFrameMap: [{ sceneIndex: 0, fromFrame: 120, durationFrames: 30, durationSec: 1 }],
    }) as any);

    expect(response.status).toBe(200);
    expect(lastAudioWorkerDeliveryCommand()).toMatchObject({
      kind: 'SFX',
      outcome: 'ATTACHED',
      overlays: [{
        row: 4,
        from: 120,
        durationInFrames: 30,
        assetId: 'sfx_hit',
        content: 'https://cdn.example.com/sfx-hit.mp3',
      }],
    });
    expect(mocks.dbUpdateOne.mock.calls.some(
      ([collectionName, filter]) => collectionName === 'mediaAssets' && filter?.assetId === 'sfx_hit',
    )).toBe(true);
    expectNoRawProjectWrite();
  });

  it('propagates an owner rebase conflict without a raw project-write fallback', async () => {
    mocks.generateBackgroundMusic.mockImplementation(
      (_prompt, _userId, _durationSec, options) => Promise.resolve(
        makeConditionedBgm(
          options.conditioning.targetFrames,
          options.conditioning.fps,
          options.conditioning.platform,
        ),
      ),
    );
    mocks.commitPipelineAudioDeliveryV1.mockRejectedValueOnce(Object.assign(
      new Error('Pipeline audio delivery cannot safely rebase: TIMELINE_BINDING_CHANGED.'),
      { code: 'PROJECT_PIPELINE_AUDIO_DELIVERY_REBASE_BLOCKED' },
    ));

    const response = await runAudioWorker(makeAudioWorkerRequest({
      type: 'bgm',
      projectId: 'proj_worker',
      userId: 'user_1',
      musicPrompt: 'conflicting score',
      totalDurationSec: 15,
      totalFrames: 450,
      fps: 30,
      musicCoveragePlan: makeFullCoveragePlan(450),
    }) as any);

    expect(response.status).toBe(409);
    expect(mocks.commitPipelineAudioDeliveryV1).toHaveBeenCalledTimes(1);
    expectNoRawProjectWrite();
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
