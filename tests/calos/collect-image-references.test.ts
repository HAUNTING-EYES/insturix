import { beforeEach, describe, expect, it, vi } from "vitest";

const { brandFindOne, brandLean, campaignFindOne, campaignLean } = vi.hoisted(() => {
  const brandLean = vi.fn();
  const brandFindOne = vi.fn(() => ({ select: () => ({ lean: brandLean }) }));
  const campaignLean = vi.fn();
  const campaignFindOne = vi.fn(() => ({ select: () => ({ lean: campaignLean }) }));
  return { brandFindOne, brandLean, campaignFindOne, campaignLean };
});

vi.mock("@/schemas/calos-brand-references", () => ({ default: { findOne: brandFindOne } }));
vi.mock("@/schemas/calos-campaign", () => ({ default: { findOne: campaignFindOne } }));

import { collectImageReferenceUrls } from "@/lib/calos/references/collect-image-references";

const personalScope = {
  brandId: "brand_1",
  userId: "user_1",
  orgId: null,
};

const image = (url: string, status: "pending" | "ready" | "failed" = "ready") => ({
  id: url,
  type: "image",
  name: "reference.png",
  url,
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  brandLean.mockResolvedValue(null);
  campaignLean.mockResolvedValue(null);
});

describe("collectImageReferenceUrls", () => {
  it("does not query when the authorized caller or brand is missing", async () => {
    await expect(collectImageReferenceUrls({ ...personalScope, userId: "" })).resolves.toEqual([]);
    expect(brandFindOne).not.toHaveBeenCalled();
  });

  it("uses the personal owner scope for brand and campaign image references", async () => {
    brandLean.mockResolvedValueOnce({ references: [image("https://r2.example/brand.png")] });
    campaignLean.mockResolvedValueOnce({ references: [image("https://r2.example/campaign.png")] });

    await expect(collectImageReferenceUrls({ ...personalScope, campaignId: "campaign_1" })).resolves.toEqual([
      "https://r2.example/brand.png",
      "https://r2.example/campaign.png",
    ]);
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", ownerUserId: "user_1" });
    expect(campaignFindOne).toHaveBeenCalledWith({
      _id: "campaign_1",
      brandId: "brand_1",
      ownerUserId: "user_1",
      deletedAt: null,
    });
  });

  it("uses the active organization boundary and never sends unready image assets", async () => {
    brandLean.mockResolvedValueOnce({
      references: [
        image("https://r2.example/ready.png"),
        image("https://r2.example/pending.png", "pending"),
      ],
    });

    await expect(collectImageReferenceUrls({ ...personalScope, orgId: "org_1" })).resolves.toEqual([
      "https://r2.example/ready.png",
    ]);
    expect(brandFindOne).toHaveBeenCalledWith({ brandId: "brand_1", orgId: "org_1" });
  });
});
