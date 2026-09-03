import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { ClickatronTask } from "@/schemas/Clickatron";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { appendTurnEvent, connectSpine, getProject, listEvents } from "@/lib/studio/persist/db";
import { artifactsFromEvents } from "@/lib/studio/persist/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/artifacts/[artifactId]/select — §11 "use this": commit to
 * one candidate. Persists an artifact.selected event on the project's spine
 * log (reload reconstructs the choice) but ONLY after verifying, against the
 * engine's own session, that (a) the artifact belongs to this project's log,
 * (b) it is a Clickatron canvas, and (c) the candidate is a real variation
 * owned by the caller. No synthetic selections.
 */
export async function POST(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { artifactId } = await params;
  const body = (await req.json().catch(() => null)) as { projectId?: string; candidateId?: string } | null;
  if (!body?.projectId || !body.candidateId) {
    return NextResponse.json({ error: "projectId_and_candidateId_required" }, { status: 400 });
  }

  try {
    await connectSpine();
    const project = await getProject(body.projectId);
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (project.organizationId !== (orgId ?? null)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const artifact = artifactsFromEvents(await listEvents(body.projectId, 0)).find((a) => a.id === artifactId);
    if (!artifact) return NextResponse.json({ error: "artifact_not_in_project" }, { status: 404 });
    if (artifact.sourceRef.engine !== "clickatron") {
      return NextResponse.json({ error: "artifact_has_no_candidates" }, { status: 400 });
    }

    /* the candidate must exist in the engine's own session — never trust a
     * client-asserted variation id */
    await getClickatronDb();
    const task = Types.ObjectId.isValid(artifact.sourceRef.externalId)
      ? await ClickatronTask.findOne({ _id: new Types.ObjectId(artifact.sourceRef.externalId), clerkUserId: userId })
      : null;
    const variation = task?.details?.canvas?.variations?.find((v: { id?: string }) => v.id === body.candidateId);
    if (!variation) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 });

    const appended = await appendTurnEvent(body.projectId, {
      actor: "user",
      kind: "artifact.selected",
      turnId: null,
      payload: { type: "artifact.selected", artifactId, candidateId: body.candidateId },
    });
    if (!appended) return NextResponse.json({ error: "spine_write_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, artifactId, candidateId: body.candidateId });
  } catch (error) {
    console.error("[studio/artifacts/:id/select] failed", error);
    return NextResponse.json({ error: "select_failed" }, { status: 500 });
  }
}
