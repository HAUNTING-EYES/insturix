"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Select } from "@/components/primitives";

/* ── Design tokens ── */
// Values point at design-tokens.css variables (P2.9) so a theme change propagates.
// Translucent tints use color-mix() — a var() cannot take a hex-alpha suffix.
const C = {
  bg: "var(--bg-canvas)",
  raised: "var(--bg-raised)",
  deeper: "var(--bg-deeper)",
  well: "var(--bg-well)",
  border: "var(--border-subtle)",
  borderL: "var(--border-emphasis)",
  text: "var(--text-primary)",
  soft: "var(--text-secondary)",
  muted: "var(--text-muted)",
  dim: "var(--text-dim)",
  faint: "var(--text-faint)",
  accent: "var(--accent-gold)",
  green: "var(--status-success)",
  red: "var(--status-danger)",
  purple: "var(--category-purple)",
  pink: "var(--category-pink)",
  cyan: "var(--category-cyan)",
} as const;

/* ── Stage definitions ── */
const STAGES = [
  { key: "script", label: "Script", color: C.accent },
  { key: "edit", label: "Edit", color: C.red },
  { key: "analyze", label: "Analyze", color: C.purple },
  { key: "thumbnails", label: "Thumbnails", color: C.pink },
  { key: "publish", label: "Publish", color: C.green },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

/* ── View / Group types ── */
type ViewMode = "board" | "list" | "split" | "cinematic";
type GroupBy = "stage" | "brand" | "date" | "status";
type SortField = "name" | "brand" | "stage" | "status" | "score" | "updated";
type SortDir = "asc" | "desc";

/* ── API response shape ── */
interface ApiProject {
  projectId: string;
  name: string;
  thumbnail: string | null;
  updatedAt: string;
  durationInFrames: number | null;
  aspectRatio: string | null;
}

/* ── Enriched project for UI ── */
interface Project {
  id: string;
  name: string;
  thumbnail: string | null;
  updatedAt: string;
  durationInFrames: number | null;
  aspectRatio: string | null;

  // Dashboard fields — now wired to backend (project-service.ts)
  brand: string | null;
  stage: StageKey;
  score: number | null;
  status: "active" | "needs_attention" | "complete";
  // Cross-service linkage
  sourceSessionId: string | null;
}

/* ── Map API response to dashboard Project ── */
function enrichProject(raw: ApiProject): Project {
  // Use real fields from backend, fallback for old documents that lack them
  const rawStage = (raw as any).pipelineStage || "edit";
  const stage: StageKey = rawStage;
  const brand: string | null = (raw as any).brand ?? null;
  const score: number | null = (raw as any).qualityScore ?? null;
  const rawStatus = (raw as any).projectStatus;
  const status: "active" | "needs_attention" | "complete" =
    rawStatus === "needs-attention" ? "needs_attention"
    : rawStatus === "complete" ? "complete"
    : "active";

  return {
    id: raw.projectId,
    name: raw.name,
    thumbnail: raw.thumbnail,
    updatedAt: raw.updatedAt,
    durationInFrames: raw.durationInFrames,
    aspectRatio: raw.aspectRatio,
    brand,
    stage,
    score,
    status,
    sourceSessionId: (raw as any).sourceSessionId ?? null,
  };
}

/* One canonical open target for a project, used by every view (board, list,
   split, cinematic) so a card is never a dead click in one view and a link in
   another. Script-stage pipeline projects re-open their ThinkForge session. */
function projectHref(p: Project): string {
  return p.stage === "script" && p.sourceSessionId
    ? `/dashboard/thinkforge?session=${p.sourceSessionId}`
    : `/dashboard/editron/project/${p.id}`;
}

/* ── Grouping helpers ── */
function groupByStage(projects: Project[]): { key: string; label: string; color: string; projects: Project[] }[] {
  return STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    projects: projects.filter((p) => p.stage === s.key),
  }));
}

function groupByBrand(projects: Project[]): { key: string; label: string; color: string; projects: Project[] }[] {
  // TODO: Wire brand field -- currently all projects group under "Personal"
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.brand || "Personal";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const groups: { key: string; label: string; color: string; projects: Project[] }[] = [];
  for (const [name, projs] of map) {
    if (name !== "Personal") groups.push({ key: name, label: name, color: C.cyan, projects: projs });
  }
  const personal = map.get("Personal");
  if (personal) groups.push({ key: "Personal", label: "Personal", color: C.muted, projects: personal });
  return groups;
}

function groupByDate(projects: Project[]): { key: string; label: string; color: string; projects: Project[] }[] {
  const now = Date.now();
  const oneDay = 86_400_000;
  const oneWeek = oneDay * 7;
  const today: Project[] = [];
  const thisWeek: Project[] = [];
  const older: Project[] = [];
  for (const p of projects) {
    const age = now - new Date(p.updatedAt).getTime();
    if (age < oneDay) today.push(p);
    else if (age < oneWeek) thisWeek.push(p);
    else older.push(p);
  }
  return [
    { key: "today", label: "Today", color: C.green, projects: today },
    { key: "week", label: "This week", color: C.accent, projects: thisWeek },
    { key: "older", label: "Older", color: C.muted, projects: older },
  ];
}

function groupByStatus(projects: Project[]): { key: string; label: string; color: string; projects: Project[] }[] {
  // TODO: Wire to backend -- status should come from project model
  return [
    { key: "needs_attention", label: "Needs attention", color: C.red, projects: projects.filter((p) => p.status === "needs_attention") },
    { key: "active", label: "In progress", color: C.accent, projects: projects.filter((p) => p.status === "active") },
    { key: "complete", label: "Complete", color: C.green, projects: projects.filter((p) => p.status === "complete") },
  ];
}

function getGroups(projects: Project[], groupBy: GroupBy) {
  switch (groupBy) {
    case "stage": return groupByStage(projects);
    case "brand": return groupByBrand(projects);
    case "date": return groupByDate(projects);
    case "status": return groupByStatus(projects);
  }
}

/* ── Sorting helper ── */
function sortProjects(projects: Project[], field: SortField, dir: SortDir): Project[] {
  const sorted = [...projects];
  const mul = dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (field) {
      case "name": return mul * a.name.localeCompare(b.name);
      case "brand": return mul * (a.brand || "").localeCompare(b.brand || "");
      case "stage": return mul * a.stage.localeCompare(b.stage);
      case "status": return mul * a.status.localeCompare(b.status);
      case "score": return mul * ((a.score ?? 0) - (b.score ?? 0));
      case "updated": return mul * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default: return 0;
    }
  });
  return sorted;
}

/* ── Time formatting ── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/* ── Thumbnail placeholder ── */
function thumbGradient(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue},30%,14%) 0%, hsl(${(hue + 40) % 360},25%,10%) 100%)`;
}


/* ================================================================
   VIEW ICON SVGs
   ================================================================ */

function IconBoard({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="4" height="12" rx="1" stroke={active ? C.text : C.muted} strokeWidth="1.2" />
      <rect x="7" y="1" width="4" height="8" rx="1" stroke={active ? C.text : C.muted} strokeWidth="1.2" />
    </svg>
  );
}

function IconList({ active }: { active: boolean }) {
  const c = active ? C.text : C.muted;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3h10M2 7h10M2 11h10" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconSplit({ active }: { active: boolean }) {
  const c = active ? C.text : C.muted;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="12" rx="1" stroke={c} strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="12" rx="1" stroke={c} strokeWidth="1.2" />
    </svg>
  );
}

function IconCinematic({ active }: { active: boolean }) {
  const c = active ? C.text : C.muted;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="8" rx="1" stroke={c} strokeWidth="1.2" />
      <rect x="1" y="11" width="3" height="2" rx="0.5" fill={c} />
      <rect x="5.5" y="11" width="3" height="2" rx="0.5" fill={c} />
      <rect x="10" y="11" width="3" height="2" rx="0.5" fill={c} />
    </svg>
  );
}

/* ================================================================
   GLOBAL CSS
   ================================================================ */
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
  .dh-mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  @keyframes dh-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.55; } }
  .dh-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .dh-scroll::-webkit-scrollbar-track { background: transparent; }
  .dh-scroll::-webkit-scrollbar-thumb { background: #282724; border-radius: 2px; }
`;


/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export function DashboardHome() {
  /* ── Data fetching ── */
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/services/editron/projects/list", { credentials: "include" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.projects)) {
          setProjects(data.projects.map(enrichProject));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ── View state ── */
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [groupBy, setGroupBy] = useState<GroupBy>("stage");
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // For cinematic, auto-select first project
  useEffect(() => {
    if (viewMode === "cinematic" && !focusId && projects.length > 0) {
      setFocusId(projects[0].id);
    }
  }, [viewMode, focusId, projects]);

  const groups = useMemo(() => getGroups(projects, groupBy), [projects, groupBy]);
  const sortedProjects = useMemo(() => sortProjects(projects, sortField, sortDir), [projects, sortField, sortDir]);

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <>
        <style>{globalCSS}</style>
        <div style={{
          minHeight: "100vh", background: C.bg, color: C.text,
          fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 24, height: 24, border: `2px solid ${C.border}`,
              borderTop: `2px solid ${C.accent}`, borderRadius: "50%",
              animation: "dh-spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }} />
            <style>{`@keyframes dh-spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: 13, color: C.muted }}>Loading projects...</span>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{globalCSS}</style>
        <div style={{
          minHeight: "100vh", background: C.bg, color: C.text,
          fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: 14, color: C.red }}>{error}</span>
            <br />
            <button onClick={() => window.location.reload()} style={{
              marginTop: 12, background: C.raised, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "8px 20px", fontSize: 13,
              color: C.text, cursor: "pointer", fontFamily: "inherit",
            }}>Retry</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        {/* ── TOPBAR ── */}
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px", borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: C.bg, zIndex: 20,
        }}>
          {/* Left: heading */}
          <span style={{ fontSize: 14, fontWeight: 500, color: C.soft }}>Production Floor</span>

          {/* Center: controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Group-by dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dh-mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.04em" }}>GROUP</span>
              <div style={{ minWidth: 110 }}>
                <Select
                  size="sm"
                  aria-label="Group projects by"
                  value={groupBy}
                  onChange={(v) => setGroupBy(v as GroupBy)}
                  options={[
                    { value: "stage", label: "Stage" },
                    { value: "brand", label: "Brand" },
                    { value: "date", label: "Date" },
                    { value: "status", label: "Status" },
                  ]}
                />
              </div>
            </div>

            {/* View-as toggle */}
            <div style={{
              display: "flex", gap: 2, background: C.deeper,
              borderRadius: 6, padding: 2, border: `1px solid ${C.border}`,
            }}>
              {([
                { key: "board" as const, Icon: IconBoard },
                { key: "list" as const, Icon: IconList },
                { key: "split" as const, Icon: IconSplit },
                { key: "cinematic" as const, Icon: IconCinematic },
              ]).map(({ key, Icon }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  title={key.charAt(0).toUpperCase() + key.slice(1)}
                  style={{
                    background: viewMode === key ? C.well : "transparent",
                    border: "none", borderRadius: 4,
                    padding: "5px 8px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s ease",
                  }}
                >
                  <Icon active={viewMode === key} />
                </button>
              ))}
            </div>
          </div>

          {/* Right: new project */}
          <Link href="/dashboard/editron" style={{ textDecoration: "none" }}>
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "8px 20px", borderRadius: 7, fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              New project
            </button>
          </Link>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ padding: viewMode === "cinematic" ? 0 : "24px 32px 64px", maxWidth: viewMode === "cinematic" ? "none" : 1280, margin: "0 auto" }}>

          {/* ATTENTION ZONE */}
          {viewMode !== "cinematic" && (
            <AttentionZone />
          )}

          {/* MAIN CONTENT */}
          {viewMode === "board" && (
            <BoardView groups={groups} />
          )}
          {viewMode === "list" && (
            <ListView
              projects={sortedProjects}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}
          {viewMode === "split" && (
            <SplitView
              groups={groups}
              projects={projects}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {viewMode === "cinematic" && (
            <CinematicView
              projects={projects}
              focusId={focusId}
              onFocus={setFocusId}
            />
          )}

          {/* SHIPPED SECTION */}
          {viewMode !== "cinematic" && (
            <ShippedSection />
          )}
        </div>
      </div>
    </>
  );
}


/* ================================================================
   ATTENTION ZONE
   ================================================================ */

function AttentionZone() {
  const [items, setItems] = useState<{ id: string; type: string; title: string; detail: string; time: string; severity: string }[]>([]);
  // A failed load must never masquerade as "nothing needs attention" — that is
  // the opposite of the truth this zone exists to tell.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    fetch("/api/dashboard/attention", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => { setItems(data?.items ?? []); })
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Clear = dismiss (soft) so it stops showing. Optimistic: drop from the list, then persist.
  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    fetch("/api/dashboard/attention", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };
  const clearAll = () => {
    setItems([]);
    fetch("/api/dashboard/attention", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: loadFailed || items.length > 0 ? C.red : C.green }} />
        <span className="dh-mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>
          NEEDS ATTENTION
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: 11, color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>{items.length}</span>
        )}
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="dh-mono"
            style={{
              marginLeft: "auto", fontSize: 10, letterSpacing: "0.06em", color: C.dim,
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "3px 9px", cursor: "pointer",
            }}
          >
            CLEAR ALL
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: "12px 16px", background: C.raised,
          border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          {loadFailed ? (
            <span style={{ fontSize: 13, color: C.red }}>
              Couldn&apos;t check for items needing attention.{" "}
              <button onClick={load} style={{ background: "none", border: "none", color: C.red, textDecoration: "underline", cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "inherit" }}>Retry</button>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: C.muted }}>No items need attention</span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              padding: "12px 16px", background: C.raised,
              border: `1px solid ${item.severity === "high" ? `color-mix(in srgb, ${C.red} 19%, transparent)` : C.border}`,
              borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{item.title}</span>
                <span style={{ fontSize: 11, color: C.muted, display: "block", marginTop: 2 }}>{item.detail}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span className="dh-mono" style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>
                  {new Date(item.time).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label={`Clear ${item.title}`}
                  title="Clear"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: 6, color: C.dim,
                    background: "transparent", border: `1px solid ${C.border}`,
                    cursor: "pointer", fontSize: 14, lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


/* ================================================================
   BOARD VIEW -- Kanban columns from groups
   ================================================================ */

function BoardView({ groups }: { groups: { key: string; label: string; color: string; projects: Project[] }[] }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <span className="dh-mono" style={{
        fontSize: 11, color: C.dim, letterSpacing: "0.06em",
        display: "block", marginBottom: 12,
      }}>PIPELINE</span>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${groups.length}, 1fr)`,
        gap: 8, minHeight: 320,
      }}>
        {groups.map((group) => (
          <div key={group.key} style={{
            background: C.raised, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 8, display: "flex", flexDirection: "column",
          }}>
            {/* Column header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 8px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: group.color }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{group.label}</span>
              </div>
              <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{group.projects.length}</span>
            </div>
            {/* Cards — each column scrolls on its own so a busy stage doesn't stretch the whole board. */}
            <div className="dh-scroll" style={{ flex: 1, minHeight: 0, maxHeight: "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {group.projects.map((project) => (
                <BoardCard key={project.id} project={project} stageColor={group.color} />
              ))}
              {group.projects.length === 0 && (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, border: `1px dashed ${C.borderL}`,
                  padding: 24, minHeight: 80,
                }}>
                  <span style={{ fontSize: 11, color: C.faint }}>No projects</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ── Board card ── */

function BoardCard({ project, stageColor }: { project: Project; stageColor: string }) {
  const isPipeline = !!project.sourceSessionId;
  const cardColor = isPipeline ? stageColor : C.dim;
  const bg = project.thumbnail || thumbGradient(project.name);
  const isUrl = project.thumbnail && (project.thumbnail.startsWith("http") || project.thumbnail.startsWith("/"));
  const scoreColor = project.score !== null
    ? project.score > 75 ? C.green : project.score >= 50 ? C.accent : C.red
    : null;

  return (
    <Link href={projectHref(project)} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
    <div style={{
      background: C.deeper, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 10, cursor: "pointer",
      transition: "border-color 0.25s ease",
      position: "relative",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.borderL}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
    >
      {/* Quality score indicator */}
      {scoreColor && (
        <div
          title={`Quality: ${project.score}/100`}
          style={{
            position: "absolute", top: 6, right: 6,
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 6px", borderRadius: 4,
            background: `color-mix(in srgb, ${scoreColor} 9%, transparent)`,
            cursor: "pointer",
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: scoreColor,
          }} />
          <span className="dh-mono" style={{
            fontSize: 10, fontWeight: 500, color: scoreColor,
          }}>{project.score}</span>
        </div>
      )}

      {/* Thumbnail */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 7, flexShrink: 0,
          background: isUrl ? undefined : bg,
          backgroundImage: isUrl ? `url(${project.thumbnail})` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {!isUrl && (
            <span style={{ fontSize: 14, fontWeight: 800, color: C.faint }}>
              {project.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.35,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>{project.name}</div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 3, height: 10, borderRadius: 1, background: cardColor }} />
          <span className="dh-mono" style={{ fontSize: 11, color: isPipeline ? C.dim : C.faint }}>
            {STAGES.find((s) => s.key === project.stage)?.label ?? project.stage}
          </span>
        </div>
        <span className="dh-mono" style={{ fontSize: 11, color: C.faint }}>{timeAgo(project.updatedAt)}</span>
      </div>
    </div>
    </Link>
  );
}


/* ================================================================
   LIST VIEW -- Flat sortable table
   ================================================================ */

function ListView({
  projects,
  sortField,
  sortDir,
  onSort,
}: {
  projects: Project[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const cols: { label: string; field: SortField; width: string }[] = [
    { label: "Name", field: "name", width: "1fr" },
    { label: "Brand", field: "brand", width: "100px" },
    { label: "Stage", field: "stage", width: "100px" },
    { label: "Status", field: "status", width: "100px" },
    { label: "Score", field: "score", width: "64px" },
    { label: "Updated", field: "updated", width: "100px" },
  ];
  const gridCols = cols.map((c) => c.width).join(" ");
  const arrow = (f: SortField) => sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <section style={{ marginBottom: 48 }}>
      <span className="dh-mono" style={{
        fontSize: 11, color: C.dim, letterSpacing: "0.06em",
        display: "block", marginBottom: 12,
      }}>PIPELINE</span>
      <div style={{
        background: C.raised, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: gridCols,
          gap: 16, padding: "10px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {cols.map((col) => (
            <span
              key={col.field}
              className="dh-mono"
              onClick={() => onSort(col.field)}
              style={{
                fontSize: 11, color: sortField === col.field ? C.soft : C.faint,
                letterSpacing: "0.04em", cursor: "pointer",
                userSelect: "none",
              }}
            >
              {col.label}{arrow(col.field)}
            </span>
          ))}
        </div>

        {/* Rows */}
        {projects.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 13, color: C.faint }}>No projects</span>
          </div>
        )}
        {projects.map((p, i) => {
          const stage = STAGES.find((s) => s.key === p.stage);
          const isPL = !!p.sourceSessionId;
          const sc = isPL ? (stage?.color ?? C.dim) : C.dim;
          return (
            <Link key={p.id} href={projectHref(p)} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{
              display: "grid", gridTemplateColumns: gridCols,
              gap: 16, padding: "12px 16px",
              borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : "none",
              cursor: "pointer", transition: "background 0.2s ease",
              alignItems: "center",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.deeper}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {/* Name */}
              <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
              {/* Brand */}
              <span style={{ fontSize: 11, color: C.muted }}>{p.brand || "Personal"}</span>
              {/* Stage */}
              <span className="dh-mono" style={{
                fontSize: 11, fontWeight: 500, color: sc,
                padding: "3px 8px", background: `color-mix(in srgb, ${sc} 7%, transparent)`,
                borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 5,
                width: "fit-content",
              }}>
                <div style={{ width: 3, height: 10, borderRadius: 1, background: sc }} />
                {stage?.label ?? p.stage}
              </span>
              {/* Status */}
              <span style={{ fontSize: 11, color: C.soft, textTransform: "capitalize" }}>
                {p.status.replace("_", " ")}
              </span>
              {/* Score */}
              {p.score !== null ? (
                <span className="dh-mono" style={{
                  fontSize: 11, fontWeight: 500,
                  color: p.score >= 85 ? C.green : p.score >= 70 ? C.accent : C.red,
                  padding: "3px 8px", background: `color-mix(in srgb, ${p.score >= 85 ? C.green : p.score >= 70 ? C.accent : C.red} 7%, transparent)`,
                  borderRadius: 3, textAlign: "center",
                }}>{p.score}</span>
              ) : (
                <span className="dh-mono" style={{ fontSize: 11, color: C.faint, textAlign: "center" }}>&mdash;</span>
              )}
              {/* Updated */}
              <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{timeAgo(p.updatedAt)}</span>
            </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}


/* ================================================================
   SPLIT VIEW
   ================================================================ */

function SplitView({
  groups,
  projects,
  selectedId,
  onSelect,
}: {
  groups: { key: string; label: string; color: string; projects: Project[] }[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;

  return (
    <section style={{ marginBottom: 48 }}>
      <span className="dh-mono" style={{
        fontSize: 11, color: C.dim, letterSpacing: "0.06em",
        display: "block", marginBottom: 12,
      }}>PIPELINE</span>
      <div style={{
        display: "flex", gap: 0,
        background: C.raised, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
        minHeight: 480,
      }}>
        {/* Left panel: grouped project list */}
        <div className="dh-scroll" style={{
          width: "40%", borderRight: `1px solid ${C.border}`,
          overflowY: "auto", maxHeight: 600,
        }}>
          {groups.map((group) => (
            <div key={group.key}>
              <div style={{
                padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 8,
                position: "sticky", top: 0, background: C.raised, zIndex: 1,
              }}>
                <div style={{ width: 3, height: 12, borderRadius: 1, background: group.color }} />
                <span style={{ fontSize: 11, fontWeight: 500 }}>{group.label}</span>
                <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{group.projects.length}</span>
              </div>
              {group.projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    padding: "10px 16px",
                    background: selectedId === p.id ? C.well : "transparent",
                    borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer", transition: "background 0.15s ease",
                    borderLeft: selectedId === p.id ? `3px solid ${group.color}` : "3px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (selectedId !== p.id) e.currentTarget.style.background = C.deeper; }}
                  onMouseLeave={(e) => { if (selectedId !== p.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="dh-mono" style={{ fontSize: 11, color: group.color }}>
                      {STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}
                    </span>
                    <span style={{ color: C.faint, fontSize: 11 }}>&middot;</span>
                    <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{timeAgo(p.updatedAt)}</span>
                  </div>
                </div>
              ))}
              {group.projects.length === 0 && (
                <div style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: C.faint }}>Empty</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right panel: selected project detail */}
        <div style={{
          flex: 1, padding: 32,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          {selected ? (
            <SplitDetail project={selected} />
          ) : (
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 13, color: C.faint }}>Select a project to view details</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SplitDetail({ project }: { project: Project }) {
  const stage = STAGES.find((s) => s.key === project.stage);
  const isPipeline = !!project.sourceSessionId;
  const stageColor = isPipeline ? (stage?.color ?? C.dim) : C.dim;
  const bg = project.thumbnail || thumbGradient(project.name);
  const isUrl = project.thumbnail && (project.thumbnail.startsWith("http") || project.thumbnail.startsWith("/"));

  return (
    <div style={{ width: "100%", maxWidth: 400 }}>
      {/* Thumbnail area */}
      <div style={{
        width: "100%", aspectRatio: "16/9", borderRadius: 10, marginBottom: 20,
        background: isUrl ? undefined : bg,
        backgroundImage: isUrl ? `url(${project.thumbnail})` : undefined,
        backgroundSize: "cover", backgroundPosition: "center",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${C.border}`,
      }}>
        {!isUrl && (
          <span style={{ fontSize: 32, fontWeight: 800, color: C.faint }}>
            {project.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
        {project.name}
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span className="dh-mono" style={{
          fontSize: 11, fontWeight: 500, color: stageColor,
          padding: "3px 8px", background: `color-mix(in srgb, ${stageColor} 9%, transparent)`, borderRadius: 4,
        }}>
          {stage?.label ?? project.stage}
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>{project.brand || "Personal"}</span>
        {project.aspectRatio && (
          <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{project.aspectRatio}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 11, color: C.faint, display: "block", marginBottom: 2 }}>Updated</span>
          <span className="dh-mono" style={{ fontSize: 11, color: C.soft }}>{timeAgo(project.updatedAt)}</span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: C.faint, display: "block", marginBottom: 2 }}>Status</span>
          <span style={{ fontSize: 11, color: C.soft, textTransform: "capitalize" }}>{project.status.replace("_", " ")}</span>
        </div>
        {project.score !== null && (
          <div>
            <span style={{ fontSize: 11, color: C.faint, display: "block", marginBottom: 2 }}>Score</span>
            <span className="dh-mono" style={{
              fontSize: 11, fontWeight: 500,
              color: project.score >= 85 ? C.green : project.score >= 70 ? C.accent : C.red,
            }}>{project.score}</span>
          </div>
        )}
      </div>
      <Link href={projectHref(project)} style={{ textDecoration: "none" }}>
        <button style={{
          background: C.accent, color: C.bg, border: "none",
          padding: "10px 28px", borderRadius: 7, fontSize: 13, fontWeight: 800,
          cursor: "pointer", fontFamily: "inherit",
        }}>{project.stage === "script" ? "Open script" : "Open project"}</button>
      </Link>
    </div>
  );
}


/* ================================================================
   CINEMATIC VIEW
   ================================================================ */

function CinematicView({
  projects,
  focusId,
  onFocus,
}: {
  projects: Project[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const focus = focusId ? projects.find((p) => p.id === focusId) ?? null : null;
  const focusStage = focus ? STAGES.find((s) => s.key === focus.stage) : null;
  const bg = focus?.thumbnail || (focus ? thumbGradient(focus.name) : C.bg);
  const isUrl = focus?.thumbnail && (focus.thumbnail.startsWith("http") || focus.thumbnail.startsWith("/"));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 48px)" }}>
      {/* Hero area */}
      <div style={{
        flex: 1, position: "relative", overflow: "hidden", minHeight: 300,
      }}>
        {/* Background */}
        <div style={{
          position: "absolute", inset: 0,
          background: isUrl ? undefined : bg,
          backgroundImage: isUrl ? `url(${focus?.thumbnail})` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
          transition: "background 0.5s ease",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg, #0B0B0A 0%, rgba(11,11,10,0.85) 30%, rgba(11,11,10,0.6) 60%, rgba(11,11,10,0.4) 100%)",
        }} />

        {/* Content overlay */}
        <div style={{
          position: "relative", zIndex: 2, height: "100%",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          padding: "0 48px 32px",
        }}>
          {focus && focusStage ? (
            <div style={{ maxWidth: 500 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="dh-mono" style={{
                  fontSize: 11, color: focusStage.color, fontWeight: 500,
                  padding: "3px 8px", background: `color-mix(in srgb, ${focusStage.color} 13%, transparent)`, borderRadius: 4,
                }}>{focusStage.label}</span>
                {focus.aspectRatio && (
                  <span className="dh-mono" style={{ fontSize: 11, color: C.dim }}>{focus.aspectRatio}</span>
                )}
              </div>
              <h1 style={{
                fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em",
                lineHeight: 1.1, marginBottom: 6,
              }}>{focus.name}</h1>
              <div style={{ fontSize: 13, color: C.muted, display: "flex", gap: 12, marginBottom: 20 }}>
                <span>{focus.brand || "Personal"}</span>
                <span style={{ color: C.faint }}>&middot;</span>
                <span>{timeAgo(focus.updatedAt)}</span>
              </div>
              <Link
                href={
                  focus.stage === "script" && focus.sourceSessionId
                    ? `/dashboard/thinkforge?session=${focus.sourceSessionId}`
                    : `/dashboard/editron/project/${focus.id}`
                }
                style={{ textDecoration: "none" }}
              >
                <button style={{
                  background: C.accent, color: C.bg, border: "none",
                  padding: "10px 28px", borderRadius: 7, fontSize: 13, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{focus.stage === "script" ? "Open script" : "Open"}</button>
              </Link>
            </div>
          ) : (
            <span style={{ fontSize: 14, color: C.faint }}>No projects</span>
          )}
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{
        flexShrink: 0, padding: "16px 48px 20px",
        borderTop: `1px solid ${C.border}`,
        background: C.bg,
      }}>
        <div className="dh-scroll" style={{
          display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
        }}>
          {projects.map((p) => {
            const stage = STAGES.find((s) => s.key === p.stage)!;
            const isPL = !!p.sourceSessionId;
            const sc = isPL ? (stage?.color ?? C.dim) : C.dim;
            const isSel = focusId === p.id;
            const pBg = p.thumbnail || thumbGradient(p.name);
            const pIsUrl = p.thumbnail && (p.thumbnail.startsWith("http") || p.thumbnail.startsWith("/"));

            return (
              <div
                key={p.id}
                onClick={() => onFocus(p.id)}
                style={{
                  minWidth: 180, width: 180,
                  background: isSel ? C.well : C.raised,
                  border: `1px solid ${isSel ? C.borderL : C.border}`,
                  borderRadius: 10, overflow: "hidden",
                  cursor: "pointer", flexShrink: 0,
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  transform: isSel ? "translateY(-4px)" : "none",
                }}
              >
                <div style={{
                  height: 48,
                  background: pIsUrl ? undefined : pBg,
                  backgroundImage: pIsUrl ? `url(${p.thumbnail})` : undefined,
                  backgroundSize: "cover", backgroundPosition: "center",
                  position: "relative",
                }}>
                  <div style={{
                    position: "absolute", bottom: 0, left: 0,
                    width: "100%", height: 2,
                    background: sc,
                    opacity: isSel ? 1 : 0.25,
                  }} />
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, marginBottom: 4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="dh-mono" style={{ fontSize: 11, color: sc }}>
                      {stage?.label ?? p.stage}
                    </span>
                    <span className="dh-mono" style={{ fontSize: 11, color: C.faint }}>{timeAgo(p.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/* ================================================================
   SHIPPED SECTION
   ================================================================ */

function ShippedSection() {
  const [videos, setVideos] = useState<{ filename: string; uploadedAt: string; status: string; publicUrl: string }[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    fetch("/api/services/uploaderx/videos", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => { setVideos((data?.videos ?? []).slice(0, 5)); })
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section>
      <span className="dh-mono" style={{
        fontSize: 11, color: C.dim, letterSpacing: "0.06em",
        display: "block", marginBottom: 12,
      }}>SHIPPED</span>
      {videos.length === 0 ? (
        <div style={{
          background: C.raised, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "24px 16px", textAlign: "center",
        }}>
          {loadFailed ? (
            <span style={{ fontSize: 13, color: C.red }}>
              Couldn&apos;t load shipped content.{" "}
              <button onClick={load} style={{ background: "none", border: "none", color: C.red, textDecoration: "underline", cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "inherit" }}>Retry</button>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: C.faint }}>No shipped content yet</span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {videos.map((v, i) => (
            <div key={i} style={{
              padding: "12px 16px", background: C.raised,
              border: `1px solid ${C.border}`, borderRadius: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v.filename}</span>
                <span style={{ fontSize: 11, color: C.muted, display: "block", marginTop: 2 }}>
                  {v.status || "uploaded"}
                </span>
              </div>
              <span className="dh-mono" style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>
                {v.uploadedAt ? new Date(v.uploadedAt).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
          {/* TODO: Link videos to Editron projects once UploaderX schema has editronProjectId */}
        </div>
      )}
    </section>
  );
}
