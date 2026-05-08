"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PreviewVisual } from "./preview-visual";

/**
 * HeroTestPage — Standalone scroll-driven preview demo for A/B testing.
 *
 * Full viewport, dark background. Scroll drives phase progression through
 * the same phase sequence as the main landing page. Shows ONLY the preview
 * area (no sidebar, no chat, no timeline) with a phase label and progress bar.
 *
 * Uses PreviewVisual which adds progressive visual frames during the edit phase.
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

// Phase order and labels — identical to landing-page-a.tsx
const PO = ["welcome", "prompt", "script", "edit", "analyze", "design", "publish", "done"];

const LABELS: Record<string, string> = {
  welcome: "Ready",
  prompt: "Receiving prompt",
  script: "Writing script",
  edit: "Editing footage",
  analyze: "Analyzing",
  design: "Thumbnails",
  publish: "Publishing",
  done: "Complete",
};

const PHASE_COLORS: Record<string, string> = {
  welcome: C.dim,
  prompt: C.accent,
  script: C.accent,
  edit: C.red,
  analyze: C.purple,
  design: C.pink,
  publish: C.green,
  done: C.green,
};

export function HeroTestPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const rafRef = useRef<number>(0);

  // rAF-throttled scroll handler
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        const mx = el.scrollHeight - el.clientHeight;
        if (mx > 0) {
          setPct(el.scrollTop / mx);
        }
        rafRef.current = 0;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Pipeline pct mirrors the landing page: first 55% of scroll = full pipeline
  const pipePct = Math.min(1, pct / 0.97);

  // Phase determination — same thresholds as landing-page-a.tsx
  const phase =
    pipePct < 0.06
      ? "welcome"
      : pipePct < 0.15
        ? "prompt"
        : pipePct < 0.32
          ? "script"
          : pipePct < 0.58
            ? "edit"
            : pipePct < 0.72
              ? "analyze"
              : pipePct < 0.85
                ? "design"
                : pipePct < 0.97
                  ? "publish"
                  : "done";

  // Eased sub-progress — same as landing page
  const sub = useCallback(
    (lo: number, hi: number) => {
      const raw = Math.max(0, Math.min(1, (pipePct - lo) / (hi - lo)));
      return 1 - Math.pow(1 - raw, 2);
    },
    [pipePct],
  );

  const phaseIdx = PO.indexOf(phase);
  const phaseColor = PHASE_COLORS[phase] || C.dim;

  // Elapsed time simulation
  const elapsed = useMemo(() => {
    if (pipePct < 0.1) return "0:00";
    const t = Math.round(Math.min(1, (pipePct - 0.1) / 0.87) * 480);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }, [pipePct]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;overflow:hidden}
        body{font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;background:${C.bg};color:${C.text}}
        ::selection{background:rgba(212,166,82,.18)}
        .m{font-family:'JetBrains Mono',monospace}
        ::-webkit-scrollbar{width:0}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes pulseVisible{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes breathe{0%,100%{opacity:.015}50%{opacity:.05}}
        @keyframes checkDraw{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
        @keyframes eqBounce{0%,100%{transform:scaleY(.15)}50%{transform:scaleY(1)}}
        body::after{
          content:'';position:fixed;inset:0;
          background:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity:.005;pointer-events:none;z-index:10000;mix-blend-mode:overlay;
        }
        @media(max-width:700px){
          .hero-test-preview{width:96%!important;border-radius:8px!important}
          .hero-test-label{font-size:11px!important}
          .hero-test-elapsed{font-size:10px!important}
        }
        @media(max-width:480px){
          .hero-test-preview{width:100%!important;border-radius:0!important}
        }
      `}</style>

      {/* Scroll driver */}
      <div
        ref={scrollRef}
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "auto",
          zIndex: 1,
        }}
      >
        <div style={{ height: "2000vh" }} />
      </div>

      {/* Sticky viewport */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
        }}
      >
        {/* Top bar: phase label + elapsed */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: `1px solid ${C.border}`,
            background: C.s1,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Insturix</span>
            <div style={{ width: 1, height: 14, background: C.border }} />
            <span
              className="m hero-test-label"
              style={{
                fontSize: 12,
                color: phaseColor,
                letterSpacing: "0.06em",
                transition: `color 0.4s ${EASE}`,
              }}
            >
              {LABELS[phase] || phase}
            </span>
            {phase !== "welcome" && phase !== "done" && (
              <span
                className="m"
                style={{
                  fontSize: 10,
                  color: C.dim,
                  padding: "2px 6px",
                  background: C.s2,
                  borderRadius: 4,
                }}
              >
                {phaseIdx}/{PO.length - 1}
              </span>
            )}
          </div>
          <span
            className="m hero-test-elapsed"
            style={{
              fontSize: 11,
              color: C.dim,
            }}
          >
            {elapsed}
          </span>
        </div>

        {/* Preview area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            overflow: "hidden",
          }}
        >
          <div
            className="hero-test-preview"
            style={{
              width: "80%",
              maxWidth: 960,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <PreviewVisual phase={phase} pct={pipePct} sub={sub} />
          </div>
        </div>

        {/* Bottom bar: progress + phase pills */}
        <div
          style={{
            height: 56,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 24px",
            borderTop: `1px solid ${C.border}`,
            background: C.s1,
            flexShrink: 0,
            gap: 8,
          }}
        >
          {/* Phase pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {PO.filter((p) => p !== "welcome").map((p, i) => {
              const isActive = phase === p;
              const isPast = PO.indexOf(phase) > PO.indexOf(p);
              const c = PHASE_COLORS[p] || C.dim;
              return (
                <div
                  key={p}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: isPast ? `${c}60` : isActive ? c : C.s3,
                    transition: `background 0.4s ${EASE}`,
                    position: "relative",
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 2,
                        background: c,
                        transformOrigin: "left",
                        transform: `scaleX(${sub(
                          p === "prompt" ? 0.06 :
                          p === "script" ? 0.15 :
                          p === "edit" ? 0.32 :
                          p === "analyze" ? 0.58 :
                          p === "design" ? 0.72 :
                          p === "publish" ? 0.85 : 0.97,
                          p === "prompt" ? 0.15 :
                          p === "script" ? 0.32 :
                          p === "edit" ? 0.58 :
                          p === "analyze" ? 0.72 :
                          p === "design" ? 0.85 :
                          p === "publish" ? 0.97 : 1.0,
                        )})`,
                        transition: `transform 0.15s ${EASE}`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* Labels under pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {PO.filter((p) => p !== "welcome").map((p) => {
              const isActive = phase === p;
              const isPast = PO.indexOf(phase) > PO.indexOf(p);
              return (
                <div key={p} style={{ flex: 1, textAlign: "center" }}>
                  <span
                    className="m"
                    style={{
                      fontSize: 9,
                      color: isActive ? PHASE_COLORS[p] : isPast ? C.muted : C.dim,
                      letterSpacing: "0.04em",
                      transition: `color 0.3s ${EASE}`,
                    }}
                  >
                    {(LABELS[p] || p).split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* A/B test badge */}
      <div
        style={{
          position: "fixed",
          bottom: 68,
          right: 16,
          zIndex: 100,
          background: `${C.purple}18`,
          border: `1px solid ${C.purple}30`,
          borderRadius: 6,
          padding: "4px 10px",
          pointerEvents: "none",
        }}
      >
        <span className="m" style={{ fontSize: 10, color: C.purple, letterSpacing: "0.06em" }}>
          A/B VARIANT: VISUAL
        </span>
      </div>
    </>
  );
}
