import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/services/calos/trend-opportunities/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  updateMany: vi.fn(),
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
    candidate: { title: "Workflow templates", platform: "linkedin", summary: "A timely format." },
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

  it("accepts only the scoped reviewable opportunity and records the reviewer", async () => {
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
    expect(payload.action).toBe("accept");
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