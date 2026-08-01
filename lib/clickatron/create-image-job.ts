import { nanoid } from "nanoid";
import { ClickatronTask } from "@/schemas/Clickatron";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import {
  claimIdempotencyKey,
  commitIdempotencyKey,
  createJob,
  failQueuedJob,
  recordJobCreditTransaction,
  releaseIdempotencyKey,
} from "@/lib/clickatron-jobs";
import { enqueueClickatronJob } from "@/lib/clickatron-qtask";
import { resolveClickatronModelForGeneration } from "@/lib/config/clickatron-models";
import type { ClickatronSourceContext } from "@/types/clickatron";

/**
 * Shared "kick off one Clickatron image job" primitive.
 *
 * Both the ThinkForge->Clickatron export route and CalOS need to do the same thing: create a
 * Clickatron session (task) + a single generating variation, then create + enqueue the generation
 * job. This extracts that mechanism into one place so callers don't duplicate the task/variation/job
 * shapes (which must stay in lockstep with the worker that consumes them).
 *
 * Credit deduction/refund remains caller-owned. The helper receives the resulting transaction and
 * stable operation key so the durable Redis job carries its exact billing ledger before dispatch and
 * retries reuse the original task/job instead of creating duplicate provider work.
 *
 * The completion side is already built: the worker reads `metadata.sourceContext.calosDeliverableId`
 * (and requires `task.brandId`) to land the finished image back on the CalOS card via
 * `attachGeneratedAsset`. So a CalOS caller MUST pass `brandId` + a sourceContext carrying
 * `calosDeliverableId`, or the image will generate but never return to the card.
 */

export interface CreateClickatronImageJobParams {
  userId: string;
  orgId?: string | null;
  /** REQUIRED for a CalOS kickoff: the completion worker gates the card write-back on task.brandId. */
  brandId: string;
  /** The image-generation prompt (e.g. PostWriter's singleImagePrompt). */
  prompt: string;
  /** Caller-owned durable variation identity. CalOS supplies its Mongo lease ID so completion can
   *  prove ownership even if the kickoff request dies before the final Redis job ID is linked. */
  variationId?: string;
  /** Aspect ratio for the still. Defaults to "1:1" — square renders on every social surface (IG feed,
   *  LinkedIn, X, FB); platform-aware sizing is a follow-up. */
  aspectRatio?: string;
  /** Optional explicit model; when absent the standard generation resolver picks the default t2i model. */
  modelId?: string;
  createdByName?: string;
  /** Routing context stamped onto the task + job metadata so the completion worker can resolve which
   *  CalOS card (calosDeliverableId) the finished image belongs to. */
  sourceContext?: ClickatronSourceContext;
  /** R2 refs for any reference images (empty for a from-scratch CalOS still). */
  referenceImageRefs?: string[];
  /** Required by the IO helper (but not the pure planner): exact caller-owned debit to attach. */
  creditTransactionId?: string;
  chargedCredits?: number;
  /** Stable for one CalOS deliverable version + generation claim. */
  idempotencyKey?: string;
}

/** A single generating variation on a Clickatron canvas (matches the session-route shape). */
interface PlannedVariation {
  id: string;
  prompt: string;
  status: "generating";
  aspectRatio: string;
  modelId: string;
  fineTuning: { brightness: number; contrast: number; saturation: number };
  imageRef: string;
  thumbnailRef: string;
  referenceImageRefs: string[];
  metadata?: Record<string, unknown>;
}

/** The job payload the worker consumes, minus `sessionId` (only known after the task is saved). */
export interface PlannedJobDataBase {
  userId: string;
  variationId: string;
  prompt: string;
  modelId: string;
  aspectRatio: string;
  referenceImageRefs: string[];
  metadata?: Record<string, unknown>;
}

export interface ClickatronImageJobPlan {
  variationId: string;
  modelId: string;
  aspectRatio: string;
  /** `{ sourceContext }` when a sourceContext was supplied, else undefined. Stamped on BOTH the task
   *  and the job (the worker merges task+job metadata when resolving the CalOS card). */
  metadata?: Record<string, unknown>;
  /** Constructor args for `new ClickatronTask(...)`. */
  taskFields: {
    clerkUserId: string;
    orgId?: string;
    createdByName?: string;
    brandId: string;
    metadata?: Record<string, unknown>;
    title: string;
    details: {
      videoIdea: string;
      aspectRatio: string;
      canvas: { variations: PlannedVariation[]; chatHistory: never[] };
    };
  };
  jobDataBase: PlannedJobDataBase;
}

/**
 * Pure planner — builds the exact task + variation + job shapes with no IO. Split out so the
 * "does the kickoff carry `sourceContext.calosDeliverableId` + `brandId` so the worker will attach?"
 * contract is unit-testable without a DB/Redis/QStash.
 */
export function buildClickatronImageJobPlan(
  params: CreateClickatronImageJobParams,
): ClickatronImageJobPlan {
  const aspectRatio = params.aspectRatio || "1:1";
  const referenceImageRefs = params.referenceImageRefs ?? [];

  const resolved = resolveClickatronModelForGeneration({
    requestedModelId: params.modelId ?? null,
    context: "newVariation",
    referenceImageCount: referenceImageRefs.length,
    aspectRatio,
  });
  const modelId = resolved.modelId;

  const metadata = params.sourceContext ? { sourceContext: params.sourceContext } : undefined;
  const variationId = params.variationId || nanoid();

  const variation: PlannedVariation = {
    id: variationId,
    prompt: params.prompt,
    status: "generating",
    aspectRatio,
    modelId,
    fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
    imageRef: "",
    thumbnailRef: "",
    referenceImageRefs,
    ...(metadata ? { metadata } : {}),
  };

  return {
    variationId,
    modelId,
    aspectRatio,
    metadata,
    taskFields: {
      clerkUserId: params.userId,
      ...(params.orgId ? { orgId: params.orgId } : {}),
      ...(params.createdByName ? { createdByName: params.createdByName } : {}),
      brandId: params.brandId,
      ...(metadata ? { metadata } : {}),
      title: `calos ${aspectRatio} #${Date.now()}`,
      details: {
        videoIdea: params.prompt,
        aspectRatio,
        canvas: { variations: [variation], chatHistory: [] },
      },
    },
    jobDataBase: {
      userId: params.userId,
      variationId,
      prompt: params.prompt,
      modelId,
      aspectRatio,
      referenceImageRefs,
      ...(metadata ? { metadata } : {}),
    },
  };
}

export interface CreateClickatronImageJobResult {
  ok: boolean;
  sessionId?: string;
  variationId?: string;
  jobId?: string;
  /** True only when no worker can still claim this work, so the caller may safely refund. */
  refundable?: boolean;
  dispatchUncertain?: boolean;
  inProgress?: boolean;
  reused?: boolean;
  error?: string;
}

interface CommittedKickoff {
  sessionId: string;
  variationId: string;
  jobId: string;
}

function parseCommittedKickoff(
  value: string,
  expectedVariationId?: string,
): CommittedKickoff | null {
  try {
    const parsed = JSON.parse(value) as Partial<CommittedKickoff>;
    if (
      typeof parsed.sessionId !== "string"
      || typeof parsed.variationId !== "string"
      || typeof parsed.jobId !== "string"
      || (expectedVariationId && parsed.variationId !== expectedVariationId)
    ) {
      return null;
    }
    return parsed as CommittedKickoff;
  } catch {
    return null;
  }
}

async function markKickoffVariationFailed(
  sessionId: string,
  variationId: string,
  error: string,
): Promise<boolean> {
  try {
    const result = await ClickatronTask.updateOne(
      { _id: sessionId, "details.canvas.variations.id": variationId },
      {
        $set: {
          "details.canvas.variations.$.status": "failed",
          "details.canvas.variations.$.error": error,
          "details.canvas.variations.$.updatedAt": new Date(),
        },
      },
    );
    return result.matchedCount === 1;
  } catch (persistError) {
    console.error("[CalOS] failed to terminalize Clickatron kickoff variation:", persistError);
    return false;
  }
}

async function reconcileUnclaimedKickoff(
  sessionId: string,
  variationId: string,
  jobId: string,
  code: string,
  error: string,
): Promise<{ accepted: boolean; refundable: boolean }> {
  try {
    const failed = await failQueuedJob(jobId, { code, message: error });
    if (failed.outcome === "updated" || failed.outcome === "missing") {
      return {
        accepted: false,
        refundable: await markKickoffVariationFailed(sessionId, variationId, error),
      };
    }
    if (
      failed.outcome === "rejected"
      && (failed.job?.status === "running" || failed.job?.status === "completed")
    ) {
      return { accepted: true, refundable: false };
    }
    if (
      failed.outcome === "rejected"
      && (failed.job?.status === "failed" || failed.job?.status === "canceled")
    ) {
      return {
        accepted: false,
        refundable: await markKickoffVariationFailed(sessionId, variationId, error),
      };
    }
    return { accepted: false, refundable: false };
  } catch (reconcileError) {
    console.error("[CalOS] Clickatron kickoff reconciliation failed:", reconcileError);
    return { accepted: false, refundable: false };
  }
}

/**
 * Create a Clickatron session + generating variation and enqueue its generation job. Queue failures
 * are reconciled against the durable Redis job: only a queued-only terminal transition makes the
 * result refundable; a worker that already claimed the job keeps ownership despite a lost dispatch
 * acknowledgement.
 */
export async function createClickatronImageJob(
  params: CreateClickatronImageJobParams,
): Promise<CreateClickatronImageJobResult> {
  if (!params.prompt?.trim()) return { ok: false, refundable: true, error: "empty image prompt" };
  if (!params.brandId) {
    return {
      ok: false,
      refundable: true,
      error: "brandId is required (worker gates card write-back on it)",
    };
  }
  if (
    !params.creditTransactionId
    || !params.idempotencyKey
    || typeof params.chargedCredits !== "number"
    || !Number.isFinite(params.chargedCredits)
    || params.chargedCredits < 0
  ) {
    return { ok: false, refundable: true, error: "durable image billing context is required" };
  }

  let sessionId: string | undefined;
  let variationId: string | undefined;
  let jobId: string | undefined;
  let taskPersisted = false;
  const idempotencyClaimToken = nanoid();
  let ownsIdempotencyClaim = false;
  let idempotencyCommitted = false;

  const releaseIdempotencyClaim = async () => {
    if (!ownsIdempotencyClaim || idempotencyCommitted) return;
    try {
      await releaseIdempotencyKey(params.idempotencyKey!, idempotencyClaimToken);
      ownsIdempotencyClaim = false;
    } catch (error) {
      console.error("[CalOS] failed to release Clickatron idempotency claim:", error);
    }
  };

  try {
    const idempotency = await claimIdempotencyKey(
      params.idempotencyKey,
      idempotencyClaimToken,
    );
    if (idempotency.outcome === "existing") {
      if (idempotency.value.startsWith("pending:")) {
        return {
          ok: false,
          inProgress: true,
          refundable: false,
          error: "An identical image kickoff is already in progress",
        };
      }
      const existing = parseCommittedKickoff(idempotency.value, params.variationId);
      if (!existing) {
        return {
          ok: false,
          refundable: false,
          error: "Clickatron image idempotency state is invalid",
        };
      }
      return { ok: true, reused: true, ...existing };
    }
    ownsIdempotencyClaim = true;

    const plan = buildClickatronImageJobPlan(params);
    variationId = plan.variationId;

    await getClickatronDb();
    const task = new ClickatronTask(plan.taskFields);
    sessionId = task._id.toString();
    await task.save();
    taskPersisted = true;

    const jobData = {
      ...plan.jobDataBase,
      sessionId,
      metadata: {
        ...(plan.jobDataBase.metadata || {}),
        creditTransactionId: params.creditTransactionId,
        chargedCredits: params.chargedCredits,
      },
    };
    jobId = await createJob(jobData);

    const billingRecorded = await recordJobCreditTransaction(
      jobId,
      params.creditTransactionId,
      params.chargedCredits,
    );
    if (!billingRecorded) {
      const error = "Credit transaction could not be verified on the generation job";
      const reconciled = await reconcileUnclaimedKickoff(
        sessionId,
        variationId,
        jobId,
        "CREDIT_LEDGER_ATTACH_FAILED",
        error,
      );
      if (reconciled.refundable) await releaseIdempotencyClaim();
      return {
        ok: reconciled.accepted,
        refundable: reconciled.refundable,
        dispatchUncertain: reconciled.accepted || undefined,
        sessionId,
        variationId,
        jobId,
        error,
      };
    }

    const committed = await commitIdempotencyKey(
      params.idempotencyKey,
      idempotencyClaimToken,
      JSON.stringify({ sessionId, variationId, jobId }),
    );
    if (!committed) {
      const error = "Failed to commit image kickoff idempotency state";
      const reconciled = await reconcileUnclaimedKickoff(
        sessionId,
        variationId,
        jobId,
        "IDEMPOTENCY_COMMIT_FAILED",
        error,
      );
      if (reconciled.refundable) await releaseIdempotencyClaim();
      return {
        ok: reconciled.accepted,
        refundable: reconciled.refundable,
        dispatchUncertain: reconciled.accepted || undefined,
        sessionId,
        variationId,
        jobId,
        error,
      };
    }
    idempotencyCommitted = true;

    try {
      await enqueueClickatronJob({ jobId, ...jobData });
    } catch (dispatchError) {
      const error = dispatchError instanceof Error ? dispatchError.message : "Queue dispatch failed";
      const reconciled = await reconcileUnclaimedKickoff(
        sessionId,
        variationId,
        jobId,
        "QUEUE_DISPATCH_FAILED",
        error,
      );
      return {
        ok: reconciled.accepted,
        refundable: reconciled.refundable,
        dispatchUncertain: reconciled.accepted || undefined,
        sessionId,
        variationId,
        jobId,
        error,
      };
    }

    return { ok: true, sessionId, variationId, jobId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "createClickatronImageJob failed";
    if (jobId && sessionId && variationId) {
      const reconciled = await reconcileUnclaimedKickoff(
        sessionId,
        variationId,
        jobId,
        "KICKOFF_PREPARATION_FAILED",
        error,
      );
      if (reconciled.refundable) await releaseIdempotencyClaim();
      return {
        ok: reconciled.accepted,
        refundable: reconciled.refundable,
        dispatchUncertain: reconciled.accepted || undefined,
        sessionId,
        variationId,
        jobId,
        error,
      };
    }
    const variationFailed = !taskPersisted || !sessionId || !variationId
      ? true
      : await markKickoffVariationFailed(sessionId, variationId, error);
    if (variationFailed) await releaseIdempotencyClaim();
    return {
      ok: false,
      refundable: variationFailed,
      sessionId,
      variationId,
      jobId,
      error,
    };
  }
}
