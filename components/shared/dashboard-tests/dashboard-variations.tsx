"use client";

import React, { useState } from "react";

const C = {
  bg: "#0B0B0A", raised: "#0F0F0E", deeper: "#131312", well: "#1B1A18",
  border: "#1C1B19", borderL: "#282724",
  text: "#ECE9E1", soft: "#B5B2A8", muted: "#7A776E", dim: "#5F5E5A", faint: "#454340",
  accent: "#D4A652", green: "#5EC97E", red: "#D46A5C",
  purple: "#9088D4", pink: "#D088B4", cyan: "#5CB8CC",
};

interface Stage {
  key: string;
  label: string;
  color: string;
}

const STAGES: Stage[] = [
  { key: "script", label: "Script", color: C.accent },
  { key: "edit", label: "Edit", color: C.red },
  { key: "analyze", label: "Analyze", color: C.purple },
  { key: "thumbnails", label: "Thumbnails", color: C.pink },
  { key: "publish", label: "Publish", color: C.green },
];

interface Project {
  id: number;
  title: string;
  client: string | null;
  stage: string;
  status: string;
  pct: number | null;
  score: number | null;
  format: string;
  dur: string;
  thumb: string;
  modified: string;
}

const PROJECTS: Project[] = [
  { id: 1, title: "Summer collection teaser", client: "Muffynn", stage: "script", status: "AI writing", pct: 45, score: null, format: "9:16", dur: "0:30", thumb: "linear-gradient(135deg, #25201a, #4a3820)", modified: "12m ago" },
  { id: 2, title: "Founder story — LinkedIn", client: null, stage: "script", status: "Draft", pct: null, score: null, format: "16:9", dur: "2:00", thumb: "linear-gradient(135deg, #1a2028, #2a3040)", modified: "3h ago" },
  { id: 3, title: "Q1 product launch reel", client: null, stage: "edit", status: "Producing", pct: 64, score: null, format: "16:9", dur: "0:30", thumb: "linear-gradient(135deg, #1a2028, #2a3848)", modified: "just now" },
  { id: 4, title: "Chaayos — Holi campaign v3", client: "Chaayos", stage: "edit", status: "Captions syncing", pct: 78, score: null, format: "1:1", dur: "0:32", thumb: "linear-gradient(135deg, #3d2a14, #5a3820)", modified: "8m ago" },
  { id: 5, title: "Chaayos — Holi campaign v2", client: "Chaayos", stage: "analyze", status: "Scored", pct: null, score: 91, format: "1:1", dur: "0:32", thumb: "linear-gradient(135deg, #3d2a14, #5a3820)", modified: "2h ago" },
  { id: 6, title: "Starbucks reserve intro", client: "Starbucks", stage: "thumbnails", status: "Generating", pct: 38, score: null, format: "16:9", dur: "0:45", thumb: "linear-gradient(135deg, #14251f, #205a38)", modified: "3h ago" },
  { id: 7, title: "Masala mornings explainer", client: "Chai Nagri", stage: "publish", status: "Live · 4 platforms", pct: null, score: 74, format: "9:16", dur: "0:47", thumb: "linear-gradient(135deg, #2a1f2a, #4a2f5a)", modified: "yesterday" },
  { id: 8, title: "Brand anthem 60s", client: null, stage: "publish", status: "Scheduled", pct: null, score: 88, format: "16:9", dur: "1:00", thumb: "linear-gradient(135deg, #1e1828, #3a2a5a)", modified: "4d ago" },
];

interface Alert {
  text: string;
  color: string;
  time: string;
  action: string;
}

const ALERTS: Alert[] = [
  { text: "Muffynn — revision requested", color: C.accent, time: "2h", action: "Review" },
  { text: "Chai Nagri — IG auth expired", color: C.red, time: "6h", action: "Fix" },
  { text: "Starbucks — awaiting approval", color: C.muted, time: "1d", action: "Nudge" },
];

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.55; } }
  ::selection { background: rgba(212,166,82,0.18); color: #ECE9E1; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #282724; border-radius: 2px; }
`;

export function DashboardVariations() {
  const [variant, setVariant] = useState<"split" | "cinematic">("split");

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column",
        background: C.bg, color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased", overflow: "hidden",
      }}>
        {/* Variant switcher */}
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Insturix</span>
            <div style={{ width: 1, height: 16, background: C.border }} />
            <div style={{
              display: "flex", gap: 2, background: C.deeper,
              borderRadius: 6, padding: 2, border: `1px solid ${C.border}`,
            }}>
              {([
                { key: "split" as const, label: "Split view" },
                { key: "cinematic" as const, label: "Cinematic" },
              ]).map((v) => (
                <button key={v.key} onClick={() => setVariant(v.key)} style={{
                  background: variant === v.key ? C.well : "transparent",
                  border: "none", borderRadius: 4, padding: "5px 14px",
                  fontSize: 11, fontWeight: variant === v.key ? 500 : 400,
                  color: variant === v.key ? C.text : C.muted,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{v.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>840</span>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", background: `${C.accent}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: C.accent, fontWeight: 500,
            }}>N</div>
          </div>
        </div>

        {variant === "split" ? <SplitView /> : <CinematicView />}
      </div>
    </>
  );
}


// ═══════════════════════════════════════════════════════════════
// VARIANT A: SPLIT — Two panes, one viewport, no scrolling
// Left = Focus + Alerts (what to DO)
// Right = Pipeline + Shipped (what's HAPPENING)
// ═══════════════════════════════════════════════════════════════

function SplitView() {
  const focus = PROJECTS.find((p) => p.id === 4)!;
  const focusStage = STAGES.find((s) => s.key === focus.stage)!;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* ── LEFT PANE: Action zone ── */}
      <div style={{
        width: "42%", borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Focus */}
        <div style={{ flex: 1, padding: "32px 32px 24px", display: "flex", flexDirection: "column" }}>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Good evening, Nimit</p>
          <h1 style={{
            fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em",
            lineHeight: 1.1, margin: "0 0 32px",
          }}>Pick up where you left off.</h1>

          {/* Focus project */}
          <div style={{
            flex: 1, borderRadius: 12, overflow: "hidden",
            background: focus.thumb, position: "relative",
            display: "flex", flexDirection: "column", justifyContent: "flex-end",
            minHeight: 0,
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(0deg, rgba(11,11,10,0.9) 0%, rgba(11,11,10,0.3) 40%, transparent 70%)",
            }} />
            {/* Play button */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -60%)",
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(11,11,10,0.5)", border: "1px solid rgba(236,233,225,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 2,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={C.text}><path d="M8 5v14l11-7z"/></svg>
            </div>

            <div style={{ position: "relative", zIndex: 2, padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="mono" style={{
                  fontSize: 11, color: focusStage.color, fontWeight: 500,
                  padding: "3px 8px", background: `${focusStage.color}18`, borderRadius: 4,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", background: focusStage.color,
                    animation: "pulse 1.5s ease infinite", display: "inline-block",
                  }} />
                  {focusStage.label} · {focus.pct}%
                </span>
                <span className="mono" style={{ fontSize: 11, color: C.dim }}>{focus.format} · {focus.dur}</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>{focus.title}</h2>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Client deadline tomorrow</p>
              <button style={{
                background: C.accent, color: C.bg, border: "none",
                padding: "9px 20px", borderRadius: 7, fontSize: 11, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}>Continue editing</button>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div style={{ padding: "0 32px 24px", flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            NEEDS ATTENTION · {ALERTS.length}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {ALERTS.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", background: C.raised,
                border: `1px solid ${a.color}12`, borderRadius: 8,
                cursor: "pointer",
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%", background: a.color, flexShrink: 0,
                  ...(a.color === C.red ? { animation: "pulse 1.5s ease infinite" } : {}),
                }} />
                <span style={{ fontSize: 13, color: C.soft, flex: 1 }}>{a.text}</span>
                <span className="mono" style={{ fontSize: 11, color: a.color, cursor: "pointer" }}>{a.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANE: Reference zone ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Pipeline */}
        <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 12,
          }}>
            <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>
              PIPELINE · {PROJECTS.length}
            </span>
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="3" strokeLinecap="round"/>
              </svg>
              New
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {PROJECTS.map((p) => {
              const stage = STAGES.find((s) => s.key === p.stage)!;
              const isActive = p.pct !== null;
              const sc = p.score ? (p.score >= 85 ? C.green : p.score >= 70 ? C.accent : C.red) : null;
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 8,
                  cursor: "pointer", transition: "background 0.2s ease",
                  borderLeft: `3px solid ${stage.color}${isActive ? "" : "40"}`,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.raised)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Thumb dot */}
                  <div style={{
                    width: 36, height: 28, borderRadius: 4,
                    background: p.thumb, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: C.dim, display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ color: stage.color }}>{stage.label}</span>
                      <span style={{ color: C.faint }}>·</span>
                      <span>{p.client || "Personal"}</span>
                    </div>
                  </div>
                  {/* Right side */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {isActive && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%", background: stage.color,
                          animation: "pulse 1.5s ease infinite",
                        }} />
                        <span className="mono" style={{ fontSize: 11, color: stage.color }}>{p.pct}%</span>
                      </div>
                    )}
                    {sc && (
                      <span className="mono" style={{
                        fontSize: 11, fontWeight: 500, color: sc,
                        padding: "2px 6px", background: `${sc}12`, borderRadius: 3,
                      }}>{p.score}</span>
                    )}
                    <span className="mono" style={{ fontSize: 11, color: C.faint }}>{p.modified}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shipped strip */}
        <div style={{
          padding: "12px 32px 16px", borderTop: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            SHIPPED THIS WEEK
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { title: "Holi v1", score: 87, stat: "12.4K views" },
              { title: "Masala cut 1", score: 71, stat: "3.1K views" },
              { title: "Chai cup ad", score: 58, stat: "890 views" },
            ].map((s, i) => {
              const sc = s.score >= 85 ? C.green : s.score >= 70 ? C.accent : C.red;
              return (
                <div key={i} style={{
                  flex: 1, padding: "10px 12px",
                  background: C.raised, border: `1px solid ${C.border}`,
                  borderRadius: 8, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
                    <span className="mono" style={{ fontSize: 11, color: C.dim }}>{s.stat}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: sc }}>{s.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// VARIANT B: CINEMATIC — Big visual cards, horizontal pipeline
// Feels like browsing a portfolio, not managing tasks
// ═══════════════════════════════════════════════════════════════

function CinematicView() {
  const [selected, setSelected] = useState(4);
  const sel = PROJECTS.find((p) => p.id === selected);
  const selStage = sel ? STAGES.find((s) => s.key === sel.stage) : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Main: selected project hero ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Background */}
        <div style={{
          position: "absolute", inset: 0,
          background: sel?.thumb || C.bg,
          transition: "background 0.5s ease",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg, #0B0B0A 0%, rgba(11,11,10,0.85) 30%, rgba(11,11,10,0.6) 60%, rgba(11,11,10,0.4) 100%)",
        }} />

        {/* Content overlay */}
        <div style={{
          position: "relative", zIndex: 2,
          height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "flex-end", padding: "0 48px 24px",
        }}>
          {/* Stats bar */}
          <div style={{
            position: "absolute", top: 24, left: 48, right: 48,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", gap: 24 }}>
              {[
                { n: "8", label: "In pipeline" },
                { n: "3", label: "Need attention" },
                { n: "3", label: "Shipped" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>{s.n}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{s.label}</span>
                </div>
              ))}
            </div>
            <button style={{
              background: C.accent, color: C.bg, border: "none",
              padding: "8px 20px", borderRadius: 7, fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="3" strokeLinecap="round"/>
              </svg>
              New project
            </button>
          </div>

          {/* Selected project info */}
          {sel && selStage && (
            <div style={{ maxWidth: 500, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="mono" style={{
                  fontSize: 11, color: selStage.color, fontWeight: 500,
                  padding: "3px 8px", background: `${selStage.color}20`, borderRadius: 4,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {sel.pct !== null && (
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%", background: selStage.color,
                      animation: "pulse 1.5s ease infinite", display: "inline-block",
                    }} />
                  )}
                  {selStage.label}
                  {sel.pct !== null && ` · ${sel.pct}%`}
                </span>
                {sel.score && (() => {
                  const sc = sel.score >= 85 ? C.green : sel.score >= 70 ? C.accent : C.red;
                  return (
                    <span className="mono" style={{
                      fontSize: 11, fontWeight: 500, color: sc,
                      padding: "3px 8px", background: `${sc}15`, borderRadius: 4,
                    }}>{sel.score}/100</span>
                  );
                })()}
              </div>
              <h1 style={{
                fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em",
                lineHeight: 1.1, marginBottom: 6,
              }}>{sel.title}</h1>
              <div style={{ fontSize: 13, color: C.muted, display: "flex", gap: 12, marginBottom: 20 }}>
                <span>{sel.client || "Personal"}</span>
                <span style={{ color: C.faint }}>·</span>
                <span className="mono" style={{ fontSize: 11 }}>{sel.format} · {sel.dur}</span>
                <span style={{ color: C.faint }}>·</span>
                <span>{sel.modified}</span>
              </div>
              <button style={{
                background: C.accent, color: C.bg, border: "none",
                padding: "10px 28px", borderRadius: 7, fontSize: 13, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {sel.pct !== null ? "Continue" : sel.score ? "View report" : "Open"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: Horizontal project strip ── */}
      <div style={{
        flexShrink: 0, padding: "16px 48px 20px",
        borderTop: `1px solid ${C.border}`,
        background: C.bg,
      }}>
        <div style={{
          display: "flex", gap: 8, overflowX: "auto",
          paddingBottom: 4,
        }}>
          {PROJECTS.map((p) => {
            const stage = STAGES.find((s) => s.key === p.stage)!;
            const isActive = p.pct !== null;
            const isSel = selected === p.id;
            const sc = p.score ? (p.score >= 85 ? C.green : p.score >= 70 ? C.accent : C.red) : null;

            return (
              <div
                key={p.id}
                onClick={() => setSelected(p.id)}
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
                {/* Thumb */}
                <div style={{
                  height: 48, background: p.thumb, position: "relative",
                }}>
                  {/* Stage color line */}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0,
                    width: isActive ? `${p.pct}%` : "100%",
                    height: 2,
                    background: stage.color,
                    opacity: isActive ? 1 : 0.25,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, marginBottom: 4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p.title}</div>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isActive && (
                        <span style={{
                          width: 4, height: 4, borderRadius: "50%", background: stage.color,
                          animation: "pulse 1.5s ease infinite",
                        }} />
                      )}
                      <span className="mono" style={{
                        fontSize: 11, color: isActive ? stage.color : C.dim,
                      }}>{stage.label}</span>
                    </div>
                    {sc && (
                      <span className="mono" style={{ fontSize: 11, color: sc, fontWeight: 500 }}>{p.score}</span>
                    )}
                    {isActive && (
                      <span className="mono" style={{ fontSize: 11, color: stage.color }}>{p.pct}%</span>
                    )}
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
