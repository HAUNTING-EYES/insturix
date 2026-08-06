import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { calosScope } from "@/lib/calos/scope";
import { serviceForFormat } from "@/lib/calos/generate/route-map";
import { CreditsService } from "@/lib/services/creditsService";
import { createClickatronImageJob } from "@/lib/clickatron/create-image-job";
import { collectImageReferenceUrls } from "@/lib/calos/references/collect-image-references";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMAGE_CLAIM_TTL_MS = 15 * 60 * 1000;

function isExpiredPendingClaim(
  serviceRef: { jobId?: string; claimExpiresAt?: Date } | undefined,
  now: Date,
) {
  if (!serviceRef?.jobId?.startsWith("claim:") || !serviceRef.claimExpiresAt) return false;
  return new Date(serviceRef.claimExpiresAt).getTime() <= now.getTime();
}

/**
 * POST /api/services/calos/make-image  { brandId, deliverableId }
 *
 * Acquires a scoped Mongo lease before charging, then uses that lease as Clickatron's variation ID.
 * Only the lease owner can link or release the work, and a callback can still prove ownership if it
 * beats the request's final job-link write.
 */
export async function POST(req: NextRequest) {
  let billingUserId: string | null = null;
  let charge: { transactionId: string; chargedCredits: number } | null = null;
  let workAccepted = false;
  let claim: {
    mongoId: unknown;
    id: string;
    pendingJobId: string;
    version: number;
  } | null = null;

  const refund = async (reason: string): Promise<boolean> => {
    if (!billingUserId || !charge) return true;
    try {
      const result = await CreditsService.refundCredits(
        billingUserId,
        charge.chargedCredits,
        reason,
        {
          service: "clickatron",
          action: "variation",
          originalTransactionId: charge.transactionId,
        },
      );
      if (!result.success) {
        console.error("[CalOS] make-image credit refund rejected:", result.error);
        return false;
      }
      charge = null;
      return true;
    } catch (error) {
      console.error("[CalOS] make-image credit refund failed:", error);
      return false;
    }
  };

  const releaseClaim = async (errorMessage: string | null): Promise<boolean> => {
    if (!claim) return true;
    const ownedClaim = claim;
    try {
      const released = await CalosDeliverable.updateOne(
        {
          _id: ownedClaim.mongoId,
          version: ownedClaim.version,
          "serviceRef.jobId": ownedClaim.pendingJobId,
          "serviceRef.variationId": ownedClaim.id,
        },
        {
          $set: {
            serviceRef: { service: "clickatron" },
            errorMessage,
          },
        },
      );
      if (released.matchedCount !== 1) {
        console.warn("[CalOS] make-image claim release lost ownership", {
          deliverableId: ownedClaim.mongoId,
          claimId: ownedClaim.id,
        });
        return false;
      }
      claim = null;
      return true;
    } catch (error) {
      console.error("[CalOS] make-image claim release failed", {
        deliverableId: ownedClaim.mongoId,
        claimId: ownedClaim.id,
        error,
      });
      return false;
    }
  };

  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { brandId, deliverableId, aspectRatio } = await req.json();
    if (!brandId || !deliverableId) {
      return NextResponse.json({ error: "brandId and deliverableId are required" }, { status: 400 });
    }
    const allowedAspects = ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "21:9", "3:2"];
    if (aspectRatio != null && !allowedAspects.includes(aspectRatio)) {
      return NextResponse.json({ error: `Unsupported aspect ratio: ${aspectRatio}` }, { status: 422 });
    }

    await connectToDatabase();
    const deliverable = await CalosDeliverable.findOne({
      "card.id": deliverableId,
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    });
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    const generationOwnerUserId = typeof deliverable.ownerUserId === "string"
      ? deliverable.ownerUserId.trim()
      : "";
    if (!generationOwnerUserId) {
      return NextResponse.json(
        { error: "Deliverable owner is missing", code: "DELIVERABLE_OWNER_MISSING" },
        { status: 500 },
      );
    }
    billingUserId = generationOwnerUserId;

    const format = deliverable.card?.contentFormat || "text";
    if (serviceForFormat(format) !== "clickatron") {
      return NextResponse.json({ error: "This card is not an image format." }, { status: 422 });
    }
    if (deliverable.assetUrl) {
      return NextResponse.json({ error: "This card already has an image.", code: "HAS_IMAGE" }, { status: 409 });
    }
    if (deliverable.editorialStatus !== "drafting") {
      return NextResponse.json(
        { error: "This card is not awaiting image generation.", code: "INVALID_IMAGE_STATE" },
        { status: 409 },
      );
    }
    if (!(deliverable.imagePrompt || "").trim()) {
      return NextResponse.json({ error: "No image prompt on this card yet; generate the card first." }, { status: 422 });
    }

    const now = new Date();
    const hasError = Boolean(deliverable.errorMessage?.trim());
    if (
      deliverable.serviceRef?.jobId &&
      !hasError &&
      !isExpiredPendingClaim(deliverable.serviceRef, now)
    ) {
      return NextResponse.json(
        { error: "An image is already being generated for this card.", code: "ALREADY_GENERATING" },
        { status: 409 },
      );
    }

    const expiredClaim = isExpiredPendingClaim(deliverable.serviceRef, now);
    const priorClaimId = expiredClaim && typeof deliverable.serviceRef?.variationId === "string"
      ? deliverable.serviceRef.variationId
      : null;
    const claimId = priorClaimId || nanoid();
    const pendingJobId = `claim:${claimId}`;
    const billingIdempotencyKey = priorClaimId
      ? deliverable.serviceRef?.billingIdempotencyKey
        || `calos:image:${generationOwnerUserId}:${brandId}:${deliverableId}:v${deliverable.version}:${claimId}`
      : `calos:image:${generationOwnerUserId}:${brandId}:${deliverableId}:v${deliverable.version}:${claimId}`;
    const priorBilling = priorClaimId
      ? {
          ...(deliverable.serviceRef?.creditTransactionId
            ? { creditTransactionId: deliverable.serviceRef.creditTransactionId }
            : {}),
          ...(typeof deliverable.serviceRef?.chargedCredits === "number"
            ? { chargedCredits: deliverable.serviceRef.chargedCredits }
            : {}),
        }
      : {};
    const claimed = await CalosDeliverable.findOneAndUpdate(
      {
        _id: deliverable._id,
        version: deliverable.version,
        editorialStatus: "drafting",
        deletedAt: null,
        assetUrl: { $in: [null, ""] },
        $or: [
          { "serviceRef.jobId": { $exists: false } },
          { "serviceRef.jobId": null },
          { "serviceRef.jobId": "" },
          { errorMessage: { $exists: true, $nin: [null, ""] } },
          { "serviceRef.jobId": /^claim:/, "serviceRef.claimExpiresAt": { $lte: now } },
        ],
      },
      {
        $set: {
          serviceRef: {
            service: "clickatron",
            jobId: pendingJobId,
            variationId: claimId,
            deliverableVersion: deliverable.version,
            claimExpiresAt: new Date(now.getTime() + IMAGE_CLAIM_TTL_MS),
            billingIdempotencyKey,
            ...priorBilling,
          },
          errorMessage: null,
        },
      },
      { new: true },
    );
    if (!claimed) {
      return NextResponse.json(
        { error: "An image is already being generated for this card.", code: "ALREADY_GENERATING" },
        { status: 409 },
      );
    }
    claim = {
      mongoId: claimed._id,
      id: claimId,
      pendingJobId,
      version: claimed.version,
    };

    const prompt = (claimed.imagePrompt || "").trim();
    if (!prompt) {
      if (!(await releaseClaim(null))) {
        return NextResponse.json({ error: "Image claim release needs reconciliation.", code: "CLAIM_RELEASE_PENDING" }, { status: 500 });
      }
      return NextResponse.json({ error: "The image prompt changed; generate the card again." }, { status: 409 });
    }

    let deduction;
    try {
      deduction = await CreditsService.deductCredits(
        generationOwnerUserId,
        "clickatron",
        "variation",
        {
          quantity: 1,
          taskId: pendingJobId,
          idempotencyKey: billingIdempotencyKey,
        },
      );
    } catch (billingError) {
      workAccepted = true;
      console.error("[CalOS] image credit deduction outcome is unknown; claim retained", {
        deliverableId,
        claimId,
        error: billingError,
      });
      return NextResponse.json(
        { error: "Image billing status needs reconciliation.", code: "BILLING_STATUS_PENDING" },
        { status: 202 },
      );
    }
    if (!deduction.success) {
      if (!(await releaseClaim(null))) {
        return NextResponse.json({ error: "Image claim release needs reconciliation.", code: "CLAIM_RELEASE_PENDING" }, { status: 500 });
      }
      const insufficient = deduction.error?.startsWith("Insufficient ") ?? false;
      return NextResponse.json(
        {
          error: insufficient ? "Insufficient credits" : deduction.error || "Credit deduction failed",
          code: insufficient ? "INSUFFICIENT_CREDITS" : "CREDIT_DEDUCTION_FAILED",
        },
        { status: insufficient ? 402 : 500 },
      );
    }
    if (!deduction.transactionId) {
      workAccepted = true;
      console.error("[CalOS] image credit deduction returned no transaction ID", {
        deliverableId,
        claimId,
      });
      return NextResponse.json(
        { error: "Image billing status needs reconciliation.", code: "BILLING_STATUS_PENDING" },
        { status: 202 },
      );
    }
    charge = {
      transactionId: deduction.transactionId,
      chargedCredits: deduction.creditsDeducted,
    };

    try {
      const billingLinked = await CalosDeliverable.updateOne(
        {
          _id: claimed._id,
          version: claimed.version,
          "serviceRef.jobId": pendingJobId,
          "serviceRef.variationId": claimId,
        },
        {
          $set: {
            "serviceRef.creditTransactionId": charge.transactionId,
            "serviceRef.chargedCredits": charge.chargedCredits,
            "serviceRef.billingIdempotencyKey": billingIdempotencyKey,
          },
        },
      );
      if (billingLinked.matchedCount !== 1) {
        throw new Error("Image claim changed before its credit transaction was linked");
      }
    } catch (billingLinkError) {
      workAccepted = true;
      console.error("[CalOS] image charge retained because billing linkage is pending", {
        deliverableId,
        claimId,
        transactionId: charge.transactionId,
        error: billingLinkError,
      });
      return NextResponse.json(
        { error: "Image billing status needs reconciliation.", code: "BILLING_STATUS_PENDING" },
        { status: 202 },
      );
    }

    const referenceImageRefs = await collectImageReferenceUrls(brandId, claimed.campaignId);
    const kickoff = await createClickatronImageJob({
      userId: generationOwnerUserId,
      orgId: orgId ?? null,
      brandId,
      prompt,
      variationId: claimId,
      creditTransactionId: charge.transactionId,
      chargedCredits: charge.chargedCredits,
      idempotencyKey: billingIdempotencyKey,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(referenceImageRefs.length ? { referenceImageRefs } : {}),
      sourceContext: { calosDeliverableId: deliverableId, brandId },
    });

    if (!kickoff.ok) {
      const reason = kickoff.error || "Clickatron image kickoff failed";
      const safelyRefundable = kickoff.refundable === true;
      if (safelyRefundable) {
        const refunded = await refund(reason);
        if (refunded) {
          if (!(await releaseClaim(reason))) {
            return NextResponse.json(
              { error: "Image credit was refunded but its claim needs reconciliation.", code: "CLAIM_RELEASE_PENDING" },
              { status: 500 },
            );
          }
          return NextResponse.json({ error: reason }, { status: 502 });
        }
        return NextResponse.json(
          { error: "Image generation failed and its credit refund needs reconciliation.", code: "REFUND_PENDING" },
          { status: 500 },
        );
      }

      workAccepted = true;
      console.error("[CalOS] image kickoff outcome requires reconciliation; credit retained", {
        deliverableId,
        claimId,
        jobId: kickoff.jobId,
        error: reason,
      });
      return NextResponse.json(
        { queued: true, code: "GENERATION_STATUS_PENDING", serviceRef: claimed.serviceRef },
        { status: 202 },
      );
    }
    workAccepted = true;

    if (!kickoff.jobId || !kickoff.sessionId || kickoff.variationId !== claimId) {
      console.error("[CalOS] Clickatron accepted work without the claimed durable identity", {
        deliverableId,
        claimId,
        kickoff,
      });
      return NextResponse.json(
        { queued: true, code: "GENERATION_STATUS_PENDING", serviceRef: claimed.serviceRef },
        { status: 202 },
      );
    }

    try {
      const linked = await CalosDeliverable.findOneAndUpdate(
        {
          _id: claimed._id,
          version: claimed.version,
          "serviceRef.jobId": pendingJobId,
          "serviceRef.variationId": claimId,
        },
        {
          $set: {
            serviceRef: {
              service: "clickatron",
              jobId: kickoff.jobId,
              deliverableVersion: claimed.version,
              sessionId: kickoff.sessionId,
              variationId: claimId,
              creditTransactionId: charge.transactionId,
              chargedCredits: charge.chargedCredits,
              billingIdempotencyKey,
            },
            errorMessage: null,
          },
        },
        { new: true },
      );
      if (!linked) {
        console.error("[CalOS] Clickatron work accepted after its card claim changed", {
          deliverableId,
          claimId,
          jobId: kickoff.jobId,
        });
        return NextResponse.json(
          { queued: true, code: "GENERATION_STATUS_PENDING", serviceRef: claimed.serviceRef },
          { status: 202 },
        );
      }
      claim = null;
      return NextResponse.json({ queued: true, serviceRef: linked.serviceRef });
    } catch (linkError) {
      console.error("[CalOS] Clickatron work accepted but final job linkage failed", {
        deliverableId,
        claimId,
        jobId: kickoff.jobId,
        error: linkError,
      });
      return NextResponse.json(
        { queued: true, code: "GENERATION_STATUS_PENDING", serviceRef: claimed.serviceRef },
        { status: 202 },
      );
    }
  } catch (error) {
    if (!workAccepted) {
      const reason = error instanceof Error ? error.message : "Image kickoff failed";
      const refunded = await refund(reason);
      if (!refunded) {
        return NextResponse.json(
          { error: "Image generation failed and its credit refund needs reconciliation.", code: "REFUND_PENDING" },
          { status: 500 },
        );
      }
      if (!(await releaseClaim(reason))) {
        return NextResponse.json(
          { error: "Image claim release needs reconciliation.", code: "CLAIM_RELEASE_PENDING" },
          { status: 500 },
        );
      }
    }
    console.error("[CalOS] make-image error:", error);
    return NextResponse.json({ error: "Failed to start image generation" }, { status: 500 });
  }
}
