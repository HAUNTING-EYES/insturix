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
  client: string;
  stage: string;
  status: string;
  progress?: number;
  score?: number;
}

const PROJECTS: Project[] = [
  { id: "p1", title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "Writing", progress: 45 },
  { id: "p2", title: "Founder story", client: "Personal", stage: "script", status: "Draft" },
  { id: "p3", title: "Q1 launch reel", client: "Personal", stage: "edit", status: "Editing", progress: 64 },
  { id: "p4", title: "Chaayos Holi v3", client: "Chaayos", stage: "edit", status: "Captions", progress: 78 },
  { id: "p5", title: "Chaayos Holi v2", client: "Chaayos", stage: "analyze", status: "Scored", score: 91 },
  { id: "p6", title: "Starbucks intro", client: "Starbucks", stage: "thumbnails", status: "Generating", progress: 38 },
  { id: "p7", title: "Masala mornings", client: "Personal", stage: "publish", status: "Live", score: 74 },
  { id: "p8", title: "Brand anthem", client: "Personal", stage: "publish", status: "Scheduled", score: 88 },
];

interface Alert {
  id: string;
  message: string;
  clientHint: string;
  color: string;
}

const ALERTS: Alert[] = [
  { id: "a1", message: "Revision requested", clientHint: "Muffynn", color: C.accent },
  { id: "a2", message: "IG auth expired", clientHint: "Chai Nagri", color: C.red },
  { id: "a3", message: "Awaiting approval", clientHint: "Starbucks", color: C.cyan },
];

/* ── group by client ── */
function groupByClient(projects: Project[]): { name: string; projects: Project[] }[] {
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.client;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const groups: { name: string; projects: Project[] }[] = [];
  // Named clients first, Personal last
  for (const [name, projs] of map) {
    if (name !== "Personal") groups.push({ name, projects: projs });
  }
  const personal = map.get("Personal");
  if (personal) groups.push({ name: "Personal", projects: personal });
  return groups;
}

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
          Clients
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
        width: 44,
        height: 44,
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
    <div style={{ width: 48, height: 3, borderRadius: 2, background: C.well }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 2, background: C.accent }} />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 8,
        border: `1px solid ${hovered ? C.borderL : C.border}`,
        background: hovered ? C.raised : C.deeper,
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        minWidth: 200,
        maxWidth: 260,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Thumbnail title={project.title} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.title}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StagePill stage={project.stage} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.dim }}>{project.status}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 14 }}>
        {project.progress != null && (
          <>
            <ProgressBar value={project.progress} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted }}>{project.progress}%</span>
          </>
        )}
        {project.score != null && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: project.score >= 80 ? C.green : C.accent }}>
            Score {project.score}
          </span>
        )}
      </div>
    </div>
  );
}

function ClientAlertBadge({ clientName }: { clientName: string }) {
  const alert = ALERTS.find((a) => a.clientHint === clientName);
  if (!alert) return null;
  return (
    <span
      style={{
        fontFamily: FONT_SANS,
        fontSize: 11,
        color: alert.color,
        background: alert.color + "12",
        border: `1px solid ${alert.color}25`,
        borderRadius: 4,
        padding: "2px 8px",
      }}
    >
      {alert.message}
    </span>
  );
}

function ClientRow({ name, projects }: { name: string; projects: Project[] }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "0 4px" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 18, fontWeight: 500, color: C.text }}>
          {name}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.muted,
            background: C.well,
            borderRadius: 4,
            padding: "2px 7px",
          }}
        >
          {projects.length}
        </span>
        <ClientAlertBadge clientName={name} />
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 4,
          /* hide scrollbar */
          scrollbarWidth: "none",
        }}
      >
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

/* ── main export ── */

export function DashboardClients() {
  const groups = groupByClient(PROJECTS);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_SANS, color: C.text }}>
      <Topbar />

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* Global alerts without a matching client */}
        {ALERTS.filter((a) => !PROJECTS.some((p) => p.client === a.clientHint)).length > 0 && (
          <section style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 6 }}>
            {ALERTS.filter((a) => !PROJECTS.some((p) => p.client === a.clientHint)).map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: `1px solid ${a.color}25`,
                  background: a.color + "08",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.soft }}>
                  {a.clientHint}: {a.message}
                </span>
              </div>
            ))}
          </section>
        )}

        {groups.map((g) => (
          <ClientRow key={g.name} name={g.name} projects={g.projects} />
        ))}
      </main>
    </div>
  );
}
