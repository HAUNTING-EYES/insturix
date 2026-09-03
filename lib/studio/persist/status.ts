import { connectSpine, listEvents, OperationModel, ProjectModel } from "./db";
import CalosDeliverable from "@/schemas/calos-deliverable";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";

/**
 * Project status from REAL records (plan §6) — the chat never declares a
 * project done. All nine §6 priorities derive from facts:
 *   1 open user decision (operation awaiting_confirmation)  → Needs you
 *   2 failed/blocked operation                              → Failed/Blocked
 *   3 active publish job (queue publishing/claimed)         → Publishing
 *   4 active generation (operation running)                 → Creating·Working
 *   5 content awaiting approval (in_review deliverables)    → Reviewing
 *   6 approved future occurrences (pending queue rows)      → Scheduled
 *   7 some delivery receipts                                → Partially published
 *   8 all expected deliveries completed                     → Published
 *   9 plan exists, no production started                    → Planning
 * The project↔deliverable link is the plan.entry events stamped with
 * deliverableIds by the plan-entry route — never inferred from chat text.
 */

export type ProjectStatus = {
  phase: "planning" | "creating" | "reviewing" | "scheduled" | "publishing" | "complete";
  attention: "normal" | "needs_you" | "blocked" | "failed";
  activity: "idle" | "working";
  label: string;
};

type OpLean = { state?: string; command?: string; error?: string | null };

const firstWords = (s: string | null | undefined, n = 5) =>
  (s ?? "").trim().split(/\s+/).slice(0, n).join(" ").slice(0, 60) || "failed";

/** Deliverable ids accepted by THIS project (plan.entry events, log order). */
function deliverableIdsFromEvents(events: Array<{ kind: string; payload: unknown }>): string[] {
  const ids: string[] = [];
  for (const ev of events) {
    if (ev.kind !== "plan.entry") continue;
    const p = ev.payload as { action?: string; deliverableIds?: string[] } | null;
    if (p?.action === "accept" && Array.isArray(p.deliverableIds)) ids.push(...p.deliverableIds);
  }
  return ids;
}

function nextWhenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) +
    " at " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

export async function computeProjectStatus(projectId: string): Promise<ProjectStatus> {
  await connectSpine();
  const [ops, events] = await Promise.all([
    OperationModel.find({ projectId }).sort({ updatedAt: -1, startedAt: -1 }).limit(50).lean() as unknown as Promise<OpLean[]>,
    listEvents(projectId, 0),
  ]);
  if (ops.some((o) => o.state === "awaiting_confirmation")) {
    return { phase: "reviewing", attention: "needs_you", activity: "idle", label: "Needs you · approve to continue" };
  }
  const failed = ops.find((o) => o.state === "error");
  if (failed) {
    return { phase: "creating", attention: "failed", activity: "idle", label: `Failed · ${firstWords(failed.error ?? failed.command)}` };
  }

  /* §6 3/5/6/7/8 — delivery lifecycle from the project's own records.
   * Audit 1d: the spine links Mongo _ids, but queue rows key by the
   * deliverable's card.id — resolve the namespace before joining. */
  const deliverableIds = deliverableIdsFromEvents(events);
  if (deliverableIds.length > 0) {
    const drafts = (await CalosDeliverable.find({ _id: { $in: deliverableIds } }).lean()) as unknown as Array<{ editorialStatus?: string; card?: { id?: string } }>;
    const cardIds = drafts.map((d) => String(d.card?.id ?? "")).filter(Boolean);
    const queueRaw = cardIds.length > 0 ? await CalosScheduledPublish.find({ deliverableId: { $in: cardIds } }).sort({ publishAt: 1 }).lean() : [];
    const queue = queueRaw as unknown as Array<{ status?: string; publishAt?: Date | string; platform?: string }>;
    const publishing = queue.find((q) => q.status === "publishing" || q.status === "claimed");
    if (publishing) {
      return { phase: "publishing", attention: "normal", activity: "working", label: `Publishing · ${publishing.platform ?? "post"}` };
    }
    if (ops.some((o) => o.state === "running")) {
      return { phase: "creating", attention: "normal", activity: "working", label: "Creating · working" };
    }
    const awaitingApproval = drafts.some((d) => d.editorialStatus === "in_review" || d.editorialStatus === "changes_requested");
    if (awaitingApproval) {
      return { phase: "reviewing", attention: "normal", activity: "idle", label: "Reviewing · content waiting on approval" };
    }
    const expected = queue.length;
    const published = queue.filter((q) => q.status === "published").length;
    if (expected > 0 && published === expected) {
      return { phase: "complete", attention: "normal", activity: "idle", label: `Published · ${published} of ${expected}` };
    }
    if (published > 0) {
      return { phase: "complete", attention: "normal", activity: "idle", label: `Partially published · ${published} of ${expected}` };
    }
    const next = queue.find((q) => q.status === "pending" && q.publishAt && new Date(q.publishAt) > new Date());
    if (next?.publishAt) {
      return { phase: "scheduled", attention: "normal", activity: "idle", label: `Scheduled · next ${nextWhenLabel(String(next.publishAt))}` };
    }
  } else if (ops.some((o) => o.state === "running")) {
    return { phase: "creating", attention: "normal", activity: "working", label: "Creating · working" };
  }

  if (ops.some((o) => o.state === "done")) {
    return { phase: "creating", attention: "normal", activity: "idle", label: "Creating" };
  }
  return { phase: "planning", attention: "normal", activity: "idle", label: "Planning" };
}

/** The Needs-you index (plan §7 Home): every project in this org with an open
 * user decision, newest first. Derived from operation records, not chat text. */
export async function listNeedsYouProjects(
  organizationId: string | null,
): Promise<Array<{ projectId: string; title: string; status: ProjectStatus }>> {
  await connectSpine();
  const open = (await OperationModel.find({ state: "awaiting_confirmation" })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean()) as unknown as Array<{ projectId?: string }>;
  const ids = [...new Set(open.map((o) => o.projectId).filter((v): v is string => Boolean(v)))].slice(0, 25);
  if (!ids.length) return [];
  const projects = (await ProjectModel.find({ _id: { $in: ids }, organizationId }).lean()) as unknown as Array<{ _id: unknown; title?: string }>;
  const out: Array<{ projectId: string; title: string; status: ProjectStatus }> = [];
  for (const p of projects) {
    const projectId = String(p._id);
    out.push({ projectId, title: p.title ?? "Project", status: await computeProjectStatus(projectId) });
  }
  return out;
}
