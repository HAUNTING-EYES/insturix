import { beforeEach, describe, expect, it, vi } from "vitest";

const { campLean, campFindOne, brandLean, brandFindOne } = vi.hoisted(() => {
  const campLean = vi.fn();
  const campFindOne = vi.fn(() => ({ select: () => ({ lean: campLean }) }));
  const brandLean = vi.fn();
  const brandFindOne = vi.fn(() => ({ select: () => ({ lean: brandLean }) }));
  return { campLean, campFindOne, brandLean, brandFindOne };
});

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/schemas/calos-campaign", () => ({ default: { findOne: campFindOne } }));
vi.mock("@/schemas/calos-brand-references", () => ({ default: { findOne: brandFindOne } }));

import {
  MAX_CALOS_WRITING_REFERENCES,
  resolveCalosReferenceFacts,
} from "@/lib/calos/generate/generators/_campaign-references";

const personalScope = {
  brandId: "brand_1",
  ownerUserId: "user_1",
  orgId: null,
};

const ready = (id: string, name: string, fact: string, type = "pdf") => ({
  id,
  type,
  name,
  status: "ready",
  url: `https://cdn.example.com/${id}`,
  ingested: { summary: `About ${name}`, atomicFacts: [fact], viralHooks: ["Do not treat this as a fact"] },
});

beforeEach(() => {
  campLean.mockReset();
  brandLean.mockReset();
  campFindOne.mockClear();
  brandFindOne.mockClear();
});

describe("resolveCalosReferenceFacts", () => {
  it.each([
    [{ ...personalScope, brandId: "" }, "selected brand"],
    [{ ...personalScope, ownerUserId: "" }, "authenticated owner"],
  ])("rejects invalid authority before querying", async (params, message) => {
    await expect(resolveCalosReferenceFacts(params)).rejects.toThrow(message);
    expect(brandFindOne).not.toHaveBeenCalled();
  });

  it("returns typed brand evidence without converting creative hooks into facts", async () => {
    brandLean.mockResolvedValueOnce({
      references: [ready("brand-guide", "Brand Guide.pdf", "Founded in 2019")],
    });

    await expect(resolveCalosReferenceFacts(personalScope)).resolves.toEqual([
      {
        id: "calos_brand_brand-guide",
        title: "Brand Guide.pdf",
        summary: "About Brand Guide.pdf\nFounded in 2019",
        tags: ["calos-reference", "brand-reference", "pdf"],
        source: "https://cdn.example.com/brand-guide",
      },
    ]);
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", ownerUserId: "user_1" });
    expect(campFindOne).not.toHaveBeenCalled();
  });

  it("merges scoped brand and campaign evidence", async () => {
    brandLean.mockResolvedValueOnce({ references: [ready("brand", "Brand Guide", "Founded in 2019")] });
    campLean.mockResolvedValueOnce({ references: [ready("launch", "Launch Brief", "Ships Sept 12")] });

    const facts = await resolveCalosReferenceFacts({ ...personalScope, campaignId: "camp_1" });

    expect(facts.map((fact) => fact.id)).toEqual(["calos_brand_brand", "calos_campaign_launch"]);
    expect(campFindOne).toHaveBeenCalledWith({
      _id: "camp_1",
      brandId: "brand_1",
      ownerUserId: "user_1",
      deletedAt: null,
    });
  });

  it("uses the active organization boundary", async () => {
    brandLean.mockResolvedValueOnce({ references: [ready("org", "Org Guide", "Agency-only fact")] });
    await resolveCalosReferenceFacts({ ...personalScope, orgId: "org_1" });
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", orgId: "org_1" });
  });

  it("excludes pending, un-ingested, and evidence-empty references", async () => {
    brandLean.mockResolvedValueOnce({
      references: [
        { id: "pending", type: "link", name: "Pending", status: "pending", ingested: null },
        { id: "empty", type: "text", name: "Empty", status: "ready", ingested: { atomicFacts: [], viralHooks: ["Hook"] } },
      ],
    });
    await expect(resolveCalosReferenceFacts(personalScope)).resolves.toEqual([]);
  });

  it("propagates storage failure instead of silently removing authorized evidence", async () => {
    brandLean.mockRejectedValueOnce(new Error("mongo down"));
    campLean.mockRejectedValueOnce(new Error("mongo down"));
    await expect(resolveCalosReferenceFacts({ ...personalScope, campaignId: "camp_1" }))
      .rejects.toThrow("mongo down");
  });

  it("rejects evidence sets that cannot fit the canonical writer ledger", async () => {
    brandLean.mockResolvedValueOnce({
      references: Array.from({ length: MAX_CALOS_WRITING_REFERENCES + 1 }, (_, index) =>
        ready(`ref-${index}`, `Reference ${index}`, `Fact ${index}`)),
    });
    await expect(resolveCalosReferenceFacts(personalScope)).rejects.toThrow("at most 60");
  });

  it("rejects a single oversized evidence payload instead of truncating it", async () => {
    brandLean.mockResolvedValueOnce({
      references: [ready("large", "Large", "x".repeat(4_100))],
    });
    await expect(resolveCalosReferenceFacts(personalScope)).rejects.toThrow("exceeds 4000");
  });
});
