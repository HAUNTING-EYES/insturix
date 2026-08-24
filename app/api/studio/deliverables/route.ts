import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as tfdb from "@/lib/thinkforge/services/db";
import { projectService } from "@/lib/editron/services/project-service";
import { listUnifiedBrands } from "@/lib/shared/brand-registry";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/deliverables — read-side aggregation for the vibe Home.
 * Adapts real engine objects (ThinkForge sessions, Editron projects) into
 * deliverable rows. Read-only, flag-gated alongside the orchestrator.
 * CalOS/Clickatron adapters land with their stage embeds (checklist).
 */

interface TfSessionRow {
  _id: string;
  updatedAt?: Date;
  projectMeta?: { name?: string; projectName?: string; title?: string; brandBinding?: { brandId?: string } };
}

interface EditronProjectRow {
  id: string;
  _id?: string;
  name?: string;
  title?: string;
  brandId?: string;
  updatedAt?: Date | string;
}

function row(opts: {
  id: string;
  title: string;
  brandId: string | null;
  artifactKind: "script" | "reel";
  artifactTitle: string;
  artifactStatus: "done" | "running";
  updatedAt: Date | string | undefined;
}): StudioDeliverable {
  const iso = opts.updatedAt ? new Date(opts.updatedAt).toISOString() : new Date().toISOString();
  return {
    id: opts.id,
    title: opts.title,
    brandId: opts.brandId ?? "unbranded",
    orgId: null,
    campaignId: null,
    threadId: `th_${opts.id}`,
    artifacts: [
      {
        id: `art_${opts.id}_${opts.artifactKind}`,
        kind: opts.artifactKind,
        status: opts.artifactStatus,
        title: opts.artifactTitle,
        sourceRef: { engine: opts.artifactKind === "reel" ? "editron" : "thinkforge", externalId: opts.id, manualHref: null },
        revisions: [],
        updatedAt: iso,
        createdAt: iso,
      },
    ],
    edges: [],
    stageFocus: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

export async function GET() {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows: StudioDeliverable[] = [];

  try {
    const sessions = (await tfdb.getUserSessions(userId, orgId ?? null)) as unknown as TfSessionRow[];
    for (const session of sessions.slice(0, 30)) {
      const meta = session.projectMeta ?? {};
      rows.push(
        row({
          id: session._id,
          title: meta.projectName ?? meta.name ?? meta.title ?? "Untitled draft",
          brandId: meta.brandBinding?.brandId ?? null,
          artifactKind: "script",
          artifactTitle: "Script",
          artifactStatus: "done",
          updatedAt: session.updatedAt,
        }),
      );
    }
  } catch (error) {
    console.error("[studio/deliverables] thinkforge adapter failed:", error);
  }

  try {
    const list = await projectService.listProjects(userId, 1, 20, "updatedAt");
    for (const project of (list.projects ?? []) as unknown as EditronProjectRow[]) {
      const pid = project.id ?? project._id ?? "";
      if (!pid) continue;
      rows.push(
        row({
          id: pid,
          title: project.name ?? project.title ?? "Untitled edit",
          brandId: project.brandId ?? null,
          artifactKind: "reel",
          artifactTitle: "Reel",
          artifactStatus: "done",
          updatedAt: project.updatedAt,
        }),
      );
    }
  } catch (error) {
    console.error("[studio/deliverables] editron adapter failed:", error);
  }

  rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const brands: Record<string, string> = {};
  try {
    /* brand-vault brands (the authoritative scope list) first, then the
     * unified registry fills any legacy editron/thinkforge-only brands */
    for (const scope of await listAuthorizedBrandScopes({ userId, orgId: orgId ?? null })) {
      brands[scope.brandId] = scope.brandName;
    }
    for (const b of await listUnifiedBrands(userId)) brands[b.brandId] ??= b.name;
  } catch {
    /* names resolve on the client as raw ids */
  }
  return NextResponse.json({ deliverables: rows, brands });
}
