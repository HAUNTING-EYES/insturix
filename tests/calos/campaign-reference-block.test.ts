import { describe, it, expect, vi, beforeEach } from "vitest";

// Chained Mongoose query mock: findOne(...).select(...).lean() -> resolves the lean value.
const { lean, select, findOne } = vi.hoisted(() => {
  const lean = vi.fn();
  const select = vi.fn(() => ({ lean }));
  const findOne = vi.fn(() => ({ select }));
  return { lean, select, findOne };
});

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/schemas/calos-campaign", () => ({ default: { findOne } }));

import { resolveCampaignReferenceBlock } from "@/lib/calos/generate/generators/_campaign-references";

const readyRef = {
  id: "r1",
  type: "pdf",
  name: "Q3 Launch Brief.pdf",
  status: "ready",
  ingested: {
    summary: "The Q3 launch targets SMB owners.",
    atomicFacts: ["Ships Sept 12", "Priced at $29/mo", "Cuts setup time 60%"],
    viralHooks: ["Setup used to take a week"],
  },
};

beforeEach(() => {
  findOne.mockClear();
  select.mockClear();
  lean.mockReset();
});

describe("resolveCampaignReferenceBlock", () => {
  it("returns empty (no DB hit) when there is no campaignId", async () => {
    const block = await resolveCampaignReferenceBlock(null, "brand_1");
    expect(block).toBe("");
    expect(findOne).not.toHaveBeenCalled();
  });

  it("grounds the prompt in a ready reference's facts, hooks, and source name", async () => {
    lean.mockResolvedValueOnce({ references: [readyRef] });
    const block = await resolveCampaignReferenceBlock("camp_1", "brand_1");

    expect(block).toContain("<reference_material>");
    expect(block).toContain("Source: Q3 Launch Brief.pdf");
    expect(block).toContain("- Ships Sept 12");
    expect(block).toContain("Priced at $29/mo");
    expect(block).toContain("Setup used to take a week");
    // scoped by campaign id + brand id (no cross-brand bleed)
    expect(findOne).toHaveBeenCalledWith({ _id: "camp_1", brandId: "brand_1", deletedAt: null });
  });

  it("excludes references that are not ready or have no ingested facts", async () => {
    lean.mockResolvedValueOnce({
      references: [
        { id: "p", type: "link", name: "pending.com", status: "pending", ingested: null },
        { id: "f", type: "pdf", name: "failed.pdf", status: "failed", ingested: null },
        { id: "e", type: "text", name: "empty", status: "ready", ingested: null },
      ],
    });
    const block = await resolveCampaignReferenceBlock("camp_1", "brand_1");
    expect(block).toBe("");
  });

  it("returns empty when the campaign has no references", async () => {
    lean.mockResolvedValueOnce({ references: [] });
    expect(await resolveCampaignReferenceBlock("camp_1", "brand_1")).toBe("");
  });

  it("never throws — a DB error degrades to reference-less generation", async () => {
    lean.mockRejectedValueOnce(new Error("mongo down"));
    expect(await resolveCampaignReferenceBlock("camp_1", "brand_1")).toBe("");
  });
});
