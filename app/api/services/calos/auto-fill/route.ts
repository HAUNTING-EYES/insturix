import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { parseISO, isValid } from "date-fns";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCadenceRule } from "@/schemas/calos-campaign";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { proposeCadenceCards } from "@/lib/calos/cadence";
import { toDeliverableDoc } from "@/lib/calos/deliverable-mapper";
import {
  normalizeContentCardForStorage,
  contentCardClientView,
} from "@/lib/thinkforge/planning/content-card-contract";

export const dynamic = "force-dynamic";

/**
 * POST /api/services/calos/auto-fill  { brandId, campaignId, from, to }
 * Generate DRAFT deliverables from a campaign's cadence over [from, to] and persist them.
 * Draft-only: created cards are editorial 'idea' — they can never be approved/scheduled here
 * (that requires the deliberate approval flow), so this can't put anything live.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
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

    await connectToDatabase();
    const campaign = await CalosCampaign.findOne({
      _id: campaignId,
      ownerUserId: userId,
      brandId,
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
    const proposals = proposeCadenceCards(rules, { from: fromDate, to: toDate });
    if (proposals.length === 0) {
      return NextResponse.json({
        created: 0,
        note: "No cadence rules produced slots in this range.",
      });
    }

    const docs = proposals.map((p) => {
      const normalized = normalizeContentCardForStorage({ ...p, campaignId }, { userId });
      const card = contentCardClientView(normalized);
      return toDeliverableDoc(card, { ownerUserId: userId, brandId, orgId: null });
    });

    const inserted = await CalosDeliverable.insertMany(docs);
    return NextResponse.json({ created: inserted.length }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] auto-fill error:", error);
    return NextResponse.json({ error: "Failed to auto-fill" }, { status: 500 });
  }
}
