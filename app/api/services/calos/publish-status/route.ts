import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import { calosScope } from "@/lib/calos/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/calos/publish-status?brandId=
 *
 * The calendar's DELIVERY view, so an approved card isn't a black box. Returns:
 *  - statuses: per-deliverable publish state (pending/claimed/publishing/published/failed) + postUrl
 *    + error, from the publish queue (CalosScheduledPublish). A card targets one platform, so one row.
 *  - connectedPlatforms: which platforms have a connected account for this brand — so the UI can say
 *    "connect X to publish" at approve time instead of failing silently in the cron.
 *
 * Scoped like the rest of CalOS (org-shared when in an org, else creator). Best-effort read.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const brandId = req.nextUrl.searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();
    const scope = calosScope({ userId, orgId }, brandId);

    const [rows, accounts] = await Promise.all([
      CalosScheduledPublish.find(scope)
        .select("deliverableId platform status postUrl lastError")
        .lean<
          Array<{
            deliverableId: string;
            platform: string;
            status: string;
            postUrl?: string | null;
            lastError?: string | null;
          }>
        >(),
      // Connected accounts are keyed per-brand (+ org when in an org), same as the connect routes.
      CalosConnectedAccount.find({ brandId, ...(orgId ? { orgId } : {}) })
        .select("platform")
        .lean<Array<{ platform?: string }>>(),
    ]);

    const statuses: Record<
      string,
      { platform: string; status: string; postUrl: string | null; error: string | null }
    > = {};
    for (const r of rows) {
      statuses[r.deliverableId] = {
        platform: r.platform,
        status: r.status,
        postUrl: r.postUrl ?? null,
        error: r.lastError ?? null,
      };
    }

    const connectedPlatforms = Array.from(
      new Set(accounts.map((a) => a.platform).filter((p): p is string => typeof p === "string" && p.length > 0)),
    );

    return NextResponse.json({ statuses, connectedPlatforms });
  } catch (error) {
    console.error("[CalOS] publish-status error:", error);
    return NextResponse.json({ error: "Failed to load publish status" }, { status: 500 });
  }
}
