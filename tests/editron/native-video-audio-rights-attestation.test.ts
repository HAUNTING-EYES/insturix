import { describe, expect, it, vi } from 'vitest';

import {
  NativeVideoAudioRightsAttestationError,
  reattestNativeVideoAudioRights,
  type NativeVideoAudioRightsAttestationDependencies,
} from '@/lib/editron/services/native-video-audio-rights-attestation';
import { CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION } from '@/lib/editron/services/native-video-audio-rights';

const PROJECT_UPDATED_AT = new Date('2026-07-28T02:00:00.000Z');
const ATTESTED_AT = new Date('2026-07-28T02:05:00.000Z');

function project(overlays: Array<Record<string, unknown>>) {
  return {
    projectId: 'proj_legacy',
    userId: 'user_owner',
    updatedAt: PROJECT_UPDATED_AT,
    overlays,
  };
}

function dependencies(
  storedProject: Record<string, unknown>,
  assets: Array<Record<string, unknown>>,
  commitResult = true,
): NativeVideoAudioRightsAttestationDependencies {
  return {
    loadProject: vi.fn(async () => storedProject),
    loadAssets: vi.fn(async () => assets),
    commit: vi.fn(async () => commitResult),
    now: () => ATTESTED_AT,
  };
}

describe('legacy native-video audio rights attestation', () => {
  it('attests each owned source once and updates every derived clip in one commit', async () => {
    const deps = dependencies(
      project([
        {
          id: 1,
          type: 'video',
          assetId: 'upload_video_1',
          hasNativeAudio: true,
          from: 0,
          durationInFrames: 90,
        },
        {
          id: 2,
          type: 'video',
          assetId: 'upload_video_1',
          hasNativeAudio: true,
          from: 90,
          durationInFrames: 90,
        },
        {
          id: 3,
          type: 'video',
          assetId: 'upload_video_2',
          hasNativeAudio: false,
          from: 180,
          durationInFrames: 90,
        },
      ]),
      [{
        assetId: 'upload_video_1',
        userId: 'user_owner',
        type: 'video',
        source: 'user-upload',
      }],
    );

    const result = await reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, deps);

    expect(result).toMatchObject({
      replayed: false,
      attestedAssetIds: ['upload_video_1'],
    });
    expect(result.rightsByAssetId.upload_video_1).toMatchObject({
      mediaRole: 'native-video',
      source: 'user-upload',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        sourceAssetId: 'upload_video_1',
        attestedAt: ATTESTED_AT.toISOString(),
        attestedBy: 'user_owner',
      },
    });
    expect(deps.commit).toHaveBeenCalledOnce();
    const commitInput = vi.mocked(deps.commit).mock.calls[0]?.[0];
    const committedOverlays = commitInput?.overlays ?? [];
    expect(committedOverlays[0]?.audioRights).toEqual(
      result.rightsByAssetId.upload_video_1,
    );
    expect(committedOverlays[1]?.audioRights).toEqual(
      result.rightsByAssetId.upload_video_1,
    );
    expect(committedOverlays[2]?.audioRights).toBeUndefined();
  });

  it('is an idempotent replay when every native-audio clip already has valid rights', async () => {
    const firstDeps = dependencies(
      project([{
        id: 1,
        type: 'video',
        assetId: 'upload_video_1',
        hasNativeAudio: true,
      }]),
      [{
        assetId: 'upload_video_1',
        userId: 'user_owner',
        type: 'video',
        source: 'user-upload',
      }],
    );
    const first = await reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, firstDeps);
    const replayDeps = dependencies(
      project([{
        id: 1,
        type: 'video',
        assetId: 'upload_video_1',
        hasNativeAudio: true,
        audioRights: first.rightsByAssetId.upload_video_1,
      }]),
      [],
    );

    const replay = await reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, replayDeps);

    expect(replay).toEqual({
      replayed: true,
      attestedAssetIds: [],
      rightsByAssetId: {},
    });
    expect(replayDeps.loadAssets).not.toHaveBeenCalled();
    expect(replayDeps.commit).not.toHaveBeenCalled();
  });

  it('does not let a collaborator attest media owned by the project owner', async () => {
    const deps = dependencies(
      project([{
        id: 1,
        type: 'video',
        assetId: 'upload_video_1',
        hasNativeAudio: true,
      }]),
      [],
    );

    await expect(reattestNativeVideoAudioRights({
      userId: 'user_collaborator',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, deps)).rejects.toMatchObject({
      code: 'PROJECT_OWNER_REQUIRED',
      httpStatus: 403,
    });
  });

  it('rejects generated or missing source assets instead of inventing upload consent', async () => {
    const deps = dependencies(
      project([{
        id: 1,
        type: 'video',
        assetId: 'generated_video_1',
        hasNativeAudio: true,
      }]),
      [{
        assetId: 'generated_video_1',
        userId: 'user_owner',
        type: 'video',
        source: 'generated',
      }],
    );

    await expect(reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, deps)).rejects.toBeInstanceOf(
      NativeVideoAudioRightsAttestationError,
    );
    await expect(reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, deps)).rejects.toMatchObject({
      code: 'SOURCE_ASSET_NOT_ATTESTABLE',
      httpStatus: 422,
    });
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('fails with a retryable conflict when an editor save wins the revision race', async () => {
    const deps = dependencies(
      project([{
        id: 1,
        type: 'video',
        assetId: 'upload_video_1',
        hasNativeAudio: true,
      }]),
      [{
        assetId: 'upload_video_1',
        userId: 'user_owner',
        type: 'video',
        source: 'user-upload',
      }],
      false,
    );

    await expect(reattestNativeVideoAudioRights({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    }, deps)).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      httpStatus: 409,
    });
  });
});
