"use client";

/**
 * Artifact polling (real mode) — running artifacts resolve from REAL engine
 * telemetry. Only polls while something is running; percent stays null
 * unless an engine reports one (the honesty rule).
 */

import { useEffect } from "react";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";

const INTERVAL_MS = 4000;

interface ClickatronSession {
  details?: { canvas?: { variations?: Array<{ status?: string; imageRef?: string; thumbnailRef?: string }> } };
  status?: string;
}

interface AlyzitronTask {
  id?: string;
  taskId?: string;
  status?: string;
}

interface PipelineStoryboard {
  status?: string;
  scenes?: Array<{ status?: string }>;
}

async function pollOne(artifact: StudioArtifact): Promise<Partial<StudioArtifact> | null> {
  if (artifact.sourceRef.engine === "editron") {
    try {
      const res = await fetch(`/api/services/editron/projects/${artifact.sourceRef.externalId}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { project?: Record<string, unknown> };
      const p = data.project;
      if (!p) return null;
      const auto = String(p.autoEditStatus ?? "");
      const status = String(p.status ?? "");
      if (auto === "needs_review" || status === "rendered" || status === "published") {
        return { status: "done", progress: null };
      }
      if (auto === "needs_input") {
        return { progress: { stage: "needs more footage — open the auto-edit page to feed it beats", percent: null } };
      }
      if (auto === "scan_failed" || auto === "failed" || status === "failed") {
        return { status: "error", progress: null };
      }
      const stage = String(p.pipelineStage ?? auto ?? status ?? "processing");
      return { progress: { stage, percent: null } };
    } catch {
      return null;
    }
  }
  if (artifact.sourceRef.engine === "clickatron") {
    try {
      const res = await fetch(`/api/services/clickatron/session/${artifact.sourceRef.externalId}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { session?: ClickatronSession } & ClickatronSession;
      const session = (data.session ?? data) as ClickatronSession;
      const variations = session.details?.canvas?.variations ?? [];
      if (variations.length > 0 && variations.every((v) => v.status === "completed" && (v.imageRef || v.thumbnailRef))) {
        return { status: "done", progress: null };
      }
      const generating = variations.filter((v) => v.status === "generating").length;
      const done = variations.filter((v) => v.status === "completed").length;
      return { progress: { stage: `variations ${done}/${variations.length}`, percent: variations.length ? Math.round((done / variations.length) * 100) : null } };
    } catch {
      return null;
    }
  }
  if (artifact.sourceRef.engine === "alyzitron") {
    try {
      /* the single-task endpoint (owner-or-public gated) — the LIST route
       * returns {data: [...]} and was never read correctly, so artifacts
       * never resolved; one task is all we want anyway */
      const res = await fetch(`/api/services/alyzitron/analyses/${artifact.sourceRef.externalId}`);
      if (!res.ok) return null;
      const data = (await res.json()) as AlyzitronTask & { task?: AlyzitronTask };
      const task = data.task ?? data;
      if (task.status === "completed") return { status: "done", progress: null };
      if (task.status === "failed" || task.status === "error") return { status: "error", progress: null };
      return { progress: { stage: task.status ?? "processing", percent: null } };
    } catch {
      return null;
    }
  }
  if (artifact.sourceRef.engine === "pipeline") {
    try {
      const res = await fetch(`/api/services/pipeline/storyboard/${artifact.sourceRef.externalId}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { storyboard?: PipelineStoryboard } & PipelineStoryboard;
      const sb = data.storyboard ?? data;
      const scenes = sb.scenes ?? [];
      const done = scenes.filter((s) => s.status === "generated" || s.status === "approved").length;
      if (scenes.length > 0 && done === scenes.length) return { status: "done", progress: null };
      if (sb.status === "error" || scenes.every((s) => s.status === "rejected")) return { status: "error", progress: null };
      return { progress: { stage: `scenes ${done}/${scenes.length}`, percent: scenes.length ? Math.round((done / scenes.length) * 100) : null } };
    } catch {
      return null;
    }
  }
  return null;
}

export function useArtifactPolling(
  artifacts: StudioArtifact[],
  setArtifacts: React.Dispatch<React.SetStateAction<StudioArtifact[]>>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const running = () => artifacts.some((a) => a.status === "running");
    if (!running()) return;
    const timer = setInterval(async () => {
      const updates = await Promise.all(
        artifacts
          .filter((a) => a.status === "running")
          .map(async (a) => ({ id: a.id, patch: await pollOne(a) })),
      );
      const real = updates.filter((u) => u.patch);
      if (real.length) {
        setArtifacts((prev) =>
          prev.map((a) => {
            const hit = real.find((u) => u.id === a.id);
            return hit && hit.patch ? (a = { ...a, ...hit.patch, updatedAt: new Date().toISOString() }) : a;
          }),
        );
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [artifacts, setArtifacts, enabled]);
}
