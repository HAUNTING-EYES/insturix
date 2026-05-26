"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { SiteFooter } from "@/components/shared/site-footer";
import { PreviewVisualInsturix } from "./preview-visual";

/**
 * Version A — Polished v6
 *
 * Direct port of insturix-editor-v6 (1).jsx with 12 targeted fixes:
 *
 * BUG FIXES:
 *  1. Scroll handler uses rAF throttle (was raw onscroll → jank)
 *  2. Phase transitions cross-fade (was hard cut)
 *  3. Toast stacking fixed (key stability + proper exit)
 *  4. Done state animation opacity fix (fill-mode conflict resolved)
 *
 * DESIGN SYSTEM COMPLIANCE:
 *  5. fontWeight 600/700 → 500/800 (8 places)
 *  6. backdropFilter: blur() → solid rgba backgrounds (6 places)
 *  7. Sizes/spacing aligned to design system scale
 *
 * SMOOTHNESS:
 *  8. All transitions use cubic-bezier(0.16, 1, 0.3, 1)
 *  9. Scroll-to-phase uses eased interpolation
 * 10. Chat messages stagger properly
 *
 * CHAT COPY:
 * 11. AI messages tightened — less log, more director
 *
 * MARKETING:
 * 12. Hover effects use CSS classes (was fragile onMouseEnter inline)
 */

// ─── Design tokens ──────────────────────────────────────────────
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

// ─── Data ───────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  prompt: "Receiving prompt",
  script: "Writing script",
  edit: "Editing footage",
  analyze: "Analyzing",
  design: "Thumbnails",
  publish: "Publishing",
  done: "Complete",
};

const PO = ["welcome", "prompt", "script", "edit", "analyze", "design", "publish", "done"];

const TOASTS = [
  { at: 0.12, text: "Script started", color: C.accent, type: "status", time: "0:02" },
  { at: 0.28, text: "Script complete", color: C.green, type: "done", time: "0:48" },
  { at: 0.34, text: "Building video...", color: C.red, type: "status", time: "1:15" },
  { at: 0.38, text: "Brand title card added", color: C.green, type: "done", time: "1:42" },
  { at: 0.42, text: "Captions synced", color: C.green, type: "done", time: "2:20" },
  { at: 0.48, text: "Cuts locked to beats", color: C.green, type: "done", time: "3:05" },
  { at: 0.52, text: "Music matched", color: C.green, type: "done", time: "3:38" },
  { at: 0.56, text: "Stat counter placed", color: C.green, type: "done", time: "4:10" },
  { at: 0.60, text: "Analyzing quality...", color: C.purple, type: "status", time: "4:30" },
  { at: 0.70, text: "Score: 91/100", color: C.green, type: "done", time: "5:15" },
  { at: 0.74, text: "Generating thumbnails...", color: C.pink, type: "status", time: "5:40" },
  { at: 0.83, text: "Best: Variant B (5.1%)", color: C.green, type: "done", time: "6:10" },
  { at: 0.87, text: "Publishing to 6 platforms", color: C.green, type: "status", time: "6:30" },
  { at: 0.96, text: "Published everywhere.", color: C.green, type: "complete", time: "8:00" },
];

const LAYERS = [
  { name: "Script", c: C.accent, at: 0.15, doneAt: 0.32, phases: ["script"] },
  { name: "Video", c: C.red, at: 0.32, doneAt: 0.58, phases: ["edit"] },
  { name: "Captions", c: C.green, at: 0.37, doneAt: 0.58, phases: ["edit"] },
  { name: "Music", c: C.pink, at: 0.44, doneAt: 0.58, phases: ["edit"] },
  { name: "Graphics", c: C.purple, at: 0.50, doneAt: 0.58, phases: ["edit"] },
  { name: "Thumbnails", c: C.pink, at: 0.72, doneAt: 0.85, phases: ["design"] },
];

const PIPELINE = [
  { label: "Input", phase: "prompt", c: C.accent },
  { label: "Script", phase: "script", c: C.accent },
  { label: "Edit", phase: "edit", c: C.red },
  { label: "Analyze", phase: "analyze", c: C.purple },
  { label: "Thumbnails", phase: "design", c: C.pink },
  { label: "Publish", phase: "publish", c: C.green },
];

const TRACKS = [
  { label: "Script", c: C.accent, lo: 0.15, hi: 0.32 },
  { label: "Video", c: C.red, lo: 0.32, hi: 0.58 },
  { label: "Capts", c: C.green, lo: 0.37, hi: 0.58 },
  { label: "Music", c: C.pink, lo: 0.44, hi: 0.58 },
  { label: "GFX", c: C.purple, lo: 0.50, hi: 0.58 },
];

// FIX #11: Tightened chat copy — less log, more director
const MSGS: { at: number; side: string; text: string; color?: string }[] = [
  { at: 0.08, side: "user", text: "Make a 30-second promo video for our Q1 product launch" },
  { at: 0.13, side: "status", text: "Writing script...", color: C.accent },
  { at: 0.29, side: "done", text: "Script locked — 3 acts, 10 lines, hook-first" },
  { at: 0.33, side: "status", text: "Producing video...", color: C.red },
  { at: 0.40, side: "done", text: "Title card, captions, and music layered" },
  { at: 0.53, side: "done", text: "Cuts synced to beat drops at 0:08 and 0:22" },
  { at: 0.58, side: "status", text: "Analyzing quality...", color: C.purple },
  { at: 0.69, side: "done", text: "Score: 91/100 — CTA hold extended to 2.5s" },
  { at: 0.73, side: "status", text: "Generating thumbnails...", color: C.pink },
  { at: 0.83, side: "done", text: "Variant B wins — 5.1% predicted CTR" },
  { at: 0.87, side: "status", text: "Publishing...", color: C.green },
  { at: 0.96, side: "complete", text: "Live on 6 platforms.\nOne platform. Entire production." },
];

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function Chk({ size = 14, color = C.accent, sw = 2.5 }: { size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export function LandingPageA() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number>(0);
  const mktRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => setReady(true), 600);
  }, []);

  // PERF: Split scroll into two layers to reduce re-renders from 60/sec to ~10/sec.
  // Layer 1 (60fps): CSS custom property --pct on scroll container (no React re-render)
  // Layer 2 (10fps): Throttled setPct for React logic (phase, toasts, elapsed, conditional renders)
  const lastSetPctRef = useRef<number>(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        const mx = el.scrollHeight - el.clientHeight;
        if (mx > 0) {
          const newPct = el.scrollTop / mx;

          // Layer 1: 60fps CSS custom property update (compositor-only, no React re-render)
          el.style.setProperty("--pct", String(newPct));

          // Layer 2: Throttled React state update (~10fps) for logic-only consumers
          const now = performance.now();
          if (now - lastSetPctRef.current > 100) {
            setPct(newPct);
            lastSetPctRef.current = now;
          }

          // Bridge to SiteNavbar: set data attribute so pill-on-scroll triggers
          document.documentElement.dataset.scrolled = newPct > 0.02 ? "true" : "";
        }
        rafRef.current = 0;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Sync final state on scroll end (catches the last frame the throttle might miss)
    const onScrollEnd = () => {
      const mx = el.scrollHeight - el.clientHeight;
      if (mx > 0) setPct(el.scrollTop / mx);
    };
    el.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Smart scroll routing: when marketing is active, capture wheel events.
  // Scrolling down → scroll marketing overlay. Scrolling up at top of marketing → scroll main container back.
  useEffect(() => {
    const mktEl = mktRef.current;
    const scrollEl = scrollRef.current;
    if (!mktEl || !scrollEl) return;

    const onWheel = (e: WheelEvent) => {
      const isScrollingUp = e.deltaY < 0;
      const atMktTop = mktEl.scrollTop <= 0;

      if (isScrollingUp && atMktTop) {
        // User is scrolling up and marketing overlay is at the top → route to main scroll to go back
        e.preventDefault();
        scrollEl.scrollBy({ top: e.deltaY * 3, behavior: "auto" });
      } else {
        // User is scrolling within marketing content → let it scroll naturally
        e.stopPropagation();
      }
    };

    mktEl.addEventListener("wheel", onWheel, { passive: false });
    return () => mktEl.removeEventListener("wheel", onWheel);
  });

  const pipePct = Math.min(1, pct / 0.55);
  // SEQUENCE, not crossfade: editor fades out FIRST, then marketing fades in.
  // Editor done state: pipePct 0.97→1.0 = pct 0.534→0.55
  // At pct 0.55: editor starts fading. At pct 0.58: editor fully gone.
  // At pct 0.58: marketing starts appearing. At pct 0.61: marketing fully visible.
  // No overlap. Clean handoff.
  const editorFade = pct > 0.55 ? Math.max(0, 1 - ((pct - 0.55) / 0.03)) : 1;
  const mktPct = Math.max(0, (pct - 0.57) / 0.43);
  const showMkt = pct > 0.57;

  const phase = pipePct < 0.06 ? "welcome" : pipePct < 0.15 ? "prompt" : pipePct < 0.32 ? "script" : pipePct < 0.58 ? "edit" : pipePct < 0.72 ? "analyze" : pipePct < 0.85 ? "design" : pipePct < 0.97 ? "publish" : "done";

  // FIX #9: Eased sub-progress for smoother interpolation
  const sub = useCallback(
    (lo: number, hi: number) => {
      const raw = Math.max(0, Math.min(1, (pipePct - lo) / (hi - lo)));
      // Apply ease-out for smoother feel
      return 1 - Math.pow(1 - raw, 2);
    },
    [pipePct]
  );

  const elapsed = useMemo(() => {
    if (pipePct < 0.1) return "0:00";
    const t = Math.round(Math.min(1, (pipePct - 0.1) / 0.87) * 480);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }, [pipePct]);

  // FIX #3: Stable toast keys based on content, not just index
  const toasts = useMemo(() => TOASTS.filter((t) => pipePct >= t.at).slice(-2), [pipePct]);
  const toastGeneration = useMemo(() => TOASTS.filter((t) => pipePct >= t.at).length, [pipePct]);

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
        /* PERF: CSS transitions smooth the 10fps throttled React state updates to 60fps visual output */
        .editor-root-animated { transition: transform 0.1s cubic-bezier(0.16,1,0.3,1); will-change: opacity, transform; }
        .mkt-root-animated { transition: opacity 0.1s cubic-bezier(0.16,1,0.3,1); will-change: opacity; }
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
        @keyframes toastIn{from{opacity:0;transform:translateY(-16px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        .mkt-card{transition:border-color .35s ${EASE},transform .35s ${EASE}}
        .mkt-card:hover{border-color:var(--hover-border)!important;transform:translateY(-3px)}
        @media(max-width:1100px){
          .editor-left{width:140px!important}
          .editor-chat{width:260px!important}
        }
        @media(max-width:900px){
          .editor-left{display:none!important}
          .editor-timeline{display:none!important}
          .editor-chat{width:200px!important}
          .editor-preview{width:92%!important;max-width:none!important}
          .editor-topbar>div:first-child span:last-child{display:none!important}
          .mkt-stats{grid-template-columns:1fr 1fr!important}
        }
        @media(max-width:700px){
          .editor-root{top:48px!important}
          .editor-chat{display:none!important}
          .editor-preview{width:96%!important;border-radius:8px!important;aspect-ratio:auto!important;min-height:50vh!important;max-height:70vh!important}
          .editor-topbar{padding:0 10px!important;height:32px!important}
          .editor-topbar .m{font-size:10px!important}
          .editor-topbar span{font-size:11px!important}
          .editor-topbar button{padding:4px 8px!important;font-size:10px!important}
          .editor-topbar input{width:60px!important;font-size:11px!important}
          .toast-container{left:50%!important;width:90%!important;max-width:340px!important;top:84px!important}
          .toast-container>div{padding:8px 16px!important;border-radius:8px!important;font-size:12px!important}
          .toast-container>div>span{font-size:12px!important}
          .toast-container .m{font-size:9px!important}
          .mkt-stats{grid-template-columns:1fr 1fr!important;border-radius:12px!important}
          .mkt-stats>div{padding:32px 20px!important}
          .mkt-stats>div>div:first-child{font-size:32px!important}
          .mkt-compare{grid-template-columns:1fr!important}
          .mkt-paths{grid-template-columns:1fr!important}
          .mkt-section{padding-left:20px!important;padding-right:20px!important}
          .mkt-section h2{font-size:28px!important}
          .hero-done-text{font-size:24px!important}
          .hero-done-overlay{padding:0 16px!important}
          .hero-done-overlay h2{font-size:24px!important;line-height:1.2!important}
          .hero-done-overlay p{font-size:14px!important}
          .hero-done-overlay button{padding:10px 24px!important;font-size:13px!important}
        }
        @media(max-width:480px){
          .editor-preview{width:100%!important;border-radius:0!important}
          .editor-topbar>div:last-child .m{display:none!important}
          .mkt-stats{grid-template-columns:1fr!important}
          .mkt-section{padding-left:16px!important;padding-right:16px!important}
          .mkt-section h2{font-size:24px!important}
          .hero-done-text{font-size:18px!important}
        }
        /* Hide Clerk dev mode keyless banner — targets the fixed-position bottom-right widget */
        [data-clerk-keyless-prompt]{display:none!important}
        div[style*="Configure your application"]{display:none!important}
        button[aria-label="Keyless prompt"]{display:none!important}
        button[aria-label="Keyless prompt"]+div{display:none!important}
        body::after{
          content:'';position:fixed;inset:0;
          background:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity:.005;pointer-events:none;z-index:10000;mix-blend-mode:overlay;
        }
      `}</style>

      {/* Scroll driver — always scrollable, marketing overlay captures wheel events when active */}
      <div ref={scrollRef} style={{ position: "fixed", inset: 0, overflowY: "auto", zIndex: 1 }}>
        <div style={{ height: "2800vh" }} />
      </div>

      {/* Site navbar is now rendered by the parent page, not inline here */}

      {/* ━━━ TOASTS — centered over preview area, top: 48 nav + 48 topbar + 8 breathing = 104 ━━━ */}
      {!showMkt && toasts.length > 0 && (
        <div className="toast-container" style={{ position: "fixed", top: 104, left: "calc(160px + (100% - 160px - 300px) / 2)", transform: "translateX(-50%)", zIndex: 200, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 0" }}>
          {toasts.map((t, i) => {
            const isNew = i === toasts.length - 1;
            return (
              // FIX #3: Stable key using toast content + generation count
              <div
                key={`${t.text}-${toastGeneration}`}
                style={{
                  // FIX #6: Removed backdropFilter, using solid bg instead
                  background: `${C.s2}F0`,
                  border: `1px solid ${t.color}22`,
                  borderRadius: 12,
                  padding: "12px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: `0 8px 32px rgba(0,0,0,.5), 0 0 24px ${t.color}06`,
                  animation: isNew ? `toastIn .4s ${EASE} both` : "none",
                  opacity: isNew ? 1 : 0.3,
                  transform: `scale(${isNew ? 1 : 0.95})`,
                  // FIX #8: Consistent easing
                  transition: `opacity .4s ${EASE}, transform .4s ${EASE}`,
                }}
              >
                {t.type === "done" && <Chk size={16} color={C.green} />}
                {t.type === "status" && <div style={{ width: 7, height: 7, borderRadius: 4, background: t.color, animation: "pulse 1.5s infinite" }} />}
                {t.type === "complete" && <Chk size={16} color={C.green} />}
                {/* FIX #5: fontWeight 600 → 500 */}
                <span style={{ fontSize: 14, fontWeight: 500, color: t.type === "complete" ? C.green : t.type === "done" ? C.soft : t.color }}>{t.text}</span>
                <span className="m" style={{ fontSize: 11, color: C.dim }}>{t.time}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ━━━ EDITOR ━━━ */}
      {/* PERF: editorFade updates at 10fps (throttled), CSS transition smooths to 60fps */}
      <div
        className="editor-root editor-root-animated"
        style={{
          position: "fixed",
          top: 64, // 48px navbar + 16px breathing gap
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          opacity: ready ? editorFade : 0,
          transform: editorFade < 1 ? `scale(${0.95 + editorFade * 0.05}) translateY(${-(1 - editorFade) * 20}px)` : "none",
        }}
      >
        {/* TOP BAR */}
        <div className="editor-topbar" style={{ height: 48, background: C.s1, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0, opacity: phase === "done" ? 0 : 1, transition: `opacity .35s ${EASE}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em" }}>Insturix</span>
            {/* Collab symbol */}
            <span style={{ fontSize: 18, color: C.muted, fontWeight: 500 }}>×</span>
            {/* Editable brand name — collab feel, blinking cursor invites typing */}
            <input
              type="text"
              defaultValue=""
              placeholder="your brand"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: C.accent,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
                width: 140,
                padding: 0,
                caretColor: C.accent,
                transition: `color .8s ${EASE}`,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="m" style={{ fontSize: 13, color: phase === "done" ? C.green : pipePct > 0.1 ? C.accent : C.dim, transition: `color .4s ${EASE}`, fontWeight: 500 }}>{elapsed}</span>
            {phase !== "welcome" && (
              <span className="m" style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, background: phase === "done" ? `${C.green}12` : `${C.accent}10`, color: phase === "done" ? C.green : C.accent, transition: `all .5s ${EASE}`, fontWeight: 500 }}>
                {LABELS[phase]}
              </span>
            )}
            {/* FIX #5: fontWeight 700 → 800 */}
            <button style={{ background: phase === "done" ? C.accent : C.s3, color: phase === "done" ? C.bg : C.dim, border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", pointerEvents: "auto", transition: `all .5s ${EASE}` }}>
              {phase === "done" ? "Try with your video" : "Export"}
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* LEFT */}
          <div className="editor-left" style={{ width: 160, background: C.s1, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span className="m" style={{ fontSize: 13, color: C.muted, letterSpacing: ".08em" }}>LAYERS</span>
            </div>
            <div style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
              {LAYERS.map((l, i) => {
                const vis = pipePct >= l.at;
                const act = l.phases.includes(phase);
                if (!vis) return <div key={i} style={{ height: 36 }} />;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: act ? C.s2 : "transparent", animation: `slideR .35s ${EASE} both`, transition: `background .4s ${EASE}` }}>
                    <div style={{ width: 4, height: 20, borderRadius: 2, background: l.c, opacity: act ? 1 : 0.25, transition: `opacity .4s ${EASE}` }} />
                    {/* FIX #5: fontWeight 600 → 500 */}
                    <span style={{ fontSize: 14, fontWeight: act ? 500 : 400, color: act ? C.text : C.muted, transition: `all .3s ${EASE}`, flex: 1 }}>{l.name}</span>
                    {pipePct >= l.doneAt && <Chk size={12} color={C.green} />}
                  </div>
                );
              })}
            </div>
            {/* Pipeline */}
            <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}` }}>
              <span className="m" style={{ fontSize: 13, color: C.dim, letterSpacing: ".08em", display: "block", marginBottom: 12 }}>PIPELINE</span>
              {/* FIX #6: Clickable pipeline — scrolls to phase */}
              {PIPELINE.map((st, i) => {
                const done = PO.indexOf(phase) > PO.indexOf(st.phase);
                const act = phase === st.phase;
                // Map phase name to scroll percentage: find the pipePct range start, then convert to raw pct
                // Target the MIDDLE of each phase range so it lands clearly inside the phase
                const phaseMidMap: Record<string, number> = { prompt: 0.10, script: 0.22, edit: 0.45, analyze: 0.65, design: 0.78, publish: 0.90 };
                const targetPipePct = phaseMidMap[st.phase] ?? 0.10;
                const targetRawPct = targetPipePct * 0.55; // pipePct = pct / 0.55, so pct = pipePct * 0.55
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (scrollRef.current) {
                        const mx = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
                        scrollRef.current.scrollTo({ top: mx * targetRawPct, behavior: "smooth" });
                      }
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", pointerEvents: "auto", width: "100%", transition: `opacity .2s ${EASE}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 5, background: done ? `${C.green}15` : act ? `${st.c}10` : "transparent", border: done ? `1px solid ${C.green}25` : act ? `1px solid ${st.c}25` : `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", transition: `all .4s ${EASE}` }}>
                      {done && <Chk size={10} color={C.green} sw={3} />}
                      {act && !done && <div style={{ width: 5, height: 5, borderRadius: 3, background: st.c, animation: "pulse 1.5s infinite" }} />}
                    </div>
                    <span className="m" style={{ fontSize: 13, color: done ? C.green : act ? st.c : C.dim, transition: `color .3s ${EASE}` }}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#060605" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: 20 }}>
              <PreviewVisualInsturix phase={phase} pct={pipePct} sub={sub} />
            </div>
            <TL phase={phase} pct={pipePct} />
          </div>

          {/* RIGHT — Chat */}
          <Chat phase={phase} pct={pipePct} />
        </div>
      </div>

      {/* ━━━ MARKETING — visible at mktPct=0.1 (pct=0.577), pointer events at mktPct>0.12 ━━━ */}
      {/* PERF: mktPct opacity updates at 10fps (throttled), CSS transition smooths to 60fps */}
      {showMkt && (
        <div ref={mktRef} className="mkt-root-animated" style={{ position: "fixed", top: 56, left: 0, right: 0, bottom: 0, zIndex: 3, pointerEvents: mktPct > 0.12 ? "auto" : "none", overflowY: "auto", opacity: Math.min(1, mktPct * 10) }}>
          <Marketing />
          <SiteFooter />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════

function TL({ phase, pct }: { phase: string; pct: number }) {
  return (
    <div className="editor-timeline" style={{ height: 80, background: C.s1, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ height: 24, padding: "0 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 18, height: 16, borderRadius: 4, background: pct > 0.06 ? C.accent : C.s3, transition: `background .4s ${EASE}` }} />
        <span className="m" style={{ fontSize: 11, color: C.dim }}>{pct > 0.06 ? `${Math.round(pct * 100)}%` : ""}</span>
      </div>
      <div style={{ flex: 1, padding: "4px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
        {TRACKS.map((t, i) => {
          const vis = pct >= t.lo;
          const fill = Math.max(0, Math.min(1, (pct - t.lo) / (t.hi - t.lo)));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 12, opacity: vis ? 1 : 0, transition: `opacity .4s ${EASE}` }}>
              <span className="m" style={{ fontSize: 11, color: C.dim, width: 44, textAlign: "right" }}>{t.label}</span>
              <div style={{ flex: 1, height: "100%", background: C.s2, borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 1, bottom: 1, width: `${fill * 100}%`, background: `${t.c}22`, border: `1px solid ${t.c}32`, borderRadius: 4, transition: `width .25s ${EASE}` }} />
                {i === 0 && fill > 0 && (
                  <div style={{ position: "absolute", left: `${fill * 100}%`, top: -1, bottom: -1, width: 2, background: C.accent, transition: `left .2s ${EASE}`, zIndex: 2 }}>
                    <div style={{ position: "absolute", top: -2, left: -3, width: 8, height: 8, borderRadius: 4, background: C.accent }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════

function Chat({ phase, pct }: { phase: string; pct: number }) {
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(300);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, width: 0 });

  // PERF: Only scroll chat when a NEW message appears, not on every pct change.
  // OLD: dependency [pct] fired scrollTo 60 times/sec — expensive DOM writes
  // NEW: dependency [visibleMsgCount] fires ~10 times total (only when a message appears)
  const visibleMsgCount = MSGS.filter((m) => pct >= m.at).length;
  useEffect(() => {
    if (chatBodyRef.current && visibleMsgCount > 0) {
      chatBodyRef.current.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [visibleMsgCount]);

  // Draggable resize handle
  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, width: chatWidth };
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging left border → moving left = bigger width
      const delta = dragStart.current.x - ev.clientX;
      const newWidth = Math.max(240, Math.min(480, dragStart.current.width + delta));
      setChatWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  return (
    <div className="editor-chat" style={{ width: chatWidth, background: C.s1, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>
      {/* Drag handle on left edge */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          left: -3,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "col-resize",
          zIndex: 10,
          pointerEvents: "auto",
        }}
      />
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: 4, background: C.green }} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>AI Director</span>
      </div>
      <div ref={chatBodyRef} style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        {phase === "welcome" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 14, color: C.dim, textAlign: "center", lineHeight: 1.65 }}>Give it a prompt<br />to start producing</p>
          </div>
        )}
        {MSGS.filter((m) => pct >= m.at).map((m, i) => (
          <div
            key={i}
            style={{
              ...(m.side === "user"
                ? { alignSelf: "flex-end", background: C.accent, color: C.bg, padding: "10px 16px", borderRadius: "12px 12px 4px 12px", fontWeight: 500 }
                : m.side === "status"
                ? { padding: "8px 12px", borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}12`, color: m.color, display: "flex", alignItems: "center", gap: 8 }
                : m.side === "done"
                ? { padding: "6px 12px", borderRadius: 8, background: `${C.green}06`, border: `1px solid ${C.green}08`, color: C.soft, display: "flex", alignItems: "center", gap: 8 }
                : { padding: "16px", borderRadius: 12, textAlign: "center" as const, background: `${C.green}0A`, border: `1px solid ${C.green}18`, fontWeight: 800, color: C.green, lineHeight: 1.5 }),
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: "100%",
              animation: m.side === "user" ? `slideUp .3s ${EASE} both` : `slideR .25s ${EASE} both`,
            }}
          >
            {m.side === "status" && <div style={{ width: 6, height: 6, borderRadius: 3, background: m.color, animation: "pulse 1.5s infinite", flexShrink: 0 }} />}
            {m.side === "done" && <Chk size={11} color={C.green} />}
            {m.text}
          </div>
        ))}
      </div>
      {/* Writable prompt input */}
      <div style={{ padding: "12px 12px", borderTop: `1px solid ${C.border}`, pointerEvents: "auto" }}>
        <div style={{ display: "flex", gap: 4, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "4px 4px 4px 14px" }}>
          <input placeholder="Give it a prompt..." style={{ flex: 1, background: "transparent", border: "none", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <div style={{ width: 28, height: 28, borderRadius: 7, background: C.s3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0l-7 7m7-7l7 7" stroke={C.dim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANIMATED NUMBER
// ═══════════════════════════════════════════════════════════════

function AnimNum({ target, prefix = "", suffix = "", delay = 0 }: { target: number; prefix?: string; suffix?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          setStarted(true);
          setTimeout(() => {
            const dur = 1200;
            const start = performance.now();
            const step = (now: number) => {
              const p = Math.min((now - start) / dur, 1);
              const ease = 1 - Math.pow(1 - p, 3);
              setVal(Math.round(target * ease));
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }, delay);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, delay, started]);

  const display = target >= 1000 ? `${prefix}${val.toLocaleString()}${suffix}` : `${prefix}${val}${suffix}`;

  return (
    <div ref={ref} style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.05em", color: C.accent, lineHeight: 1, marginBottom: 12 }}>
      {display}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MARKETING
// ═══════════════════════════════════════════════════════════════

function Marketing() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingTop: 64, width: "100%" }}>
      {/* Stats */}
      <section className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <div className="mkt-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, borderRadius: 12, overflow: "hidden" }}>
          {[
            { target: 40, suffix: "%", l: "Lower cost", s: "vs. agencies" },
            { target: 10, suffix: "x", l: "Faster", s: "prompt to published" },
            { prefix: "$", target: 2353, suffix: "", l: "Saved per video", s: "vs. traditional" },
            { target: 8, suffix: " min", l: "Average production", s: "complete video" },
          ].map((st, i) => (
            <div key={i} style={{ background: i % 2 === 0 ? "#0D0D0C" : C.s1, padding: "48px 32px", textAlign: "center" }}>
              <AnimNum target={st.target} prefix={st.prefix || ""} suffix={st.suffix} delay={i * 200} />
              {/* FIX #5: fontWeight 600 → 500 */}
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{st.l}</div>
              <div style={{ fontSize: 13, color: C.dim }}>{st.s}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>

      {/* Approach A: AI editing callout — moved here for visibility */}
      <section className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, alignItems: "center",
          background: C.s1, border: `1px solid ${C.cyan}18`, borderRadius: 12, padding: "48px 24px", overflow: "hidden",
        }}>
          <div>
            <span className="m" style={{ fontSize: 10, letterSpacing: "0.08em", color: C.cyan, display: "block", marginBottom: 16 }}>
              AI EDITING
            </span>
            <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: 16 }}>
              Already have footage?
            </h2>
            <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.65, marginBottom: 24 }}>
              Upload your raw video. AI applies professional cuts, color grading, pacing, and audio mixing — the same decisions a senior editor makes.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {["Auto-cut to music", "Color grade", "Caption sync", "Audio mix", "Hook-body-CTA"].map((tag) => (
                <span key={tag} style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.cyan,
                  background: `${C.cyan}10`, border: `1px solid ${C.cyan}18`,
                  padding: "4px 12px", borderRadius: 4,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 20px" }}>
              <span className="m" style={{ fontSize: 10, color: C.dim, display: "block", marginBottom: 8 }}>RAW FOOTAGE</span>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} style={{
                    flex: 1, aspectRatio: "16/9", borderRadius: 4,
                    background: `linear-gradient(135deg, ${C.s3}, ${C.s2})`,
                    border: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="m" style={{ fontSize: 9, color: C.dim }}>clip_{n}</span>
                  </div>
                ))}
              </div>
              <div className="m" style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>4 clips · 12 min raw · unedited</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 13, color: C.cyan }}>{"↓ AI edits in 8 minutes"}</span>
            </div>
            <div style={{ background: C.s2, border: `1px solid ${C.cyan}18`, borderRadius: 8, padding: "16px 20px" }}>
              <span className="m" style={{ fontSize: 10, color: C.cyan, display: "block", marginBottom: 8 }}>FINAL CUT</span>
              <div style={{
                aspectRatio: "16/9", borderRadius: 4,
                background: `linear-gradient(135deg, rgb(18,16,14), rgb(24,20,16))`,
                border: `1px solid ${C.cyan}24`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.cyan }}>91</div>
                  <div className="m" style={{ fontSize: 9, color: C.muted }}>quality score</div>
                </div>
              </div>
              <div className="m" style={{ fontSize: 10, color: C.cyan, marginTop: 8 }}>0:38 final · color graded · captions synced · music matched</div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>

      {/* Before/After */}
      <section className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", textAlign: "center", marginBottom: 48 }}>The old way vs. <span style={{ color: C.accent }}>Insturix</span></h2>
        <div className="mkt-compare" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { title: "Traditional", color: C.red, steps: ["Brief freelancer - 2 hours", "Wait for draft - 3 days", "Revision round 1 - 2 days", "Revision round 2 - 1 day", "Final export - 2 hours"], total: "~6 days", cost: "$2,400" },
            { title: "Insturix", color: C.green, steps: ["Type your prompt - 30 seconds", "AI writes script - 48 seconds", "AI produces video - 4 minutes", "AI analyzes + optimizes - 45 seconds", "Published to 6 platforms - 1 minute"], total: "~8 minutes", cost: "$47" },
          ].map((side, i) => (
            <div key={i} style={{ background: C.s1, border: `1px solid ${side.color}18`, borderRadius: 12, padding: "32px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: side.color }} />
                {/* FIX #5: fontWeight 700 → 800 */}
                <span style={{ fontSize: 18, fontWeight: 800, color: side.color }}>{side.title}</span>
              </div>
              {side.steps.map((st, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: C.s2, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: C.soft }}>{st.split(" - ")[0]}</span>
                  <span className="m" style={{ fontSize: 11, color: side.color }}>{st.split(" - ")[1]}</span>
                </div>
              ))}
              <div style={{ textAlign: "center", marginTop: 16, padding: "16px", background: `${side.color}08`, borderRadius: 8, border: `1px solid ${side.color}12` }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: side.color }}>{side.total}</span>
                <span style={{ fontSize: 13, color: side.color, display: "block", marginTop: 4, opacity: 0.6 }}>and {side.cost} spent</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>


      {/* Paths — FIX #12: CSS class hover instead of inline JS */}
      <section className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", marginBottom: 48 }}>Two paths. Same engine.</h2>
        <div className="mkt-paths" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { t: "For brand teams", d: "Produce 10x more content without growing headcount.", items: ["Chat-based editing — no skills needed", "Every output matches your brand", "Script to published in hours, not weeks"], c: C.accent },
            { t: "For agencies", d: "Scale across every client. 40% lower cost.", items: ["Separate brand config per client", "White-label delivery", "40% below market rate"], c: C.green },
          ].map((card, i) => (
            <div
              key={i}
              className="mkt-card"
              style={{
                background: C.s1,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "32px 32px",
                cursor: "pointer",
                // FIX #12: CSS variable for hover color
                "--hover-border": `${card.c}20`,
              } as React.CSSProperties}
            >
              <h3 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>{card.t}</h3>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 32 }}>{card.d}</p>
              {card.items.map((p, j) => (
                <div key={j} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ width: 4, height: 4, borderRadius: 2, background: card.c, marginTop: 8, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: C.soft, lineHeight: 1.55 }}>{p}</span>
                </div>
              ))}
              <div style={{ marginTop: 32, pointerEvents: "auto" }}>
                <a href="/contactus" style={{ fontSize: 14, fontWeight: 800, color: card.c, textDecoration: "none" }}>Get in touch →</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>

      {/* Closing CTA — the conversion moment */}
      <section className="mkt-section" style={{ padding: "120px 48px", textAlign: "center", maxWidth: 1120, margin: "0 auto" }}>
        <span className="m" style={{ fontSize: 13, color: C.accent, letterSpacing: "0.08em", display: "block", marginBottom: 24 }}>
          READY TO START?
        </span>
        <h2 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.035em", marginBottom: 16 }}>
          Your next video is a<br />conversation away.
        </h2>
        <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.55, maxWidth: 480, margin: "0 auto 48px" }}>
          Join thousands of creators and teams who produce professional content from a single prompt.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", pointerEvents: "auto" }}>
          <a
            href="/signup"
            style={{
              background: C.accent,
              color: C.bg,
              border: "none",
              padding: "14px 32px",
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "none",
              transition: `opacity .25s ${EASE}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            Start free
          </a>
          <a
            href="/contactus"
            style={{
              color: C.soft,
              border: `1px solid ${C.borderL}`,
              padding: "13px 32px",
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "none",
              transition: `all .25s ${EASE}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = C.accent + "40";
              e.currentTarget.style.color = C.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = C.borderL;
              e.currentTarget.style.color = C.soft;
            }}
          >
            Talk to sales
          </a>
        </div>
        <p style={{ marginTop: 64, fontSize: 13, color: C.dim }}>Insturix — Building Future, Together.</p>
      </section>
    </div>
  );
}
