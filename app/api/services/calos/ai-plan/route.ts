import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { parseISO, isValid } from "date-fns";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCadenceRule } from "@/schemas/calos-campaign";
import { proposeCadenceCards, DEFAULT_CADENCE } from "@/lib/calos/cadence";
import { persistDraftDeliverables } from "@/lib/calos/persist-deliverables";
import CalosDeliverable from "@/schemas/calos-deliverable";
import type { ContentCard } from "@/lib/thinkforge/planning/content-card-contract";
import { resolveEffectiveBrandWithProfile } from "@/lib/shared/brand-effective-resolver";
import { buildBrandContextBlock, buildRichBrandContextBlock } from "@/lib/shared/brand-context-block";
import { getTrendsProvider } from "@/lib/calos/trends";
import type { Trend } from "@/lib/calos/trends/types";
import { proposePlan } from "@/lib/calos/planner";
import { DEFAULT_OBJECTIVE, type CalosObjective } from "@/lib/calos/campaign-intent";
import { calosScope } from "@/lib/calos/scope";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // LLM call — needs headroom beyond the default route timeout.

/**
 * POST /api/services/calos/ai-plan  { brandId, campaignId?, from, to, trendLocation? }
 *
 * AI-proposed plan: build the cadence skeleton, fetch brand-niche trends, ask the planner to draft
 * one on-brand idea per slot (repurposing trends where they fit), and persist them as DRAFT
 * deliverables (editorial 'idea'). Draft-only — never schedulable here, so this can't put anything
 * live (the approval flow gates that).
 *
 * Degrades loudly (R18N): no Gemini key -> 422 pointing the user at plain Auto-fill; trends outage
 * -> proceed with none; model under-fills -> the missing slot gets a plain draft (surfaced as
 * created-vs-slots in the response, not hidden).
 */
export async function POST(req: NextRequest) {
  let creditCheck: CreditCheckResult | null = null;
  let creditsDeducted = false;
  const refundAiPlanCredits = async (reason: string) => {
    if (!creditCheck || !creditsDeducted) return;
    try {
      await creditCheck.refund(reason);
    } catch (refundError) {
      console.error("[CalOS] ai-plan credit refund failed:", refundError);
    } finally {
      creditsDeducted = false;
    }
  };

  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { brandId, campaignId, from, to, trendLocation: rawTrendLocation, location } = body;
    const trendLocation = sanitizeTrendLocation(rawTrendLocation ?? location);
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    const fromDate = typeof from === "string" ? parseISO(from) : null;
    const toDate = typeof to === "string" ? parseISO(to) : null;
    if (!fromDate || !toDate || !isValid(fromDate) || !isValid(toDate)) {
      return NextResponse.json({ error: "from and to must be valid ISO dates" }, { status: 400 });
    }
    // Never plan content for the past — clamp the window start to now.
    const now = new Date();
    const effectiveFrom = fromDate < now ? now : fromDate;
    if (toDate < effectiveFrom) {
      return NextResponse.json({ created: 0, note: "Date range is entirely in the past." });
    }

    await connectToDatabase();

    // Cadence + goal: from the campaign when given, else the default (no campaign required).
    let rules: { platform: string; perWeek: number; preferredDays: number[] }[];
    let goal: string | undefined;
    let objective: CalosObjective = DEFAULT_OBJECTIVE;
    let theme: string | undefined;
    let campaignRef: string | null = null;
    if (campaignId) {
      if (!Types.ObjectId.isValid(campaignId)) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      const campaign = await CalosCampaign.findOne({
        _id: campaignId,
        ...calosScope({ userId, orgId }, brandId),
        deletedAt: null,
      });
      if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      rules = campaign.cadenceRules.map((r: CalosCadenceRule) => ({
        platform: r.platform,
        perWeek: r.perWeek,
        preferredDays: [...r.preferredDays],
      }));
      goal = campaign.goal || undefined;
      objective = campaign.objective;
      theme = campaign.theme || undefined;
      campaignRef = String(campaign._id);
    } else {
      rules = DEFAULT_CADENCE.map((r) => ({ ...r, preferredDays: [...r.preferredDays] }));
    }

    const proposals = proposeCadenceCards(rules, { from: effectiveFrom, to: toDate });
    if (proposals.length === 0) {
      return NextResponse.json({ created: 0, note: "No cadence rules produced slots in this range." });
    }
    const slots = proposals.map((p) => ({ date: p.date, platform: p.platform }));

    creditCheck = await checkCredits(userId, "calos", "ai_plan");
    if (!creditCheck.allowed) return creditCheck.errorResponse!;
    await creditCheck.deduct();
    creditsDeducted = true;

    // Avoid repeating ideas already planned for this brand (across months + re-runs). Org-scoped so
    // the planner dedupes against the whole team's calendar, not just the acting user's cards.
    const existingDocs = await CalosDeliverable.find({
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    })
      .select("card platform plannedDates")
      .limit(200)
      .lean<{ card?: { title?: string }; platform?: string; plannedDates?: string[] }[]>();
    const existingIdeas = existingDocs
      .map((d) => d?.card?.title)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, 100);

    // Fill EMPTY slots only: skip any (platform, day) the calendar already has, so re-running AI-plan
    // (e.g. after deleting a few inaccurate ideas) tops up the gaps with FRESH ideas instead of
    // duplicating the ones kept. If nothing's empty, refund the deduction and no-op.
    const taken = new Set(
      existingDocs.flatMap((d) =>
        (d.plannedDates ?? []).map((iso) => `${d.platform ?? "generic"}|${iso.slice(0, 10)}`),
      ),
    );
    const freshSlots = slots.filter((s) => !taken.has(`${s.platform}|${s.date.slice(0, 10)}`));
    if (freshSlots.length === 0) {
      await refundAiPlanCredits("CalOS AI plan: calendar already covers this cadence");
      return NextResponse.json({
        created: 0,
        note: "This cadence is already on the calendar — nothing empty to fill. Widen the window or add platforms/days.",
      });
    }

    // Brand context — force the vault ON (enabled:true) so CalOS always uses the rich brand profile,
    // not the thin legacy fallback, regardless of the per-service rollout flag.
    const resolution = await resolveEffectiveBrandWithProfile(userId, brandId, {
      service: "thinkforge",
      enabled: true,
      orgId: orgId ?? null,
    }).catch((e) => {
      // TODO(CALOS_LOUD): revert to warn once stable.
      console.error("[CALOS_LOUD] ai-plan brand resolve failed (planning proceeds BRAND-LESS):", e);
      return null;
    });
    const brand = resolution?.brand ?? null;
    // Feed the planner the RICH accepted vault profile when present (same dead wire the post
    // writer had); fall back to the thin block, then to empty.
    const brandContext = resolution?.acceptedProfile
      ? buildRichBrandContextBlock(resolution.acceptedProfile, brand)
      : buildBrandContextBlock(brand);
    const niche =
      brand?.voice.nicheMap || brand?.visual.industry || brand?.name || "general business";

    // Trends — best effort. A trends outage must not break planning.
    const provider = getTrendsProvider();
    let trends: Trend[] = [];
    try {
      if (provider.available()) {
        trends = await provider.getTrends({ niche, brandId, limit: 12, location: trendLocation });
      }
    } catch (e) {
      console.warn("[CalOS] ai-plan trends fetch failed, continuing without trends:", e);
    }

    // Plan. proposePlan throws if no Gemini key -> surface a clear, actionable 422.
    let ideas: Awaited<ReturnType<typeof proposePlan>>;
    try {
      ideas = await proposePlan({
        brandContext,
        brandName: brand?.name,
        objective,
        theme,
        goal,
        slots: freshSlots,
        trends,
        existingIdeas,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI planner unavailable";
      await refundAiPlanCredits(`CalOS AI plan failed: ${msg}`);
      return NextResponse.json(
        { error: msg, hint: "Use Auto-fill for a cadence-only plan, or set GEMINI_API_KEY." },
        { status: 422 },
      );
    }

    const ideaByIndex = new Map(ideas.map((i) => [i.index, i]));
    const trendByTitle = new Map(trends.map((t) => [t.title.toLowerCase(), t]));

    const partials = freshSlots.map((slot, index): Partial<ContentCard> => {
      const idea = ideaByIndex.get(index);
      const matchedTrend = idea?.trendTitle
        ? trendByTitle.get(idea.trendTitle.toLowerCase())
        : undefined;

      return {
        title: idea?.title || `${slot.platform} post`,
        date: slot.date,
        plannedDates: [slot.date],
        platform: slot.platform,
        status: "draft",
        tags: idea?.funnelStage ? [idea.funnelStage] : [],
        customTags: [],
        contentFormat: idea?.format || undefined,
        details: idea?.angle || undefined,
        campaignId: campaignRef ?? undefined,
        trendContext: matchedTrend
          ? {
              source: "public_trend",
              title: matchedTrend.title,
              summary: matchedTrend.summary,
              url: matchedTrend.url,
              provenance: [provider.name],
              repurposingAngle: idea?.angle,
              status: "suggested",
            }
          : undefined,
      };
    });

    const createdIds = await persistDraftDeliverables(partials, { userId, brandId, orgId });
    return NextResponse.json(
      {
        created: createdIds.length,
        ideas: ideas.length,
        slots: slots.length,
        trendsUsed: trends.length,
        provider: provider.name,
        trendLocation: trendLocation ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    await refundAiPlanCredits(error instanceof Error ? error.message : "CalOS AI plan failed");
    console.error("[CalOS] ai-plan error:", error);
    return NextResponse.json({ error: "Failed to generate AI plan" }, { status: 500 });
  }
}
function sanitizeTrendLocation(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}
