import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  getUser: vi.fn(),
  getUserOauthAccessToken: vi.fn(),
  videosInsert: vi.fn(),
  setCredentials: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerkClient }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-connected-account", () => ({ default: { findOne: mocks.connectedAccountFindOne } }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn(() => ({ setCredentials: mocks.setCredentials })) },
    youtube: vi.fn(() => ({ videos: { insert: mocks.videosInsert } })),
  },
}));

import { getPublisher } from "@/lib/calos/publish/contract";
import { publishToYouTube } from "@/lib/calos/publish/youtube";

const BASE = {
  ownerUserId: "queue_owner",
  deliverableId: "d1",
  brandId: "brand_1",
  title: "Launch video",
  caption: "watch this",
  imageUrl: "https://cdn.example.com/clip.mp4",
};

function mockClerkYoutubeOwner(token = "yt_token") {
  mocks.getUser.mockResolvedValue({ externalAccounts: [{ provider: "oauth_google" }] });
  mocks.getUserOauthAccessToken.mockResolvedValue({ data: token ? [{ token }] : [] });
}

describe("publishToYouTube", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.clerkClient.mockReset().mockResolvedValue({
      users: {
        getUser: mocks.getUser,
        getUserOauthAccessToken: mocks.getUserOauthAccessToken,
      },
    });
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.connectedAccountFindOne.mockReset();
    mocks.getUser.mockReset();
    mocks.getUserOauthAccessToken.mockReset();
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

  it("uploads the card's video with the assigned owner's Clerk Google token", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mockClerkYoutubeOwner("yt_token");
    fetchMock.mockResolvedValue(new Response("VIDEO_BYTES", { status: 200 }));
    mocks.videosInsert.mockResolvedValue({ data: { id: "vid_1" } });

    const result = await publishToYouTube(BASE);

    expect(result).toEqual({ ok: true, postId: "vid_1", postUrl: "https://www.youtube.com/watch?v=vid_1" });
    expect(mocks.getUser).toHaveBeenCalledWith("owner_1");
    expect(mocks.getUserOauthAccessToken).toHaveBeenCalledWith("owner_1", "oauth_google");
    expect(mocks.setCredentials).toHaveBeenCalledWith({ access_token: "yt_token" });
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
    mocks.getUser.mockResolvedValue({ externalAccounts: [] });
    const result = await publishToYouTube(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("no longer connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails loud when Clerk returns no usable OAuth token", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mockClerkYoutubeOwner("");
    const result = await publishToYouTube(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("no usable OAuth token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a 5xx upload error as retryable", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "youtube", ownerUserId: "owner_1" });
    mockClerkYoutubeOwner("yt_token");
    fetchMock.mockResolvedValue(new Response("VIDEO_BYTES", { status: 200 }));
    mocks.videosInsert.mockRejectedValue({ response: { status: 503 }, message: "backend error" });

    const result = await publishToYouTube(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });
});