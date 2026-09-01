import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: clerkMocks.auth,
}));

import {
  POST as assignUploadedAudioRoute,
} from '@/app/api/services/editron/projects/[projectId]/audio-assets/assign/route';
import {
  assignUploadedAudio,
  assignUploadedAudioToTimeline,
  UploadedAudioAssignmentError,
  type UploadedAudioAssignmentDependencies,
  type UploadedAudioTimelineAssignmentDependencies,
} from '@/lib/editron/services/uploaded-audio-assignment';
import {
  assignUploadedAudioAsset,
  createUploadedAudioIdempotencyKey,
  UploadedAudioAssignmentClientError,
} from '@/components/editron/editor/version-7.0.0/components/overlays/sounds/uploaded-audio-assignment-dialog';
import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  MUSIC_RIGHTS_ATTESTATION_VERSION,
  resolveRenderableAudio,
  UnlicensedAudioInRenderError,
} from '@/lib/editron/shared/render-request-payload';
import {
  verifyRenderAudioRightsAuthority,
} from '@/lib/editron/services/render-audio-rights-authority';

const NOW = new Date('2026-07-27T10:00:00.000Z');
const VALID_SFX_BUFFER = Buffer.from('RIFF....WAVEfmt ....data', 'binary');
const VALID_SFX_MEASUREMENT = {
  version: 'sfx-acoustic-measurement-v1',
  algorithm: 'ffmpeg-ebur128-v1',
  loudnessMetric: 'integrated-lufs' as const,
  loudnessDb: -18,
  integratedLufs: -18,
  truePeakDbtp: -3,
  sampleRateHz: 48_000,
  channelCount: 1,
  durationMs: 900,
  measuredAt: NOW.toISOString(),
  sourceHashSha256: 'a'.repeat(64),
};
const SOURCE_ASSET = {
  assetId: 'audio_source_1',
  userId: 'user_1',
  projectId: 'project_source',
  type: 'audio',
  source: 'user-upload',
  filename: 'impact.wav',
  contentType: 'audio/wav',
  r2Key: 'uploads/audio_source_1',
  gcsPath: null,
  cachedUrl: 'https://media.example.com/source.wav',
  urlExpiresAt: new Date('2026-07-27T11:00:00.000Z'),
  size: 48_000,
  duration: 1.25,
  uploadedAt: new Date('2026-07-27T09:00:00.000Z'),
};

function createDependencies(
  sourceAssets: Array<Record<string, unknown>> = [SOURCE_ASSET],
): UploadedAudioAssignmentDependencies & {
  documents: Map<string, Record<string, unknown>>;
  insertCount: () => number;
} {
  const documents = new Map(
    sourceAssets.map((asset) => [String(asset.assetId), { ...asset }]),
  );
  let inserts = 0;
  return {
    documents,
    insertCount: () => inserts,
    loadProject: vi.fn().mockResolvedValue({
      projectId: 'project_1',
      userId: 'user_1',
    }),
    findAsset: vi.fn(async (assetId: string) => documents.get(assetId) ?? null),
    insertDerivativeAsset: vi.fn(async (document: Record<string, unknown>) => {
      const assetId = document.assetId as string;
      if (documents.has(assetId)) return false;
      inserts += 1;
      documents.set(assetId, { ...document });
      return true;
    }),
    resolveReadUrl: vi.fn().mockResolvedValue({
      url: 'https://media.example.com/assigned.wav',
      expiresAt: new Date('2026-07-27T11:00:00.000Z'),
    }),
    fetchSfxSourceBytes: vi.fn().mockResolvedValue(VALID_SFX_BUFFER),
    inspectSfxAudio: vi.fn().mockResolvedValue(VALID_SFX_MEASUREMENT),
    now: () => NOW,
  };
}

function assignmentInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user_1',
    projectId: 'project_1',
    sourceAssetId: 'audio_source_1',
    mediaRole: 'sfx' as const,
    idempotencyKey: 'audio_use_001',
    rightsAttestation: {
      accepted: true as const,
      version: AUDIO_RIGHTS_ATTESTATION_VERSION,
    },
    ...overrides,
  };
}

function timelineAssignmentInput(overrides: Record<string, unknown> = {}) {
  return {
    ...assignmentInput(),
    displayName: 'Impact hit',
    placement: {
      from: 45,
      durationInFrames: 38,
      requestedRow: 6,
      startFromSound: 3,
    },
    ...overrides,
  };
}

function createTimelineDependencies():
  UploadedAudioTimelineAssignmentDependencies & {
    project: Record<string, unknown>;
    appendCount: () => number;
    documents: Map<string, Record<string, unknown>>;
    insertCount: () => number;
  } {
  const base = createDependencies([{ ...SOURCE_ASSET, duration: 2 }]);
  const project: Record<string, unknown> = {
    projectId: 'project_1',
    userId: 'user_1',
    fps: 30,
    durationInFrames: 300,
    projectRevision: 7,
    updatedAt: NOW,
    overlays: [],
  };
  let appends = 0;
  return {
    ...base,
    project,
    appendCount: () => appends,
    loadProject: vi.fn(async () => project),
    loadProjectForTimelineMutation: vi.fn(async () => ({
      project,
      revision: {
        schemaVersion: 1 as const,
        value: 7,
        compatibilityUpdatedAt: NOW.toISOString(),
      },
    })),
    commitTimelineOverlayThroughProjectService: vi.fn(async (
      _userId,
      _projectId,
      _expectedRevision,
      overlay,
    ) => {
      const overlays = project.overlays as Array<Record<string, unknown>>;
      if (overlays.some((candidate) => candidate.id === overlay.id)) {
        return {
          disposition: 'ALREADY_ATTACHED' as const,
          currentRevision: {
            schemaVersion: 1 as const,
            value: 8,
            compatibilityUpdatedAt: NOW.toISOString(),
          },
          mutationReceipt: null,
          timelineChangeReceipt: null,
        };
      }
      appends += 1;
      overlays.push(overlay);
      return {
        disposition: 'APPLIED' as const,
        mutationReceipt: {
          schemaVersion: 1 as const,
          projectId: 'project_1',
          revision: {
            schemaVersion: 1 as const,
            value: 8,
            compatibilityUpdatedAt: NOW.toISOString(),
          },
          committedAt: NOW.toISOString(),
        },
        timelineChangeReceipt: {} as never,
      };
    }),
  };
}

describe('uploaded audio assignment', () => {
  it('persists an attached role-specific derivative that the render authority verifies', async () => {
    const dependencies = createDependencies();

    const result = await assignUploadedAudio(assignmentInput(), dependencies);
    const derivative = dependencies.documents.get(result.derivativeAssetId);

    expect(result).toMatchObject({
      replayed: false,
      sourceAssetId: 'audio_source_1',
      mediaRole: 'sfx',
      audioUrl: 'https://media.example.com/assigned.wav',
      duration: 1.25,
    });
    expect(derivative).toMatchObject({
      assetId: result.derivativeAssetId,
      userId: 'user_1',
      projectId: 'project_1',
      type: 'audio',
      source: 'user-upload',
      parentAssetId: 'audio_source_1',
      assignmentStatus: 'attached',
      audioRights: result.audioRights,
      audioAssignmentReceipt: {
        version: 'editron-uploaded-audio-assignment-v1',
        idempotencyKey: 'audio_use_001',
        sourceAssetId: 'audio_source_1',
        derivativeAssetId: result.derivativeAssetId,
        mediaRole: 'sfx',
        userId: 'user_1',
        projectId: 'project_1',
        attestedAt: NOW.toISOString(),
      },
    });

    const overlay = {
      id: 'sfx_overlay_1',
      type: 'sound',
      row: 0,
      assetId: result.derivativeAssetId,
      src: result.audioUrl,
      audioRights: result.audioRights,
    };
    expect(resolveRenderableAudio(overlay).overlay).toBe(overlay);
    await expect(verifyRenderAudioRightsAuthority({
      userId: 'user_1',
      projectId: 'project_1',
      overlays: [overlay],
    }, {
      loadAssets: async () => [
        derivative as Record<string, unknown>,
        SOURCE_ASSET,
      ],
    })).resolves.toBeUndefined();
  });

  it('requires the current generic-audio attestation', async () => {
    const dependencies = createDependencies();

    await expect(assignUploadedAudio(assignmentInput({
      rightsAttestation: undefined,
    }), dependencies)).rejects.toMatchObject({
      code: 'RIGHTS_ATTESTATION_REQUIRED',
      httpStatus: 422,
    });
    await expect(assignUploadedAudio(assignmentInput({
      rightsAttestation: {
        accepted: true,
        version: MUSIC_RIGHTS_ATTESTATION_VERSION,
      },
    }), dependencies)).rejects.toMatchObject({
      code: 'RIGHTS_ATTESTATION_REQUIRED',
      httpStatus: 422,
    });
    expect(dependencies.insertCount()).toBe(0);
  });

  it.each([
    [{ type: 'video' }, 'ASSET_NOT_AUDIO'],
    [{ source: 'generated' }, 'ASSET_NOT_USER_UPLOAD'],
    [{ userId: 'user_2' }, 'ASSET_ACCESS_DENIED'],
    [{ r2Key: null, gcsPath: null, cachedUrl: '' }, 'ASSET_STORAGE_UNAVAILABLE'],
  ])('rejects an invalid source asset before persistence', async (patch, code) => {
    const dependencies = createDependencies([{ ...SOURCE_ASSET, ...patch }]);

    await expect(assignUploadedAudio(
      assignmentInput(),
      dependencies,
    )).rejects.toMatchObject({ code });
    expect(dependencies.insertCount()).toBe(0);
  });

  it('replays an identical request and rejects reuse for a different role', async () => {
    const dependencies = createDependencies();

    const first = await assignUploadedAudio(assignmentInput(), dependencies);
    const replay = await assignUploadedAudio(assignmentInput(), dependencies);

    expect(replay).toMatchObject({
      replayed: true,
      derivativeAssetId: first.derivativeAssetId,
      mediaRole: 'sfx',
    });
    expect(dependencies.insertCount()).toBe(1);

    await expect(assignUploadedAudio(assignmentInput({
      mediaRole: 'voiceover',
    }), dependencies)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      httpStatus: 409,
    });
  });

  it('does not allow a non-music attestation to authorize a BGM overlay', () => {
    const rights = {
      mediaRole: 'sfx' as const,
      source: 'user-upload' as const,
      userChoice: 'attested' as const,
      licensed: true,
      evidence: {
        kind: 'user-attestation' as const,
        sourceAssetId: 'audio_source_1',
        attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
        attestedAt: NOW.toISOString(),
        attestedBy: 'user_1',
      },
    };

    expect(() => resolveRenderableAudio({
      id: 'forged_bgm',
      type: 'sound',
      row: 1,
      assetId: 'audio_use_forged',
      audioRights: rights,
    })).toThrow(UnlicensedAudioInRenderError);
  });

  it('atomically attaches the derivative and server-owned rights to the semantic lane', async () => {
    const dependencies = createTimelineDependencies();

    const result = await assignUploadedAudioToTimeline(
      timelineAssignmentInput(),
      dependencies,
    );

    expect(result.overlays).toHaveLength(1);
    expect(result.overlays[0]).toMatchObject({
      id: result.overlayId,
      type: 'sound',
      from: 45,
      durationInFrames: 38,
      row: 0,
      assetId: result.derivativeAssetId,
      content: 'Impact hit',
      startFromSound: 3,
      audioRights: result.audioRights,
      metadata: {
        source: 'uploaded-audio-assignment',
        audioRole: 'sfx',
        sourceAssetId: 'audio_source_1',
      },
    });
    expect(result.overlays[0]).not.toMatchObject({
      assetId: 'audio_source_1',
    });
    expect(result.projectMutationReceipt).toMatchObject({
      projectId: 'project_1',
      revision: { value: 8 },
    });
    expect(dependencies.appendCount()).toBe(1);

    const replay = await assignUploadedAudioToTimeline(
      timelineAssignmentInput(),
      dependencies,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.overlayId).toBe(result.overlayId);
    expect(dependencies.appendCount()).toBe(1);
  });

  it('returns a revision conflict rather than reporting success when the prepared timeline is stale', async () => {
    const dependencies = createTimelineDependencies();
    dependencies.commitTimelineOverlayThroughProjectService = vi.fn()
      .mockRejectedValue({ code: 'PROJECT_REVISION_CONFLICT' });

    await expect(assignUploadedAudioToTimeline(
      timelineAssignmentInput(),
      dependencies,
    )).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      httpStatus: 409,
    });
  });

  it('rejects idempotent replay when timeline placement changes', async () => {
    const dependencies = createTimelineDependencies();
    await assignUploadedAudioToTimeline(timelineAssignmentInput(), dependencies);

    await expect(assignUploadedAudioToTimeline(timelineAssignmentInput({
      placement: {
        from: 90,
        durationInFrames: 38,
        requestedRow: 0,
        startFromSound: 3,
      },
    }), dependencies)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      httpStatus: 409,
    });
  });
});

describe('uploaded SFX acoustic admission', () => {
  it('records the server-verified measurement on the derivative and overlay', async () => {
    const dependencies = createTimelineDependencies();
    const result = await assignUploadedAudioToTimeline(timelineAssignmentInput(), dependencies);
    const derivative = dependencies.documents.get(result.derivativeAssetId);

    expect(dependencies.inspectSfxAudio).toHaveBeenCalledTimes(1);
    expect(dependencies.fetchSfxSourceBytes).toHaveBeenCalledTimes(1);
    expect(derivative).toMatchObject({ sfxAcousticMeasurement: VALID_SFX_MEASUREMENT });
    const overlay = result.overlays.find((candidate: any) => candidate.id === result.overlayId);
    expect(overlay?.metadata).toMatchObject({ sfxAcousticMeasurement: VALID_SFX_MEASUREMENT });
    expect(result.sfxAcousticMeasurement).toEqual(VALID_SFX_MEASUREMENT);
  });

  it('rejects a silent upload before persisting the derivative', async () => {
    const dependencies = createDependencies();
    dependencies.inspectSfxAudio = vi.fn().mockRejectedValue(new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      'Uploaded SFX is silent or below the loudness floor',
      422,
    ));

    await expect(assignUploadedAudio(assignmentInput(), dependencies)).rejects.toMatchObject({
      code: 'SFX_AUDIO_REJECTED',
      httpStatus: 422,
    });
    expect(dependencies.insertCount()).toBe(0);
  });

  it('rejects a clipping upload before persisting the derivative', async () => {
    const dependencies = createDependencies();
    dependencies.inspectSfxAudio = vi.fn().mockRejectedValue(new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      'Uploaded SFX exceeds the -1 dBTP ceiling (0.4 dBTP)',
      422,
    ));

    await expect(assignUploadedAudio(assignmentInput(), dependencies)).rejects.toMatchObject({
      code: 'SFX_AUDIO_REJECTED',
      httpStatus: 422,
    });
    expect(dependencies.insertCount()).toBe(0);
  });

  it('rejects a corrupt file that cannot be decoded', async () => {
    const dependencies = createDependencies();
    dependencies.inspectSfxAudio = vi.fn().mockRejectedValue(new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      'Uploaded SFX could not be decoded: corrupt',
      422,
    ));

    await expect(assignUploadedAudio(assignmentInput(), dependencies)).rejects.toMatchObject({
      code: 'SFX_AUDIO_REJECTED',
      httpStatus: 422,
    });
    expect(dependencies.insertCount()).toBe(0);
  });

  it('rejects an SFX whose storage bytes cannot be fetched', async () => {
    const dependencies = createDependencies();
    dependencies.fetchSfxSourceBytes = vi.fn().mockRejectedValue(new Error('storage 410'));

    await expect(assignUploadedAudio(assignmentInput(), dependencies)).rejects.toMatchObject({
      code: 'SFX_AUDIO_REJECTED',
      httpStatus: 422,
    });
    expect(dependencies.insertCount()).toBe(0);
  });

  it('does not run SFX inspection for non-SFX roles', async () => {
    const dependencies = createTimelineDependencies();
    await assignUploadedAudioToTimeline(timelineAssignmentInput({ mediaRole: 'voiceover' as const }), dependencies);

    expect(dependencies.inspectSfxAudio).not.toHaveBeenCalled();
    expect(dependencies.fetchSfxSourceBytes).not.toHaveBeenCalled();
  });
});

describe('uploaded audio editor client', () => {
  it('sends only source identity, role, placement, and the current attestation', async () => {
    const audioRights = {
      mediaRole: 'voiceover',
      source: 'user-upload',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'user-attestation',
        sourceAssetId: 'audio_source_1',
        attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
        attestedAt: NOW.toISOString(),
        attestedBy: 'user_1',
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      replayed: false,
      sourceAssetId: 'audio_source_1',
      derivativeAssetId: 'audio_use_1',
      overlayId: 123,
      mediaRole: 'voiceover',
      audioRights,
      overlays: [{
        id: 123,
        type: 'sound',
        row: 3,
        assetId: 'audio_use_1',
        audioRights,
      }],
    }), { status: 200 }));

    const result = await assignUploadedAudioAsset({
      projectId: 'project_1',
      sourceAssetId: 'audio_source_1',
      displayName: 'Narration',
      mediaRole: 'voiceover',
      idempotencyKey: 'audio_use_001',
      placement: {
        from: 0,
        durationInFrames: 120,
        requestedRow: 6,
        startFromSound: 0,
      },
      fetchImpl,
    });

    expect(result.overlays).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, request] = fetchImpl.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      sourceAssetId: 'audio_source_1',
      displayName: 'Narration',
      mediaRole: 'voiceover',
      idempotencyKey: 'audio_use_001',
      placement: {
        from: 0,
        durationInFrames: 120,
        requestedRow: 6,
        startFromSound: 0,
      },
      rightsAttestation: {
        accepted: true,
        version: AUDIO_RIGHTS_ATTESTATION_VERSION,
      },
    });
  });

  it('rejects a success response whose overlay does not carry the assigned derivative', async () => {
    const audioRights = {
      mediaRole: 'sfx',
      source: 'user-upload',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'user-attestation',
        sourceAssetId: 'audio_source_1',
        attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
        attestedAt: NOW.toISOString(),
        attestedBy: 'user_1',
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      sourceAssetId: 'audio_source_1',
      derivativeAssetId: 'audio_use_1',
      overlayId: 123,
      mediaRole: 'sfx',
      audioRights,
      overlays: [{
        id: 123,
        type: 'sound',
        row: 0,
        assetId: 'audio_source_1',
        audioRights,
      }],
    }), { status: 200 }));

    await expect(assignUploadedAudioAsset({
      projectId: 'project_1',
      sourceAssetId: 'audio_source_1',
      displayName: 'Impact',
      mediaRole: 'sfx',
      idempotencyKey: 'audio_use_001',
      placement: {
        from: 0,
        durationInFrames: 30,
        requestedRow: 0,
        startFromSound: 0,
      },
      fetchImpl,
    })).rejects.toBeInstanceOf(UploadedAudioAssignmentClientError);
  });

  it('creates deterministic-format request identities and wires every editor entry point through the shared owner', () => {
    expect(createUploadedAudioIdempotencyKey(() => '12345678-abcd'))
      .toBe('audio_12345678-abcd');
    const entryPoints = [
      {
        path: '../../components/editron/editor/version-7.0.0/components/timeline/timeline-grid.tsx',
        unsafeConstructor:
          /if \(asset\.type === 'audio'\)\s*\{\s*newOverlay\s*=/,
      },
      {
        path: '../../components/editron/editor/version-7.0.0/v2/timeline/v2-timeline-grid.tsx',
        unsafeConstructor:
          /if \(asset\.type === 'audio'\)\s*\{\s*newOverlay\s*=/,
      },
      {
        path: '../../components/editron/editor/version-7.0.0/components/overlays/local-media/local-media-panel.tsx',
        unsafeConstructor:
          /else if \(file\.type === "audio"\)\s*\{\s*newOverlay\s*=/,
      },
    ];

    for (const entryPoint of entryPoints) {
      const source = readFileSync(
        new URL(entryPoint.path, import.meta.url),
        'utf8',
      );
      expect(source).toContain('useUploadedAudioAssignment()');
      expect(source).toContain('<UploadedAudioAssignmentDialog');
      expect(source).toContain('requestUploadedAudioAssignment(');
      expect(source).not.toMatch(entryPoint.unsafeConstructor);
    }
  });
});

describe('uploaded audio assignment route', () => {
  beforeEach(() => {
    clerkMocks.auth.mockReset();
  });

  it('requires authentication before reading the request body', async () => {
    const assign = vi.fn();
    const response = await assignUploadedAudioRoute(new Request(
      'https://app.example.com/audio-assets/assign',
      { method: 'POST', body: '{' },
    ) as never, {
      params: Promise.resolve({ projectId: 'project_1' }),
    }, {
      authenticate: vi.fn().mockResolvedValue({ userId: null }),
      assign,
    });

    expect(response.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });

  it('rejects a body over 16 KiB before invoking the domain service', async () => {
    const assign = vi.fn();
    const response = await assignUploadedAudioRoute(new Request(
      'https://app.example.com/audio-assets/assign',
      { method: 'POST', body: 'x'.repeat(17 * 1_024) },
    ) as never, {
      params: Promise.resolve({ projectId: 'project_1' }),
    }, {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_1' }),
      assign,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('binds identity server-side and ignores forged storage and rights fields', async () => {
    const assign = vi.fn().mockResolvedValue({
      replayed: false,
      derivativeAssetId: 'audio_use_1',
    });
    const response = await assignUploadedAudioRoute(new Request(
      'https://app.example.com/api/services/editron/projects/project_1/audio-assets/assign',
      {
        method: 'POST',
        body: JSON.stringify({
          userId: 'victim_user',
          projectId: 'victim_project',
          sourceAssetId: 'audio_source_1',
          displayName: 'Impact hit',
          mediaRole: 'sfx',
          idempotencyKey: 'audio_use_001',
          placement: {
            from: 45,
            durationInFrames: 38,
            requestedRow: 0,
            startFromSound: 3,
          },
          audioUrl: 'https://attacker.example/audio.wav',
          audioRights: { licensed: true },
          rightsAttestation: {
            accepted: true,
            version: AUDIO_RIGHTS_ATTESTATION_VERSION,
          },
        }),
      },
    ) as never, {
      params: Promise.resolve({ projectId: 'project_1' }),
    }, {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_1' }),
      assign,
    });

    expect(response.status).toBe(200);
    expect(assign).toHaveBeenCalledWith({
      userId: 'user_1',
      projectId: 'project_1',
      sourceAssetId: 'audio_source_1',
      displayName: 'Impact hit',
      mediaRole: 'sfx',
      idempotencyKey: 'audio_use_001',
      placement: {
        from: 45,
        durationInFrames: 38,
        requestedRow: 0,
        startFromSound: 3,
      },
      rightsAttestation: {
        accepted: true,
        version: AUDIO_RIGHTS_ATTESTATION_VERSION,
      },
    });
  });

  it('preserves typed domain failures', async () => {
    const request = new Request('https://app.example.com/audio-assets/assign', {
      method: 'POST',
      body: JSON.stringify(assignmentInput()),
    });

    const typedResponse = await assignUploadedAudioRoute(request as never, {
      params: Promise.resolve({ projectId: 'project_1' }),
    }, {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_1' }),
      assign: vi.fn().mockRejectedValue(new UploadedAudioAssignmentError(
        'RIGHTS_ATTESTATION_REQUIRED',
        'Audio rights attestation required',
        422,
      )),
    });
    expect(typedResponse.status).toBe(422);
    expect(await typedResponse.json()).toEqual({
      success: false,
      error: 'Audio rights attestation required',
      code: 'RIGHTS_ATTESTATION_REQUIRED',
    });
  });

  it('redacts unexpected infrastructure failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('https://app.example.com/audio-assets/assign', {
      method: 'POST',
      body: JSON.stringify(assignmentInput()),
    });

    const response = await assignUploadedAudioRoute(request as never, {
      params: Promise.resolve({ projectId: 'project_1' }),
    }, {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_1' }),
      assign: vi.fn().mockRejectedValue(new Error('mongodb credentials leaked')),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Uploaded audio assignment failed',
      code: 'INTERNAL_ERROR',
    });
  });
});
