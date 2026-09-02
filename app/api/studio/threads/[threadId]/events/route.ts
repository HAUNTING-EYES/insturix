import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectSpine, getProject, listEvents } from "@/lib/studio/persist/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/threads/[threadId]/events?after=N — the spine read path.
 * Reload and reconnect both hit this: the client asks for everything after
 * its last saved cursor and replays it into the thread (plan §3). threadId is
 * the projectId (a th_ prefix from older deliverable payloads is tolerated).
 * Org-scoped: the project must belong to the caller's organization.
 */

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const projectId = threadId.replace(/^th_/, "");
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0") || 0;

  try {
    await connectSpine();
    const project = await getProject(projectId);
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (project.organizationId !== (orgId ?? null)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const events = await listEvents(projectId, after);
    const cursor = events.length ? events[events.length - 1].seq : after;
    return NextResponse.json({ projectId, phase: project.phase, events, cursor });
  } catch (error) {
    console.error("[spine] events read failed", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }
}
