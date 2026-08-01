import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  deliverableFindOne: vi.fn(),
  connectedAccountFind: vi.fn(),
  queueFindOneAndUpdate: vi.fn(),
  queueUpdateOne: vi.fn(),
  toContentCard: vi.fn(),
  emitBrandEvent: vi.fn(),
  createDecisionLearningEvent: vi.fn(),
  calosScope: vi.fn(),
  userFind: vi.fn(),
  transaction: vi.fn(),
  session: { id: "transaction_session" },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));
vi.mock("@/schemas/calos-deliverable", () => ({
  default: { findOne: mocks.deliverableFindOne },
}));
vi.mock("@/schemas/calos-connected-account", () => ({
  default: { find: mocks.connectedAccountFind },
}));
vi.mock("@/schemas/calos-scheduled-publish", () => ({
  default: {
    findOneAndUpdate: mocks.queueFindOneAndUpdate,
    updateOne: mocks.queueUpdateOne,
  },
}));
vi.mock("@/lib/calos/deliverable-mapper", () => ({
  toContentCard: mocks.toContentCard,
}));
vi.mock("@/lib/shared/brand-events", () => ({
  emitBrandEvent: mocks.emitBrandEvent,
}));
vi.mock("@/lib/calos/calos-brand-learning-events", () => ({
  createCalosDecisionLearningEvent: mocks.createDecisionLearningEvent,
}));
vi.mock("@/lib/calos/scope", () => ({
  calosScope: mocks.calosScope,
}));
vi.mock("@/schemas/user", () => ({
  User: {
    find: mocks.userFind,
  },
}));

import { POST as postDecision } from "@/app/api/services/calos/deliverables/[id]/decision/route";
import { encryptToken } from "@/lib/calos/publish/token-crypto";

type DecisionRequest = Parameters<typeof postDecision>[0];
type DecisionContext = Parameters<typeof postDecision>[1];

function makeDeliverable() {
  return {
    ownerUserId: "owner_1",
    orgId: null,
    brandId: "brand_1",
    campaignId: "campaign_1",
    platform: "linkedin",
    editorialStatus: "in_review",
    version: 2,
    approvals: [] as Array<Record<string, unknown>>,
    plannedDates: ["2026-08-05T09:00:00.000Z"],
    assetText: "Launch copy",
    assetUrl: null as string | null,
    card: {
      id: "card_1",
      date: "2026-08-05T09:00:00.000Z",
      title: "Launch",
      scriptPreview: "Launch preview",
      contentFormat: "text",
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function setAssignments(
  accountRefs: string[],
  ownerUserId = "owner_1",
  overrides: Record<string, unknown> = {},
) {
  const lean = vi.fn().mockResolvedValue(
    accountRefs.map((accountRef) => ({
      platform: "linkedin",
      accountRef,
      accountType: "organization",
      displayName: `Account ${accountRef}`,
      ownerUserId,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      scopes: [],
      ...overrides,
    })),
  );
  const select = vi.fn().mockReturnValue({ lean });
  mocks.connectedAccountFind.mockReturnValue({ select });
  return select;
}

function decisionRequest(decision = "approved"): DecisionRequest {
  return new Request("http://localhost/api/services/calos/deliverables/card_1/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: "brand_1", decision }),
  }) as DecisionRequest;
}

const decisionContext = {
  params: Promise.resolve({ id: "card_1" }),
} as DecisionContext;

describe("CalOS approval publish-target snapshot", () => {
  let deliverable: ReturnType<typeof makeDeliverable>;
  let consoleError: { mockRestore: () => void };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deliverable = makeDeliverable();
    mocks.auth.mockResolvedValue({ userId: "approver_1", orgId: null });
    mocks.connectToDatabase.mockResolvedValue({
      connection: { transaction: mocks.transaction },
    });
    mocks.transaction.mockImplementation(
      async (callback: (session: typeof mocks.session) => Promise<void>) =>
        callback(mocks.session),
    );
    mocks.calosScope.mockReturnValue({
      ownerUserId: "approver_1",
      brandId: "brand_1",
    });
    mocks.deliverableFindOne.mockResolvedValue(deliverable);
    mocks.queueFindOneAndUpdate.mockResolvedValue(null);
    mocks.queueUpdateOne.mockResolvedValue({ acknowledged: true });
    mocks.toContentCard.mockReturnValue({ id: "card_1", stage: "approved" });
    mocks.createDecisionLearningEvent.mockReturnValue({ type: "decision" });
    mocks.emitBrandEvent.mockResolvedValue(undefined);
    vi.stubEnv(
      "CALOS_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      elements: [{
        organization: "urn:li:organization:linkedin_org_1",
        role: "ADMINISTRATOR",
        state: "APPROVED",
      }],
    })));
    mocks.userFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => [{
          clerkUserId: "owner_1",
          linkedinTokens: {
            accessToken: "linkedin_token",
            userId: "linkedin_member_1",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            scopes: ["w_organization_social", "rw_organization_admin"],
            missingScopes: [],
            organizations: [{ id: "linkedin_org_1" }],
          },
        }]),
      })),
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refreshes the current snapshot on an untouched pending publish row", async () => {
    const assignmentSelect = setAssignments(["linkedin_org_1"]);

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.publish).toMatchObject({
      queued: true,
      accountRef: "linkedin_org_1",
    });
    expect(mocks.connectedAccountFind).toHaveBeenCalledWith({
      brandId: "brand_1",
      platform: "linkedin",
    });
    expect(assignmentSelect).toHaveBeenCalledWith(
      expect.stringContaining("scopes"),
    );
    expect(mocks.queueFindOneAndUpdate).toHaveBeenCalledWith(
      { idempotencyKey: "card_1:linkedin" },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          accountRef: "linkedin_org_1",
          ownerUserId: "owner_1",
          brandId: "brand_1",
          platform: "linkedin",
        }),
      }),
      { upsert: true, new: false, session: mocks.session },
    );
    expect(mocks.queueUpdateOne).toHaveBeenCalledWith(
      { idempotencyKey: "card_1:linkedin", status: "pending", attempts: 0, postId: null },
      {
        $set: {
          ownerUserId: "owner_1",
          orgId: null,
          brandId: "brand_1",
          accountRef: "linkedin_org_1",
          payload: { caption: "Launch copy", imageUrl: null },
          publishAt: new Date("2026-08-05T09:00:00.000Z"),
        },
      },
      { session: mocks.session },
    );
    expect(deliverable.editorialStatus).toBe("approved");
    expect(deliverable.save).toHaveBeenCalledWith({ session: mocks.session });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("snapshots the assigned account token owner instead of the deliverable creator", async () => {
    setAssignments(["linkedin_org_1"], "publisher_1");
    mocks.userFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => [{
          clerkUserId: "publisher_1",
          linkedinTokens: {
            accessToken: "publisher_token",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            scopes: ["w_organization_social", "rw_organization_admin"],
            missingScopes: [],
            organizations: [{ id: "linkedin_org_1" }],
          },
        }]),
      })),
    });

    const response = await postDecision(decisionRequest(), decisionContext);

    expect(response.status).toBe(200);
    expect(mocks.queueFindOneAndUpdate).toHaveBeenCalledWith(
      { idempotencyKey: "card_1:linkedin" },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          ownerUserId: "publisher_1",
          accountRef: "linkedin_org_1",
        }),
      }),
      { upsert: true, new: false, session: mocks.session },
    );
    expect(mocks.queueUpdateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({ ownerUserId: "publisher_1" }),
      }),
      { session: mocks.session },
    );
  });

  it("blocks approval when the platform has no assigned account", async () => {
    setAssignments([]);

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("before approval");
    expect(deliverable.editorialStatus).toBe("in_review");
    expect(deliverable.approvals).toEqual([]);
    expect(deliverable.save).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks approval when multiple accounts are assigned to one platform", async () => {
    setAssignments(["linkedin_org_1", "linkedin_org_2"]);

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Multiple LinkedIn accounts");
    expect(deliverable.save).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks approval when the selected format is unsupported by the publisher", async () => {
    deliverable.card.contentFormat = "image";
    deliverable.assetUrl = "https://cdn.example.com/card.png";
    setAssignments(["linkedin_org_1"]);

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("text posts only");
    expect(deliverable.editorialStatus).toBe("in_review");
    expect(deliverable.approvals).toEqual([]);
    expect(deliverable.save).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks LinkedIn organization approval without organization publishing permission", async () => {
    setAssignments(["linkedin_org_1"]);
    mocks.userFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => [{
          clerkUserId: "owner_1",
          linkedinTokens: {
            accessToken: "linkedin_token",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            scopes: ["w_member_social"],
            missingScopes: ["w_organization_social"],
            organizations: [{ id: "linkedin_org_1" }],
          },
        }]),
      })),
    });

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("w_organization_social");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks Model-B organization approval without live authorization scope", async () => {
    setAssignments(["linkedin_org_1"], "owner_1", {
      accessTokenEnc: encryptToken("brand_linkedin_token"),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      scopes: ["w_organization_social"],
    });

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("rw_organization_admin");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks Model-B organization approval when its approved live role is gone", async () => {
    setAssignments(["linkedin_org_1"], "owner_1", {
      accessTokenEnc: encryptToken("brand_linkedin_token"),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      scopes: ["w_organization_social", "rw_organization_admin"],
    });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ elements: [] }));

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer has an approved publishing role");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("organizationAcls?q=roleAssignee"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer brand_linkedin_token",
          "X-Restli-Protocol-Version": "2.0.0",
        }),
      }),
    );
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks LinkedIn organization approval when the owner no longer controls that destination", async () => {
    setAssignments(["linkedin_org_1"]);
    mocks.userFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => [{
          clerkUserId: "owner_1",
          linkedinTokens: {
            accessToken: "linkedin_token",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            scopes: ["w_organization_social", "rw_organization_admin"],
            missingScopes: [],
            organizations: [{ id: "different_org" }],
          },
        }]),
      })),
    });

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer available");
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks approval when the token expires before the planned publish and cannot refresh", async () => {
    setAssignments(["linkedin_org_1"]);
    mocks.userFind.mockReturnValue({
      select: vi.fn(() => ({
        lean: vi.fn(async () => [{
          clerkUserId: "owner_1",
          linkedinTokens: {
            accessToken: "expiring_token",
            expiresAt: new Date("2026-08-01T00:00:00.000Z"),
            scopes: ["w_organization_social", "rw_organization_admin"],
            missingScopes: [],
            organizations: [{ id: "linkedin_org_1" }],
          },
        }]),
      })),
    });

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("cannot refresh");
    expect(deliverable.editorialStatus).toBe("in_review");
    expect(deliverable.save).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows editorial approval for TikTok without pretending auto-publishing exists", async () => {
    deliverable.platform = "tiktok";

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.publish).toEqual({ queued: false, accountRef: null });
    expect(deliverable.editorialStatus).toBe("approved");
    expect(deliverable.save).toHaveBeenCalledOnce();
    expect(mocks.connectedAccountFind).not.toHaveBeenCalled();
    expect(mocks.queueFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rolls back approval when the publish job cannot be enqueued", async () => {
    setAssignments(["linkedin_org_1"]);
    mocks.queueFindOneAndUpdate.mockRejectedValue(new Error("database unavailable"));

    const response = await postDecision(decisionRequest(), decisionContext);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain("Approval was not saved");
    expect(deliverable.editorialStatus).toBe("in_review");
    expect(deliverable.approvals).toEqual([]);
    expect(deliverable.save).toHaveBeenCalledWith({ session: mocks.session });
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("retries scheduling an already-approved version without duplicating its approval", async () => {
    setAssignments(["linkedin_org_1"]);
    deliverable.editorialStatus = "approved";
    deliverable.approvals.push({
      actor: "approver_1",
      decision: "approved",
      version: 2,
      at: new Date("2026-08-01T00:00:00.000Z"),
    });

    const response = await postDecision(decisionRequest(), decisionContext);

    expect(response.status).toBe(200);
    expect(deliverable.approvals).toHaveLength(1);
    expect(mocks.queueFindOneAndUpdate).toHaveBeenCalledOnce();
  });
});
