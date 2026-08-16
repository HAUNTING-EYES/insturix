import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { calosScope } from "@/lib/calos/scope";
import { getGenerator, type GenerateParams } from "@/lib/calos/generate/contract";
import {
  resolveCalosGenerationRoute,
  UnsupportedCalosFormatError,
} from "@/lib/calos/generate/route-map";
import {
  resolveCalosWriterContext,
  type CalosWriterContext,
} from "@/lib/calos/generate/generators/_brand-brief";
import { ThinkForgeBrandAuthorityError } from "@/lib/thinkforge/context/brand-authoring-context";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import CalosDeliverable from "@/schemas/calos-deliverable";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import "@/lib/calos/generate/register";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Dispatch one scoped calendar card through its canonical writer and persist its complete artifact. */
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

    const body = await req.json();
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    const deliverableId = typeof body.deliverableId === "string" ? body.deliverableId.trim() : "";
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

    const format = typeof deliverable.card.contentFormat === "string"
      ? deliverable.card.contentFormat.trim()
      : "";
    if (!format) {
      return NextResponse.json({
        error: "Deliverable has no content format",
        code: "missing_content_format",
      }, { status: 422 });
    }

    let generationRoute: ReturnType<typeof resolveCalosGenerationRoute>;
    try {
      generationRoute = resolveCalosGenerationRoute(format);
    } catch (error) {
      if (error instanceof UnsupportedCalosFormatError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
      }
      throw error;
    }
    const service = generationRoute.service;
    const generator = getGenerator(service);
    if (!generator) {
      deliverable.serviceRef = { service };
      deliverable.editorialStatus = "drafting";
      await deliverable.save();
      return NextResponse.json({
        routedTo: service,
        status: "drafting",
        generatorWired: false,
        message: `Routed to ${service}. No automated generator is wired yet; open ${service} to create it.`,
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
      targetDurationSeconds: deliverable.card.targetDurationSeconds,
    };

    let authoringContext: CalosWriterContext | undefined;
    if (service === "thinkforge" || service === "clickatron") {
      try {
        authoringContext = await resolveCalosWriterContext(params);
      } catch (error) {
        if (error instanceof ThinkForgeBrandAuthorityError) {
          const status = error.code === "brand_not_found"
            ? 404
            : error.code === "brand_profile_unavailable"
              ? 409
              : 503;
          return NextResponse.json({
            error: "Brand context unavailable",
            code: error.code,
            message: error.message,
          }, { status });
        }
        return NextResponse.json({
          error: "Brand context unavailable",
          code: "brand_context_unavailable",
          message: "CalOS could not verify the selected Brand Vault context. Please try again before generating.",
        }, { status: 503 });
      }
    }

    generationCreditCheck = await checkCredits(userId, "calos", "generate_deliverable", {
      requestType: service,
    });
    if (!generationCreditCheck.allowed) return generationCreditCheck.errorResponse!;
    await generationCreditCheck.deduct();
    generationCreditsDeducted = true;

    const generationParams = authoringContext
      ? Object.assign({}, params, { authoringContext })
      : params;
    const result = await generator(generationParams);
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

    const artifact = result.thinkforgeArtifact;
    if (!artifact || (result.assetText !== null && result.assetText !== undefined
      && result.assetText !== artifact.content)) {
      const message = !artifact
        ? "Generator returned no canonical ThinkForge artifact."
        : "Generator visible copy conflicts with its canonical ThinkForge artifact.";
      deliverable.editorialStatus = "drafting";
      deliverable.errorMessage = message;
      await deliverable.save();
      await refundGenerationCredits(message);
      return NextResponse.json({ error: message, routedTo: service }, { status: 502 });
    }

    let sessionId: string;
    try {
      const { createLinkedThinkForgeSession } = await import("@/lib/calos/create-thinkforge-session");
      sessionId = await createLinkedThinkForgeSession({
        userId,
        orgId: orgId ?? null,
        brandId,
        deliverableId,
        campaignId: deliverable.campaignId ?? null,
        format,
        platform: deliverable.platform,
        title: deliverable.card.title,
        artifact,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ThinkForge persistence failed";
      deliverable.editorialStatus = "drafting";
      deliverable.errorMessage = message;
      await deliverable.save();
      await refundGenerationCredits(message);
      return NextResponse.json({
        error: "Generated content could not be persisted",
        message,
        routedTo: service,
      }, { status: 502 });
    }

    const status = result.status ?? "generated";
    deliverable.editorialStatus = status;
    deliverable.serviceRef = { service, ...result.serviceRef, sessionId };
    deliverable.assetUrl = result.assetUrl ?? null;
    deliverable.assetText = artifact.content;
    deliverable.imagePrompt = result.imagePrompt ?? null;
    deliverable.card = {
      ...deliverable.card,
      scriptPreview: artifact.content,
      sessionId,
    };
    deliverable.errorMessage = null;
    await deliverable.save();

    return NextResponse.json({
      routedTo: service,
      status,
      generatorWired: true,
      assetUrl: deliverable.assetUrl,
      sessionId,
    });
  } catch (error) {
    await refundGenerationCredits(error instanceof Error ? error.message : "CalOS generation failed");
    console.error("[CalOS] generate error:", error);
    return NextResponse.json({ error: "Failed to dispatch generation" }, { status: 500 });
  }
}
