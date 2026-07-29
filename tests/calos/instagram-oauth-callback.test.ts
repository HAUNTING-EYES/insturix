import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  consumeOAuthState: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/user", () => ({
  User: { findOneAndUpdate: mocks.userFindOneAndUpdate },
}));
vi.mock("@/app/api/services/uploaderx/utils/oauth-state", () => ({
  consumeUploaderXOAuthState: mocks.consumeOAuthState,
  UploaderXOAuthStateError: class UploaderXOAuthStateError extends Error {},
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("Instagram OAuth callback", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:00:00.000Z"));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.auth.mockReset().mockResolvedValue({ userId: "owner_1" });
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.consumeOAuthState.mockReset().mockResolvedValue(undefined);
    mocks.userFindOneAndUpdate.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("persists the provider-reported long-lived token expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "short", user_id: "ig_1" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "long", expires_in: 5_184_000 }))
      .mockResolvedValueOnce(jsonResponse({
        username: "acme",
        account_type: "BUSINESS",
        profile_picture_url: "https://cdn.example.com/avatar.jpg",
      }));
    const { GET } = await import("@/app/api/services/uploaderx/instagram/callback/route");

    const response = await GET(new Request(
      "https://app.example.com/api/services/uploaderx/instagram/callback?code=code_1&state=state_1",
    ));

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/dashboard/uploaderx?ig_connected=true",
    );
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { clerkUserId: "owner_1" },
      {
        $set: {
          instagramTokens: expect.objectContaining({
            userAccessToken: "long",
            expiresAt: new Date("2026-09-27T00:00:00.000Z"),
          }),
        },
      },
      { upsert: false },
    );
  });

  it("rejects a long-lived exchange that does not include a usable lifetime", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "short", user_id: "ig_1" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "long" }));
    const { GET } = await import("@/app/api/services/uploaderx/instagram/callback/route");

    const response = await GET(new Request(
      "https://app.example.com/api/services/uploaderx/instagram/callback?code=code_1&state=state_1",
    ));

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/dashboard/uploaderx?ig_error=long_token_exchange",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
