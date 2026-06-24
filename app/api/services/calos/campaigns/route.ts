import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign from "@/schemas/calos-campaign";
import { isCalosObjective, DEFAULT_OBJECTIVE } from "@/lib/calos/campaign-intent";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/calos/campaigns?brandId=
 * List the caller's campaigns for a client/brand. Scoped by ownerUserId + brandId.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    await connectToDatabase();
    const campaigns = await CalosCampaign.find({
      ownerUserId: userId,
      brandId,
      deletedAt: null,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("[CalOS] list campaigns error:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

/**
 * POST /api/services/calos/campaigns  { brandId, name, goal?, cadenceRules?, startDate?, endDate?, orgId? }
 * Create a campaign (the strategy container that owns cadence + goals for a client/brand).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { brandId, name, goal, objective, theme, cadenceRules, startDate, endDate, orgId } = body;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    await connectToDatabase();
    const campaign = await CalosCampaign.create({
      ownerUserId: userId,
      brandId,
      orgId: orgId ?? null,
      name: name.trim(),
      goal: typeof goal === "string" ? goal : "",
      objective: isCalosObjective(objective) ? objective : DEFAULT_OBJECTIVE,
      theme: typeof theme === "string" ? theme : "",
      cadenceRules: Array.isArray(cadenceRules) ? cadenceRules : [],
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] create campaign error:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
