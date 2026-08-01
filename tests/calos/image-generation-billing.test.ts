import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

import { createClickatronImageJob } from "@/lib/clickatron/create-image-job";

const params = {
  userId: "user_1",
  brandId: "brand_1",
  prompt: "A sharp editorial product still",
  variationId: "claim_1",
  creditTransactionId: "txn_1",
  chargedCredits: 1,
  idempotencyKey: "calos:image:claim_1",
  sourceContext: { calosDeliverableId: "card_1", brandId: "brand_1" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.nanoid.mockReturnValue("token_1");
  mocks.taskSave.mockResolvedValue(undefined);
  mocks.taskUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.clickatronDb.mockResolvedValue(undefined);
  mocks.createJob.mockResolvedValue("job_1");
  mocks.failQueuedJob.mockResolvedValue({ outcome: "updated", job: null });
  mocks.claimIdempotencyKey.mockResolvedValue({ outcome: "claimed", value: "pending:token_1" });
  mocks.commitIdempotencyKey.mockResolvedValue(true);
  mocks.releaseIdempotencyKey.mockResolvedValue(undefined);
  mocks.recordJobCreditTransaction.mockResolvedValue({ status: "queued" });
  mocks.enqueue.mockResolvedValue({ messageId: "msg_1" });
});

describe("CalOS image kickoff billing", () => {
  it("attaches the exact charge and commits replay state before dispatch", async () => {
    const result = await createClickatronImageJob(params);

    expect(result).toMatchObject({ ok: true, jobId: "job_1", variationId: "claim_1" });
    expect(mocks.recordJobCreditTransaction).toHaveBeenCalledWith("job_1", "txn_1", 1);
    expect(mocks.commitIdempotencyKey).toHaveBeenCalledWith(
      "calos:image:claim_1",
      "token_1",
      expect.stringContaining('"jobId":"job_1"'),
    );
    expect(mocks.recordJobCreditTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0],
    );
    expect(mocks.commitIdempotencyKey.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0],
    );
  });

  it("reuses a committed kickoff without creating or dispatching another job", async () => {
    mocks.claimIdempotencyKey.mockResolvedValue({
      outcome: "existing",
      value: JSON.stringify({ sessionId: "session_old", variationId: "claim_1", jobId: "job_old" }),
    });

    const result = await createClickatronImageJob(params);

    expect(result).toEqual({
      ok: true,
      reused: true,
      sessionId: "session_old",
      variationId: "claim_1",
      jobId: "job_old",
    });
    expect(mocks.taskSave).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("keeps an in-progress duplicate non-refundable", async () => {
    mocks.claimIdempotencyKey.mockResolvedValue({
      outcome: "existing",
      value: "pending:another_request",
    });

    const result = await createClickatronImageJob(params);

    expect(result).toMatchObject({ ok: false, inProgress: true, refundable: false });
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("allows refund only after an unclaimed job and variation are terminal", async () => {
    mocks.recordJobCreditTransaction.mockResolvedValue(null);

    const result = await createClickatronImageJob(params);

    expect(result).toMatchObject({ ok: false, refundable: true, jobId: "job_1" });
    expect(mocks.failQueuedJob).toHaveBeenCalledWith(
      "job_1",
      expect.objectContaining({ code: "CREDIT_LEDGER_ATTACH_FAILED" }),
    );
    expect(mocks.taskUpdateOne).toHaveBeenCalledOnce();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.releaseIdempotencyKey).toHaveBeenCalledWith(
      "calos:image:claim_1",
      "token_1",
    );
  });
});
