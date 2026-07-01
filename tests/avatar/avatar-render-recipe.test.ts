import { describe, expect, it } from 'vitest';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import { buildAvatarRenderRecipe, evaluateAvatarRenderReadiness } from '../../lib/avatar/avatar-render-recipe';

const NOW = '2026-07-01T00:00:00.000Z';

describe('Avatar render recipe', () => {
  it('merges identity images, prompt, script, copied audio, and copied sound cues without provider lock-in', () => {
    const recipe = buildAvatarRenderRecipe({
      profileRecord: acceptedRecord(),
      useCase: 'speech_delivery',
      prompt: 'Founder stands in a clean studio and explains the product roadmap with natural hand gestures.',
      script: 'Here is how our product helps teams ship sharper launch videos.',
      audio: {
        mode: 'copied_reference_audio',
        sourceUrl: 'https://cdn.example.test/avatar/rishi-reference-voice.wav',
        description: 'Use this owner-authorized delivery and room tone as the speech reference.',
        copyAllowed: true,
        consentConfirmed: true,
      },
      soundCues: [
        {
          label: 'UI confirmation',
          description: 'Soft confirmation chime copied from the supplied product demo audio.',
          sourceUrl: 'https://cdn.example.test/sounds/product-chime.wav',
          copyAllowed: true,
        },
      ],
      productImageUrls: ['https://cdn.example.test/products/editor-dashboard.png'],
      target: { aspectRatio: '16:9', durationSeconds: 12, resolution: '1080p' },
    });

    expect(recipe.readiness.ready).toBe(true);
    expect(recipe.visual.referenceImages.map((image) => image.role)).toEqual([
      'portrait',
      'face_front',
      'full_body_front',
      'product',
    ]);
    expect(recipe.audio.mode).toBe('copied_reference_audio');
    expect(recipe.audio.copiedReference).toBe(true);
    expect(recipe.audio.soundCues[0]).toEqual(
      expect.objectContaining({
        label: 'UI confirmation',
        copiedReference: true,
      }),
    );
    expect(recipe.editronContract).toEqual({
      requiresVideoGeneration: true,
      requiresAudioMix: true,
      acceptsExternalProviderVideo: true,
      canMaterializeAsTimelineOverlays: true,
    });
    expect(JSON.stringify(recipe).toLowerCase()).not.toContain('happy');
    expect(JSON.stringify(recipe).toLowerCase()).not.toContain('fal');
  });

  it('blocks speech generation when an accepted avatar has no voice or audio source', () => {
    const readiness = evaluateAvatarRenderReadiness({
      profileRecord: acceptedRecord({
        voice: {
          sourceType: 'uploaded_voice_sample',
          sampleAssetId: '',
          ttsVoiceId: '',
          voiceProfileId: '',
        },
      }),
      useCase: 'speech_delivery',
      prompt: 'Presenter delivers a concise explainer.',
      script: 'This line must be spoken.',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.map((issue) => issue.code)).toEqual(['missing_speech_audio']);
  });

  it('blocks unauthorized copied audio and copied sound references', () => {
    const readiness = evaluateAvatarRenderReadiness({
      profileRecord: acceptedRecord(),
      useCase: 'generic_clip',
      prompt: 'Avatar reacts to a dashboard notification.',
      audio: {
        mode: 'copied_reference_audio',
        sourceUrl: 'https://cdn.example.test/reference-audio.wav',
        copyAllowed: false,
        consentConfirmed: false,
      },
      soundCues: [
        {
          description: 'Copy this exact notification sound.',
          sourceUrl: 'https://cdn.example.test/reference-sound.wav',
          copyAllowed: false,
        },
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.map((issue) => issue.code)).toEqual([
      'audio_copy_not_authorized',
      'sound_copy_not_authorized',
    ]);
  });

  it('warns but does not block product shoots without product references', () => {
    const readiness = evaluateAvatarRenderReadiness({
      profileRecord: acceptedRecord(),
      useCase: 'product_shoot',
      prompt: 'Avatar holds the product beside a bright desk setup.',
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.warnings.map((issue) => issue.code)).toContain('missing_product_reference');
  });
});

function acceptedRecord(overrides: Partial<AvatarProfile> = {}): AvatarProfileRecord {
  const profile = avatar(overrides);
  return {
    id: 'avatar_profile_primary',
    status: profile.status,
    profile,
    createdAt: NOW,
    updatedAt: NOW,
    review: {
      required: false,
      reasons: [],
      acceptedAt: NOW,
      acceptedBy: 'avatar_reviewer',
    },
  };
}

function avatar(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  const base: AvatarProfile = {
    version: 1,
    avatarId: 'avatar_primary',
    userId: 'user_avatar',
    orgId: null,
    brandId: null,
    displayName: 'Primary Presenter',
    status: 'accepted',
    sourceType: 'virtual_person_profile',
    portrait: {
      assetId: 'asset_portrait',
      imageUrl: 'https://cdn.example.test/avatar/portrait.png',
      identityDescription: 'Front-facing studio portrait.',
    },
    identityPack: {
      referenceAssets: [
        {
          role: 'face_front',
          assetId: 'asset_face',
          imageUrl: 'https://cdn.example.test/avatar/face.png',
        },
        {
          role: 'full_body_front',
          assetId: 'asset_body',
          imageUrl: 'https://cdn.example.test/avatar/full-body.png',
        },
      ],
      bodyProfile: {
        description: 'Adult presenter, average build, camera-ready posture.',
      },
    },
    stylePack: {
      wardrobePresets: [],
      defaultLook: 'navy sweater, dark trousers',
      speechLook: 'clean founder-presenter outfit',
    },
    performancePack: {
      usagePresets: ['speech_delivery', 'product_shoot'],
      gestureStyle: 'measured founder gestures',
      cameraPresence: 'direct-to-camera but natural',
      productInteraction: 'can hold or point at product UI when supplied',
    },
    voice: {
      sourceType: 'selected_tts_voice',
      ttsVoiceId: 'voice_clear_presenter',
      language: 'en',
      speakingStyle: 'clear and warm',
    },
    persona: {
      defaultRole: 'founder-presenter',
      defaultTone: 'confident',
      speakingConstraints: ['do not claim unsupported metrics'],
      killList: ['cheap'],
    },
    rights: {
      consentConfirmed: true,
      likenessOwner: 'self',
      commercialUseAllowed: true,
      notes: 'User confirmed own likeness and voice rights.',
    },
    evidence: [
      {
        id: 'e_consent',
        signalPath: 'rights.consentConfirmed',
        sourceType: 'manual_user_entry',
        excerpt: 'User confirmed avatar consent.',
        confidence: 1,
        observedAt: NOW,
        extractor: 'avatar-render-recipe.test',
        consentRequired: true,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    acceptedAt: NOW,
    acceptedBy: 'avatar_reviewer',
  };

  return {
    ...base,
    ...overrides,
    portrait: { ...base.portrait, ...(overrides.portrait ?? {}) },
    identityPack: overrides.identityPack ?? base.identityPack,
    stylePack: overrides.stylePack ?? base.stylePack,
    performancePack: overrides.performancePack ?? base.performancePack,
    voice: { ...base.voice, ...(overrides.voice ?? {}) },
    persona: { ...base.persona, ...(overrides.persona ?? {}) },
    rights: { ...base.rights, ...(overrides.rights ?? {}) },
    evidence: overrides.evidence ?? base.evidence,
  };
}
