import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveEffectiveBrand } from "@/lib/shared/brand-effective-resolver";
import { getTrendsProvider } from "@/lib/calos/trends";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the provider hits Gemini/Apify live — needs headroom.

/**
 * GET /api/services/calos/trends?brandId=&location=
 *
 * On-demand niche-trend discovery for the campaign workspace. The same provider the AI planner uses,
 * surfaced so a user can SEE what's trending in their niche before planning. Deliberately NOT
 * auto-fired by the UI (it calls live trend sources, which cost + take seconds) — the workspace
 * triggers it from a button. Best-effort (R18N): no provider configured or an outage returns an
 * empty list with a note, never a 500. Niche is resolved from the brand exactly like ai-plan.
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  const trendLocation = sanitizeTrendLocation(
    req.nextUrl.searchParams.get("location") ?? req.nextUrl.searchParams.get("trendLocation"),
  );
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const brand = await resolveEffectiveBrand(userId, brandId, {
    service: "thinkforge",
    orgId: orgId ?? null,
  }).catch(() => null);
  const niche = brand?.voice?.nicheMap || brand?.visual?.industry || brand?.name || "general business";

  const provider = getTrendsProvider();
  if (!provider.available()) {
    return NextResponse.json({
      trends: [],
      provider: provider.name,
      note: "No trends source is configured on this environment.",
      location: trendLocation ?? null,
    });
  }

  try {
    const trends = await provider.getTrends({ niche, brandId, limit: 12, location: trendLocation });
    return NextResponse.json({ trends, provider: provider.name, niche, location: trendLocation ?? null });
  } catch (e) {
    // TODO(CALOS_LOUD): revert to warn once stable.
    console.error("[CALOS_LOUD] trends discovery failed:", e);
    return NextResponse.json({
      trends: [],
      provider: provider.name,
      note: "Trends are unavailable right now. Try again shortly.",
      location: trendLocation ?? null,
    });
  }
}
function sanitizeTrendLocation(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}
