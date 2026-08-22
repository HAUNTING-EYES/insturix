"use client";

import React from "react";

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
  client?: string;
  stage: string;
  status: string;
  progress?: number;
  score?: number;
}

const PROJECTS: Project[] = [
  { id: "p1", title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "Writing", progress: 45 },
  { id: "p2", title: "Founder story", stage: "script", status: "Draft" },
  { id: "p3", title: "Q1 launch reel", stage: "edit", status: "Editing", progress: 64 },
  { id: "p4", title: "Chaayos Holi v3", client: "Chaayos", stage: "edit", status: "Captions", progress: 78 },
  { id: "p5", title: "Chaayos Holi v2", client: "Chaayos", stage: "analyze", status: "Scored", score: 91 },
  { id: "p6", title: "Starbucks intro", client: "Starbucks", stage: "thumbnails", status: "Generating", progress: 38 },
  { id: "p7", title: "Masala mornings", stage: "publish", status: "Live", score: 74 },
  { id: "p8", title: "Brand anthem", stage: "publish", status: "Scheduled", score: 88 },
];

interface Room {
  key: string;
  label: string;
  color: string;
}

const ROOMS: Room[] = [
  { key: "script", label: "Script Room", color: C.accent },
  { key: "edit", label: "Edit Room", color: C.red },
  { key: "analyze", label: "Analyze Room", color: C.purple },
  { key: "thumbnails", label: "Thumbnails Room", color: C.pink },
  { key: "publish", label: "Publish Room", color: C.green },
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
      <span style={{ fontFamily: FONT_SANS, fontWeight: 800, fontSize: 18, color: C.text, letterSpacing: "-0.02em" }}>
        Insturix
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: C.green, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          LIVE
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

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: 48, height: 3, borderRadius: 2, background: C.well }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 2, background: color }} />
    </div>
  );
}

function RoomProjectRow({ project, roomColor }: { project: Project; roomColor: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {project.title}
        </span>
        {project.client && (
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.muted }}>{project.client}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.dim }}>{project.status}</span>
        {project.progress != null && (
          <>
            <ProgressBar value={project.progress} color={roomColor} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted }}>{project.progress}%</span>
          </>
        )}
        {project.score != null && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: project.score >= 80 ? C.green : C.accent }}>
            {project.score}
          </span>
        )}
      </div>
    </div>
  );
}

function RoomPanel({ room }: { room: Room }) {
  const roomProjects = PROJECTS.filter((p) => p.stage === room.key);
  const isEmpty = roomProjects.length === 0;

  return (
    <div
      style={{
        background: C.raised,
        border: `1px solid ${room.color}30`,
        borderRadius: 10,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 140,
      }}
    >
      {/* room header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: room.color }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 800, color: room.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {room.label}
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.faint, marginLeft: "auto" }}>
          {roomProjects.length}
        </span>
      </div>

      {/* projects list */}
      {isEmpty ? (
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.dim, fontStyle: "italic" }}>
          No active jobs
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {roomProjects.map((p) => (
            <RoomProjectRow key={p.id} project={p} roomColor={room.color} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── main export ── */

export function DashboardControlRoom() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_SANS, color: C.text }}>
      <Topbar />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* 5-room grid: 3 columns top, 2 columns bottom */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {ROOMS.slice(0, 3).map((room) => (
            <RoomPanel key={room.key} room={room} />
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          {ROOMS.slice(3).map((room) => (
            <RoomPanel key={room.key} room={room} />
          ))}
        </div>
      </main>
    </div>
  );
}
