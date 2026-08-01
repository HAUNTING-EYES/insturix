import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  connectToDatabase: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  calosScope: vi.fn(),
  queueFind: vi.fn(),
  queueFindOne: vi.fn(),
  queueFindOneAndUpdate: vi.fn(),
  connectedAccountFind: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));
vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));
vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));
vi.mock("@/lib/calos/scope", () => ({
  calosScope: mocks.calosScope,
}));
vi.mock("@/schemas/calos-scheduled-publish", () => ({
  default: {
    find: mocks.queueFind,
    findOne: mocks.queueFindOne,
    findOneAndUpdate: mocks.queueFindOneAndUpdate,
  },
}));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    find: mocks.connectedAccountFind,
    findOne: mocks.connectedAccountFindOne,
  },
}));
vi.mock("@/schemas/user", () => ({
  User: {
    find: mocks.userFind,
  },
}));

import * as publishStatusRoute from "@/app/api/services/calos/publish-status/route";
import {
  encryptToken,
  encryptUserOAuthToken,
} from "@/lib/calos/publish/token-crypto";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

type PublishStatusModule = typeof publishStatusRoute & {
  POST?: (request: NextRequest) => Promise<Response>;
};

const getPublishStatus = publishStatusRoute.GET;
const postPublishRetry = (publishStatusRoute as PublishStatusModule).POST;

function queryResult<T>(value: T) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => value),
    })),
  };
}

function getRequest() {
  return new NextRequest(
    "http://localhost/api/services/calos/publish-status?brandId=brand_1",
  );
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/services/calos/publish-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callRetry(body: Record<string, unknown>) {
  if (!postPublishRetry) throw new Error("publish-status POST retry is not implemented");
  return postPublishRetry(postRequest(body));
}

function mockClerkYouTubeOwner() {
  mocks.clerkClient.mockResolvedValue({
    users: {
      getUser: vi.fn(async () => ({
        externalAccounts: [{
          id: "eac_google",
          provider: "oauth_google",
          approvedScopes: [YOUTUBE_UPLOAD_SCOPE],
        }],
      })),
      getUserOauthAccessToken: vi.fn(async () => ({
        data: [{ token: "youtube_token", externalAccountId: "eac_google" }],
      })),
    },
  });
}

function youtubeChannelResponse(channelId: string) {
  return new Response(JSON.stringify({
    items: [{ id: channelId, snippet: { title: "Acme Channel" } }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CalOS publish status and deliberate retry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "page_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.auth.mockResolvedValue({
      userId: "user_1",
      orgId: null,
      has: vi.fn(() => false),
    });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
    mocks.calosScope.mockReturnValue({
      brandId: "brand_1",
      ownerUserId: "user_1",
    });
    mocks.queueFind.mockReturnValue(queryResult([]));
    mocks.connectedAccountFind.mockReturnValue(queryResult([]));
    mocks.queueFindOne.mockResolvedValue(null);
    mocks.connectedAccountFindOne.mockResolvedValue(null);
    mocks.queueFindOneAndUpdate.mockResolvedValue(null);
    mocks.userFind.mockReturnValue(queryResult([]));
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn(async () => ({ externalAccounts: [] })),
        getUserOauthAccessToken: vi.fn(async () => ({ data: [] })),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("guards status metadata with the shared brand-access check", async () => {
    mocks.requireCalosBrandAccess.mockResolvedValue(
      NextResponse.json(
        { success: false, error: "You do not have access to this brand" },
        { status: 403 },
      ),
    );

    const response = await getPublishStatus(getRequest());

    expect(response.status).toBe(403);
    expect(mocks.queueFind).not.toHaveBeenCalled();
    expect(mocks.connectedAccountFind).not.toHaveBeenCalled();
  });

  it("reports the snapshotted account, retry eligibility, and last real failure", async () => {
    mocks.queueFind.mockReturnValue(
      queryResult([
        {
          deliverableId: "card_1",
          platform: "twitter",
          accountRef: "x_1",
          status: "failed",
          postId: null,
          postUrl: null,
          lastError: "X token refresh failed - reconnect",
          updatedAt: new Date("2026-07-28T12:00:00.000Z"),
        },
      ]),
    );
    mocks.connectedAccountFind.mockReturnValue(
      queryResult([
        {
          platform: "twitter",
          accountRef: "x_1",
          displayName: "@acme",
          ownerUserId: "owner_1",
          accessTokenEnc: null,
          refreshTokenEnc: null,
          expiresAt: null,
        },
      ]),
    );
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      twitterTokens: {
        accessToken: "x_token",
        refreshToken: "x_refresh",
        userId: "x_1",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        missingScopes: [],
      },
    }]));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.statuses.card_1).toEqual({
      platform: "twitter",
      status: "failed",
      postUrl: null,
      error: "X token refresh failed - reconnect",
      accountRef: "x_1",
      canRetry: true,
    });
    expect(payload.connectionHealth.twitter).toEqual({
      state: "attention",
      accountRef: "x_1",
      displayName: "@acme",
      message: "Last publish failed: X token refresh failed - reconnect",
    });
    expect(payload.connectedPlatforms).toEqual(["twitter"]);
  });

  it("reports an expired Model A account as reconnect-required before publishing", async () => {
    mocks.connectedAccountFind.mockReturnValue(
      queryResult([{
        platform: "twitter",
        accountRef: "x_1",
        displayName: "@acme",
        ownerUserId: "owner_1",
      }]),
    );
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      twitterTokens: {
        accessToken: "expired_token",
        userId: "x_1",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        missingScopes: [],
      },
    }]));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.connectionHealth.twitter).toMatchObject({
      state: "reconnect",
      accountRef: "x_1",
    });
    expect(payload.connectionHealth.twitter.message).toContain("cannot refresh");
    expect(payload.connectedPlatforms).toEqual([]);
  });

  it("reports an X assignment as reconnect-required when publishing scopes are missing", async () => {
    mocks.connectedAccountFind.mockReturnValue(
      queryResult([{
        platform: "twitter",
        accountRef: "x_1",
        displayName: "@acme",
        ownerUserId: "owner_1",
      }]),
    );
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      twitterTokens: {
        accessToken: "x_token",
        refreshToken: "x_refresh",
        userId: "x_1",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        scopes: ["tweet.read", "users.read"],
        missingScopes: ["tweet.write", "offline.access"],
      },
    }]));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.connectionHealth.twitter).toMatchObject({
      state: "reconnect",
      accountRef: "x_1",
    });
    expect(payload.connectionHealth.twitter.message).toContain("tweet.write");
    expect(payload.connectionHealth.twitter.message).toContain("offline.access");
    expect(payload.connectedPlatforms).toEqual([]);
  });

  it("verifies Facebook Page ownership and YouTube OAuth before reporting connected", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    mocks.connectedAccountFind.mockReturnValue(queryResult([
      {
        platform: "facebook",
        accountRef: "page_1",
        displayName: "Acme Page",
        ownerUserId: "owner_1",
      },
      {
        platform: "youtube",
        accountRef: "UC_acme",
        displayName: "Acme Channel",
        ownerUserId: "owner_1",
      },
    ]));
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      facebookTokens: {
        pages: [{
          pageId: "page_1",
          pageAccessToken: encryptUserOAuthToken("page_token"),
        }],
      },
    }]));
    mockClerkYouTubeOwner();
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "page_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/youtube/v3/channels")) {
        return youtubeChannelResponse("UC_acme");
      }
      throw new Error(`Unexpected health request: ${url}`);
    });

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(payload.connectionHealth.facebook.state).toBe("assigned");
    expect(payload.connectionHealth.youtube.state).toBe("assigned");
    expect(payload.connectedPlatforms).toEqual(["facebook", "youtube"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/page_1?fields=id",
      expect.objectContaining({
        headers: { Authorization: "Bearer page_token" },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/youtube/v3/channels"),
      expect.objectContaining({
        headers: { Authorization: "Bearer youtube_token" },
      }),
    );
  });

  it("reports reconnect without calling Graph for an unreadable encrypted Facebook token", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    mocks.connectedAccountFind.mockReturnValue(queryResult([{
      platform: "facebook",
      accountRef: "page_1",
      displayName: "Acme Page",
      ownerUserId: "owner_1",
    }]));
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      facebookTokens: {
        pages: [{
          pageId: "page_1",
          pageAccessToken: "oauth:v1:not-valid-ciphertext",
        }],
      },
    }]));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(payload.connectionHealth.facebook).toMatchObject({
      state: "reconnect",
      accountRef: "page_1",
    });
    expect(payload.connectedPlatforms).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports reconnect when the live YouTube channel differs from the assignment", async () => {
    mocks.connectedAccountFind.mockReturnValue(queryResult([{
      platform: "youtube",
      accountRef: "UC_assigned",
      displayName: "Assigned Channel",
      ownerUserId: "owner_1",
    }]));
    mockClerkYouTubeOwner();
    fetchMock.mockResolvedValueOnce(youtubeChannelResponse("UC_different"));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(payload.connectionHealth.youtube).toMatchObject({
      state: "reconnect",
      accountRef: "UC_assigned",
    });
    expect(payload.connectionHealth.youtube.message).toContain("no longer matches");
    expect(payload.connectedPlatforms).toEqual([]);
  });

  it("reports attention when YouTube channel verification is temporarily unavailable", async () => {
    mocks.connectedAccountFind.mockReturnValue(queryResult([{
      platform: "youtube",
      accountRef: "UC_assigned",
      displayName: "Assigned Channel",
      ownerUserId: "owner_1",
    }]));
    mockClerkYouTubeOwner();
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(payload.connectionHealth.youtube).toMatchObject({
      state: "attention",
      accountRef: "UC_assigned",
    });
    expect(payload.connectionHealth.youtube.message).toContain("could not be verified");
    expect(payload.connectedPlatforms).toEqual([]);
  });

  it("reports a revoked YouTube connection instead of trusting its assignment row", async () => {
    mocks.connectedAccountFind.mockReturnValue(queryResult([{
      platform: "youtube",
      accountRef: "youtube",
      displayName: "Acme Channel",
      ownerUserId: "owner_1",
    }]));

    const response = await getPublishStatus(getRequest());
    const payload = await response.json();

    expect(payload.connectionHealth.youtube).toMatchObject({
      state: "reconnect",
      accountRef: "youtube",
    });
    expect(payload.connectedPlatforms).toEqual([]);
  });

  it("requires explicit duplicate-risk confirmation before retrying", async () => {
    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
    });

    expect(response.status).toBe(400);
    expect(mocks.queueFindOne).not.toHaveBeenCalled();
  });

  it("atomically requeues a failed unpublished row without changing its account", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "twitter",
      accountRef: "x_1",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "x_1",
      ownerUserId: "owner_1",
    });
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      twitterTokens: {
        accessToken: "x_token",
        userId: "x_1",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        missingScopes: [],
      },
    }]));
    mocks.queueFindOneAndUpdate.mockResolvedValue({
      deliverableId: "card_1",
      status: "pending",
      accountRef: "x_1",
    });

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      deliverableId: "card_1",
      status: "pending",
      accountRef: "x_1",
    });
    expect(mocks.connectedAccountFindOne).toHaveBeenCalledWith({
      brandId: "brand_1",
      platform: "twitter",
      accountRef: "x_1",
    });
    expect(mocks.queueFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "queue_1",
        brandId: "brand_1",
        ownerUserId: "user_1",
        status: "failed",
        postId: null,
        accountRef: "x_1",
      },
      {
        $set: {
          status: "pending",
          attempts: 0,
          lastError: null,
          lockedAt: null,
          postUrl: null,
          publishAt: expect.any(Date),
        },
      },
      { new: true },
    );
  });

  it("refuses retry when the snapshotted account is no longer assigned", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "twitter",
      accountRef: "x_old",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue(null);

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer assigned");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses retry when the assigned Facebook Page token is revoked", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "facebook",
      accountRef: "page_1",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      platform: "facebook",
      accountRef: "page_1",
      ownerUserId: "owner_1",
    });
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      facebookTokens: {
        pages: [{ pageId: "page_1", pageAccessToken: "revoked_page_token" }],
      },
    }]));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token" },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.queueFindOneAndUpdate.mockResolvedValue({
      deliverableId: "card_1",
      status: "pending",
      accountRef: "page_1",
    });

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Reconnect Facebook");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses retry when the assigned YouTube channel no longer matches", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "youtube",
      accountRef: "UC_assigned",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      platform: "youtube",
      accountRef: "UC_assigned",
      ownerUserId: "owner_1",
    });
    mocks.queueFindOneAndUpdate.mockResolvedValue({
      deliverableId: "card_1",
      status: "pending",
      accountRef: "UC_assigned",
    });
    mockClerkYouTubeOwner();
    fetchMock.mockResolvedValueOnce(youtubeChannelResponse("UC_different"));

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer matches");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses retry when a stored token is expired and cannot refresh", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "linkedin",
      accountRef: "linkedin_1",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "linkedin_1",
      ownerUserId: "owner_1",
      accessTokenEnc: "encrypted",
      refreshTokenEnc: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("reconnected");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows retry when an expired stored LinkedIn token can refresh", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin_client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin_secret");
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "linkedin",
      accountRef: "linkedin_1",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "linkedin_1",
      ownerUserId: "owner_1",
      accessTokenEnc: encryptToken("expired_access"),
      refreshTokenEnc: encryptToken("brand_refresh"),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    mocks.queueFindOneAndUpdate.mockResolvedValue({
      deliverableId: "card_1",
      status: "pending",
      accountRef: "linkedin_1",
    });

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });

    expect(response.status).toBe(200);
    expect(mocks.queueFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("refuses retry when the assigned owner's live X token cannot refresh", async () => {
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      platform: "twitter",
      accountRef: "x_1",
      status: "failed",
      postId: null,
    });
    mocks.connectedAccountFindOne.mockResolvedValue({
      platform: "twitter",
      accountRef: "x_1",
      ownerUserId: "owner_1",
    });
    mocks.userFind.mockReturnValue(queryResult([{
      clerkUserId: "owner_1",
      twitterTokens: {
        accessToken: "expired_token",
        userId: "x_1",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        missingScopes: [],
      },
    }]));

    const response = await callRetry({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("cannot refresh");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
