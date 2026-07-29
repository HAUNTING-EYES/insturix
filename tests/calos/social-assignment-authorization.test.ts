import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  connectToDatabase: vi.fn(),
  userFindOne: vi.fn(),
  connectedAccountFind: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  connectedAccountDeleteOne: vi.fn(),
  pendingConnectFindOne: vi.fn(),
  pendingConnectDeleteOne: vi.fn(),
  signCalosConnectState: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOne: mocks.userFindOne,
  },
}));

vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    find: mocks.connectedAccountFind,
    updateOne: mocks.connectedAccountUpdateOne,
    deleteOne: mocks.connectedAccountDeleteOne,
  },
}));

vi.mock("@/schemas/calos-pending-connect", () => ({
  default: {
    findOne: mocks.pendingConnectFindOne,
    deleteOne: mocks.pendingConnectDeleteOne,
  },
}));

vi.mock("@/lib/calos/publish/connect-state", () => ({
  signCalosConnectState: mocks.signCalosConnectState,
}));

vi.mock("@/lib/uploaderx/linkedinScopes", () => ({
  getLinkedInScopes: () => ({ scopes: ["w_member_social"] }),
}));

vi.mock("@/lib/calos/publish/linkedin-oauth", () => ({
  getCalosLinkedInRedirectUri: () =>
    "http://localhost/api/services/calos/connect/linkedin/oauth/callback",
}));

import {
  DELETE as deleteLinkedInAssignment,
  GET as getLinkedInAssignments,
  POST as postLinkedInAssignment,
} from "@/app/api/services/calos/connect/linkedin/assign/route";
import { POST as postFacebookAssignment } from "@/app/api/services/calos/connect/facebook/assign/route";
import { GET as startLinkedInOauth } from "@/app/api/services/calos/connect/linkedin/oauth/route";
import { POST as selectLinkedInOauthAccount } from "@/app/api/services/calos/connect/linkedin/oauth/select/route";
import {
  DELETE as deleteTwitterAssignment,
  GET as getTwitterAssignments,
  POST as postTwitterAssignment,
} from "@/app/api/services/calos/connect/twitter/assign/route";

const FOREIGN_BRAND_ID = "brand_foreign";

function request(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>,
): NextRequest {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

function assignmentRequest(
  platform: "linkedin" | "twitter",
  method: "GET" | "POST" | "DELETE",
): NextRequest {
  const path = `/api/services/calos/connect/${platform}/assign`;
  if (method === "POST") {
    return request(path, method, {
      brandId: FOREIGN_BRAND_ID,
      accountRef: "account_1",
      accountType: "organization",
    });
  }
  return request(
    `${path}?brandId=${FOREIGN_BRAND_ID}&accountRef=account_1`,
    method,
  );
}

describe("CalOS social assignment authorization", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "account_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null });
    mocks.requireCalosBrandAccess.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          success: false,
          code: "brand_forbidden",
          error: "You do not have access to this brand",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.connectedAccountFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => []),
      })),
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => ({
          facebookTokens: {
            pages: [{
              pageId: "account_1",
              pageName: "Facebook Page",
              pageAccessToken: "facebook-page-token",
            }],
          },
          linkedinTokens: { accessToken: "linkedin-token" },
          twitterTokens: {
            accessToken: "twitter-token",
            userId: "account_1",
            userName: "account",
          },
        })),
      })),
    });
    mocks.connectedAccountUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.connectedAccountDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.pendingConnectFindOne.mockResolvedValue({
      pendingId: "pending_1",
      ownerUserId: "user_1",
      orgId: null,
      brandId: FOREIGN_BRAND_ID,
      platform: "linkedin",
      accessTokenEnc: "encrypted-token",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      availableAccounts: [
        {
          accountRef: "account_1",
          accountType: "organization",
          displayName: "Foreign page",
        },
      ],
    });
    mocks.pendingConnectDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.signCalosConnectState.mockReturnValue("signed-state");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks foreign-brand assignment and OAuth entry points before sensitive work", async () => {
    const assignmentHandlers = [
      ["linkedin", getLinkedInAssignments, postLinkedInAssignment, deleteLinkedInAssignment],
      ["twitter", getTwitterAssignments, postTwitterAssignment, deleteTwitterAssignment],
    ] as const;
    const responses: Response[] = [];

    for (const [platform, getAssignment, postAssignment, deleteAssignment] of assignmentHandlers) {
      responses.push(await getAssignment(assignmentRequest(platform, "GET")));
      responses.push(await postAssignment(assignmentRequest(platform, "POST")));
      responses.push(await deleteAssignment(assignmentRequest(platform, "DELETE")));
    }

    responses.push(
      await postFacebookAssignment(
        request("/api/services/calos/connect/facebook/assign", "POST", {
          brandId: FOREIGN_BRAND_ID,
          accountRef: "account_1",
          accountType: "organization",
        }),
      ),
    );
    responses.push(
      await startLinkedInOauth(
        request(
          `/api/services/calos/connect/linkedin/oauth?brandId=${FOREIGN_BRAND_ID}`,
          "GET",
        ),
      ),
    );
    responses.push(
      await selectLinkedInOauthAccount(
        request("/api/services/calos/connect/linkedin/oauth/select", "POST", {
          pendingId: "pending_1",
          accountRef: "account_1",
        }),
      ),
    );

    expect(responses).toHaveLength(9);
    expect(responses.every((response) => response.status === 403)).toBe(true);
    expect(mocks.requireCalosBrandAccess).toHaveBeenCalledTimes(9);
    expect(mocks.requireCalosBrandAccess).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", orgId: null }),
      FOREIGN_BRAND_ID,
    );
    expect(mocks.connectToDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.pendingConnectFindOne).toHaveBeenCalledWith({ pendingId: "pending_1" });
    expect(mocks.connectedAccountFind).not.toHaveBeenCalled();
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
    expect(mocks.connectedAccountDeleteOne).not.toHaveBeenCalled();
    expect(mocks.pendingConnectDeleteOne).not.toHaveBeenCalled();
    expect(mocks.signCalosConnectState).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves assignment and OAuth behavior for an authorized brand", async () => {
    const previousClientId = process.env.LINKEDIN_CLIENT_ID;
    process.env.LINKEDIN_CLIENT_ID = "linkedin-client";
    mocks.requireCalosBrandAccess.mockResolvedValue(null);

    try {
      const responses = [
        await getLinkedInAssignments(assignmentRequest("linkedin", "GET")),
        await postLinkedInAssignment(assignmentRequest("linkedin", "POST")),
        await deleteLinkedInAssignment(assignmentRequest("linkedin", "DELETE")),
        await getTwitterAssignments(assignmentRequest("twitter", "GET")),
        await postTwitterAssignment(assignmentRequest("twitter", "POST")),
        await deleteTwitterAssignment(assignmentRequest("twitter", "DELETE")),
        await postFacebookAssignment(
          request("/api/services/calos/connect/facebook/assign", "POST", {
            brandId: FOREIGN_BRAND_ID,
            accountRef: "account_1",
            accountType: "organization",
          }),
        ),
        await startLinkedInOauth(
          request(
            `/api/services/calos/connect/linkedin/oauth?brandId=${FOREIGN_BRAND_ID}`,
            "GET",
          ),
        ),
        await selectLinkedInOauthAccount(
          request("/api/services/calos/connect/linkedin/oauth/select", "POST", {
            pendingId: "pending_1",
            accountRef: "account_1",
          }),
        ),
      ];

      expect(responses.map((response) => response.status)).toEqual([
        200,
        200,
        200,
        200,
        200,
        200,
        200,
        307,
        200,
      ]);
      expect(mocks.requireCalosBrandAccess).toHaveBeenCalledTimes(9);
      expect(mocks.connectedAccountUpdateOne).toHaveBeenCalledTimes(4);
      expect(mocks.connectedAccountDeleteOne).toHaveBeenCalledTimes(2);
      expect(mocks.pendingConnectDeleteOne).toHaveBeenCalledWith({ pendingId: "pending_1" });
      expect(mocks.signCalosConnectState).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: "user_1",
          brandId: FOREIGN_BRAND_ID,
          platform: "linkedin",
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://graph.facebook.com/v21.0/account_1?fields=id",
        expect.objectContaining({
          headers: { Authorization: "Bearer facebook-page-token" },
        }),
      );
    } finally {
      if (previousClientId === undefined) {
        delete process.env.LINKEDIN_CLIENT_ID;
      } else {
        process.env.LINKEDIN_CLIENT_ID = previousClientId;
      }
    }
  });

  it("refuses to assign a revoked Facebook Page token", async () => {
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token" },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await postFacebookAssignment(
      request("/api/services/calos/connect/facebook/assign", "POST", {
        brandId: FOREIGN_BRAND_ID,
        accountRef: "account_1",
        accountType: "organization",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      code: "facebook_reconnect_required",
      reconnectRequired: true,
    });
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });

  it("pauses assignment when Facebook validation is temporarily unavailable", async () => {
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: { code: 4, type: "OAuthException", message: "Application request limit reached" },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await postFacebookAssignment(
      request("/api/services/calos/connect/facebook/assign", "POST", {
        brandId: FOREIGN_BRAND_ID,
        accountRef: "account_1",
        accountType: "organization",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      success: false,
      code: "facebook_verification_unavailable",
      reconnectRequired: false,
    });
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });
});
