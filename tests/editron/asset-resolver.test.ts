import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  toArray: vi.fn(),
  updateOne: vi.fn(),
  refreshSignedUrl: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { MEDIA_ASSETS: "media_assets" },
  getDatabase: vi.fn(async () => ({
    collection: mocks.collection,
  })),
}));

vi.mock("@/lib/editron/services/gcs-service", () => ({
  refreshSignedUrl: mocks.refreshSignedUrl,
}));

describe("assetResolver", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.collection.mockReset();
    mocks.find.mockReset();
    mocks.findOne.mockReset();
    mocks.toArray.mockReset();
    mocks.updateOne.mockReset();
    mocks.refreshSignedUrl.mockReset();

    mocks.collection.mockReturnValue({
      find: mocks.find,
      findOne: mocks.findOne,
      updateOne: mocks.updateOne,
    });
    mocks.find.mockReturnValue({ toArray: mocks.toArray });
    mocks.toArray.mockResolvedValue([]);
    mocks.refreshSignedUrl.mockResolvedValue({
      url: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rehydrates missing generated voiceover asset rows from overlay metadata gcsPath", async () => {
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([
      {
        id: 7,
        type: "sound",
        assetId: "voiceover_missing",
        src: "",
        content: "VO ready: this placeholder is not a playable URL",
        metadata: {
          gcsPath: "editron/user_1/media/voiceover_missing.wav",
        },
      } as never,
    ]);

    expect(mocks.refreshSignedUrl).toHaveBeenCalledWith("editron/user_1/media/voiceover_missing.wav");
    expect(resolved).toMatchObject({
      src: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
      content: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
    });
  });

  it("resolves logical asset aliases through their persisted physical R2 key", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.toArray.mockResolvedValue([{
      assetId: "battle_fixture_asset",
      r2Key: "upload_physical_source",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    }]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([{
      id: 1,
      type: "video",
      assetId: "battle_fixture_asset",
      from: 0,
      durationInFrames: 30,
      src: "",
    } as never]);

    expect(resolved).toMatchObject({
      assetId: "battle_fixture_asset",
      src: "https://cdn.example.test/asset/upload_physical_source",
      content: "https://cdn.example.test/asset/upload_physical_source",
    });
  });

  it("uses the persisted physical R2 key for direct backend asset resolution", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.findOne.mockResolvedValue({
      assetId: "battle_fixture_asset",
      userId: "user_1",
      r2Key: "upload_physical_source",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    });
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const resolved = await assetResolver.resolveAssetUrl("battle_fixture_asset", "user_1");

    expect(mocks.findOne).toHaveBeenCalledWith({
      assetId: "battle_fixture_asset",
      userId: "user_1",
    });
    expect(resolved).toBe("https://cdn.example.test/asset/upload_physical_source");
  });

  it("keeps legacy asset-id addressing when no physical R2 key was persisted", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.toArray.mockResolvedValue([{
      assetId: "upload_legacy",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    }]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([{
      id: 2,
      type: "video",
      assetId: "upload_legacy",
      from: 0,
      durationInFrames: 30,
      src: "",
    } as never]);

    expect(resolved).toMatchObject({
      src: "https://cdn.example.test/asset/upload_legacy",
    });
  });
});
