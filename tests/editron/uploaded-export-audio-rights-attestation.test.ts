import { describe, expect, it, vi } from 'vitest';

import {
  CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
  reattestUploadedExportAudioRights,
  UploadedExportAudioRightsAttestationError,
  type UploadedExportAudioRightsAttestationDependencies,
} from '@/lib/editron/services/uploaded-export-audio-rights-attestation';

const PROJECT_UPDATED_AT = new Date('2026-08-01T07:28:42.021Z');
const ATTESTED_AT = new Date('2026-08-01T08:00:00.000Z');

function project(overlays: Array<Record<string, unknown>>) {
  return {
    projectId: 'proj_legacy',
    userId: 'user_owner',
    updatedAt: PROJECT_UPDATED_AT,
    overlays,
  };
}

function dependencies(input: {
  storedProject: Record<string, unknown>;
  assets?: Array<Record<string, unknown>>;
  storyboards?: Array<Record<string, unknown>>;
  commitResult?: boolean;
}): UploadedExportAudioRightsAttestationDependencies {
  return {
    loadProject: vi.fn(async () => input.storedProject),
    loadAssets: vi.fn(async () => input.assets ?? []),
    loadStoryboards: vi.fn(async () => input.storyboards ?? []),
    commit: vi.fn(async () => input.commitResult ?? true),
    now: () => ATTESTED_AT,
  };
}

describe('uploaded export-audio rights attestation', () => {
  it('attests legacy voiceovers once and repairs their linked storyboard copies', async () => {
    const deps = dependencies({
      storedProject: project([
        {
          id: 1,
          type: 'sound',
          row: 3,
          assetId: 'voiceover_legacy_1',
          src: '/api/assets/voiceover_legacy_1',
        },
        {
          id: 2,
          type: 'sound',
          row: 3,
          assetId: 'voiceover_legacy_1',
          src: '/api/assets/voiceover_legacy_1',
        },
        {
          id: 3,
          type: 'sound',
          row: 1,
          assetId: 'bgm_reference_1',
          src: '/api/assets/bgm_reference_1',
        },
      ]),
      assets: [{
        assetId: 'voiceover_legacy_1',
        userId: 'user_owner',
        type: 'audio',
        source: 'user-upload',
      }],
      storyboards: [{
        storyboardId: 'storyboard_1',
        projectId: 'proj_legacy',
        userId: 'user_owner',
        scenes: [{
          sceneIndex: 0,
          voiceover: {
            audioAssetId: 'voiceover_legacy_1',
            audioUrl: '/api/assets/voiceover_legacy_1',
          },
        }],
      }],
    });

    const result = await reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, deps);

    expect(result).toMatchObject({
      replayed: false,
      attestedAssetIds: ['voiceover_legacy_1'],
      rightsByAssetId: {
        voiceover_legacy_1: {
          mediaRole: 'voiceover',
          source: 'user-upload',
          userChoice: 'attested',
          licensed: true,
          evidence: {
            sourceAssetId: 'voiceover_legacy_1',
            attestedAt: ATTESTED_AT.toISOString(),
            attestedBy: 'user_owner',
          },
        },
      },
    });
    expect(deps.loadAssets).toHaveBeenCalledWith(['voiceover_legacy_1']);
    expect(deps.commit).toHaveBeenCalledOnce();
    const committed = vi.mocked(deps.commit).mock.calls[0]?.[0];
    expect(committed?.overlays[0]?.audioRights).toEqual(
      result.rightsByAssetId.voiceover_legacy_1,
    );
    expect(committed?.overlays[1]?.audioRights).toEqual(
      result.rightsByAssetId.voiceover_legacy_1,
    );
    expect(committed?.overlays[2]?.audioRights).toBeUndefined();
    expect(committed?.storyboardUpdates).toEqual([
      expect.objectContaining({
        storyboardId: 'storyboard_1',
        scenes: [expect.objectContaining({
          voiceover: expect.objectContaining({
            audioRights: result.rightsByAssetId.voiceover_legacy_1,
          }),
        })],
      }),
    ]);
  });

  it('is an idempotent replay when no exported uploaded sound lacks rights', async () => {
    const rights = {
      mediaRole: 'voiceover',
      source: 'user-upload',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'user-attestation',
        sourceAssetId: 'voiceover_1',
        attestationVersion: 'audio-rights-attestation-v1',
        attestedAt: ATTESTED_AT.toISOString(),
        attestedBy: 'user_owner',
      },
    };
    const deps = dependencies({
      storedProject: project([{
        id: 1,
        type: 'sound',
        row: 3,
        assetId: 'voiceover_1',
        src: '/api/assets/voiceover_1',
        audioRights: rights,
      }]),
    });

    const result = await reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, deps);

    expect(result).toEqual({
      replayed: true,
      attestedAssetIds: [],
      rightsByAssetId: {},
    });
    expect(deps.loadAssets).not.toHaveBeenCalled();
    expect(deps.loadStoryboards).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('never uses generic consent to authorize music', async () => {
    const deps = dependencies({
      storedProject: project([{
        id: 1,
        type: 'sound',
        row: 1,
        assetId: 'bgm_chart_song',
        src: '/api/assets/bgm_chart_song',
      }]),
    });

    const result = await reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, deps);

    expect(result.replayed).toBe(true);
    expect(deps.loadAssets).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('rejects conflicting roles and out-of-scope source assets', async () => {
    const conflictingDeps = dependencies({
      storedProject: project([
        {
          id: 1,
          type: 'sound',
          assetId: 'audio_shared',
          src: '/api/assets/audio_shared',
          audioRole: 'voiceover',
        },
        {
          id: 2,
          type: 'sound',
          assetId: 'audio_shared',
          src: '/api/assets/audio_shared',
          audioRole: 'sfx',
        },
      ]),
    });
    await expect(reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, conflictingDeps)).rejects.toMatchObject({
      code: 'CONFLICTING_AUDIO_ROLES',
      httpStatus: 422,
    });

    const foreignDeps = dependencies({
      storedProject: project([{
        id: 1,
        type: 'sound',
        row: 3,
        assetId: 'voiceover_foreign',
        src: '/api/assets/voiceover_foreign',
      }]),
      assets: [{
        assetId: 'voiceover_foreign',
        userId: 'user_attacker',
        projectId: 'proj_foreign',
        type: 'audio',
        source: 'user-upload',
      }],
    });
    await expect(reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, foreignDeps)).rejects.toBeInstanceOf(
      UploadedExportAudioRightsAttestationError,
    );
    await expect(reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, foreignDeps)).rejects.toMatchObject({
      code: 'SOURCE_ASSET_NOT_ATTESTABLE',
      httpStatus: 422,
    });
    expect(foreignDeps.commit).not.toHaveBeenCalled();
  });

  it('requires current owner consent and fails on project revision races', async () => {
    const deps = dependencies({
      storedProject: project([{
        id: 1,
        type: 'sound',
        row: 3,
        assetId: 'voiceover_legacy_1',
        src: '/api/assets/voiceover_legacy_1',
      }]),
      assets: [{
        assetId: 'voiceover_legacy_1',
        userId: 'user_owner',
        type: 'audio',
        source: 'user-upload',
      }],
      commitResult: false,
    });

    await expect(reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: { accepted: false },
    }, deps)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      httpStatus: 400,
    });
    await expect(reattestUploadedExportAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION,
    }, deps)).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      httpStatus: 409,
    });
  });
});
