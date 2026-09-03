/**
 * Studio orchestrator — DELIVERY STATUS commands (§13): "Why did LinkedIn
 * fail?" and "Retry Instagram." Reads the project's OWN queue rows (the
 * plan-entry deliverable link); retry is a deliberate user action that
 * resets a cleanly-failed row to pending for immediate execution. AMBIGUOUS
 * outcomes (the provider may already have posted) are refused — that is the
 * cron's terminalization rule and a deliberate retry must not break it.
 */

import { listEvents } from "@/lib/studio/persist/db";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

export interface DeliveryStatusContext {
  projectId: string | null;
}

interface QueueRow {
  _id: unknown;
  deliverableId: string;
  platform?: string;
  status?: string;
  publishAt?: Date | string;
  postUrl?: string | null;
  lastError?: string | null;
  attempts?: number;
  maxAttempts?: number;
}

const AMBIGUOUS = /ambiguous|check the platform/i;

export function deliveryStatusIntent(text: string): boolean {
  return /\b(why did .*(fail|failing)|retry|failed post|delivery status)\b/i.test(text);
}

function wantsRetry(text: string): boolean {
  return /\bretry\b/i.test(text);
}

/** The platform the user named, if any ("retry instagram", "why did linkedin fail"). */
function platformFromText(text: string, rows: QueueRow[]): string | null {
  const lower = text.toLowerCase();
  const hit = rows.find((r) => r.platform && lower.includes(String(r.platform).toLowerCase()));
  return hit?.platform ?? null;
}

async function projectQueueRows(projectId: string): Promise<QueueRow[]> {
  const events = await listEvents(projectId, 0);
  const deliverableIds = events.flatMap((ev) => {
    if (ev.kind !== "plan.entry") return [];
    const p = ev.payload as { action?: string; deliverableIds?: string[] } | null;
    return p?.action === "accept" && Array.isArray(p.deliverableIds) ? p.deliverableIds : [];
  });
  if (deliverableIds.length === 0) return [];
  return (await CalosScheduledPublish.find({ deliverableId: { $in: deliverableIds } }).sort({ publishAt: 1 }).lean()) as unknown as QueueRow[];
}

function rowLine(r: QueueRow): string {
  const when = r.publishAt ? new Date(r.publishAt).toLocaleString("en-US", { timeZone: "UTC" }) : "—";
  switch (r.status) {
    case "published":
      return `${r.platform}: published${r.postUrl ? ` — ${r.postUrl}` : ""}`;
    case "failed":
      return `${r.platform}: failed after ${r.attempts ?? 0}/${r.maxAttempts ?? 3} tries${r.lastError ? ` — ${String(r.lastError).slice(0, 90)}` : ""}${AMBIGUOUS.test(r.lastError ?? "") ? " (outcome unclear — it may already be posted; check the platform before retrying)" : ""}`;
    default:
      return `${r.platform}: ${r.status ?? "pending"} · ${when}`;
  }
}

export async function* runDeliveryStatusTurn(ctx: DeliveryStatusContext, text: string): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  if (!ctx.projectId) {
    yield { type: "turn.capability_gap", turnId, reason: "Nothing shipped from this project yet — there are no deliveries to inspect.", alternative: { description: "Plan, accept entries, then ship it.", proposedSteps: [] } };
    return;
  }
  const all = await projectQueueRows(ctx.projectId);
  const live = all.filter((r) => r.status !== "superseded");
  if (live.length === 0) {
    yield { type: "turn.capability_gap", turnId, reason: "No delivery rows on this project yet.", alternative: { description: "Ship it first — approved cards get occurrences in the delivery queue.", proposedSteps: [] } };
    return;
  }
  const platform = platformFromText(text, live);
  const scoped = platform ? live.filter((r) => r.platform === platform) : live;

  /* "retry X" — deliberate reset of a cleanly-failed row */
  if (wantsRetry(text)) {
    const candidates = scoped.filter((r) => r.status === "failed");
    const ambiguous = candidates.filter((r) => AMBIGUOUS.test(r.lastError ?? ""));
    const clean = candidates.filter((r) => !AMBIGUOUS.test(r.lastError ?? ""));
    if (candidates.length === 0) {
      yield { type: "turn.done", turnId, summary: `Nothing to retry — no failed deliveries${platform ? ` on ${platform}` : ""}. Current state:\n${live.map(rowLine).join("\n")}`, creditsConsumedTotal: 0, artifactIds: [] };
      return;
    }
    if (ambiguous.length > 0 && clean.length === 0) {
      yield { type: "turn.done", turnId, summary: `Won't retry ${platform ?? "that"} automatically — the provider outcome is unclear (it may already be posted). Check the platform; if it truly didn't post, re-approve the card.`, creditsConsumedTotal: 0, artifactIds: [] };
      return;
    }
    for (const row of clean) {
      await CalosScheduledPublish.updateOne({ _id: row._id, status: "failed" }, { $set: { status: "pending", publishAt: new Date(), lastError: null, lockedAt: null } });
    }
    yield {
      type: "turn.done",
      turnId,
      summary: `Retrying ${clean.map((r) => r.platform).join(", ")} now — the delivery queue picks it up this minute.${ambiguous.length > 0 ? `\n(One ${platform ?? ""} failure stays parked: unclear outcome — verify on the platform first.)` : ""}`,
      creditsConsumedTotal: 0,
      artifactIds: [],
    };
    return;
  }

  /* "why did X fail" / delivery status — receipts straight off the rows */
  const failed = scoped.filter((r) => r.status === "failed");
  yield {
    type: "turn.done",
    turnId,
    summary: [
      platform ? `${platform} deliveries:` : "Delivery status:",
      ...live.map(rowLine),
      failed.length > 0 && failed.every((r) => !AMBIGUOUS.test(r.lastError ?? "")) ? "Say \"retry\" and I'll re-queue the clean failures now." : "",
      failed.some((r) => AMBIGUOUS.test(r.lastError ?? "")) ? "Rows with unclear outcomes are never auto-retried — check the platform first." : "",
    ].filter(Boolean).join("\n"),
    creditsConsumedTotal: 0,
    artifactIds: [],
  };
}
