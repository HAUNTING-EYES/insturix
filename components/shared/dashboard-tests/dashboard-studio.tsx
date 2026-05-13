"use client";

import React, { useState, useEffect } from "react";

/*
  Insturix Dashboard — "Studio" variation

  Concept: You walk into your studio in the morning.
  What's on the desk? What needs your hands?

  Not a project management board. A creative command post.

  Key differences:
  - Hero "focus" area: the ONE thing that matters most right now, shown big
  - Horizontal pipeline strip, not kanban columns
  - More atmosphere, more breathing room
  - "Silence does the work" — black space is a feature
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

const FOCUS_PROJECT = {
  title: "Chaayos — Holi campaign v3",
  client: "Chaayos",
  stage: "edit",
  status: "Captions syncing",
  pct: 78,
  format: "1:1 · 0:32",
  thumb: "linear-gradient(135deg, #2a1a0e 0%, #5a3820 40%, #3d2a14 100%)",
  reason: "Highest priority — client deadline tomorrow",
  metrics: [
    { label: "Cuts", value: "14", note: "beat-locked" },
    { label: "Duration", value: "0:32", note: "target hit" },
    { label: "Captions", value: "78%", note: "syncing" },
  ],
};

interface PipelineProject {
  id: number;
  title: string;
  client: string | null;
  stage: string;
  status: string;
  pct: number | null;
  score?: number;
  thumb: string;
}

const PIPELINE: PipelineProject[] = [
  { id: 1, title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "AI writing", pct: 45, thumb: "linear-gradient(135deg, #25201a, #4a3820)" },
  { id: 2, title: "Founder story", client: null, stage: "script", status: "Draft", pct: null, thumb: "linear-gradient(135deg, #1a2028, #2a3040)" },
  { id: 3, title: "Q1 launch reel", client: null, stage: "edit", status: "Producing", pct: 64, thumb: "linear-gradient(135deg, #1a2028, #2a3848)" },
  { id: 4, title: "Holi v2", client: "Chaayos", stage: "analyze", status: "Scored", pct: null, score: 91, thumb: "linear-gradient(135deg, #3d2a14, #5a3820)" },
  { id: 5, title: "Starbucks intro", client: "Starbucks", stage: "thumbnails", status: "Generating", pct: 38, thumb: "linear-gradient(135deg, #14251f, #205a38)" },
  { id: 6, title: "Masala mornings", client: "Chai Nagri", stage: "publish", status: "Live", pct: null, score: 74, thumb: "linear-gradient(135deg, #2a1f2a, #4a2f5a)" },
  { id: 7, title: "Brand anthem", client: null, stage: "publish", status: "Scheduled", pct: null, score: 88, thumb: "linear-gradient(135deg, #1e1828, #3a2a5a)" },
];

const ALERTS = [
  { text: "Muffynn — client revision requested", color: C.accent, time: "2h" },
  { text: "Chai Nagri — IG publish failed", color: C.red, time: "6h" },
  { text: "Starbucks — awaiting approval", color: C.muted, time: "1d" },
];

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.55; } }
  ::selection { background: rgba(212,166,82,0.18); color: #ECE9E1; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #282724; border-radius: 2px; }
`;

export function DashboardStudio() {
  const [hoveredProject, setHoveredProject] = useState<number | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setTime(h < 12 ? "morning" : h < 17 ? "afternoon" : "evening");
  }, []);

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        {/* ═══ TOPBAR ═══ */}
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 48px", borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Insturix</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>840 credits</span>
            <div style={{ width: 1, height: 16, background: C.border }} />
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "7px 18px", borderRadius: 7, fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              New project
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}>

          {/* ═══ HERO ZONE — The one thing that matters ═══ */}
          <section style={{ padding: "64px 0 48px" }}>
            <div style={{ marginBottom: 48 }}>
              <p style={{ fontSize: 14, color: C.muted, marginBottom: 8 }}>
                Good {time}, Nimit
              </p>
              <h1 style={{
                fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em",
                lineHeight: 1.1, margin: 0,
              }}>
                Pick up where you left off.
              </h1>
            </div>

            {/* Focus card — the big one */}
            <div style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr",
              gap: 0, borderRadius: 12, overflow: "hidden",
              border: `1px solid ${C.border}`,
              cursor: "pointer",
              transition: "border-color 0.3s ease",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${C.accent}30`)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
            >
              {/* Preview */}
              <div style={{
                background: FOCUS_PROJECT.thumb,
                position: "relative", minHeight: 260,
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
              }}>
                {/* Vignette */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(0deg, rgba(11,11,10,0.8) 0%, transparent 50%)",
                  pointerEvents: "none",
                }} />

                {/* Playhead */}
                <div style={{
                  position: "relative", zIndex: 2,
                  padding: "0 24px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(11,11,10,0.6)", border: "1px solid rgba(236,233,225,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={C.text}>
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 2,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: "78%", height: "100%", background: C.accent,
                          borderRadius: 2, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "rgba(236,233,225,0.5)" }}>0:32</span>
                  </div>
                </div>
              </div>

              {/* Info panel */}
              <div style={{
                background: C.raised, padding: "28px 32px",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
              }}>
                <div>
                  {/* Stage + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span className="mono" style={{
                      fontSize: 11, color: C.red, fontWeight: 500,
                      padding: "3px 8px", background: `${C.red}12`, borderRadius: 4,
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%", background: C.red,
                        animation: "pulse 1.5s ease infinite", display: "inline-block",
                      }} />
                      Edit · {FOCUS_PROJECT.pct}%
                    </span>
                  </div>

                  {/* Title */}
                  <h2 style={{
                    fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
                    lineHeight: 1.15, marginBottom: 6,
                  }}>{FOCUS_PROJECT.title}</h2>
                  <p style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
                    {FOCUS_PROJECT.reason}
                  </p>

                  {/* Inline metrics */}
                  <div style={{ display: "flex", gap: 24 }}>
                    {FOCUS_PROJECT.metrics.map((m, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <span className="mono" style={{
                            fontSize: 18, fontWeight: 500, color: C.text,
                            letterSpacing: "-0.03em",
                          }}>{m.value}</span>
                        </div>
                        <span style={{ fontSize: 11, color: C.dim }}>{m.label} · {m.note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action */}
                <div style={{ marginTop: 24 }}>
                  <button style={{
                    background: C.accent, color: C.bg, border: "none",
                    padding: "10px 24px", borderRadius: 7, fontSize: 13, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit", width: "100%",
                    transition: "opacity 0.2s ease",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >Continue editing</button>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ ALERTS STRIP ═══ */}
          {ALERTS.length > 0 && (
            <section style={{ paddingBottom: 48 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {ALERTS.map((a, i) => (
                  <div key={i} style={{
                    flex: 1, padding: "12px 16px",
                    background: C.raised, border: `1px solid ${a.color}12`,
                    borderRadius: 8, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12,
                    transition: "border-color 0.25s ease",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${a.color}30`)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${a.color}12`)}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: 3, background: a.color,
                      flexShrink: 0,
                      ...(a.color === C.red ? { animation: "pulse 1.5s ease infinite" } : {}),
                    }} />
                    <span style={{ fontSize: 13, color: C.soft, flex: 1 }}>{a.text}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.dim }}>{a.time}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ═══ PIPELINE — Horizontal scroll strip ═══ */}
          <section style={{ paddingBottom: 48 }}>
            {/* Stage tabs */}
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              marginBottom: 16,
            }}>
              <span className="mono" style={{
                fontSize: 11, color: C.dim, letterSpacing: "0.06em",
                marginRight: 12,
              }}>PIPELINE</span>
              {STAGES.map((s) => {
                const count = PIPELINE.filter((p) => p.stage === s.key).length;
                return (
                  <button key={s.key} style={{
                    background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 4, padding: "4px 12px",
                    fontSize: 11, fontWeight: 500, color: C.muted,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.2s ease",
                  }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = s.color;
                      e.currentTarget.style.color = s.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = C.border;
                      e.currentTarget.style.color = C.muted;
                    }}
                  >
                    <div style={{ width: 3, height: 10, borderRadius: 1, background: s.color, opacity: 0.6 }} />
                    {s.label}
                    <span className="mono" style={{ fontSize: 11, color: C.dim }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Cards strip */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}>
              {PIPELINE.map((p) => {
                const stage = STAGES.find((s) => s.key === p.stage);
                const isActive = p.pct !== null;
                const sc = p.score ? (p.score >= 85 ? C.green : p.score >= 70 ? C.accent : C.red) : null;
                const isHovered = hoveredProject === p.id;

                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoveredProject(p.id)}
                    onMouseLeave={() => setHoveredProject(null)}
                    style={{
                      background: C.raised,
                      border: `1px solid ${isHovered ? C.borderL : C.border}`,
                      borderRadius: 12, overflow: "hidden",
                      cursor: "pointer",
                      transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                      transform: isHovered ? "translateY(-2px)" : "none",
                    }}
                  >
                    {/* Thumb */}
                    <div style={{
                      height: 56, background: p.thumb,
                      position: "relative",
                    }}>
                      {/* Stage indicator */}
                      <div style={{
                        position: "absolute", bottom: -1, left: 0, right: 0,
                        height: 2, background: C.border,
                      }}>
                        {isActive && stage && (
                          <div style={{
                            height: "100%", width: `${p.pct}%`,
                            background: stage.color,
                            transition: "width 0.5s ease",
                          }} />
                        )}
                        {!isActive && (
                          <div style={{
                            height: "100%", width: "100%",
                            background: sc || stage?.color,
                            opacity: 0.3,
                          }} />
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{
                        fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                        marginBottom: 8,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{p.title}</div>

                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 5,
                        }}>
                          {isActive && stage && (
                            <span style={{
                              width: 5, height: 5, borderRadius: "50%", background: stage.color,
                              animation: "pulse 1.5s ease infinite", display: "inline-block",
                            }} />
                          )}
                          <span className="mono" style={{
                            fontSize: 11, color: isActive && stage ? stage.color : C.dim,
                          }}>{p.status}</span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {sc && (
                            <span className="mono" style={{
                              fontSize: 11, fontWeight: 500, color: sc,
                              padding: "2px 6px", background: `${sc}12`, borderRadius: 3,
                            }}>{p.score}</span>
                          )}
                          {isActive && stage && (
                            <span className="mono" style={{ fontSize: 11, color: stage.color, fontWeight: 500 }}>{p.pct}%</span>
                          )}
                        </div>
                      </div>

                      {p.client && (
                        <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{p.client}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ═══ SHIPPED — Compact ═══ */}
          <section style={{ paddingBottom: 64 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16,
            }}>
              <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>
                SHIPPED THIS WEEK
              </span>
              <button className="mono" style={{
                background: "transparent", border: "none",
                fontSize: 11, color: C.accent, cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}>View all →</button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {[
                { title: "Chaayos — Holi v1", score: 87, views: "12.4K", ctr: "4.2%", days: "3d", platforms: "6 platforms" },
                { title: "Masala mornings — cut 1", score: 71, views: "3.1K", ctr: "2.8%", days: "5d", platforms: "4 platforms" },
                { title: "Chai cup product ad", score: 58, views: "890", ctr: "1.4%", days: "7d", platforms: "2 platforms" },
              ].map((item, i) => {
                const sc = item.score >= 85 ? C.green : item.score >= 70 ? C.accent : C.red;
                return (
                  <div key={i} style={{
                    flex: 1, padding: "16px 20px",
                    background: C.raised, border: `1px solid ${C.border}`,
                    borderRadius: 12, cursor: "pointer",
                    transition: "border-color 0.25s ease",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.borderL)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 12,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
                      <span className="mono" style={{
                        fontSize: 14, fontWeight: 500, color: sc,
                        letterSpacing: "-0.03em",
                      }}>{item.score}</span>
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      {[
                        { label: "Views", value: item.views },
                        { label: "CTR", value: item.ctr },
                        { label: "Reach", value: item.platforms },
                      ].map((m, j) => (
                        <div key={j}>
                          <div className="mono" style={{ fontSize: 11, color: C.soft }}>{m.value}</div>
                          <div style={{ fontSize: 11, color: C.dim }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
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
