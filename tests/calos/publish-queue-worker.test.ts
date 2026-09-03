import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  updateMany: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deliverableFindOne: vi.fn(),
  connectedAccountFindOne: vi.fn(),
  loadCalosAssignmentHealth: vi.fn(),
  getPublisher: vi.fn(),
  validatePublishReadiness: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));
vi.mock("@/schemas/calos-scheduled-publish", () => ({
  default: {
    updateMany: mocks.updateMany,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));
vi.mock("@/schemas/calos-deliverable", () => ({
  default: {
    findOne: mocks.deliverableFindOne,
  },
}));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: {
    findOne: mocks.connectedAccountFindOne,
  },
}));
vi.mock("@/lib/calos/publishing-assignment-health", () => ({
  loadCalosAssignmentHealth: mocks.loadCalosAssignmentHealth,
}));
vi.mock("@/lib/calos/publish/contract", () => ({
  getPublisher: mocks.getPublisher,
  validatePublishReadiness: mocks.validatePublishReadiness,
}));

import { GET } from "@/app/api/cron/process-publish-queue/route";

type MockPublishRow = {
  deliverableId: string;
  ownerUserId: string;
  orgId: string | null;
  brandId: string;
  platform: "linkedin" | "instagram";
  accountRef: string;
  payload: Record<string, unknown>;
  publishAt: Date;
  status: string;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lastError: string | null;
  postId: string | null;
  postUrl: string | null;
  save: ReturnType<typeof vi.fn>;
};

function makeRow(overrides: Partial<MockPublishRow> = {}) {
  const row = {
    deliverableId: "card_1",
    ownerUserId: "owner_1",
    orgId: null,
    brandId: "brand_1",
    platform: "linkedin" as const,
    accountRef: "linkedin_1",
    payload: {
      schemaVersion: 1,
      approvalVersion: 2,
      contentFormat: "text",
      caption: "Launch update",
      title: "Launch",
      media: { kind: "none", url: null },
    },
    publishAt: new Date("2026-07-29T09:00:00.000Z"),
    status: "claimed",
    attempts: 1,
    maxAttempts: 3,
    lockedAt: new Date("2026-07-29T09:59:00.000Z"),
    lastError: null,
    postId: null,
    postUrl: null,
    save: vi.fn(),
    ...overrides,
  } satisfies MockPublishRow;
  row.save.mockImplementation(async () => row);
  return row;
}

function approvedQuery(version = 2) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => ({ editorialStatus: "approved", version })),
    })),
  };
}

function assignmentQuery(assignment: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => assignment),
    })),
  };
}

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/process-publish-queue", {
    headers: { Authorization: "Bearer cron-secret" },
  });
}

describe("CalOS publish queue worker reliability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:00:00.000Z"));
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "cron-secret";
    delete process.env.CALOS_PUBLISH_KILL_SWITCH;

    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.deliverableFindOne.mockReturnValue(approvedQuery());
    mocks.connectedAccountFindOne.mockReturnValue(assignmentQuery({
      platform: "linkedin",
      accountRef: "linkedin_1",
      ownerUserId: "owner_1",
      accountType: "personal",
    }));
    mocks.loadCalosAssignmentHealth.mockResolvedValue({
      linkedin: {
        state: "assigned",
        accountRef: "linkedin_1",
        displayName: "Owner",
        message: null,
      },
    });
    mocks.getPublisher.mockReturnValue(undefined);
    mocks.validatePublishReadiness.mockReturnValue({
      ok: true,
      format: "text",
      mediaKind: "none",
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CALOS_PUBLISH_KILL_SWITCH;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("terminalizes stale publishing rows as ambiguous instead of reposting them", async () => {
    mocks.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      {
        status: "publishing",
        postId: null,
        $or: [{ lockedAt: { $lt: expect.any(Date) } }, { lockedAt: null }],
      },
      {
        $set: {
          status: "failed",
          lockedAt: null,
          lastError: expect.stringContaining("outcome is unknown"),
          outcomeAmbiguous: true, // audit 6b: structured flag rides the terminalization
        },
      },
    );
    expect(payload).toMatchObject({ failed: 2, ambiguous: 2, claimed: 0 });
    expect(mocks.getPublisher).not.toHaveBeenCalled();
  });

  it("verifies approval independently of the assigned account token owner", async () => {
    const row = makeRow({ ownerUserId: "publisher_1", orgId: "org_1" });
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.connectedAccountFindOne.mockReturnValue(assignmentQuery({
      platform: "linkedin",
      accountRef: "linkedin_1",
      ownerUserId: "publisher_1",
      accountType: "organization",
    }));

    await GET(cronRequest());

    expect(mocks.deliverableFindOne).toHaveBeenCalledWith({
      "card.id": "card_1",
      brandId: "brand_1",
      orgId: "org_1",
      deletedAt: null,
    });
    expect(mocks.connectedAccountFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "publisher_1" }),
    );
  });

  it("refuses provider execution when the snapshotted account is no longer assigned", async () => {
    const row = makeRow({ orgId: "org_1" });
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.connectedAccountFindOne.mockReturnValue(assignmentQuery(null));
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.connectedAccountFindOne).toHaveBeenCalledWith({
      brandId: "brand_1",
      platform: "linkedin",
      accountRef: "linkedin_1",
      ownerUserId: "owner_1",
      orgId: "org_1",
    });
    expect(publisher).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("no longer assigned");
    expect(payload).toMatchObject({ failed: 1, published: 0 });
  });

  it("fails closed when live account health requires reconnection", async () => {
    const row = makeRow();
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.loadCalosAssignmentHealth.mockResolvedValue({
      linkedin: {
        state: "reconnect",
        accountRef: "linkedin_1",
        displayName: "Owner",
        message: "LinkedIn expired. Reconnect before publishing.",
      },
    });
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(publisher).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("LinkedIn expired. Reconnect before publishing.");
  });

  it("backs off when account health cannot be checked before provider execution", async () => {
    const row = makeRow();
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.loadCalosAssignmentHealth.mockRejectedValue(new Error("identity provider unavailable"));
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(publisher).not.toHaveBeenCalled();
    expect(row.status).toBe("pending");
    expect(row.publishAt.toISOString()).toBe("2026-07-29T10:05:00.000Z");
    expect(row.lastError).toContain("identity provider unavailable");
    expect(payload).toMatchObject({ retried: 1, failed: 0 });
  });

  it("refuses provider execution when the queued media snapshot fails preflight", async () => {
    const row = makeRow({
      payload: {
        schemaVersion: 1,
        approvalVersion: 2,
        contentFormat: "image",
        caption: "Launch update",
        media: { kind: "image", url: null },
      },
    });
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(publisher);
    mocks.validatePublishReadiness.mockReturnValue({
      ok: false,
      error: "LinkedIn image posts are not publish-ready.",
    });

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.validatePublishReadiness).toHaveBeenCalledWith({
      platform: "linkedin",
      contentFormat: "image",
      assetUrl: null,
      copyText: "Launch update",
    });
    expect(publisher).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("not publish-ready");
    expect(payload).toMatchObject({ failed: 1, published: 0 });
  });

  it("refuses a snapshot bound to an older approved deliverable version", async () => {
    const row = makeRow();
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.deliverableFindOne.mockReturnValue(approvedQuery(3));
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(publisher).not.toHaveBeenCalled();
    expect(mocks.connectedAccountFindOne).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("snapshotted version");
  });

  it("fails legacy untyped queue rows closed before account or provider work", async () => {
    const row = makeRow({ payload: { caption: "Legacy copy" } });
    const publisher = vi.fn();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(mocks.validatePublishReadiness).not.toHaveBeenCalled();
    expect(mocks.connectedAccountFindOne).not.toHaveBeenCalled();
    expect(publisher).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("missing schema version");
  });

  it("maps a typed image snapshot to the publisher media parameter", async () => {
    const row = makeRow({
      platform: "instagram",
      accountRef: "instagram_1",
      payload: {
        schemaVersion: 1,
        approvalVersion: 2,
        contentFormat: "image",
        caption: "Launch image",
        title: "Launch",
        media: { kind: "image", url: "https://cdn.example.com/launch.png" },
      },
    });
    const publisher = vi.fn(async () => ({ ok: true, postId: "post_1" }));
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.loadCalosAssignmentHealth.mockResolvedValue({
      instagram: {
        state: "assigned",
        accountRef: "instagram_1",
        displayName: "Brand",
        message: null,
      },
    });
    mocks.validatePublishReadiness.mockReturnValue({
      ok: true,
      format: "image",
      mediaKind: "image",
    });
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(publisher).toHaveBeenCalledWith(expect.objectContaining({
      caption: "Launch image",
      title: "Launch",
      imageUrl: "https://cdn.example.com/launch.png",
    }));
  });

  it("backs off a retry proven to have failed before the provider call", async () => {
    const row = makeRow();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(
      vi.fn(async () => ({
        ok: false,
        error: "Media fetch timed out",
        retryable: true,
        providerAttempted: false,
      })),
    );

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $or: [
          { status: "pending", publishAt: { $lte: expect.any(Date) } },
          {
            status: "claimed",
            $or: [{ lockedAt: { $lt: expect.any(Date) } }, { lockedAt: null }],
          },
        ],
      },
      { $set: { status: "claimed", lockedAt: expect.any(Date) }, $inc: { attempts: 1 } },
      { sort: { publishAt: 1 }, new: true },
    );
    expect(row.status).toBe("pending");
    expect(row.publishAt.toISOString()).toBe("2026-07-29T10:05:00.000Z");
    expect(row.lockedAt).toBeNull();
    expect(payload).toMatchObject({ retried: 1, failed: 0, ambiguous: 0 });
  });

  it("backs off a provider rate-limit response that is safe to retry", async () => {
    const row = makeRow();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(
      vi.fn(async () => ({
        ok: false,
        error: "Rate limited",
        retryable: true,
        responseStatus: 429,
      })),
    );

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(row.status).toBe("pending");
    expect(row.publishAt.toISOString()).toBe("2026-07-29T10:05:00.000Z");
    expect(payload).toMatchObject({ retried: 1, failed: 0, ambiguous: 0 });
  });

  it("does not automatically retry a provider 5xx with an unknown outcome", async () => {
    const row = makeRow();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(
      vi.fn(async () => ({
        ok: false,
        error: "Provider unavailable",
        retryable: true,
        responseStatus: 503,
      })),
    );

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("outcome is unknown");
    expect(payload).toMatchObject({ retried: 0, failed: 1, ambiguous: 1 });
  });

  it("does not automatically retry a thrown provider call with an unknown outcome", async () => {
    const row = makeRow();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(
      vi.fn(async () => {
        throw new Error("socket closed after upload");
      }),
    );

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("outcome is unknown");
    expect(row.lastError).toContain("socket closed after upload");
    expect(payload).toMatchObject({ failed: 1, ambiguous: 1, retried: 0 });
  });

  it("does not mark a provider success as published without a durable post id", async () => {
    const row = makeRow();
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(vi.fn(async () => ({ ok: true })));

    const response = await GET(cronRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("without a post id");
    expect(payload).toMatchObject({ published: 0, failed: 1, ambiguous: 1 });
  });

  it("keeps snapshotted publishing identity authoritative over queued payload fields", async () => {
    const row = makeRow({
      payload: {
        schemaVersion: 1,
        approvalVersion: 2,
        contentFormat: "text",
        caption: "Launch update",
        title: "Launch",
        media: { kind: "none", url: null },
        ownerUserId: "attacker_owner",
        deliverableId: "attacker_card",
        brandId: "attacker_brand",
        accountRef: "attacker_account",
      },
    });
    const publisher = vi.fn(async () => ({
      ok: true,
      postId: "post_1",
      postUrl: "https://linkedin.example/post_1",
    }));
    mocks.findOneAndUpdate.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    mocks.getPublisher.mockReturnValue(publisher);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(publisher).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "Launch update",
        ownerUserId: "owner_1",
        deliverableId: "card_1",
        brandId: "brand_1",
        accountRef: "linkedin_1",
      }),
    );
  });
});
