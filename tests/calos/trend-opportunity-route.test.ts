import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/services/calos/trend-opportunities/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  updateMany: vi.fn(),
  findDeliverable: vi.fn(),
  createDeliverable: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-trend-opportunity", () => ({
  CalosTrendOpportunity: {
    findOne: mocks.findOne,
    find: mocks.find,
    updateMany: mocks.updateMany,
  },
}));
vi.mock("@/schemas/calos-deliverable", () => ({
  default: {
    findOne: mocks.findDeliverable,
    create: mocks.createDeliverable,
  },
}));

function request(method: "GET" | "PATCH", body?: unknown): Request {
  return new Request("http://localhost/api/services/calos/trend-opportunities?brandId=brand_1", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    opportunityId: "opp_1",
    status: "suggested",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    candidate: {
      title: "Workflow templates",
      platform: "linkedin",
      summary: "A timely format.",
      url: "https://example.com/trend",
    },
    relevanceScore: 0.8,
    reasonCodes: ["product_or_service"],
    matchedSignalPaths: ["identity.productServices"],
    recommendation: "add",
    calendarWindowEndsAt: null,
    reviewedAt: null,
    reviewedBy: null,
    snoozedUntil: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("CalOS trend opportunity review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.findDeliverable.mockResolvedValue(null);
    mocks.createDeliverable.mockImplementation(async (input: { card: { id: string } }) => input);
  });

  it("rejects review actions without a signed-in user", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);
    expect(response.status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("rejects an invalid snooze duration before touching the database", async () => {
    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "snooze", snoozeDays: 31 }) as never);
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toContain("snoozeDays");
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("accepts only the scoped reviewable opportunity and creates one source-linked ThinkForge-ready draft", async () => {
    const doc = opportunity();
    mocks.findOne.mockResolvedValue(doc);

    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(doc.status).toBe("accepted");
    expect(doc.reviewedBy).toBe("user_1");
    expect(doc.snoozedUntil).toBeNull();
    expect(doc.save).toHaveBeenCalledOnce();
    expect(mocks.findOne).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: "opp_1", brandId: "brand_1", ownerUserId: "user_1" }));
    expect(mocks.createDeliverable).toHaveBeenCalledWith(expect.objectContaining({
      sourceTrendOpportunityId: "opp_1",
      card: expect.objectContaining({
        contentFormat: "text",
        trendContext: expect.objectContaining({
          trendId: "opp_1",
          source: "public_trend",
          status: "accepted",
          provenance: ["https://example.com/trend"],
        }),
      }),
    }));
    expect(payload.action).toBe("accept");
    expect(typeof payload.deliverableId).toBe("string");
  });

  it("reuses the existing source-linked draft when an accepted action is retried", async () => {
    const doc = opportunity({ status: "accepted" });
    mocks.findOne.mockResolvedValue(doc);
    mocks.findDeliverable.mockResolvedValue({ card: { id: "card_existing" }, deletedAt: null });

    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ alreadyApplied: true, deliverableId: "card_existing" });
    expect(mocks.createDeliverable).not.toHaveBeenCalled();
  });

  it("creates an adaptation revision on the aligned card date without changing the original card", async () => {
    const sourceCard = { card: { title: "Operations playbook" }, plannedDates: ["2030-02-01T10:00:00.000Z"], deletedAt: null };
    const doc = opportunity({ recommendation: "adapt", adaptDeliverableId: "mongo_source" });
    mocks.findOne.mockResolvedValue(doc);
    mocks.findDeliverable
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sourceCard);

    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);

    expect(response.status).toBe(200);
    expect(mocks.createDeliverable).toHaveBeenCalledWith(expect.objectContaining({
      card: expect.objectContaining({
        title: "Trend adaptation: Operations playbook",
        plannedDates: ["2030-02-01T10:00:00.000Z"],
      }),
    }));
    expect(sourceCard.card.title).toBe("Operations playbook");
  });

  it("fails loudly without creating a card when an adaptation target was removed", async () => {
    const doc = opportunity({ recommendation: "adapt", adaptDeliverableId: "mongo_source" });
    mocks.findOne.mockResolvedValue(doc);
    mocks.findDeliverable
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer exists");
    expect(doc.status).toBe("suggested");
    expect(doc.save).not.toHaveBeenCalled();
    expect(mocks.createDeliverable).not.toHaveBeenCalled();
  });

  it("does not resurrect a deleted linked trend draft on a retried acceptance", async () => {
    const doc = opportunity({ status: "accepted" });
    mocks.findOne.mockResolvedValue(doc);
    mocks.findDeliverable.mockResolvedValue({ card: { id: "card_deleted" }, deletedAt: new Date("2029-01-01T00:00:00.000Z") });

    const response = await PATCH(request("PATCH", { brandId: "brand_1", opportunityId: "opp_1", action: "accept" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("linked trend draft was deleted");
    expect(mocks.createDeliverable).not.toHaveBeenCalled();
  });

  it("returns only safe public opportunity fields in the review queue", async () => {
    const record = opportunity();
    mocks.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [record] }) }) });
    const response = await GET(request("GET") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.opportunities).toHaveLength(1);
    expect(payload.opportunities[0]).not.toHaveProperty("matchedSignalPaths");
    expect(payload.opportunities[0]).not.toHaveProperty("acceptedProfileGeneratedAt");
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
});