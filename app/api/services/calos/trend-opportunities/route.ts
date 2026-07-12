import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { CalosTrendOpportunity, type ICalosTrendOpportunity } from "@/schemas/calos-trend-opportunity";
import { calosScope } from "@/lib/calos/scope";

export const dynamic = "force-dynamic";

const MAX_REVIEW_QUEUE = 50;
const MAX_SNOOZE_DAYS = 30;
const REVIEW_ACTIONS = ["accept", "dismiss", "snooze"] as const;

type ReviewAction = (typeof REVIEW_ACTIONS)[number];

type OpportunityView = {
  id: string;
  candidate: { title: string; summary?: string; url?: string; platform: string; capturedAt?: string; score?: number };
  relevanceScore: number | null;
  reasonCodes: string[];
  recommendation: "add" | "adapt" | null;
  calendarWindowEndsAt: string | null;
  expiresAt: string;
};

export function parseReviewAction(value: unknown): ReviewAction | null {
  return typeof value === "string" && (REVIEW_ACTIONS as readonly string[]).includes(value)
    ? value as ReviewAction
    : null;
}

export function normalizeSnoozeDays(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_SNOOZE_DAYS ? parsed : null;
}

/** GET /api/services/calos/trend-opportunities?brandId= - only currently reviewable, unexpired opportunities. */
export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();
    const now = new Date();
    const scope = calosScope({ userId, orgId }, brandId);
    await CalosTrendOpportunity.updateMany(
      { ...scope, status: { $in: ["suggested", "snoozed"] }, expiresAt: { $lte: now } },
      { $set: { status: "expired", snoozedUntil: null } },
    );
    await CalosTrendOpportunity.updateMany(
      { ...scope, status: "snoozed", snoozedUntil: { $lte: now }, expiresAt: { $gt: now } },
      { $set: { status: "suggested", snoozedUntil: null } },
    );

    const docs = await CalosTrendOpportunity.find({
      ...scope,
      status: "suggested",
      expiresAt: { $gt: now },
    })
      .sort({ relevanceScore: -1, createdAt: -1 })
      .limit(MAX_REVIEW_QUEUE)
      .lean<ICalosTrendOpportunity[]>();

    return NextResponse.json({ opportunities: docs.map(toOpportunityView) });
  } catch (error) {
    console.error("[CalOS:TrendOpportunity] list failed", { errorClass: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Failed to fetch trend opportunities" }, { status: 500 });
  }
}

/** PATCH /api/services/calos/trend-opportunities { brandId, opportunityId, action, snoozeDays? }. */
export async function PATCH(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const brandId = typeof body?.brandId === "string" ? body.brandId.trim() : "";
    const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId.trim() : "";
    const action = parseReviewAction(body?.action);
    if (!brandId || !opportunityId) return NextResponse.json({ error: "brandId and opportunityId are required" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
    const snoozeDays = action === "snooze" ? normalizeSnoozeDays(body?.snoozeDays) : null;
    if (action === "snooze" && snoozeDays === null) {
      return NextResponse.json({ error: `snoozeDays must be an integer from 1 to ${MAX_SNOOZE_DAYS}` }, { status: 400 });
    }

    await connectToDatabase();
    const opportunity = await CalosTrendOpportunity.findOne({
      ...calosScope({ userId, orgId }, brandId),
      opportunityId,
    });
    if (!opportunity) return NextResponse.json({ error: "Trend opportunity not found" }, { status: 404 });

    const now = new Date();
    if (opportunity.expiresAt <= now) {
      opportunity.status = "expired";
      opportunity.snoozedUntil = null;
      await opportunity.save();
      return NextResponse.json({ error: "Trend opportunity has expired" }, { status: 410 });
    }

    const targetStatus = action === "accept" ? "accepted" : action === "dismiss" ? "dismissed" : "snoozed";
    if (action !== "snooze" && opportunity.status === targetStatus) {
      return NextResponse.json({ opportunity: toOpportunityView(opportunity), action, alreadyApplied: true });
    }
    if (opportunity.status !== "suggested" && opportunity.status !== "snoozed") {
      return NextResponse.json({ error: "Trend opportunity is no longer reviewable" }, { status: 409 });
    }

    opportunity.status = targetStatus;
    opportunity.reviewedAt = now;
    opportunity.reviewedBy = userId;
    opportunity.snoozedUntil = action === "snooze" && snoozeDays !== null
      ? new Date(now.getTime() + snoozeDays * 24 * 60 * 60 * 1_000)
      : null;
    await opportunity.save();

    return NextResponse.json({ opportunity: toOpportunityView(opportunity), action });
  } catch (error) {
    console.error("[CalOS:TrendOpportunity] review failed", { errorClass: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Failed to review trend opportunity" }, { status: 500 });
  }
}

function toOpportunityView(doc: ICalosTrendOpportunity): OpportunityView {
  return {
    id: doc.opportunityId,
    candidate: {
      title: doc.candidate.title,
      ...(doc.candidate.summary ? { summary: doc.candidate.summary } : {}),
      ...(doc.candidate.url ? { url: doc.candidate.url } : {}),
      platform: doc.candidate.platform,
      ...(doc.candidate.capturedAt ? { capturedAt: doc.candidate.capturedAt } : {}),
      ...(typeof doc.candidate.score === "number" ? { score: doc.candidate.score } : {}),
    },
    relevanceScore: typeof doc.relevanceScore === "number" ? doc.relevanceScore : null,
    reasonCodes: safeReasonCodes(doc.reasonCodes),
    recommendation: doc.recommendation === "add" || doc.recommendation === "adapt" ? doc.recommendation : null,
    calendarWindowEndsAt: dateString(doc.calendarWindowEndsAt),
    expiresAt: dateString(doc.expiresAt) ?? new Date(0).toISOString(),
  };
}

function safeReasonCodes(value: unknown): string[] {
  const allowed = new Set(["industry_or_category", "product_or_service", "audience", "audience_need", "trend_momentum", "planned_card_alignment"]);
  return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string" && allowed.has(code)) : [];
}

function dateString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}