/**
 * GET /api/cron/process-publish-queue
 *
 * CalOS publish sweeper. Claims due, approved scheduled-publishes atomically and hands
 * each to the platform publisher. Designed to run every minute via Vercel Cron.
 *
 * SAFETY (publishing is the only irreversible action in CalOS):
 *  - KILL SWITCH: CALOS_PUBLISH_KILL_SWITCH=true halts all publishing.
 *  - Atomic claim (findOneAndUpdate + lockedAt) so overlapping ticks never double-claim a row.
 *  - A row that already has a postId is never re-posted. Unknown provider outcomes are
 *    terminalized for manual reconciliation because queue uniqueness cannot prevent a
 *    second provider post.
 *  - FAIL CLOSED: if approval cannot be verified, or no publisher is registered, the row
 *    is NOT published.
 */

import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish, {
  type ICalosScheduledPublish,
} from "@/schemas/calos-scheduled-publish";
import CalosDeliverable from "@/schemas/calos-deliverable";
import {
  getPublisher,
  type PublishParams,
  type PublishResult,
} from "@/lib/calos/publish/contract";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_LIMIT = 10; // max rows per tick — keep each invocation bounded under maxDuration
const STALE_LOCK_MS = 6 * 60 * 1000; // function maxDuration plus a buffer
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;
const STALE_PUBLISHING_ERROR =
  "Publish worker stopped after the provider call may have started; outcome is unknown. Check the platform before retrying to avoid a duplicate.";

type PublishSummary = {
  claimed: number;
  published: number;
  failed: number;
  skipped: number;
  retried: number;
  ambiguous: number;
};

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

    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const stalePublishing = await CalosScheduledPublish.updateMany(
      {
        status: "publishing",
        postId: null,
        $or: [{ lockedAt: { $lt: staleBefore } }, { lockedAt: null }],
      },
      {
        $set: {
          status: "failed",
          lockedAt: null,
          lastError: STALE_PUBLISHING_ERROR,
        },
      }
    );
    const ambiguous = Number(stalePublishing.modifiedCount) || 0;
    const summary: PublishSummary = {
      claimed: 0,
      published: 0,
      failed: ambiguous,
      skipped: 0,
      retried: 0,
      ambiguous,
    };

    if (ambiguous > 0) {
      console.error(
        `[CALOS_LOUD] publish-queue terminalized ${ambiguous} stale publishing row(s): ${STALE_PUBLISHING_ERROR}`
      );
    }

    for (let i = 0; i < BATCH_LIMIT; i++) {
      const now = new Date();
      const staleClaimBefore = new Date(now.getTime() - STALE_LOCK_MS);

      // Atomic claim: a due 'pending' row, OR a 'claimed' row whose lock went stale
      // before any provider call. One winner per row across overlapping ticks.
      const row = await CalosScheduledPublish.findOneAndUpdate(
        {
          $or: [
            { status: "pending", publishAt: { $lte: now } },
            {
              status: "claimed",
              $or: [{ lockedAt: { $lt: staleClaimBefore } }, { lockedAt: null }],
            },
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
        ...row.payload,
        ownerUserId: row.ownerUserId,
        deliverableId: row.deliverableId,
        brandId: row.brandId ?? undefined,
        accountRef: row.accountRef ?? undefined,
      };

      try {
        const result = await publisher(params);
        if (result.ok) {
          const postId = result.postId?.trim();
          if (!postId) {
            summary.ambiguous++;
            await markFailed(
              row,
              "Provider reported success without a post id; publish outcome is unknown. Check the platform before retrying to avoid a duplicate.",
              false,
              summary
            );
            continue;
          }

          row.status = "published";
          row.postId = postId;
          row.postUrl = result.postUrl ?? null;
          row.lastError = null;
          row.lockedAt = null;
          await row.save();
          summary.published++;
        } else {
          const safeRetry = isSafeAutomaticRetry(result);
          const isAmbiguous =
            result.retryable === true &&
            !safeRetry &&
            result.providerAttempted !== false;
          const message = isAmbiguous
            ? ambiguousFailureMessage(result.error || "Publish failed")
            : result.error || "Publish failed";
          if (isAmbiguous) summary.ambiguous++;
          await markFailed(row, message, safeRetry, summary);
        }
      } catch (err) {
        summary.ambiguous++;
        await markFailed(
          row,
          ambiguousFailureMessage(err instanceof Error ? err.message : "Publish threw"),
          false,
          summary
        );
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
  if (!row.deliverableId || !row.ownerUserId || !row.brandId) {
    // TODO(CALOS_LOUD): remove once stable.
    console.error("[CALOS_LOUD] publish-queue approval: row missing scope keys — refusing", {
      deliverableId: row.deliverableId,
      ownerUserId: row.ownerUserId,
      brandId: row.brandId,
    });
    return false;
  }
  const deliverable = await CalosDeliverable.findOne({
    "card.id": row.deliverableId,
    ownerUserId: row.ownerUserId,
    brandId: row.brandId,
    deletedAt: null,
  })
    .select("editorialStatus")
    .lean<{ editorialStatus?: string } | null>();
  // TODO(CALOS_LOUD): remove once stable — distinguish "not found" from "not approved".
  if (!deliverable) {
    console.error(`[CALOS_LOUD] publish-queue approval: deliverable NOT FOUND (card.id=${row.deliverableId}, owner=${row.ownerUserId}, brand=${row.brandId}) — scope mismatch or deleted`);
    return false;
  }
  if (deliverable.editorialStatus !== "approved") {
    console.error(`[CALOS_LOUD] publish-queue approval: deliverable status="${deliverable.editorialStatus}" (not approved) — refusing`);
    return false;
  }
  return true;
}

function isSafeAutomaticRetry(result: PublishResult): boolean {
  return (
    result.retryable === true &&
    (result.providerAttempted === false || result.responseStatus === 429)
  );
}

function ambiguousFailureMessage(message: string): string {
  return `Publish outcome is unknown: ${message}. Check the platform before retrying to avoid a duplicate.`;
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** exponent);
}

async function markFailed(
  row: ICalosScheduledPublish,
  message: string,
  retryable: boolean,
  summary: PublishSummary
): Promise<void> {
  const willRetry = retryable && row.attempts < row.maxAttempts;
  // TODO(CALOS_LOUD): remove once stable — every publish failure must be visible in logs during testing.
  console.error(`[CALOS_LOUD] publish-queue markFailed (platform=${row.platform}, deliverable=${row.deliverableId}, willRetry=${willRetry}, attempts=${row.attempts}/${row.maxAttempts}): ${message}`);
  row.status = willRetry ? "pending" : "failed";
  if (willRetry) {
    row.publishAt = new Date(Date.now() + retryDelayMs(row.attempts));
    summary.retried++;
  }
  row.lastError = message;
  row.lockedAt = null;
  await row.save();
  if (!willRetry) summary.failed++;
}
