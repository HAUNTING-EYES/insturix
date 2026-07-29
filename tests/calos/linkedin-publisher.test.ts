import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  connectedAccountFindOne: vi.fn(),
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
