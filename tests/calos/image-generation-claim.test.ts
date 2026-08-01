import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connect: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  checkCredits: vi.fn(),
  kickoff: vi.fn(),
  collectReferences: vi.fn(),
  nanoid: vi.fn(),
  taskSave: vi.fn(),
  taskUpdateOne: vi.fn(),
  clickatronDb: vi.fn(),
  createJob: vi.fn(),
  failQueuedJob: vi.fn(),
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
vi.mock("@/lib/services/creditsMiddleware", () => ({ checkCredits: mocks.checkCredits }));
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
  mocks.deduct.mockResolvedValue({ transactionId: "txn_1" });
  mocks.refund.mockResolvedValue(undefined);
  mocks.checkCredits.mockResolvedValue({
    allowed: true,
    deduct: mocks.deduct,
    refund: mocks.refund,
  });
  mocks.collectReferences.mockResolvedValue([]);
  mocks.nanoid.mockReturnValue("claim_1");
  mocks.taskSave.mockResolvedValue(undefined);
  mocks.taskUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.clickatronDb.mockResolvedValue(undefined);
  mocks.createJob.mockResolvedValue("job_1");
  mocks.enqueue.mockResolvedValue({ messageId: "msg_1" });
  mocks.kickoff.mockResolvedValue({
    ok: true,
    jobId: "job_1",
    sessionId: "session_1",
    variationId: "claim_1",
  });
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
  });

  it("reclaims an expired pending lease", async () => {
    mocks.findOne.mockResolvedValue(deliverable({
      serviceRef: {
        service: "clickatron",
        jobId: "claim:old",
        variationId: "old",
        deliverableVersion: 2,
        claimExpiresAt: new Date(Date.now() - 1_000),
      },
    }));
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(claimed("claim_1"))
      .mockResolvedValueOnce(linked("claim_1"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deduct).toHaveBeenCalledOnce();
  });

  it("releases its exact claim when credit admission fails", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce(claimed());
    mocks.checkCredits.mockResolvedValue({
      allowed: false,
      errorResponse: NextResponse.json({ code: "INSUFFICIENT_CREDITS" }, { status: 402 }),
      deduct: mocks.deduct,
      refund: mocks.refund,
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
    mocks.checkCredits.mockResolvedValue({
      allowed: false,
      errorResponse: NextResponse.json({ code: "INSUFFICIENT_CREDITS" }, { status: 402 }),
      deduct: mocks.deduct,
      refund: mocks.refund,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CLAIM_RELEASE_PENDING" });
    expect(mocks.kickoff).not.toHaveBeenCalled();
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
