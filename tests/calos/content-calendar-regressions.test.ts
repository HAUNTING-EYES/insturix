import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
  requireCalosBrandAccess: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    updateOne: mocks.connectedAccountUpdateOne,
  },
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/shared/brand-vault-refinery-api", () => ({
  getDefaultBrandVaultRefineryStore: vi.fn(),
}));

vi.mock("@/lib/calos/brand-access", () => ({
  requireCalosBrandAccess: mocks.requireCalosBrandAccess,
}));

import { GET as getYoutubeAccounts } from "@/app/api/services/calos/connect/youtube/accounts/route";
import {
  DELETE as deleteFacebookAssignment,
  GET as getFacebookAssignments,
  POST as postFacebookAssignment,
} from "@/app/api/services/calos/connect/facebook/assign/route";
import {
  DELETE as deleteInstagramAssignment,
  GET as getInstagramAssignments,
  POST as postInstagramAssignment,
} from "@/app/api/services/calos/connect/instagram/assign/route";
import {
  DELETE as deleteYoutubeAssignment,
  GET as getYoutubeAssignments,
  POST as postYoutubeAssignment,
} from "@/app/api/services/calos/connect/youtube/assign/route";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
type YoutubeAssignRequest = Parameters<typeof postYoutubeAssignment>[0];

function jsonRequest(body: unknown): YoutubeAssignRequest {
  return new Request("http://localhost/api/services/calos/connect/youtube/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as YoutubeAssignRequest;
}

function assignmentRequest(platform: string, method: "GET" | "POST" | "DELETE"): NextRequest {
  const url = new URL(`http://localhost/api/services/calos/connect/${platform}/assign`);
  const init: RequestInit = { method };
  if (method === "POST") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify({ brandId: "brand_foreign", accountRef: "account_1" });
  } else {
    url.searchParams.set("brandId", "brand_foreign");
    url.searchParams.set("accountRef", "account_1");
  }
  return new Request(url, init) as NextRequest;
}

function mockClerkGoogleAccount(account: Record<string, unknown> | null) {
  mocks.clerkClient.mockResolvedValue({
    users: {
      getUser: vi.fn(async () => ({
        externalAccounts: account ? [account] : [],
      })),
    },
  });
}

describe("Content calendar regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.connectedAccountUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.requireCalosBrandAccess.mockResolvedValue(null);
  });

  it("opens the active day view instead of surprise-creating a draft on date click", () => {
    const root = process.cwd();
    const calendarSource = readFileSync(
      join(root, "components/dashboard/calos/v3/calos-calendar.tsx"),
      "utf8",
    );
    const pageSource = readFileSync(join(root, "app/dashboard/calos/page.tsx"), "utf8");

    expect(calendarSource).toContain("setView('day'), setSelDay(cell)");
    expect(calendarSource).toContain("e.stopPropagation(); setOpenId(pl.item.id)");
    expect(calendarSource).toContain("const base = view === 'day' ? selDay : today");
    expect(calendarSource).toContain("if (created) setOpenId(created.id)");
    expect(pageSource).toContain("return <CalosCalendarV3 />");
  });

  it("wires calendar bulk cleanup to scoped soft-delete", () => {
    const root = process.cwd();
    const routeSource = readFileSync(join(root, "app/api/services/calos/deliverables/route.ts"), "utf8");
    const hookSource = readFileSync(join(root, "app/dashboard/calos/hooks/useCalosDeliverables.ts"), "utf8");
    const calendarSource = readFileSync(
      join(root, "components/dashboard/calos/v3/calos-calendar.tsx"),
      "utf8",
    );

    expect(routeSource).toContain("export async function DELETE");
    expect(routeSource).toContain("CalosDeliverable.updateMany");
    expect(routeSource).toContain("deletedAt: new Date()");
    expect(routeSource).toContain("scope=all or ids[] is required");
    expect(hookSource).toContain("deleteCardsForDate");
    expect(hookSource).toContain("clearAll");
    expect(calendarSource).toContain("setConfirm({ kind: 'clearall' })");
    expect(calendarSource).toContain("setConfirm({ kind: 'deleteday', date: selDay })");
    expect(calendarSource).toContain("onConfirm={doClearAll}");
    expect(calendarSource).toContain("onConfirm={() => doDeleteDay(confirm.date)}");
  });

  it("authorizes personal, owned, and accessible Vault brands but rejects foreign brands", async () => {
    const { checkCalosBrandAccess } = await vi.importActual<
      typeof import("@/lib/calos/brand-access")
    >("@/lib/calos/brand-access");
    const lookups = {
      ownsEditronBrand: vi.fn(async (_userId: string, brandId: string) => brandId === "brand_owned"),
      canAccessVaultBrand: vi.fn(async (_session: unknown, brandId: string) => brandId === "brand_vault"),
    };
    const session = { userId: "user_1", orgId: "org_1", isOrgAdmin: false };

    await expect(checkCalosBrandAccess(session, "default", lookups)).resolves.toMatchObject({
      allowed: true,
      source: "personal",
    });
    await expect(checkCalosBrandAccess(session, "brand_owned", lookups)).resolves.toMatchObject({
      allowed: true,
      source: "editron",
    });
    await expect(checkCalosBrandAccess(session, "brand_vault", lookups)).resolves.toMatchObject({
      allowed: true,
      source: "brand_vault",
    });
    await expect(checkCalosBrandAccess(session, "brand_foreign", lookups)).resolves.toMatchObject({
      allowed: false,
      status: 403,
      code: "brand_forbidden",
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unavailableLookups = {
      ownsEditronBrand: vi.fn(async () => false),
      canAccessVaultBrand: vi.fn(async () => {
        throw new Error("vault unavailable");
      }),
    };
    try {
      await expect(
        checkCalosBrandAccess(session, "brand_unknown", unavailableLookups),
      ).resolves.toMatchObject({
        allowed: false,
        status: 503,
        code: "brand_access_unavailable",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("blocks every assignment method before account or token access for a foreign brand", async () => {
    mocks.requireCalosBrandAccess.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          code: "brand_forbidden",
          error: "You do not have access to this brand",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const handlers = [
      ["facebook", getFacebookAssignments, postFacebookAssignment, deleteFacebookAssignment],
      ["instagram", getInstagramAssignments, postInstagramAssignment, deleteInstagramAssignment],
      ["youtube", getYoutubeAssignments, postYoutubeAssignment, deleteYoutubeAssignment],
    ] as const;
    const responses: Response[] = [];
    for (const [platform, getAssignment, postAssignment, deleteAssignment] of handlers) {
      responses.push(await getAssignment(assignmentRequest(platform, "GET")));
      responses.push(await postAssignment(assignmentRequest(platform, "POST")));
      responses.push(await deleteAssignment(assignmentRequest(platform, "DELETE")));
    }

    expect(responses).toHaveLength(9);
    expect(responses.every((response) => response.status === 403)).toBe(true);
    expect(mocks.requireCalosBrandAccess).toHaveBeenCalledTimes(9);
    expect(mocks.requireCalosBrandAccess).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", orgId: null }),
      "brand_foreign",
    );
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });

  it("reads CalOS YouTube connection state from Clerk Google accounts", async () => {
    mockClerkGoogleAccount({
      provider: "oauth_google",
      username: "Creator Channel",
      approvedScopes: [YOUTUBE_UPLOAD_SCOPE],
    });

    const response = await getYoutubeAccounts();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      connected: true,
      accounts: [{ accountRef: "youtube", displayName: "Creator Channel" }],
    });
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("allows assigning a Clerk-connected YouTube channel to a brand", async () => {
    mockClerkGoogleAccount({
      provider: "oauth_google",
      emailAddress: "creator@example.com",
      approvedScopes: [YOUTUBE_UPLOAD_SCOPE],
    });

    const response = await postYoutubeAssignment(
      jsonRequest({ brandId: "brand_1", accountRef: "youtube" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.connectedAccountUpdateOne).toHaveBeenCalledWith(
      { brandId: "brand_1", platform: "youtube", accountRef: "youtube" },
      expect.objectContaining({
        $set: expect.objectContaining({
          ownerUserId: "user_1",
          displayName: "creator@example.com",
          accessTokenEnc: null,
        }),
      }),
      { upsert: true },
    );
  });

  it("rejects YouTube assignment when the Clerk Google account lacks upload scope", async () => {
    mockClerkGoogleAccount({
      provider: "oauth_google",
      emailAddress: "creator@example.com",
      approvedScopes: ["profile"],
    });

    const response = await postYoutubeAssignment(
      jsonRequest({ brandId: "brand_1", accountRef: "youtube" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Connect your YouTube channel first");
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.connectedAccountUpdateOne).not.toHaveBeenCalled();
  });
});
