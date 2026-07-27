import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { CalosTrendOpportunity, type ICalosTrendOpportunity } from "@/schemas/calos-trend-opportunity";
import CalosDeliverable, { type ICalosDeliverable } from "@/schemas/calos-deliverable";
import { calosScope } from "@/lib/calos/scope";
import {
  contentCardClientView,
  normalizeContentCardForStorage,
  type ContentCard,
} from "@/lib/thinkforge/planning/content-card-contract";
import { toDeliverableDoc } from "@/lib/calos/deliverable-mapper";

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

class TrendDraftUnavailableError extends Error {}

function parseReviewAction(value: unknown): ReviewAction | null {
  return typeof value === "string" && (REVIEW_ACTIONS as readonly string[]).includes(value)
    ? value as ReviewAction
    : null;
}

function normalizeSnoozeDays(value: unknown): number | null {
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

    if (action === "accept") {
      if (opportunity.status !== "suggested" && opportunity.status !== "snoozed" && opportunity.status !== "accepted") {
        return NextResponse.json({ error: "Trend opportunity is no longer reviewable" }, { status: 409 });
      }
      try {
        const draft = await ensureAcceptedTrendDraft(opportunity, { userId, orgId: orgId ?? null, brandId }, now);
        const alreadyApplied = opportunity.status === "accepted";
        if (!alreadyApplied) {
          opportunity.status = "accepted";
          opportunity.reviewedAt = now;
          opportunity.reviewedBy = userId;
          opportunity.snoozedUntil = null;
          await opportunity.save();
        }
        return NextResponse.json({
          opportunity: toOpportunityView(opportunity),
          action,
          alreadyApplied,
          deliverableId: draft.card.id,
        });
      } catch (error) {
        if (error instanceof TrendDraftUnavailableError) {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }
    }

    const targetStatus = action === "dismiss" ? "dismissed" : "snoozed";
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

async function ensureAcceptedTrendDraft(
  opportunity: ICalosTrendOpportunity,
  scope: { userId: string; orgId: string | null; brandId: string },
  now: Date,
): Promise<Pick<ICalosDeliverable, "card">> {
  const calosQuery = calosScope(scope, scope.brandId);
  const existing = await CalosDeliverable.findOne({ ...calosQuery, sourceTrendOpportunityId: opportunity.opportunityId });
  if (existing) {
    if (existing.deletedAt) {
      throw new TrendDraftUnavailableError("The linked trend draft was deleted. Review a new opportunity instead.");
    }
    return existing;
  }

  let adaptationSource: Pick<ICalosDeliverable, "card" | "plannedDates"> | null = null;
  if (opportunity.recommendation === "adapt") {
    if (!opportunity.adaptDeliverableId) {
      throw new TrendDraftUnavailableError("The planned draft to adapt is unavailable. Review a new opportunity instead.");
    }
    adaptationSource = await CalosDeliverable.findOne({
      ...calosQuery,
      _id: opportunity.adaptDeliverableId,
      deletedAt: null,
    });
    if (!adaptationSource) {
      throw new TrendDraftUnavailableError("The planned draft to adapt no longer exists. Review a new opportunity instead.");
    }
    if (validFutureDates(adaptationSource.plannedDates, now).length === 0) {
      throw new TrendDraftUnavailableError("The planned draft no longer has a future date. Review a new opportunity instead.");
    }
  }

  const card = buildAcceptedTrendCard(opportunity, scope.userId, now, adaptationSource);
  try {
    return await CalosDeliverable.create({
      ...toDeliverableDoc(card, { ownerUserId: scope.userId, orgId: scope.orgId, brandId: scope.brandId }),
      sourceTrendOpportunityId: opportunity.opportunityId,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const concurrent = await CalosDeliverable.findOne({ ...calosQuery, sourceTrendOpportunityId: opportunity.opportunityId });
    if (concurrent && !concurrent.deletedAt) return concurrent;
    throw new TrendDraftUnavailableError("The trend draft could not be recovered after a concurrent request. Please retry.");
  }
}

function buildAcceptedTrendCard(
  opportunity: ICalosTrendOpportunity,
  userId: string,
  now: Date,
  adaptationSource: Pick<ICalosDeliverable, "card" | "plannedDates"> | null,
): ContentCard {
  const sourceTitle = adaptationSource?.card.title;
  const plannedDates = adaptationSource ? validFutureDates(adaptationSource.plannedDates, now) : [];
  const date = plannedDates[0] ?? now.toISOString();
  const platform = normalizedPlatform(opportunity.candidate.platform);
  const title = sourceTitle
    ? `Trend adaptation: ${sourceTitle}`
    : `Trend response: ${opportunity.candidate.title}`;
  const summary = opportunity.candidate.summary?.trim();
  const repurposingAngle = sourceTitle
    ? `Create a timely revision of "${sourceTitle}" using this trend. Keep the original card unchanged until the revision is approved.`
    : "Create a timely, on-brand response to this trend without copying its source wording or claims.";
  const details = [
    `Trend: ${opportunity.candidate.title}`,
    summary ? `What changed: ${summary}` : null,
    `Direction: ${repurposingAngle}`,
  ].filter(Boolean).join("\n");

  return contentCardClientView(normalizeContentCardForStorage({
    title,
    date,
    plannedDates: plannedDates.length > 0 ? plannedDates : [date],
    platform,
    status: "draft",
    tags: ["trend", platform],
    customTags: [],
    contentFormat: "text",
    details,
    trendContext: {
      trendId: opportunity.opportunityId,
      source: "public_trend",
      title: opportunity.candidate.title,
      ...(summary ? { summary } : {}),
      ...(opportunity.candidate.url ? { url: opportunity.candidate.url } : {}),
      provenance: opportunity.candidate.url ? [opportunity.candidate.url] : [],
      ...(typeof opportunity.relevanceScore === "number" ? { brandFit: opportunity.relevanceScore } : {}),
      expiresAt: opportunity.expiresAt.toISOString(),
      repurposingAngle,
      status: "accepted",
    },
  }, { userId }));
}

function validFutureDates(values: string[] | undefined, now: Date): string[] {
  return (values ?? []).filter((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed >= now;
  });
}

function normalizedPlatform(value: string): string {
  const platform = value.trim().toLowerCase().replace(/\s+/g, "_");
  return platform || "generic";
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
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
