import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatDubbingJob,
  ChatDubbingProgress,
  DubbingFidelityCheck,
  DubbingFidelityState,
} from '@/lib/editron/services/chat-dubbing-job';

const mocks = vi.hoisted(() => ({
  generateVoiceover: vi.fn(),
  generateContent: vi.fn(),
  getTranscription: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findToArray: vi.fn(),
  updateOne: vi.fn(),
  deleteMany: vi.fn(),
  deleteFromR2: vi.fn(),
  deleteFromGCS: vi.fn(),
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
  KOKORO_MAX_SPEECH_RATE: 5,
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
      find: mocks.find,
      updateOne: mocks.updateOne,
      deleteMany: mocks.deleteMany,
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
  getTranscription: mocks.getTranscription,
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/editron/services/r2-service', () => ({
  deleteFromR2: mocks.deleteFromR2,
}));

vi.mock('@/lib/editron/services/gcs-service', () => ({
  deleteFromGCS: mocks.deleteFromGCS,
}));

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getGenAI: vi.fn(async () => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: mocks.generateContent,
    })),
  })),
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
  synthesisSpeed: 1,
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

function faithfulFidelityChecks(
  overrides: Partial<Record<DubbingFidelityCheck, DubbingFidelityState>> = {},
): Record<DubbingFidelityCheck, DubbingFidelityState> {
  return {
    coreClaims: 'preserved',
    entities: 'preserved',
    quantities: 'preserved',
    negation: 'preserved',
    comparisons: 'preserved',
    relationships: 'preserved',
    certainty: 'preserved',
    speakerIntent: 'preserved',
    targetLanguage: 'preserved',
    ...overrides,
  };
}

describe('chat dubbing generated-audio provenance', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.generateVoiceover.mockReset();
    mocks.generateContent.mockReset();
    mocks.getTranscription.mockReset();
    mocks.findOne.mockReset();
    mocks.find.mockReset();
    mocks.findToArray.mockReset();
    mocks.updateOne.mockReset();
    mocks.deleteMany.mockReset();
    mocks.deleteFromR2.mockReset();
    mocks.deleteFromGCS.mockReset();
    mocks.readFile.mockReset();
    mocks.rm.mockReset();
    mocks.sampleAudioClip.mockReset();
    mocks.uploadMedia.mockReset();
    mocks.falConfig.mockReset();
    mocks.falStorageUpload.mockReset();
    mocks.falSubscribe.mockReset();
    mocks.rm.mockResolvedValue(undefined);
    mocks.findToArray.mockResolvedValue([]);
    mocks.find.mockReturnValue({ toArray: mocks.findToArray });
    mocks.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.deleteFromGCS.mockResolvedValue(undefined);
    mocks.generateVoiceover.mockResolvedValue({
      audioBuffer: Buffer.alloc(44),
      durationMs: 1000,
      synthesisSpeed: 1,
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
        pausePolicy: 'provider-native',
      }),
    );
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.stage).toBe('commit');
    expect(result.progress.phrases?.[0]).toMatchObject({
      voiceAssetId: 'dub_voice_1',
      playbackRate: 1,
      voiceAudioRights: dubbingRights,
      generatedAudioReceipt,
      generatedSpeechCapability,
    });
  });

  it('preserves short utterances and assigns each phrase the real pause before the next onset', async () => {
    mocks.getTranscription.mockResolvedValue({
      text: 'First thought. Second thought.',
      language: 'en',
      words: [
        { word: 'First', startMs: 0, endMs: 200 },
        { word: 'thought.', startMs: 220, endMs: 500 },
        { word: 'Second', startMs: 1500, endMs: 1700 },
        { word: 'thought.', startMs: 1720, endMs: 2000 },
      ],
      segments: [],
    });
    mocks.generateContent.mockImplementation(async (prompt: string) => ({
      response: {
        text: () => JSON.stringify(
          prompt.startsWith('Judge semantic fidelity')
            ? {
              results: [
                { id: 0, checks: faithfulFidelityChecks(), acceptableCompression: [] },
                { id: 1, checks: faithfulFidelityChecks(), acceptableCompression: [] },
              ],
            }
            : {
              phrases: [
                { id: 0, text: 'First translation.' },
                { id: 1, text: 'Second translation.' },
              ],
            },
        ),
      },
    }));
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const result = await executeChatDubbingStep({
      ...job({ stage: 'prepare' }),
      timelineEndFrame: 90,
      sourceEndFrame: 90,
    });

    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases).toEqual([
      expect.objectContaining({
        sourceText: 'First thought.',
        timelineStartFrame: 0,
        timelineEndFrame: 15,
        deliveryEndFrame: 45,
        translatedText: 'First translation.',
        translationFidelity: expect.objectContaining({ outcome: 'faithful', issueCodes: [] }),
      }),
      expect.objectContaining({
        sourceText: 'Second thought.',
        timelineStartFrame: 45,
        timelineEndFrame: 60,
        deliveryEndFrame: 90,
        translatedText: 'Second translation.',
        translationFidelity: expect.objectContaining({ outcome: 'faithful', issueCodes: [] }),
      }),
    ]);
    expect(mocks.generateContent.mock.calls[0]?.[0]).toContain('This first pass owns meaning, not timing');
    expect(mocks.generateContent.mock.calls[0]?.[0]).not.toContain('availableDurationMs');
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it('keeps naturally short speech at 1x instead of slowing it to fill silence', async () => {
    mocks.generateVoiceover.mockResolvedValueOnce({
      audioBuffer: Buffer.alloc(44),
      durationMs: 600,
      audioUrl: 'https://storage.test/dub_voice_short.wav',
      audioAssetId: 'dub_voice_short',
      gcsPath: 'editron/user-1/media/dub_voice_short.wav',
      r2Key: null,
      audioRights: dubbingRights,
      generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_short' },
      generatedSpeechCapability,
    });
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

    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases?.[0]).toMatchObject({
      voiceDurationMs: 600,
      playbackRate: 1,
      fitAttempts: [expect.objectContaining({
        requiredPlaybackRate: 0.6,
        outcome: 'accepted',
      })],
    });
  });

  it('uses measured TTS duration to rephrase an overlong translation before accepting it', async () => {
    const hindiCapability = {
      language: 'hi' as const,
      displayName: 'Hindi' as const,
      provider: 'fal-ai' as const,
      model: 'fal-ai/kokoro/hindi',
      voiceId: 'hf_alpha',
      fallbackUsed: false,
    };
    mocks.generateVoiceover
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 1630,
        synthesisSpeed: 1,
        audioUrl: 'https://storage.test/dub_voice_long.wav',
        audioAssetId: 'dub_voice_long',
        gcsPath: 'editron/user-1/media/dub_voice_long.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_long' },
        generatedSpeechCapability: hindiCapability,
      })
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 900,
        synthesisSpeed: 1,
        audioUrl: 'https://storage.test/dub_voice_fitted.wav',
        audioAssetId: 'dub_voice_fitted',
        gcsPath: 'editron/user-1/media/dub_voice_fitted.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_fitted' },
        generatedSpeechCapability: hindiCapability,
      });
    mocks.generateContent.mockImplementation(async (prompt: string) => ({
      response: {
        text: () => JSON.stringify(
          prompt.startsWith('Judge semantic fidelity')
            ? {
              results: [{
                id: 0,
                checks: faithfulFidelityChecks({
                  entities: 'not-applicable',
                  quantities: 'not-applicable',
                  negation: 'not-applicable',
                  comparisons: 'not-applicable',
                  relationships: 'not-applicable',
                }),
                acceptableCompression: ['removed-disfluency', 'removed-repetition'],
              }],
            }
            : { text: 'Short Hindi line.' },
        ),
      },
    }));
    mocks.findToArray.mockResolvedValue([{ assetId: 'dub_voice_long' }]);
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const result = await executeChatDubbingStep({
      ...job({
        stage: 'voice',
        background: {
          assetId: 'dub_bed_1',
          url: 'https://storage.test/dub_bed_1.wav',
          audioRights: backgroundAudioRights,
          audioSeparationReceipt,
        },
        phrases: [{
          ...phraseProgress(),
          sourceText: 'Now my, my advice is this is the best investment.',
          translatedText: 'Verbose Hindi line.',
          translationFidelity: {
            version: 'editron-dubbing-translation-fidelity-v1',
            outcome: 'faithful',
            checks: faithfulFidelityChecks(),
            issueCodes: [],
            acceptableCompression: ['removed-disfluency', 'removed-repetition'],
            judgeModel: 'gemini-2.5-flash',
          },
          deliveryEndFrame: 30,
        }],
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
    });

    expect(mocks.generateVoiceover).toHaveBeenNthCalledWith(
      1,
      'Verbose Hindi line.',
      'user-1',
      expect.objectContaining({ language: 'hi', voice: 'hf_alpha', pausePolicy: 'provider-native' }),
    );
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(mocks.generateContent.mock.calls[1]?.[0]).toContain('Do not penalize removing stutters');
    expect(mocks.generateVoiceover).toHaveBeenNthCalledWith(
      2,
      'Short Hindi line.',
      'user-1',
      expect.objectContaining({ language: 'hi', voice: 'hf_alpha', pausePolicy: 'provider-native' }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: { $in: ['dub_voice_long'] },
    });
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases?.[0]).toMatchObject({
      translatedText: 'Short Hindi line.',
      translationRevision: 1,
      voiceAssetId: 'dub_voice_fitted',
      playbackRate: 1,
      fitMode: 'semantic-compression',
      translationFidelity: expect.objectContaining({
        outcome: 'faithful',
        issueCodes: [],
        acceptableCompression: ['removed-disfluency', 'removed-repetition'],
      }),
      fitAttempts: [
        expect.objectContaining({ requiredPlaybackRate: 1.63, outcome: 'rephrase' }),
        expect.objectContaining({ requiredPlaybackRate: 0.9, outcome: 'accepted' }),
      ],
    });
  });

  it('keeps the faithful line and uses provider-native rate when a shorter rewrite drops a core claim', async () => {
    const hindiCapability = {
      language: 'hi' as const,
      displayName: 'Hindi',
      provider: 'fal-ai' as const,
      model: 'fal-ai/kokoro/hindi',
      voiceId: 'hf_alpha',
      fallbackUsed: false,
    };
    mocks.generateVoiceover
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 1630,
        synthesisSpeed: 1,
        audioUrl: 'https://storage.test/dub_voice_long.wav',
        audioAssetId: 'dub_voice_long',
        gcsPath: 'editron/user-1/media/dub_voice_long.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_long' },
        generatedSpeechCapability: hindiCapability,
      })
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 980,
        synthesisSpeed: 1.63,
        audioUrl: 'https://storage.test/dub_voice_native_rate.wav',
        audioAssetId: 'dub_voice_native_rate',
        gcsPath: 'editron/user-1/media/dub_voice_native_rate.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: {
          ...generatedAudioReceipt,
          assetId: 'dub_voice_native_rate',
          synthesisSpeed: 1.63,
        },
        generatedSpeechCapability: hindiCapability,
      });
    mocks.generateContent.mockImplementation(async (prompt: string) => ({
      response: {
        text: () => JSON.stringify(
          prompt.startsWith('Judge semantic fidelity')
            ? {
              results: [{
                id: 0,
                checks: faithfulFidelityChecks({ coreClaims: 'changed' }),
                acceptableCompression: ['condensed-syntax'],
              }],
            }
            : { text: 'An incomplete shorter line.' },
        ),
      },
    }));
    mocks.findToArray.mockResolvedValue([{ assetId: 'dub_voice_long' }]);
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );

    const result = await executeChatDubbingStep({
      ...job({
        stage: 'voice',
        background: {
          assetId: 'dub_bed_1',
          url: 'https://storage.test/dub_bed_1.wav',
          audioRights: backgroundAudioRights,
          audioSeparationReceipt,
        },
        phrases: [{
          ...phraseProgress(),
          sourceText: 'Silver is the best investment in the world today.',
          translatedText: 'A verbose complete translation.',
          translationFidelity: {
            version: 'editron-dubbing-translation-fidelity-v1',
            outcome: 'faithful',
            checks: faithfulFidelityChecks(),
            issueCodes: [],
            acceptableCompression: ['condensed-syntax'],
            judgeModel: 'gemini-2.5-flash',
          },
          deliveryEndFrame: 30,
        }],
        nextPhraseIndex: 0,
        generatedAssetIds: ['dub_bed_1'],
      }),
      version: 'editron-chat-dubbing-job-v3' as const,
      targetLanguage: 'hi' as const,
      voiceId: 'hf_alpha',
      speechCapability: {
        language: 'hi' as const,
        displayName: 'Hindi',
        provider: 'fal-ai' as const,
        model: 'fal-ai/kokoro/hindi',
        voiceId: 'hf_alpha',
      },
    });

    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases?.[0]).toMatchObject({
      translatedText: 'A verbose complete translation.',
      translationRevision: 0,
      voiceAssetId: 'dub_voice_native_rate',
      synthesisSpeed: 1.63,
      playbackRate: 1,
      fitMode: 'provider-native-rate',
    });
    expect(mocks.generateVoiceover).toHaveBeenNthCalledWith(
      2,
      'A verbose complete translation.',
      'user-1',
      expect.objectContaining({ speechRate: 1.63 }),
    );
    expect(mocks.generateContent).toHaveBeenCalledTimes(6);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: { $in: ['dub_voice_long'] },
    });
  });

  it('fits an already concise Hindi line with measured provider-native speech rate', async () => {
    const hindiCapability = {
      language: 'hi' as const,
      displayName: 'Hindi' as const,
      provider: 'fal-ai' as const,
      model: 'fal-ai/kokoro/hindi',
      voiceId: 'hf_alpha',
      fallbackUsed: false,
    };
    mocks.generateVoiceover
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 1290,
        synthesisSpeed: 1,
        audioUrl: 'https://storage.test/dub_voice_probe.wav',
        audioAssetId: 'dub_voice_probe',
        gcsPath: 'editron/user-1/media/dub_voice_probe.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: { ...generatedAudioReceipt, assetId: 'dub_voice_probe' },
        generatedSpeechCapability: hindiCapability,
      })
      .mockResolvedValueOnce({
        audioBuffer: Buffer.alloc(44),
        durationMs: 980,
        synthesisSpeed: 1.29,
        audioUrl: 'https://storage.test/dub_voice_rate_fit.wav',
        audioAssetId: 'dub_voice_rate_fit',
        gcsPath: 'editron/user-1/media/dub_voice_rate_fit.wav',
        r2Key: null,
        audioRights: dubbingRights,
        generatedAudioReceipt: {
          ...generatedAudioReceipt,
          assetId: 'dub_voice_rate_fit',
          synthesisSpeed: 1.29,
        },
        generatedSpeechCapability: hindiCapability,
      });
    mocks.findToArray.mockResolvedValue([{ assetId: 'dub_voice_probe' }]);
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );

    const result = await executeChatDubbingStep({
      ...job({
        stage: 'voice',
        background: {
          assetId: 'dub_bed_1',
          url: 'https://storage.test/dub_bed_1.wav',
          audioRights: backgroundAudioRights,
          audioSeparationReceipt,
        },
        phrases: [{
          ...phraseProgress(),
          translatedText: 'Faithful concise Hindi line.',
          translationFidelity: {
            version: 'editron-dubbing-translation-fidelity-v1',
            outcome: 'faithful',
            checks: faithfulFidelityChecks(),
            issueCodes: [],
            acceptableCompression: [],
            judgeModel: 'gemini-2.5-flash',
          },
          deliveryEndFrame: 30,
        }],
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
    });

    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.generateVoiceover).toHaveBeenNthCalledWith(
      2,
      'Faithful concise Hindi line.',
      'user-1',
      expect.objectContaining({
        language: 'hi',
        pausePolicy: 'provider-native',
        speechRate: 1.29,
      }),
    );
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.phrases?.[0]).toMatchObject({
      translatedText: 'Faithful concise Hindi line.',
      voiceAssetId: 'dub_voice_rate_fit',
      voiceDurationMs: 980,
      synthesisSpeed: 1.29,
      playbackRate: 1,
      fitMode: 'provider-native-rate',
      fitAttempts: [
        expect.objectContaining({
          requiredPlaybackRate: 1.29,
          synthesisSpeed: 1,
          outcome: 'rate-adjustment',
        }),
        expect.objectContaining({
          requiredPlaybackRate: 0.98,
          synthesisSpeed: 1.29,
          outcome: 'accepted',
        }),
      ],
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
      expect.objectContaining({
        language: 'hi',
        voice: 'hf_alpha',
        mediaRole: 'dubbing',
        pausePolicy: 'provider-native',
      }),
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
