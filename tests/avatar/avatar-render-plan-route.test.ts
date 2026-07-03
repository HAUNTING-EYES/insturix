import { describe, expect, it } from 'vitest';
import { planAvatarProfileRender } from '../../lib/avatar/avatar-vault-api';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';

const NOW = '2026-07-04T00:00:00.000Z';

describe('Avatar render-plan API', () => {
  it('returns a single selected provider by default without calling every candidate', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_speech', { userId: 'user_avatar' })],
    });

    const result = await planAvatarProfileRender(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_speech',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Present the launch update from a clean room.',
          script: 'Here is the launch update.',
          audio: { mode: 'uploaded_voiceover', sourceUrl: 'https://cdn.example.test/audio/launch.wav' },
        },
      },
      { store },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected render plan.');
    expect(result.body.providerPlan.mode).toBe('single');
    expect(result.body.providerPlan.selectedProviderIds).toEqual(['a2e']);
    expect(result.body.providerPlan.candidateProviderIds).toEqual(['a2e', 'd_id']);
  });

  it('honors explicit benchmark mode only when requested', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_benchmark', { userId: 'user_avatar' })],
    });

    const result = await planAvatarProfileRender(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_benchmark',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Present the launch update from a clean room.',
          script: 'Here is the launch update.',
          audio: { mode: 'uploaded_voiceover', sourceUrl: 'https://cdn.example.test/audio/launch.wav' },
          provider: { mode: 'benchmark', includeProviderIds: ['a2e', 'd_id'] },
        },
      },
      { store },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected render plan.');
    expect(result.body.providerPlan.mode).toBe('benchmark');
    expect(result.body.providerPlan.selectedProviderIds).toEqual(['a2e', 'd_id']);
  });

  it('falls through to A2E when D-ID is preferred for a product shoot it cannot support', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_product', { userId: 'user_avatar' })],
    });

    const result = await planAvatarProfileRender(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_product',
        body: {
          useCase: 'product_shoot',
          prompt: 'Avatar presents the product beside a bright desk setup.',
          productImageUrls: ['https://cdn.example.test/product/dashboard.png'],
          provider: { preferredProviderId: 'd_id' },
        },
      },
      { store },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected render plan.');
    expect(result.body.providerPlan.selectedProviderIds).toEqual(['a2e']);
    expect(result.body.providerPlan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: 'd_id',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'unsupported_use_case' }),
        ]),
      }),
    );
  });

  it('rejects unknown provider IDs instead of silently ignoring them', async () => {
    const store = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_invalid_provider', { userId: 'user_avatar' })],
    });

    const result = await planAvatarProfileRender(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_invalid_provider',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Present the roadmap.',
          provider: { preferredProviderId: 'happy_horse' },
        },
      },
      { store },
    );

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected invalid provider failure.');
    expect(result.body.error.code).toBe('invalid_body');
    expect(result.body.error.message).toContain('provider.preferredProviderId');
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
      productShootLook: 'smart casual product demo outfit',
    },
    performancePack: {
      usagePresets: ['speech_delivery', 'product_shoot'],
      gestureStyle: 'measured founder gestures',
      cameraPresence: 'direct-to-camera but natural',
      productInteraction: 'can point at product UI when supplied',
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
        extractor: 'avatar-render-plan.test',
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
