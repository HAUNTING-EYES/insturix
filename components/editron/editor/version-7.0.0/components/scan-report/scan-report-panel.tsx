"use client";

import React, { useEffect, useState } from "react";
import { Bot, ScanLine, AlertTriangle } from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import { buildScanReport, type ScanReport } from "@/lib/editron/services/scan-report";

/**
 * Scan Report Panel (Director Mode) — the "here's everything I saw" trust surface.
 * Reads the hydrated project doc (zero model cost) and lets the user jump to any
 * detected scene. Renders only for an assist project at ready_for_chat; anything
 * else shows a quiet placeholder (the panel is shared, so it must no-op safely).
 */
export function ScanReportPanel() {
  const editorCtx = useEditorContext();
  const projectId = (editorCtx as { projectId?: string })?.projectId
    ?? editorCtx?.state?.projectId;
  const playerRef = (editorCtx as { playerRef?: { current?: { seekTo?: (f: number) => void } } })?.playerRef;
  const fps = editorCtx?.state?.fps || (editorCtx as { fps?: number })?.fps || 30;

  const [report, setReport] = useState<ScanReport | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setReport(null); setLoaded(true); return; }
    fetch(`/api/services/editron/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setReport(buildScanReport(d?.project ?? d)); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  const jumpTo = (startMs: number) => {
    const frame = Math.max(0, Math.round((startMs / 1000) * fps));
    playerRef?.current?.seekTo?.(frame);
  };

  if (!loaded) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading scan report…</div>;
  }
  if (!report) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <ScanLine className="h-8 w-8 opacity-40" />
        <p>The scan report appears for Director Mode projects once the scan completes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted"><Bot className="h-4 w-4" /></div>
        <div>
          <p className="font-medium">Scan report</p>
          <p className="text-xs text-muted-foreground">
            {report.overview.clipCount} clip{report.overview.clipCount === 1 ? "" : "s"} · {report.overview.durationLabel}
            {report.overview.contentType ? ` · ${report.overview.contentType}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {report.sections.map((s) => (
          <div key={s.id} className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 font-medium">{s.value}</p>
            {s.detail ? <p className="text-xs text-muted-foreground">{s.detail}</p> : null}
          </div>
        ))}
      </div>

      {report.degradedAssetIds.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{report.degradedAssetIds.length} clip{report.degradedAssetIds.length === 1 ? "" : "s"} couldn&apos;t be fully analyzed — still on the timeline, flagged for retry.</span>
        </div>
      ) : null}

      {report.scenes.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Scenes ({report.scenes.length})</p>
          <div className="flex flex-col gap-1">
            {report.scenes.map((scene) => (
              <button
                key={scene.index}
                type="button"
                onClick={() => jumpTo(scene.startMs)}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span>Scene {scene.index + 1}</span>
                <span className="text-muted-foreground">{formatMs(scene.startMs)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
