import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  userFindOne: vi.fn(),
  uploaderxFindOne: vi.fn(),
  videosInsert: vi.fn(),
  setCredentials: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-connected-account", () => ({ default: { findOne: mocks.connectedAccountFindOne } }));
vi.mock("@/schemas/user", () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock("@/schemas/uploaderx", () => ({ default: { findOne: mocks.uploaderxFindOne } }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn(() => ({ setCredentials: mocks.setCredentials })) },
    youtube: vi.fn(() => ({ videos: { insert: mocks.videosInsert } })),
  },
}));

import { getPublisher } from "@/lib/calos/publish/contract";
import { publishToYouTube } from "@/lib/calos/publish/youtube";

function lean<T>(record: T) {
  return { select: vi.fn(() => ({ lean: vi.fn(async () => record) })) };
}

const BASE = {
  ownerUserId: "queue_owner",
  deliverableId: "d1",
  brandId: "brand_1",
  title: "Launch video",
  caption: "watch this",
  imageUrl: "https://cdn.example.com/clip.mp4",
};

describe("publishToYouTube", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("YOUTUBE_CLIENT_ID", "cid");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "csec");
    vi.stubEnv("YOUTUBE_REDIRECT_URI", "https://app/cb");
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.connectedAccountFindOne.mockReset();
    mocks.userFindOne.mockReset();
    mocks.uploaderxFindOne.mockReset();
    mocks.videosInsert.mockReset();
    mocks.setCredentials.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is registered as the CalOS YouTube publisher", () => {
    expect(getPublisher("youtube")).toBe(publishToYouTube);
  });

  it("uploads the card's video to the assigned channel", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mocks.userFindOne.mockReturnValue(lean({ email: "creator@acme.com" }));
    mocks.uploaderxFindOne.mockReturnValue(lean({ youtubeTokens: { access_token: "yt", refresh_token: "r" } }));
    fetchMock.mockResolvedValue(new Response("VIDEO_BYTES", { status: 200 }));
    mocks.videosInsert.mockResolvedValue({ data: { id: "vid_1" } });

    const result = await publishToYouTube(BASE);

    expect(result).toEqual({ ok: true, postId: "vid_1", postUrl: "https://www.youtube.com/watch?v=vid_1" });
    expect(mocks.uploaderxFindOne).toHaveBeenCalledWith({ email: "creator@acme.com" });
    const insertArg = mocks.videosInsert.mock.calls[0][0];
    expect(insertArg.requestBody.snippet.title).toBe("Launch video");
    expect(insertArg.requestBody.status.privacyStatus).toBe("public");
  });

  it("fails loud (no DB hit) when the card has no video", async () => {
    const result = await publishToYouTube({ ...BASE, imageUrl: undefined });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("requires a video");
    expect(mocks.connectedAccountFindOne).not.toHaveBeenCalled();
  });

  it("fails loud when no channel is assigned to the brand", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);
    const result = await publishToYouTube(BASE);
    expect(result).toEqual({ ok: false, error: "No YouTube channel assigned for this brand", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails loud when the channel owner is no longer connected", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mocks.userFindOne.mockReturnValue(lean({ email: "creator@acme.com" }));
    mocks.uploaderxFindOne.mockReturnValue(lean({ youtubeTokens: null }));
    const result = await publishToYouTube(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("no longer connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a 5xx upload error as retryable", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mocks.userFindOne.mockReturnValue(lean({ email: "creator@acme.com" }));
    mocks.uploaderxFindOne.mockReturnValue(lean({ youtubeTokens: { access_token: "yt" } }));
    fetchMock.mockResolvedValue(new Response("VIDEO_BYTES", { status: 200 }));
    mocks.videosInsert.mockRejectedValue({ response: { status: 503 }, message: "backend error" });

    const result = await publishToYouTube(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });
});
