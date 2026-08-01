import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  verifyCalosConnectState: vi.fn(),
  encryptToken: vi.fn((token: string) => `encrypted:${token}`),
  pendingCreate: vi.fn(),
  pendingFindOne: vi.fn(),
  pendingDeleteOne: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-pending-connect", () => ({
  default: {
    create: mocks.pendingCreate,
    findOne: mocks.pendingFindOne,
    deleteOne: mocks.pendingDeleteOne,
  },
}));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: { updateOne: mocks.connectedAccountUpdateOne },
}));
vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));
vi.mock("@/lib/calos/publish/connect-state", () => ({
  verifyCalosConnectState: mocks.verifyCalosConnectState,
}));
vi.mock("@/lib/calos/publish/token-crypto", () => ({
  encryptToken: mocks.encryptToken,
}));
vi.mock("@/lib/calos/publish/linkedin-oauth", () => ({
  getCalosLinkedInRedirectUri: () =>
    "http://localhost/api/services/calos/connect/linkedin/oauth/callback",
}));
vi.mock("@/lib/uploaderx/linkedinScopes", () => ({
  getLinkedInScopes: () => ({
    scopes: ["w_member_social", "w_organization_social", "rw_organization_admin"],
    options: {
      includeProfile: false,
      includeEmail: false,
      includeOrganizationAdmin: true,
      includeOrganizationSocial: true,
    },
  }),
}));
vi.mock("@/lib/oauth/popup-response", () => ({
  createOAuthPopupResponse: ({ payload }: { payload: Record<string, unknown> }) =>
    Response.json(payload),
}));

import { GET as completeLinkedInOauth } from
  "@/app/api/services/calos/connect/linkedin/oauth/callback/route";
import { POST as selectLinkedInAccount } from
  "@/app/api/services/calos/connect/linkedin/oauth/select/route";

function request(path: string, init?: RequestInit): NextRequest {
  return new Request(`http://localhost${path}`, init) as NextRequest;
}

describe("CalOS LinkedIn Model-B scope persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin-client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin-secret");
    mocks.auth.mockResolvedValue({ userId: "owner_1", orgId: null });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.verifyCalosConnectState.mockReturnValue({
      ownerUserId: "owner_1",
      orgId: null,
      brandId: "brand_1",
      platform: "linkedin",
    });
    mocks.pendingCreate.mockResolvedValue({ acknowledged: true });
    mocks.pendingDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.connectedAccountUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores the scopes returned by LinkedIn on the pending OAuth record", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        access_token: "brand-token",
        refresh_token: "brand-refresh",
        expires_in: 3600,
        scope: "w_organization_social rw_organization_admin",
      }))
      .mockResolvedValueOnce(Response.json({
        elements: [{ id: "org_1", localizedName: "Acme" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await completeLinkedInOauth(
      request("/api/services/calos/connect/linkedin/oauth/callback?code=code_1&state=state_1"),
    );

    expect(response.status).toBe(200);
    expect(mocks.pendingCreate).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: "owner_1",
      brandId: "brand_1",
      platform: "linkedin",
      accessTokenEnc: "encrypted:brand-token",
      refreshTokenEnc: "encrypted:brand-refresh",
      scopes: ["w_organization_social", "rw_organization_admin"],
      availableAccounts: [{
        accountRef: "org_1",
        accountType: "organization",
        displayName: "Acme",
      }],
    }));
  });

  it("promotes only the server-stored scopes with the selected account", async () => {
    mocks.pendingFindOne.mockResolvedValue({
      pendingId: "pending_1",
      ownerUserId: "owner_1",
      orgId: null,
      brandId: "brand_1",
      platform: "linkedin",
      accessTokenEnc: "encrypted:brand-token",
      refreshTokenEnc: "encrypted:brand-refresh",
      tokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      scopes: ["w_organization_social", "rw_organization_admin"],
      availableAccounts: [{
        accountRef: "org_1",
        accountType: "organization",
        displayName: "Acme",
      }],
    });

    const response = await selectLinkedInAccount(request(
      "/api/services/calos/connect/linkedin/oauth/select",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: "pending_1", accountRef: "org_1" }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.connectedAccountUpdateOne).toHaveBeenCalledWith(
      { brandId: "brand_1", platform: "linkedin", accountRef: "org_1" },
      {
        $set: expect.objectContaining({
          accountType: "organization",
          ownerUserId: "owner_1",
          scopes: ["w_organization_social", "rw_organization_admin"],
        }),
      },
      { upsert: true },
    );
    expect(mocks.pendingDeleteOne).toHaveBeenCalledWith({ pendingId: "pending_1" });
  });
});
