import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatDubbingJob, ChatDubbingProgress } from '@/lib/editron/services/chat-dubbing-job';

const mocks = vi.hoisted(() => ({
  generateVoiceover: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/pipeline/tts-service', () => ({
  generateVoiceover: mocks.generateVoiceover,
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
  sampleAudioClip: vi.fn(),
}));

vi.mock('@/lib/editron/services/media/transcription-service', () => ({
  getTranscription: vi.fn(),
}));

vi.mock('@/lib/editron/services/narrative-beat-producer', () => ({
  segmentNarrativeBeats: vi.fn(),
}));

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: vi.fn(),
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
    mocks.generateVoiceover.mockResolvedValue({
      audioBuffer: Buffer.alloc(44),
      durationMs: 1000,
      audioUrl: 'https://storage.test/dub_voice_1.wav',
      audioAssetId: 'dub_voice_1',
      gcsPath: 'editron/user-1/media/dub_voice_1.wav',
      r2Key: null,
      audioRights: dubbingRights,
      generatedAudioReceipt,
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

  it('persists the TTS receipt in resumable phrase progress', async () => {
    const { executeChatDubbingStep } = await import(
      '@/lib/editron/services/chat-dubbing-provider'
    );
    const result = await executeChatDubbingStep(job({
      stage: 'voice',
      background: {
        assetId: 'dub_bed_1',
        url: 'https://storage.test/dub_bed_1.wav',
      },
      phrases: [phraseProgress()],
      nextPhraseIndex: 0,
      generatedAssetIds: ['dub_bed_1'],
    }));

    expect(mocks.generateVoiceover).toHaveBeenCalledWith(
      'Translated line.',
      'user-1',
      expect.objectContaining({ mediaRole: 'dubbing' }),
    );
    expect(result.status).toBe('continue');
    if (result.status !== 'continue') throw new Error('Expected a continuing dubbing job.');
    expect(result.progress.stage).toBe('commit');
    expect(result.progress.phrases?.[0]).toMatchObject({
      voiceAssetId: 'dub_voice_1',
      voiceAudioRights: dubbingRights,
      generatedAudioReceipt,
    });
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
      },
      phrases: [{
        ...phraseProgress(),
        voiceAssetId: 'dub_voice_1',
        voiceUrl: 'https://storage.test/dub_voice_1.wav',
        voiceDurationMs: 1000,
        playbackRate: 1,
        voiceAudioRights: dubbingRights,
        generatedAudioReceipt,
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
    expect(dubbedDialogue?.audioRights).toEqual(dubbingRights);
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
});
