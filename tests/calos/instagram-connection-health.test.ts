import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
  userFindOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/user", () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: { updateOne: mocks.connectedAccountUpdateOne },
}));
vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));

import { GET as getUploaderInstagramStatus } from "@/app/api/services/uploaderx/instagram/status/route";
import { GET as getCalosInstagramAccounts } from "@/app/api/services/calos/connect/instagram/accounts/route";
import { POST as postCalosInstagramAssignment } from "@/app/api/services/calos/connect/instagram/assign/route";

function mockUser(record: unknown) {
  const lean = vi.fn(async () => record);
  const select = vi.fn(() => ({ lean }));
  const promise = Promise.resolve(record);
  mocks.userFindOne.mockReturnValue({
    select,
    lean,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  });
}

function tokenRecord(expiresAt?: Date | string) {
  return {
    instagramTokens: {
      userAccessToken: "ig_token",
      userId: "ig_1",
      userName: "acme",
      expiresAt,
      accounts: [{ instagramAccountId: "ig_1", instagramUsername: "acme" }],
    },
  };
}

describe("Instagram connection health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.connectedAccountUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
  });

  it("marks an expired UploaderX connection as requiring reconnect", async () => {
    mockUser(tokenRecord(new Date(Date.now() - 60_000)));

    const response = await getUploaderInstagramStatus();
    const payload = await response.json();

    expect(payload).toMatchObject({
      connected: false,
      reconnectRequired: true,
      reason: "expired",
      accounts: [],
    });
  });

  it("does not offer a legacy unknown-expiry account to CalOS", async () => {
    mockUser(tokenRecord());

    const response = await getCalosInstagramAccounts();
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      connected: false,
      reconnectRequired: true,
      reason: "expiry_unknown",
      accounts: [],
    });
  });

  it("blocks assigning an expired Instagram connection to a brand", async () => {
    mockUser(tokenRecord(new Date(Date.now() - 60_000)));
    const request = new Request("http://localhost/api/services/calos/connect/instagram/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "brand_1", accountRef: "ig_1" }),
    });

    const response = await postCalosInstagramAssignment(request as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      code: "instagram_expired",
      reconnectRequired: true,
    });
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });

  it("keeps a valid Instagram account assignable and reports its expiry", async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    mockUser(tokenRecord(expiresAt));

    const response = await getCalosInstagramAccounts();
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      connected: true,
      reconnectRequired: false,
      reason: null,
      expiresAt: expiresAt.toISOString(),
      accounts: [{ accountRef: "ig_1", displayName: "@acme" }],
    });
  });
});
