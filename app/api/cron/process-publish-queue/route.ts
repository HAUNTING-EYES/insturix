/**
 * GET /api/cron/process-publish-queue
 *
 * CalOS publish sweeper. Claims due, approved scheduled-publishes atomically and hands
 * each to the platform publisher. Designed to run every minute via Vercel Cron.
 *
 * NOT registered in vercel.json yet — it stays dormant until at least one platform
 * publisher is wired (in the authed env). To activate, add:
 *   { "path": "/api/cron/process-publish-queue", "schedule": "* * * * *" }
 *
 * SAFETY (publishing is the only irreversible action in CalOS):
 *  - KILL SWITCH: CALOS_PUBLISH_KILL_SWITCH=true halts all publishing.
 *  - Atomic claim (findOneAndUpdate + lockedAt) so overlapping ticks never double-claim a row.
 *  - Idempotency: a row that already has a postId is never re-posted; the unique
 *    idempotencyKey (deliverableId:platform) blocks duplicates at the data layer.
 *  - FAIL CLOSED: if approval cannot be verified, or no publisher is registered, the row
 *    is NOT published.
 */

import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish, {
  type ICalosScheduledPublish,
} from "@/schemas/calos-scheduled-publish";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { getPublisher, type PublishParams } from "@/lib/calos/publish/contract";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_LIMIT = 10; // max rows per tick — keep each invocation bounded under maxDuration
const STALE_LOCK_MS = 5 * 60 * 1000; // re-claim a row stuck in 'claimed' >5 min (previous tick crashed)

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is configured.
  // Require it — never trust the spoofable user-agent. No secret => deny (fail closed): publishing
  // is the only irreversible action and must not run without an explicit secret.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (process.env.CALOS_PUBLISH_KILL_SWITCH === "true") {
      return NextResponse.json({ message: "CalOS publishing halted by kill switch", processed: 0 });
    }

    await connectToDatabase();

    const summary = { claimed: 0, published: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < BATCH_LIMIT; i++) {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);

      // Atomic claim: a due 'pending' row, OR a 'claimed' row whose lock went stale
      // (a previous tick crashed mid-publish). One winner per row across overlapping ticks.
      const row = await CalosScheduledPublish.findOneAndUpdate(
        {
          $or: [
            { status: "pending", publishAt: { $lte: now } },
            { status: "claimed", lockedAt: { $lt: staleBefore } },
          ],
        },
        { $set: { status: "claimed", lockedAt: now }, $inc: { attempts: 1 } },
        { sort: { publishAt: 1 }, new: true }
      );

      if (!row) break; // nothing due
      summary.claimed++;

      // Idempotency: never re-post a row that already produced a post.
      if (row.postId) {
        row.status = "published";
        row.lockedAt = null;
        await row.save();
        summary.skipped++;
        continue;
      }

      // FAIL CLOSED — the approval gate. A deliverable MUST be approved before publish.
      // calos_deliverables + its editorialStatus land in P0; until this can read real
      // approval, it returns false so the sweeper never publishes anything unapproved.
      const approved = await isDeliverableApproved(row);
      if (!approved) {
        await markFailed(row, "Deliverable not approved (or approval unverifiable) — refusing to publish", false, summary);
        continue;
      }

      const publisher = getPublisher(row.platform);
      if (!publisher) {
        await markFailed(row, `No publisher registered for platform "${row.platform}"`, false, summary);
        continue;
      }

      row.status = "publishing";
      await row.save();

      const params: PublishParams = {
        ownerUserId: row.ownerUserId,
        deliverableId: row.deliverableId,
        brandId: row.brandId ?? undefined,
        accountRef: row.accountRef ?? undefined,
        ...row.payload,
      };

      try {
        const result = await publisher(params);
        if (result.ok) {
          row.status = "published";
          row.postId = result.postId ?? null;
          row.postUrl = result.postUrl ?? null;
          row.lastError = null;
          row.lockedAt = null;
          await row.save();
          summary.published++;
        } else {
          await markFailed(row, result.error || "Publish failed", result.retryable ?? false, summary);
        }
      } catch (err) {
        // A thrown error is treated as transient (retryable) — the platform call may have
        // timed out; the idempotency check on the next attempt prevents a double-post.
        await markFailed(row, err instanceof Error ? err.message : "Publish threw", true, summary);
      }
    }

    return NextResponse.json({ message: "CalOS publish sweep complete", ...summary });
  } catch (error) {
    console.error("[calos-publish-cron] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish sweep failed" },
      { status: 500 }
    );
  }
}

/**
 * Approval gate (the "approved = only door to delivery" contract). Reads the deliverable's
 * editorialStatus from calos_deliverables (same Mongoose connection as the queue) scoped by
 * owner + brand + card id (no cross-scope). FAIL CLOSED: anything but a found, approved
 * deliverable returns false, so the sweeper never publishes unapproved (or unresolvable) content.
 */
async function isDeliverableApproved(row: ICalosScheduledPublish): Promise<boolean> {
  if (!row.deliverableId || !row.ownerUserId || !row.brandId) return false;
  const deliverable = await CalosDeliverable.findOne({
    "card.id": row.deliverableId,
    ownerUserId: row.ownerUserId,
    brandId: row.brandId,
    deletedAt: null,
  })
    .select("editorialStatus")
    .lean<{ editorialStatus?: string } | null>();
  return deliverable?.editorialStatus === "approved";
}

async function markFailed(
  row: ICalosScheduledPublish,
  message: string,
  retryable: boolean,
  summary: { failed: number }
): Promise<void> {
  const willRetry = retryable && row.attempts < row.maxAttempts;
  row.status = willRetry ? "pending" : "failed"; // back to pending so a later tick re-claims it
  row.lastError = message;
  row.lockedAt = null;
  await row.save();
  if (!willRetry) summary.failed++;
}
