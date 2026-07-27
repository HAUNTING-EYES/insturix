import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import type { ICalosTrendWatchPolicy } from "@/schemas/calos-trend-watch";
import { getTrendWatchPolicy, upsertTrendWatchPolicy } from "@/lib/calos/trend-watch-service";
import { resolveBrandNiche } from "@/lib/calos/brand-niche";

export const dynamic = "force-dynamic";

/**
 * Trend-watch enrollment — the on-ramp the "Trend ideas" pipeline was missing. Turning this on for a
 * brand creates/enables a CalosTrendWatchPolicy, which the every-6h watch cron then scans, matches to
 * the brand vault, and surfaces as trend opportunities. Without an enabled policy the whole pipeline is
 * inert (nothing else writes that collection). Scoped by owner/org + brand.
 *
 * GET  ?brandId=  → { watch: { enabled, publicNiche, platforms, location, intervalHours, lastScanAt, nextScanAt } | null }
 * POST { brandId, enabled, publicNiche, platforms?, location?, intervalHours? } → { watch }
 */
function serialize(p: ICalosTrendWatchPolicy) {
  return {
    enabled: p.enabled,
    publicNiche: p.publicNiche,
    platforms: p.platforms ?? [],
    location: p.location ?? null,
    intervalHours: p.intervalHours,
    lastScanAt: p.lastScanAt ?? null,
    nextScanAt: p.nextScanAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();
    const scope = { ownerUserId: userId, orgId: orgId ?? null, brandId };
    const [policy, suggestedNiche] = await Promise.all([
      getTrendWatchPolicy(scope),
      resolveBrandNiche(scope), // from the Brand Vault — so the UI never makes the user type it
    ]);
    return NextResponse.json({ watch: policy ? serialize(policy) : null, suggestedNiche });
  } catch (error) {
    console.error("[CalOS] get trend watch error:", error);
    return NextResponse.json({ error: "Failed to load trend watch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { brandId, enabled, publicNiche, platforms, location, intervalHours } = body ?? {};
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();

    // The niche comes from the Brand Vault, not the user. Only fall back to a typed value, and only
    // error when BOTH the vault and any typed override are empty.
    let niche = typeof publicNiche === "string" ? publicNiche.trim() : "";
    if (enabled && niche.length < 2) {
      niche = await resolveBrandNiche({ ownerUserId: userId, orgId: orgId ?? null, brandId });
      if (niche.length < 2) {
        return NextResponse.json(
          { error: "Couldn't read a niche from this brand's vault — scan the brand first, or type one to override.", code: "NO_BRAND_NICHE" },
          { status: 400 },
        );
      }
    }

    try {
      const policy = await upsertTrendWatchPolicy({
        ownerUserId: userId,
        orgId: orgId ?? null,
        brandId,
        enabled: Boolean(enabled),
        publicNiche: niche,
        platforms: Array.isArray(platforms) ? platforms : undefined,
        location: typeof location === "string" ? location : null,
        intervalHours: typeof intervalHours === "number" ? intervalHours : undefined,
      });
      return NextResponse.json({ watch: serialize(policy) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid trend watch settings" }, { status: 400 });
    }
  } catch (error) {
    console.error("[CalOS] save trend watch error:", error);
    return NextResponse.json({ error: "Failed to save trend watch" }, { status: 500 });
  }
}
