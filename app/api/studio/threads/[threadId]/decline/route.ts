import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appendTurnEvent, connectSpine, getProject, markOperation } from "@/lib/studio/persist/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/threads/[threadId]/decline — audit item 5: "Hold" on a
 * confirm card is a DECISION, and decisions live in the spine. Persists a
 * turn.confirm_declined event and closes the awaiting operation, so a
 * reload never re-arms the declined card and Needs-you stops pinning it.
 * Org-scoped like every spine route.
 */
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const projectId = threadId.replace(/^th_/, "");
  const body = (await req.json().catch(() => null)) as { operationId?: string } | null;
  if (!body?.operationId) return NextResponse.json({ error: "operationId_required" }, { status: 400 });

  try {
    await connectSpine();
    const project = await getProject(projectId);
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (project.organizationId !== (orgId ?? null)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (project.organizationId === null && project.ownerUserId && project.ownerUserId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const appended = await appendTurnEvent(projectId, {
      actor: "user",
      kind: "turn.confirm_declined",
      turnId: null,
      payload: { type: "turn.confirm_declined", operationId: body.operationId, at: new Date().toISOString() },
    });
    if (!appended) return NextResponse.json({ error: "spine_write_failed" }, { status: 500 });
    /* the gate is RESOLVED (declined) — a terminal op state, so Needs-you
     * clears and a retry is simply a new turn with a new operationId */
    await markOperation(body.operationId, "done").catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[studio/threads/:id/decline] failed", error);
    return NextResponse.json({ error: "decline_failed" }, { status: 500 });
  }
}
