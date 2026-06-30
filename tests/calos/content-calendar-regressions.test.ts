import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  connectToDatabase: vi.fn(),
  connectedAccountUpdateOne: vi.fn(),
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

import { GET as getYoutubeAccounts } from "@/app/api/services/calos/connect/youtube/accounts/route";
import { POST as postYoutubeAssignment } from "@/app/api/services/calos/connect/youtube/assign/route";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
type YoutubeAssignRequest = Parameters<typeof postYoutubeAssignment>[0];

function jsonRequest(body: unknown): YoutubeAssignRequest {
  return new Request("http://localhost/api/services/calos/connect/youtube/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as YoutubeAssignRequest;
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
  });

  it("opens a day inspector instead of surprise-creating a draft on date click", () => {
    const root = process.cwd();
    const calendarSource = readFileSync(
      join(root, "components/dashboard/ThinkForge/Calendar.tsx"),
      "utf8",
    );
    const pageSource = readFileSync(join(root, "app/dashboard/calos/page.tsx"), "utf8");

    expect(calendarSource).toContain("setSelectedDay(day)");
    expect(calendarSource).toContain("Day Inspector");
    expect(calendarSource).toContain("void handleCreateCardForDate(selectedDay)");
    expect(calendarSource).toContain("clickEvent.stopPropagation()");
    expect(calendarSource).toContain("isEmptyFreshDraft(cardToClose, freshDraftId)");
    expect(calendarSource).toContain("Discard this empty draft?");
    expect(calendarSource).not.toContain("void handleCreateCardForDate(day)");
    expect(pageSource).toContain("onDeleteDate={handleDeleteDay}");
  });

  it("wires calendar bulk cleanup to scoped soft-delete", () => {
    const root = process.cwd();
    const routeSource = readFileSync(join(root, "app/api/services/calos/deliverables/route.ts"), "utf8");
    const hookSource = readFileSync(join(root, "app/dashboard/calos/hooks/useCalosDeliverables.ts"), "utf8");
    const pageSource = readFileSync(join(root, "app/dashboard/calos/page.tsx"), "utf8");

    expect(routeSource).toContain("export async function DELETE");
    expect(routeSource).toContain("CalosDeliverable.updateMany");
    expect(routeSource).toContain("deletedAt: new Date()");
    expect(routeSource).toContain("scope=all or ids[] is required");
    expect(hookSource).toContain("deleteCardsForDate");
    expect(hookSource).toContain("clearAll");
    expect(pageSource).toContain("Clear all");
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