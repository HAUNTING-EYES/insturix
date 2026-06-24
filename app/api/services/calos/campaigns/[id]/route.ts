import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign from "@/schemas/calos-campaign";
import { isCalosObjective } from "@/lib/calos/campaign-intent";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/services/calos/campaigns/[id]  { brandId, updates }
 * Update a campaign. Scoped by ownerUserId + brandId. Only whitelisted fields are mutable
 * (a client can never set ownerUserId/brandId).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { brandId, updates } = body;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "updates are required" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    await connectToDatabase();
    const campaign = await CalosCampaign.findOne({
      _id: id,
      ownerUserId: userId,
      brandId,
      deletedAt: null,
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Whitelist mutable fields.
    if (typeof updates.name === "string" && updates.name.trim()) campaign.name = updates.name.trim();
    if (typeof updates.goal === "string") campaign.goal = updates.goal;
    if (isCalosObjective(updates.objective)) campaign.objective = updates.objective;
    if (typeof updates.theme === "string") campaign.theme = updates.theme;
    if (updates.status === "draft" || updates.status === "active" || updates.status === "archived") {
      campaign.status = updates.status;
    }
    if (Array.isArray(updates.cadenceRules)) campaign.cadenceRules = updates.cadenceRules;
    if (updates.startDate !== undefined) campaign.startDate = updates.startDate ?? null;
    if (updates.endDate !== undefined) campaign.endDate = updates.endDate ?? null;
    await campaign.save();

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("[CalOS] update campaign error:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/calos/campaigns/[id]?brandId=
 * Soft-delete a campaign. Scoped by ownerUserId + brandId.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    await connectToDatabase();
    const campaign = await CalosCampaign.findOne({
      _id: id,
      ownerUserId: userId,
      brandId,
      deletedAt: null,
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    campaign.deletedAt = new Date();
    await campaign.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CalOS] delete campaign error:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
