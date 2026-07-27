import { describe, expect, it, vi } from 'vitest';

import {
  NativeVideoAudioRightsClientError,
  confirmAndReloadNativeVideoAudioRights,
  findUnverifiedNativeAudioAssetIds,
} from '@/components/editron/editor/version-7.0.0/utils/native-video-audio-rights-client';
import { buildNativeVideoAudioRights } from '@/lib/editron/services/native-video-audio-rights';
import { AUDIO_RIGHTS_ATTESTATION_VERSION } from '@/lib/editron/shared/render-request-payload';

const validRights = buildNativeVideoAudioRights({
  sourceAssetId: 'upload_video_valid',
  userId: 'user_owner',
  attestation: {
    accepted: true,
    version: AUDIO_RIGHTS_ATTESTATION_VERSION,
  },
  attestedAt: new Date('2026-07-28T03:00:00.000Z'),
});

describe('native-video audio rights client', () => {
  it('finds unique native-audio source assets without a canonical receipt', () => {
    expect(findUnverifiedNativeAudioAssetIds([
      {
        id: 1,
        type: 'video',
        assetId: 'upload_video_missing',
        hasNativeAudio: true,
      },
      {
        id: 2,
        type: 'video',
        assetId: 'upload_video_missing',
        hasNativeAudio: true,
      },
      {
        id: 3,
        type: 'video',
        assetId: 'upload_video_valid',
        hasNativeAudio: true,
        audioRights: validRights,
      },
      {
        id: 4,
        type: 'video',
        assetId: 'upload_video_silent',
        hasNativeAudio: false,
      },
    ] as never)).toEqual(['upload_video_missing']);
  });

  it('posts current consent and reloads canonical project overlays', async () => {
    const overlays = [{
      id: 1,
      type: 'video',
      assetId: 'upload_video_valid',
      hasNativeAudio: true,
      audioRights: validRights,
    }];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        attestedAssetIds: ['upload_video_valid'],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        project: { overlays },
      }), { status: 200 }));

    const result = await confirmAndReloadNativeVideoAudioRights({
      projectId: 'proj_legacy',
      fetchImpl,
    });

    expect(result).toEqual(overlays);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/services/editron/projects/proj_legacy/native-video-audio-rights',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          attestation: {
            accepted: true,
            version: AUDIO_RIGHTS_ATTESTATION_VERSION,
          },
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/services/editron/projects/proj_legacy',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('preserves a typed server failure and does not fetch project state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: 'Review the latest timeline and retry.',
      code: 'PROJECT_REVISION_CONFLICT',
    }), { status: 409 }));

    await expect(confirmAndReloadNativeVideoAudioRights({
      projectId: 'proj_legacy',
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      message: 'Review the latest timeline and retry.',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('refuses to resume when canonical reload still contains unverified native audio', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        replayed: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        project: {
          overlays: [{
            id: 1,
            type: 'video',
            assetId: 'upload_video_missing',
            hasNativeAudio: true,
          }],
        },
      }), { status: 200 }));

    await expect(confirmAndReloadNativeVideoAudioRights({
      projectId: 'proj_legacy',
      fetchImpl,
    })).rejects.toBeInstanceOf(NativeVideoAudioRightsClientError);
    await expect(confirmAndReloadNativeVideoAudioRights({
      projectId: 'proj_legacy',
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          project: {
            overlays: [{
              id: 1,
              type: 'video',
              assetId: 'upload_video_missing',
              hasNativeAudio: true,
            }],
          },
        }), { status: 200 })),
    })).rejects.toMatchObject({
      code: 'ATTESTATION_RELOAD_UNVERIFIED',
    });
  });
});
