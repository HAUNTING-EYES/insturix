"use client";

import React, { useState } from "react";

/* ── design tokens (inline) ── */
const C = {
  bg: "#0B0B0A",
  raised: "#0F0F0E",
  deeper: "#131312",
  well: "#1B1A18",
  border: "#1C1B19",
  borderL: "#282724",
  text: "#ECE9E1",
  soft: "#B5B2A8",
  muted: "#7A776E",
  dim: "#5F5E5A",
  faint: "#454340",
  accent: "#D4A652",
  green: "#5EC97E",
  red: "#D46A5C",
  purple: "#9088D4",
  pink: "#D088B4",
  cyan: "#5CB8CC",
} as const;

const FONT_SANS = "'Plus Jakarta Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/* ── stage colours ── */
const STAGE_COLOR: Record<string, string> = {
  script: C.accent,
  edit: C.red,
  analyze: C.purple,
  thumbnails: C.pink,
  publish: C.green,
};

/* ── seed data ── */
interface Project {
  id: string;
  title: string;
  client?: string;
  stage: string;
  status: string;
  progress?: number;
  score?: number;
  time: string;
  bucket: "today" | "week" | "older";
}

const PROJECTS: Project[] = [
  { id: "p1", title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "Writing", progress: 45, time: "2h ago", bucket: "today" },
  { id: "p2", title: "Founder story", stage: "script", status: "Draft", time: "5h ago", bucket: "today" },
  { id: "p3", title: "Q1 launch reel", stage: "edit", status: "Editing", progress: 64, time: "1d ago", bucket: "week" },
  { id: "p4", title: "Chaayos Holi v3", client: "Chaayos", stage: "edit", status: "Captions", progress: 78, time: "2d ago", bucket: "week" },
  { id: "p5", title: "Chaayos Holi v2", client: "Chaayos", stage: "analyze", status: "Scored", score: 91, time: "3d ago", bucket: "week" },
  { id: "p6", title: "Starbucks intro", client: "Starbucks", stage: "thumbnails", status: "Generating", progress: 38, time: "4d ago", bucket: "week" },
  { id: "p7", title: "Masala mornings", stage: "publish", status: "Live", score: 74, time: "6d ago", bucket: "older" },
  { id: "p8", title: "Brand anthem", stage: "publish", status: "Scheduled", score: 88, time: "7d ago", bucket: "older" },
];

interface Alert {
  id: string;
  message: string;
  color: string;
}

const ALERTS: Alert[] = [
  { id: "a1", message: "Muffynn revision requested", color: C.accent },
  { id: "a2", message: "Chai Nagri IG auth expired", color: C.red },
  { id: "a3", message: "Starbucks awaiting approval", color: C.cyan },
];

/* ── sub-components ── */

function Topbar() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: FONT_SANS, fontWeight: 800, fontSize: 18, color: C.text, letterSpacing: "-0.02em" }}>
          Insturix
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Timeline
        </span>
      </div>
      <button
        style={{
          fontFamily: FONT_SANS,
          fontSize: 13,
          fontWeight: 500,
          color: C.bg,
          background: C.accent,
          border: "none",
          borderRadius: 6,
          padding: "8px 18px",
          cursor: "pointer",
        }}
      >
        New project
      </button>
    </header>
  );
}

function StagePill({ stage }: { stage: string }) {
  const color = STAGE_COLOR[stage] || C.dim;
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 500,
        color,
        background: color + "14",
        border: `1px solid ${color}30`,
        borderRadius: 4,
        padding: "2px 8px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      {stage}
    </span>
  );
}

function Thumbnail({ title }: { title: string }) {
  const hash = title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 7,
        background: `linear-gradient(135deg, hsl(${hue},30%,18%) 0%, hsl(${(hue + 40) % 360},25%,12%) 100%)`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 800, color: C.faint }}>
        {title.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ width: 60, height: 3, borderRadius: 2, background: C.well }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 2, background: C.accent }} />
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderRadius: 8,
        background: hovered ? C.raised : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <Thumbnail title={project.title} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.title}
          </span>
          {project.client && (
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 400, color: C.muted }}>
              {project.client}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <StagePill stage={project.stage} />
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.dim }}>
            {project.status}
          </span>
          {project.progress != null && <ProgressBar value={project.progress} />}
          {project.score != null && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: project.score >= 80 ? C.green : C.accent }}>
              {project.score}
            </span>
          )}
        </div>
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>
        {project.time}
      </span>
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 6,
        border: `1px solid ${alert.color}25`,
        background: alert.color + "08",
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: 3, background: alert.color, flexShrink: 0 }} />
      <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.soft }}>{alert.message}</span>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 16px", marginBottom: 8 }}>
      <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.faint }}>{count}</span>
    </div>
  );
}

/* ── main export ── */

export function DashboardTimeline() {
  const [olderOpen, setOlderOpen] = useState(false);

  const today = PROJECTS.filter((p) => p.bucket === "today");
  const week = PROJECTS.filter((p) => p.bucket === "week");
  const older = PROJECTS.filter((p) => p.bucket === "older");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_SANS, color: C.text }}>
      <Topbar />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
        {/* Alerts */}
        {ALERTS.length > 0 && (
          <section style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 8 }}>
            {ALERTS.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </section>
        )}

        {/* TODAY */}
        <section style={{ marginBottom: 32 }}>
          <SectionHeader label="Today" count={today.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {today.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
            {today.length === 0 && (
              <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.dim, padding: "8px 16px" }}>
                Nothing happened today yet.
              </span>
            )}
          </div>
        </section>

        {/* THIS WEEK */}
        <section style={{ marginBottom: 32 }}>
          <SectionHeader label="This week" count={week.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {week.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        </section>

        {/* OLDER */}
        <section>
          <div
            onClick={() => setOlderOpen(!olderOpen)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", marginBottom: 8, cursor: "pointer" }}
          >
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Older
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.faint }}>{older.length}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.faint, marginLeft: 4 }}>
              {olderOpen ? "▲" : "▼"}
            </span>
          </div>
          {olderOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {older.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
