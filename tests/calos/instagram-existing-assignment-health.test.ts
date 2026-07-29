import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  calosScope: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountFind: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  queueFind: vi.fn(),
  queueFindOne: vi.fn(),
  queueFindOneAndUpdate: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));
vi.mock("@/lib/calos/scope", () => ({ calosScope: mocks.calosScope }));
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
vi.mock("@/schemas/user", () => ({ User: { find: mocks.userFind } }));

import {
  GET as getPublishStatus,
  POST as postPublishRetry,
} from "@/app/api/services/calos/publish-status/route";

function queryResult<T>(value: T) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => value),
    })),
  };
}

function statusRequest() {
  return new NextRequest(
    "http://localhost/api/services/calos/publish-status?brandId=brand_1",
  );
}

function retryRequest() {
  return new NextRequest("http://localhost/api/services/calos/publish-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "brand_1",
      deliverableId: "card_1",
      confirmPossibleDuplicate: true,
    }),
  });
}

function assignment() {
  return {
    platform: "instagram",
    accountRef: "ig_1",
    displayName: "@acme",
    ownerUserId: "owner_1",
    accessTokenEnc: null,
    refreshTokenEnc: null,
    expiresAt: null,
  };
}

function ownerTokens(expiresAt: Date) {
  return [{
    clerkUserId: "owner_1",
    instagramTokens: {
      userAccessToken: "ig_token",
      expiresAt,
    },
  }];
}

describe("CalOS existing Instagram assignment health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null, has: vi.fn(() => false) });
    mocks.calosScope.mockReturnValue({ brandId: "brand_1", ownerUserId: "user_1" });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
    mocks.queueFind.mockReturnValue(queryResult([]));
    mocks.connectedAccountFind.mockReturnValue(queryResult([assignment()]));
    mocks.connectedAccountFindOne.mockResolvedValue(assignment());
    mocks.queueFindOneAndUpdate.mockResolvedValue({ status: "pending" });
  });

  it("marks an existing assignment as reconnect when its owner's token expired", async () => {
    mocks.userFind.mockReturnValue(queryResult(ownerTokens(new Date(Date.now() - 60_000))));

    const response = await getPublishStatus(statusRequest());
    const payload = await response.json();

    expect(payload.connectedPlatforms).toEqual([]);
    expect(payload.connectionHealth.instagram).toMatchObject({
      state: "reconnect",
      accountRef: "ig_1",
      displayName: "@acme",
    });
    expect(payload.connectionHealth.instagram.message).toContain("expired");
  });

  it("refuses to requeue against an expired live Instagram token", async () => {
    mocks.userFind.mockReturnValue(queryResult(ownerTokens(new Date(Date.now() - 60_000))));
    mocks.queueFindOne.mockResolvedValue({
      _id: "queue_1",
      deliverableId: "card_1",
      platform: "instagram",
      accountRef: "ig_1",
      status: "failed",
      postId: null,
    });

    const response = await postPublishRetry(retryRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("expired");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps an existing assignment connected when the owner token is healthy", async () => {
    mocks.userFind.mockReturnValue(
      queryResult(ownerTokens(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))),
    );

    const response = await getPublishStatus(statusRequest());
    const payload = await response.json();

    expect(payload.connectedPlatforms).toEqual(["instagram"]);
    expect(payload.connectionHealth.instagram).toMatchObject({
      state: "assigned",
      accountRef: "ig_1",
      message: null,
    });
  });
});
