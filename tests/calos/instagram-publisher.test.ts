import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  recordProviderCostEvent: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-connected-account", () => ({ default: { findOne: mocks.connectedAccountFindOne } }));
vi.mock("@/schemas/user", () => ({
  User: { findOne: mocks.userFindOne, updateOne: mocks.userUpdateOne },
}));
vi.mock("@/lib/financials/provider-cost-events", () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

import { getPublisher } from "@/lib/calos/publish/contract";
import { publishToInstagram } from "@/lib/calos/publish/instagram";

function mockUserRecord(record: unknown) {
  const lean = vi.fn(async () => record);
  const select = vi.fn(() => ({ lean }));
  mocks.userFindOne.mockReturnValue({ select });
  return { lean, select };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function validTokens(overrides: Record<string, unknown> = {}) {
  return {
    userAccessToken: "ig_token",
    userId: "ig_1",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

const BASE = {
  ownerUserId: "queue_owner",
  deliverableId: "deliverable_1",
  brandId: "brand_1",
  caption: "  Hello IG  ",
  imageUrl: "https://cdn.example.com/card.png",
};

describe("publishToInstagram", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.connectedAccountFindOne.mockReset();
    mocks.userFindOne.mockReset();
    mocks.userUpdateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
    mocks.recordProviderCostEvent.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as the CalOS Instagram publisher", () => {
    expect(getPublisher("instagram")).toBe(publishToInstagram);
  });

  it("posts the image to the assigned account via container -> publish using the owner's token", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens() });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "container_1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media_99" }));

    const result = await publishToInstagram({ ...BASE, accountRef: "ig_1" });

    expect(result).toEqual({
      ok: true,
      postId: "media_99",
      postUrl: "https://www.instagram.com/p/media_99",
      providerAttempted: true,
      responseStatus: 200,
    });
    expect(mocks.userFindOne).toHaveBeenCalledWith({ clerkUserId: "owner_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.recordProviderCostEvent).toHaveBeenCalledTimes(2);

    const [containerUrl] = fetchMock.mock.calls[0] as [string];
    expect(containerUrl).toContain("/me/media?");
    expect(containerUrl).toContain("image_url=https%3A%2F%2Fcdn.example.com%2Fcard.png");
    expect(containerUrl).toContain("access_token=ig_token");
    expect(containerUrl).toContain("caption=Hello+IG");

    const [publishUrl] = fetchMock.mock.calls[1] as [string];
    expect(publishUrl).toContain("/me/media_publish?");
    expect(publishUrl).toContain("creation_id=container_1");
  });

  it("fails loud (no DB hit) when there is no image", async () => {
    const result = await publishToInstagram({ ...BASE, imageUrl: undefined });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(result.error).toContain("requires an image");
    expect(mocks.connectedAccountFindOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it("fails loud when the brand has no assigned Instagram account", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);
    const result = await publishToInstagram(BASE);
    expect(result).toEqual({
      ok: false,
      error: "No Instagram account assigned for this brand",
      retryable: false,
      providerAttempted: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it("fails loud when the assigned account's owner is no longer connected", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: null });
    const result = await publishToInstagram(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.providerAttempted).toBe(false);
    expect(result.error).toContain("no longer connected");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it("marks a Graph rate limit on the container step as retryable", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens() });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "rate limit" } }, 429));

    const result = await publishToInstagram(BASE);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.providerAttempted).toBe(false);
    expect(result.responseStatus).toBe(429);
    expect(result.error).toContain("429");
    expect(mocks.recordProviderCostEvent).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the connected Instagram identity cannot be verified", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens({ userId: undefined }) });

    const result = await publishToInstagram(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      providerAttempted: false,
    });
    expect(result.error).toContain("cannot be verified");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the token owner reconnected a different Instagram account", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_old", ownerUserId: "owner_1" });
    mockUserRecord({
      instagramTokens: {
        ...validTokens({ userId: "ig_new" }),
        accounts: [{ instagramAccountId: "ig_new" }],
      },
    });

    const result = await publishToInstagram(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      providerAttempted: false,
    });
    expect(result.error).toContain("no longer matches");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an uncertain container creation safe to retry", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens() });
    fetchMock.mockRejectedValueOnce(new Error("socket closed during container creation"));

    const result = await publishToInstagram(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      providerAttempted: false,
      error: "socket closed during container creation",
    });
  });

  it("marks a publish rate limit as an attempted but explicitly retryable request", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens() });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "container_1" }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "rate limit" } }, 429));

    const result = await publishToInstagram(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      providerAttempted: true,
      responseStatus: 429,
    });
  });

  it("marks a thrown publish request as an ambiguous provider attempt", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens() });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "container_1" }))
      .mockRejectedValueOnce(new Error("socket closed during media publication"));

    const result = await publishToInstagram(BASE);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      providerAttempted: true,
      error: "socket closed during media publication",
    });
  });

  it("fails closed when a legacy token has no verifiable expiry", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens({ expiresAt: undefined }) });
    const result = await publishToInstagram(BASE);
    expect(result).toMatchObject({ ok: false, retryable: false, providerAttempted: false });
    expect(result.error).toContain("expiry");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed before creating media when the token is expired", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens({ expiresAt: new Date(Date.now() - 1) }) });
    const result = await publishToInstagram(BASE);
    expect(result).toMatchObject({ ok: false, retryable: false, providerAttempted: false });
    expect(result.error).toContain("expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists a near-expiry token before creating media", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens({ expiresAt: new Date(Date.now() + 60_000) }) });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "ig_refreshed", expires_in: 5_184_000 }))
      .mockResolvedValueOnce(jsonResponse({ id: "container_1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media_99" }));
    const result = await publishToInstagram(BASE);
    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/refresh_access_token?");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("access_token=ig_refreshed");
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { clerkUserId: "owner_1", "instagramTokens.userAccessToken": "ig_token" },
      { $set: expect.objectContaining({ "instagramTokens.userAccessToken": "ig_refreshed" }) },
    );
  });

  it("keeps a refresh transport failure safe to retry", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({ accountRef: "ig_1", ownerUserId: "owner_1" });
    mockUserRecord({ instagramTokens: validTokens({ expiresAt: new Date(Date.now() + 60_000) }) });
    fetchMock.mockRejectedValueOnce(new Error("refresh socket closed"));
    const result = await publishToInstagram(BASE);
    expect(result).toMatchObject({ ok: false, retryable: true, providerAttempted: false });
    expect(result.error).toContain("refresh socket closed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
