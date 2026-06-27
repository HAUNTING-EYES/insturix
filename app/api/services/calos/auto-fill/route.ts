import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { parseISO, isValid } from "date-fns";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCadenceRule } from "@/schemas/calos-campaign";
import { proposeCadenceCards } from "@/lib/calos/cadence";
import { persistDraftDeliverables } from "@/lib/calos/persist-deliverables";
import { calosScope } from "@/lib/calos/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/services/calos/auto-fill  { brandId, campaignId, from, to }
 * Generate DRAFT deliverables from a campaign's cadence over [from, to] and persist them.
 * Draft-only: created cards are editorial 'idea' — they can never be approved/scheduled here
 * (that requires the deliberate approval flow), so this can't put anything live.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { brandId, campaignId, from, to } = body;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!campaignId || !Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const fromDate = typeof from === "string" ? parseISO(from) : null;
    const toDate = typeof to === "string" ? parseISO(to) : null;
    if (!fromDate || !toDate || !isValid(fromDate) || !isValid(toDate)) {
      return NextResponse.json({ error: "from and to must be valid ISO dates" }, { status: 400 });
    }
    // Never fill content for the past — clamp the window start to now.
    const now = new Date();
    const effectiveFrom = fromDate < now ? now : fromDate;
    if (toDate < effectiveFrom) {
      return NextResponse.json({ created: 0, note: "Date range is entirely in the past." });
    }

    await connectToDatabase();
    const campaign = await CalosCampaign.findOne({
      _id: campaignId,
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const rules = campaign.cadenceRules.map((r: CalosCadenceRule) => ({
      platform: r.platform,
      perWeek: r.perWeek,
      preferredDays: [...r.preferredDays],
    }));
    const proposals = proposeCadenceCards(rules, { from: effectiveFrom, to: toDate });
    if (proposals.length === 0) {
      return NextResponse.json({
        created: 0,
        note: "No cadence rules produced slots in this range.",
      });
    }

    const created = await persistDraftDeliverables(
      proposals.map((p) => ({ ...p, campaignId })),
      { userId, brandId, orgId },
    );
    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] auto-fill error:", error);
    return NextResponse.json({ error: "Failed to auto-fill" }, { status: 500 });
  }
}
