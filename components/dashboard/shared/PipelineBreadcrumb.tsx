"use client";

import React from "react";

/**
 * PipelineBreadcrumb — Shows the user's position in the Insturix production pipeline.
 *
 * Each dashboard room highlights its own step. Past steps show green (done),
 * current step is gold, future steps are dim.
 *
 * Usage: <PipelineBreadcrumb currentStep="edit" />
 */

const C = {
  border: "#1C1B19",
  t5: "#454340",
  gold: "#D4A652",
  goldBg: "rgba(212,166,82,.08)",
  goldBd: "rgba(212,166,82,.16)",
  green: "#5EC97E",
} as const;

const STAGES = [
  { key: "script", label: "Script", path: "/dashboard/thinkforge" },
  { key: "edit", label: "Edit", path: "/dashboard/editron" },
  { key: "analyze", label: "Analyze", path: "/dashboard/alyzitron" },
  { key: "thumbnails", label: "Thumbnails", path: "/dashboard/clickatron" },
  { key: "publish", label: "Publish", path: "/dashboard/uploaderx" },
  { key: "share", label: "Share", path: "/dashboard/socialize" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

export function PipelineBreadcrumb({ currentStep }: { currentStep: StageKey }) {
  const currentIdx = STAGES.findIndex(s => s.key === currentStep);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "12px 0", borderBottom: `1px solid ${C.border}`,
      marginBottom: 20, overflowX: "auto",
    }}>
      {STAGES.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ color: C.t5, fontSize: 10, margin: "0 2px" }}>→</span>}
            <a
              href={s.path}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 5, textDecoration: "none",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: 10, letterSpacing: ".04em", whiteSpace: "nowrap",
                color: isDone ? C.green : isCurrent ? C.gold : C.t5,
                background: isCurrent ? C.goldBg : "transparent",
                border: isCurrent ? `1px solid ${C.goldBd}` : "1px solid transparent",
                transition: "all .2s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: 3, flexShrink: 0,
                background: isDone ? C.green : isCurrent ? C.gold : C.t5,
                boxShadow: isDone ? "0 0 4px rgba(94,201,126,.25)" : isCurrent ? "0 0 4px rgba(212,166,82,.25)" : "none",
              }} />
              {s.label}
            </a>
          </React.Fragment>
        );
      })}
    </div>
  );
}
