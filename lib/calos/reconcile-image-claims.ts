import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type CalosServiceRef } from "@/schemas/calos-deliverable";
import { ClickatronTask } from "@/schemas/Clickatron";
import {
  failJob,
  getIdempotencyKey,
  getJob,
  getJobCreditTransaction,
  getSessionJobs,
} from "@/lib/clickatron-jobs";
import { CreditsService } from "@/lib/services/creditsService";
import {
  attachGeneratedAsset,
  markGeneratedAssetFailed,
} from "@/lib/calos/attach-generated-asset";
import type { ClickatronJob } from "@/types/clickatron";

const STALE_LINKED_JOB_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface ImageClaimCandidate {
  _id: unknown;
  ownerUserId: string;
  brandId: string;
  version: number;
  updatedAt: Date;
  card?: { id?: string };
  serviceRef?: CalosServiceRef;
}

interface CommittedKickoff {
  sessionId: string;
  variationId: string;
  jobId: string;
}

export interface CalosImageReconciliationResult {
  scanned: number;
  completed: number;
  failed: number;
  released: number;
  pending: number;
  errors: number;
}

function parseCommittedKickoff(value: string | null, variationId: string): CommittedKickoff | null {
  if (!value || value.startsWith("pending:")) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CommittedKickoff>;
    if (
      typeof parsed.sessionId !== "string"
      || typeof parsed.variationId !== "string"
      || typeof parsed.jobId !== "string"
      || parsed.variationId !== variationId
    ) {
      return null;
    }
    return parsed as CommittedKickoff;
  } catch {
    return null;
  }
}

function serviceRefForJob(job: ClickatronJob): CalosServiceRef {
  return {
    service: "clickatron",
    jobId: job.id,
    sessionId: job.sessionId,
    variationId: job.variationId,
  };
}

async function resolveClaimJob(candidate: ImageClaimCandidate): Promise<ClickatronJob | null> {
  const ref = candidate.serviceRef;
  const variationId = ref?.variationId;
  const cardId = candidate.card?.id;
  if (!ref?.jobId || !variationId || !cardId) return null;

  if (!ref.jobId.startsWith("claim:")) {
    const direct = await getJob(ref.jobId);
    if (direct?.variationId === variationId) return direct;
  }

  if (ref.billingIdempotencyKey) {
    const committed = parseCommittedKickoff(
      await getIdempotencyKey(ref.billingIdempotencyKey),
      variationId,
    );
    if (committed) {
      const job = await getJob(committed.jobId);
      if (
        job
        && job.sessionId === committed.sessionId
        && job.variationId === committed.variationId
      ) {
        return job;
      }
    }
  }

  const task = await ClickatronTask.findOne({
    brandId: candidate.brandId,
    "metadata.sourceContext.calosDeliverableId": cardId,
    "details.canvas.variations.id": variationId,
  }).select("_id").lean();
  if (!task?._id) return null;
  const jobs = await getSessionJobs(String(task._id));
  return jobs.find((job) => job.variationId === variationId) ?? null;
}

async function refundExactCharge(
  candidate: ImageClaimCandidate,
  job: ClickatronJob | null,
  reason: string,
): Promise<boolean> {
  const ref = candidate.serviceRef;
  const ledger = job ? getJobCreditTransaction(job) : {};
  const billingUserId = job?.userId || candidate.ownerUserId;
  let transactionId = ledger.transactionId || ref?.creditTransactionId;
  let chargedCredits = ledger.chargedCredits ?? ref?.chargedCredits;

  if ((!transactionId || typeof chargedCredits !== "number") && ref?.billingIdempotencyKey) {
    const deduction = await CreditsService.deductCredits(
      billingUserId,
      "clickatron",
      "variation",
      {
        quantity: 1,
        taskId: ref.jobId,
        idempotencyKey: ref.billingIdempotencyKey,
      },
    );
    if (!deduction.success || !deduction.transactionId) return false;
    transactionId = deduction.transactionId;
    chargedCredits = deduction.creditsDeducted;
  }

  if (!transactionId || typeof chargedCredits !== "number") return false;
  if (chargedCredits === 0) return true;
  const refund = await CreditsService.refundCredits(
    billingUserId,
    chargedCredits,
    reason,
    {
      service: "clickatron",
      action: "variation",
      originalTransactionId: transactionId,
    },
  );
  return refund.success;
}

async function releaseOrphanedClaim(candidate: ImageClaimCandidate): Promise<boolean> {
  const ref = candidate.serviceRef;
  if (!ref?.jobId || !ref.variationId) return false;
  const released = await CalosDeliverable.updateOne(
    {
      _id: candidate._id,
      version: candidate.version,
      editorialStatus: "drafting",
      "serviceRef.jobId": ref.jobId,
      "serviceRef.variationId": ref.variationId,
    },
    {
      $set: {
        serviceRef: { service: "clickatron" },
        errorMessage: "Image generation did not start. Its credit was refunded; retry when ready.",
      },
    },
  );
  return released.matchedCount === 1;
}

async function reconcileCandidate(
  candidate: ImageClaimCandidate,
  result: CalosImageReconciliationResult,
): Promise<void> {
  const cardId = candidate.card?.id;
  const ref = candidate.serviceRef;
  if (!cardId || !ref?.variationId || !ref.jobId) {
    result.pending++;
    result.errors++;
    return;
  }

  let job = await resolveClaimJob(candidate);
  if (job?.status === "queued" || job?.status === "running") {
    const timedOut = await failJob(job.id, {
      code: "CALOS_IMAGE_TIMEOUT",
      message: "CalOS image generation exceeded its recovery lease",
    });
    job = timedOut ?? await getJob(job.id);
  }

  if (job?.status === "completed" && job.resultRef) {
    const attached = await attachGeneratedAsset({
      deliverableId: cardId,
      ownerUserId: candidate.ownerUserId,
      brandId: candidate.brandId,
      assetUrl: job.resultRef,
      serviceRef: serviceRefForJob(job),
    });
    if (attached.ok) result.completed++;
    else {
      result.pending++;
      result.errors++;
    }
    return;
  }

  if (job && (job.status === "failed" || job.status === "canceled")) {
    const errorMessage = job.error?.message || "Image generation failed during recovery";
    const refunded = await refundExactCharge(candidate, job, errorMessage);
    if (!refunded) {
      result.pending++;
      result.errors++;
      return;
    }
    const marked = await markGeneratedAssetFailed({
      deliverableId: cardId,
      ownerUserId: candidate.ownerUserId,
      brandId: candidate.brandId,
      errorMessage,
      serviceRef: serviceRefForJob(job),
    });
    if (marked.ok) result.failed++;
    else {
      result.pending++;
      result.errors++;
    }
    return;
  }

  if (job) {
    result.pending++;
    return;
  }

  const refunded = await refundExactCharge(
    candidate,
    null,
    "Orphaned CalOS image claim had no durable Clickatron job",
  );
  if (!refunded || !(await releaseOrphanedClaim(candidate))) {
    result.pending++;
    result.errors++;
    return;
  }
  result.released++;
}

export async function reconcileExpiredCalosImageClaims(options: {
  now?: Date;
  limit?: number;
} = {}): Promise<CalosImageReconciliationResult> {
  await connectToDatabase();
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(options.limit ?? DEFAULT_LIMIT)));
  const staleLinkedBefore = new Date(now.getTime() - STALE_LINKED_JOB_MS);
  const candidates = await CalosDeliverable.find({
    deletedAt: null,
    editorialStatus: "drafting",
    "serviceRef.service": "clickatron",
    $or: [
      {
        "serviceRef.jobId": /^claim:/,
        "serviceRef.claimExpiresAt": { $lte: now },
      },
      {
        "serviceRef.jobId": { $nin: [null, ""], $not: /^claim:/ },
        updatedAt: { $lte: staleLinkedBefore },
      },
    ],
  }).sort({ updatedAt: 1 }).limit(limit).lean() as unknown as ImageClaimCandidate[];

  const result: CalosImageReconciliationResult = {
    scanned: candidates.length,
    completed: 0,
    failed: 0,
    released: 0,
    pending: 0,
    errors: 0,
  };
  for (const candidate of candidates) {
    try {
      await reconcileCandidate(candidate, result);
    } catch (error) {
      result.pending++;
      result.errors++;
      console.error("[CalOS] image claim reconciliation failed", {
        deliverableId: candidate.card?.id,
        claimId: candidate.serviceRef?.variationId,
        error,
      });
    }
  }
  return result;
}
