import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { ClientSession } from "mongoose";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, {
  type CalosEditorialStatus,
  type ICalosDeliverable,
} from "@/schemas/calos-deliverable";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import CalosScheduledPublish, {
  type CalosPublishPayload,
  type CalosPublishPlatform,
} from "@/schemas/calos-scheduled-publish";
import { toContentCard } from "@/lib/calos/deliverable-mapper";
import { emitBrandEvent } from "@/lib/shared/brand-events";
import { createCalosDecisionLearningEvent } from "@/lib/calos/calos-brand-learning-events";
import { calosScope } from "@/lib/calos/scope";
import {
  isCalosAutoPublishPlatform,
  loadCalosAssignmentHealth,
  type CalosAssignmentLike,
} from "@/lib/calos/publishing-assignment-health";
import {
  validatePublishReadiness,
  type PublisherMediaKind,
} from "@/lib/calos/publish/contract";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const DECISIONS = ["approved", "rejected", "changes_requested"] as const;
type Decision = (typeof DECISIONS)[number];

// decision -> editorial stage. 'rejected'/'changes_requested' both kick the card back to
// changes_requested; only 'approved' advances it to approved.
const DECISION_STATUS: Record<Decision, CalosEditorialStatus> = {
  approved: "approved",
  rejected: "changes_requested",
  changes_requested: "changes_requested",
};

/**
 * POST /api/services/calos/deliverables/[id]/decision  { brandId, decision, notes? }
 * Record an editorial decision on a deliverable (id = card.id). Scoped by ownerUserId + brandId.
 * Appends a version-bound approval and transitions editorialStatus. This is the hook where brand
 * learning will emit (approve -> affirm, changes -> reject) — wired in the brand-learning pass.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { brandId, decision, notes, publishNow } = body;
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    const database = await connectToDatabase();
    // Phase D: an org teammate (not just the creator) can decide on the org's brand cards.
    const deliverable = await CalosDeliverable.findOne({
      "card.id": id,
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    });
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });

    let publishTarget: PublishTarget | null = null;
    if (decision === "approved") {
      const resolution = await resolveApprovedPublishTarget(deliverable, brandId, publishNow);
      if ("error" in resolution) {
        return NextResponse.json({ error: resolution.error }, { status: 409 });
      }
      publishTarget = resolution.target;
    }

    const alreadyApprovedAtCurrentVersion =
      decision === "approved" &&
      deliverable.editorialStatus === "approved" &&
      deliverable.approvals.some(
        (approval: ICalosDeliverable["approvals"][number]) =>
          approval.decision === "approved" && approval.version === deliverable.version,
      );
    const originalEditorialStatus = deliverable.editorialStatus;
    const originalApprovals = Array.from(deliverable.approvals);
    const restoreDecisionState = () => {
      deliverable.editorialStatus = originalEditorialStatus;
      deliverable.approvals.splice(0, deliverable.approvals.length, ...originalApprovals);
    };
    const applyDecision = () => {
      deliverable.editorialStatus = DECISION_STATUS[decision as Decision];
      if (!alreadyApprovedAtCurrentVersion) {
        deliverable.approvals.push({
          actor: userId,
          decision: decision as Decision,
          version: deliverable.version,
          at: new Date(),
          notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 1000) : undefined,
        });
      }
    };

    // Approval and its publish job are one consistency boundary. Mongoose also resets document
    // change tracking between transaction retries and closes the underlying session.
    if (decision === "approved" && publishTarget) {
      try {
        await database.connection.transaction(async (session: ClientSession) => {
          restoreDecisionState();
          applyDecision();
          await deliverable.save({ session });
          await enqueueApprovedPublish(
            deliverable,
            brandId,
            publishTarget,
            session,
            publishNow,
          );
        });
      } catch (e) {
        restoreDecisionState();
        console.error("[CALOS_LOUD] decision: approval transaction FAILED and rolled back:", e);
        return NextResponse.json(
          {
            error: "Approval was not saved because its publish job could not be scheduled. Try again.",
            card: toContentCard(deliverable),
            publish: { queued: false, accountRef: publishTarget.accountRef },
          },
          { status: 500 },
        );
      }
    } else {
      applyDecision();
      await deliverable.save();
    }

    // Teach the brand vault from the decision (staged as a DRAFT by the brand-learning worker;
    // applied only after a human accepts it). Best-effort: a learning-emit failure must never fail
    // the decision itself.
    try {
      const learningEvent = createCalosDecisionLearningEvent({
        userId,
        brandId,
        campaignId: deliverable.campaignId,
        contentId: id,
        title: deliverable.card.title,
        decision: decision as Decision,
        observedAt: new Date().toISOString(),
        notes: typeof notes === "string" ? notes : undefined,
      });
      // On approval, carry the accepted copy so the brand-learning worker can mine the brand's actual
      // voice from it in the background — never block this decision response on a model call.
      const copyText =
        decision === "approved"
          ? [deliverable.card.title, deliverable.card.scriptPreview, deliverable.assetText]
              .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
              .join("\n")
              .slice(0, 4000) || undefined
          : undefined;
      await emitBrandEvent({
        userId,
        brandId,
        service: "thinkforge",
        type: "user_override",
        payload: {
          learningEvents: [learningEvent],
          ...(copyText ? { copyText, contentId: id, campaignId: deliverable.campaignId } : {}),
        },
      });
    } catch (e) {
      console.warn("[CalOS] decision brand-learning emit failed (non-fatal):", e);
    }

    return NextResponse.json({
      card: toContentCard(deliverable),
      ...(decision === "approved"
        ? {
            publish: {
              queued: Boolean(publishTarget),
              accountRef: publishTarget?.accountRef ?? null,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("[CalOS] decision error:", error);
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}

type PublishTarget = {
  platform: CalosPublishPlatform;
  accountRef: string;
  ownerUserId: string;
  contentFormat: string;
  mediaKind: PublisherMediaKind;
};

const PLATFORM_LABELS: Record<CalosPublishPlatform, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X",
  tiktok: "TikTok",
};

function publishAtFor(deliverable: ICalosDeliverable, publishNow?: boolean): Date {
  /* §13 "ship this now": an approval may carry publishNow — the occurrence
   * enqueues for immediate execution instead of its planned date. The
   * authorization is still THIS decision; only the timing moves. */
  if (publishNow) return new Date();
  const scheduled = deliverable.plannedDates?.[0] ?? deliverable.card?.date;
  const parsed = scheduled ? new Date(scheduled) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function publishCopyFor(deliverable: ICalosDeliverable): string {
  return deliverable.assetText ?? deliverable.card?.scriptPreview ?? deliverable.card?.title ?? "";
}

async function resolveApprovedPublishTarget(
  deliverable: ICalosDeliverable,
  brandId: string,
  publishNow?: boolean,
): Promise<{ target: PublishTarget | null } | { error: string }> {
  const platform = String(deliverable.platform || "").toLowerCase();
  if (!isCalosAutoPublishPlatform(platform)) return { target: null };

  const readiness = validatePublishReadiness({
    platform,
    contentFormat: deliverable.card?.contentFormat,
    assetUrl: deliverable.assetUrl,
    copyText: publishCopyFor(deliverable),
  });
  if (!readiness.ok) return { error: readiness.error };

  const assignments = await CalosConnectedAccount.find({
    brandId,
    platform,
    ...(deliverable.orgId ? { orgId: deliverable.orgId } : {}),
  })
    .select("platform accountRef accountType displayName ownerUserId accessTokenEnc refreshTokenEnc expiresAt scopes")
    .lean<CalosAssignmentLike[]>();
  const accountRefs = Array.from(
    new Set(
      assignments
        .map((assignment) => assignment.accountRef?.trim())
        .filter((accountRef): accountRef is string => Boolean(accountRef)),
    ),
  );
  const platformLabel = PLATFORM_LABELS[platform];

  if (accountRefs.length === 0) {
    return {
      error: `Connect and assign a ${platformLabel} account to this brand before approval.`,
    };
  }
  if (accountRefs.length > 1) {
    return {
      error: `Multiple ${platformLabel} accounts are assigned. Keep one active account in Publishing before approval.`,
    };
  }
  const health = (
    await loadCalosAssignmentHealth(assignments, publishAtFor(deliverable, publishNow).getTime())
  )[platform];
  if (!health || health.state !== "assigned") {
    return {
      error: health?.message || `${platformLabel} connection could not be verified before approval.`,
    };
  }
  const selectedAssignment = assignments.find(
    (assignment) => assignment.accountRef?.trim() === accountRefs[0],
  );
  const assignmentOwnerUserId = selectedAssignment?.ownerUserId?.trim();
  if (!assignmentOwnerUserId) {
    return { error: `${platformLabel} assignment has no token owner. Reassign it before approval.` };
  }
  return {
    target: {
      platform,
      accountRef: accountRefs[0],
      ownerUserId: assignmentOwnerUserId,
      contentFormat: readiness.format,
      mediaKind: readiness.mediaKind,
    },
  };
}

/**
 * Enqueue a delivery-queue row when a deliverable is approved (the produce side; the
 * process-publish-queue cron consumes it). Each approved version gets an immutable occurrence;
 * reapproving the same version is idempotent, while older untouched occurrences are superseded.
 */
async function enqueueApprovedPublish(
  deliverable: ICalosDeliverable,
  brandId: string,
  target: PublishTarget,
  session: ClientSession,
  publishNow?: boolean,
): Promise<void> {
  const publishAt = publishAtFor(deliverable, publishNow);

  const caption = publishCopyFor(deliverable);
  // Bind execution to the exact reviewed version and its typed media requirement.
  const payload: CalosPublishPayload = {
    schemaVersion: 1,
    approvalVersion: deliverable.version,
    contentFormat: target.contentFormat,
    caption,
    title: deliverable.card?.title || caption,
    media: {
      kind: target.mediaKind,
      url: deliverable.assetUrl ?? null,
    },
  };
  const currentSnapshot = {
    ownerUserId: target.ownerUserId,
    orgId: deliverable.orgId ?? null,
    brandId,
    accountRef: target.accountRef,
    payload,
    publishAt,
  };

  const idempotencyKey = `${deliverable.card.id}:${target.platform}:v${deliverable.version}`;
  await CalosScheduledPublish.updateMany(
    {
      deliverableId: deliverable.card.id,
      orgId: deliverable.orgId ?? null,
      brandId,
      platform: target.platform,
      status: "pending",
      attempts: 0,
      postId: null,
      idempotencyKey: { $ne: idempotencyKey },
      $or: [
        { approvalVersion: { $lt: deliverable.version } },
        { approvalVersion: null },
      ],
    },
    {
      $set: {
        status: "superseded",
        lockedAt: null,
        lastError: `Superseded by approval version ${deliverable.version}.`,
      },
    },
    { session },
  );
  await CalosScheduledPublish.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        deliverableId: deliverable.card.id,
        approvalVersion: deliverable.version,
        ...currentSnapshot,
        platform: target.platform,
        status: "pending",
        attempts: 0,
        idempotencyKey,
      },
    },
    { upsert: true, new: false, session },
  );
}
