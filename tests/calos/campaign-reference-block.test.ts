import { describe, it, expect, vi, beforeEach } from "vitest";

// Two chained Mongoose query mocks: findOne(...).select(...).lean() for BOTH the brand-level and the
// campaign-level reference stores (the resolver merges them).
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

import { resolveReferenceBlock } from "@/lib/calos/generate/generators/_campaign-references";

const personalScope = {
  brandId: "brand_1",
  ownerUserId: "user_1",
  orgId: null,
};

const ready = (name: string, fact: string) => ({
  id: name, type: "pdf", name, status: "ready",
  ingested: { summary: `About ${name}`, atomicFacts: [fact], viralHooks: [] },
});

beforeEach(() => {
  campLean.mockReset();
  brandLean.mockReset();
  campFindOne.mockClear();
  brandFindOne.mockClear();
});

describe("resolveReferenceBlock", () => {
  it("returns empty (no query) when there is no brandId", async () => {
    const block = await resolveReferenceBlock({ ...personalScope, campaignId: "camp_1", brandId: "" });
    expect(block).toBe("");
    expect(brandFindOne).not.toHaveBeenCalled();
  });

  it("returns empty (no query) when the authenticated owner is missing", async () => {
    const block = await resolveReferenceBlock({ ...personalScope, ownerUserId: "" });
    expect(block).toBe("");
    expect(brandFindOne).not.toHaveBeenCalled();
  });

  it("grounds on BRAND references even with no campaign (the no-campaign fix)", async () => {
    brandLean.mockResolvedValueOnce({ references: [ready("Brand Guide.pdf", "Founded in 2019")] });
    const block = await resolveReferenceBlock(personalScope);
    expect(block).toContain("<reference_material>");
    expect(block).toContain("Source: Brand Guide.pdf");
    expect(block).toContain("- Founded in 2019");
    // Personal references are always owner-scoped; campaign is not queried when absent.
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", ownerUserId: "user_1" });
    expect(campFindOne).not.toHaveBeenCalled();
  });

  it("merges brand + campaign references when the card has a campaign", async () => {
    brandLean.mockResolvedValueOnce({ references: [ready("Brand Guide.pdf", "Founded in 2019")] });
    campLean.mockResolvedValueOnce({ references: [ready("Launch Brief.pdf", "Ships Sept 12")] });
    const block = await resolveReferenceBlock({ ...personalScope, campaignId: "camp_1" });
    expect(block).toContain("Founded in 2019"); // brand
    expect(block).toContain("Ships Sept 12"); // campaign
    expect(campFindOne).toHaveBeenCalledWith({
      _id: "camp_1",
      brandId: "brand_1",
      ownerUserId: "user_1",
      deletedAt: null,
    });
  });

  it("uses the active organization boundary instead of a user-global brand lookup", async () => {
    brandLean.mockResolvedValueOnce({ references: [ready("Org Guide.pdf", "Shared only with this agency")] });
    const block = await resolveReferenceBlock({ ...personalScope, orgId: "org_1" });

    expect(block).toContain("Shared only with this agency");
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", orgId: "org_1" });
  });

  it("excludes non-ready / un-ingested references at both levels", async () => {
    brandLean.mockResolvedValueOnce({ references: [{ id: "p", type: "link", name: "x", status: "pending", ingested: null }] });
    campLean.mockResolvedValueOnce({ references: [{ id: "e", type: "text", name: "y", status: "ready", ingested: null }] });
    expect(await resolveReferenceBlock({ ...personalScope, campaignId: "camp_1" })).toBe("");
  });

  it("returns empty when neither level has references", async () => {
    brandLean.mockResolvedValueOnce(null);
    campLean.mockResolvedValueOnce({ references: [] });
    expect(await resolveReferenceBlock({ ...personalScope, campaignId: "camp_1" })).toBe("");
  });

  it("never throws — a DB error degrades to reference-less generation", async () => {
    brandLean.mockRejectedValueOnce(new Error("mongo down"));
    campLean.mockRejectedValueOnce(new Error("mongo down"));
    expect(await resolveReferenceBlock({ ...personalScope, campaignId: "camp_1" })).toBe("");
  });
});
