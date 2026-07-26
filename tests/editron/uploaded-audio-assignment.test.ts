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
  UploadedAudioAssignmentError,
  type UploadedAudioAssignmentDependencies,
} from '@/lib/editron/services/uploaded-audio-assignment';
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
          mediaRole: 'sfx',
          idempotencyKey: 'audio_use_001',
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
      mediaRole: 'sfx',
      idempotencyKey: 'audio_use_001',
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
