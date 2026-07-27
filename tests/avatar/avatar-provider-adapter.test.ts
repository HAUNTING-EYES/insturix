import { describe, expect, it } from 'vitest';
import type { AvatarRenderRecipe } from '../../lib/avatar/avatar-render-recipe';
import {
  AVATAR_PROVIDER_DESCRIPTORS,
  evaluateAvatarProviderReadiness,
  planAvatarProviderRender,
} from '../../lib/avatar/avatar-provider-adapter';

describe('Avatar provider adapter contract', () => {
  it('plans exactly one provider for normal renders while retaining benchmark candidates', () => {
    const plan = planAvatarProviderRender(readyRecipe());

    expect(plan.mode).toBe('single');
    expect(plan.selectedProviderIds).toEqual(['a2e']);
    expect(plan.candidateProviderIds).toEqual(['a2e', 'd_id']);
    expect(plan.readinessByProvider.a2e?.ready).toBe(true);
    expect(plan.readinessByProvider.d_id?.ready).toBe(true);
  });

  it('uses benchmark mode only when explicitly requested', () => {
    const plan = planAvatarProviderRender(readyRecipe(), { mode: 'benchmark' });

    expect(plan.selectedProviderIds).toEqual(['a2e', 'd_id']);
  });

  it('routes product-shoot recipes away from D-ID and toward A2E', () => {
    const plan = planAvatarProviderRender(readyRecipe({ useCase: 'product_shoot' }));

    expect(plan.selectedProviderIds).toEqual(['a2e']);
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: 'd_id',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'unsupported_use_case' }),
        ]),
      }),
    );
  });

  it('keeps Fal cinematic providers registered as future stubs only', () => {
    const readiness = evaluateAvatarProviderReadiness(
      readyRecipe({ useCase: 'ad_actor', audioMode: 'external_mix' }),
      AVATAR_PROVIDER_DESCRIPTORS.omnihuman_fal,
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.map((issue) => issue.code)).toContain('provider_stub_only');
  });

  it('fails loudly when a provider duration limit is exceeded', () => {
    const readiness = evaluateAvatarProviderReadiness(
      readyRecipe({ durationSeconds: 360 }),
      AVATAR_PROVIDER_DESCRIPTORS.d_id,
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.map((issue) => issue.code)).toEqual(['duration_exceeds_provider_limit']);
  });
});

function readyRecipe(overrides: {
  useCase?: AvatarRenderRecipe['useCase'];
  audioMode?: AvatarRenderRecipe['audio']['mode'];
  durationSeconds?: number;
  ready?: boolean;
} = {}): AvatarRenderRecipe {
  const audioMode = overrides.audioMode ?? 'uploaded_voiceover';
  return {
    version: 1,
    avatarRecordId: 'avatar_profile_primary',
    avatarId: 'avatar_primary',
    userId: 'user_avatar',
    orgId: null,
    brandId: null,
    useCase: overrides.useCase ?? 'speech_delivery',
    faceProvider: 'kling_standard',
    renderModality: 'talking_head',
    readiness: {
      ready: overrides.ready ?? true,
      errors: [],
      warnings: [],
    },
    visual: {
      displayName: 'Primary Presenter',
      identityDescription: 'Reusable presenter identity.',
      referenceImages: [
        {
          role: 'portrait',
          imageUrl: 'https://cdn.example.test/avatar/portrait.png',
          assetId: 'asset_portrait',
        },
        {
          role: 'full_body_front',
          imageUrl: 'https://cdn.example.test/avatar/full-body.png',
          assetId: 'asset_body',
        },
      ],
      bodyDescription: 'Adult presenter, average build, camera-ready posture.',
      wardrobe: 'clean studio outfit',
    },
    creative: {
      prompt: 'Avatar presents the product update in a clean room.',
      script: 'Here is the update.',
      personaRole: 'founder-presenter',
      personaTone: 'confident',
      gestureStyle: 'measured founder gestures',
      cameraPresence: 'direct-to-camera but natural',
    },
    audio: {
      mode: audioMode,
      voiceSource: {
        sourceType: audioMode === 'tts_voiceover' ? 'selected_tts_voice' : 'uploaded_voice_sample',
        sampleAssetId: audioMode === 'tts_voiceover' ? undefined : 'voice_sample_1',
        ttsVoiceId: audioMode === 'tts_voiceover' ? 'voice_clear_presenter' : undefined,
        language: 'en',
      },
      voiceoverText: 'Here is the update.',
      sourceAssetId: audioMode === 'uploaded_voiceover' ? 'voiceover_track_1' : undefined,
      sourceUrl: audioMode === 'copied_reference_audio'
        ? 'https://cdn.example.test/avatar/reference-audio.wav'
        : undefined,
      copiedReference: audioMode === 'copied_reference_audio',
      soundCues: [],
    },
    target: {
      aspectRatio: '16:9',
      durationSeconds: overrides.durationSeconds ?? 30,
      resolution: '1080p',
    },
    editronContract: {
      requiresVideoGeneration: true,
      requiresAudioMix: audioMode !== 'silent',
      acceptsExternalProviderVideo: true,
      canMaterializeAsTimelineOverlays: true,
    },
  };
}
