import { describe, expect, it } from 'vitest';
import {
  createAvatarPipelineJobFromRequest,
  createInMemoryAvatarPipelineJobStore,
} from '../../lib/avatar/avatar-pipeline-job';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';

const NOW = '2026-07-04T00:00:00.000Z';

describe('Avatar pipeline-job API', () => {
  it('saves a Chatterbox to OmniHuman to Remotion pipeline snapshot when env is missing', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_pipeline', { userId: 'user_avatar' })],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();

    const result = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi speaks from a clean room with a product table in frame.',
          script: 'Here is the launch update.',
          audio: { mode: 'tts_voiceover', voiceoverText: 'Here is the launch update.' },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_1',
        env: {},
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected pipeline job.');
    expect(result.body.job).toEqual(
      expect.objectContaining({
        id: 'avatar_pipeline_job_1',
        recordId: 'avatar_pipeline',
        status: 'blocked',
        dispatchCode: 'pipeline_not_configured',
      }),
    );
    expect(result.body.job.stages.map((stage) => stage.id)).toEqual([
      'voice_chatterbox',
      'face_omnihuman_fal',
      'composition_remotion',
    ]);
    expect(result.body.job.stages[0]).toEqual(
      expect.objectContaining({
        providerId: 'chatterbox_tts',
        status: 'blocked',
        dispatchCode: 'missing_chatterbox_endpoint',
        requiredEnvKeys: ['CHATTERBOX_TTS_ENDPOINT'],
      }),
    );
    expect(result.body.job.stages[1]).toEqual(
      expect.objectContaining({
        providerId: 'fal_omnihuman_v1_5',
        status: 'blocked',
        dispatchCode: 'missing_fal_key',
        requiredEnvKeys: ['FAL_KEY'],
      }),
    );
    expect(pipelineJobStore.getPipelineJobSnapshot('avatar_pipeline_job_1')).toEqual(result.body.job);
  });

  it('marks Chatterbox and OmniHuman ready when env exists while keeping execution blocked for adapters', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_pipeline_ready', { userId: 'user_avatar' })],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();

    const result = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline_ready',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi appears as a presenter in a clean room background.',
          script: 'This avatar pipeline is now decoupled.',
          audio: { mode: 'tts_voiceover' },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_2',
        env: {
          CHATTERBOX_TTS_ENDPOINT: 'https://chatterbox.internal/synthesize',
          FAL_KEY: 'fal_test_key',
        },
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected pipeline job.');
    expect(result.body.job.dispatchCode).toBe('pipeline_adapter_not_implemented');
    expect(result.body.job.stages[0]).toEqual(
      expect.objectContaining({
        status: 'ready',
        dispatchCode: 'stage_ready',
        input: expect.objectContaining({
          model: 'chatterbox_turbo',
          voiceReference: expect.objectContaining({
            sourceType: 'uploaded_voice_sample',
            assetId: 'asset_voice_sample',
          }),
        }),
      }),
    );
    expect(result.body.job.stages[1]).toEqual(
      expect.objectContaining({
        status: 'ready',
        dispatchCode: 'stage_ready',
        input: expect.objectContaining({
          model: 'fal-ai/bytedance/omnihuman/v1.5',
          audio: { dependsOnStageId: 'voice_chatterbox' },
        }),
      }),
    );
  });

  it('refuses to create a pipeline job when Avatar Vault readiness fails', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [
        acceptedRecord('avatar_no_voice', {
          userId: 'user_avatar',
          voice: { sourceType: 'uploaded_voice_sample', sampleAssetId: '', ttsVoiceId: '', voiceProfileId: '' },
        }),
      ],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();

    const result = await createAvatarPipelineJobFromRequest(
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
      { profileStore, pipelineJobStore, now: () => NOW, env: {} },
    );

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected pipeline job failure.');
    expect(result.body.error.code).toBe('recipe_not_ready');
    expect(pipelineJobStore.listPipelineJobSnapshots()).toEqual([]);
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
      sourceType: 'uploaded_voice_sample',
      sampleAssetId: 'asset_voice_sample',
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
        extractor: 'avatar-pipeline-job.test',
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
