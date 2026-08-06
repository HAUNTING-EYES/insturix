import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connect: vi.fn(),
  calosFind: vi.fn(),
  calosFindOne: vi.fn(),
  calosFindOneAndUpdate: vi.fn(),
  calosUpdateOne: vi.fn(),
  calosFindLean: vi.fn(),
  taskFindOne: vi.fn(),
  taskFindOneLean: vi.fn(),
  getIdempotencyKey: vi.fn(),
  getJob: vi.fn(),
  getSessionJobs: vi.fn(),
  failJob: vi.fn(),
  getJobCreditTransaction: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  attachGeneratedAsset: vi.fn(),
  markGeneratedAssetFailed: vi.fn(),
  kickoff: vi.fn(),
  collectReferences: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connect }));
vi.mock("@/schemas/calos-deliverable", () => ({
  default: {
    find: mocks.calosFind,
    findOne: mocks.calosFindOne,
    findOneAndUpdate: mocks.calosFindOneAndUpdate,
    updateOne: mocks.calosUpdateOne,
  },
}));
vi.mock("@/schemas/Clickatron", () => ({
  ClickatronTask: {
    findOne: mocks.taskFindOne,
  },
}));
vi.mock("@/lib/clickatron-jobs", () => ({
  getIdempotencyKey: mocks.getIdempotencyKey,
  getJob: mocks.getJob,
  getSessionJobs: mocks.getSessionJobs,
  failJob: mocks.failJob,
  getJobCreditTransaction: mocks.getJobCreditTransaction,
}));
vi.mock("@/lib/services/creditsService", () => ({
  CreditsService: {
    deductCredits: mocks.deductCredits,
    refundCredits: mocks.refundCredits,
  },
}));
vi.mock("@/lib/calos/attach-generated-asset", () => ({
  attachGeneratedAsset: mocks.attachGeneratedAsset,
  markGeneratedAssetFailed: mocks.markGeneratedAssetFailed,
}));
vi.mock("@/lib/clickatron/create-image-job", () => ({
  createClickatronImageJob: mocks.kickoff,
}));
vi.mock("@/lib/calos/references/collect-image-references", () => ({
  collectImageReferenceUrls: mocks.collectReferences,
}));
vi.mock("nanoid", () => ({ nanoid: mocks.nanoid }));

import { POST } from "@/app/api/services/calos/make-image/route";
import { reconcileExpiredCalosImageClaims } from "@/lib/calos/reconcile-image-claims";

function routeRequest() {
  return new NextRequest("http://localhost/api/services/calos/make-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brandId: "brand_1", deliverableId: "card_1" }),
  });
}

function routeDeliverable(serviceRef: Record<string, unknown> = { service: "clickatron" }) {
  return {
    _id: "mongo_1",
    ownerUserId: "owner_user",
    orgId: "org_1",
    brandId: "brand_1",
    campaignId: null,
    version: 2,
    editorialStatus: "drafting",
    card: { id: "card_1", contentFormat: "image" },
    assetUrl: null,
    imagePrompt: "A precise product still",
    errorMessage: null,
    serviceRef,
  };
}

function candidate(serviceRef: Record<string, unknown> = {}) {
  return {
    _id: "mongo_1",
    ownerUserId: "owner_user",
    brandId: "brand_1",
    version: 2,
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    card: { id: "card_1" },
    serviceRef: {
      service: "clickatron",
      jobId: "claim:claim_1",
      variationId: "claim_1",
      deliverableVersion: 2,
      claimExpiresAt: new Date("2026-08-01T00:15:00.000Z"),
      billingIdempotencyKey: "calos:image:owner_user:claim_1",
      creditTransactionId: "txn_1",
      chargedCredits: 3,
      ...serviceRef,
    },
  };
}

function job(over: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    userId: "owner_user",
    sessionId: "session_1",
    variationId: "claim_1",
    prompt: "prompt",
    status: "completed",
    progress: 100,
    stage: "finalizing",
    attempt: 1,
    startedAt: Date.now() - 20 * 60 * 1000,
    updatedAt: Date.now() - 15 * 60 * 1000,
    trace: [],
    resultRef: "https://assets.example/final.png",
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "member_user", orgId: "org_1" });
  mocks.connect.mockResolvedValue(undefined);
  mocks.calosFind.mockReturnValue({
    sort: vi.fn(() => ({ limit: vi.fn(() => ({ lean: mocks.calosFindLean })) })),
  });
  mocks.calosFindLean.mockResolvedValue([]);
  mocks.taskFindOne.mockReturnValue({
    select: vi.fn(() => ({ lean: mocks.taskFindOneLean })),
  });
  mocks.taskFindOneLean.mockResolvedValue(null);
  mocks.getIdempotencyKey.mockResolvedValue(null);
  mocks.getJob.mockResolvedValue(null);
  mocks.getSessionJobs.mockResolvedValue([]);
  mocks.getJobCreditTransaction.mockReturnValue({ transactionId: "txn_1", chargedCredits: 3 });
  mocks.deductCredits.mockResolvedValue({ success: true, transactionId: "txn_1", creditsDeducted: 3 });
  mocks.refundCredits.mockResolvedValue({ success: true });
  mocks.attachGeneratedAsset.mockResolvedValue({ ok: true, reason: "attached" });
  mocks.markGeneratedAssetFailed.mockResolvedValue({ ok: true, reason: "attached" });
  mocks.calosUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.collectReferences.mockResolvedValue([]);
  mocks.nanoid.mockReturnValue("claim_1");
});

describe("CalOS image recovery", () => {
  it("uses the deliverable owner for org-triggered billing and Clickatron work", async () => {
    const claimed = routeDeliverable({
      service: "clickatron",
      jobId: "claim:claim_1",
      variationId: "claim_1",
      deliverableVersion: 2,
    });
    const linked = routeDeliverable({ service: "clickatron", jobId: "job_1", variationId: "claim_1" });
    mocks.calosFindOne.mockResolvedValue(routeDeliverable());
    mocks.calosFindOneAndUpdate.mockResolvedValueOnce(claimed).mockResolvedValueOnce(linked);
    mocks.kickoff.mockResolvedValue({ ok: true, jobId: "job_1", sessionId: "session_1", variationId: "claim_1" });

    const response = await POST(routeRequest());

    expect(response.status).toBe(200);
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      "owner_user",
      "clickatron",
      "variation",
      expect.objectContaining({ idempotencyKey: expect.stringContaining("owner_user") }),
    );
    expect(mocks.kickoff).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner_user" }));
  });

  it("lands a completed job whose original callback was missed", async () => {
    mocks.calosFindLean.mockResolvedValue([candidate()]);
    mocks.getIdempotencyKey.mockResolvedValue(JSON.stringify({
      sessionId: "session_1", variationId: "claim_1", jobId: "job_1",
    }));
    mocks.getJob.mockResolvedValue(job());

    const result = await reconcileExpiredCalosImageClaims({ now: new Date("2026-08-02T00:00:00.000Z") });

    expect(result.completed).toBe(1);
    expect(mocks.attachGeneratedAsset).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: "owner_user",
      assetUrl: "https://assets.example/final.png",
      serviceRef: expect.objectContaining({ jobId: "job_1", variationId: "claim_1" }),
    }));
  });

  it("exact-refunds a terminal failure and marks the owner's card", async () => {
    mocks.calosFindLean.mockResolvedValue([candidate()]);
    mocks.getIdempotencyKey.mockResolvedValue(JSON.stringify({
      sessionId: "session_1", variationId: "claim_1", jobId: "job_1",
    }));
    mocks.getJob.mockResolvedValue(job({ status: "failed", resultRef: undefined, userId: "charged_member", error: { code: "TIMEOUT", message: "Timed out" } }));

    const result = await reconcileExpiredCalosImageClaims();

    expect(result.failed).toBe(1);
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      "charged_member",
      3,
      expect.stringContaining("Timed out"),
      expect.objectContaining({ originalTransactionId: "txn_1" }),
    );
    expect(mocks.markGeneratedAssetFailed).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "owner_user" }));
  });

  it("terminalizes stale active work before refunding it", async () => {
    mocks.calosFindLean.mockResolvedValue([candidate()]);
    mocks.getIdempotencyKey.mockResolvedValue(JSON.stringify({
      sessionId: "session_1", variationId: "claim_1", jobId: "job_1",
    }));
    mocks.getJob.mockResolvedValue(job({ status: "running", resultRef: undefined }));
    mocks.failJob.mockResolvedValue(job({ status: "failed", resultRef: undefined, error: { code: "CALOS_IMAGE_TIMEOUT", message: "Timed out" } }));

    const result = await reconcileExpiredCalosImageClaims();

    expect(mocks.failJob).toHaveBeenCalledWith("job_1", expect.objectContaining({ code: "CALOS_IMAGE_TIMEOUT" }));
    expect(result.failed).toBe(1);
  });

  it("settles an orphaned billing acknowledgement before releasing the claim", async () => {
    mocks.calosFindLean.mockResolvedValue([candidate({ creditTransactionId: undefined, chargedCredits: undefined })]);

    const result = await reconcileExpiredCalosImageClaims();

    expect(mocks.deductCredits).toHaveBeenCalledWith(
      "owner_user",
      "clickatron",
      "variation",
      expect.objectContaining({ idempotencyKey: "calos:image:owner_user:claim_1" }),
    );
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      "owner_user",
      3,
      expect.any(String),
      expect.objectContaining({ originalTransactionId: "txn_1" }),
    );
    expect(mocks.calosUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ "serviceRef.variationId": "claim_1" }),
      expect.objectContaining({ $set: expect.objectContaining({ serviceRef: { service: "clickatron" } }) }),
    );
    expect(result.released).toBe(1);
  });

  it("integrates recovery into the scheduled watchdog without legacy refund overlap", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/cron/check-task-timeouts/route.ts"),
      "utf8",
    );
    expect(source).toContain("await reconcileExpiredCalosImageClaims()");
    expect(source).toContain("'metadata.sourceContext.calosDeliverableId': { $exists: false }");
    expect(source).toContain("'metadata.clickatronHandoff.contentCardId': { $exists: false }");
  });
});
