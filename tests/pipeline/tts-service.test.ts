import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadMedia: vi.fn(),
  updateOne: vi.fn(),
  collection: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
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

function audioStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(Buffer.alloc(24044, 1)));
      controller.close();
    },
  });
}

describe("generateVoiceover", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.uploadMedia.mockReset();
    mocks.updateOne.mockReset();
    mocks.collection.mockReset();
    mocks.createClient.mockReset();
    process.env.DEEPGRAM_API_KEY = "test_deepgram_key";

    mocks.collection.mockReturnValue({ updateOne: mocks.updateOne });
    mocks.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, upsertedCount: 1 });
    mocks.createClient.mockReturnValue({
      speak: {
        request: vi.fn(async () => ({
          getStream: async () => audioStream(),
        })),
      },
    });
    mocks.uploadMedia.mockImplementation(async (_buffer, userId, filename, contentType, options) => ({
      assetId: options.customAssetId,
      signedUrl: `https://storage.googleapis.com/${userId}/${filename}?X-Goog-Signature=test`,
      gcsPath: `editron/${userId}/media/${filename}`,
      r2Key: null,
      urlExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      size: 24044,
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
