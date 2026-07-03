import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

import { GET } from "@/app/api/services/editron/pexels/search/route";

describe("Editron Pexels search proxy", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    vi.stubEnv("PEXELS_API_KEY", "server_pexels_key");
    vi.stubEnv("NEXT_PUBLIC_PEXELS_API_KEY", "browser_pexels_key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ videos: [{ id: 1 }], photos: [{ id: 2 }] })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("requires an authenticated user before proxying to Pexels", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });

    const response = await GET(
      new Request("https://app.example.com/api/services/editron/pexels/search?type=videos&query=ocean"),
    );

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies video search with the server-only Pexels key", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/services/editron/pexels/search?type=videos&query=ocean&per_page=200&size=medium",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ videos: [{ id: 1 }], photos: [{ id: 2 }] });

    const [upstreamUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(upstreamUrl)).toBe("https://api.pexels.com/videos/search?query=ocean&per_page=80&size=medium");
    expect((init as RequestInit).headers).toMatchObject({
      Accept: "application/json",
      Authorization: "server_pexels_key",
    });
    expect(JSON.stringify(init)).not.toContain("browser_pexels_key");
  });

  it("rejects invalid search types without calling Pexels", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/services/editron/pexels/search?type=users&query=ocean"),
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});