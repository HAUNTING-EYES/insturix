import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  calosScope: vi.fn(),
  queueFind: vi.fn(),
  queueFindOne: vi.fn(),
  queueFindOneAndUpdate: vi.fn(),
  connectedAccountFind: vi.fn(),
  connectedAccountFindOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
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

import * as publishStatusRoute from "@/app/api/services/calos/publish-status/route";

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

describe("CalOS publish status and deliberate retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
