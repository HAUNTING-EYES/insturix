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
 * - IDEMPOTENT first-write-wins. Both Clickatron (QStash ≤3 retries) and Editron (per-poll
 *   re-emit) can deliver the SAME completion more than once, so every write is guarded: it only
 *   fires while the card is still `drafting` with no asset yet. This can never clobber a human
 *   review/approval or a duplicate delivery, and on the failure side a late/duplicate failure can
 *   never revert a card that already generated (success-wins).
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
  | "not_attachable"
  | "not_found"
  | "invalid";

export interface AssetCallbackResult {
  ok: boolean;
  reason: AssetCallbackReason;
}

/** Merge an incoming serviceRef onto whatever's stored, tolerating a Mongoose subdoc or plain object. */
function mergeServiceRef(
  existing: unknown,
  incoming: CalosServiceRef | undefined,
): CalosServiceRef | undefined {
  if (!incoming) return existing as CalosServiceRef | undefined;
  const base: CalosServiceRef =
    existing && typeof (existing as { toObject?: () => CalosServiceRef }).toObject === "function"
      ? (existing as { toObject: () => CalosServiceRef }).toObject()
      : ((existing as CalosServiceRef | undefined) ?? {});
  return { ...base, ...incoming };
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

  deliverable.errorMessage = errorMessage;
  deliverable.serviceRef = mergeServiceRef(deliverable.serviceRef, serviceRef);
  // Stays in 'drafting' so the work can be retried or finished in-service.
  await deliverable.save();
  return { ok: true, reason: "attached" };
}
