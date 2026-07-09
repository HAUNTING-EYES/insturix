import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { calosScope } from "@/lib/calos/scope";
import { serviceForFormat } from "@/lib/calos/generate/route-map";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import { createClickatronImageJob } from "@/lib/clickatron/create-image-job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/services/calos/make-image  { brandId, deliverableId }
 *
 * Explicit "Make image" action for a graphics card. Kicks off Clickatron image generation from the
 * image prompt stashed on the card at generate time, charging the image credit NOW (the user chose to
 * spend it — CalOS never auto-charges an image). The finished image lands back on the card via the
 * completion worker (attachGeneratedAsset), which resolves the card from sourceContext.calosDeliverableId.
 *
 * Scoped by owner/org + brand + card.id (no IDOR). Idempotent: a second call while a job is in flight
 * returns 409 rather than charging + enqueuing again. On kickoff failure the credit is refunded.
 */
export async function POST(req: NextRequest) {
  let creditCheck: CreditCheckResult | null = null;
  let deducted = false;
  const refund = async (reason: string) => {
    if (!creditCheck || !deducted) return;
    try {
      await creditCheck.refund(reason);
    } catch (e) {
      console.error("[CalOS] make-image credit refund failed:", e);
    } finally {
      deducted = false;
    }
  };

  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { brandId, deliverableId } = await req.json();
    if (!brandId || !deliverableId) {
      return NextResponse.json({ error: "brandId and deliverableId are required" }, { status: 400 });
    }

    await connectToDatabase();
    const deliverable = await CalosDeliverable.findOne({
      "card.id": deliverableId,
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    });
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });

    // Only a graphics card, still awaiting its image, with a stashed prompt can kick off.
    const format = deliverable.card?.contentFormat || "text";
    if (serviceForFormat(format) !== "clickatron") {
      return NextResponse.json({ error: "This card is not an image format." }, { status: 422 });
    }
    if (deliverable.assetUrl) {
      return NextResponse.json({ error: "This card already has an image.", code: "HAS_IMAGE" }, { status: 409 });
    }
    const prompt = (deliverable.imagePrompt || "").trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "No image prompt on this card yet — generate the card first." },
        { status: 422 },
      );
    }
    // Idempotency: a live job (jobId set, no recorded failure) means an image is already generating.
    // A prior FAILURE (errorMessage set) is retryable.
    if (deliverable.serviceRef?.jobId && !deliverable.errorMessage) {
      return NextResponse.json(
        { error: "An image is already being generated for this card.", code: "ALREADY_GENERATING" },
        { status: 409 },
      );
    }

    creditCheck = await checkCredits(userId, "clickatron", "variation", { quantity: 1 });
    if (!creditCheck.allowed) return creditCheck.errorResponse!;
    await creditCheck.deduct();
    deducted = true;

    const kickoff = await createClickatronImageJob({
      userId,
      orgId: orgId ?? null,
      brandId,
      prompt,
      // The completion worker gates on brandId and resolves the card via calosDeliverableId.
      sourceContext: { calosDeliverableId: deliverableId, brandId },
    });

    if (!kickoff.ok) {
      await refund(kickoff.error || "Clickatron image kickoff failed");
      deliverable.errorMessage = kickoff.error || "Image kickoff failed";
      await deliverable.save();
      return NextResponse.json({ error: kickoff.error || "Image kickoff failed" }, { status: 502 });
    }

    // Link the job so the card can show "generating" and the completion worker can be traced. The card
    // stays in 'drafting'; attachGeneratedAsset advances it to 'generated' when the image lands.
    deliverable.serviceRef = {
      service: "clickatron",
      jobId: kickoff.jobId,
      sessionId: kickoff.sessionId,
      variationId: kickoff.variationId,
    };
    deliverable.errorMessage = null;
    await deliverable.save();

    return NextResponse.json({ queued: true, serviceRef: deliverable.serviceRef });
  } catch (error) {
    await refund(error instanceof Error ? error.message : "make-image failed");
    console.error("[CalOS] make-image error:", error);
    return NextResponse.json({ error: "Failed to start image generation" }, { status: 500 });
  }
}
