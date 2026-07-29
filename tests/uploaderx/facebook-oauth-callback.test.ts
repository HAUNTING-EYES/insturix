import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  consumeOAuthState: vi.fn(),
  createOAuthState: vi.fn(),
  storeOAuthState: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/app/api/services/uploaderx/utils/oauth-state", () => ({
  consumeUploaderXOAuthState: mocks.consumeOAuthState,
  createUploaderXOAuthStateRecord: mocks.createOAuthState,
  storeUploaderXOAuthState: mocks.storeOAuthState,
  UploaderXOAuthStateError: class UploaderXOAuthStateError extends Error {},
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOneAndUpdate: mocks.userFindOneAndUpdate,
  },
}));

function graphResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function callbackRequest(): Request {
  return new Request(
    "http://localhost/api/services/uploaderx/facebook/callback?code=oauth_code&state=facebook_state",
  );
}

function redirectLocation(response: Response): URL {
  const location = response.headers.get("location");
  if (!location) throw new Error("Expected a redirect response");
  return new URL(location);
}

async function loadCallback() {
  return await import("@/app/api/services/uploaderx/facebook/callback/route");
}

async function loadAuth() {
  return await import("@/app/api/services/uploaderx/facebook/auth/route");
}

describe("UploaderX Facebook OAuth lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("FACEBOOK_APP_ID", "facebook_app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "facebook_secret");
    vi.stubEnv("FACEBOOK_GRAPH_API_VERSION", "v23.0");

    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.consumeOAuthState.mockResolvedValue({});
    mocks.createOAuthState.mockReturnValue({
      state: "facebook_state",
      provider: "facebook",
      userId: "user_1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    mocks.storeOAuthState.mockResolvedValue(undefined);
    mocks.userFindOneAndUpdate.mockResolvedValue({ clerkUserId: "user_1" });
  });

  it("does not silently persist a short-lived token when the long-lived exchange fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "short_token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        graphResponse({ error: { code: 190, message: "Exchange failed" } }, 400),
      )
      .mockResolvedValueOnce(
        graphResponse({
          data: [{ id: "page_1", name: "Brand Page", access_token: "page_token" }],
        }),
      )
      .mockResolvedValueOnce(graphResponse({ id: "fb_user_1", name: "Owner" }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await loadCallback();
    const response = await GET(callbackRequest());

    expect(redirectLocation(response).searchParams.get("fb_error")).toBe("token_exchange");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not persist a connection when Page discovery returns a non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "short_token" }))
      .mockResolvedValueOnce(graphResponse({ access_token: "long_token", expires_in: 5_000 }))
      .mockResolvedValueOnce(graphResponse({}, 503));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await loadCallback();
    const response = await GET(callbackRequest());

    expect(redirectLocation(response).searchParams.get("fb_error")).toBe("pages_fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("requires a valid Facebook identity before storing the connection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "short_token" }))
      .mockResolvedValueOnce(graphResponse({ access_token: "long_token", expires_in: 5_000 }))
      .mockResolvedValueOnce(
        graphResponse({
          data: [{ id: "page_1", name: "Brand Page", access_token: "page_token" }],
        }),
      )
      .mockResolvedValueOnce(graphResponse({ name: "Missing id" }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await loadCallback();
    const response = await GET(callbackRequest());

    expect(redirectLocation(response).searchParams.get("fb_error")).toBe("profile_fetch");
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("stores only the validated long-lived token and its expiry metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:00:00.000Z"));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "short_token", expires_in: 3600 }))
      .mockResolvedValueOnce(graphResponse({ access_token: "long_token", expires_in: 5_000 }))
      .mockResolvedValueOnce(
        graphResponse({
          data: [{ id: "page_1", name: "Brand Page", access_token: "page_token" }],
        }),
      )
      .mockResolvedValueOnce(graphResponse({ id: "fb_user_1", name: "Owner" }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await loadCallback();
    const response = await GET(callbackRequest());

    expect(redirectLocation(response).searchParams.get("fb_connected")).toBe("true");
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { clerkUserId: "user_1" },
      {
        $set: {
          facebookTokens: expect.objectContaining({
            userAccessToken: "long_token",
            userId: "fb_user_1",
            userName: "Owner",
            expiresAt: new Date("2026-07-29T11:23:20.000Z"),
          }),
        },
      },
      { upsert: false },
    );

    const pagesCall = fetchMock.mock.calls[2] as [string, RequestInit];
    const profileCall = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(pagesCall[0]).toBe("https://graph.facebook.com/v23.0/me/accounts");
    expect(profileCall[0]).toBe("https://graph.facebook.com/v23.0/me");
    expect(pagesCall[1].headers).toEqual({ Authorization: "Bearer long_token" });
    expect(profileCall[1].headers).toEqual({ Authorization: "Bearer long_token" });
    vi.useRealTimers();
  });

  it("uses the configured Graph version for the authorization dialog", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { GET } = await loadAuth();
    const response = await GET(new Request("http://localhost/api/services/uploaderx/facebook/auth"));
    const location = redirectLocation(response);

    expect(location.origin).toBe("https://www.facebook.com");
    expect(location.pathname).toBe("/v23.0/dialog/oauth");
    expect(location.searchParams.get("state")).toBe("facebook_state");
    expect(mocks.storeOAuthState).toHaveBeenCalledTimes(1);
  });
});
