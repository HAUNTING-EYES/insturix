import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as tfdb from "@/lib/thinkforge/services/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/overview — mission control in one call.
 * Aggregates: attention items, in-flight work per engine, deliverable rows.
 * Bridges ride the caller's session (same-origin self-fetch).
 */

interface FlightRow {
  engine: "editron" | "thinkforge" | "alyzitron" | "musitron" | "calos";
  label: string;
  stage: string;
  href: string | null;
  updatedAt: string | null;
}

interface AttentionRow {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium";
  href: string | null;
}

export async function GET(req: Request) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const origin = new URL(req.url).origin;
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  const j = async (path: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch(new URL(path, origin), { headers });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const [attention, editron, alyzitron, musitron, deliverables] = await Promise.all([
    j("/api/dashboard/attention"),
    j("/api/services/editron/projects/list?limit=20"),
    j("/api/services/alyzitron/analyses?page=1&limit=10"),
    j("/api/services/musitron/history?page=1&limit=10"),
    j("/api/studio/deliverables"),
  ]);

  /* attention rows */
  const attentionRows: AttentionRow[] = (
    (attention?.items as Array<Record<string, unknown>>) ?? []
  ).map((i) => ({
    id: String(i.id),
    title: String(i.title ?? "Needs attention"),
    detail: String(i.detail ?? ""),
    severity: i.severity === "high" ? "high" : "medium",
    href: i.projectId ? `/dashboard/editron/auto-edit/${i.projectId}` : null,
  }));

  /* in-flight rows */
  const flight: FlightRow[] = [];

  const projects = (editron?.projects as Array<Record<string, unknown>>) ?? [];
  for (const p of projects) {
    const status = String(p.projectStatus ?? "");
    const stage = String(p.pipelineStage ?? "");
    if (status === "active" || status === "needs-attention") {
      flight.push({
        engine: "editron",
        label: String(p.name ?? "Edit"),
        stage: status === "needs-attention" ? `needs attention · ${stage}` : `${stage} · quality ${p.qualityScore ?? "—"}`,
        href: p.projectId ? `/dashboard/editron/project/${p.projectId}` : null,
        updatedAt: p.updatedAt ? new Date(p.updatedAt as string).toISOString() : null,
      });
    }
  }

  try {
    const sessions = (await tfdb.getUserSessions(userId, orgId ?? null)) as unknown as Array<{
      _id: string;
      updatedAt?: Date;
      projectMeta?: { projectName?: string };
      activeGeneration?: { status?: string; progress?: number; message?: string } | null;
    }>;
    for (const s of sessions.slice(0, 30)) {
      const g = s.activeGeneration;
      if (g && (g.status === "running" || g.status === "failed")) {
        flight.push({
          engine: "thinkforge",
          label: s.projectMeta?.projectName ?? "Draft",
          stage: g.status === "failed" ? "generation failed" : `${g.message ?? "writing"}${g.progress ? ` · ${g.progress}%` : ""}`,
          href: `/studio/d/${s._id}`,
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        });
      }
    }
  } catch {
    /* tf list best-effort */
  }

  const analyses = ((alyzitron?.data as Array<Record<string, unknown>>) ?? []);
  for (const a of analyses) {
    const st = String(a.status ?? "");
    if (st === "listed" || st === "queued" || st === "processing") {
      flight.push({
        engine: "alyzitron",
        label: "Analysis",
        stage: st === "processing" ? "scoring + transcribing" : st,
        href: a.id ? `/dashboard/alyzitron/report/${a.id}` : null,
        updatedAt: null,
      });
    }
  }

  const tracks = ((musitron?.data as Array<Record<string, unknown>>) ?? []);
  for (const t of tracks) {
    const st = String(t.status ?? "");
    if (st === "listed" || st === "processing") {
      flight.push({
        engine: "musitron",
        label: String(t.title ?? "Track"),
        stage: st === "processing" ? "composing" : "queued",
        href: t._id ? `/dashboard/musitron/task/${t._id}` : null,
        updatedAt: null,
      });
    }
  }

  return NextResponse.json({
    attention: attentionRows,
    inFlight: flight.slice(0, 12),
    deliverables: deliverables?.deliverables ?? [],
  });
}
