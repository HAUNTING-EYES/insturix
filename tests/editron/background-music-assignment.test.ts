import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_ASSETS: 'mediaAssets',
    PROJECTS: 'projects',
  },
  getDatabase: vi.fn(),
}));
vi.mock('@/lib/editron/services/gcs-service', () => ({
  refreshSignedUrl: vi.fn(),
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  getR2PresignedReadUrl: vi.fn(),
}));
vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: vi.fn(),
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProject: vi.fn(),
    replaceOverlayFamilyAtomic: vi.fn(),
  },
}));

import {
  assignBackgroundMusic,
  type BackgroundMusicAssignmentDependencies,
  type BackgroundMusicAssignmentInput,
} from '@/lib/editron/services/background-music-assignment';
import { MAX_AUDIO_CONDITIONING_INPUT_BYTES } from '@/lib/pipeline/audio-conditioning';
import { ROW } from '@/lib/pipeline/scene-to-editron';

const NOW = new Date('2026-07-25T10:00:00.000Z');
const INPUT: BackgroundMusicAssignmentInput = {
  userId: 'user_1',
  projectId: 'project_1',
  assetId: 'audio_1',
  idempotencyKey: 'assign_001',
  rightsAttestation: {
    accepted: true,
    version: 'music-rights-attestation-v1',
  },
};
const CONDITIONED = {
  buffer: Buffer.from('conditioned-flac'),
  contentType: 'audio/flac' as const,
  filenameExtension: 'flac' as const,
  targetFrames: 300,
  durationMs: 10_000,
  sourceDurationMs: 2_000,
  sampleRate: 48_000,
  channels: 2,
  measuredInputLufs: -21,
  measuredOutputLufs: -14,
  truePeakDbtp: -1.5,
  targetLufs: -14,
  targetTruePeakDbtp: -1,
  loudnessPlatform: 'youtube',
  wasLooped: true,
  wasTrimmed: false,
  loopsAdded: 4,
  crossfadeMs: 250,
};
const BEAT_EVIDENCE = {
  beatAnalysis: {
    beats: [
      { timeMs: 0, strength: 0.9, isDownbeat: true },
      { timeMs: 5_000, strength: 0.8, isDownbeat: false },
    ],
    bpm: 120,
    bpmConfidence: 0.92,
    durationMs: 10_000,
    timeSignatureNumerator: 4,
    energyPeaks: [],
    rawOnsets: [],
  },
  beatGrid: {
    bpm: 120,
    bpmConfidence: 0.92,
    beats: [
      { frame: 0, isDownbeat: true },
      { frame: 150, isDownbeat: false },
    ],
    downbeats: [0],
    firstBeatOffsetFrames: 0,
    source: 'audio-analysis' as const,
  },
};

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    updatedAt: new Date('2026-07-25T09:00:00.000Z'),
    durationInFrames: 300,
    fps: 30,
    platform: 'youtube',
    musicPreference: 'subtle_bed',
    featureFlags: { musicChangeBeatRealign: true },
    overlays: [
      { id: 1, type: 'video', row: ROW.VIDEO, from: 0, durationInFrames: 140 },
      { id: 2, type: 'video', row: ROW.VIDEO, from: 140, durationInFrames: 160 },
      { id: 3, type: 'sound', row: ROW.VOICEOVER, from: 0, durationInFrames: 300 },
      {
        id: 4,
        type: 'sound',
        row: ROW.BGM,
        from: 0,
        durationInFrames: 300,
        assetId: 'old_bgm',
        styles: { volume: 0.2 },
      },
    ],
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<BackgroundMusicAssignmentDependencies> = {},
): BackgroundMusicAssignmentDependencies {
  return {
    loadProject: vi.fn(async () => projectFixture()),
    findAsset: vi.fn(async () => ({
      assetId: 'audio_1',
      userId: 'user_1',
      type: 'audio',
      source: 'user-upload',
      r2Key: 'users/user_1/audio_1.wav',
    })),
    resolveR2ReadUrl: vi.fn(async () => 'https://controlled.example/audio'),
    resolveGcsReadUrl: vi.fn(async () => 'https://controlled.example/gcs-audio'),
    fetchAsset: vi.fn(async () => new Response(Buffer.from('source-audio'))) as typeof fetch,
    condition: vi.fn(async () => CONDITIONED),
    analyze: vi.fn(async () => BEAT_EVIDENCE),
    upload: vi.fn(async (_file, _userId, _filename, contentType, options) => {
      if (!options?.customAssetId) throw new Error('customAssetId is required');
      return {
        assetId: options.customAssetId,
        signedUrl: 'https://cdn.example/conditioned.flac',
        gcsPath: null,
        r2Key: 'users/user_1/conditioned.flac',
        urlExpiresAt: null,
        size: CONDITIONED.buffer.length,
        contentType,
      };
    }),
    upsertDerivativeAsset: vi.fn(async () => undefined),
    setDerivativeAssignmentStatus: vi.fn(async () => undefined),
    replaceOverlayFamilyAtomic: vi.fn(async () => true),
    now: vi.fn(() => NOW),
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN;
  vi.restoreAllMocks();
});

describe('background music assignment', () => {
  it('conditions, analyzes, rights-stamps, mixes, beat-aligns, and atomically replaces BGM', async () => {
    const deps = dependencies();
    const result = await assignBackgroundMusic(INPUT, deps);
    const bgm = result.overlays.find((overlay: any) => overlay.row === ROW.BGM) as any;

    expect(result).toMatchObject({
      replayed: false,
      sourceAssetId: 'audio_1',
      snappedCutCount: 1,
      musicRights: {
        source: 'user-upload',
        licensed: true,
        evidence: { attestedAt: NOW.toISOString(), attestedBy: 'user_1' },
      },
      musicCoveragePlan: { mode: 'full' },
    });
    expect(deps.resolveR2ReadUrl).toHaveBeenCalledWith('users/user_1/audio_1.wav');
    expect(deps.condition).toHaveBeenCalledWith(expect.objectContaining({
      role: 'music',
      buffer: Buffer.from('source-audio'),
      targetFrames: 300,
      fps: 30,
      platform: 'youtube',
    }));
    expect(deps.analyze).toHaveBeenCalledWith({
      buffer: CONDITIONED.buffer,
      fps: 30,
      totalFrames: 300,
    });
    expect(deps.upload).toHaveBeenCalledWith(
      CONDITIONED.buffer,
      'user_1',
      `${result.derivativeAssetId}.flac`,
      'audio/flac',
      { customAssetId: result.derivativeAssetId },
    );
    expect(bgm).toMatchObject({
      from: 0,
      durationInFrames: 300,
      startFromSound: 0,
      assetId: result.derivativeAssetId,
      musicRights: { licensed: true },
      styles: { duckingConfig: { enabled: true } },
      metadata: {
        sourceAssetId: 'audio_1',
        beatGrid: BEAT_EVIDENCE.beatGrid,
        musicCoverage: { mode: 'full' },
      },
    });
    expect(bgm.metadata.audioConditioning).not.toHaveProperty('buffer');
    expect(result.overlays).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'old_bgm' }),
    ]));
    expect(result.overlays.find((overlay: any) => overlay.id === 1)).toMatchObject({
      durationInFrames: 150,
    });
    expect(result.overlays.find((overlay: any) => overlay.id === 2)).toMatchObject({
      from: 150,
      durationInFrames: 150,
    });

    expect(deps.upsertDerivativeAsset).toHaveBeenCalledWith(expect.objectContaining({
      assetId: result.derivativeAssetId,
      parentAssetId: 'audio_1',
      assignmentStatus: 'pending',
      beatGrid: BEAT_EVIDENCE.beatGrid,
      audioConditioningEvidence: expect.not.objectContaining({ buffer: expect.anything() }),
    }));
    expect(deps.replaceOverlayFamilyAtomic).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({
        expectedUpdatedAt: new Date('2026-07-25T09:00:00.000Z'),
        overlays: result.overlays,
        projectUpdates: expect.objectContaining({
          'intelligence.audio.lastMusicAssignment': expect.objectContaining({
            idempotencyKey: 'assign_001',
            derivativeAssetId: result.derivativeAssetId,
          }),
        }),
      }),
    );
    expect(deps.setDerivativeAssignmentStatus).toHaveBeenCalledWith(
      result.derivativeAssetId,
      'attached',
    );
  });

  it.each([
    {
      name: 'an unattested user upload',
      input: { ...INPUT, rightsAttestation: undefined },
      asset: { assetId: 'audio_1', userId: 'user_1', type: 'audio', source: 'user-upload', r2Key: 'key' },
      code: 'RIGHTS_ATTESTATION_REQUIRED',
    },
    {
      name: 'a preview-only library asset',
      input: INPUT,
      asset: {
        assetId: 'audio_1',
        type: 'audio',
        source: 'library',
        r2Key: 'key',
        musicRights: { source: 'preview-only', userChoice: 'swap', licensed: false },
      },
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'generated music without provider evidence',
      input: INPUT,
      asset: { assetId: 'audio_1', userId: 'user_1', type: 'audio', source: 'generated', r2Key: 'key' },
      code: 'RIGHTS_EVIDENCE_REQUIRED',
    },
    {
      name: 'another user owner',
      input: INPUT,
      asset: { assetId: 'audio_1', userId: 'user_2', type: 'audio', source: 'user-upload', r2Key: 'key' },
      code: 'ASSET_ACCESS_DENIED',
    },
  ])('rejects $name before download or conditioning', async ({ input, asset, code }) => {
    const deps = dependencies({ findAsset: vi.fn(async () => asset as any) });

    await expect(assignBackgroundMusic(input as BackgroundMusicAssignmentInput, deps))
      .rejects.toMatchObject({ code });
    expect(deps.fetchAsset).not.toHaveBeenCalled();
    expect(deps.condition).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.replaceOverlayFamilyAtomic).not.toHaveBeenCalled();
  });

  it('rejects external-only assets and oversized stored objects without processing them', async () => {
    const noStorage = dependencies({
      findAsset: vi.fn(async () => ({
        assetId: 'audio_1',
        userId: 'user_1',
        type: 'audio',
        source: 'user-upload',
      })),
    });
    await expect(assignBackgroundMusic(INPUT, noStorage))
      .rejects.toMatchObject({ code: 'ASSET_STORAGE_UNAVAILABLE' });

    const arrayBuffer = vi.fn();
    const oversized = dependencies({
      fetchAsset: vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-length': String(MAX_AUDIO_CONDITIONING_INPUT_BYTES + 1),
        }),
        arrayBuffer,
      } as unknown as Response)) as typeof fetch,
    });
    await expect(assignBackgroundMusic(INPUT, oversized))
      .rejects.toMatchObject({ code: 'ASSET_DOWNLOAD_FAILED', httpStatus: 413 });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(oversized.condition).not.toHaveBeenCalled();
  });

  it('honors music-off before asset lookup or processing', async () => {
    const deps = dependencies({
      loadProject: vi.fn(async () => projectFixture({ musicPreference: 'none' })),
    });

    await expect(assignBackgroundMusic(INPUT, deps))
      .rejects.toMatchObject({ code: 'MUSIC_DISABLED_BY_POLICY' });
    expect(deps.findAsset).not.toHaveBeenCalled();
    expect(deps.condition).not.toHaveBeenCalled();
  });

  it('replays the complete committed timeline without repeating expensive work', async () => {
    const firstDeps = dependencies();
    const first = await assignBackgroundMusic(INPUT, firstDeps);
    const casInput = vi.mocked(firstDeps.replaceOverlayFamilyAtomic).mock.calls[0][2];
    const receipt = casInput.projectUpdates?.['intelligence.audio.lastMusicAssignment'];
    const replayDeps = dependencies({
      loadProject: vi.fn(async () => projectFixture({
        overlays: first.overlays,
        intelligence: { audio: { lastMusicAssignment: receipt } },
      })),
    });

    const replay = await assignBackgroundMusic(INPUT, replayDeps);

    expect(replay).toMatchObject({
      replayed: true,
      derivativeAssetId: first.derivativeAssetId,
      overlays: first.overlays,
    });
    expect(replayDeps.findAsset).not.toHaveBeenCalled();
    expect(replayDeps.fetchAsset).not.toHaveBeenCalled();
    expect(replayDeps.condition).not.toHaveBeenCalled();
    expect(replayDeps.upload).not.toHaveBeenCalled();
    expect(replayDeps.replaceOverlayFamilyAtomic).not.toHaveBeenCalled();
  });

  it('loses a concurrent project race loudly and marks the derivative orphaned', async () => {
    const deps = dependencies({
      replaceOverlayFamilyAtomic: vi.fn(async () => false),
    });

    await expect(assignBackgroundMusic(INPUT, deps))
      .rejects.toMatchObject({ code: 'PROJECT_CONFLICT', httpStatus: 409 });
    const derivativeDocument = vi.mocked(deps.upsertDerivativeAsset).mock.calls[0][0];
    expect(derivativeDocument.assetId).toEqual(expect.any(String));
    expect(deps.setDerivativeAssignmentStatus).toHaveBeenCalledWith(
      derivativeDocument.assetId,
      'orphaned',
    );
  });

  it('marks the derivative orphaned when project persistence throws', async () => {
    const deps = dependencies({
      replaceOverlayFamilyAtomic: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    });

    await expect(assignBackgroundMusic(INPUT, deps))
      .rejects.toMatchObject({ code: 'PROJECT_PERSISTENCE_FAILED', httpStatus: 500 });
    const derivativeDocument = vi.mocked(deps.upsertDerivativeAsset).mock.calls[0][0];
    expect(deps.setDerivativeAssignmentStatus).toHaveBeenCalledWith(
      derivativeDocument.assetId,
      'orphaned',
    );
  });
});
