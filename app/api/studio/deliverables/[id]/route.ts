import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as tfdb from "@/lib/thinkforge/services/db";
import { projectService } from "@/lib/editron/services/project-service";
import type { StudioArtifact, StudioDeliverable } from "@/lib/studio/contracts/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/deliverables/[id] — hydrate one deliverable into the
 * session: artifacts with real content (TF script markdown), engine refs,
 * and manual-control links. Read-only.
 */

const ISO = () => new Date().toISOString();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  /* ThinkForge session → script artifact with real content */
  if (id.startsWith("session_")) {
    try {
      const session = await tfdb.getSession(id, userId, orgId ?? null);
      if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const scripts = await tfdb.listScripts(id);
      const meta = (session.projectMeta ?? {}) as { projectName?: string; title?: string; brandBinding?: { brandId?: string } };
      const artifacts: StudioArtifact[] = [];
      for (const s of scripts.slice(0, 3)) {
        const full = await tfdb.getScript(id, s.scriptId);
        if (!full) continue;
        artifacts.push({
          id: `art_tf_${s.scriptId}`,
          kind: "script",
          status: "done",
          title: full.title?.trim() || "Draft",
          sourceRef: { engine: "thinkforge", externalId: `${id}:${s.scriptId}`, manualHref: null },
          contentMarkdown: full.content ?? "",
          revisions: [],
          updatedAt: ISO(),
          createdAt: ISO(),
        });
      }
      const deliverable: StudioDeliverable = {
        id,
        title: meta.projectName ?? meta.title ?? "Draft",
        brandId: meta.brandBinding?.brandId ?? "unbranded",
        orgId: null,
        campaignId: null,
        threadId: `th_${id}`,
        artifacts,
        edges: [],
        stageFocus: artifacts[0] ? { artifactId: artifacts[0].id, reason: "user_asked", why: "opened", since: ISO() } : null,
        createdAt: ISO(),
        updatedAt: ISO(),
      };
      return NextResponse.json({ deliverable });
    } catch (error) {
      console.error("[studio/deliverables/:id] tf hydrate failed:", error);
      return NextResponse.json({ error: "hydrate_failed" }, { status: 500 });
    }
  }

  /* Editron project → reel artifact (stage mounts the real editor).
   * Verified against the project list — never fabricate a reel for an
   * unknown id (a scratch session id must stay a 404, not a phantom edit). */
  let projectName: string | null = null;
  try {
    const list = await projectService.listProjects(userId, 1, 100, "updatedAt");
    projectName = (list.projects ?? []).find((p) => p.projectId === id)?.name ?? null;
  } catch {
    projectName = null;
  }
  if (projectName === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const artifact: StudioArtifact = {
    id: `art_ed_${id}`,
    kind: "reel",
    status: "done",
    title: "Reel",
    sourceRef: { engine: "editron", externalId: id, manualHref: `/dashboard/editron/project/${id}` },
    revisions: [],
    updatedAt: ISO(),
    createdAt: ISO(),
  };
  const deliverable: StudioDeliverable = {
    id,
    title: projectName,
    brandId: "unbranded",
    orgId: null,
    campaignId: null,
    threadId: `th_${id}`,
    artifacts: [artifact],
    edges: [],
    stageFocus: { artifactId: artifact.id, reason: "user_asked", why: "opened", since: ISO() },
    createdAt: ISO(),
    updatedAt: ISO(),
  };
  return NextResponse.json({ deliverable });
}
