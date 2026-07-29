import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    findOne: mocks.connectedAccountFindOne,
    updateOne: mocks.connectedAccountUpdateOne,
  },
}));
vi.mock("@/schemas/user", () => ({ User: { findOne: mocks.userFindOne, updateOne: mocks.userUpdateOne } }));

import { POST as postTwitterAssignment } from "@/app/api/services/calos/connect/twitter/assign/route";
import { getPublisher } from "@/lib/calos/publish/contract";
import { publishToTwitter } from "@/lib/calos/publish/twitter";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 60 * 1000);

const BASE = { ownerUserId: "queue_owner", deliverableId: "d1", brandId: "brand_1", caption: "  gm  " };
type TwitterAssignmentRequest = Parameters<typeof postTwitterAssignment>[0];

function assignmentRequest(): TwitterAssignmentRequest {
  return new Request("http://localhost/api/services/calos/connect/twitter/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "brand_1",
      accountRef: "x_1",
      displayName: "@acme",
    }),
  }) as TwitterAssignmentRequest;
}

describe("publishToTwitter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.connectedAccountFindOne.mockReset();
    mocks.connectedAccountUpdateOne.mockReset().mockResolvedValue({ acknowledged: true });
    mocks.userFindOne.mockReset();
    mocks.userUpdateOne.mockReset().mockResolvedValue(undefined);
    mocks.auth.mockReset().mockResolvedValue({ userId: "owner_1", orgId: null });
    mocks.requireCalosBrandAccess.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is registered as the CalOS X publisher", () => {
    expect(getPublisher("twitter")).toBe(publishToTwitter);
  });

  it("posts a tweet for the assigned account using the owner's token", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "x_1", ownerUserId: "owner_1" });
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: { accessToken: "tok", refreshToken: "r", userId: "x_1", userName: "acme", expiresAt: future() },
    });
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "tweet_1" } }));

    const result = await publishToTwitter(BASE);

    expect(result).toEqual({
      ok: true,
      postId: "tweet_1",
      postUrl: "https://x.com/acme/status/tweet_1",
      providerAttempted: true,
      responseStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.com/2/tweets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ text: "gm" });
  });

  it("refreshes an expired token (with write-back) then posts", async () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "cid");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "csec");
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "x_1", ownerUserId: "owner_1" });
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: { accessToken: "old", refreshToken: "r", userId: "x_1", userName: "acme", expiresAt: past() },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "new", refresh_token: "r2", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "tweet_2" } }));

    const result = await publishToTwitter(BASE);

    expect(result.ok).toBe(true);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://api.x.com/2/oauth2/token");
    expect(mocks.userUpdateOne).toHaveBeenCalledOnce();
    const tweetInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((tweetInit.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("fails loud (no DB hit) when the text is empty", async () => {
    const result = await publishToTwitter({ ...BASE, caption: "   " });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(mocks.connectedAccountFindOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails loud when no X account is assigned to the brand", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);
    const result = await publishToTwitter(BASE);
    expect(result).toEqual({
      ok: false,
      error: "No X account assigned for this brand",
      retryable: false,
      providerAttempted: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails loud when the owner is no longer connected", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "x_1", ownerUserId: "owner_1" });
    mocks.userFindOne.mockResolvedValue({ twitterTokens: null });
    const result = await publishToTwitter(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(result.error).toContain("not connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects publishing when the owner reconnected a different X account", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "x_old",
      ownerUserId: "owner_1",
    });
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: {
        accessToken: "tok",
        refreshToken: "r",
        userId: "x_new",
        userName: "new-account",
        expiresAt: future(),
      },
    });

    const result = await publishToTwitter(BASE);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(result.error).toContain("no longer matches");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects assigning an X connection that cannot refresh for future publishing", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => ({
          twitterTokens: {
            accessToken: "tok",
            userId: "x_1",
            userName: "acme",
            expiresAt: future(),
            scopes: ["tweet.read", "tweet.write", "users.read"],
            missingScopes: ["offline.access"],
          },
        })),
      })),
    });

    const response = await postTwitterAssignment(assignmentRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("long-term publishing access");
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });

  it("marks a 429 as retryable", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "x_1", ownerUserId: "owner_1" });
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: { accessToken: "tok", userId: "x_1", userName: "acme", expiresAt: future() },
    });
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Too Many Requests" }, 429));
    const result = await publishToTwitter(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.providerAttempted).toBe(true);
    expect(result.responseStatus).toBe(429);
    expect(result.error).toContain("429");
  });

  it("marks a thrown tweet request as provider-attempted", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "x_1", ownerUserId: "owner_1" });
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: { accessToken: "tok", userId: "x_1", userName: "acme", expiresAt: future() },
    });
    fetchMock.mockRejectedValueOnce(new Error("socket closed after upload"));

    const result = await publishToTwitter(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      providerAttempted: true,
      error: "socket closed after upload",
    });
  });
});
