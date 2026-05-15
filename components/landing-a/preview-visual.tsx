"use client";

import React from "react";

/**
 * PreviewVisualInsturix — Insturix-branded variant of the landing page Preview component.
 *
 * Identical to the original Preview in landing-page-a.tsx for all phases
 * EXCEPT "edit", where it layers progressive visual mockup frames BEHIND
 * the existing overlays to simulate video content being produced.
 *
 * Visual frames (zIndex 3) sit behind the radial vignette (zIndex 5) and
 * the overlay elements (zIndex 7). They fade in based on editSub progress.
 */

// ─── Design tokens (mirrored from landing-page-a.tsx) ───────────
const C = {
  bg: "#0B0B0A",
  s1: "#131312",
  s2: "#1B1A18",
  s3: "#232220",
  border: "#1C1B19",
  borderL: "#282724",
  text: "#ECE9E1",
  soft: "#B5B2A8",
  muted: "#7A776E",
  dim: "#454340",
  accent: "#D4A652",
  green: "#5EC97E",
  red: "#D46A5C",
  purple: "#9088D4",
  pink: "#D088B4",
  cyan: "#5CB8CC",
} as const;

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const PO = ["welcome", "prompt", "script", "edit", "analyze", "design", "publish", "done"];

// ─── Script lines (mirrored for the script phase) ───────────────
const SCRIPT = [
  { type: "label" as const, text: "HOOK (0-3s)" },
  { type: "line" as const, text: "Open on the Insturix production floor. Camera pushes through the six rooms." },
  { type: "line" as const, text: "VO: One platform. Entire production." },
  { type: "label" as const, text: "BODY (3-22s)" },
  { type: "line" as const, text: "3 room callouts with kinetic text: Script, Edit, Analyze." },
  { type: "line" as const, text: "Screen recording: prompt typed, video produced in real-time." },
  { type: "line" as const, text: "Split screen: raw footage left, AI-edited output right." },
  { type: "line" as const, text: "Dashboard metrics: 8 min avg, 91 quality score, 6 platforms." },
  { type: "label" as const, text: "CTA (22-30s)" },
  { type: "line" as const, text: "Logo reveal. Gold accent pulse. 'Start free' end card." },
];

const SCORES = [
  { label: "Hook strength", score: 92 },
  { label: "Pacing", score: 88 },
  { label: "Retention", score: 78 },
  { label: "CTA clarity", score: 95 },
  { label: "Brand match", score: 100 },
];

const THUMBS = [
  { label: "A", ctr: "4.2%" },
  { label: "B", ctr: "5.1%" },
  { label: "C", ctr: "3.8%" },
  { label: "D", ctr: "3.2%" },
];

const PLATFORMS = [
  { name: "YouTube", color: "#FF0000" },
  { name: "Instagram", color: "#E1306C" },
  { name: "TikTok", color: C.text },
  { name: "LinkedIn", color: "#0A66C2" },
  { name: "X", color: C.text },
  { name: "Facebook", color: "#1877F2" },
];

// ─── Primitives ─────────────────────────────────────────────────

function Chk({ size = 14, color = C.accent, sw = 2.5 }: { size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlatformIcon({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const s = size;
  const icons: Record<string, React.ReactNode> = {
    YouTube: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.94-2A29 29 0 0023 12a29 29 0 00-.46-5.58z" fill={color} opacity={0.8} />
        <path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" fill={C.bg} />
      </svg>
    ),
    Instagram: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke={color} strokeWidth="1.5" opacity={0.8} />
        <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.5" opacity={0.8} />
        <circle cx="17.5" cy="6.5" r="1.5" fill={color} opacity={0.8} />
      </svg>
    ),
    TikTok: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M9 12a4 4 0 104 4V4a5 5 0 005 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      </svg>
    ),
    LinkedIn: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" stroke={color} strokeWidth="1.5" opacity={0.8} />
        <rect x="2" y="9" width="4" height="12" stroke={color} strokeWidth="1.5" opacity={0.8} />
        <circle cx="4" cy="4" r="2" stroke={color} strokeWidth="1.5" opacity={0.8} />
      </svg>
    ),
    X: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.4L20 4h-2l-5.2 6.4L8 4H4z" stroke={color} strokeWidth="1.2" opacity={0.8} />
      </svg>
    ),
    Facebook: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" stroke={color} strokeWidth="1.5" opacity={0.8} />
      </svg>
    ),
  };
  return <>{icons[name] || <div style={{ width: s, height: s, borderRadius: s / 2, background: color, opacity: 0.5 }} />}</>;
}

// ─── Visual frame helpers ───────────────────────────────────────

/** Compute opacity for a frame that fades in at `start` and begins fading out at `fadeStart` */
function frameOpacity(editSub: number, start: number, fadeStart: number): number {
  if (editSub < start) return 0;
  const fadeInEnd = Math.min(fadeStart, start + 0.1);
  if (editSub < fadeInEnd) return (editSub - start) / (fadeInEnd - start);
  if (editSub < fadeStart) return 1;
  const fadeOutEnd = fadeStart + 0.12;
  if (editSub < fadeOutEnd) return 1 - (editSub - fadeStart) / (fadeOutEnd - fadeStart);
  return 0;
}

/** The five progressive visual frame layers rendered during the edit phase */
function EditVisualFrames({ editSub }: { editSub: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Frame 1: Insturix logo mark (0.00 - 0.15) */}
      {editSub >= 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            opacity: frameOpacity(editSub, 0, 0.15),
            transition: `opacity 0.6s ${EASE}`,
          }}
        >
          {/* Insturix actual logo */}
          <div style={{
            transform: `scale(${editSub < 0.15 ? 1 : 0.8})`,
            transition: `transform 0.8s ${EASE}`,
          }}>
            <img
              src="/brand/insturix_white.png"
              alt="Insturix"
              width={120}
              height={120}
              style={{ display: "block" }}
            />
          </div>
          <span
            className="m"
            style={{
              fontSize: 10,
              color: C.dim,
              letterSpacing: "0.08em",
            }}
          >
            SCENE 1 &middot; THE PLATFORM
          </span>
        </div>
      )}

      {/* Frame 2: Mini editor mockup (0.15 - 0.30) */}
      {editSub >= 0.12 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            opacity: frameOpacity(editSub, 0.15, 0.30),
            transition: `opacity 0.6s ${EASE}`,
          }}
        >
          {/* Simplified editor mockup */}
          <div style={{
            width: 220, height: 140, borderRadius: 8,
            border: `1px solid ${C.borderL}`,
            background: C.bg,
            overflow: "hidden",
            boxShadow: `0 8px 32px rgba(0,0,0,.4)`,
          }}>
            {/* Topbar */}
            <div style={{
              height: 18, background: C.s1,
              borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", padding: "0 6px", gap: 3,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.dim }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.dim }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.dim }} />
              <div style={{ flex: 1 }} />
              <div style={{ width: 40, height: 3, borderRadius: 2, background: `${C.accent}30` }} />
            </div>
            <div style={{ display: "flex", height: "calc(100% - 18px)" }}>
              {/* Sidebar */}
              <div style={{
                width: 36, borderRight: `1px solid ${C.border}`,
                background: C.s1, padding: "6px 4px",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {[C.accent, C.muted, C.muted, C.muted].map((c, i) => (
                  <div key={i} style={{ width: "100%", height: 3, borderRadius: 1, background: `${c}40` }} />
                ))}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Preview area */}
                <div style={{
                  flex: 1, background: C.s2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 48, height: 28, borderRadius: 3,
                    background: `linear-gradient(135deg, ${C.accent}15, ${C.accent}08)`,
                    border: `1px solid ${C.accent}20`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M8 5v14l11-7z" fill={C.accent} opacity={0.6} />
                    </svg>
                  </div>
                </div>
                {/* Timeline */}
                <div style={{
                  height: 20, borderTop: `1px solid ${C.border}`,
                  background: C.s1, padding: "4px 6px",
                  display: "flex", gap: 2, alignItems: "center",
                }}>
                  {[C.accent, C.purple, C.cyan, C.accent, C.pink].map((c, i) => (
                    <div key={i} style={{
                      flex: i === 0 ? 2 : i === 2 ? 3 : 1,
                      height: 4, borderRadius: 1, background: `${c}35`,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <span
            className="m"
            style={{
              fontSize: 10,
              color: C.dim,
              letterSpacing: "0.08em",
            }}
          >
            SCENE 2 &middot; THE EDITOR
          </span>
        </div>
      )}

      {/* Frame 3: Feature callouts (0.30 - 0.50) */}
      {editSub >= 0.27 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            opacity: frameOpacity(editSub, 0.30, 0.50),
            transition: `opacity 0.6s ${EASE}`,
          }}
        >
          {[
            { text: "AI Editing", delay: 0 },
            { text: "6 Rooms", delay: 0.04 },
            { text: "One Platform", delay: 0.08 },
          ].map((pill, i) => {
            const pillVisible = editSub >= 0.30 + pill.delay;
            return (
              <div
                key={i}
                style={{
                  padding: "8px 24px",
                  borderRadius: 20,
                  border: `1px solid ${C.accent}30`,
                  background: `${C.accent}12`,
                  opacity: pillVisible ? 1 : 0,
                  transform: `translateY(${pillVisible ? 0 : 12}px) translateX(${(i - 1) * 32}px)`,
                  transition: `all 0.5s ${EASE} ${pill.delay}s`,
                }}
              >
                <span
                  className="m"
                  style={{
                    fontSize: 11,
                    color: C.soft,
                    letterSpacing: "0.04em",
                  }}
                >
                  {pill.text}
                </span>
              </div>
            );
          })}
          <span
            className="m"
            style={{
              fontSize: 10,
              color: C.dim,
              letterSpacing: "0.08em",
              marginTop: 8,
            }}
          >
            SCENE 3 &middot; FEATURES
          </span>
        </div>
      )}

      {/* Frame 4: Testimonial (0.50 - 0.70) */}
      {editSub >= 0.47 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: frameOpacity(editSub, 0.50, 0.70),
            transition: `opacity 0.6s ${EASE}`,
          }}
        >
          <div
            style={{
              maxWidth: 280,
              padding: "24px 28px",
              borderRadius: 16,
              border: `1px solid ${C.borderL}`,
              background: `${C.s1}e6`,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: `linear-gradient(135deg, ${C.accent}20, ${C.accent}10)`,
                border: `1px solid ${C.accent}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 18, color: C.accent, fontWeight: 700 }}>AS</span>
            </div>
            {/* Quote marks */}
            <span style={{ fontSize: 24, color: C.accent, lineHeight: 1, opacity: 0.5 }}>&ldquo;</span>
            <span
              style={{
                fontSize: 14,
                color: C.soft,
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              We replaced our entire post-production workflow in a week
            </span>
            <span
              className="m"
              style={{
                fontSize: 11,
                color: C.muted,
                marginTop: 4,
              }}
            >
              &mdash; Agency Studio, Creative Director
            </span>
            <span
              className="m"
              style={{
                fontSize: 10,
                color: C.dim,
                letterSpacing: "0.08em",
                marginTop: 8,
              }}
            >
              SCENE 4 &middot; TESTIMONIAL
            </span>
          </div>
        </div>
      )}

      {/* Frame 5: Logo reveal + end card (0.70 - 1.00) */}
      {editSub >= 0.67 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            opacity: frameOpacity(editSub, 0.70, 1.1),
            transition: `opacity 0.6s ${EASE}`,
          }}
        >
          {/* Insturix wordmark */}
          <span
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.035em",
              opacity: editSub >= 0.72 ? 1 : 0,
              transform: `translateY(${editSub >= 0.72 ? 0 : 8}px)`,
              transition: `all 0.6s ${EASE}`,
              textShadow: `0 2px 12px ${C.accent}40`,
            }}
          >
            Insturix
          </span>
          {/* Tagline */}
          <span
            style={{
              fontSize: 14,
              color: C.accent,
              letterSpacing: "0.08em",
              opacity: editSub >= 0.78 ? 1 : 0,
              transform: `translateY(${editSub >= 0.78 ? 0 : 6}px)`,
              transition: `all 0.5s ${EASE} 0.1s`,
            }}
          >
            One platform. Entire production.
          </span>
          {/* Gold line animation */}
          <div
            style={{
              width: editSub >= 0.82 ? 120 : 0,
              height: 1.5,
              background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
              borderRadius: 1,
              transition: `width 0.8s ${EASE}`,
              marginTop: 4,
            }}
          />
          <span
            className="m"
            style={{
              fontSize: 10,
              color: C.dim,
              letterSpacing: "0.08em",
              marginTop: 12,
              opacity: editSub >= 0.75 ? 1 : 0,
              transition: `opacity 0.5s ${EASE}`,
            }}
          >
            SCENE 5 &middot; END CARD
          </span>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// PREVIEW VISUAL (exported)
// ═════════════════════════════════════════════════════════════════

export function PreviewVisualInsturix({
  phase,
  pct,
  sub,
}: {
  phase: string;
  pct: number;
  sub: (lo: number, hi: number) => number;
}) {
  const editSub = sub(0.32, 0.58);
  const analyzeSub = sub(0.58, 0.72);
  const designSub = sub(0.72, 0.85);
  const publishSub = sub(0.85, 0.97);
  const scriptSub = sub(0.15, 0.32);
  const promptSub = sub(0.06, 0.15);
  const w = phase === "edit" ? editSub * 0.15 : PO.indexOf(phase) > PO.indexOf("edit") ? 0.15 : 0;

  return (
    <div
      className="editor-preview"
      style={{
        width: "90%",
        maxWidth: 880,
        aspectRatio: "16/9",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg,rgb(${12 + w * 40},${14 + w * 20},${13 + w * 10}),rgb(${15 + w * 35},${17 + w * 18},${15 + w * 8}))`,
        boxShadow:
          phase === "done"
            ? `0 0 120px rgba(94,201,126,.06),0 0 0 1px rgba(94,201,126,.05)`
            : `0 0 80px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.02)`,
        transition: `box-shadow 1.5s ${EASE}, background 1.5s ${EASE}`,
      }}
    >
      {/* Radial vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,.4) 100%)",
          zIndex: 5,
          pointerEvents: "none",
        }}
      />

      {/* ──── VISUAL FRAMES (edit phase only, zIndex 3 behind overlays) ──── */}
      {phase === "edit" && <EditVisualFrames editSub={editSub} />}

      {/* WELCOME */}
      {phase === "welcome" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 440, padding: "0 40px" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                margin: "0 auto 32px",
                border: `1.5px solid ${C.borderL}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "breathe 4s ease infinite",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12l5 5L19 7"
                  stroke={C.accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".35"
                />
              </svg>
            </div>
            <h1
              className="hero-done-text"
              style={{
                fontSize: "var(--r-hero-size, 44px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
                marginBottom: 16,
              }}
            >
              One platform.
              <br />
              <span style={{ color: C.accent }}>Entire production.</span>
            </h1>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, marginBottom: 32 }}>
              Watch a complete video get produced as you scroll.
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 1, height: 36, background: `linear-gradient(to bottom,transparent,${C.accent}30)` }} />
              <span
                className="m"
                style={{ fontSize: 13, color: C.muted, letterSpacing: "0.08em", animation: "pulseVisible 2s ease infinite" }}
              >
                SCROLL TO BEGIN
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PROMPT */}
      {phase === "prompt" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            animation: `fadeIn .6s ${EASE}`,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <span className="m" style={{ fontSize: 11, color: C.accent, letterSpacing: ".08em", display: "block", marginBottom: 20 }}>
              PROMPT
            </span>
            <p
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: C.soft,
                lineHeight: 1.35,
                letterSpacing: "-0.015em",
                opacity: Math.min(1, promptSub * 2.5),
                transform: `translateY(${(1 - Math.min(1, promptSub * 2.5)) * 12}px)`,
                transition: `all .4s ${EASE}`,
              }}
            >
              30-second product launch for Insturix — the AI production platform
            </p>
          </div>
        </div>
      )}

      {/* SCRIPT */}
      {phase === "script" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "28px 32px",
            overflow: "hidden",
            zIndex: 6,
            animation: `fadeIn .4s ${EASE}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span className="m" style={{ fontSize: 11, color: C.accent, letterSpacing: ".08em" }}>
              WRITING SCRIPT
            </span>
            <span className="m" style={{ fontSize: 11, color: C.dim }}>
              {Math.round(scriptSub * 100)}%
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SCRIPT.slice(0, Math.ceil(scriptSub * SCRIPT.length)).map((line, i) => (
              <div key={i} style={{ animation: `slideR .3s ${EASE} both` }}>
                {line.type === "label" ? (
                  <span
                    className="m"
                    style={{
                      fontSize: 11,
                      color: C.accent,
                      display: "block",
                      marginTop: i > 0 ? 12 : 0,
                      marginBottom: 3,
                    }}
                  >
                    {line.text}
                  </span>
                ) : (
                  <div
                    style={{
                      padding: "6px 14px",
                      background: "rgba(255,255,255,.025)",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,.04)",
                    }}
                  >
                    <span style={{ fontSize: 18, color: C.soft, lineHeight: 1.55 }}>{line.text}</span>
                  </div>
                )}
              </div>
            ))}
            {scriptSub < 0.92 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 16,
                    background: C.accent,
                    borderRadius: 2,
                    animation: "blink .9s step-end infinite",
                    display: "inline-block",
                  }}
                />
                <span className="m" style={{ fontSize: 11, color: C.dim }}>
                  writing...
                </span>
              </div>
            )}
            {scriptSub >= 0.92 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 14,
                  padding: "10px 16px",
                  background: `${C.green}08`,
                  borderRadius: 8,
                  border: `1px solid ${C.green}10`,
                  animation: `slideUp .35s ${EASE} both`,
                }}
              >
                <Chk size={14} color={C.green} />
                <span style={{ fontSize: 14, fontWeight: 500, color: C.green }}>Script complete</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT — original overlays preserved, visual frames added via EditVisualFrames above */}
      {phase === "edit" && (
        <>
          {editSub < 0.06 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 2,
                background: `linear-gradient(90deg,transparent,${C.accent}50,transparent)`,
                top: `${(editSub / 0.06) * 100}%`,
                zIndex: 7,
              }}
            />
          )}
          {editSub >= 0.08 && (
            <div
              style={{
                position: "absolute",
                top: 20,
                left: 24,
                zIndex: 7,
                background: "rgba(0,0,0,.7)",
                padding: "8px 20px",
                borderRadius: 8,
                animation: `popIn .5s ${EASE} both`,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>Insturix</span>
            </div>
          )}
          {editSub >= 0.28 && (
            <div
              style={{
                position: "absolute",
                bottom: 48,
                left: 24,
                right: 24,
                zIndex: 7,
                animation: `slideUp .4s ${EASE} both`,
              }}
            >
              <div style={{ background: "rgba(0,0,0,.7)", padding: "10px 18px", borderRadius: 8, display: "inline-block" }}>
                <span style={{ color: "#fff", fontSize: 18, fontWeight: 500 }}>
                  One platform. <span style={{ color: C.accent }}>Entire production.</span>
                </span>
              </div>
            </div>
          )}
          {editSub >= 0.5 && (
            <div
              style={{
                position: "absolute",
                bottom: 52,
                right: 24,
                display: "flex",
                gap: 3,
                alignItems: "end",
                height: 36,
                zIndex: 7,
                animation: `fadeIn .5s ${EASE}`,
              }}
            >
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    borderRadius: 2,
                    background: `${C.pink}50`,
                    height: "100%",
                    transformOrigin: "bottom",
                    animation: `eqBounce ${0.7 + i * 0.12}s ease ${i * 0.06}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}
          {editSub >= 0.55 && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: 24,
                right: 24,
                display: "flex",
                gap: 3,
                zIndex: 7,
                animation: `fadeIn .5s ${EASE}`,
              }}
            >
              {Array.from({ length: 20 }).map((_, i) => {
                const lit = editSub > 0.55 + (i / 20) * 0.25;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: lit ? (i % 4 === 0 ? C.accent : "#3a3a3a") : "#1a1a1a",
                      transition: `background .2s ${EASE}`,
                    }}
                  />
                );
              })}
            </div>
          )}
          {editSub >= 0.78 && (
            <div style={{ position: "absolute", top: 20, right: 24, zIndex: 7, animation: `popIn .5s ${EASE} both` }}>
              <div style={{ background: "rgba(0,0,0,.75)", padding: "12px 22px", borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: C.accent, letterSpacing: "-0.03em" }}>6</div>
                <div className="m" style={{ fontSize: 11, color: C.muted }}>
                  ROOMS
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ANALYZE */}
      {phase === "analyze" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: "rgba(5,5,4,.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: `fadeIn .5s ${EASE}`,
          }}
        >
          <div style={{ width: "88%", maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Insturix</span>
              <span className="m" style={{ fontSize: 10, color: C.dim }}>
                Alyzitron
              </span>
              <div style={{ width: 1, height: 12, background: C.border, margin: "0 4px" }} />
              <span style={{ fontSize: 13, color: C.soft, fontWeight: 500 }}>Insturix Platform</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: analyzeSub > 0.88 ? "auto 1fr" : "1fr",
                gap: 32,
                alignItems: "center",
                marginBottom: 32,
              }}
            >
              {analyzeSub > 0.88 && (
                <div style={{ animation: `popIn .5s ${EASE} both` }}>
                  <span className="m" style={{ fontSize: 64, fontWeight: 500, color: C.text, lineHeight: 0.9, letterSpacing: "-0.06em" }}>
                    91
                  </span>
                </div>
              )}
              {analyzeSub > 0.88 && (
                <div style={{ animation: `slideR .4s ${EASE} .1s both` }}>
                  <span style={{ fontSize: 18, color: C.text, lineHeight: 1.35 }}>
                    Platform story lands instantly.{" "}
                    <span style={{ color: C.accent }}>Tighten the room-transition pacing.</span>
                  </span>
                </div>
              )}
            </div>

            <div
              style={{
                background: C.s1,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                padding: "4px 0",
                overflow: "hidden",
              }}
            >
              {SCORES.map((sc, i) => {
                if (analyzeSub <= i / SCORES.length) return null;
                const scoreColor = sc.score >= 85 ? C.green : sc.score >= 70 ? C.accent : C.red;
                return (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: i < SCORES.length - 1 ? `1px solid ${C.border}` : "none",
                      animation: `slideR .3s ${EASE} ${i * 0.06}s both`,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 14, color: C.text }}>{sc.label}</span>
                      <div style={{ height: 3, background: `${C.text}06`, borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 2,
                            background: scoreColor,
                            width: `${sc.score}%`,
                            transition: `width 1s ${EASE}`,
                          }}
                        />
                      </div>
                    </div>
                    <span
                      className="m"
                      style={{ fontSize: 14, color: scoreColor, fontWeight: 500, minWidth: 28, textAlign: "right" }}
                    >
                      {sc.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* DESIGN */}
      {phase === "design" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: "rgba(5,5,4,.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: `fadeIn .4s ${EASE}`,
          }}
        >
          <div style={{ width: "80%", maxWidth: 380 }}>
            <span className="m" style={{ fontSize: 11, color: C.pink, letterSpacing: ".08em", display: "block", marginBottom: 20 }}>
              GENERATING THUMBNAILS
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {THUMBS.map((v, i) => {
                if (designSub <= i * 0.2) return <div key={i} style={{ aspectRatio: "16/10" }} />;
                const best = i === 1 && designSub > 0.85;
                return (
                  <div
                    key={i}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      border: best ? `1px solid ${C.green}30` : `1px solid ${C.borderL}`,
                      background: C.s2,
                      animation: `popIn .4s ${EASE} both`,
                      position: "relative",
                    }}
                  >
                    {best && (
                      <div style={{ position: "absolute", top: 8, right: 8, background: `${C.green}22`, borderRadius: 4, padding: "4px 8px", zIndex: 1 }}>
                        <span className="m" style={{ fontSize: 10, color: C.green, fontWeight: 500 }}>
                          Best
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        height: 72,
                        background: `linear-gradient(135deg,${C.s3},${C.s1})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 800, color: `${C.accent}12` }}>Insturix</span>
                    </div>
                    <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{v.label}</span>
                      <span className="m" style={{ fontSize: 11, color: best ? C.green : C.muted }}>
                        {v.ctr}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PUBLISH */}
      {phase === "publish" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: "rgba(5,5,4,.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: `fadeIn .4s ${EASE}`,
          }}
        >
          <div style={{ width: "72%", maxWidth: 340 }}>
            <span className="m" style={{ fontSize: 13, color: C.green, letterSpacing: ".08em", display: "block", marginBottom: 24 }}>
              PUBLISHING
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
              {PLATFORMS.map((p, i) => {
                const live = publishSub > (i / PLATFORMS.length) * 0.82;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "16px 8px",
                      background: live ? C.s1 : C.s2,
                      borderRadius: 12,
                      border: live ? `1px solid ${C.green}20` : `1px solid ${C.border}`,
                      opacity: live ? 1 : 0.15,
                      transform: live ? "scale(1)" : "scale(0.95)",
                      transition: `all .5s ${EASE}`,
                    }}
                  >
                    <PlatformIcon name={p.name} color={live ? p.color : C.dim} size={24} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: live ? C.text : C.dim }}>{p.name}</span>
                    {live && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, animation: `fadeIn .3s ${EASE}` }}>
                        <Chk size={10} color={C.green} />
                        <span className="m" style={{ fontSize: 10, color: C.green }}>
                          Live
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {publishSub > 0.7 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "12px 16px",
                  background: `${C.green}08`,
                  borderRadius: 8,
                  border: `1px solid ${C.green}12`,
                  animation: `slideUp .4s ${EASE} both`,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: C.green }}>
                  {Math.min(6, Math.floor(publishSub / 0.14) + 1)} of 6 platforms live
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === "done" && (
        <>
          <div style={{ position: "absolute", top: 20, left: 24, zIndex: 6, background: "rgba(0,0,0,.7)", padding: "8px 20px", borderRadius: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Insturix</span>
          </div>
          <div style={{ position: "absolute", bottom: 48, left: 24, right: 24, zIndex: 6 }}>
            <div style={{ background: "rgba(0,0,0,.7)", padding: "10px 18px", borderRadius: 8, display: "inline-block" }}>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 500 }}>
                One platform. <span style={{ color: C.accent }}>Entire production.</span>
              </span>
            </div>
          </div>
          <div style={{ position: "absolute", top: 20, right: 24, zIndex: 6 }}>
            <div style={{ background: "rgba(0,0,0,.75)", padding: "12px 22px", borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.accent }}>6</div>
              <div className="m" style={{ fontSize: 11, color: C.muted }}>ROOMS</div>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 52, right: 24, display: "flex", gap: 3, alignItems: "end", height: 36, zIndex: 6 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: `${C.pink}50`,
                  height: "100%",
                  transformOrigin: "bottom",
                  animation: `eqBounce ${0.7 + i * 0.12}s ease ${i * 0.06}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <div
            className="hero-done-overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 8,
              background: "rgba(5,5,4,.72)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: `fadeIn .5s ${EASE}`,
              padding: "0 24px",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 400 }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  margin: "0 auto 28px",
                  background: `${C.green}10`,
                  border: `1px solid ${C.green}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: `popIn .5s ${EASE} .1s both`,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l5 5L19 7"
                    stroke={C.green}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ strokeDasharray: 20, animation: "checkDraw .4s ease .3s both" }}
                  />
                </svg>
              </div>
              <h2
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.1,
                  marginBottom: 12,
                  animation: `slideUp .5s ${EASE} .2s both`,
                }}
              >
                One platform. Entire production.
              </h2>
              <p style={{ fontSize: 18, fontWeight: 800, color: C.green, marginBottom: 8, animation: `slideUp .5s ${EASE} .35s both` }}>
                8 minutes. $47 spent. $2,353 saved.
              </p>
              <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, animation: `slideUp .5s ${EASE} .45s both` }}>
                Keep scrolling to learn more.
              </p>
              <div style={{ animation: `slideUp .5s ${EASE} .55s both`, pointerEvents: "auto" }}>
                <button
                  style={{
                    background: C.accent,
                    color: C.bg,
                    border: "none",
                    padding: "14px 32px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Try with your video
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
