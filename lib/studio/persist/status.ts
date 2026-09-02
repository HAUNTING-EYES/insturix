import { connectSpine, OperationModel, ProjectModel } from "./db";

/**
 * Project status from REAL records (plan §6) — the chat never declares a
 * project done; operations and their states decide. Priority mirrors the
 * plan: an open user decision outranks a failure, which outranks active work;
 * quiet projects fall back through reviewing → creating → planning.
 * Delivery/scheduling states (scheduled/publishing/published) arrive with
 * Phase 6-7 occurrence + receipt records — until then the label stays honest.
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

export async function computeProjectStatus(projectId: string): Promise<ProjectStatus> {
  await connectSpine();
  const ops = (await OperationModel.find({ projectId }).sort({ updatedAt: -1, startedAt: -1 }).limit(50).lean()) as unknown as OpLean[];
  if (ops.some((o) => o.state === "awaiting_confirmation")) {
    return { phase: "reviewing", attention: "needs_you", activity: "idle", label: "Needs you · approve to continue" };
  }
  const failed = ops.find((o) => o.state === "error");
  if (failed) {
    return { phase: "creating", attention: "failed", activity: "idle", label: `Failed · ${firstWords(failed.error ?? failed.command)}` };
  }
  if (ops.some((o) => o.state === "running")) {
    return { phase: "creating", attention: "normal", activity: "working", label: "Creating · working" };
  }
  if (ops.some((o) => o.state === "done")) {
    return { phase: "creating", attention: "normal", activity: "idle", label: "Creating" };
  }
  return { phase: "planning", attention: "normal", activity: "idle", label: "Planning" };
}

/** The Needs-you index (plan §7 Home): every project in this org with an open
 *  user decision, newest first. Derived from operation records, not chat text. */
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
