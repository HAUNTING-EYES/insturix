import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/calendar — real dated milestones for the Calendar place
 * (Phase 4: Distribute). Reads CalOS's delivery queue (calos_scheduled_publishes)
 * for this org/user: every approved occurrence with its platform, time and
 * state. Delivery state lives THERE, not on deliverables — one card fans out
 * to many platforms with independent outcomes.
 *
 * Window: past 7 days + next 45 days. Nothing here auto-publishes; queued rows
 * still ride CalOS's own approval-before-publish cron safety.
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
    const rows = (await CalosScheduledPublish.find({
      $or: [{ orgId: orgId ?? null }, { ownerUserId: userId }],
      publishAt: { $gte: from, $lte: to },
    })
      .sort({ publishAt: 1 })
      .limit(150)
      .lean()) as unknown as Array<{
      _id: unknown;
      deliverableId: string;
      platform: string;
      status: string;
      publishAt: Date | string;
      postUrl?: string | null;
      lastError?: string | null;
    }>;

    return NextResponse.json({
      scheduled: rows.map((r) => ({
        id: String(r._id),
        deliverableId: r.deliverableId,
        platform: r.platform,
        status: r.status,
        publishAt: new Date(r.publishAt).toISOString(),
        postUrl: r.postUrl ?? null,
        lastError: r.lastError ?? null,
      })),
    });
  } catch (error) {
    console.error("[studio] calendar read failed", error);
    return NextResponse.json({ error: "calendar_unavailable" }, { status: 503 });
  }
}
