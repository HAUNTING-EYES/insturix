import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  find: vi.fn(),
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
    mocks.toArray.mockReset();
    mocks.updateOne.mockReset();
    mocks.refreshSignedUrl.mockReset();

    mocks.collection.mockReturnValue({
      find: mocks.find,
      updateOne: mocks.updateOne,
    });
    mocks.find.mockReturnValue({ toArray: mocks.toArray });
    mocks.toArray.mockResolvedValue([]);
    mocks.refreshSignedUrl.mockResolvedValue({
      url: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
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
});
