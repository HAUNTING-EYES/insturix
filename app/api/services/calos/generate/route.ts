import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { serviceForFormat } from "@/lib/calos/generate/route-map";
import { getGenerator, type GenerateParams } from "@/lib/calos/generate/contract";
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
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { brandId, deliverableId } = await req.json();
    if (!brandId || !deliverableId) {
      return NextResponse.json({ error: "brandId and deliverableId are required" }, { status: 400 });
    }

    await connectToDatabase();
    const deliverable = await CalosDeliverable.findOne({
      "card.id": deliverableId,
      ownerUserId: userId,
      brandId,
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
      brandId,
      campaignId: deliverable.campaignId ?? null,
      deliverableId,
      format,
      platform: deliverable.platform,
      title: deliverable.card.title,
      angle: deliverable.card.details,
    };

    const result = await generator(params);
    if (!result.ok) {
      deliverable.editorialStatus = "drafting";
      deliverable.errorMessage = result.error || "Generation failed";
      await deliverable.save();
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
      // Mirror the draft onto the card so the existing card view shows it.
      deliverable.card = { ...deliverable.card, scriptPreview: result.assetText };
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
    console.error("[CalOS] generate error:", error);
    return NextResponse.json({ error: "Failed to dispatch generation" }, { status: 500 });
  }
}
