import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatDubbingJob, ChatDubbingProgress } from '@/lib/editron/services/chat-dubbing-job';

const mocks = vi.hoisted(() => ({
  generateVoiceover: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  sampleAudioClip: vi.fn(),
  uploadMedia: vi.fn(),
  falConfig: vi.fn(),
  falStorageUpload: vi.fn(),
  falSubscribe: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  rm: mocks.rm,
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: mocks.falConfig,
    storage: { upload: mocks.falStorageUpload },
    subscribe: mocks.falSubscribe,
  },
}));

vi.mock('@/lib/pipeline/tts-service', () => ({
  generateVoiceover: mocks.generateVoiceover,
  listSupportedSpeechLanguages: () => [
    { language: 'en', displayName: 'English' },
    { language: 'hi', displayName: 'Hindi' },
  ],
  resolveSpeechSynthesisCapability: (language: unknown, voice?: string | null) => {
    const normalized = String(language ?? 'English').toLowerCase();
    if (['hindi', 'hi', 'hi-in', 'hin'].includes(normalized)) {
      return {
        language: 'hi',
        displayName: 'Hindi',
        provider: 'fal-ai',
        model: 'fal-ai/kokoro/hindi',
        voiceId: voice ?? 'hf_alpha',
      };
    }
    if (['english', 'en', 'en-us', 'en-gb'].includes(normalized)) {
      return voice === 'aura-asteria-en'
        ? {
          language: 'en',
          displayName: 'English',
          provider: 'deepgram',
          model: 'aura-asteria-en',
          voiceId: 'aura-asteria-en',
        }
        : {
          language: 'en',
          displayName: 'English',
          provider: 'fal-ai',
          model: 'fal-ai/kokoro/american-english',
          voiceId: voice ?? 'af_heart',
          fallback: {
            provider: 'deepgram',
            model: 'aura-asteria-en',
            voiceId: 'aura-asteria-en',
          },
        };
    }
    return null;
  },
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    MEDIA_ASSETS: 'media_assets',
    PROJECTS: 'projects',
  },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: mocks.findOne,
      updateOne: mocks.updateOne,
    })),
  })),
}));

vi.mock('@/lib/editron/engine/overlay-atomic-receipts', () => ({
  withAtomicOverlayReceipt: vi.fn((overlay) => overlay),
  withAtomicOverlayUpdateReceipt: vi.fn((overlay, update) => ({
    ...overlay,
    ...update,
  })),
}));

vi.mock('@/lib/editron/services/media/analysis-service', () => ({
  sampleAudioClip: mocks.sampleAudioClip,
}));

vi.mock('@/lib/editron/services/media/transcription-service', () => ({
  getTranscription: vi.fn(),
}));

vi.mock('@/lib/editron/services/narrative-beat-producer', () => ({
  segmentNarrativeBeats: vi.fn(),
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: vi.fn(),
}));

const now = new Date('2026-07-27T00:00:00.000Z');
const dubbingRights = {
  mediaRole: 'dubbing' as const,
  source: 'generated' as const,
  userChoice: 'attested' as const,
  licensed: true,
  evidence: {
    kind: 'generated-provider' as const,
    sourceAssetId: 'dub_voice_1',
    licenseId: 'deepgram:aura-asteria-en:service-output-terms',
  },
};
const generatedAudioReceipt = {
  version: 'editron-generated-audio-receipt-v1' as const,
  provider: 'deepgram' as const,
  model: 'aura-asteria-en',
  licenseId: 'deepgram:aura-asteria-en:service-output-terms',
  assetId: 'dub_voice_1',
  mediaRole: 'dubbing' as const,
  generatedAt: now.toISOString(),
};
const generatedSpeechCapability = {
  language: 'en' as const,
  displayName: 'English' as const,
  provider: 'deepgram' as const,
  model: 'aura-asteria-en',
  voiceId: 'aura-asteria-en',
  fallbackUsed: false,
};
const sourceNativeAudioRights = {
  mediaRole: 'native-video' as const,
  source: 'generated' as const,
  userChoice: 'attested' as const,
  licensed: true,
  evidence: {
    kind: 'generated-provider' as const,
    sourceAssetId: 'source-video-1',
    licenseId: 'fal-ai:seedance-v1.5-pro:service-output-terms',
  },
};
const backgroundAudioRights = {
  ...sourceNativeAudioRights,
  mediaRole: 'other' as const,
};
const audioSeparationReceipt = {
  version: 'editron-audio-separation-receipt-v1' as const,
  provider: 'fal-ai' as const,
  model: 'fal-ai/demucs:mdx_extra' as const,
  operation: 'preserve-non-vocal-background' as const,
  stem: 'other' as const,
  sourceAssetId: 'source-video-1',
  derivativeAssetId: 'dub_bed_1',
  jobId: 'chat_dub_1',
  createdAt: now.toISOString(),
};
const sourceGeneratedVideoReceipt = {
  version: 'editron-generated-video-receipt-v1' as const,
  provider: 'fal-ai' as const,
  model: 'seedance-v1.5-pro',
  assetId: 'source-video-1',
  generatedAt: now.toISOString(),
  nativeAudio: {
    requestMode: 'enabled' as const,
    present: true,
    probe: 'ffmpeg-audio-stream-decode' as const,
    probedAt: now.toISOString(),
    licenseId: sourceNativeAudioRights.evidence.licenseId,
  },
};

function job(progress: ChatDubbingProgress): ChatDubbingJob {
  return {
    _id: 'chat_dub_1',
    idempotencyKey: 'idem-1',
    version: 'editron-chat-dubbing-job-v2',
    status: 'running',
    projectId: 'proj-1',
    userId: 'user-1',
    projectRevision: 'revision-1',
    overlayId: '11',
    assetId: 'source-video-1',
    targetLanguage: 'English',
    voiceId: 'aura-asteria-en',
    fps: 30,
    timelineStartFrame: 0,
    timelineEndFrame: 30,
    sourceStartFrame: 0,
    sourceEndFrame: 30,
    progress,
    failureCount: 0,
    runCount: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date('2026-07-28T00:00:00.000Z'),
  };
}

function phraseProgress() {
  return {
    index: 0,
    sourceText: 'Original line.',
    translatedText: 'Translated line.',
    timelineStartFrame: 0,
    timelineEndFrame: 30,
    sourceStartMs: 0,
    sourceEndMs: 1000,
  };
}

describe('chat dubbing generated-audio provenance', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.generateVoiceover.mockReset();
    mocks.findOne.mockReset();
    mocks.updateOne.mockReset();
    mocks.readFile.mockReset();
    mocks.rm.mockReset();
    mocks.sampleAudioClip.mockReset();
    mocks.uploadMedia.mockReset();
    mocks.falConfig.mockReset();
    mocks.falStorageUpload.mockReset();
    mocks.falSubscribe.mockReset();
    mocks.rm.mockResolvedValue(undefined);
    mocks.generateVoiceover.mockResolvedValue({
      audioBuffer: Buffer.alloc(44),
      durationMs: 1000,
      audioUrl: 'https://storage.test/dub_voice_1.wav',
      audioAssetId: 'dub_voice_1',
      gcsPath: 'editron/user-1/media/dub_voice_1.wav',
      r2Key: null,
      audioRights: dubbingRights,
      generatedAudioReceipt,
      generatedSpeechCapability,
    });
    mocks.findOne.mockResolvedValue({
      projectId: 'proj-1',
      userId: 'user-1',
      updatedAt: now,
      overlays: [{
        id: 11,
        type: 'video',
        from: 0,
        durationInFrames: 30,
        styles: { volume: 1 },
      }],
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('persists the Demucs bed as an attached derivative with inherited rights', async () => {
    vi.stubEnv('FAL_AI_API_KEY', 'test-fal-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('stem-bytes'), {
      status: 200,
    })));
    mocks.sampleAudioClip.mockResolvedValue('C:\\tmp\\sample.wav');
    mocks.readFile.mockResolvedValue(Buffer.from('source-bytes'));
    mocks.falStorageUpload.mockResolvedValue('https://fal.test/source.wav');
    mocks.falSubscribe.mockResolvedValue({
      requestId: 'fal-request-1',
      data: { other: { url: 'https://fal.test/other.wav' } },
    });
    mocks.uploadMedia.mockResolvedValue({
      signedUrl: 'https://storage.test/dub-bed.wav',
      r2Key: 'editron/user-1/media/dub-bed.wav',
      gcsPath: null,
      urlExpiresAt: new Date('2026-07-27T01:00:00.000Z'),
      size: 10,
      contentType: 'audio/wav',
    });
    mocks.findOne.mockResolvedValueOnce({
      assetId: 'source-video-1',
      userId: 'user-1',
      projectId: 'proj-1',
      type: 'video',
      source: 'generated',
      audioRights: sourceNativeAudioRights,
      generatedVideoReceipt: sourceGeneratedVideoReceipt,
    });
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );

    const result = await executeChatDubbingStep(job({
      stage: 'separate',
      phrases: [phraseProgress()],
      nextPhraseIndex: 0,
      generatedAssetIds: [],
    }));

    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    const background = result.progress.background;
    expect(background).toMatchObject({
      audioRights: backgroundAudioRights,
      audioSeparationReceipt: {
        sourceAssetId: 'source-video-1',
        derivativeAssetId: background?.assetId,
        jobId: 'chat_dub_1',
        vendorRequestId: 'fal-request-1',
      },
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: background?.assetId, userId: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          projectId: 'proj-1',
          type: 'audio',
          source: 'generated',
          parentAssetId: 'source-video-1',
          assignmentStatus: 'attached',
          audioRights: backgroundAudioRights,
          audioSeparationReceipt: background?.audioSeparationReceipt,
        }),
      }),
      { upsert: true },
    );
  });

  it('persists the TTS receipt in resumable phrase progress', async () => {
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const result = await executeChatDubbingStep(job({
      stage: 'voice',
      background: {
        assetId: 'dub_bed_1',
        url: 'https://storage.test/dub_bed_1.wav',
        audioRights: backgroundAudioRights,
        audioSeparationReceipt,
      },
      phrases: [phraseProgress()],
      nextPhraseIndex: 0,
      generatedAssetIds: ['dub_bed_1'],
    }));

    expect(mocks.generateVoiceover).toHaveBeenCalledWith(
      'Translated line.',
      'user-1',
      expect.objectContaining({
        mediaRole: 'dubbing',
        language: 'en',
        voice: 'aura-asteria-en',
      }),
    );
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.stage).toBe('commit');
    expect(result.progress.phrases?.[0]).toMatchObject({
      voiceAssetId: 'dub_voice_1',
      voiceAudioRights: dubbingRights,
      generatedAudioReceipt,
      generatedSpeechCapability,
    });
  });

  it('keeps a Hindi job Hindi through the provider boundary', async () => {
    const hindiCapability = {
      language: 'hi' as const,
      displayName: 'Hindi' as const,
      provider: 'fal-ai' as const,
      model: 'fal-ai/kokoro/hindi',
      voiceId: 'hf_alpha',
      fallbackUsed: false,
    };
    mocks.generateVoiceover.mockResolvedValueOnce({
      audioBuffer: Buffer.alloc(44),
      durationMs: 1000,
      audioUrl: 'https://storage.test/dub_voice_hi.wav',
      audioAssetId: 'dub_voice_hi',
      gcsPath: 'editron/user-1/media/dub_voice_hi.wav',
      r2Key: null,
      audioRights: dubbingRights,
      generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_hi' },
      generatedSpeechCapability: hindiCapability,
    });
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const hindiJob = {
      ...job({
        stage: 'voice',
        background: {
          assetId: 'dub_bed_1',
          url: 'https://storage.test/dub_bed_1.wav',
          audioRights: backgroundAudioRights,
          audioSeparationReceipt,
        },
        phrases: [phraseProgress()],
        nextPhraseIndex: 0,
        generatedAssetIds: ['dub_bed_1'],
      }),
      version: 'editron-chat-dubbing-job-v3' as const,
      targetLanguage: 'hi' as const,
      voiceId: 'hf_alpha',
      speechCapability: {
        language: 'hi' as const,
        displayName: 'Hindi' as const,
        provider: 'fal-ai' as const,
        model: 'fal-ai/kokoro/hindi',
        voiceId: 'hf_alpha',
      },
    };

    const result = await executeChatDubbingStep(hindiJob);

    expect(mocks.generateVoiceover).toHaveBeenCalledWith(
      'Translated line.',
      'user-1',
      expect.objectContaining({ language: 'hi', voice: 'hf_alpha', mediaRole: 'dubbing' }),
    );
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases?.[0]?.generatedSpeechCapability).toEqual(hindiCapability);
  });

  it('copies the persisted rights unchanged onto the final dubbing overlay', async () => {
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const result = await executeChatDubbingStep(job({
      stage: 'commit',
      background: {
        assetId: 'dub_bed_1',
        url: 'https://storage.test/dub_bed_1.wav',
        audioRights: backgroundAudioRights,
        audioSeparationReceipt,
      },
      phrases: [{
        ...phraseProgress(),
        voiceAssetId: 'dub_voice_1',
        voiceUrl: 'https://storage.test/dub_voice_1.wav',
        voiceDurationMs: 1000,
        playbackRate: 1,
        voiceAudioRights: dubbingRights,
        generatedAudioReceipt,
        generatedSpeechCapability,
      }],
      nextPhraseIndex: 1,
      generatedAssetIds: ['dub_bed_1', 'dub_voice_1'],
    }));

    expect(result.status).toBe('completed');
    const update = mocks.updateOne.mock.calls[0]?.[1] as {
      $set?: { overlays?: Array<Record<string, any>> };
    };
    const dubbedDialogue = update.$set?.overlays?.find(
      (overlay) => overlay.metadata?.isDubbedDialogue === true,
    );
    const preservedBackground = update.$set?.overlays?.find(
      (overlay) => overlay.metadata?.isDubbingBackgroundStem === true,
    );
    expect(dubbedDialogue?.audioRights).toEqual(dubbingRights);
    expect(preservedBackground).toMatchObject({
      audioRights: backgroundAudioRights,
      metadata: { audioSeparationReceipt },
    });
  });

  it('fails before commit when generated phrase provenance is missing', async () => {
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    await expect(executeChatDubbingStep(job({
      stage: 'commit',
      background: {
        assetId: 'dub_bed_1',
        url: 'https://storage.test/dub_bed_1.wav',
        audioRights: backgroundAudioRights,
        audioSeparationReceipt,
      },
      phrases: [{
        ...phraseProgress(),
        voiceAssetId: 'dub_voice_1',
        voiceUrl: 'https://storage.test/dub_voice_1.wav',
        voiceDurationMs: 1000,
        playbackRate: 1,
      }],
      nextPhraseIndex: 1,
      generatedAssetIds: ['dub_bed_1', 'dub_voice_1'],
    }))).rejects.toMatchObject({ code: 'incomplete-dubbing-assets' });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('fails before commit when the separated background has no rights lineage', async () => {
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    await expect(executeChatDubbingStep(job({
      stage: 'commit',
      background: {
        assetId: 'dub_bed_1',
        url: 'https://storage.test/dub_bed_1.wav',
      },
      phrases: [{
        ...phraseProgress(),
        voiceAssetId: 'dub_voice_1',
        voiceUrl: 'https://storage.test/dub_voice_1.wav',
        voiceDurationMs: 1000,
        playbackRate: 1,
        voiceAudioRights: dubbingRights,
        generatedAudioReceipt,
        generatedSpeechCapability,
      }],
      nextPhraseIndex: 1,
      generatedAssetIds: ['dub_bed_1', 'dub_voice_1'],
    }))).rejects.toMatchObject({ code: 'incomplete-dubbing-assets' });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
