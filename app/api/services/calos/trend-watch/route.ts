import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import type { ICalosTrendWatchPolicy } from "@/schemas/calos-trend-watch";
import { getTrendWatchPolicy, upsertTrendWatchPolicy } from "@/lib/calos/trend-watch-service";

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
    const policy = await getTrendWatchPolicy({ ownerUserId: userId, orgId: orgId ?? null, brandId });
    return NextResponse.json({ watch: policy ? serialize(policy) : null });
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
    if (enabled && (typeof publicNiche !== "string" || publicNiche.trim().length < 2)) {
      return NextResponse.json({ error: "A niche is required to turn on trend watching." }, { status: 400 });
    }

    await connectToDatabase();
    try {
      const policy = await upsertTrendWatchPolicy({
        ownerUserId: userId,
        orgId: orgId ?? null,
        brandId,
        enabled: Boolean(enabled),
        publicNiche: typeof publicNiche === "string" ? publicNiche : "",
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
