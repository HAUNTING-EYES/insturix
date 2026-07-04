import { describe, expect, it } from 'vitest';
import {
  createAvatarPipelineJobFromRequest,
  createInMemoryAvatarPipelineJobStore,
  refreshAvatarPipelineJobFromRequest,
} from '../../lib/avatar/avatar-pipeline-job';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import type { AvatarProfileRecord } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';
import type { ChatterboxClient, ChatterboxSynthesizeInput } from '../../lib/avatar/avatar-chatterbox-client';
import type { OmniHumanFalClient, OmniHumanFalSubmitInput } from '../../lib/avatar/avatar-omnihuman-fal';

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
        requiredEnvKeys: ['FAL_AI_API_KEY', 'FAL_KEY'],
      }),
    );
    expect(pipelineJobStore.getPipelineJobSnapshot('avatar_pipeline_job_1')).toEqual(result.body.job);
  });

  it('queues OmniHuman on fal when env and uploaded voiceover audio exist', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_pipeline_ready', { userId: 'user_avatar' })],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();
    const submittedInputs: OmniHumanFalSubmitInput[] = [];
    const omniHumanClient: OmniHumanFalClient = {
      async submit(input) {
        submittedInputs.push(input);
        return {
          modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          requestId: 'fal_request_123',
          input: {
            image_url: input.imageUrl,
            audio_url: input.audioUrl,
            prompt: input.prompt,
            resolution: input.resolution,
            turbo_mode: false,
          },
        };
      },
      async refresh() {
        throw new Error('refresh should not run during creation');
      },
    };

    const result = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline_ready',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi appears as a presenter in a clean room background.',
          script: 'This avatar pipeline is now decoupled.',
          audio: {
            mode: 'uploaded_voiceover',
            sourceUrl: 'https://cdn.example.test/audio/rishi-voiceover.wav',
          },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_2',
        omniHumanClient,
        env: {
          CHATTERBOX_TTS_ENDPOINT: 'https://chatterbox.internal/synthesize',
          FAL_AI_API_KEY: 'fal_test_key',
        },
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected pipeline job.');
    expect(result.body.job).toEqual(
      expect.objectContaining({
        status: 'queued',
        dispatchCode: 'omnihuman_queued',
      }),
    );
    expect(result.body.job.stages[0]).toEqual(
      expect.objectContaining({
        status: 'skipped',
        dispatchCode: 'external_audio_supplied',
        input: expect.objectContaining({
          existingAudio: { sourceUrl: 'https://cdn.example.test/audio/rishi-voiceover.wav' },
        }),
      }),
    );
    expect(result.body.job.stages[1]).toEqual(
      expect.objectContaining({
        status: 'running',
        dispatchCode: 'omnihuman_queued',
        providerRequestId: 'fal_request_123',
        input: expect.objectContaining({
          model: 'fal-ai/bytedance/omnihuman/v1.5',
          audio: { sourceUrl: 'https://cdn.example.test/audio/rishi-voiceover.wav' },
          fal: expect.objectContaining({
            modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          }),
        }),
      }),
    );
    expect(submittedInputs).toEqual([
      {
        imageUrl: 'https://cdn.example.test/avatar/full-body.png',
        audioUrl: 'https://cdn.example.test/audio/rishi-voiceover.wav',
        prompt: 'Rishi appears as a presenter in a clean room background.',
        resolution: '720p',
        turboMode: false,
      },
    ]);
    expect(pipelineJobStore.getPipelineJobSnapshot('avatar_pipeline_job_2')).toEqual(result.body.job);
  });

  it('synthesizes avatar voice from the saved voice sample before queuing OmniHuman', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_pipeline_voice_clone', { userId: 'user_avatar' })],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();
    const chatterboxInputs: ChatterboxSynthesizeInput[] = [];
    const omniHumanInputs: OmniHumanFalSubmitInput[] = [];
    const chatterboxClient: ChatterboxClient = {
      async synthesize(input) {
        chatterboxInputs.push(input);
        return {
          audioUrl: 'https://cdn.example.test/audio/generated-rishi-chatterbox.wav',
          audioAssetId: 'asset_generated_chatterbox_voiceover',
          providerRequestId: 'chatterbox_request_1',
          raw: {},
        };
      },
    };
    const omniHumanClient: OmniHumanFalClient = {
      async submit(input) {
        omniHumanInputs.push(input);
        return {
          modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          requestId: 'fal_request_from_chatterbox',
          input: {
            image_url: input.imageUrl,
            audio_url: input.audioUrl,
          },
        };
      },
      async refresh() {
        throw new Error('refresh should not run during creation');
      },
    };

    const result = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline_voice_clone',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi appears as a natural talking head in a clean room background.',
          script: 'Hey, this is a quick avatar pipeline test.',
          audio: { mode: 'tts_voiceover' },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_voice_clone',
        chatterboxClient,
        omniHumanClient,
        env: {
          CHATTERBOX_TTS_ENDPOINT: 'https://chatterbox.internal/synthesize',
          FAL_AI_API_KEY: 'fal_test_key',
        },
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected pipeline job.');
    expect(result.body.job).toEqual(
      expect.objectContaining({
        status: 'queued',
        dispatchCode: 'omnihuman_queued',
      }),
    );
    expect(chatterboxInputs).toEqual([
      expect.objectContaining({
        text: 'Hey, this is a quick avatar pipeline test.',
        language: 'en',
        voiceReference: {
          sourceType: 'uploaded_voice_sample',
          assetId: 'asset_voice_sample',
          voiceProfileId: undefined,
          url: undefined,
        },
      }),
    ]);
    expect(omniHumanInputs).toEqual([
      expect.objectContaining({
        imageUrl: 'https://cdn.example.test/avatar/full-body.png',
        audioUrl: 'https://cdn.example.test/audio/generated-rishi-chatterbox.wav',
      }),
    ]);
    expect(result.body.job.stages[0]).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        dispatchCode: 'chatterbox_succeeded',
        providerRequestId: 'chatterbox_request_1',
        output: expect.objectContaining({
          audioUrl: 'https://cdn.example.test/audio/generated-rishi-chatterbox.wav',
          audioAssetId: 'asset_generated_chatterbox_voiceover',
        }),
      }),
    );
    expect(result.body.job.stages[1]).toEqual(
      expect.objectContaining({
        status: 'running',
        dispatchCode: 'omnihuman_queued',
        providerRequestId: 'fal_request_from_chatterbox',
        input: expect.objectContaining({
          audio: {
            sourceUrl: 'https://cdn.example.test/audio/generated-rishi-chatterbox.wav',
            sourceAssetId: 'asset_generated_chatterbox_voiceover',
            generatedByStageId: 'voice_chatterbox',
          },
        }),
      }),
    );
  });
  it('synthesizes avatar voice from a request voice reference URL before queuing OmniHuman', async () => {
    const voiceReferenceUrl = 'https://cdn.example.test/audio/rishi-sample.wav';
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [
        acceptedRecord('avatar_pipeline_request_voice_reference', {
          userId: 'user_avatar',
          voice: {
            sourceType: 'uploaded_voice_sample',
            sampleAssetId: '',
            ttsVoiceId: '',
            voiceProfileId: '',
            language: 'en',
          },
        }),
      ],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();
    const chatterboxInputs: ChatterboxSynthesizeInput[] = [];
    const omniHumanInputs: OmniHumanFalSubmitInput[] = [];
    const chatterboxClient: ChatterboxClient = {
      async synthesize(input) {
        chatterboxInputs.push(input);
        return {
          audioUrl: 'https://cdn.example.test/audio/generated-from-request-reference.wav',
          audioAssetId: 'asset_generated_from_request_reference',
          providerRequestId: 'chatterbox_request_reference_url',
          raw: {},
        };
      },
    };
    const omniHumanClient: OmniHumanFalClient = {
      async submit(input) {
        omniHumanInputs.push(input);
        return {
          modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          requestId: 'fal_request_from_reference_url',
          input: {
            image_url: input.imageUrl,
            audio_url: input.audioUrl,
          },
        };
      },
      async refresh() {
        throw new Error('refresh should not run during creation');
      },
    };

    const result = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline_request_voice_reference',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi appears as a natural talking head in a clean room background.',
          script: 'Hey, this is a quick avatar pipeline test.',
          audio: {
            mode: 'tts_voiceover',
            voiceoverText: 'Hey, this is a quick avatar pipeline test.',
            voiceReferenceUrl,
          },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_reference_url',
        chatterboxClient,
        omniHumanClient,
        env: {
          CHATTERBOX_TTS_ENDPOINT: 'https://chatterbox.internal/synthesize',
          FAL_AI_API_KEY: 'fal_test_key',
        },
      },
    );

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error('Expected pipeline job.');
    expect(result.body.recipe.audio.sourceUrl).toBeUndefined();
    expect(result.body.recipe.audio.voiceReferenceUrl).toBe(voiceReferenceUrl);
    expect(chatterboxInputs).toEqual([
      expect.objectContaining({
        text: 'Hey, this is a quick avatar pipeline test.',
        language: 'en',
        voiceReference: {
          sourceType: 'uploaded_voice_sample',
          assetId: undefined,
          voiceProfileId: undefined,
          url: voiceReferenceUrl,
        },
      }),
    ]);
    expect(omniHumanInputs).toEqual([
      expect.objectContaining({
        imageUrl: 'https://cdn.example.test/avatar/full-body.png',
        audioUrl: 'https://cdn.example.test/audio/generated-from-request-reference.wav',
      }),
    ]);
    expect(result.body.job).toEqual(
      expect.objectContaining({
        status: 'queued',
        dispatchCode: 'omnihuman_queued',
      }),
    );
    expect(result.body.job.stages[1]).toEqual(
      expect.objectContaining({
        status: 'running',
        dispatchCode: 'omnihuman_queued',
        input: expect.objectContaining({
          audio: {
            sourceUrl: 'https://cdn.example.test/audio/generated-from-request-reference.wav',
            sourceAssetId: 'asset_generated_from_request_reference',
            generatedByStageId: 'voice_chatterbox',
          },
        }),
      }),
    );
  });
  it('refreshes an OmniHuman fal request into a raw face video output', async () => {
    const profileStore = createInMemoryAvatarProfileRepository({
      records: [acceptedRecord('avatar_pipeline_refresh', { userId: 'user_avatar' })],
    });
    const pipelineJobStore = createInMemoryAvatarPipelineJobStore();
    const omniHumanClient: OmniHumanFalClient = {
      async submit(input) {
        return {
          modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          requestId: 'fal_request_done',
          input: {
            image_url: input.imageUrl,
            audio_url: input.audioUrl,
          },
        };
      },
      async refresh(requestId) {
        return {
          modelId: 'fal-ai/bytedance/omnihuman/v1.5',
          requestId,
          status: 'succeeded',
          providerStatus: 'COMPLETED',
          raw: {},
          videoUrl: 'https://fal.example.test/omnihuman/rishi.mp4',
          durationSeconds: 8,
        };
      },
    };

    const created = await createAvatarPipelineJobFromRequest(
      {
        userId: 'user_avatar',
        orgId: null,
        recordId: 'avatar_pipeline_refresh',
        body: {
          useCase: 'speech_delivery',
          prompt: 'Rishi presents the product update in a room.',
          audio: {
            mode: 'uploaded_voiceover',
            sourceUrl: 'https://cdn.example.test/audio/rishi-voiceover.wav',
          },
        },
      },
      {
        profileStore,
        pipelineJobStore,
        now: () => NOW,
        idGenerator: () => 'avatar_pipeline_job_3',
        omniHumanClient,
        env: { FAL_AI_API_KEY: 'fal_test_key' },
      },
    );
    expect(created.body.ok).toBe(true);

    const refreshed = await refreshAvatarPipelineJobFromRequest(
      { userId: 'user_avatar', orgId: null, jobId: 'avatar_pipeline_job_3' },
      {
        pipelineJobStore,
        omniHumanClient,
        now: () => '2026-07-04T00:01:00.000Z',
        env: { FAL_AI_API_KEY: 'fal_test_key' },
      },
    );

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.ok).toBe(true);
    if (!refreshed.body.ok) throw new Error('Expected refreshed pipeline job.');
    expect(refreshed.body.job).toEqual(
      expect.objectContaining({
        status: 'running',
        dispatchCode: 'omnihuman_succeeded',
        updatedAt: '2026-07-04T00:01:00.000Z',
      }),
    );
    expect(refreshed.body.job.stages[1]).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        dispatchCode: 'omnihuman_succeeded',
        output: expect.objectContaining({
          requestId: 'fal_request_done',
          videoUrl: 'https://fal.example.test/omnihuman/rishi.mp4',
          durationSeconds: 8,
        }),
      }),
    );
    expect(refreshed.body.job.stages[2].input).toEqual(
      expect.objectContaining({
        faceVideo: {
          providerId: 'fal_omnihuman_v1_5',
          requestId: 'fal_request_done',
          videoUrl: 'https://fal.example.test/omnihuman/rishi.mp4',
          durationSeconds: 8,
        },
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
