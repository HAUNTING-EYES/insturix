"use client";

import React, { useEffect, useState } from "react";
import { useEditorContext } from "../../contexts/editor-context";
import { buildScanMarkers, type ScanMarkers } from "@/lib/editron/services/scan-report";

/**
 * Director Mode timeline scan markers. A non-interactive overlay inside the
 * zoom-scaled timeline container: scene bounds as faint full-height guides,
 * silences as a thin amber band at the top. Positions are percentages of total
 * duration, so they stay aligned at any zoom. Renders nothing for non-assist
 * projects (the strip is mounted for every project; it self-gates).
 */
export function ScanMarkerStrip() {
  const editorCtx = useEditorContext();
  const projectId = (editorCtx as { projectId?: string })?.projectId ?? editorCtx?.state?.projectId;
  const [markers, setMarkers] = useState<ScanMarkers | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setMarkers(null); return; }
    fetch(`/api/services/editron/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setMarkers(buildScanMarkers(d?.project ?? d)); })
      .catch(() => { /* no markers */ });
    return () => { cancelled = true; };
  }, [projectId]);

  if (!markers || markers.markers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-hidden="true">
      {markers.markers.map((m, i) =>
        m.kind === "scene" ? (
          <div
            key={`s${i}`}
            className="absolute top-0 bottom-0 w-px bg-sky-400/25"
            style={{ left: `${m.leftPct}%` }}
          />
        ) : (
          <div
            key={`g${i}`}
            className="absolute top-0 h-1 rounded-sm bg-amber-400/50"
            style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
            title="Silence"
          />
        ),
      )}
    </div>
  );
}
