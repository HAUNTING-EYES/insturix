import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeBeatsFull: vi.fn(),
  generateBackgroundMusic: vi.fn(),
  mediaAssetUpdateOne: vi.fn(),
  modelInvoke: vi.fn(),
  projectFindOne: vi.fn(),
  projectUpdateOne: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAIFixture {
    invoke(...args: unknown[]) {
      return mocks.modelInvoke(...args);
    }
  },
}));

vi.mock('@/lib/pipeline/bgm-service', () => ({
  generateBackgroundMusic: mocks.generateBackgroundMusic,
}));

vi.mock('audio-decode', () => ({
  default: vi.fn(async () => ({
    sampleRate: 48_000,
    channelData: [new Float32Array(48_000)],
  })),
}));

vi.mock('@/lib/editron/services/media/beat-detection-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/services/media/beat-detection-service')>();
  return { ...actual, analyzeBeatsFull: mocks.analyzeBeatsFull };
});

vi.mock('@/lib/editron/db/mongodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/db/mongodb')>();
  return {
    ...actual,
    getDatabase: vi.fn(async () => ({
      collection: vi.fn((name: string) => ({
        findOne: mocks.projectFindOne,
        updateOne: name === 'projects' ? mocks.projectUpdateOne : mocks.mediaAssetUpdateOne,
      })),
    })),
  };
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

import { normalizeAgentToolArgs } from '@/lib/editron/agent/agent-graph';
import type { ChatRequestOwnerLicense } from '@/lib/editron/agent/chat-request-owner';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import { createTools } from '@/lib/editron/agent/tools';
import { resolveRuntimeMusicCoveragePlan } from '@/lib/editron/services/music-coverage-runtime';
import { projectService } from '@/lib/editron/services/project-service';
import { ROW } from '@/lib/pipeline/scene-to-editron';

const BASE_PROJECT = {
  projectId: 'proj_phase3g',
  userId: 'user_1',
  name: 'Phase 3G fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1920, height: 1080 },
  fps: 30,
  durationInFrames: 3600,
  overlays: [] as any[],
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
  updatedAt: new Date('2026-07-17T00:00:00.000Z'),
  visibility: 'private',
};

function conditionedBgmResult(
  assetId: string,
  options: {
    gcsPath?: string | null;
    targetFrames?: number;
    fps?: number;
    platform?: string;
    size?: number;
  } = {},
) {
  const targetFrames = options.targetFrames ?? 3600;
  const fps = options.fps ?? 30;
  const durationMs = (targetFrames / fps) * 1000;
  const gcsPath = options.gcsPath === undefined
    ? `users/user_1/${assetId}.flac`
    : options.gcsPath;
  return {
    audioUrl: `https://cdn.r2.example.com/${assetId}.flac`,
    audioAssetId: assetId,
    musicRights: {
      mediaRole: 'music',
      source: 'generated',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'generated-provider',
        sourceAssetId: assetId,
        licenseId: `fixture-license-${assetId}`,
      },
    },
    gcsPath,
    durationMs,
    filename: `${assetId}.flac`,
    contentType: 'audio/flac',
    buffer: Buffer.alloc(options.size ?? 512),
    conditioning: {
      contentType: 'audio/flac',
      filenameExtension: 'flac',
      targetFrames,
      durationMs,
      sourceDurationMs: 60_000,
      sampleRate: 48_000,
      channels: 2,
      measuredInputLufs: -18,
      measuredOutputLufs: -14,
      truePeakDbtp: -1.1,
      targetLufs: -14,
      targetTruePeakDbtp: -1,
      loudnessPlatform: options.platform ?? 'universal',
      wasLooped: true,
      wasTrimmed: false,
      loopsAdded: 1,
      crossfadeMs: 250,
    },
  };
}

function toolNamed(name: string) {
  const candidate = createTools('user_1', 'proj_phase3g').find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as {
    name: string;
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
}

function parseEnvelope(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'error';
    data: Record<string, any> | null;
    error: { code?: string; message: string } | null;
  };
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

function spyOnOverlayDeleteAtRevisionV1() {
  return vi.spyOn(projectService, 'deleteOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => directMutationResult(projectId, command.expectedRevision),
  );
}

describe('chat Phase 3G operation contracts', () => {
  beforeEach(() => {
    delete process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN;
    mocks.analyzeBeatsFull.mockReset().mockResolvedValue({
      beats: [{ timeMs: 1_100, strength: 1, isDownbeat: true }],
      bpm: 120,
      bpmConfidence: 0.9,
      durationMs: 120_000,
      timeSignatureNumerator: 4,
      energyPeaks: [],
      rawOnsets: [],
    });
    mocks.generateBackgroundMusic.mockReset();
    mocks.mediaAssetUpdateOne.mockReset().mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
    mocks.modelInvoke.mockReset();
    mocks.projectFindOne.mockReset().mockResolvedValue({ ...BASE_PROJECT, projectRevision: 0 });
    mocks.projectUpdateOne.mockReset().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterEach(() => {
    delete process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN;
    vi.restoreAllMocks();
  });

  it('normalizes only frame-valued time arguments with the live project FPS', () => {
    expect(normalizeAgentToolArgs('generate_html_scene', {
      start: '1.5s',
      duration: '2s',
      description: 'Hold for 3s, then reveal the title',
      videoStartTime: '2s',
      styles: 'fontSize: 72px; color: #FFF',
    }, { projectFps: 60 })).toEqual({
      start: 90,
      duration: 120,
      description: 'Hold for 3s, then reveal the title',
      videoStartTime: '2s',
      styles: { fontSize: 72, color: '#FFF' },
    });

    expect(normalizeAgentToolArgs('add_overlay', {
      styles: {
        fontSize: '72px',
        fontWeight: 'extra bold',
        opacity: '0.8',
        borderRadius: '8px',
        color: '#ffffff',
      },
    })).toEqual({
      styles: {
        fontSize: 72,
        fontWeight: 800,
        opacity: 0.8,
        borderRadius: '8px',
        color: '#ffffff',
      },
    });

    expect(normalizeAgentToolArgs('add_overlay', {
      text: 'Launch day',
    })).toEqual({
      text: 'Launch day',
      type: 'text',
    });
    expect(normalizeAgentToolArgs('add_overlay', {
      text: '   ',
    })).toEqual({
      text: '   ',
    });
    expect(normalizeAgentToolArgs('add_overlay', {
      type: 'image',
      text: 'Poster alt text',
    })).toEqual({
      type: 'image',
      text: 'Poster alt text',
    });

    const trustedTimelineLicense: ChatRequestOwnerLicense = {
      version: 'editron-chat-request-owner-v1',
      owner: 'semantic-editorial-planner',
      confidence: 1,
      reason: 'Trusted visible timeline.',
      requestDigest: 'digest',
      decidedBy: 'gemini',
      semanticWorkflow: 'editorial-plan',
      routingFacts: {
        requestsMutation: true,
        requestsAnalysis: false,
        requiresContentLocalization: false,
        requiresEditorialJudgment: true,
        requestsReferenceStyle: false,
        requestsBroadEditorialOutcome: false,
        durableOperation: 'none',
        operationFullySpecified: false,
        targetFullySpecified: true,
        timelineReference: 'visible-timeline',
        localizedReads: [],
        localizedEdits: [],
        requestedCapabilities: ['project-edit'],
        capabilityEvidence: [],
        familyDirectives: [],
        familyScopeExclusive: false,
      },
      trustedTimelineTarget: {
        status: 'ready',
        reference: 'visible-timeline',
        startFrame: 120,
        endFrame: 360,
      },
    };
    expect(normalizeAgentToolArgs('apply_editorial_intent', {
      scopeKind: 'project',
      startFrame: 999,
      endFrame: 1_500,
      overlayIds: ['forged-overlay'],
      instruction: 'Tighten this visible section without changing the rest.',
    }, { requestOwnerLicense: trustedTimelineLicense })).toEqual({
      scopeKind: 'selection',
      startFrame: 120,
      endFrame: 360,
      instruction: 'Tighten this visible section without changing the rest.',
    });
    expect(() => normalizeAgentToolArgs('apply_editorial_intent', {
      instruction: 'Tighten this visible section.',
    }, {
      requestOwnerLicense: {
        ...trustedTimelineLicense,
        trustedTimelineTarget: {
          status: 'unavailable',
          reference: 'visible-timeline',
        },
      },
    })).toThrow('Trusted visible-timeline context is unavailable');

    const routeSource = readFileSync(join(
      process.cwd(),
      'app/api/services/editron/chat/stream/route.ts',
    ), 'utf8');
    expect(routeSource).toContain('projectFps: project.fps');
    expect(routeSource).toContain('bindTrustedTimelineTarget(');
    expect(routeSource).toContain('visibleTimelinePresent: Boolean(chatEditContext.visibleTimeline)');
  });

  it('revises an existing HTML scene under the same overlay identity', async () => {
    const scene = {
      id: 41,
      type: 'html-scene',
      from: 120,
      durationInFrames: 180,
      row: 3,
      width: 1920,
      height: 1080,
      content: '<div style="color:#FFFFFF">Original headline</div>',
      prompt: 'Original scene',
      styles: { opacity: 0.9 },
    };
    const update = spyOnOverlayUpdateAtRevisionV1();
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({ ...BASE_PROJECT, overlays: [scene] } as any)
      .mockImplementationOnce(async () => ({
        ...BASE_PROJECT,
        overlays: [{ ...scene, content: (update.mock.calls[0]![2] as any).updates.content }],
      }) as any);
    const add = spyOnOverlayAddAtRevisionV1();
    const remove = spyOnOverlayDeleteAtRevisionV1();
    mocks.modelInvoke.mockResolvedValue({
      content: '<div style="color:#FFD166;font-family:Inter">Revised headline</div>',
    });

    const result = parseEnvelope(await toolNamed('edit_html_scene').invoke({
      id: 41,
      instructions: 'Use the brand gold and change the headline to Revised headline.',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        id: 41,
        replacedInPlace: true,
        affectedFrameRanges: [{ startFrame: 120, endFrame: 300 }],
      },
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('user_1', 'proj_phase3g', expect.objectContaining({
      actorKind: 'AGENT',
      overlayId: 41,
      updates: expect.objectContaining({
        content: expect.stringContaining('Revised headline'),
        prompt: expect.stringContaining('Revision:'),
      }),
    }));
    const updatePatch = update.mock.calls[0]![2].updates as Record<string, unknown>;
    expect(updatePatch).not.toHaveProperty('id');
    expect(updatePatch).not.toHaveProperty('from');
    expect(updatePatch).not.toHaveProperty('durationInFrames');
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(CHAT_TOOL_REGISTRY.edit_html_scene).toMatchObject({
      mutatesProject: true,
      executionType: 'generative',
    });
  });

  it('rejects HTML-scene revisions before generation when the target family is wrong', async () => {
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [{ id: 42, type: 'text', content: 'Not HTML', from: 0, durationInFrames: 30 }],
    } as any);
    const update = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');

    const result = parseEnvelope(await toolNamed('edit_html_scene').invoke({
      id: 42,
      instructions: 'Make it gold.',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'HTML_SCENE_TYPE_MISMATCH' },
    });
    expect(mocks.modelInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps current BGM and persistence untouched when generation fails', async () => {
    const currentBgm = {
      id: 70,
      type: 'sound',
      row: ROW.BGM,
      from: 0,
      durationInFrames: 3600,
      assetId: 'bgm_old',
      src: 'https://cdn.example.com/old.mp3',
      styles: { volume: 0.6 },
    };
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [currentBgm],
    } as any);
    const update = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
    const add = vi.spyOn(projectService, 'addOverlayAtRevisionV1');
    const remove = vi.spyOn(projectService, 'deleteOverlayAtRevisionV1');
    mocks.generateBackgroundMusic.mockRejectedValue(new Error('provider unavailable'));

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'calm editorial' }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'BGM_REPLACEMENT_FAILED' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.mediaAssetUpdateOne).not.toHaveBeenCalled();
  });

  it('keeps current BGM untouched when exact-length conditioning evidence is missing', async () => {
    const currentBgm = {
      id: 75,
      type: 'sound',
      row: ROW.BGM,
      from: 0,
      durationInFrames: 3600,
      assetId: 'bgm_old',
      src: 'https://cdn.example.com/old.mp3',
      styles: { volume: 0.5 },
    };
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [currentBgm],
    } as any);
    const update = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
    const add = vi.spyOn(projectService, 'addOverlayAtRevisionV1');
    const remove = vi.spyOn(projectService, 'deleteOverlayAtRevisionV1');
    mocks.generateBackgroundMusic.mockResolvedValue({
      audioUrl: 'https://cdn.example.com/unconditioned.mp3',
      audioAssetId: 'bgm_unconditioned',
      gcsPath: null,
      durationMs: 120_000,
      filename: 'bgm_unconditioned.mp3',
      contentType: 'audio/mpeg',
      buffer: Buffer.alloc(256),
    });

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'calm' }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'BGM_CONDITIONING_NOT_VERIFIED' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.mediaAssetUpdateOne).not.toHaveBeenCalled();
  });

  it('REGRESSION (C1 matrix): accepts an R2-primary result where gcsPath is null by design', async () => {
    // upload-service returns gcsPath:null on the R2 path (GCS is only mirrored for
    // Gemini analysis). The validator used to require gcsPath and rejected every
    // healthy R2-hosted track with BGM_INVALID_GENERATED_ASSET on preview/prod.
    const currentBgm = {
      id: 80, type: 'sound', row: ROW.BGM, from: 0, durationInFrames: 3600,
      assetId: 'bgm_old', src: 'https://cdn.example.com/old.mp3', styles: { volume: 0.5 },
    };
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({ ...BASE_PROJECT, overlays: [currentBgm] } as any)
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        overlays: [{
          ...currentBgm,
          assetId: 'bgm_r2',
          metadata: { musicCoverage: { sectionIndex: 0 } },
        }],
      } as any);
    const update = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
    vi.spyOn(projectService, 'addOverlayAtRevisionV1');
    vi.spyOn(projectService, 'deleteOverlayAtRevisionV1');
    mocks.generateBackgroundMusic.mockResolvedValue(conditionedBgmResult('bgm_r2', {
      gcsPath: null, // R2-primary shape — must NOT be rejected
      size: 256,
    }));

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'calm' }));

    expect(result, JSON.stringify(result)).toMatchObject({ status: 'success', data: { assetId: 'bgm_r2' } });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.projectUpdateOne).toHaveBeenCalledTimes(1);
    // Metadata write records the honest null (consistent with all R2-primary assets).
    expect(mocks.mediaAssetUpdateOne).toHaveBeenCalledWith(
      { assetId: 'bgm_r2', userId: 'user_1' },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ gcsPath: null }) }),
      { upsert: true },
    );
  });

  it('atomically replaces every persisted coverage section after registering the generated BGM', async () => {
    const sectionCoveragePlan = resolveRuntimeMusicCoveragePlan({
      totalFrames: 3600,
      fps: 30,
      contentType: 'vlog',
      speechSegments: [
        { startFrame: 0, endFrame: 120 },
        { startFrame: 240, endFrame: 330 },
      ],
    });
    const primary = {
      id: 70, type: 'sound', row: ROW.BGM, from: 120, durationInFrames: 120,
      startFromSound: 120, assetId: 'bgm_old', styles: { volume: 0.6 },
      audioRights: {
        mediaRole: 'music', source: 'preview-only', userChoice: 'no-music', licensed: false,
      },
      musicRights: {
        mediaRole: 'music', source: 'preview-only', userChoice: 'no-music', licensed: false,
      },
      metadata: { role: 'background-music', musicCoverage: { sectionIndex: 0 } },
    };
    const duplicate = {
      ...primary,
      id: 71,
      from: 330,
      durationInFrames: 3270,
      startFromSound: 330,
      assetId: 'bgm_duplicate',
      metadata: { role: 'background-music', musicCoverage: { sectionIndex: 1 } },
    };
    const voice = {
      id: 10, type: 'video', from: 0, durationInFrames: 3600,
      hasNativeAudio: true, assetId: 'video_voice',
    };
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        editorialPreferences: { musicPrompt: 'restrained documentary texture' },
        productionBrief: { output: { platform: 'tiktok' } },
        referenceEditDNA: { musicStyle: { genre: 'minimal electronic', tempo: 'medium' } },
        musicCoveragePlan: sectionCoveragePlan,
        overlays: [voice, primary, duplicate],
      } as any)
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        overlays: [
          voice,
          { ...primary, assetId: 'bgm_new', metadata: { musicCoverage: { sectionIndex: 0 } } },
          { ...duplicate, assetId: 'bgm_new', metadata: { musicCoverage: { sectionIndex: 1 } } },
        ],
      } as any);
    mocks.projectFindOne.mockResolvedValueOnce({
      ...BASE_PROJECT,
      projectRevision: 0,
      overlays: [voice, primary, duplicate],
    });
    const update = vi.spyOn(projectService, 'updateOverlayAtRevisionV1');
    const add = vi.spyOn(projectService, 'addOverlayAtRevisionV1');
    const remove = vi.spyOn(projectService, 'deleteOverlayAtRevisionV1');
    mocks.generateBackgroundMusic.mockResolvedValue(conditionedBgmResult('bgm_new', {
      platform: 'tiktok',
      size: 512,
    }));

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({
      mood: 'hopeful and restrained',
      prompt: 'Warm analog pulse with a subtle lift near the ending',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        overlayId: 70,
        overlayIds: [70, 71],
        assetId: 'bgm_new',
        durationSec: 120,
        replacedInPlace: true,
        replacedOverlayCount: 2,
        removedDuplicateCount: 0,
        musicCoveragePlan: { mode: 'sections' },
      },
    });
    expect(mocks.generateBackgroundMusic).toHaveBeenCalledWith(
      expect.stringMatching(/Warm analog pulse.*hopeful and restrained.*instrumental only, no vocals/i),
      'user_1',
      120,
      {
        conditioning: {
          targetFrames: 3600,
          fps: 30,
          platform: 'tiktok',
        },
      },
    );
    expect(mocks.mediaAssetUpdateOne).toHaveBeenCalledWith(
      { assetId: 'bgm_new', userId: 'user_1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          source: 'generated',
          projectId: 'proj_phase3g',
          filename: 'bgm_new.flac',
          contentType: 'audio/flac',
          duration: 120,
          size: 512,
          audioConditioningEvidence: expect.objectContaining({
            targetFrames: 3600,
            fps: 30,
            requestedPlatform: 'tiktok',
            platformSource: 'project.productionBrief.output.platform',
            measuredOutputLufs: -14,
          }),
        }),
      }),
      { upsert: true },
    );
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.projectUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.projectUpdateOne.mock.calls[0][0]).toEqual({
      projectId: 'proj_phase3g',
      userId: 'user_1',
      $or: [
        { projectRevision: 0 },
        { projectRevision: { $exists: false } },
      ],
      updatedAt: BASE_PROJECT.updatedAt,
    });
    const projectMutation = mocks.projectUpdateOne.mock.calls[0][1];
    const persistedBgmFamily = projectMutation.$set.overlays.filter(
      (overlay: any) => overlay.type === 'sound' && overlay.row === ROW.BGM,
    );
    expect(persistedBgmFamily).toHaveLength(2);
    expect(persistedBgmFamily[0]).toMatchObject({
      id: 70,
      assetId: 'bgm_new',
      from: 120,
      durationInFrames: 120,
      startFromSound: 120,
      styles: { duckingConfig: { enabled: true } },
      audioRights: {
        mediaRole: 'music', source: 'generated', userChoice: 'attested', licensed: true,
      },
      musicRights: {
        mediaRole: 'music', source: 'generated', userChoice: 'attested', licensed: true,
      },
      metadata: {
        musicCoverage: { mode: 'sections', sectionIndex: 0 },
        audioPolicyEvidence: {
          version: 'chat-bgm-replacement-v3',
          mixOwner: 'applyAudioDuckingToProject',
          speechEvidenceCount: 1,
          voiceSourceOverlayIds: [10],
          audioConditioningEvidence: {
            targetFrames: 3600,
            fps: 30,
            loudnessPlatform: 'tiktok',
          },
        },
      },
    });
    expect(persistedBgmFamily[1]).toMatchObject({
      id: 71,
      assetId: 'bgm_new',
      from: 330,
      durationInFrames: 3270,
      startFromSound: 330,
      metadata: { musicCoverage: { mode: 'sections', sectionIndex: 1 } },
    });
    expect(projectMutation.$set.musicCoveragePlan).toEqual(sectionCoveragePlan);
    expect(mocks.mediaAssetUpdateOne.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.projectUpdateOne.mock.invocationCallOrder[0]!);
  });

  it('keeps the old timeline family when the atomic project revision check loses a race', async () => {
    const currentBgm = {
      id: 90, type: 'sound', row: ROW.BGM, from: 0, durationInFrames: 3600,
      assetId: 'bgm_old', styles: { volume: 0.5 },
    };
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [currentBgm],
    } as any);
    mocks.generateBackgroundMusic.mockResolvedValue(conditionedBgmResult('bgm_conflict'));
    mocks.projectUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'restrained' }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'BGM_PROJECT_CONFLICT' },
    });
    expect(mocks.mediaAssetUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.projectUpdateOne).toHaveBeenCalledTimes(1);
  });

  it('stores one analyzed beat grid and defers picture-cut realignment to its mutation owner', async () => {
    process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN = 'true';
    mocks.analyzeBeatsFull.mockResolvedValueOnce({
      beats: [{ timeMs: 2_100, strength: 1, isDownbeat: true }],
      bpm: 120,
      bpmConfidence: 0.92,
      durationMs: 120_000,
      timeSignatureNumerator: 4,
      energyPeaks: [],
      rawOnsets: [],
    });
    const first = { id: 1, type: 'video', row: ROW.VIDEO, from: 0, durationInFrames: 60 };
    const second = { id: 2, type: 'image', row: ROW.VIDEO, from: 60, durationInFrames: 60 };
    const currentBgm = {
      id: 70, type: 'sound', row: ROW.BGM, from: 0, durationInFrames: 3600,
      assetId: 'bgm_old', styles: { volume: 0.5 },
    };
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({ ...BASE_PROJECT, overlays: [first, second, currentBgm] } as any)
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        overlays: [
          first,
          second,
          {
            ...currentBgm,
            assetId: 'bgm_beats',
            metadata: { musicCoverage: { sectionIndex: 0 } },
          },
        ],
      } as any);
    mocks.projectFindOne.mockResolvedValueOnce({
      ...BASE_PROJECT,
      projectRevision: 0,
      overlays: [first, second, currentBgm],
    });
    mocks.generateBackgroundMusic.mockResolvedValue(conditionedBgmResult('bgm_beats'));

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'rhythmic' }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        beatRealignment: {
          enabled: false,
          requested: true,
          deferred: true,
          snappedCutCount: 0,
          beatCount: 1,
        },
      },
    });
    expect(mocks.mediaAssetUpdateOne).toHaveBeenCalledWith(
      { assetId: 'bgm_beats', userId: 'user_1' },
      expect.objectContaining({ $set: expect.objectContaining({ beatAnalysis: expect.any(Object) }) }),
      { upsert: true },
    );
    const nextOverlays = mocks.projectUpdateOne.mock.calls[0][1].$set.overlays;
    expect(nextOverlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, durationInFrames: 60 }),
      expect.objectContaining({ id: 2, from: 60, durationInFrames: 60 }),
      expect.objectContaining({
        id: 70,
        assetId: 'bgm_beats',
        metadata: expect.objectContaining({
          beatGrid: expect.objectContaining({
            source: 'audio-analysis',
            beats: [{ frame: 63, isDownbeat: true }],
          }),
        }),
      }),
    ]));
  });
});
