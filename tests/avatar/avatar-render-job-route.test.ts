import { describe, expect, it } from 'vitest';
import {
  createAvatarRenderJobFromRequest,
  createInMemoryAvatarRenderJobStore,
} from '../../lib/avatar/avatar-render-job';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';

const NOW = '2026-07-04T00:00:00.000Z';

describe('Avatar render-job API', () => {
  it('saves a blocked A2E job when the provider key is not configured', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_speech', { userId: 'user_avatar' })],
    });
    const jobStore = createInMemoryAvatarRenderJobStore();

    const result = await createAvatarRenderJobFromRequest(
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
      {
        profileStore,
        jobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_render_job_1',
        env: {},
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected render job.');
    expect(result.body.providerPlan.selectedProviderIds).toEqual(['a2e']);
    expect(result.body.job).toEqual(
      expect.objectContaining({
        id: 'avatar_render_job_1',
        recordId: 'avatar_speech',
        providerId: 'a2e',
        status: 'blocked',
        dispatchCode: 'provider_not_configured',
      }),
    );
    expect(jobStore.getJobSnapshot('avatar_render_job_1')).toEqual(result.body.job);
  });

  it('refuses to create a job when the recipe is not ready', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [
        acceptedRecord('avatar_no_voice', {
          userId: 'user_avatar',
          voice: { sourceType: 'selected_tts_voice', ttsVoiceId: undefined, language: 'en' },
        }),
      ],
    });
    const jobStore = createInMemoryAvatarRenderJobStore();

    const result = await createAvatarRenderJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_no_voice',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Present the launch update from a clean room.',
          audio: { mode: 'tts_voiceover' },
        },
      },
      { profileStore, jobStore, now: () => NOW, env: {} },
    );

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected render job failure.');
    expect(result.body.error.code).toBe('recipe_not_ready');
    expect(jobStore.listJobSnapshots()).toEqual([]);
  });

  it('requires single-provider mode for execution', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_benchmark', { userId: 'user_avatar' })],
    });
    const jobStore = createInMemoryAvatarRenderJobStore();

    const result = await createAvatarRenderJobFromRequest(
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
      { profileStore, jobStore, now: () => NOW, env: {} },
    );

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected benchmark execution failure.');
    expect(result.body.error.code).toBe('benchmark_execution_not_supported');
    expect(jobStore.listJobSnapshots()).toEqual([]);
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
        extractor: 'avatar-render-job.test',
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