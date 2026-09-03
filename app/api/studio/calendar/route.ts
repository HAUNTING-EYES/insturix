import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import CalosDeliverable from "@/schemas/calos-deliverable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/calendar — the real CalOS calendar projection (§12), two
 * honest layers:
 *   planned   — calos_deliverables with plannedDates (the editorial
 *               pipeline: ideas/drafts awaiting approval). A planned item
 *               is NOT a scheduled post.
 *   scheduled — calos_scheduled_publishes (the delivery queue: approved
 *               occurrences with their own state and receipts).
 * Window: past 7 days + next 45 days. Nothing here auto-publishes.
 */

const WINDOW_PAST_DAYS = 7;
const WINDOW_FUTURE_DAYS = 45;

export async function GET() {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await connectToDatabase();
    const now = Date.now();
    const from = new Date(now - WINDOW_PAST_DAYS * 86_400_000);
    const to = new Date(now + WINDOW_FUTURE_DAYS * 86_400_000);
    const scope = { $or: [{ orgId: orgId ?? null }, { ownerUserId: userId }] };

    const [queue, drafts] = await Promise.all([
      CalosScheduledPublish.find({ ...scope, publishAt: { $gte: from, $lte: to } })
        .sort({ publishAt: 1 })
        .limit(150)
        .lean(),
      /* planned dates live on the deliverable; deleted and undated rows
       * are not part of any projection */
      CalosDeliverable.find({ ...scope, deletedAt: null, plannedDates: { $exists: true, $ne: [] } })
        .sort({ updatedAt: -1 })
        .limit(150)
        .lean(),
    ]);

    const scheduled = (queue as unknown as Array<{ _id: unknown; deliverableId: string; platform: string; status: string; publishAt: Date | string; postUrl?: string | null; lastError?: string | null }>).map((r) => ({
      id: String(r._id),
      deliverableId: r.deliverableId,
      platform: r.platform,
      status: r.status,
      publishAt: new Date(r.publishAt).toISOString(),
      postUrl: r.postUrl ?? null,
      lastError: r.lastError ?? null,
    }));

    const planned = (drafts as unknown as Array<{ _id: unknown; platform?: string; editorialStatus?: string; plannedDates?: Array<Date | string>; card?: { title?: string } }>)
      .flatMap((d) => {
        const dates = (d.plannedDates ?? []).map((dt) => new Date(dt)).filter((dt) => dt >= from && dt <= to);
        return dates.map((dt) => ({
          id: `${String(d._id)}_${dt.toISOString()}`,
          deliverableId: String(d._id),
          platform: d.platform ?? "unknown",
          plannedAt: dt.toISOString(),
          editorialStatus: d.editorialStatus ?? "idea",
          title: d.card?.title ?? "Untitled",
        }));
      })
      .sort((a, b) => (a.plannedAt < b.plannedAt ? -1 : 1))
      .slice(0, 150);

    return NextResponse.json({ scheduled, planned });
  } catch (error) {
    console.error("[studio] calendar read failed", error);
    return NextResponse.json({ error: "calendar_unavailable" }, { status: 503 });
  }
}
