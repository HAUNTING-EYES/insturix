import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connect: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  kickoff: vi.fn(),
  collectReferences: vi.fn(),
  nanoid: vi.fn(),
  taskSave: vi.fn(),
  taskUpdateOne: vi.fn(),
  clickatronDb: vi.fn(),
  createJob: vi.fn(),
  failQueuedJob: vi.fn(),
  claimIdempotencyKey: vi.fn(),
  commitIdempotencyKey: vi.fn(),
  releaseIdempotencyKey: vi.fn(),
  recordJobCreditTransaction: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connect }));
vi.mock("@/schemas/calos-deliverable", () => ({
  default: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateOne: mocks.updateOne,
  },
}));
vi.mock("@/lib/services/creditsService", () => ({
  CreditsService: { deductCredits: mocks.deduct, refundCredits: mocks.refund },
}));
vi.mock("@/lib/calos/references/collect-image-references", () => ({
  collectImageReferenceUrls: mocks.collectReferences,
}));
vi.mock("nanoid", () => ({ nanoid: mocks.nanoid }));
vi.mock("@/schemas/Clickatron", () => ({
  ClickatronTask: class {
    static updateOne = mocks.taskUpdateOne;
    _id = { toString: () => "session_1" };
    save = mocks.taskSave;
  },
}));
vi.mock("@/lib/clickatron-mongo", () => ({ getClickatronDb: mocks.clickatronDb }));
vi.mock("@/lib/clickatron-jobs", () => ({
  createJob: mocks.createJob,
  failQueuedJob: mocks.failQueuedJob,
  claimIdempotencyKey: mocks.claimIdempotencyKey,
  commitIdempotencyKey: mocks.commitIdempotencyKey,
  releaseIdempotencyKey: mocks.releaseIdempotencyKey,
  recordJobCreditTransaction: mocks.recordJobCreditTransaction,
}));
vi.mock("@/lib/clickatron-qtask", () => ({ enqueueClickatronJob: mocks.enqueue }));
vi.mock("@/lib/clickatron/create-image-job", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clickatron/create-image-job")>(
    "@/lib/clickatron/create-image-job",
  );
  return { ...actual, createClickatronImageJob: mocks.kickoff };
});

import { POST } from "@/app/api/services/calos/make-image/route";
import { attachGeneratedAsset } from "@/lib/calos/attach-generated-asset";
import { buildClickatronImageJobPlan } from "@/lib/clickatron/create-image-job";

function request() {
  return new NextRequest("http://localhost/api/services/calos/make-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brandId: "brand_1", deliverableId: "card_1" }),
  });
}

function deliverable(over: Record<string, unknown> = {}) {
  return {
    _id: "mongo_1",
    ownerUserId: "user_1",
    brandId: "brand_1",
    campaignId: "campaign_1",
    version: 2,
    editorialStatus: "drafting",
    card: { id: "card_1", contentFormat: "image" },
    assetUrl: null,
    imagePrompt: "A sharp editorial product still",
    errorMessage: null,
    serviceRef: { service: "clickatron" },
    save: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function claimed(claimId = "claim_1") {
  return deliverable({
    serviceRef: {
      service: "clickatron",
      jobId: `claim:${claimId}`,
      variationId: claimId,
      deliverableVersion: 2,
      claimExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
}

function linked(claimId = "claim_1") {
  return deliverable({
    serviceRef: {
      service: "clickatron",
      jobId: "job_1",
      sessionId: "session_1",
      variationId: claimId,
      deliverableVersion: 2,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_1", orgId: null });
  mocks.connect.mockResolvedValue(undefined);
  mocks.findOne.mockImplementation(async () => deliverable());
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.deduct.mockResolvedValue({
    success: true,
    creditsDeducted: 1,
    transactionId: "txn_1",
  });
  mocks.refund.mockResolvedValue({ success: true });
  mocks.collectReferences.mockResolvedValue([]);
  mocks.nanoid.mockReturnValue("claim_1");
  mocks.taskSave.mockResolvedValue(undefined);
  mocks.taskUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.clickatronDb.mockResolvedValue(undefined);
  mocks.createJob.mockResolvedValue("job_1");
  mocks.claimIdempotencyKey.mockResolvedValue({ outcome: "claimed", value: "pending:token_1" });
  mocks.commitIdempotencyKey.mockResolvedValue(true);
  mocks.releaseIdempotencyKey.mockResolvedValue(undefined);
  mocks.recordJobCreditTransaction.mockResolvedValue({ status: "queued" });
  mocks.enqueue.mockResolvedValue({ messageId: "msg_1" });
  mocks.kickoff.mockImplementation(async ({ variationId }: { variationId: string }) => ({
    ok: true,
    jobId: "job_1",
    sessionId: "session_1",
    variationId,
  }));
});

async function actualKickoff() {
  const actual = await vi.importActual<typeof import("@/lib/clickatron/create-image-job")>(
    "@/lib/clickatron/create-image-job",
  );
  return actual.createClickatronImageJob({
    userId: "user_1",
    brandId: "brand_1",
    prompt: "A sharp editorial product still",
    variationId: "claim_1",
    creditTransactionId: "txn_1",
    chargedCredits: 1,
    idempotencyKey: "calos:image:claim_1",
    sourceContext: { calosDeliverableId: "card_1", brandId: "brand_1" },
  });
}

describe("CalOS image generation claim", () => {
  it("allows only one competing request to charge and enqueue", async () => {
    mocks.nanoid.mockReturnValueOnce("claim_1").mockReturnValueOnce("claim_2");
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(claimed("claim_1"))
      .mockResolvedValueOnce(linked("claim_1"))
      .mockResolvedValueOnce(null);

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ code: "ALREADY_GENERATING" });
    expect(mocks.deduct).toHaveBeenCalledOnce();
    expect(mocks.kickoff).toHaveBeenCalledOnce();
    expect(mocks.kickoff).toHaveBeenCalledWith(
      expect.objectContaining({ variationId: "claim_1" }),
    );
    expect(mocks.collectReferences).toHaveBeenCalledWith({
      brandId: "brand_1",
      campaignId: "campaign_1",
      userId: "user_1",
      orgId: null,
    });
  });

  it("reclaims an expired lease with its original billing identity", async () => {
    mocks.findOne.mockResolvedValue(deliverable({
      serviceRef: {
        service: "clickatron",
        jobId: "claim:old",
        variationId: "old",
        deliverableVersion: 2,
        claimExpiresAt: new Date(Date.now() - 1_000),
        billingIdempotencyKey: "calos:image:old",
      },
    }));
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(claimed("old"))
      .mockResolvedValueOnce(linked("old"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deduct).toHaveBeenCalledOnce();
    expect(mocks.deduct).toHaveBeenCalledWith(
      "user_1",
      "clickatron",
      "variation",
      expect.objectContaining({
        idempotencyKey: "calos:image:old",
        taskId: "claim:old",
      }),
    );
    expect(mocks.kickoff).toHaveBeenCalledWith(expect.objectContaining({ variationId: "old" }));
  });

  it("releases its exact claim when credit admission fails", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce(claimed());
    mocks.deduct.mockResolvedValue({
      success: false,
      creditsDeducted: 0,
      error: "Insufficient media credits. Required: 1, Available: 0",
    });

    const response = await POST(request());

    expect(response.status).toBe(402);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ "serviceRef.variationId": "claim_1" }),
      expect.any(Object),
    );
    expect(mocks.kickoff).not.toHaveBeenCalled();
  });

  it("reports a claim release that needs recovery instead of escaping", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce(claimed());
    mocks.updateOne.mockRejectedValue(new Error("Mongo unavailable"));
    mocks.deduct.mockResolvedValue({
      success: false,
      creditsDeducted: 0,
      error: "Insufficient media credits. Required: 1, Available: 0",
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CLAIM_RELEASE_PENDING" });
    expect(mocks.kickoff).not.toHaveBeenCalled();
  });

  it("keeps the claim when an exact-transaction refund fails", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce(claimed());
    mocks.kickoff.mockResolvedValue({ ok: false, refundable: true, error: "dispatch failed" });
    mocks.refund.mockResolvedValue({ success: false, error: "Mongo unavailable" });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "REFUND_PENDING" });
    expect(mocks.refund).toHaveBeenCalledWith(
      "user_1",
      1,
      "dispatch failed",
      expect.objectContaining({ originalTransactionId: "txn_1" }),
    );
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("uses the lease identity as Clickatron's variation identity", () => {
    mocks.nanoid.mockReturnValueOnce("random_variation");
    const plan = buildClickatronImageJobPlan({
      userId: "user_1",
      brandId: "brand_1",
      prompt: "A sharp editorial product still",
      variationId: "claim_1",
      sourceContext: { calosDeliverableId: "card_1", brandId: "brand_1" },
    });

    expect(plan.variationId).toBe("claim_1");
    expect(plan.taskFields.details.canvas.variations[0].id).toBe("claim_1");
    expect(plan.jobDataBase.variationId).toBe("claim_1");
  });

  it("accepts the matching variation callback before the final job link is saved", async () => {
    const doc = claimed();
    mocks.findOne.mockResolvedValue(doc);

    const result = await attachGeneratedAsset({
      deliverableId: "card_1",
      ownerUserId: "user_1",
      brandId: "brand_1",
      assetUrl: "https://assets.example/image.png",
      serviceRef: {
        service: "clickatron",
        jobId: "job_1",
        sessionId: "session_1",
        variationId: "claim_1",
      },
    });

    expect(result).toEqual({ ok: true, reason: "attached" });
    expect(doc.assetUrl).toBe("https://assets.example/image.png");
    expect(doc.serviceRef).toMatchObject({ jobId: "job_1", variationId: "claim_1" });
    expect(doc.serviceRef).not.toHaveProperty("claimExpiresAt");
    expect(doc.save).toHaveBeenCalledOnce();
  });

  it("marks a definitely unclaimed dispatch failure as refundable", async () => {
    mocks.enqueue.mockRejectedValue(new Error("QStash unavailable"));
    mocks.failQueuedJob.mockResolvedValue({ outcome: "updated", job: null });

    const result = await actualKickoff();

    expect(result).toMatchObject({ ok: false, refundable: true, jobId: "job_1" });
    expect(mocks.failQueuedJob).toHaveBeenCalledWith(
      "job_1",
      expect.objectContaining({ code: "QUEUE_DISPATCH_FAILED" }),
    );
  });

  it("keeps a worker-claimed job accepted after a lost dispatch acknowledgement", async () => {
    mocks.enqueue.mockRejectedValue(new Error("QStash acknowledgement timeout"));
    mocks.failQueuedJob.mockResolvedValue({
      outcome: "rejected",
      job: { status: "running" },
    });

    const result = await actualKickoff();

    expect(result).toMatchObject({
      ok: true,
      dispatchUncertain: true,
      jobId: "job_1",
      variationId: "claim_1",
    });
  });
});
