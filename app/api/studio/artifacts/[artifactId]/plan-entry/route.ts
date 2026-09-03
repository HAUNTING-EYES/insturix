import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { persistDraftDeliverables } from "@/lib/calos/persist-deliverables";
import { connectSpine, appendTurnEvent, getProject, listEvents } from "@/lib/studio/persist/db";
import { artifactsFromEvents } from "@/lib/studio/persist/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/artifacts/[artifactId]/plan-entry — §12 proposal review:
 * accept or remove ONE plan entry. Accepting writes exactly that entry as an
 * idea-stage CalOS deliverable (CalOS's single draft write path) — proposed
 * entries are never bulk-written, and nothing here schedules or publishes:
 * CalOS editorial approval remains the only publish authorization.
 * Idempotent per entry: a second action on the same entry is a no-op state
 * return, never a second deliverable.
 */
export async function POST(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { artifactId } = await params;
  const body = (await req.json().catch(() => null)) as { projectId?: string; entryId?: string; action?: "accept" | "remove"; title?: string } | null;
  if (!body?.projectId || !body.entryId || (body.action !== "accept" && body.action !== "remove")) {
    return NextResponse.json({ error: "projectId_entryId_action_required" }, { status: 400 });
  }

  try {
    await connectSpine();
    const project = await getProject(body.projectId);
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (project.organizationId !== (orgId ?? null)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const events = await listEvents(body.projectId, 0);
    const artifact = artifactsFromEvents(events).find((a) => a.id === artifactId);
    if (!artifact || artifact.kind !== "plan") return NextResponse.json({ error: "artifact_not_a_plan" }, { status: 404 });
    const entry = artifact.planEntries?.find((e) => e.id === body.entryId);
    if (!entry) return NextResponse.json({ error: "entry_not_in_plan" }, { status: 404 });

    /* idempotency: the entry's state is already decided in the log */
    const decided = events.find((ev) => {
      if (ev.kind !== "plan.entry") return false;
      const p = ev.payload as { artifactId?: string; entryId?: string };
      return p.artifactId === artifactId && p.entryId === body.entryId;
    });
    if (decided) {
      const p = decided.payload as { action?: string };
      return NextResponse.json({ ok: true, entryId: body.entryId, state: p.action, alreadyDecided: true });
    }

    let deliverablesCreated = 0;
    let deliverableIds: string[] = [];
    if (body.action === "accept") {
      if (!project.brandId) return NextResponse.json({ error: "plan_has_no_brand" }, { status: 400 });
      deliverableIds = await persistDraftDeliverables(
        [
          {
            title: body.title?.trim() || entry.title,
            date: entry.scheduledAt,
            plannedDates: [entry.scheduledAt],
            platform: entry.platform,
            status: "draft",
          },
        ],
        { userId, brandId: project.brandId, orgId: project.organizationId },
      );
      deliverablesCreated = deliverableIds.length;
      if (deliverablesCreated !== 1) {
        return NextResponse.json({ error: "calos_write_failed" }, { status: 502 });
      }
    }

    /* deliverableIds ride the spine event — §6 status computes Publishing/
     * Scheduled/Partially-published labels from the project's OWN records
     * (deliverable editorial state + queue outcomes), never from chat text */
    const appended = await appendTurnEvent(body.projectId, {
      actor: "user",
      kind: "plan.entry",
      turnId: null,
      payload: { type: "plan.entry", artifactId, entryId: body.entryId, action: body.action, deliverablesCreated, deliverableIds },
    });
    if (!appended) return NextResponse.json({ error: "spine_write_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, entryId: body.entryId, state: body.action, deliverablesCreated });
  } catch (error) {
    console.error("[studio/artifacts/:id/plan-entry] failed", error);
    return NextResponse.json({ error: "plan_entry_failed" }, { status: 500 });
  }
}
