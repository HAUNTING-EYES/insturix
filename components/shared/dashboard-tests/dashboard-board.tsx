"use client";

import React, { useState, useRef } from "react";

/*
  Insturix Dashboard v2 — Production Board

  Three constraints (locked from prior conversation):
  1. Project is the primitive. Everything is a view of projects.
  2. Shows what an operator needs at 9am Monday:
     - Needs attention (top)
     - In flight / pipeline (middle — kanban by stage)
     - Shipped recently (bottom)
     - One action: New project
  3. Content production is a pipeline, not a tool.
     Projects visibly move through stages.

  Design system v1. No product names. Phase verbs only.
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

// Pipeline stages — the kanban columns
const STAGES = [
  { key: "script", label: "Script", color: C.accent },
  { key: "edit", label: "Edit", color: C.red },
  { key: "analyze", label: "Analyze", color: C.purple },
  { key: "thumbnails", label: "Thumbnails", color: C.pink },
  { key: "publish", label: "Publish", color: C.green },
];

// Seed data
const ATTENTION_ITEMS = [
  { id: "a1", title: "Muffynn — Flexiwaist ad", issue: "Client revision requested", type: "revision" as const, time: "2h ago", client: "Muffynn" },
  { id: "a2", title: "Chai Nagri — Monsoon reel", issue: "Publish failed (IG auth expired)", type: "failed" as const, time: "overnight", client: "Chai Nagri" },
  { id: "a3", title: "Starbucks — Reserve intro", issue: "Approval waiting from client", type: "approval" as const, time: "1d", client: "Starbucks" },
];

const PIPELINE_PROJECTS = [
  { id: "p1", title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "AI writing", pct: 45 as number | null, score: null as number | null, format: "9:16 · 0:30", thumb: "linear-gradient(135deg, #25201a, #4a3820)" },
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
  client: string;
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

// MAIN
export function DashboardBoard() {
  const [view, setView] = useState("board");
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        {/* TOPBAR */}
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: C.bg, zIndex: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Insturix</span>
            <div style={{ width: 1, height: 18, background: C.border }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: C.soft }}>Production board</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.deeper, border: `1px solid ${C.borderL}`,
              borderRadius: 8, padding: "0 12px", width: 240,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke={C.muted} strokeWidth="2"/>
                <path d="M16 16l4 4" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input placeholder="Search projects..." style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 13, color: C.text, fontFamily: "inherit", padding: "7px 0",
              }} />
              <span className="mono" style={{ fontSize: 10, color: C.faint }}>&#x2318;K</span>
            </div>

            <span className="mono" style={{ fontSize: 11, color: C.muted }}>840</span>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: `${C.accent}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: C.accent, fontWeight: 500,
            }}>N</div>
          </div>
        </div>

        {/* CONTENT */}
        <div ref={scrollRef} style={{ padding: "24px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>

          {/* HEADER: Stats + Action */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            marginBottom: 32,
          }}>
            <div>
              <h1 style={{
                fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
                margin: "0 0 8px", lineHeight: 1.1,
              }}>Good evening, Nimit.</h1>

              {/* Stat row */}
              <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
                {[
                  { n: "14", label: "Total", color: C.text },
                  { n: "3", label: "Needs attention", color: C.red },
                  { n: "4", label: "In progress", color: C.accent },
                  { n: "2", label: "Ready", color: C.green },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="mono" style={{
                      fontSize: 18, fontWeight: 500, color: s.color,
                      letterSpacing: "-0.03em",
                    }}>{s.n}</span>
                    <span className="mono" style={{ fontSize: 10, color: C.dim }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary action */}
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "9px 24px", borderRadius: 7,
              fontSize: 13, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
              transition: "opacity 0.2s ease",
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
              <span className="mono" style={{
                fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              }}>NEEDS ATTENTION &middot; {ATTENTION_ITEMS.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ATTENTION_ITEMS.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </div>
          </section>

          {/* ZONE 2: PIPELINE / KANBAN */}
          <section style={{ marginBottom: 48 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <span className="mono" style={{
                fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              }}>PIPELINE</span>

              <div style={{ display: "flex", gap: 4 }}>
                {["Board", "List"].map((v) => (
                  <button key={v} onClick={() => setView(v.toLowerCase())} style={{
                    background: view === v.toLowerCase() ? C.well : "transparent",
                    border: "none", borderRadius: 4,
                    padding: "4px 10px", fontSize: 11,
                    fontWeight: view === v.toLowerCase() ? 500 : 400,
                    color: view === v.toLowerCase() ? C.text : C.muted,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{v}</button>
                ))}
              </div>
            </div>

            {/* Kanban columns */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
              gap: 8,
              minHeight: 300,
            }}>
              {STAGES.map((stage) => {
                const projects = PIPELINE_PROJECTS.filter((p) => p.stage === stage.key);
                return (
                  <div key={stage.key} style={{
                    background: C.raised,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                  }}>
                    {/* Column header */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 8px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 3, height: 14, borderRadius: 2,
                          background: stage.color,
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{stage.label}</span>
                      </div>
                      <span className="mono" style={{
                        fontSize: 10, color: C.dim,
                      }}>{projects.length}</span>
                    </div>

                    {/* Cards */}
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
          </section>

          {/* ZONE 3: SHIPPED RECENTLY */}
          <section>
            <span className="mono" style={{
              fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              display: "block", marginBottom: 12,
            }}>SHIPPED THIS WEEK &middot; {SHIPPED.length}</span>

            <div style={{
              background: C.raised,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 80px 60px 80px 80px",
                gap: 16, padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                {["Project", "Score", "Views", "CTR", "Platforms", "Published"].map((h) => (
                  <span key={h} className="mono" style={{
                    fontSize: 10, color: C.faint, letterSpacing: "0.04em",
                  }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              {SHIPPED.map((item, i) => {
                const scoreColor = item.score >= 85 ? C.green : item.score >= 70 ? C.accent : C.red;
                return (
                  <div key={item.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 80px 60px 80px 80px",
                    gap: 16, padding: "12px 16px",
                    borderBottom: i < SHIPPED.length - 1 ? `1px solid ${C.border}` : "none",
                    cursor: "pointer",
                    transition: "background 0.2s ease",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = C.deeper}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
                    <span className="mono" style={{
                      fontSize: 11, fontWeight: 500, color: scoreColor,
                    }}>{item.score}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.soft }}>{item.views}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.soft }}>{item.ctr}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.muted }}>{item.platforms}</span>
                    <span className="mono" style={{ fontSize: 10, color: C.dim }}>{item.published}</span>
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
      padding: "12px 16px",
      background: C.raised,
      border: `1px solid ${t.color}15`,
      borderRadius: 8,
      cursor: "pointer",
      transition: "border-color 0.25s ease",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = `${t.color}30`}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = `${t.color}15`}
    >
      {/* Type indicator */}
      <div style={{
        width: 6, height: 6, borderRadius: 3,
        background: t.color,
        ...(item.type === "failed" ? { animation: "pulse 1.5s ease infinite" } : {}),
        flexShrink: 0,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
          <span className="mono" style={{
            fontSize: 10, color: t.color, fontWeight: 500,
            padding: "2px 7px", background: `${t.color}10`, borderRadius: 3,
          }}>{t.label}</span>
        </div>
        <div style={{
          fontSize: 13, color: C.muted, marginTop: 2,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {item.issue}
          <span className="mono" style={{ fontSize: 10, color: C.faint }}>&middot; {item.time}</span>
        </div>
      </div>

      {/* Action */}
      <button style={{
        background: "transparent",
        border: `1px solid ${C.borderL}`,
        borderRadius: 6, padding: "5px 14px",
        fontSize: 11, fontWeight: 500,
        color: C.text, cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s ease",
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = t.color;
          e.currentTarget.style.color = t.color;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = C.borderL;
          e.currentTarget.style.color = C.text;
        }}
      >{t.action}</button>
    </div>
  );
}


// PIPELINE CARD

function PipelineCard({ project, stageColor }: { project: PipelineProject; stageColor: string }) {
  const isActive = project.pct !== null;
  const scoreColor = project.score !== null ? (project.score >= 85 ? C.green : project.score >= 70 ? C.accent : C.red) : C.dim;

  return (
    <div style={{
      background: C.deeper,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: 12,
      cursor: "pointer",
      transition: "border-color 0.25s ease",
      position: "relative",
      overflow: "hidden",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.borderL}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
    >
      {/* Progress fill */}
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

      {/* Thumbnail bar */}
      <div style={{
        height: 4, borderRadius: 2,
        background: project.thumb,
        marginBottom: 10,
        position: "relative", zIndex: 1,
      }} />

      {/* Title */}
      <div style={{
        fontSize: 13, fontWeight: 500, lineHeight: 1.3,
        marginBottom: 6, position: "relative", zIndex: 1,
        overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>{project.title}</div>

      {/* Meta row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", zIndex: 1,
      }}>
        <div className="mono" style={{
          fontSize: 10,
          color: isActive ? stageColor : C.dim,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {isActive && (
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: stageColor,
              animation: "pulse 1.5s ease infinite",
              display: "inline-block",
            }} />
          )}
          {project.status}
        </div>

        {project.score && (
          <span className="mono" style={{
            fontSize: 10, fontWeight: 500,
            color: scoreColor,
            padding: "2px 6px",
            background: `${scoreColor}12`,
            borderRadius: 3,
          }}>{project.score}</span>
        )}

        {isActive && (
          <span className="mono" style={{
            fontSize: 10, color: stageColor, fontWeight: 500,
          }}>{project.pct}%</span>
        )}
      </div>

      {/* Client + format */}
      <div className="mono" style={{
        fontSize: 10, color: C.faint, marginTop: 6,
        position: "relative", zIndex: 1,
      }}>
        {project.client && <>{project.client} &middot; </>}
        {project.format}
      </div>
    </div>
  );
}


// GLOBAL CSS

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.55; }
  }

  @keyframes slideUpFade {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  ::selection {
    background: rgba(212,166,82,0.18);
    color: #ECE9E1;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #282724; border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: #454340; }
`;
