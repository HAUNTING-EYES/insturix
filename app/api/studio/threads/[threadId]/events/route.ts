import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as tfdb from "@/lib/thinkforge/services/db";
import { connectSpine, getOrCreateProject, getProject, listEvents } from "@/lib/studio/persist/db";
import { ensureThreadBootstrapped } from "@/lib/studio/persist/tf-import";

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
    let project = await getProject(projectId);
    if (!project && projectId.startsWith("session_")) {
      /* an old ThinkForge session opened in studio for the first time: verify
       * it belongs to this caller, then create its spine project — the import
       * below fills the log with the session's chat history (§10) */
      const session = await tfdb.getSession(projectId, userId, orgId ?? null).catch(() => null);
      if (session) {
        const meta = (session.projectMeta ?? {}) as { projectName?: string; title?: string; brandBinding?: { brandId?: string } };
        project = await getOrCreateProject({
          projectId,
          organizationId: orgId ?? null,
          brandId: meta.brandBinding?.brandId ?? null,
          title: meta.projectName ?? meta.title ?? "Imported ThinkForge session",
        });
      }
    }
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (project.organizationId !== (orgId ?? null)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await ensureThreadBootstrapped(projectId);
    const events = await listEvents(projectId, after);
    const cursor = events.length ? events[events.length - 1].seq : after;
    return NextResponse.json({ projectId, phase: project.phase, events, cursor });
  } catch (error) {
    console.error("[spine] events read failed", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }
}
