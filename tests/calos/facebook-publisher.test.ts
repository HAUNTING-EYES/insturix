import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  userFindOne: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    findOne: mocks.connectedAccountFindOne,
  },
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOne: mocks.userFindOne,
  },
}));

import { getPublisher } from "@/lib/calos/publish/contract";
import { publishToFacebook } from "@/lib/calos/publish/facebook";

function mockUserRecord(record: unknown) {
  const lean = vi.fn(async () => record);
  const select = vi.fn(() => ({ lean }));
  mocks.userFindOne.mockReturnValue({ select });
  return { lean, select };
}

function mockFacebookSuccess(id = "page_2_post_99") {
  return new Response(JSON.stringify({ id }), { status: 200 });
}

describe("publishToFacebook", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.connectedAccountFindOne.mockReset();
    mocks.userFindOne.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as the CalOS Facebook publisher", () => {
    expect(getPublisher("facebook")).toBe(publishToFacebook);
  });

  it("posts to the explicitly assigned Page feed using the owner's stored Page token", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "page_2",
      ownerUserId: "owner_1",
    });
    const userLookup = mockUserRecord({
      facebookTokens: {
        pages: [
          { pageId: "page_1", pageName: "Wrong Page", pageAccessToken: "wrong_token" },
          { pageId: "page_2", pageName: "Brand Page", pageAccessToken: "token_2" },
        ],
      },
    });
    fetchMock.mockResolvedValue(mockFacebookSuccess());

    const result = await publishToFacebook({
      ownerUserId: "queue_owner",
      deliverableId: "deliverable_1",
      brandId: "brand_1",
      accountRef: "page_2",
      caption: "  Hello Facebook  ",
    });

    expect(result).toEqual({
      ok: true,
      postId: "page_2_post_99",
      postUrl: "https://www.facebook.com/page_2_post_99",
    });
    expect(mocks.connectedAccountFindOne).toHaveBeenCalledWith({
      brandId: "brand_1",
      platform: "facebook",
      accountRef: "page_2",
    });
    expect(mocks.userFindOne).toHaveBeenCalledWith({ clerkUserId: "owner_1" });
    expect(userLookup.select).toHaveBeenCalledWith("facebookTokens");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/page_2/feed");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get("message")).toBe("Hello Facebook");
    expect((init.body as URLSearchParams).get("access_token")).toBe("token_2");
  });

  it("fails loudly when the brand has no assigned Facebook Page", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue(null);

    const result = await publishToFacebook({
      ownerUserId: "queue_owner",
      deliverableId: "deliverable_1",
      brandId: "brand_1",
      caption: "Hello",
    });

    expect(result).toEqual({
      ok: false,
      error: "No Facebook Page assigned for this brand",
      retryable: false,
    });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to another connected Page when the assigned Page token is missing", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "assigned_page",
      ownerUserId: "owner_1",
    });
    mockUserRecord({
      facebookTokens: {
        pages: [{ pageId: "other_page", pageName: "Other Page", pageAccessToken: "other_token" }],
      },
    });

    const result = await publishToFacebook({
      ownerUserId: "queue_owner",
      deliverableId: "deliverable_1",
      brandId: "brand_1",
      caption: "Hello",
    });

    expect(result).toEqual({
      ok: false,
      error: "Assigned Facebook Page is no longer connected for this owner",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks Graph rate limits and server failures as retryable", async () => {
    mocks.connectedAccountFindOne.mockResolvedValue({
      accountRef: "page_2",
      ownerUserId: "owner_1",
    });
    mockUserRecord({
      facebookTokens: {
        pages: [{ pageId: "page_2", pageName: "Brand Page", pageAccessToken: "token_2" }],
      },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 }),
    );

    const result = await publishToFacebook({
      ownerUserId: "queue_owner",
      deliverableId: "deliverable_1",
      brandId: "brand_1",
      caption: "Hello",
    });

    expect(result).toEqual({
      ok: false,
      error: "Facebook post failed (429): rate limit",
      retryable: true,
    });
  });
});
