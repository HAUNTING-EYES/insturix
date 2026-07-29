import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  recordProviderCostEvent: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    findOne: mocks.connectedAccountFindOne,
    updateOne: mocks.connectedAccountUpdateOne,
  },
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOne: mocks.userFindOne,
    updateOne: mocks.userUpdateOne,
  },
}));

vi.mock("@/lib/financials/provider-cost-events", () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

import { publishToLinkedIn } from "@/lib/calos/publish/linkedin";
import { decryptToken, encryptToken } from "@/lib/calos/publish/token-crypto";

const BASE = {
  ownerUserId: "queue_owner",
  deliverableId: "deliverable_1",
  brandId: "brand_1",
  caption: "Launch update",
};

describe("publishToLinkedIn", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.connectedAccountUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.userUpdateOne.mockResolvedValue(undefined);
    mocks.recordProviderCostEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fails closed when the brand has no LinkedIn assignment", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);

    const result = await publishToLinkedIn(BASE);

    expect(result).toEqual({
      ok: false,
      error: "No LinkedIn account assigned for this brand",
      retryable: false,
      providerAttempted: false,
    });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back when a queued accountRef is no longer assigned", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);

    const result = await publishToLinkedIn({
      ...BASE,
      accountRef: "organization_old",
    });

    expect(result).toEqual({
      ok: false,
      error: "No LinkedIn account assigned for this brand",
      retryable: false,
      providerAttempted: false,
    });
    expect(mocks.connectedAccountFindOne).toHaveBeenCalledWith({
      brandId: "brand_1",
      platform: "linkedin",
      accountRef: "organization_old",
    });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a personal assignment when the token owner reconnected a different profile", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "person_old",
      accountType: "personal",
      ownerUserId: "owner_1",
      accessTokenEnc: null,
    });
    mocks.userFindOne.mockResolvedValue({
      linkedinTokens: {
        accessToken: "linkedin-token",
        userId: "person_new",
      },
    });

    const result = await publishToLinkedIn(BASE);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(result.error).toContain("no longer matches");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired operator token before resolving its personal identity", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin_client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin_secret");
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "person_1",
      accountType: "personal",
      ownerUserId: "owner_1",
      accessTokenEnc: null,
    });
    mocks.userFindOne.mockResolvedValue({
      linkedinTokens: {
        accessToken: "expired_access",
        refreshToken: "operator_refresh",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh_operator_access",
        refresh_token: "rotated_operator_refresh",
        expires_in: 3600,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "person_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("", {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:post_personal" },
      }));

    const result = await publishToLinkedIn(BASE);

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.linkedin.com/oauth/v2/accessToken",
      "https://api.linkedin.com/v2/me",
      "https://api.linkedin.com/rest/posts",
    ]);
    const [, identityInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((identityInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh_operator_access",
    );
  });

  it("posts through the explicitly assigned LinkedIn organization", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "organization_1",
      accountType: "organization",
      ownerUserId: "owner_1",
      accessTokenEnc: null,
    });
    mocks.userFindOne.mockResolvedValue({
      linkedinTokens: {
        accessToken: "linkedin-token",
        userId: "person_1",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:post_1" },
      }),
    );

    const result = await publishToLinkedIn(BASE);

    expect(result).toMatchObject({
      ok: true,
      postId: "urn:li:share:post_1",
      providerAttempted: true,
      responseStatus: 201,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.linkedin.com/rest/posts");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer linkedin-token",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      author: "urn:li:organization:organization_1",
      commentary: "Launch update",
    });
  });

  it("refreshes and persists an expired encrypted brand token before posting", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin_client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin_secret");
    mocks.connectedAccountFindOne.mockResolvedValue({
      _id: "assignment_1",
      accountRef: "organization_1",
      accountType: "organization",
      ownerUserId: "owner_1",
      accessTokenEnc: encryptToken("expired_access"),
      refreshTokenEnc: encryptToken("brand_refresh"),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh_access",
        refresh_token: "rotated_refresh",
        expires_in: 3600,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("", {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:post_2" },
      }));

    const result = await publishToLinkedIn(BASE);

    expect(result.ok).toBe(true);
    const [, refreshInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(refreshInit.body)).toContain("refresh_token=brand_refresh");
    const [, update] = mocks.connectedAccountUpdateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date } },
    ];
    expect(decryptToken(update.$set.accessTokenEnc)).toBe("fresh_access");
    expect(decryptToken(update.$set.refreshTokenEnc)).toBe("rotated_refresh");
    const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((postInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh_access");
  });

  it("does not post when a refreshed brand token cannot be persisted", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin_client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin_secret");
    mocks.connectedAccountFindOne.mockResolvedValue({
      _id: "assignment_removed",
      accountRef: "organization_1",
      accountType: "organization",
      ownerUserId: "owner_1",
      accessTokenEnc: encryptToken("expired_access"),
      refreshTokenEnc: encryptToken("brand_refresh"),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    mocks.connectedAccountUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "fresh_access",
      refresh_token: "rotated_refresh",
      expires_in: 3600,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await publishToLinkedIn(BASE);

    expect(result).toMatchObject({
      ok: false,
      error: "LinkedIn token refreshed but account persistence failed",
      retryable: true,
      providerAttempted: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it("marks a thrown post request as provider-attempted", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "organization_1",
      accountType: "organization",
      ownerUserId: "owner_1",
      accessTokenEnc: null,
    });
    mocks.userFindOne.mockResolvedValue({
      linkedinTokens: {
        accessToken: "linkedin-token",
        userId: "person_1",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    fetchMock.mockRejectedValueOnce(new Error("socket closed after upload"));

    const result = await publishToLinkedIn(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      providerAttempted: true,
      error: "socket closed after upload",
    });
  });
});
