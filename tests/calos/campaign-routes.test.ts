import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/services/calos/campaigns/[id]/route";
import { POST } from "@/app/api/services/calos/campaigns/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  create: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/calos-campaign", () => ({
  default: {
    create: mocks.create,
    findOne: mocks.findOne,
  },
}));

function request(body: unknown): Request {
  return new Request("http://localhost/api/services/calos/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json();
}

describe("CalOS campaign routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.create.mockImplementation(async (payload) => ({ _id: "campaign_1", ...payload }));
  });

  it("rejects invalid create cadence before touching the database", async () => {
    const response = await POST(request({
      brandId: "default",
      name: "Bad cadence",
      cadenceRules: [{ platform: "linkedin", perWeek: 8, preferredDays: [1] }],
    }) as never);
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("cadenceRules[0].perWeek must be between 0 and 7");
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("normalizes create cadence before persistence", async () => {
    const response = await POST(request({
      brandId: "default",
      name: "  Launch Sprint  ",
      cadenceRules: [{ platform: " TikTok ", perWeek: 2, preferredDays: [5, 3, 3] }],
    }) as never);

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      brandId: "default",
      name: "Launch Sprint",
      cadenceRules: [{ platform: "tiktok", perWeek: 2, preferredDays: [3, 5] }],
    }));
  });

  it("rejects invalid update cadence before loading the campaign", async () => {
    const response = await PATCH(
      request({
        brandId: "default",
        updates: { cadenceRules: [{ platform: "linkedin", perWeek: 1, preferredDays: [7] }] },
      }) as never,
      { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) }
    );
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("cadenceRules[0].preferredDays[0] must be an integer from 0 to 6");
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});