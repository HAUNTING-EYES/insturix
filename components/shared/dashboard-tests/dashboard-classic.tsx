"use client";

import React, { useState } from "react";

/*
  Insturix Dashboard — Apr 2026
  The hub. Everything starts here.

  Rules applied:
  - NO PRODUCT NAMES. Phase verbs only: Script, Edit, Analyze, Thumbnails, Music, Publish, Share.
  - Design system v1: warm editorial dark, #0B0B0A canvas, gold for decisions only.
  - Plus Jakarta Sans body, JetBrains Mono for system labels.
  - Weights: 400/500/800 only. Never 600/700.
  - No zinc grays, no blue accent, no gradients, no backdrop-blur, no shadows.
  - Spacing: 4/8/12/16/24/32/48/64 only.
  - Radius: 4 tag, 7-8 button, 12 card.
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

// Phase vocabulary — the ONLY labels users ever see
const PHASES = [
  { label: "Script", icon: "doc" as const, color: C.accent, desc: "Write" },
  { label: "Edit", icon: "cut" as const, color: C.red, desc: "Produce" },
  { label: "Analyze", icon: "eye" as const, color: C.purple, desc: "Score" },
  { label: "Thumbnails", icon: "grid" as const, color: C.pink, desc: "Visuals" },
  { label: "Music", icon: "note" as const, color: C.pink, desc: "Sound" },
  { label: "Publish", icon: "send" as const, color: C.green, desc: "Distribute" },
  { label: "Share", icon: "link" as const, color: C.cyan, desc: "Identity" },
];

const BOTTOM_NAV = [
  { label: "Team", icon: "users" as const },
  { label: "Settings", icon: "gear" as const },
  { label: "Billing", icon: "card" as const },
];

// Seed data
const PROJECTS = [
  { id: 1, title: "Chaayos Holi campaign", client: "Chaayos", phase: "Analyze", score: 91, status: "scored" as const, modified: "2h ago", thumb: "linear-gradient(135deg, #3d2a14, #5a3820)" },
  { id: 2, title: "Q1 product launch reel", client: null, phase: "Edit", score: null, status: "producing" as const, modified: "just now", thumb: "linear-gradient(135deg, #1a2028, #2a3848)" },
  { id: 3, title: "Masala mornings explainer", client: "Chai Nagri", phase: "Publish", score: 74, status: "published" as const, modified: "yesterday", thumb: "linear-gradient(135deg, #2a1f2a, #4a2f5a)" },
  { id: 4, title: "Starbucks reserve intro", client: "Starbucks", phase: "Thumbnails", score: null, status: "generating" as const, modified: "3h ago", thumb: "linear-gradient(135deg, #14251f, #205a38)" },
  { id: 5, title: "Summer collection teaser", client: "Muffynn", phase: "Script", score: null, status: "drafting" as const, modified: "1d ago", thumb: "linear-gradient(135deg, #25201a, #4a3820)" },
  { id: 6, title: "Brand anthem 60s", client: null, phase: "Music", score: null, status: "composing" as const, modified: "4d ago", thumb: "linear-gradient(135deg, #1e1828, #3a2a5a)" },
];

const ACTIVITY = [
  { text: "Chaayos Holi scored 91/100", time: "2h ago", color: C.green },
  { text: "Q1 launch reel — captions synced", time: "12m ago", color: C.accent },
  { text: "Starbucks thumbnails generating", time: "3h ago", color: C.pink },
  { text: "Masala mornings published to 4 platforms", time: "yesterday", color: C.cyan },
];

type ProjectStatus = "scored" | "published" | "producing" | "generating" | "composing" | "drafting";
type PhaseIconName = "doc" | "cut" | "eye" | "grid" | "note" | "send" | "link";
type BottomIconName = "users" | "gear" | "card";

interface Project {
  id: number;
  title: string;
  client: string | null;
  phase: string;
  score: number | null;
  status: ProjectStatus;
  modified: string;
  thumb: string;
}

export function DashboardClassic() {
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [sidebarHover, setSidebarHover] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const filteredProjects = activePhase
    ? PROJECTS.filter((p) => p.phase === activePhase)
    : PROJECTS;

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{
        display: "flex",
        height: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflow: "hidden",
      }}>

        {/* SIDEBAR */}
        <aside
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          style={{
            width: sidebarHover ? 200 : 64,
            background: C.raised,
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            transition: "width 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            overflow: "hidden",
            zIndex: 10,
          }}
        >
          {/* Logo */}
          <div style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: `1px solid ${C.border}`,
            gap: 12,
            flexShrink: 0,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `${C.accent}12`,
              border: `1px solid ${C.accent}20`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L19 7" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{
              fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              opacity: sidebarHover ? 1 : 0,
              transition: "opacity 0.25s ease",
            }}>Insturix</span>
          </div>

          {/* New project button */}
          <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
            <button style={{
              width: "100%",
              background: C.accent,
              color: C.bg,
              border: "none",
              borderRadius: 7,
              padding: sidebarHover ? "9px 16px" : "9px 0",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.25s ease",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 5v14m-7-7h14" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span style={{
                opacity: sidebarHover ? 1 : 0,
                transition: "opacity 0.2s ease",
                whiteSpace: "nowrap",
              }}>New project</span>
            </button>
          </div>

          {/* Phase nav */}
          <div style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            <div className="mono" style={{
              fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              padding: "8px 8px 4px",
              opacity: sidebarHover ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}>PHASES</div>

            {PHASES.map((p) => {
              const isActive = activePhase === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => setActivePhase(isActive ? null : p.label)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 8px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? C.well : "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: isActive ? C.text : C.muted,
                    transition: "all 0.25s ease",
                    width: "100%",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = C.deeper;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isActive ? `${p.color}15` : "transparent",
                    border: `1px solid ${isActive ? `${p.color}25` : C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.25s ease",
                  }}>
                    <PhaseIcon name={p.icon} color={isActive ? p.color : C.dim} size={14} />
                  </div>
                  <div style={{
                    opacity: sidebarHover ? 1 : 0,
                    transition: "opacity 0.2s ease",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>{p.label}</div>
                    <div className="mono" style={{ fontSize: 10, color: C.dim }}>{p.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom nav */}
          <div style={{
            padding: "8px 8px 12px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            flexShrink: 0,
          }}>
            {BOTTOM_NAV.map((item) => (
              <button
                key={item.label}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 8px", borderRadius: 8,
                  border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: "inherit",
                  color: C.muted, width: "100%", textAlign: "left",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = C.text;
                  e.currentTarget.style.background = C.deeper;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = C.muted;
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <BottomIcon name={item.icon} />
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 400,
                  opacity: sidebarHover ? 1 : 0,
                  transition: "opacity 0.2s ease",
                  whiteSpace: "nowrap",
                }}>{item.label}</span>
              </button>
            ))}

            {/* Avatar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 8px", marginTop: 4,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: `${C.accent}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: C.accent, fontWeight: 500,
                flexShrink: 0,
              }}>N</div>
              <div style={{
                opacity: sidebarHover ? 1 : 0,
                transition: "opacity 0.2s ease",
                whiteSpace: "nowrap",
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Nimit</div>
                <div className="mono" style={{ fontSize: 10, color: C.dim }}>840 credits</div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* TOPBAR */}
          <div style={{
            height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 32px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <h1 style={{
                fontSize: 14, fontWeight: 500, margin: 0,
                color: activePhase ? C.text : C.soft,
              }}>
                {activePhase ? activePhase : "All projects"}
              </h1>
              {activePhase && (
                <button
                  onClick={() => setActivePhase(null)}
                  className="mono"
                  style={{
                    fontSize: 10, color: C.dim, background: "transparent",
                    border: `1px solid ${C.border}`, borderRadius: 4,
                    padding: "3px 8px", cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >clear</button>
              )}
            </div>

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.deeper,
              border: `1px solid ${searchFocused ? `${C.accent}40` : C.borderL}`,
              borderRadius: 8, padding: "0 12px",
              transition: "border-color 0.2s ease",
              width: 280,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke={C.muted} strokeWidth="2"/>
                <path d="M16 16l4 4" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                placeholder="Search projects..."
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 13, color: C.text, fontFamily: "inherit",
                  padding: "8px 0",
                }}
              />
              <span className="mono" style={{ fontSize: 10, color: C.faint }}>&#x2318;K</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="mono" style={{ fontSize: 11, color: C.muted }}>840</span>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `${C.accent}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: C.accent, fontWeight: 500,
              }}>N</div>
            </div>
          </div>

          {/* SCROLLABLE CONTENT */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 32px 64px" }}>

            {/* Welcome + stats strip */}
            <div style={{
              display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              marginBottom: 32,
            }}>
              <div>
                <h2 style={{
                  fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
                  margin: "0 0 4px", lineHeight: 1.15,
                }}>
                  Good evening, Nimit.
                </h2>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
                  {PROJECTS.filter(p => p.status === "producing" || p.status === "generating" || p.status === "composing").length} projects in progress
                </p>
              </div>

              {/* Compact stats */}
              <div style={{ display: "flex", gap: 24 }}>
                {[
                  { label: "This week", value: "12", sub: "videos" },
                  { label: "Avg score", value: "83", sub: "/100" },
                  { label: "Published", value: "47", sub: "total" },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3 }}>
                      <span className="mono" style={{ fontSize: 18, fontWeight: 500, color: C.text, letterSpacing: "-0.03em" }}>
                        {stat.value}
                      </span>
                      <span className="mono" style={{ fontSize: 10, color: C.dim }}>
                        {stat.sub}
                      </span>
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: C.faint, letterSpacing: "0.04em" }}>
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* In-progress strip */}
            <InProgressStrip />

            {/* Projects grid */}
            <div style={{ marginTop: 32 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 16,
              }}>
                <span className="mono" style={{
                  fontSize: 10, color: C.dim, letterSpacing: "0.08em",
                }}>
                  PROJECTS &middot; {filteredProjects.length}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {["All", "Active", "Published", "Draft"].map((tab, i) => (
                    <button key={tab} style={{
                      background: i === 0 ? C.well : "transparent",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: i === 0 ? 500 : 400,
                      color: i === 0 ? C.text : C.muted,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s ease",
                    }}>{tab}</button>
                  ))}
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 12,
              }}>
                {/* New project card */}
                <button style={{
                  background: "transparent",
                  border: `1px dashed ${C.borderL}`,
                  borderRadius: 12,
                  padding: 32,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: C.muted,
                  minHeight: 180,
                  transition: "all 0.25s ease",
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.accent;
                    e.currentTarget.style.color = C.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.borderL;
                    e.currentTarget.style.color = C.muted;
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    border: `1px solid ${C.borderL}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>New project</span>
                  <span className="mono" style={{ fontSize: 10, color: C.dim }}>
                    Start from a prompt or upload footage
                  </span>
                </button>

                {filteredProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>

            {/* Activity feed */}
            <div style={{ marginTop: 48 }}>
              <span className="mono" style={{
                fontSize: 10, color: C.dim, letterSpacing: "0.08em",
                display: "block", marginBottom: 16,
              }}>
                ACTIVITY
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {ACTIVITY.map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    transition: "background 0.2s ease",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = C.raised}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: item.color, flexShrink: 0, opacity: 0.7,
                    }} />
                    <span style={{ fontSize: 13, color: C.soft, flex: 1 }}>{item.text}</span>
                    <span className="mono" style={{ fontSize: 10, color: C.faint }}>{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


// IN-PROGRESS STRIP

function InProgressStrip() {
  const active = PROJECTS.filter(
    (p) => p.status === "producing" || p.status === "generating" || p.status === "composing" || p.status === "drafting"
  );
  if (active.length === 0) return null;

  return (
    <div style={{
      display: "flex", gap: 8,
      animation: "fadeIn 0.4s ease",
    }}>
      {active.map((p) => {
        const phase = PHASES.find((ph) => ph.label === p.phase);
        const color = phase?.color || C.accent;
        return (
          <div key={p.id} style={{
            flex: 1,
            background: C.raised,
            border: `1px solid ${color}18`,
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
            transition: "border-color 0.25s ease",
            position: "relative",
            overflow: "hidden",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = `${color}35`}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = `${color}18`}
          >
            {/* Progress bar behind */}
            <div style={{
              position: "absolute", top: 0, left: 0, bottom: 0,
              width: "60%",
              background: `linear-gradient(90deg, transparent, ${color}08)`,
              pointerEvents: "none",
            }} />

            <div style={{
              width: 6, height: 6, borderRadius: 3,
              background: color,
              animation: "pulse 1.5s ease infinite",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }} />
            <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 500, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.title}</div>
              <div className="mono" style={{ fontSize: 10, color, marginTop: 2 }}>
                {p.status === "producing" ? "Producing video" :
                 p.status === "generating" ? "Generating thumbnails" :
                 p.status === "composing" ? "Composing music" :
                 "Writing script"}
              </div>
            </div>
            <span className="mono" style={{
              fontSize: 10, color, fontWeight: 500,
              position: "relative", zIndex: 1,
            }}>
              {p.status === "producing" ? "64%" :
               p.status === "generating" ? "38%" :
               p.status === "composing" ? "72%" : "45%"}
            </span>
          </div>
        );
      })}
    </div>
  );
}


// PROJECT CARD

function ProjectCard({ project }: { project: Project }) {
  const phase = PHASES.find((p) => p.label === project.phase);
  const color = phase?.color || C.accent;
  const isActive = project.status === "producing" || project.status === "generating" || project.status === "composing" || project.status === "drafting";
  const scoreColor = project.score !== null ? (project.score >= 85 ? C.green : project.score >= 70 ? C.accent : C.red) : C.dim;

  return (
    <div style={{
      background: C.raised,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      overflow: "hidden",
      cursor: "pointer",
      transition: "border-color 0.25s ease",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.borderL}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
    >
      {/* Thumbnail */}
      <div style={{
        height: 120,
        background: project.thumb,
        position: "relative",
      }}>
        {/* Phase pill */}
        <div style={{
          position: "absolute", top: 12, left: 12,
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(11,11,10,0.7)",
          padding: "4px 10px",
          borderRadius: 4,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: color,
            ...(isActive ? { animation: "pulse 1.5s ease infinite" } : {}),
          }} />
          <span className="mono" style={{ fontSize: 10, color, fontWeight: 500 }}>
            {project.phase}
          </span>
        </div>

        {/* Score pill */}
        {project.score && (
          <div style={{
            position: "absolute", top: 12, right: 12,
          }}>
            <span className="mono" style={{
              fontSize: 11, fontWeight: 500,
              color: scoreColor,
              padding: "3px 9px",
              background: `${scoreColor}14`,
              borderRadius: 3,
            }}>
              {project.score}
            </span>
          </div>
        )}

        {/* Play affordance */}
        {!isActive && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0,
            transition: "opacity 0.2s ease",
          }}
            className="card-play"
          >
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(11,11,10,0.6)",
              border: `1px solid rgba(236,233,225,0.2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={C.text}>
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{
          fontSize: 14, fontWeight: 500, lineHeight: 1.3,
          marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{project.title}</div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div className="mono" style={{ fontSize: 10, color: C.dim, display: "flex", alignItems: "center", gap: 6 }}>
            {project.client && (
              <>
                <span style={{ color: C.muted }}>{project.client}</span>
                <span style={{ color: C.faint }}>&middot;</span>
              </>
            )}
            <span>{project.modified}</span>
          </div>

          <StatusPill status={project.status} />
        </div>
      </div>
    </div>
  );
}


// STATUS PILL

function StatusPill({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { label: string; color: string }> = {
    scored: { label: "Scored", color: C.green },
    published: { label: "Published", color: C.cyan },
    producing: { label: "In progress", color: C.accent },
    generating: { label: "In progress", color: C.pink },
    composing: { label: "In progress", color: C.pink },
    drafting: { label: "Draft", color: C.dim },
  };
  const s = map[status] || { label: status, color: C.dim };
  return (
    <span className="mono" style={{
      fontSize: 10, fontWeight: 500,
      color: s.color,
      padding: "2px 7px",
      background: `${s.color}10`,
      borderRadius: 3,
    }}>{s.label}</span>
  );
}


// ICONS

function PhaseIcon({ name, color, size = 14 }: { name: PhaseIconName; color: string; size?: number }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "doc" && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...s}/><polyline points="14 2 14 8 20 8" {...s}/><line x1="16" y1="13" x2="8" y2="13" {...s}/><line x1="16" y1="17" x2="8" y2="17" {...s}/></>}
      {name === "cut" && <><circle cx="6" cy="6" r="3" {...s}/><circle cx="6" cy="18" r="3" {...s}/><line x1="20" y1="4" x2="8.12" y2="15.88" {...s}/><line x1="14.47" y1="14.48" x2="20" y2="20" {...s}/><line x1="8.12" y1="8.12" x2="12" y2="12" {...s}/></>}
      {name === "eye" && <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...s}/><circle cx="12" cy="12" r="3" {...s}/></>}
      {name === "grid" && <><rect x="3" y="3" width="7" height="7" {...s}/><rect x="14" y="3" width="7" height="7" {...s}/><rect x="14" y="14" width="7" height="7" {...s}/><rect x="3" y="14" width="7" height="7" {...s}/></>}
      {name === "note" && <><path d="M9 18V5l12-2v13" {...s}/><circle cx="6" cy="18" r="3" {...s}/><circle cx="18" cy="16" r="3" {...s}/></>}
      {name === "send" && <><line x1="22" y1="2" x2="11" y2="13" {...s}/><polygon points="22 2 15 22 11 13 2 9 22 2" {...s}/></>}
      {name === "link" && <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" {...s}/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" {...s}/></>}
    </svg>
  );
}

function BottomIcon({ name }: { name: BottomIconName }) {
  const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      {name === "users" && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...s}/><circle cx="9" cy="7" r="4" {...s}/><path d="M23 21v-2a4 4 0 0 0-3-3.87" {...s}/><path d="M16 3.13a4 4 0 0 1 0 7.75" {...s}/></>}
      {name === "gear" && <><circle cx="12" cy="12" r="3" {...s}/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...s}/></>}
      {name === "card" && <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" {...s}/><line x1="1" y1="10" x2="23" y2="10" {...s}/></>}
    </svg>
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
