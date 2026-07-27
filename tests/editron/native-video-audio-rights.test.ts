import { describe, expect, it } from 'vitest';
import {
  NativeVideoAudioRightsError,
  buildNativeVideoAudioRights,
  readStoredNativeVideoAudioRights,
} from '@/lib/editron/services/native-video-audio-rights';
import { AUDIO_RIGHTS_ATTESTATION_VERSION } from '@/lib/editron/shared/render-request-payload';

describe('native video audio rights', () => {
  it('builds a server-owned native-video receipt from explicit current consent', () => {
    const rights = buildNativeVideoAudioRights({
      sourceAssetId: 'upload_video_1',
      userId: 'user_1',
      attestation: {
        accepted: true,
        version: AUDIO_RIGHTS_ATTESTATION_VERSION,
      },
      attestedAt: new Date('2026-07-28T00:00:00.000Z'),
    });

    expect(rights).toEqual({
      mediaRole: 'native-video',
      source: 'user-upload',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'user-attestation',
        sourceAssetId: 'upload_video_1',
        attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
        attestedAt: '2026-07-28T00:00:00.000Z',
        attestedBy: 'user_1',
      },
    });
  });

  it.each([
    undefined,
    null,
    {},
    { accepted: false, version: AUDIO_RIGHTS_ATTESTATION_VERSION },
    { accepted: true, version: 'audio-rights-attestation-v0' },
  ])('rejects missing or invalid consent: %j', (attestation) => {
    expect(() => buildNativeVideoAudioRights({
      sourceAssetId: 'upload_video_1',
      userId: 'user_1',
      attestation,
    })).toThrow(NativeVideoAudioRightsError);
  });

  it('accepts only a matching canonical stored claim for timeline propagation', () => {
    const rights = buildNativeVideoAudioRights({
      sourceAssetId: 'upload_video_1',
      userId: 'user_1',
      attestation: {
        accepted: true,
        version: AUDIO_RIGHTS_ATTESTATION_VERSION,
      },
      attestedAt: new Date('2026-07-28T00:00:00.000Z'),
    });

    expect(readStoredNativeVideoAudioRights({
      assetId: 'upload_video_1',
      type: 'video',
      source: 'user-upload',
      audioRights: rights,
    })).toEqual(rights);

    expect(readStoredNativeVideoAudioRights({
      assetId: 'upload_video_other',
      type: 'video',
      source: 'user-upload',
      audioRights: rights,
    })).toBeNull();

    expect(readStoredNativeVideoAudioRights({
      assetId: 'upload_video_1',
      type: 'video',
      source: 'generated',
      audioRights: rights,
    })).toBeNull();
  });
});
