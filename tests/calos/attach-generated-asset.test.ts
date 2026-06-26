import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factory (hoisted above imports) can reference it safely.
const { findOne } = vi.hoisted(() => ({ findOne: vi.fn() }));

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/schemas/calos-deliverable", () => ({ default: { findOne } }));

import { attachGeneratedAsset, markGeneratedAssetFailed } from "@/lib/calos/attach-generated-asset";

interface FakeDoc {
  editorialStatus: string;
  assetUrl: string | null;
  errorMessage: string | null;
  serviceRef: unknown;
  save: ReturnType<typeof vi.fn>;
}

function fakeDoc(over: Partial<FakeDoc> = {}): FakeDoc {
  return {
    editorialStatus: "drafting",
    assetUrl: null,
    errorMessage: null,
    serviceRef: undefined,
    save: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => findOne.mockReset());

describe("attachGeneratedAsset", () => {
  it("attaches the asset and advances drafting → generated (first write)", async () => {
    const doc = fakeDoc();
    findOne.mockResolvedValue(doc);

    const r = await attachGeneratedAsset({
      deliverableId: "c1",
      ownerUserId: "u1",
      brandId: "b1",
      assetUrl: "https://r2/img.png",
      serviceRef: { service: "clickatron", jobId: "j1", variationId: "v1" },
    });

    expect(r).toEqual({ ok: true, reason: "attached" });
    expect(doc.assetUrl).toBe("https://r2/img.png");
    expect(doc.editorialStatus).toBe("generated");
    expect(doc.errorMessage).toBeNull();
    expect(doc.serviceRef).toMatchObject({ service: "clickatron", jobId: "j1", variationId: "v1" });
    expect(doc.save).toHaveBeenCalledOnce();
  });

  it("is idempotent: skips (no save) when an asset already landed — guards QStash retries", async () => {
    const doc = fakeDoc({ assetUrl: "https://r2/old.png", editorialStatus: "generated" });
    findOne.mockResolvedValue(doc);

    const r = await attachGeneratedAsset({
      deliverableId: "c1",
      ownerUserId: "u1",
      brandId: "b1",
      assetUrl: "https://r2/new.png",
    });

    expect(r).toEqual({ ok: true, reason: "already_attached" });
    expect(doc.assetUrl).toBe("https://r2/old.png");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("never clobbers a card that advanced past drafting (e.g. in_review)", async () => {
    const doc = fakeDoc({ editorialStatus: "in_review" });
    findOne.mockResolvedValue(doc);

    const r = await attachGeneratedAsset({
      deliverableId: "c1",
      ownerUserId: "u1",
      brandId: "b1",
      assetUrl: "https://r2/x.png",
    });

    expect(r.reason).toBe("already_attached");
    expect(doc.editorialStatus).toBe("in_review");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("returns not_found (logged loud) when no deliverable matches the scope", async () => {
    findOne.mockResolvedValue(null);

    const r = await attachGeneratedAsset({
      deliverableId: "missing",
      ownerUserId: "u1",
      brandId: "b1",
      assetUrl: "https://r2/x.png",
    });

    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects invalid input without touching the DB", async () => {
    const r = await attachGeneratedAsset({ deliverableId: "", ownerUserId: "u1", brandId: "b1", assetUrl: "" });
    expect(r.reason).toBe("invalid");
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe("markGeneratedAssetFailed", () => {
  it("records the error and keeps the card in drafting", async () => {
    const doc = fakeDoc();
    findOne.mockResolvedValue(doc);

    const r = await markGeneratedAssetFailed({
      deliverableId: "c1",
      ownerUserId: "u1",
      brandId: "b1",
      errorMessage: "fal timeout",
      serviceRef: { service: "clickatron", jobId: "j1" },
    });

    expect(r.ok).toBe(true);
    expect(doc.errorMessage).toBe("fal timeout");
    expect(doc.editorialStatus).toBe("drafting");
    expect(doc.serviceRef).toMatchObject({ service: "clickatron", jobId: "j1" });
    expect(doc.save).toHaveBeenCalledOnce();
  });

  it("success wins: does not overwrite a card that already generated an asset", async () => {
    const doc = fakeDoc({ assetUrl: "https://r2/img.png", editorialStatus: "generated" });
    findOne.mockResolvedValue(doc);

    const r = await markGeneratedAssetFailed({
      deliverableId: "c1",
      ownerUserId: "u1",
      brandId: "b1",
      errorMessage: "late failure",
    });

    expect(r.reason).toBe("not_attachable");
    expect(doc.errorMessage).toBeNull();
    expect(doc.save).not.toHaveBeenCalled();
  });
});
