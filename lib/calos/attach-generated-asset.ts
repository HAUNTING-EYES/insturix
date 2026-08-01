import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type CalosServiceRef } from "@/schemas/calos-deliverable";

/**
 * CalOS completion-callback spine.
 *
 * A production service (Clickatron image, Editron video) runs a deliverable's generation
 * asynchronously and finishes later — out of band from the original `/generate` request. These
 * two functions are the single write-back point that lands the finished asset (or a failure) onto
 * the `calos_deliverables` card.
 *
 * Design (from the Clickatron/Editron blast-radius investigation):
 * - DIRECT Mongoose write, never an HTTP self-callback. The calling worker has no Clerk session
 *   and shares this same DB/connection, so an HTTP round-trip would only add an auth wall + a
 *   network failure mode for zero benefit.
 * - CLAIM-BOUND and idempotent. A callback must match the active service, deliverable version, and
 *   either the final job ID or the pre-dispatch variation lease. The latter closes the crash window
 *   where Clickatron finishes before the kickoff request stores its final job ID.
 * - FAIL LOUD (R18N). A "not found" means a service finished work for a card we can't resolve —
 *   a real wiring bug — so it is logged, not swallowed silently. DB errors propagate to the
 *   caller (the worker wraps the call so it can never fail the underlying job).
 */

const LOG = "[CalOS:asset-callback]";

export interface AttachAssetParams {
  deliverableId: string; // the ContentCard id (== calos_deliverables.card.id)
  ownerUserId: string;
  brandId: string;
  assetUrl: string;
  serviceRef?: CalosServiceRef;
}

export interface MarkFailedParams {
  deliverableId: string;
  ownerUserId: string;
  brandId: string;
  errorMessage: string;
  serviceRef?: CalosServiceRef;
}

export type AssetCallbackReason =
  | "attached"
  | "already_attached"
  | "stale_generation"
  | "not_attachable"
  | "not_found"
  | "invalid";

export interface AssetCallbackResult {
  ok: boolean;
  reason: AssetCallbackReason;
}

function asServiceRef(value: unknown): CalosServiceRef | undefined {
  if (!value) return undefined;
  return typeof (value as { toObject?: () => CalosServiceRef }).toObject === "function"
    ? (value as { toObject: () => CalosServiceRef }).toObject()
    : (value as CalosServiceRef);
}

/** Merge an incoming serviceRef onto whatever is stored, tolerating a Mongoose subdoc or plain object. */
function mergeServiceRef(existing: unknown, incoming: CalosServiceRef | undefined) {
  const base = asServiceRef(existing);
  if (!incoming) return base;
  const merged = { ...base, ...incoming };
  delete merged.claimExpiresAt;
  return merged;
}

function isCurrentGeneration(
  deliverable: { version: number; serviceRef?: unknown },
  incoming: CalosServiceRef | undefined,
) {
  const current = asServiceRef(deliverable.serviceRef);
  const jobMatches = Boolean(incoming?.jobId && current?.jobId === incoming.jobId);
  const variationMatches = Boolean(
    incoming?.variationId && current?.variationId === incoming.variationId,
  );
  return Boolean(
    incoming?.service &&
      current?.service === incoming.service &&
      (jobMatches || variationMatches) &&
      Number.isInteger(current.deliverableVersion) &&
      current.deliverableVersion === deliverable.version,
  );
}

function logStaleGeneration(
  action: "attach" | "markFailed",
  deliverable: { version: number; serviceRef?: unknown },
  incoming: CalosServiceRef | undefined,
) {
  const current = asServiceRef(deliverable.serviceRef);
  console.warn(`${LOG} ${action}: stale generation ignored`, {
    currentService: current?.service ?? null,
    incomingService: incoming?.service ?? null,
    currentJobId: current?.jobId ?? null,
    incomingJobId: incoming?.jobId ?? null,
    currentVariationId: current?.variationId ?? null,
    incomingVariationId: incoming?.variationId ?? null,
    currentVersion: deliverable.version,
    claimedVersion: current?.deliverableVersion ?? null,
  });
}

async function findScopedDeliverable(deliverableId: string, ownerUserId: string, brandId: string) {
  await connectToDatabase();
  // Scoped by card.id + owner + brand (same no-IDOR filter the dispatcher uses).
  return CalosDeliverable.findOne({
    "card.id": deliverableId,
    ownerUserId,
    brandId,
    deletedAt: null,
  });
}

/**
 * Attach a finished asset URL to its deliverable and advance it `drafting` → `generated`.
 * Idempotent: a no-op (reason `already_attached`) once an asset has landed or the card has moved
 * past `drafting`.
 */
export async function attachGeneratedAsset(params: AttachAssetParams): Promise<AssetCallbackResult> {
  const { deliverableId, ownerUserId, brandId, assetUrl, serviceRef } = params;
  if (!deliverableId || !ownerUserId || !brandId || !assetUrl) {
    console.warn(`${LOG} attach: missing required field`, {
      deliverableId,
      ownerUserId,
      brandId,
      hasAsset: Boolean(assetUrl),
    });
    return { ok: false, reason: "invalid" };
  }

  const deliverable = await findScopedDeliverable(deliverableId, ownerUserId, brandId);
  if (!deliverable) {
    console.warn(`${LOG} attach: deliverable not found`, { deliverableId, ownerUserId, brandId });
    return { ok: false, reason: "not_found" };
  }

  // First-write-wins; never touch a card that already has its asset or has entered review.
  if (deliverable.assetUrl || deliverable.editorialStatus !== "drafting") {
    return { ok: true, reason: "already_attached" };
  }
  if (!isCurrentGeneration(deliverable, serviceRef)) {
    logStaleGeneration("attach", deliverable, serviceRef);
    return { ok: true, reason: "stale_generation" };
  }

  deliverable.assetUrl = assetUrl;
  deliverable.serviceRef = mergeServiceRef(deliverable.serviceRef, serviceRef);
  deliverable.editorialStatus = "generated";
  deliverable.errorMessage = null;
  await deliverable.save();
  return { ok: true, reason: "attached" };
}

/**
 * Record an async-generation failure on the deliverable and keep it in `drafting` (never
 * `generated`). Success-wins: a no-op if an asset already landed or the card advanced, so a
 * late/duplicate failure can't revert a successful generation.
 */
export async function markGeneratedAssetFailed(params: MarkFailedParams): Promise<AssetCallbackResult> {
  const { deliverableId, ownerUserId, brandId, errorMessage, serviceRef } = params;
  if (!deliverableId || !ownerUserId || !brandId) {
    console.warn(`${LOG} markFailed: missing required field`, { deliverableId, ownerUserId, brandId });
    return { ok: false, reason: "invalid" };
  }

  const deliverable = await findScopedDeliverable(deliverableId, ownerUserId, brandId);
  if (!deliverable) {
    console.warn(`${LOG} markFailed: deliverable not found`, { deliverableId, ownerUserId, brandId });
    return { ok: false, reason: "not_found" };
  }

  // Success wins: don't overwrite a card that already generated or advanced past drafting.
  if (deliverable.assetUrl || deliverable.editorialStatus !== "drafting") {
    return { ok: true, reason: "not_attachable" };
  }
  if (!isCurrentGeneration(deliverable, serviceRef)) {
    logStaleGeneration("markFailed", deliverable, serviceRef);
    return { ok: true, reason: "stale_generation" };
  }

  deliverable.errorMessage = errorMessage;
  deliverable.serviceRef = mergeServiceRef(deliverable.serviceRef, serviceRef);
  // Stays in 'drafting' so the work can be retried or finished in-service.
  await deliverable.save();
  return { ok: true, reason: "attached" };
}
