import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  userFind: vi.fn(),
  userUpdateOne: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/user", () => ({
  User: {
    find: mocks.userFind,
    updateOne: mocks.userUpdateOne,
  },
}));

import {
  refreshDueInstagramTokens,
  refreshInstagramTokenIfNeeded,
} from "@/lib/uploaderx/instagram-token-health";
import { GET as runInstagramRefreshCron } from "@/app/api/cron/refresh-instagram-tokens/route";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function tokenRecord(expiresAt: Date) {
  return {
    userAccessToken: "ig_token",
    expiresAt,
  };
}

function userQuery(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      limit: vi.fn(() => ({
        lean: vi.fn(async () => rows),
      })),
    })),
  };
}

describe("Instagram proactive token refresh", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron_secret");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.userFind.mockReturnValue(userQuery([]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("leaves a healthy far-future token untouched", async () => {
    const result = await refreshInstagramTokenIfNeeded(
      "owner_1",
      tokenRecord(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    );

    expect(result).toMatchObject({ ok: true, status: "valid", userAccessToken: "ig_token" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses to refresh an already expired token", async () => {
    const result = await refreshInstagramTokenIfNeeded(
      "owner_1",
      tokenRecord(new Date(Date.now() - 1)),
    );

    expect(result).toMatchObject({ ok: false, status: "expired", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes and atomically persists a due token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "ig_refreshed", expires_in: 5_184_000 }),
    );

    const result = await refreshInstagramTokenIfNeeded(
      "owner_1",
      tokenRecord(new Date(Date.now() + 60_000)),
    );

    expect(result).toMatchObject({
      ok: true,
      status: "refreshed",
      userAccessToken: "ig_refreshed",
    });
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { clerkUserId: "owner_1", "instagramTokens.userAccessToken": "ig_token" },
      { $set: expect.objectContaining({
        "instagramTokens.userAccessToken": "ig_refreshed",
        "instagramTokens.expiresAt": expect.any(Date),
      }) },
    );
  });

  it("fails the cron closed when its bearer secret is missing", async () => {
    const response = await runInstagramRefreshCron(
      new Request("http://localhost/api/cron/refresh-instagram-tokens") as never,
    );

    expect(response.status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("refreshes due users through the secured cron batch", async () => {
    mocks.userFind.mockReturnValue(userQuery([{
      clerkUserId: "owner_1",
      instagramTokens: tokenRecord(new Date(Date.now() + 60_000)),
    }]));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "ig_refreshed", expires_in: 5_184_000 }),
    );

    const response = await runInstagramRefreshCron(
      new Request("http://localhost/api/cron/refresh-instagram-tokens", {
        headers: { authorization: "Bearer cron_secret" },
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, scanned: 1, refreshed: 1, failed: 0 });
  });

  it("summarizes provider failures without leaking token material", async () => {
    mocks.userFind.mockReturnValue(userQuery([{
      clerkUserId: "owner_1",
      instagramTokens: tokenRecord(new Date(Date.now() + 60_000)),
    }]));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "rate limit" } }, 429));

    const summary = await refreshDueInstagramTokens(10);

    expect(summary).toEqual({ scanned: 1, refreshed: 0, valid: 0, failed: 1 });
    expect(JSON.stringify(summary)).not.toContain("ig_token");
  });
});
