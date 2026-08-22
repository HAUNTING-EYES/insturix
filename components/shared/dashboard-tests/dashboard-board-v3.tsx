"use client";

import React, { useState } from "react";

/*
  Insturix Dashboard v3 — Production Board

  Fixes from v2 feedback:
  1. Board/List toggle now functional — list view is a flat table
  2. Subtext bumped to 11-12px minimum. No more 10px anywhere.

  Three zones: Attention -> Pipeline -> Shipped
  Project is the primitive. Phase verbs only. No product names.
*/

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
};

const STAGES = [
  { key: "script", label: "Script", color: C.accent },
  { key: "edit", label: "Edit", color: C.red },
  { key: "analyze", label: "Analyze", color: C.purple },
  { key: "thumbnails", label: "Thumbnails", color: C.pink },
  { key: "publish", label: "Publish", color: C.green },
];

const ATTENTION_ITEMS = [
  { id: "a1", title: "Muffynn — Flexiwaist ad", issue: "Client revision requested", type: "revision" as const, time: "2h ago" },
  { id: "a2", title: "Chai Nagri — Monsoon reel", issue: "Publish failed — IG auth expired", type: "failed" as const, time: "overnight" },
  { id: "a3", title: "Starbucks — Reserve intro", issue: "Approval waiting from client", type: "approval" as const, time: "1d" },
];

const PIPELINE_PROJECTS = [
  { id: "p1", title: "Summer collection teaser", client: "Muffynn" as string | null, stage: "script", status: "AI writing", pct: 45 as number | null, score: null as number | null, format: "9:16 · 0:30", thumb: "linear-gradient(135deg, #25201a, #4a3820)" },
  { id: "p2", title: "Founder story — LinkedIn", client: null, stage: "script", status: "Draft", pct: null, score: null, format: "16:9 · 2:00", thumb: "linear-gradient(135deg, #1a2028, #2a3040)" },
  { id: "p3", title: "Q1 product launch reel", client: null, stage: "edit", status: "Producing", pct: 64, score: null, format: "16:9 · 0:30", thumb: "linear-gradient(135deg, #1a2028, #2a3848)" },
  { id: "p4", title: "Chaayos — Holi campaign v3", client: "Chaayos", stage: "edit", status: "Captions syncing", pct: 78, score: null, format: "1:1 · 0:32", thumb: "linear-gradient(135deg, #3d2a14, #5a3820)" },
  { id: "p5", title: "Chaayos — Holi campaign v2", client: "Chaayos", stage: "analyze", status: "Scored", pct: null, score: 91, format: "1:1 · 0:32", thumb: "linear-gradient(135deg, #3d2a14, #5a3820)" },
  { id: "p6", title: "Starbucks reserve intro", client: "Starbucks", stage: "thumbnails", status: "Generating", pct: 38, score: null, format: "16:9 · 0:45", thumb: "linear-gradient(135deg, #14251f, #205a38)" },
  { id: "p7", title: "Masala mornings explainer", client: "Chai Nagri", stage: "publish", status: "Live on 4 platforms", pct: null, score: 74, format: "9:16 · 0:47", thumb: "linear-gradient(135deg, #2a1f2a, #4a2f5a)" },
  { id: "p8", title: "Brand anthem 60s", client: null, stage: "publish", status: "Scheduled", pct: null, score: 88, format: "16:9 · 1:00", thumb: "linear-gradient(135deg, #1e1828, #3a2a5a)" },
];

const SHIPPED = [
  { id: "s1", title: "Chaayos — Holi campaign v1", score: 87, views: "12.4K", ctr: "4.2%", published: "3d ago", platforms: 6 },
  { id: "s2", title: "Masala mornings — cut 1", score: 71, views: "3.1K", ctr: "2.8%", published: "5d ago", platforms: 4 },
  { id: "s3", title: "Chai cup product ad", score: 58, views: "890", ctr: "1.4%", published: "7d ago", platforms: 2 },
];

type AttentionType = "revision" | "failed" | "approval";

interface AttentionItem {
  id: string;
  title: string;
  issue: string;
  type: AttentionType;
  time: string;
}

interface PipelineProject {
  id: string;
  title: string;
  client: string | null;
  stage: string;
  status: string;
  pct: number | null;
  score: number | null;
  format: string;
  thumb: string;
}

interface Stage {
  key: string;
  label: string;
  color: string;
}

export function DashboardBoardV3() {
  const [view, setView] = useState("board");

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        {/* TOPBAR */}
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px", borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: C.bg, zIndex: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Insturix</span>
            <div style={{ width: 1, height: 18, background: C.border }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: C.soft }}>Production board</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.deeper, border: `1px solid ${C.borderL}`,
              borderRadius: 8, padding: "0 12px", width: 240,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke={C.muted} strokeWidth="2"/>
                <path d="M16 16l4 4" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input placeholder="Search projects..." style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 13, color: C.text, fontFamily: "inherit", padding: "7px 0",
              }} />
              <span className="mono" style={{ fontSize: 11, color: C.faint }}>&#x2318;K</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>840</span>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", background: `${C.accent}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: C.accent, fontWeight: 500,
            }}>N</div>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{ padding: "24px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>

          {/* HEADER */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            marginBottom: 32,
          }}>
            <div>
              <h1 style={{
                fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
                margin: "0 0 12px", lineHeight: 1.1,
              }}>Good evening, Nimit.</h1>
              <div style={{ display: "flex", gap: 24 }}>
                {[
                  { n: "14", label: "Total", color: C.text },
                  { n: "3", label: "Needs attention", color: C.red },
                  { n: "4", label: "In progress", color: C.accent },
                  { n: "2", label: "Ready", color: C.green },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="mono" style={{ fontSize: 18, fontWeight: 500, color: s.color, letterSpacing: "-0.03em" }}>{s.n}</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "10px 24px", borderRadius: 7, fontSize: 13, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              New project
            </button>
          </div>

          {/* ZONE 1: NEEDS ATTENTION */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: C.red }} />
              <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>
                NEEDS ATTENTION &middot; {ATTENTION_ITEMS.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ATTENTION_ITEMS.map((item) => <AttentionRow key={item.id} item={item} />)}
            </div>
          </section>

          {/* ZONE 2: PIPELINE */}
          <section style={{ marginBottom: 48 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>PIPELINE</span>
              <div style={{
                display: "flex", gap: 2,
                background: C.deeper, borderRadius: 6, padding: 2,
                border: `1px solid ${C.border}`,
              }}>
                {["Board", "List"].map((v) => (
                  <button key={v} onClick={() => setView(v.toLowerCase())} style={{
                    background: view === v.toLowerCase() ? C.well : "transparent",
                    border: "none", borderRadius: 4,
                    padding: "5px 14px", fontSize: 11,
                    fontWeight: view === v.toLowerCase() ? 500 : 400,
                    color: view === v.toLowerCase() ? C.text : C.muted,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.2s ease",
                  }}>{v}</button>
                ))}
              </div>
            </div>

            {view === "board" ? <BoardView /> : <ListView />}
          </section>

          {/* ZONE 3: SHIPPED */}
          <section>
            <span className="mono" style={{
              fontSize: 11, color: C.dim, letterSpacing: "0.06em",
              display: "block", marginBottom: 12,
            }}>SHIPPED THIS WEEK &middot; {SHIPPED.length}</span>
            <div style={{
              background: C.raised, border: `1px solid ${C.border}`,
              borderRadius: 12, overflow: "hidden",
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 64px 80px 64px 80px 80px",
                gap: 16, padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
              }}>
                {["Project", "Score", "Views", "CTR", "Platforms", "Published"].map((h) => (
                  <span key={h} className="mono" style={{ fontSize: 11, color: C.faint, letterSpacing: "0.04em" }}>{h}</span>
                ))}
              </div>
              {SHIPPED.map((item, i) => {
                const sc = item.score >= 85 ? C.green : item.score >= 70 ? C.accent : C.red;
                return (
                  <div key={item.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 64px 80px 64px 80px 80px",
                    gap: 16, padding: "12px 16px",
                    borderBottom: i < SHIPPED.length - 1 ? `1px solid ${C.border}` : "none",
                    cursor: "pointer", transition: "background 0.2s ease",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = C.deeper}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: sc }}>{item.score}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.soft }}>{item.views}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.soft }}>{item.ctr}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.muted }}>{item.platforms}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.dim }}>{item.published}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}


// BOARD VIEW — Kanban columns

function BoardView() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
      gap: 8, minHeight: 320,
    }}>
      {STAGES.map((stage) => {
        const projects = PIPELINE_PROJECTS.filter((p) => p.stage === stage.key);
        return (
          <div key={stage.key} style={{
            background: C.raised, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 8, display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 8px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: stage.color }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{stage.label}</span>
              </div>
              <span className="mono" style={{ fontSize: 11, color: C.dim }}>{projects.length}</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {projects.map((project) => (
                <PipelineCard key={project.id} project={project} stageColor={stage.color} />
              ))}
              {projects.length === 0 && (
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
        );
      })}
    </div>
  );
}


// LIST VIEW — Flat table with stage indicators

function ListView() {
  return (
    <div style={{
      background: C.raised, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 120px 80px 64px",
        gap: 16, padding: "10px 16px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {["Project", "Stage", "Status", "Format", "Score"].map((h) => (
          <span key={h} className="mono" style={{ fontSize: 11, color: C.faint, letterSpacing: "0.04em" }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {PIPELINE_PROJECTS.map((project, i) => {
        const stage = STAGES.find((s) => s.key === project.stage) as Stage;
        const isActive = project.pct !== null;
        const sc = project.score ? (project.score >= 85 ? C.green : project.score >= 70 ? C.accent : C.red) : null;
        return (
          <div key={project.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 120px 80px 64px",
            gap: 16, padding: "12px 16px",
            borderBottom: i < PIPELINE_PROJECTS.length - 1 ? `1px solid ${C.border}` : "none",
            cursor: "pointer", transition: "background 0.2s ease",
            alignItems: "center",
          }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.deeper}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {/* Project */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{project.title}</div>
              {project.client && (
                <span style={{ fontSize: 11, color: C.muted }}>{project.client}</span>
              )}
            </div>

            {/* Stage pill */}
            <div>
              <span className="mono" style={{
                fontSize: 11, fontWeight: 500, color: stage.color,
                padding: "3px 8px", background: `${stage.color}12`,
                borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <div style={{ width: 3, height: 10, borderRadius: 1, background: stage.color }} />
                {stage.label}
              </span>
            </div>

            {/* Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isActive && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%", background: stage.color,
                  animation: "pulse 1.5s ease infinite", display: "inline-block", flexShrink: 0,
                }} />
              )}
              <span style={{ fontSize: 13, color: isActive ? stage.color : C.soft }}>
                {project.status}
                {isActive && <span className="mono" style={{ marginLeft: 6, fontSize: 11 }}>{project.pct}%</span>}
              </span>
            </div>

            {/* Format */}
            <span className="mono" style={{ fontSize: 11, color: C.dim }}>{project.format}</span>

            {/* Score */}
            {sc ? (
              <span className="mono" style={{
                fontSize: 11, fontWeight: 500, color: sc,
                padding: "3px 8px", background: `${sc}12`, borderRadius: 3,
                textAlign: "center",
              }}>{project.score}</span>
            ) : (
              <span className="mono" style={{ fontSize: 11, color: C.faint, textAlign: "center" }}>&mdash;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ATTENTION ROW

function AttentionRow({ item }: { item: AttentionItem }) {
  const typeMap: Record<AttentionType, { label: string; color: string; action: string }> = {
    revision: { label: "Revision", color: C.accent, action: "Review" },
    failed: { label: "Failed", color: C.red, action: "Reconnect" },
    approval: { label: "Awaiting", color: C.muted, action: "Nudge" },
  };
  const t = typeMap[item.type];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "12px 16px", background: C.raised,
      border: `1px solid ${t.color}15`, borderRadius: 8,
      cursor: "pointer", transition: "border-color 0.25s ease",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = `${t.color}30`}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = `${t.color}15`}
    >
      <div style={{
        width: 6, height: 6, borderRadius: 3, background: t.color,
        ...(item.type === "failed" ? { animation: "pulse 1.5s ease infinite" } : {}),
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</span>
          <span className="mono" style={{
            fontSize: 11, color: t.color, fontWeight: 500,
            padding: "2px 8px", background: `${t.color}10`, borderRadius: 3,
          }}>{t.label}</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
          {item.issue}
          <span className="mono" style={{ fontSize: 11, color: C.dim }}>&middot; {item.time}</span>
        </div>
      </div>
      <button style={{
        background: "transparent", border: `1px solid ${C.borderL}`,
        borderRadius: 6, padding: "6px 16px", fontSize: 11, fontWeight: 500,
        color: C.text, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.2s ease",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.color = t.color; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderL; e.currentTarget.style.color = C.text; }}
      >{t.action}</button>
    </div>
  );
}


// PIPELINE CARD — Kanban card

function PipelineCard({ project, stageColor }: { project: PipelineProject; stageColor: string }) {
  const isActive = project.pct !== null;
  const sc = project.score ? (project.score >= 85 ? C.green : project.score >= 70 ? C.accent : C.red) : null;

  return (
    <div style={{
      background: C.deeper, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 12, cursor: "pointer",
      transition: "border-color 0.25s ease",
      position: "relative", overflow: "hidden",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.borderL}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
    >
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${project.pct}%`,
          background: `linear-gradient(90deg, transparent, ${stageColor}08)`,
          borderRight: `1px solid ${stageColor}25`,
          transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "none",
        }} />
      )}

      {/* Color bar */}
      <div style={{
        height: 3, borderRadius: 2, background: project.thumb,
        marginBottom: 10, position: "relative", zIndex: 1,
      }} />

      {/* Title */}
      <div style={{
        fontSize: 13, fontWeight: 500, lineHeight: 1.35,
        marginBottom: 8, position: "relative", zIndex: 1,
        overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>{project.title}</div>

      {/* Status */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", zIndex: 1,
      }}>
        <div className="mono" style={{
          fontSize: 11, color: isActive ? stageColor : C.dim,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {isActive && (
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: stageColor,
              animation: "pulse 1.5s ease infinite", display: "inline-block",
            }} />
          )}
          {project.status}
        </div>
        {sc && (
          <span className="mono" style={{
            fontSize: 11, fontWeight: 500, color: sc,
            padding: "2px 6px", background: `${sc}12`, borderRadius: 3,
          }}>{project.score}</span>
        )}
        {isActive && (
          <span className="mono" style={{ fontSize: 11, color: stageColor, fontWeight: 500 }}>{project.pct}%</span>
        )}
      </div>

      {/* Client + format */}
      <div style={{
        fontSize: 11, color: C.faint, marginTop: 6,
        position: "relative", zIndex: 1,
      }}>
        {project.client && <span style={{ color: C.muted }}>{project.client} &middot; </span>}
        <span className="mono" style={{ fontSize: 11 }}>{project.format}</span>
      </div>
    </div>
  );
}


// GLOBAL CSS

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.55; } }
  @keyframes slideUpFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  ::selection { background: rgba(212,166,82,0.18); color: #ECE9E1; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #282724; border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: #454340; }
`;
