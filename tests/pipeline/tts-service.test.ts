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
        }),
        $setOnInsert: expect.objectContaining({
          assetId: result.audioAssetId,
          userId: "user_1",
          type: "audio",
          filename: `${result.audioAssetId}.wav`,
          source: "user-upload",
          contentType: "audio/wav",
        }),
      }),
      { upsert: true },
    );
  });
});
