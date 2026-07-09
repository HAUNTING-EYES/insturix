import { nanoid } from "nanoid";
import { ClickatronTask } from "@/schemas/Clickatron";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { createJob } from "@/lib/clickatron-jobs";
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
 * DELIBERATELY caller-owned (NOT in here): credits (check/deduct/refund), reference-image R2 upload,
 * carousel fan-out, and idempotency. Those are request-specific; moving billing into a shared helper
 * would couple every caller's wallet semantics. This helper only does: task + variation + job + enqueue.
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
  const variationId = nanoid();

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
  error?: string;
}

/**
 * Create a Clickatron session + generating variation and enqueue its generation job. Best-effort by
 * contract: returns `{ ok:false, error }` on any failure rather than throwing, so a CalOS caller can
 * keep the card's caption + refund its own image charge without the whole request failing.
 */
export async function createClickatronImageJob(
  params: CreateClickatronImageJobParams,
): Promise<CreateClickatronImageJobResult> {
  if (!params.prompt?.trim()) return { ok: false, error: "empty image prompt" };
  if (!params.brandId) return { ok: false, error: "brandId is required (worker gates card write-back on it)" };

  try {
    const plan = buildClickatronImageJobPlan(params);

    await getClickatronDb();
    const task = new ClickatronTask(plan.taskFields);
    const sessionId = task._id.toString();
    await task.save();

    const jobData = { ...plan.jobDataBase, sessionId };
    const jobId = await createJob(jobData);
    await enqueueClickatronJob({ jobId, ...jobData });

    return { ok: true, sessionId, variationId: plan.variationId, jobId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "createClickatronImageJob failed",
    };
  }
}
