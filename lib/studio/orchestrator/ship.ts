/**
 * Studio orchestrator — SHIP capability (§13 Phase 7).
 *
 * "Ship this now" from Project chat. §12 stays intact: editorial approval
 * is the ONLY publish authorization, and it flows through CalOS's decision
 * route (approval + enqueue in one transaction, account snapshot included).
 * This turn just presents that approval in the conversation — the confirm
 * card — and on the user's yes approves with publishNow. Receipts come back
 * from the queue rows (postId/postUrl); nothing is invented here.
 */

import { listEvents } from "@/lib/studio/persist/db";
import CalosDeliverable from "@/schemas/calos-deliverable";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";

export interface ShipTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
  projectId: string | null; // null while the first turn is still on "live"
  forwardHeaders: Record<string, string>;
  origin: string;
}

interface DeliverableRow {
  id: string;
  platform: string;
  brandId?: string;
  editorialStatus?: string;
  title?: string;
}

interface QueueRow {
  id: string;
  deliverableId: string;
  platform?: string;
  status?: string;
  publishAt?: Date | string;
  postUrl?: string | null;
  postId?: string | null;
  lastError?: string | null;
}

/** ship-family intent: immediate/deliberate publish commands (§13 examples) */
export function shipTurnIntent(text: string): boolean {
  return /\b(ship (it|this|the)|post (it|this)? ?now|publish (it|this)? ?now|send (it|this) (to|as))\b/i.test(text);
}

function postArtifact(row: QueueRow): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_post_${row.id}`,
    kind: "post",
    status: row.status === "published" ? "done" : "queued",
    title: `${row.platform ?? "post"} ${row.status === "published" ? "receipt" : "queued"}`,
    sourceRef: { engine: "calos", externalId: String(row.id), manualHref: row.postUrl ?? null },
    progress: row.status === "published" ? null : { stage: `delivery ${row.status ?? "pending"}`, percent: null },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runShipTurn(
  ctx: ShipTurnContext,
  _text: string,
  _signal?: AbortSignal,
  confirmAccepted?: boolean,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  if (!ctx.projectId) {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "Nothing to ship yet — this project has no accepted plan entries.",
      alternative: { description: "Plan the week first, accept the entries you want, then say ship it.", proposedSteps: [] },
    };
    return;
  }

  /* the project↔deliverable link is the accepted plan entries (§12) */
  const events = await listEvents(ctx.projectId, 0);
  const deliverableIds = events.flatMap((ev) => {
    if (ev.kind !== "plan.entry") return [];
    const p = ev.payload as { action?: string; deliverableIds?: string[] } | null;
    return p?.action === "accept" && Array.isArray(p.deliverableIds) ? p.deliverableIds : [];
  });
  if (deliverableIds.length === 0) {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "Nothing to ship yet — no accepted plan entries on this project.",
      alternative: { description: "Accept entries on the week plan first, then say ship it.", proposedSteps: [] },
    };
    return;
  }

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Shipping — approval first (it's the only publish authorization), then the queue does the rest.",
    steps: [{ stepId: "s1", capability: "distribute", toolName: "approve-and-enqueue", label: "Approve + enqueue now", riskLevel: "high" }],
  };
  yield { type: "step.start", turnId, stepId: "s1", toolName: "approve-and-enqueue" };

  let brandId = ctx.brandId ?? null;
  const deliverables = (await CalosDeliverable.find({ _id: { $in: deliverableIds }, deletedAt: null }).lean()) as unknown as Array<{
    _id: unknown; platform?: string; brandId?: string; editorialStatus?: string; title?: string;
  }>;
  const rows: DeliverableRow[] = deliverables.map((d) => ({
    id: String(d._id),
    platform: d.platform ?? "unknown",
    brandId: d.brandId,
    editorialStatus: d.editorialStatus,
    title: d.title,
  }));
  if (!brandId) brandId = rows[0]?.brandId ?? null;
  if (!brandId || rows.length === 0) {
    yield { type: "turn.error", turnId, message: "the plan's deliverables are gone (deleted or rebranded)", retryable: false, refundIssued: false };
    return;
  }

  const queueAll = async () =>
    (await CalosScheduledPublish.find({ deliverableId: { $in: deliverableIds } }).sort({ publishAt: 1 }).lean()) as unknown as QueueRow[];

  let queue = await queueAll();
  const unapproved = rows.filter((d) => {
    const rows2 = queue.filter((q) => q.deliverableId === d.id);
    const live = rows2.filter((q) => q.status !== "superseded");
    return d.editorialStatus !== "approved" && live.length === 0;
  });

  if (unapproved.length > 0 && !confirmAccepted) {
    yield {
      type: "turn.confirm_required",
      turnId,
      stepId: "s1",
      kind: "publish",
      quote: null,
      publishTargets: unapproved.map((d) => ({ platform: d.platform, scheduledAt: new Date().toISOString() })),
    };
    yield {
      type: "turn.done",
      turnId,
      summary: `${unapproved.length} card${unapproved.length > 1 ? "s" : ""} ready — approve on the card and I enqueue them NOW. Approval is CalOS's, not mine.`,
      creditsConsumedTotal: 0,
      artifactIds: [],
    };
    return;
  }

  /* the user said yes: approve each unapproved card via CalOS's decision
   * route (the single publish authorization), with publishNow — the queue
   * row lands with publishAt=now and the cron executes it */
  const failures: string[] = [];
  for (const d of unapproved) {
    try {
      const res = await fetch(new URL(`/api/services/calos/deliverables/${d.id}/decision`, ctx.origin), {
        method: "POST",
        headers: { "content-type": "application/json", ...ctx.forwardHeaders },
        body: JSON.stringify({ brandId, decision: "approved", publishNow: true }),
      });
      if (!res.ok) failures.push(`${d.platform}: decision ${res.status}`);
    } catch (error) {
      failures.push(`${d.platform}: ${error instanceof Error ? error.message : "bridge failed"}`);
    }
  }

  queue = await queueAll();
  const live = queue.filter((q) => q.status !== "superseded");
  /* one delivery artifact per ship turn (the contract carries a single
   * payload); every receipt rides the summary prose — the queue rows are
   * the durable record either way */
  const primary = live[live.length - 1];
  const artifact = primary ? postArtifact(primary) : null;
  const artifactIds = artifact ? [artifact.id] : [];

  if (failures.length > 0 && live.length === 0) {
    yield { type: "turn.error", turnId, message: `nothing shipped — ${failures.join(" · ")}`, retryable: true, refundIssued: false };
    return;
  }

  const published = live.filter((q) => q.status === "published");
  const receiptLines = live.map((q) =>
    q.status === "published"
      ? `${q.platform}: published${q.postUrl ? ` — ${q.postUrl}` : ""}`
      : `${q.platform}: ${q.status === "failed" ? `failed${q.lastError ? ` (${String(q.lastError).slice(0, 60)})` : ""}` : `queued for ${new Date(q.publishAt ?? Date.now()).toLocaleString("en-US", { timeZone: "UTC" })}`}`,
  );
  yield {
    type: "step.done",
    turnId,
    stepId: "s1",
    receipt: { label: "ship it", detail: `${published.length} published · ${live.length - published.length} in queue`, artifactIds, creditsConsumed: 0 },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: [
      failures.length > 0 ? `Partially shipped — ${failures.join(" · ")}` : "Shipped.",
      ...receiptLines,
      "Delivery receipts land here as providers confirm.",
    ].join("\n"),
    creditsConsumedTotal: 0,
    artifactIds,
    artifactPayload: artifact ?? undefined,
    stageFocus: artifact ? { artifactId: artifact.id, why: "delivery" } : undefined,
  };
}
