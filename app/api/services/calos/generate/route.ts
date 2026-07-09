import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { serviceForFormat } from "@/lib/calos/generate/route-map";
import { getGenerator, type GenerateParams } from "@/lib/calos/generate/contract";
import { calosScope } from "@/lib/calos/scope";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import "@/lib/calos/generate/register"; // side-effect: wires the live generators

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a wired generator may call an LLM/render — needs headroom.

/**
 * POST /api/services/calos/generate  { brandId, deliverableId }
 *
 * Dispatch a planned card to the service that makes its format (ThinkForge writes, Clickatron
 * graphics, Editron video). If that service has a generator wired, run it and store the asset;
 * otherwise record the handoff (status 'drafting' + serviceRef.service) so the work can be
 * finished in that service. Honest (R18N): never reports 'generated' unless a generator actually
 * produced an asset. Scoped by ownerUserId + brandId + card.id (no IDOR).
 */
export async function POST(req: NextRequest) {
  let generationCreditCheck: CreditCheckResult | null = null;
  let generationCreditsDeducted = false;
  const refundGenerationCredits = async (reason: string) => {
    if (!generationCreditCheck || !generationCreditsDeducted) return;
    try {
      await generationCreditCheck.refund(reason);
    } catch (refundError) {
      console.error("[CalOS] generate credit refund failed:", refundError);
    } finally {
      generationCreditsDeducted = false;
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
    if (!deliverable) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    const format = deliverable.card.contentFormat || "text";
    const service = serviceForFormat(format);
    const generator = getGenerator(service);

    if (!generator) {
      // No automated generator yet — record the assignment, do NOT fake an asset.
      deliverable.serviceRef = { service };
      deliverable.editorialStatus = "drafting";
      await deliverable.save();
      return NextResponse.json({
        routedTo: service,
        status: "drafting",
        generatorWired: false,
        message: `Routed to ${service}. No automated generator is wired yet — open ${service} to create it.`,
      });
    }

    const params: GenerateParams = {
      ownerUserId: userId,
      orgId: orgId ?? null,
      brandId,
      campaignId: deliverable.campaignId ?? null,
      deliverableId,
      format,
      platform: deliverable.platform,
      title: deliverable.card.title,
      angle: deliverable.card.details,
    };

    generationCreditCheck = await checkCredits(userId, "calos", "generate_deliverable", {
      requestType: service,
    });
    if (!generationCreditCheck.allowed) return generationCreditCheck.errorResponse!;
    await generationCreditCheck.deduct();
    generationCreditsDeducted = true;

    const result = await generator(params);
    if (!result.ok) {
      deliverable.editorialStatus = "drafting";
      deliverable.errorMessage = result.error || "Generation failed";
      await deliverable.save();
      await refundGenerationCredits(result.error || "CalOS generation failed");
      return NextResponse.json(
        { error: result.error || "Generation failed", routedTo: service },
        { status: 502 },
      );
    }

    deliverable.editorialStatus = result.status ?? "generated";
    deliverable.serviceRef = { service, ...result.serviceRef };
    deliverable.assetUrl = result.assetUrl ?? null;
    deliverable.assetText = result.assetText ?? null;
    if (result.assetText) {
      // Make the day's post/script a first-class ThinkForge session (visible + refinable there), then
      // mirror the draft + link onto the card. Best-effort — a session-linkage failure must never fail
      // generation (the card still holds the copy either way).
      const { createLinkedThinkForgeSession } = await import("@/lib/calos/create-thinkforge-session");
      const sessionId = await createLinkedThinkForgeSession({
        userId,
        orgId: orgId ?? null,
        brandId,
        deliverableId,
        campaignId: deliverable.campaignId ?? null,
        title: deliverable.card.title,
        content: result.assetText,
      });
      deliverable.card = {
        ...deliverable.card,
        scriptPreview: result.assetText,
        ...(sessionId ? { sessionId } : {}),
      };
    }
    deliverable.errorMessage = null;
    await deliverable.save();

    return NextResponse.json({
      routedTo: service,
      status: "generated",
      generatorWired: true,
      assetUrl: deliverable.assetUrl,
    });
  } catch (error) {
    await refundGenerationCredits(error instanceof Error ? error.message : "CalOS generation failed");
    console.error("[CalOS] generate error:", error);
    return NextResponse.json({ error: "Failed to dispatch generation" }, { status: 500 });
  }
}
