import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";
import { buildReferenceFromRequest, ReferenceInputError } from "@/lib/calos/references/build-reference";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // link fetch + document parse + an IngestorAgent LLM call

/**
 * POST /api/services/calos/campaigns/[id]/references
 *
 * Attach a source material to a campaign so generation writes FROM it (a file, a link, or pasted
 * text — see buildReferenceFromRequest). The extraction + IngestorAgent ingestion is shared with the
 * brand-scoped route (references are brand knowledge; they work with or without a campaign). Scoped by
 * campaign ownership (no IDOR).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: campaignId } = await ctx.params;
    await connectToDatabase();

    let campaign;
    try {
      campaign = await CalosCampaign.findOne({ _id: campaignId, ownerUserId: userId, deletedAt: null });
    } catch {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    let ref: CalosCampaignReference;
    try {
      ref = await buildReferenceFromRequest(req, {
        userId,
        label: campaign.name,
        systemBrief: [campaign.theme, campaign.goal].filter(Boolean).join(" — "),
      });
    } catch (e) {
      if (e instanceof ReferenceInputError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    campaign.references.push(ref);
    await campaign.save();
    return NextResponse.json({ reference: ref }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] add campaign reference error:", error);
    return NextResponse.json({ error: "Failed to add reference" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/calos/campaigns/[id]/references?refId=
 * Remove a reference from the campaign. Scoped by campaign ownership.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: campaignId } = await ctx.params;
    const refId = new URL(req.url).searchParams.get("refId");
    if (!refId) return NextResponse.json({ error: "refId is required" }, { status: 400 });

    await connectToDatabase();
    let campaign;
    try {
      campaign = await CalosCampaign.findOne({ _id: campaignId, ownerUserId: userId, deletedAt: null });
    } catch {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const before = campaign.references.length;
    campaign.references = campaign.references.filter((r: CalosCampaignReference) => r.id !== refId);
    if (campaign.references.length === before) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    await campaign.save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CalOS] delete campaign reference error:", error);
    return NextResponse.json({ error: "Failed to remove reference" }, { status: 500 });
  }
}
