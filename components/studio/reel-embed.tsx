"use client";

/**
 * Reel stage embed (Phase 3c) — the REAL editor mounted inside the vibe
 * stage. Mirrors the /project/[id]/v2 boot guard (existence check with
 * retries) and mounts ReactVideoEditor variant v2, the redesigned shell.
 * In mock mode the stage keeps its designed static view; this embed is only
 * used when a real editron artifact is focused.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ReactVideoEditor = dynamic(
  () => import("@/components/editron/editor/version-7.0.0/react-video-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="stu-doc" style={{ textAlign: "center" }}>
        <div className="stu-mlabel" style={{ marginBottom: 10 }}>loading editor</div>
        <span className="stu-pm"><i className="stu-ms-run" style={{ background: "var(--muted)" }} /></span>
      </div>
    ),
  },
);

type BootState = "checking" | "ready" | "missing";

export function ReelEmbed({ projectId }: { projectId: string }) {
  const [boot, setBoot] = useState<BootState>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async (retries: number) => {
      try {
        const res = await fetch(`/api/services/editron/projects/${projectId}`);
        if (cancelled) return;
        if (res.ok) setBoot("ready");
        else if (res.status === 404) setBoot("missing");
        else if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          void check(retries - 1);
        } else setBoot("missing");
      } catch {
        if (!cancelled && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          void check(retries - 1);
        } else if (!cancelled) setBoot("missing");
      }
    };
    void check(2);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (boot === "checking") {
    return (
      <div className="stu-doc" style={{ textAlign: "center" }}>
        <div className="stu-mlabel" style={{ marginBottom: 10 }}>opening project</div>
        <span className="stu-pm"><i className="stu-ms-run" style={{ background: "var(--muted)" }} /></span>
      </div>
    );
  }

  if (boot === "missing") {
    return (
      <div className="stu-doc" style={{ textAlign: "center" }}>
        <div className="stu-hq"><b>Project not reachable</b></div>
        <div className="stu-hint" style={{ marginTop: 8 }}>
          it may not exist, or this browser isn&apos;t signed in — sign in, then talk to the agent again
        </div>
        <div className="stu-receipt" style={{ justifyContent: "center", marginTop: 12 }}>
          <span>{projectId}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "min(62vh, 640px)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
      <ReactVideoEditor projectId={projectId} variant="v2" />
    </div>
  );
}
