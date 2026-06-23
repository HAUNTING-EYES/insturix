import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { parseISO, isValid } from "date-fns";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCadenceRule } from "@/schemas/calos-campaign";
import { proposeCadenceCards, DEFAULT_CADENCE } from "@/lib/calos/cadence";
import { persistDraftDeliverables } from "@/lib/calos/persist-deliverables";
import type { ContentCard } from "@/lib/thinkforge/planning/content-card-contract";
import { resolveEffectiveBrand } from "@/lib/shared/brand-effective-resolver";
import { buildBrandContextBlock } from "@/lib/shared/brand-context-block";
import { getTrendsProvider } from "@/lib/calos/trends";
import type { Trend } from "@/lib/calos/trends/types";
import { proposePlan } from "@/lib/calos/planner";
import { DEFAULT_OBJECTIVE, type CalosObjective } from "@/lib/calos/campaign-intent";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // LLM call — needs headroom beyond the default route timeout.

/**
 * POST /api/services/calos/ai-plan  { brandId, campaignId?, from, to }
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
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { brandId, campaignId, from, to } = body;
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    const fromDate = typeof from === "string" ? parseISO(from) : null;
    const toDate = typeof to === "string" ? parseISO(to) : null;
    if (!fromDate || !toDate || !isValid(fromDate) || !isValid(toDate)) {
      return NextResponse.json({ error: "from and to must be valid ISO dates" }, { status: 400 });
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
        ownerUserId: userId,
        brandId,
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

    const proposals = proposeCadenceCards(rules, { from: fromDate, to: toDate });
    if (proposals.length === 0) {
      return NextResponse.json({ created: 0, note: "No cadence rules produced slots in this range." });
    }
    const slots = proposals.map((p) => ({ date: p.date, platform: p.platform }));

    // Brand context — reuse the shared resolver/block (same path clickatron/editron use). CalOS is
    // ThinkForge's planning layer, so it rides the 'thinkforge' brand-source flag.
    const brand = await resolveEffectiveBrand(userId, brandId, { service: "thinkforge" }).catch(
      () => null,
    );
    const brandContext = buildBrandContextBlock(brand);
    const niche =
      brand?.voice.nicheMap || brand?.visual.industry || brand?.name || "general business";

    // Trends — best effort. A trends outage must not break planning.
    const provider = getTrendsProvider();
    let trends: Trend[] = [];
    try {
      if (provider.available()) {
        trends = await provider.getTrends({ niche, brandId, limit: 12 });
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
        slots,
        trends,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI planner unavailable";
      return NextResponse.json(
        { error: msg, hint: "Use Auto-fill for a cadence-only plan, or set GEMINI_API_KEY." },
        { status: 422 },
      );
    }

    const ideaByIndex = new Map(ideas.map((i) => [i.index, i]));
    const trendByTitle = new Map(trends.map((t) => [t.title.toLowerCase(), t]));

    const partials = slots.map((slot, index): Partial<ContentCard> => {
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

    const created = await persistDraftDeliverables(partials, { userId, brandId });
    return NextResponse.json(
      {
        created,
        ideas: ideas.length,
        slots: slots.length,
        trendsUsed: trends.length,
        provider: provider.name,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[CalOS] ai-plan error:", error);
    return NextResponse.json({ error: "Failed to generate AI plan" }, { status: 500 });
  }
}
