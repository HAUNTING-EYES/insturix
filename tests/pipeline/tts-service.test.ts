import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  falSubscribe: vi.fn(),
  uploadMedia: vi.fn(),
  updateOne: vi.fn(),
  collection: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: mocks.falSubscribe,
  },
}));

vi.mock("@/lib/editron/services/upload-service", () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { MEDIA_ASSETS: "media_assets" },
  getDatabase: vi.fn(async () => ({
    collection: mocks.collection,
  })),
}));

vi.mock("@deepgram/sdk", () => ({
  createClient: mocks.createClient,
}));

function createPcmWav(input: {
  durationMs?: number;
  leadingSilenceMs?: number;
  trailingSilenceMs?: number;
  metadataBytes?: number;
} = {}): Buffer {
  const sampleRate = 24_000;
  const durationMs = input.durationMs ?? 500;
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const leadingSamples = Math.round(((input.leadingSilenceMs ?? 0) / 1000) * sampleRate);
  const trailingSamples = Math.round(((input.trailingSilenceMs ?? 0) / 1000) * sampleRate);
  const pcm = Buffer.alloc(samples * 2);
  const audibleEnd = Math.max(leadingSamples, samples - trailingSamples);
  for (let sample = leadingSamples; sample < audibleEnd; sample += 1) {
    pcm.writeInt16LE(2_000, sample * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  const metadataSize = input.metadataBytes ?? 0;
  const metadata = metadataSize > 0
    ? Buffer.concat([
        Buffer.from("C2PA", "ascii"),
        uint32le(metadataSize),
        Buffer.alloc(metadataSize, 7),
        ...(metadataSize % 2 ? [Buffer.alloc(1)] : []),
      ])
    : Buffer.alloc(0);
  const wav = Buffer.concat([header, pcm, metadata]);
  wav.writeUInt32LE(wav.length - 8, 4);
  return wav;
}

function uint32le(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function wavResponse(buffer: Buffer): Response {
  return new Response(Uint8Array.from(buffer));
}

function audioStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(createPcmWav()));
      controller.close();
    },
  });
}

describe("generateVoiceover", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.uploadMedia.mockReset();
    mocks.falSubscribe.mockReset();
    mocks.updateOne.mockReset();
    mocks.collection.mockReset();
    mocks.createClient.mockReset();
    process.env.DEEPGRAM_API_KEY = "test_deepgram_key";
    process.env.FAL_AI_API_KEY = "test_fal_key";

    mocks.collection.mockReturnValue({ updateOne: mocks.updateOne });
    mocks.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, upsertedCount: 1 });
    mocks.createClient.mockReturnValue({
      speak: {
        request: vi.fn(async () => ({
          getStream: async () => audioStream(),
        })),
      },
    });
    mocks.uploadMedia.mockImplementation(async (buffer, userId, filename, contentType, options) => ({
      assetId: options.customAssetId,
      signedUrl: `https://storage.googleapis.com/${userId}/${filename}?X-Goog-Signature=test`,
      gcsPath: `editron/${userId}/media/${filename}`,
      r2Key: null,
      urlExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      size: buffer.length,
      contentType,
    }));
  });

  it("persists generated voiceover uploads to media_assets for render URL resolution", async () => {
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");

    const result = await generateVoiceover("Launch-ready narration.", "user_1", {
      voice: "aura-asteria-en",
    });

    expect(result.audioAssetId).toMatch(/^voiceover_/);
    expect(result.audioRights).toEqual({
      mediaRole: "voiceover",
      source: "generated",
      userChoice: "attested",
      licensed: true,
      evidence: {
        kind: "generated-provider",
        sourceAssetId: result.audioAssetId,
        licenseId: "deepgram:aura-asteria-en:service-output-terms",
      },
    });
    expect(result.generatedAudioReceipt).toEqual({
      version: "editron-generated-audio-receipt-v1",
      provider: "deepgram",
      model: "aura-asteria-en",
      licenseId: "deepgram:aura-asteria-en:service-output-terms",
      assetId: result.audioAssetId,
      mediaRole: "voiceover",
      synthesisSpeed: 1,
      normalization: {
        version: "editron-speech-wav-normalization-v1",
        sourceDurationMs: 500,
        outputDurationMs: 500,
        leadingTrimMs: 0,
        trailingTrimMs: 0,
        silenceThresholdDbfs: -50,
        preservedPaddingMs: 40,
        removedNonAudioBytes: 0,
      },
      generatedAt: expect.any(String),
    });
    expect(mocks.uploadMedia).toHaveBeenCalledWith(
      expect.any(Buffer),
      "user_1",
      `${result.audioAssetId}.wav`,
      "audio/wav",
      { customAssetId: result.audioAssetId },
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: result.audioAssetId },
      expect.objectContaining({
        $set: expect.objectContaining({
          cachedUrl: result.audioUrl,
          gcsPath: result.gcsPath,
          r2Key: null,
          durationMs: result.durationMs,
          audioDurationMs: result.durationMs,
          source: "generated",
          audioRights: result.audioRights,
          generatedAudioReceipt: result.generatedAudioReceipt,
          generatedSpeechCapability: {
            language: "en",
            displayName: "English",
            provider: "deepgram",
            model: "aura-asteria-en",
            voiceId: "aura-asteria-en",
            fallbackUsed: false,
          },
        }),
        $setOnInsert: expect.objectContaining({
          assetId: result.audioAssetId,
          userId: "user_1",
          type: "audio",
          filename: `${result.audioAssetId}.wav`,
          contentType: "audio/wav",
        }),
      }),
      { upsert: true },
    );
  });

  it("selects the Hindi speech model and persists the actual language capability", async () => {
    mocks.falSubscribe.mockResolvedValue({
      data: { audio: { url: "https://fal.test/hindi.wav" } },
    });
    vi.stubGlobal("fetch", vi.fn(async () => wavResponse(createPcmWav())));
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");

    const result = await generateVoiceover("Yeh Hindi dubbing hai.", "user_1", {
      language: "Hindi",
      voice: "kokoro-hindi-alpha",
      mediaRole: "dubbing",
    });

    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      "fal-ai/kokoro/hindi",
      expect.objectContaining({
        input: expect.objectContaining({ voice: "hf_alpha" }),
      }),
    );
    expect(result.generatedSpeechCapability).toEqual({
      language: "hi",
      displayName: "Hindi",
      provider: "fal-ai",
      model: "fal-ai/kokoro/hindi",
      voiceId: "hf_alpha",
      fallbackUsed: false,
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: result.audioAssetId },
      expect.objectContaining({
        $set: expect.objectContaining({
          generatedSpeechCapability: result.generatedSpeechCapability,
        }),
      }),
      { upsert: true },
    );
  });

  it("uses provider-native prosody without adding editorial pauses for source-aligned dubbing", async () => {
    mocks.falSubscribe.mockResolvedValue({
      data: { audio: { url: "https://fal.test/hindi.wav" } },
    });
    vi.stubGlobal("fetch", vi.fn(async () => wavResponse(createPcmWav({
      metadataBytes: 13_003,
    }))));
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");
    const text = "यह तथ्य रखिए, फिर निष्कर्ष दीजिए।";

    const result = await generateVoiceover(text, "user_1", {
      language: "Hindi",
      voice: "kokoro-hindi-alpha",
      mediaRole: "dubbing",
      pausePolicy: "provider-native",
      speechRate: 1.29,
    });

    expect(mocks.falSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.falSubscribe).toHaveBeenCalledWith(
      "fal-ai/kokoro/hindi",
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: text,
          voice: "hf_alpha",
          speed: 1.29,
        }),
      }),
    );
    expect(result.durationMs).toBe(500);
    expect(result.synthesisSpeed).toBe(1.29);
    expect(result.generatedAudioReceipt.synthesisSpeed).toBe(1.29);
    expect(result.generatedAudioReceipt.normalization).toMatchObject({
      sourceDurationMs: 500,
      outputDurationMs: 500,
      removedNonAudioBytes: 13_012,
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: result.audioAssetId },
      expect.objectContaining({
        $set: expect.objectContaining({ synthesisSpeed: 1.29 }),
      }),
      { upsert: true },
    );
  });

  it("measures only WAV data and trims provider boundary silence for dubbing", async () => {
    mocks.falSubscribe.mockResolvedValue({
      data: { audio: { url: "https://fal.test/hindi.wav" } },
    });
    vi.stubGlobal("fetch", vi.fn(async () => wavResponse(createPcmWav({
      durationMs: 1_550,
      leadingSilenceMs: 330,
      trailingSilenceMs: 200,
      metadataBytes: 13_003,
    }))));
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");

    const result = await generateVoiceover("Fast aligned Hindi phrase.", "user_1", {
      language: "Hindi",
      voice: "kokoro-hindi-omega",
      mediaRole: "dubbing",
      pausePolicy: "provider-native",
      speechRate: 5,
    });

    expect(result.durationMs).toBe(1_100);
    expect(result.audioBuffer.length).toBe(52_844);
    expect(result.generatedAudioReceipt.normalization).toEqual({
      version: "editron-speech-wav-normalization-v1",
      sourceDurationMs: 1_550,
      outputDurationMs: 1_100,
      leadingTrimMs: 290,
      trailingTrimMs: 160,
      silenceThresholdDbfs: -50,
      preservedPaddingMs: 40,
      removedNonAudioBytes: 13_012,
    });
  });

  it("fails loudly when a provider cannot honor an explicit speech rate", async () => {
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");

    await expect(generateVoiceover("Rate-controlled speech.", "user_1", {
      voice: "aura-asteria-en",
      speechRate: 1.2,
    })).rejects.toThrow("provider-native-speech-rate-unsupported:deepgram");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
  });

  it("never converts a failed Hindi synthesis request into English fallback speech", async () => {
    mocks.falSubscribe.mockRejectedValue(new Error("Hindi provider unavailable"));
    const { generateVoiceover } = await import("@/lib/pipeline/tts-service");

    await expect(generateVoiceover("Hindi dialogue.", "user_1", {
      language: "hi",
      mediaRole: "dubbing",
    })).rejects.toThrow("Hindi provider unavailable");

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("carries generated narration provenance through storyboard storage and finalize", () => {
    const voiceoverRoute = readFileSync(
      new URL(
        "../../app/api/services/pipeline/storyboard/[id]/voiceover/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const finalizeRoute = readFileSync(
      new URL(
        "../../app/api/services/pipeline/storyboard/[id]/finalize/route.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(voiceoverRoute).toContain("audioRights: result.audioRights");
    expect(voiceoverRoute).toContain(
      "generatedAudioReceipt: result.generatedAudioReceipt",
    );
    expect(finalizeRoute).toContain(
      "audioRights: scene.voiceover.audioRights",
    );
    expect(finalizeRoute).toContain(
      "generatedAudioReceipt: scene.voiceover.generatedAudioReceipt",
    );
  });
});
