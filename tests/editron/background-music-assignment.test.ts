import { readFileSync } from 'node:fs';

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
    replaceBackgroundMusicAtRevisionV1: vi.fn(),
  },
}));

import {
  assignBackgroundMusic,
  buildBackgroundMusicSourceAssetFilter,
  type BackgroundMusicAssignmentDependencies,
  type BackgroundMusicAssignmentInput,
} from '@/lib/editron/services/background-music-assignment';
import { resolveRenderDeliveryPlan } from '@/lib/editron/services/render-delivery-manifest';
import { resolveRenderableAudioInputProps } from '@/lib/editron/shared/render-request-payload';
import { MAX_AUDIO_CONDITIONING_INPUT_BYTES } from '@/lib/pipeline/audio-conditioning';
import { ROW } from '@/lib/pipeline/scene-to-editron';

const NOW = new Date('2026-07-25T10:00:00.000Z');
const timelineLabelSources = [
  readFileSync(
    new URL(
      '../../components/editron/editor/version-7.0.0/components/timeline/timeline-item-label.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFileSync(
    new URL(
      '../../components/editron/editor/version-7.0.0/v2/timeline/v2-timeline-item.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
];
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

function libraryReceipt(
  ownership: { userId: string; projectId: string } = {
    userId: 'user_1',
    projectId: 'project_1',
  },
) {
  return {
    version: 'editron-library-license-receipt-v1',
    provider: 'epidemic-sound',
    providerTrackId: 'epidemic_track_1',
    licenseId: 'epidemic_license_1',
    agreement: {
      reference: 'agreement_1',
      configuredBy: 'deployment-operator',
      authority: 'NEVER_AUTOMATED',
    },
    ownership: {
      ...ownership,
      orgId: null,
    },
    sourceObject: {
      sha256: 'a'.repeat(64),
      size: 1_024,
    },
  };
}

function libraryAsset(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'audio_1',
    userId: 'user_1',
    projectId: 'project_1',
    type: 'audio',
    source: 'library',
    r2Key: 'users/user_1/library/audio_1.mp3',
    musicRights: {
      mediaRole: 'music',
      source: 'library',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: 'audio_1',
        licenseId: 'epidemic_license_1',
      },
    },
    libraryLicenseReceipt: libraryReceipt(),
    ...overrides,
  };
}

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
      filename: 'Launch Anthem.mp3',
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
    replaceBackgroundMusicAtRevisionV1: vi.fn(async () => ({
      disposition: 'APPLIED',
      mutationReceipt: {},
      timelineChangeReceipt: {},
    } as any)),
    now: vi.fn(() => NOW),
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN;
  vi.restoreAllMocks();
});

describe('background music assignment', () => {
  it('conditions, analyzes, rights-stamps, mixes, defers beat-sync, and atomically replaces BGM', async () => {
    const deps = dependencies();
    const result = await assignBackgroundMusic(INPUT, deps);
    const bgm = result.overlays.find((overlay: any) => overlay.row === ROW.BGM) as any;

    expect(result).toMatchObject({
      replayed: false,
      usageMode: 'embedded',
      sourceAssetId: 'audio_1',
      snappedCutCount: 0,
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
      durationInFrames: 140,
    });
    expect(result.overlays.find((overlay: any) => overlay.id === 2)).toMatchObject({
      from: 140,
      durationInFrames: 160,
    });
    expect(deps.findAsset).toHaveBeenCalledWith('audio_1', 'user_1', 'project_1');

    expect(deps.upsertDerivativeAsset).toHaveBeenCalledWith(expect.objectContaining({
      assetId: result.derivativeAssetId,
      parentAssetId: 'audio_1',
      assignmentStatus: 'pending',
      beatGrid: BEAT_EVIDENCE.beatGrid,
      audioConditioningEvidence: expect.not.objectContaining({ buffer: expect.anything() }),
    }));
    expect(deps.replaceBackgroundMusicAtRevisionV1).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({
        expectedRevision: {
          schemaVersion: 1,
          value: 0,
          compatibilityUpdatedAt: '2026-07-25T09:00:00.000Z',
        },
        actorKind: 'USER',
        candidateOverlays: result.overlays,
        musicCoveragePlan: result.musicCoveragePlan,
        evidence: expect.objectContaining({
          kind: 'ASSIGNMENT',
          usageMode: 'embedded',
          receipt: expect.objectContaining({
            idempotencyKey: 'assign_001',
            derivativeAssetId: result.derivativeAssetId,
            beatRealignEnabled: false,
            beatRealignDeferred: true,
            snappedCutCount: 0,
          }),
        }),
      }),
    );
    expect(deps.setDerivativeAssignmentStatus).toHaveBeenCalledWith(
      result.derivativeAssetId,
      'attached',
    );
  });

  it('uses an uploaded song as a beat-analyzed reference while stripping it from render input', async () => {
    const deps = dependencies();
    const result = await assignBackgroundMusic({
      ...INPUT,
      usageMode: 'reference-only',
      rightsAttestation: undefined,
    }, deps);
    const referenceOverlays = result.overlays.filter((overlay: any) => overlay.row === ROW.BGM);
    const renderable = resolveRenderableAudioInputProps({ overlays: result.overlays });
    const deliveryPlan = resolveRenderDeliveryPlan({
      requestedMode: 'platform-native',
      overlays: result.overlays,
      fps: 30,
      durationInFrames: 300,
      destinationPlatform: 'instagram',
    });

    expect(result).toMatchObject({
      replayed: false,
      usageMode: 'reference-only',
      musicRights: {
        mediaRole: 'music',
        source: 'preview-only',
        userChoice: 'no-music',
        licensed: false,
      },
      beatGrid: BEAT_EVIDENCE.beatGrid,
      snappedCutCount: 0,
    });
    expect(referenceOverlays).not.toHaveLength(0);
    expect(referenceOverlays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        audioRights: result.musicRights,
        musicRights: result.musicRights,
        metadata: expect.objectContaining({
          assignment: expect.objectContaining({ usageMode: 'reference-only' }),
          beatGrid: BEAT_EVIDENCE.beatGrid,
          referenceTrack: {
            title: 'Launch Anthem',
            artists: [],
            provider: 'user-upload',
            sourceAssetId: 'audio_1',
            bpm: 120,
          },
        }),
      }),
    ]));
    expect(deliveryPlan.music.handoff).toMatchObject({
      destinationPlatform: 'instagram',
      track: {
        status: 'reference-ready',
        title: 'Launch Anthem',
        artists: [],
        provider: 'user-upload',
        sourceAssetId: 'audio_1',
        bpm: 120,
      },
      timing: {
        timelineStartFrame: 0,
        timelineEndFrame: 300,
        timelineBeatEntryFrame: 0,
        timelineBeatEntryMs: 0,
        cueStatus: 'manual-cue-required',
      },
    });
    for (const source of timelineLabelSources) {
      expect(source).toContain('REFERENCE');
      expect(source).toContain('hasReferenceOnlyBackgroundMusic');
      expect(source).toContain('referenceTrack');
    }
    expect(renderable.overlays).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ row: ROW.BGM }),
    ]));
    expect(renderable.audioRightsNotices).toHaveLength(referenceOverlays.length);
    expect(deps.condition).toHaveBeenCalledTimes(1);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
    expect(deps.upsertDerivativeAsset).toHaveBeenCalledWith(expect.objectContaining({
      source: 'preview-only',
      musicRights: result.musicRights,
    }));
  });

  it('preserves discovered-song identity through reference assignment and the delivery receipt', async () => {
    const deps = dependencies();
    const result = await assignBackgroundMusic({
      ...INPUT,
      usageMode: 'reference-only',
      rightsAttestation: undefined,
      sourceMetadata: {
        identityId: 'mbid-recording-123',
        title: 'Nights Like This',
        artists: ['Kehlani', 'Ty Dolla $ign'],
        provider: 'musicbrainz',
        providerTrackId: 'mbid-recording-123',
        isrcs: ['USUM71704250'],
      },
    }, deps);
    const referenceOverlays = result.overlays.filter((overlay: any) => overlay.row === ROW.BGM);
    const deliveryPlan = resolveRenderDeliveryPlan({
      requestedMode: 'platform-native',
      overlays: result.overlays,
      fps: 30,
      durationInFrames: 300,
      destinationPlatform: 'instagram',
    });

    expect(referenceOverlays).not.toHaveLength(0);
    expect(referenceOverlays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          referenceTrack: expect.objectContaining({
            title: 'Nights Like This',
            artists: ['Kehlani', 'Ty Dolla $ign'],
            provider: 'musicbrainz',
            providerTrackId: 'mbid-recording-123',
            isrcs: ['USUM71704250'],
            identityId: 'mbid-recording-123',
            bpm: 120,
          }),
        }),
      }),
    ]));
    expect(deliveryPlan.music.handoff).not.toBeNull();
    expect(deliveryPlan.music.handoff!.track).toMatchObject({
      status: 'reference-ready',
      title: 'Nights Like This',
      artists: ['Kehlani', 'Ty Dolla $ign'],
      provider: 'musicbrainz',
      providerTrackId: 'mbid-recording-123',
      bpm: 120,
    });
  });

  it('scopes Mongo lookup and accepts only a matching durable library receipt', async () => {
    expect(buildBackgroundMusicSourceAssetFilter({
      assetId: 'audio_1',
      userId: 'user_1',
      projectId: 'project_1',
    })).toEqual({
      assetId: 'audio_1',
      userId: 'user_1',
      $or: [
        { source: { $ne: 'library' } },
        { source: 'library', projectId: 'project_1' },
      ],
    });
    const deps = dependencies({
      findAsset: vi.fn(async () => libraryAsset() as any),
    });

    const result = await assignBackgroundMusic(INPUT, deps);

    expect(result.musicRights).toMatchObject({
      source: 'library',
      licensed: true,
      evidence: {
        sourceAssetId: 'audio_1',
        licenseId: 'epidemic_license_1',
      },
    });
    expect(deps.fetchAsset).toHaveBeenCalledTimes(1);
    expect(deps.condition).toHaveBeenCalledTimes(1);
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
        userId: 'user_1',
        projectId: 'project_1',
        type: 'audio',
        source: 'library',
        r2Key: 'key',
        musicRights: { source: 'preview-only', userChoice: 'swap', licensed: false },
      },
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'a library asset attempting to fall through as a user upload',
      input: INPUT,
      asset: {
        assetId: 'audio_1',
        userId: 'user_1',
        projectId: 'project_1',
        type: 'audio',
        source: 'library',
        r2Key: 'key',
      },
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'library music with a forged licensed flag but no license receipt',
      input: INPUT,
      asset: {
        assetId: 'audio_1',
        userId: 'user_1',
        projectId: 'project_1',
        type: 'audio',
        source: 'library',
        r2Key: 'key',
        musicRights: {
          source: 'library',
          userChoice: 'attested',
          licensed: true,
        },
      },
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'library music ingested for another project',
      input: INPUT,
      asset: libraryAsset({
        projectId: 'project_2',
        libraryLicenseReceipt: libraryReceipt({
          userId: 'user_1',
          projectId: 'project_2',
        }),
      }),
      code: 'ASSET_ACCESS_DENIED',
    },
    {
      name: 'library music with mismatched receipt ownership',
      input: INPUT,
      asset: libraryAsset({
        libraryLicenseReceipt: libraryReceipt({
          userId: 'user_1',
          projectId: 'project_2',
        }),
      }),
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'library music with revoked rights evidence',
      input: INPUT,
      asset: libraryAsset({ rightsRevokedAt: NOW }),
      code: 'UNLICENSED_LIBRARY_ASSET',
    },
    {
      name: 'generated music without provider evidence',
      input: INPUT,
      asset: { assetId: 'audio_1', userId: 'user_1', type: 'audio', source: 'generated', r2Key: 'key' },
      code: 'RIGHTS_EVIDENCE_REQUIRED',
    },
    {
      name: 'generated music with an incomplete provider receipt',
      input: INPUT,
      asset: {
        assetId: 'audio_1',
        userId: 'user_1',
        type: 'audio',
        source: 'generated',
        r2Key: 'key',
        musicRights: {
          source: 'generated',
          userChoice: 'attested',
          licensed: true,
          evidence: {
            kind: 'generated-provider',
            sourceAssetId: 'audio_1',
          },
        },
      },
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
    expect(deps.replaceBackgroundMusicAtRevisionV1).not.toHaveBeenCalled();
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
    const casInput = vi.mocked(firstDeps.replaceBackgroundMusicAtRevisionV1).mock.calls[0][2];
    const receipt = casInput.evidence.receipt;
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
    expect(replayDeps.replaceBackgroundMusicAtRevisionV1).not.toHaveBeenCalled();
  });

  it('rejects an idempotency replay that changes the music usage mode', async () => {
    const firstDeps = dependencies();
    const first = await assignBackgroundMusic(INPUT, firstDeps);
    const casInput = vi.mocked(firstDeps.replaceBackgroundMusicAtRevisionV1).mock.calls[0][2];
    const receipt = casInput.evidence.receipt;
    const replayDeps = dependencies({
      loadProject: vi.fn(async () => projectFixture({
        overlays: first.overlays,
        intelligence: { audio: { lastMusicAssignment: receipt } },
      })),
    });

    await expect(assignBackgroundMusic({
      ...INPUT,
      usageMode: 'reference-only',
      rightsAttestation: undefined,
    }, replayDeps)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(replayDeps.findAsset).not.toHaveBeenCalled();
  });

  it('loses a concurrent project race loudly and marks the derivative orphaned', async () => {
    const deps = dependencies({
      replaceBackgroundMusicAtRevisionV1: vi.fn(async () => {
        throw Object.assign(new Error('project revision changed'), {
          code: 'PROJECT_REVISION_CONFLICT',
        });
      }),
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
      replaceBackgroundMusicAtRevisionV1: vi.fn(async () => {
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
