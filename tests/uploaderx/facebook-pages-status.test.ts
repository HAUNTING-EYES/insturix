import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/services/uploaderx/facebook/pages/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  userFindOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOne: mocks.userFindOne,
    findOneAndUpdate: vi.fn(),
  },
}));

type StoredPage = {
  pageAccessToken: string;
  pageId: string;
  pageName: string;
};

function userQuery(value: {
  facebookTokens?: {
    connectedAt: Date;
    pages: StoredPage[];
    userId: string;
    userName: string;
  };
} | null) {
  const promise = Promise.resolve(value);
  const query = {
    select: vi.fn(),
    lean: vi.fn(async () => value),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    [Symbol.toStringTag]: "Promise",
  };
  query.select.mockReturnValue(query);
  return query;
}

function connectedUser(pages: StoredPage[]) {
  return {
    facebookTokens: {
      userId: "fb_user_1",
      userName: "Owner",
      pages,
      connectedAt: new Date("2026-07-29T00:00:00.000Z"),
    },
  };
}

function graphResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

describe("UploaderX Facebook Pages connection health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("FACEBOOK_GRAPH_API_VERSION", "v23.0");
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.connectToDatabase.mockResolvedValue(undefined);
  });

  it("reports a missing stored connection as disconnected without calling Meta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.userFindOne.mockReturnValue(userQuery(null));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      connected: false,
      connectionState: "disconnected",
      pages: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports connected only after the stored Page token resolves to the exact Page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphResponse({ id: "page_1" }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.userFindOne.mockReturnValue(userQuery(connectedUser([{
      pageId: "page_1",
      pageName: "Brand Page",
      pageAccessToken: "page_token",
    }])));

    const response = await GET();

    await expect(responseJson(response)).resolves.toMatchObject({
      connected: true,
      connectionState: "connected",
      userName: "Owner",
      pages: [{ pageId: "page_1", pageName: "Brand Page" }],
      unavailablePageCount: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/page_1?fields=id",
      expect.objectContaining({
        headers: { Authorization: "Bearer page_token" },
        cache: "no-store",
      }),
    );
  });

  it("requires reconnect when Meta rejects every stored Page token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        graphResponse({ error: { code: 190, message: "Invalid token" } }, 400),
      ),
    );
    mocks.userFindOne.mockReturnValue(userQuery(connectedUser([{
      pageId: "page_1",
      pageName: "Brand Page",
      pageAccessToken: "revoked_token",
    }])));

    const response = await GET();

    await expect(responseJson(response)).resolves.toMatchObject({
      connected: false,
      connectionState: "reconnect",
      reconnectRequired: true,
      pages: [],
      unavailablePageCount: 1,
    });
  });

  it("keeps the connection during a transient Meta failure and marks it for attention", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        graphResponse({ error: { code: 2, message: "Temporary failure" } }, 503),
      ),
    );
    mocks.userFindOne.mockReturnValue(userQuery(connectedUser([{
      pageId: "page_1",
      pageName: "Brand Page",
      pageAccessToken: "page_token",
    }])));

    const response = await GET();

    await expect(responseJson(response)).resolves.toMatchObject({
      connected: true,
      connectionState: "attention",
      reconnectRequired: false,
      pages: [{ pageId: "page_1", pageName: "Brand Page" }],
      unavailablePageCount: 1,
    });
  });

  it("keeps valid Pages available when another stored Page needs reconnecting", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphResponse({ id: "page_valid" }))
      .mockResolvedValueOnce(
        graphResponse({ error: { code: 190, message: "Invalid token" } }, 400),
      );
    vi.stubGlobal("fetch", fetchMock);
    mocks.userFindOne.mockReturnValue(userQuery(connectedUser([
      {
        pageId: "page_valid",
        pageName: "Valid Page",
        pageAccessToken: "valid_token",
      },
      {
        pageId: "page_revoked",
        pageName: "Revoked Page",
        pageAccessToken: "revoked_token",
      },
    ])));

    const response = await GET();

    await expect(responseJson(response)).resolves.toMatchObject({
      connected: true,
      connectionState: "connected",
      pages: [{ pageId: "page_valid", pageName: "Valid Page" }],
      unavailablePageCount: 1,
    });
  });
});
