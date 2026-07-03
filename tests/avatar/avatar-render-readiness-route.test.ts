import { describe, expect, it } from 'vitest';
import { evaluateAvatarProfileRenderReadiness } from '../../lib/avatar/avatar-vault-api';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';

const NOW = '2026-07-02T00:00:00.000Z';

describe('Avatar render-readiness API', () => {
  it('rejects a non-owner before returning any recipe', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_owned', { userId: 'owner_user' })],
    });

    const result = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'other_user',
        orgId: null,
        recordId: 'avatar_owned',
        body: { useCase: 'speech_delivery', prompt: 'Present the roadmap.' },
      },
      { store },
    );

    expect(result.status).toBe(403);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected forbidden.');
    expect(result.body.error.code).toBe('forbidden');
  });

  it('refuses a draft profile with profile_not_accepted', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [draftRecord('avatar_draft', { userId: 'user_avatar' })],
    });

    const result = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_draft',
        body: { useCase: 'speech_delivery', prompt: 'Present the roadmap.' },
      },
      { store },
    );

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected profile_not_accepted.');
    expect(result.body.error.code).toBe('profile_not_accepted');
  });

  it('returns missing_speech_audio for a speech use case with no voice or audio', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [
        acceptedRecord('avatar_no_voice', {
          userId: 'user_avatar',
          voice: { sourceType: 'uploaded_voice_sample', sampleAssetId: '', ttsVoiceId: '', voiceProfileId: '' },
        }),
      ],
    });

    const result = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_no_voice',
        body: { useCase: 'speech_delivery', prompt: 'Deliver the explainer.', script: 'This must be spoken.' },
      },
      { store },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected a recipe response.');
    expect(result.body.recipe.readiness.ready).toBe(false);
    expect(result.body.recipe.readiness.errors.map((issue) => issue.code)).toEqual(['missing_speech_audio']);
  });

  it('authorizes copied reference audio only when copy and consent flags are both true', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_copy', { userId: 'user_avatar' })],
    });

    const unauthorized = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_copy',
        body: {
          useCase: 'generic_clip',
          prompt: 'Avatar reacts to a dashboard alert.',
          audio: {
            mode: 'copied_reference_audio',
            sourceUrl: 'https://cdn.example.test/reference-voice.wav',
            copyAllowed: false,
            consentConfirmed: false,
          },
        },
      },
      { store },
    );

    expect(unauthorized.status).toBe(200);
    if (!unauthorized.body.ok) throw new Error('Expected a recipe response.');
    expect(unauthorized.body.recipe.readiness.ready).toBe(false);
    expect(unauthorized.body.recipe.readiness.errors.map((issue) => issue.code)).toContain('audio_copy_not_authorized');

    const authorized = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_copy',
        body: {
          useCase: 'generic_clip',
          prompt: 'Avatar reacts to a dashboard alert.',
          audio: {
            mode: 'copied_reference_audio',
            sourceUrl: 'https://cdn.example.test/reference-voice.wav',
            copyAllowed: true,
            consentConfirmed: true,
          },
        },
      },
      { store },
    );

    expect(authorized.status).toBe(200);
    if (!authorized.body.ok) throw new Error('Expected a recipe response.');
    expect(authorized.body.recipe.readiness.ready).toBe(true);
  });

  it('warns without blocking a product shoot that has no product reference', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_product', { userId: 'user_avatar' })],
    });

    const result = await evaluateAvatarProfileRenderReadiness(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_product',
        body: { useCase: 'product_shoot', prompt: 'Avatar holds the product beside a bright desk.' },
      },
      { store },
    );

    expect(result.status).toBe(200);
    if (!result.body.ok) throw new Error('Expected a recipe response.');
    expect(result.body.recipe.readiness.ready).toBe(true);
    expect(result.body.recipe.readiness.warnings.map((issue) => issue.code)).toContain('missing_product_reference');
  });
});

function acceptedRecord(id: string, overrides: Partial<AvatarProfile> = {}): AvatarProfileRecord {
  const profile = avatar({ status: 'accepted', ...overrides });
  return {
    id,
    status: 'accepted',
    profile,
    createdAt: NOW,
    updatedAt: NOW,
    review: { required: false, reasons: [], acceptedAt: NOW, acceptedBy: 'avatar_reviewer' },
  };
}

function draftRecord(id: string, overrides: Partial<AvatarProfile> = {}): AvatarProfileRecord {
  const profile = avatar({ status: 'draft', ...overrides });
  return {
    id,
    status: 'draft',
    profile,
    createdAt: NOW,
    updatedAt: NOW,
    review: { required: true, reasons: ['Avatar profiles must be reviewed before they can generate videos.'] },
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
        { role: 'face_front', assetId: 'asset_face', imageUrl: 'https://cdn.example.test/avatar/face.png' },
        { role: 'full_body_front', assetId: 'asset_body', imageUrl: 'https://cdn.example.test/avatar/full-body.png' },
      ],
      bodyProfile: { description: 'Adult presenter, average build, camera-ready posture.' },
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
    },
    voice: {
      sourceType: 'selected_tts_voice',
      ttsVoiceId: 'voice_clear_presenter',
      language: 'en',
    },
    persona: { defaultRole: 'founder-presenter', defaultTone: 'confident' },
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
        confidence: 1,
        observedAt: NOW,
        extractor: 'avatar-render-readiness.test',
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
