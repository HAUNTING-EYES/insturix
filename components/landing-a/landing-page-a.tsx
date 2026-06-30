"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/animation/gsap-config";
import Lenis from "lenis";
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
  { at: 0.34, text: "Building content...", color: C.red, type: "status", time: "1:15" },
  { at: 0.38, text: "Brand title card added", color: C.green, type: "done", time: "1:42" },
  { at: 0.42, text: "Captions synced", color: C.green, type: "done", time: "2:20" },
  { at: 0.48, text: "Cuts locked to beats", color: C.green, type: "done", time: "3:05" },
  { at: 0.52, text: "Music matched", color: C.green, type: "done", time: "3:38" },
  { at: 0.56, text: "Stat counter placed", color: C.green, type: "done", time: "4:10" },
  { at: 0.60, text: "Analyzing quality...", color: C.purple, type: "status", time: "4:30" },
  { at: 0.70, text: "Review signals ready", color: C.green, type: "done", time: "5:15" },
  { at: 0.74, text: "Generating thumbnails...", color: C.pink, type: "status", time: "5:40" },
  { at: 0.83, text: "Thumbnail options ready", color: C.green, type: "done", time: "6:10" },
  { at: 0.87, text: "Preparing publish package", color: C.green, type: "status", time: "6:30" },
  { at: 0.96, text: "Publish-ready.", color: C.green, type: "complete", time: "8:00" },
];

const LAYERS = [
  { name: "Script", c: C.accent, at: 0.15, doneAt: 0.32, phases: ["script"] },
  { name: "Media", c: C.red, at: 0.32, doneAt: 0.58, phases: ["edit"] },
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
  { label: "Media", c: C.red, lo: 0.32, hi: 0.58 },
  { label: "Capts", c: C.green, lo: 0.37, hi: 0.58 },
  { label: "Music", c: C.pink, lo: 0.44, hi: 0.58 },
  { label: "GFX", c: C.purple, lo: 0.50, hi: 0.58 },
];

// FIX #11: Tightened chat copy — less log, more director
const MSGS: { at: number; side: string; text: string; color?: string }[] = [
  { at: 0.08, side: "user", text: "Make a launch campaign from this brief and footage" },
  { at: 0.13, side: "status", text: "Writing script...", color: C.accent },
  { at: 0.29, side: "done", text: "Script locked — 3 acts, 10 lines, hook-first" },
  { at: 0.33, side: "status", text: "Producing content...", color: C.red },
  { at: 0.40, side: "done", text: "Title card, captions, and music layered" },
  { at: 0.53, side: "done", text: "Cuts synced to beat drops at 0:08 and 0:22" },
  { at: 0.58, side: "status", text: "Analyzing quality...", color: C.purple },
  { at: 0.69, side: "done", text: "Review signals ready — CTA timing adjusted" },
  { at: 0.73, side: "status", text: "Generating thumbnails...", color: C.pink },
  { at: 0.83, side: "done", text: "Thumbnail options ready for review" },
  { at: 0.87, side: "status", text: "Publishing...", color: C.green },
  { at: 0.96, side: "complete", text: "Publish-ready.\nYour vision. Not a version" },
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

function TimecodeDisplay({ value, color }: { value: string; color: string }) {
  return (
    <span style={{ display: "inline-flex" }}>
      {value.split("").map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          style={{
            display: "inline-block",
            animation: `digitRollIn .15s ${EASE} both`,
            width: ch === ":" ? "auto" : "0.55em",
            textAlign: "center",
            color,
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export function LandingPageA() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const mktRef = useRef<HTMLDivElement>(null);

  // ─── React state: ONLY for logic consumers (phase, toasts, text, conditional renders) ───
  // Visual scroll properties (editorFade, mktPct opacity) are GSAP-controlled — zero re-renders.
  // React state updates at ~5fps (200ms throttle) for child components that need pipePct.
  const [pct, setPct] = useState(0);
  const [showMkt, setShowMkt] = useState(false); // Event-driven — controls visibility + interactivity
  const showMktRef = useRef(false); // Ref mirror avoids stale closure in onUpdate

  // Layer animation state: track threshold crossings for one-shot GSAP tweens.
  // Sets reset on scroll-back so arm pulse / done flash re-trigger on next forward crossing.
  const armedLayersRef = useRef<Set<number>>(new Set());
  const doneLayersRef = useRef<Set<number>>(new Set());
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // ─── GSAP ScrollTrigger: replaces manual scroll handler ───
  // Layer 1 (60fps): GSAP scrub timeline drives editor fade-out + marketing fade-in
  // Layer 2 (60fps): CSS custom property --pct (compositor-only, no React re-render)
  // Layer 3 (~5fps): Throttled setPct for React logic (phase, toasts, elapsed, conditional renders)
  // Layer 4 (once):  scrollend listener catches the final frame the throttle might miss
  useGSAP(
    () => {
      const scroller = scrollRef.current;
      const spacer = spacerRef.current;
      if (!scroller || !spacer) return;

      // ── Lenis: smooth scroll with momentum on the scroll driver container ──
      // Without Lenis, the fixed overflowY:auto div has zero inertia — scroll stops
      // dead when you lift your finger. Lenis adds natural deceleration.
      const lenis = new Lenis({
        wrapper: scroller,
        content: spacer,
        smoothWheel: true,
        lerp: 0.08,        // Smooth catchup speed (lower = smoother, higher = snappier)
        wheelMultiplier: 1, // 1:1 native feel
      });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      // ── Mount animation: editor fades in quickly ──
      // Old: 0.6s delay + 0.5s = 1.1s of blank screen. User saw "text disappears."
      // New: 0.1s delay + 0.4s = 0.5s total. Just enough to avoid FOUC, fast enough to feel instant.
      gsap.fromTo(
        ".editor-root-animated",
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: "expo.out", delay: 0.1 }
      );

      // ── Scrub timeline: scroll position → visual properties (60fps, compositor) ──
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: spacer,
          scroller: scroller,
          start: "top top",
          end: "bottom bottom",
          scrub: true, // Instant — Lenis provides the momentum feel. scrub:0.5 caused double-smoothing bounce.
          onUpdate: (self) => {
            const p = self.progress;

            // 60fps: CSS custom property (for any CSS consumers, no React)
            scroller.style.setProperty("--pct", String(p));

            // 60fps: Navbar scroll indicator (no React)
            document.documentElement.dataset.scrolled = p > 0.02 ? "true" : "";

            // ── 60fps: Marketing overlay opacity (GSAP smooth, no React re-render) ──
            const mktEl = mktRef.current;
            if (mktEl) {
              const mktProgress = Math.max(0, (p - 0.57) / 0.43);
              gsap.to(mktEl, {
                opacity: Math.min(1, mktProgress * 25),
                duration: 0.15,
                overwrite: true,
              });
            }

            // ── 60fps: Layer "arming" — ghost → tally light → readable ──
            // Layers at 60fps via gsap.set, not 10fps React. No jitter.
            const pp = Math.min(1, p / 0.55);
            const curPhase = pp < 0.06 ? "welcome" : pp < 0.15 ? "prompt" : pp < 0.32 ? "script" : pp < 0.58 ? "edit" : pp < 0.72 ? "analyze" : pp < 0.85 ? "design" : pp < 0.97 ? "publish" : "done";

            for (let li = 0; li < 6; li++) {
              const el = document.querySelector(`[data-layer-idx="${li}"]`) as HTMLElement;
              if (!el) continue;
              const layer = LAYERS[li];
              const revealProg = Math.max(0, Math.min(1, (pp - (layer.at - 0.01)) / 0.03));
              const isActive = layer.phases.includes(curPhase);
              gsap.set(el, { opacity: 0.05 + revealProg * 0.95 });

              const bar = el.querySelector("[data-layer-bar]") as HTMLElement;
              if (bar) bar.style.opacity = String(isActive ? 1 : revealProg > 0 ? 0.25 : 0);

              // Tally light pulse — broadcast camera going live.
              // Scale 1→1.12→1 is intentional overshoot (RESTRAINT exception: communicates "track armed").
              if (revealProg > 0 && !armedLayersRef.current.has(li)) {
                armedLayersRef.current.add(li);
                if (bar && !prefersReducedMotion.current) {
                  gsap.fromTo(bar,
                    { scaleY: 1, scaleX: 1 },
                    { scaleY: 1.12, scaleX: 1.12, duration: 0.125, yoyo: true, repeat: 1, ease: "expo.out" }
                  );
                }
              } else if (revealProg === 0 && armedLayersRef.current.has(li)) {
                armedLayersRef.current.delete(li);
              }

              // Done: green flash on bar, then checkmark draws itself
              const isDone = pp >= layer.doneAt;
              if (isDone && !doneLayersRef.current.has(li)) {
                doneLayersRef.current.add(li);
                if (!prefersReducedMotion.current) {
                  const flash = el.querySelector("[data-layer-flash]") as HTMLElement;
                  if (flash) {
                    gsap.fromTo(flash, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "expo.out" });
                  }
                }
                const chkSvg = el.querySelector("[data-layer-check]") as SVGElement;
                const chkPath = chkSvg?.querySelector("path") as SVGPathElement;
                if (chkSvg && chkPath) {
                  gsap.to(chkSvg, { opacity: 1, duration: prefersReducedMotion.current ? 0 : 0.25, delay: prefersReducedMotion.current ? 0 : 0.25 });
                  gsap.to(chkPath, { strokeDashoffset: 0, duration: prefersReducedMotion.current ? 0 : 0.35, ease: "expo.out", delay: prefersReducedMotion.current ? 0 : 0.25 });
                }
              } else if (!isDone && doneLayersRef.current.has(li)) {
                doneLayersRef.current.delete(li);
                const chkSvg = el.querySelector("[data-layer-check]") as SVGElement;
                const chkPath = chkSvg?.querySelector("path") as SVGPathElement;
                if (chkSvg) gsap.set(chkSvg, { opacity: 0 });
                if (chkPath) gsap.set(chkPath, { strokeDashoffset: 1 });
              }

              const name = el.querySelector("[data-layer-name]") as HTMLElement;
              if (name) {
                name.style.color = isActive ? C.text : (revealProg > 0 ? C.muted : C.dim);
                name.style.fontWeight = isActive ? "500" : "400";
              }
              el.style.background = isActive ? C.s2 : "transparent";
            }

            // ── 60fps: Track fills at native frame rate ──
            for (let ti = 0; ti < 5; ti++) {
              const fillEl = document.querySelector(`[data-track-fill="${ti}"]`) as HTMLElement;
              if (!fillEl) continue;
              const track = TRACKS[ti];
              const fill = Math.max(0, Math.min(1, (pp - track.lo) / (track.hi - track.lo)));
              fillEl.style.width = `${fill * 100}%`;
              // Playhead on first track
              if (ti === 0) {
                const playhead = document.querySelector("[data-track-playhead]") as HTMLElement;
                if (playhead) {
                  playhead.style.left = `${fill * 100}%`;
                  playhead.style.opacity = fill > 0 ? "1" : "0";
                }
              }
              // Track visibility
              const row = fillEl.closest("[data-track-row]") as HTMLElement;
              if (row) row.style.opacity = String(pp >= track.lo ? 1 : 0);
            }

            // ── 60fps: Dimmer overlay — "control room lights dimming" ──
            // Subtle, barely perceptible. Just enough to feel "the room changed."
            // Too strong → black flicker on scroll-back. 8% max, narrow window.
            const dimmer = document.getElementById("controlRoomDimmer");
            if (dimmer) {
              const dimProgress = p < 0.55 ? 0 : p < 0.565 ? (p - 0.55) / 0.015 : p < 0.58 ? 1 - (p - 0.565) / 0.015 : 0;
              dimmer.style.opacity = String(dimProgress * 0.08);
            }

            // Event-driven React state: showMkt set IMMEDIATELY (not throttled).
            const shouldShowMkt = p > 0.57;
            if (shouldShowMkt !== showMktRef.current) {
              showMktRef.current = shouldShowMkt;
              setShowMkt(shouldShowMkt);
            }

            // Every frame: React state drives preview content, chat, toasts, elapsed.
            // NO THROTTLE. The 200ms throttle made everything look like "blocks moving."
            // Layers + tracks are GSAP-owned (60fps direct DOM above) so they don't
            // cause re-renders. The remaining React consumers (preview sub-progress,
            // chat messages, toasts, elapsed timer) are lightweight — 60fps is fine.
            setPct(p);
          },
        },
      });

      // SEQUENCE, not crossfade: editor fades out FIRST, then marketing fades in.
      // Editor: pct 0.55→0.58 (duration 0.03 of timeline). Marketing: handled in onUpdate above.
      // No overlap. Clean handoff. Thresholds preserved from original implementation.
      tl.fromTo(
        ".editor-root-animated",
        { opacity: 1, scale: 1, y: 0 },
        { opacity: 0, scale: 0.95, y: -20, duration: 0.03, ease: "none" },
        0.55
      );

      // Extend timeline to the full scroll range (0→1) so scrub maps correctly
      tl.set({}, {}, 1.0);
    },
    // NO scope — animated elements (.editor-root-animated, mktRef) are siblings of
    // scrollRef, not children. Scoping would limit selectors to inside the scroller
    // and find nothing → blank page. useGSAP still handles cleanup without scope.
    { dependencies: [] }
  );

  // ── Final frame sync: scrollend catches the last value the 200ms throttle misses ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScrollEnd = () => {
      const mx = el.scrollHeight - el.clientHeight;
      if (mx > 0) setPct(el.scrollTop / mx);
    };
    el.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => el.removeEventListener("scrollend", onScrollEnd);
  }, []);

  // Smart scroll routing: when marketing is active, capture wheel events.
  // Marketing is ALWAYS in the DOM now — handler attaches once on mount, never torn down/re-attached.
  // This eliminates the timing gaps that caused lost wheel events on the second scroll-down.
  useEffect(() => {
    const mktEl = mktRef.current;
    const scrollEl = scrollRef.current;
    if (!mktEl || !scrollEl) return;

    const onWheel = (e: WheelEvent) => {
      const isScrollingUp = e.deltaY < 0;
      const atMktTop = mktEl.scrollTop <= 0;

      if (isScrollingUp && atMktTop) {
        e.preventDefault();
        scrollEl.scrollBy({ top: e.deltaY * 3, behavior: "auto" });
      } else {
        e.stopPropagation();
      }
    };

    mktEl.addEventListener("wheel", onWheel, { passive: false });
    return () => mktEl.removeEventListener("wheel", onWheel);
  }, []); // Empty deps — mktRef.current always exists (never conditionally mounted)

  // ─── Derived values (from throttled pct state) ───
  // showMkt is event-driven state (set immediately in onUpdate above), NOT derived here.
  const pipePct = Math.min(1, pct / 0.55);

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
        /* PERF: GSAP ScrollTrigger scrub handles editor + marketing opacity/transform at 60fps.
           No CSS transitions needed — GSAP drives values directly. Initial opacity:0 for mount animation. */
        .editor-root-animated { opacity: 0; will-change: opacity, transform; }
        /* When editor is faded out (showMkt=true), kill ALL child pointer events.
           Without this, invisible children (topbar, pipeline, chat, drag handle) at z:2
           with pointerEvents:"auto" absorb wheel events, creating a dead zone between
           the marketing overlay (z:3) and the scroll driver (z:1). */
        .editor-root-animated[data-hidden] *{ pointer-events: none !important; }
        .mkt-root-animated { will-change: opacity; }
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes pulseVisible{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes breathe{0%,100%{opacity:.015}50%{opacity:.05}}
        @keyframes checkDraw{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
        @keyframes pipeRouteFill{from{transform:scale(0)}to{transform:scale(1)}}
        @keyframes chatUserIn{0%{opacity:0;transform:translateY(12px) scale(.95)}60%{transform:translateY(-2px) scale(1.02)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes chatDoneIn{0%{opacity:0;transform:translateX(-8px)}40%{opacity:0;transform:translateX(-8px)}100%{opacity:1;transform:translateX(0)}}
        @keyframes chatCompleteIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        @keyframes intercomBlink{0%{opacity:0}25%{opacity:1}50%{opacity:.5}100%{opacity:1}}
        @keyframes toastUnfold{0%{clip-path:inset(100% 0 0 0);opacity:0}50%{clip-path:inset(0);opacity:0}100%{clip-path:inset(0);opacity:1}}
        @keyframes phaseFlipIn{0%{transform:perspective(400px) rotateX(90deg) scale(.9);opacity:0}60%{transform:perspective(400px) rotateX(-8deg) scale(1.03);opacity:1}100%{transform:perspective(400px) rotateX(0) scale(1);opacity:1}}
        @keyframes digitRollIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ctaGlow{0%,100%{box-shadow:0 0 0 rgba(212,166,82,0)}50%{box-shadow:0 0 24px rgba(212,166,82,.25)}}
        @keyframes lineReveal{from{clip-path:inset(0 100% 0 0);opacity:.5}to{clip-path:inset(0);opacity:1}}
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
        /* Reduced motion: respect OS accessibility setting.
           Disables CSS animations/transitions. GSAP one-shot tweens (arm pulse,
           done flash) check window.matchMedia in their trigger code. */
        @media(prefers-reduced-motion:reduce){
          *,*::before,*::after{
            animation-duration:0.01ms!important;
            animation-iteration-count:1!important;
            transition-duration:0.01ms!important;
            transition-delay:0ms!important;
          }
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
        <div ref={spacerRef} style={{ height: "2800vh" }} />
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
                  animation: isNew ? `toastUnfold .35s ${EASE} both` : "none",
                  opacity: isNew ? 1 : 0.3,
                  transform: isNew ? "none" : "translateY(-4px) scale(0.97)",
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
      {/* PERF: opacity + transform are GSAP-controlled (mount animation + scrub timeline).
           CSS sets initial opacity:0. GSAP mount animates to 1. Scrub fades to 0 at pct 0.55-0.58.
           React never touches these properties — zero re-renders for visual scroll. */}
      <div
        className="editor-root editor-root-animated"
        {...(showMkt ? { "data-hidden": "" } : {})}
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
          // opacity + transform: GSAP-controlled (see useGSAP above)
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
            <span className="m" style={{ fontSize: 13, transition: `color .4s ${EASE}`, fontWeight: 500 }}>
              <TimecodeDisplay value={elapsed} color={phase === "done" ? C.green : pipePct > 0.1 ? C.accent : C.dim} />
            </span>
            <span
              key={phase}
              className="m"
              style={{
                fontSize: 11, padding: "5px 14px", borderRadius: 6,
                background: phase === "done" ? `${C.green}12` : `${C.accent}10`,
                color: phase === "done" ? C.green : C.accent,
                fontWeight: 500,
                visibility: phase === "welcome" ? "hidden" : "visible",
                animation: phase === "welcome" ? "none" : phase === "prompt" ? `popIn .35s ${EASE} both` : `phaseFlipIn .35s ${EASE} both`,
              }}
            >
              {LABELS[phase] || ""}
            </span>
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
              {LAYERS.map((l, i) => (
                <div key={i} data-layer-idx={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, opacity: 0.05, transition: `background .4s ${EASE}` }}>
                  <div data-layer-bar style={{ width: 4, height: 20, borderRadius: 2, background: l.c, opacity: 0, transition: `opacity .25s ${EASE}`, position: "relative" }}>
                    <div data-layer-flash style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: C.green, opacity: 0 }} />
                  </div>
                  <span data-layer-name style={{ fontSize: 14, color: C.dim, transition: `all .25s ${EASE}`, flex: 1 }}>{l.name}</span>
                  <svg data-layer-check width={12} height={12} viewBox="0 0 24 24" fill="none" style={{ opacity: 0, flexShrink: 0 }}>
                    <path d="M5 12l5 5L19 7" stroke={C.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1} />
                  </svg>
                </div>
              ))}
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
                    <div style={{ width: 16, height: 16, borderRadius: 5, border: done ? `1px solid ${C.green}25` : act ? `1px solid ${st.c}25` : `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", transition: `border .35s ${EASE}`, position: "relative", overflow: "hidden" }}>
                      {(act || done) && (
                        <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: done ? `${C.green}20` : `${st.c}15`, animation: `pipeRouteFill .35s ${EASE} both`, transition: `background .35s ${EASE}` }} />
                      )}
                      {act && !done && (
                        <div style={{ width: 5, height: 5, borderRadius: 3, background: st.c, animation: "pulse 1.5s infinite", position: "relative", zIndex: 1 }} />
                      )}
                      {done && (
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" style={{ position: "absolute", zIndex: 2 }}>
                          <path d="M5 12l5 5L19 7" stroke={C.green} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 20, strokeDashoffset: 0, animation: `checkDraw .35s ${EASE} both` }} />
                        </svg>
                      )}
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

      {/* ━━━ DIMMER — "Control room lights going to standby" ━━━
           Sits between editor (z:2) and marketing (z:3). GSAP onUpdate fades
           it in at pct 0.54→0.56 and back out at 0.56→0.58. Max 15% darkening.
           Communicates: you're leaving the production floor. */}
      <div id="controlRoomDimmer" style={{ position: "fixed", inset: 0, zIndex: 2, background: "#000", opacity: 0, pointerEvents: "none" }} />

      {/* ━━━ MARKETING — ALWAYS in DOM (never mount/unmount).
           Conditional mount caused a cascade of timing bugs:
           - Wheel handler torn down/re-attached on every mount cycle
           - React reconciliation overwrote GSAP pointerEvents on re-render
           - Invisible editor children (z:2) absorbed events in the gap
           - Second scroll-down reproduced the dead zone every time
           Fix: always render, toggle visibility + pointerEvents via showMkt state.
           Opacity is GSAP-controlled (onUpdate gsap.to). */}
      <div ref={mktRef} className="mkt-root-animated" style={{
        position: "fixed", top: 56, left: 0, right: 0, bottom: 0, zIndex: 3,
        overflowY: "auto", opacity: 0,
        // visibility: showMkt makes the element paintable (GSAP can fade it in)
        visibility: showMkt ? "visible" : "hidden",
        // pointerEvents: delayed to pct > 0.59 (not just showMkt at 0.57).
        // At pct 0.59, GSAP has already animated opacity to ~46% — the user can
        // SEE the marketing content. Without this delay, the wheel handler intercepts
        // events on an invisible (opacity:0) element, killing scroll propagation to
        // the scroll driver. The 200ms React throttle on pct adds a natural buffer.
        pointerEvents: showMkt && pct > 0.59 ? "auto" : "none",
      }}>
        <Marketing />
        <SiteFooter />
      </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: pct > 0.06 ? C.accent : C.dim, transition: `background .4s ${EASE}`, animation: pct > 0.06 ? "pulse 1.5s infinite" : "none" }} />
          <span className="m" style={{ fontSize: 9, color: pct > 0.06 ? C.accent : C.dim, transition: `color .4s ${EASE}`, letterSpacing: ".05em" }}>{pct > 0.06 ? "REC" : ""}</span>
        </div>
        <span className="m" style={{ fontSize: 11, color: C.dim }}>{pct > 0.06 ? `${Math.round(pct * 100)}%` : ""}</span>
      </div>
      <div style={{ flex: 1, padding: "4px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
        {TRACKS.map((t, i) => {
          // Track fills + playhead are GSAP-owned at 60fps. React provides structure ONLY.
          // NO width/left in inline styles — React re-render would overwrite GSAP's values.
          return (
            <div key={i} data-track-row style={{ display: "flex", alignItems: "center", gap: 8, height: 12, opacity: 0 }}>
              <span className="m" style={{ fontSize: 11, color: C.dim, width: 44, textAlign: "right" }}>{t.label}</span>
              <div style={{ flex: 1, height: "100%", background: C.s2, borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div data-track-fill={i} style={{ position: "absolute", left: 0, top: 1, bottom: 1, background: `${t.c}22`, border: `1px solid ${t.c}32`, borderRadius: 4 }} />
                {i === 0 && (
                  <div data-track-playhead style={{ position: "absolute", top: -1, bottom: -1, width: 2, background: C.accent, left: "0%", zIndex: 2 }}>
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
        {MSGS.filter((m) => pct >= m.at).map((m, i, arr) => {
          const isLast = i === arr.length - 1;
          return (
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
                animation: m.side === "user" ? `chatUserIn .35s ${EASE} both`
                  : m.side === "complete" ? `chatCompleteIn .5s ${EASE} both`
                  : m.side === "done" ? `chatDoneIn .35s ${EASE} both`
                  : `slideR .25s ${EASE} both`,
              }}
            >
              {m.side === "status" && <div style={{ width: 6, height: 6, borderRadius: 3, background: m.color, animation: isLast ? "intercomBlink .15s ease-out, pulse 1.5s 0.15s infinite" : "none", opacity: isLast ? 1 : 0.4, flexShrink: 0, transition: `opacity .25s ${EASE}` }} />}
              {m.side === "done" && <Chk size={11} color={C.green} />}
              {m.text}
            </div>
          );
        })}
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
  const sRefs = useRef<(HTMLElement | null)[]>([]);
  const [vis, setVis] = useState<Set<number>>(new Set());
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = sRefs.current.indexOf(e.target as HTMLElement);
          if (idx >= 0) setVis(prev => { const s = new Set(prev); s.add(idx); return s; });
        }
      });
    }, { threshold: 0.1 });
    sRefs.current.forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const sr = (i: number) => (el: HTMLElement | null) => { sRefs.current[i] = el; };
  const v = (i: number) => vis.has(i);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingTop: 64, width: "100%" }}>
      {/* Stats — "The Numbers Drop": curtain reveal per cell, stagger 0.1s */}
      <section ref={sr(0)} className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <div className="mkt-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, borderRadius: 12, overflow: "hidden" }}>
          {[
            { prefix: "", target: 1, suffix: "", l: "Connected workflow", s: "brief to output" },
            { prefix: "", target: 6, suffix: "", l: "Production stages", s: "plan to share" },
            { prefix: "", target: 1, suffix: "", l: "Brand profile", s: "applied across output" },
            { prefix: "", target: 6, suffix: "", l: "Priority audiences", s: "teams and filmmakers" },
          ].map((st, i) => (
            <div key={i} style={{ background: i % 2 === 0 ? "#0D0D0C" : C.s1, padding: "48px 32px", textAlign: "center", clipPath: v(0) ? "inset(0)" : "inset(100% 0 0 0)", transition: `clip-path .5s ${EASE} ${i * 0.1}s` }}>
              <AnimNum target={st.target} prefix={st.prefix || ""} suffix={st.suffix} delay={i * 200 + 500} />
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{st.l}</div>
              <div style={{ fontSize: 13, color: C.dim }}>{st.s}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>

      {/* AI Editing — "The Demo Reel": left column first, tags stagger, right delayed */}
      <section ref={sr(1)} className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, alignItems: "center",
          background: C.s1, border: `1px solid ${C.cyan}18`, borderRadius: 12, padding: "48px 24px", overflow: "hidden",
        }}>
          <div style={{ opacity: v(1) ? 1 : 0, transform: v(1) ? "none" : "translateY(20px)", transition: `all .5s ${EASE}` }}>
            <span className="m" style={{ fontSize: 10, letterSpacing: "0.08em", color: C.cyan, display: "block", marginBottom: 16 }}>
              AI EDITING
            </span>
            <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: 16 }}>
              Already have footage?
            </h2>
            <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.65, marginBottom: 24 }}>
              Upload your raw footage. AI assists with cuts, color, pacing, captions, and audio mixing while keeping manual control available.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {["Auto-cut to music", "Color grade", "Caption sync", "Audio mix", "Hook-body-CTA"].map((tag, ti) => (
                <span key={tag} style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.cyan,
                  background: `${C.cyan}10`, border: `1px solid ${C.cyan}18`,
                  padding: "4px 12px", borderRadius: 4,
                  opacity: v(1) ? 1 : 0, transform: v(1) ? "none" : "translateX(-8px)",
                  transition: `all .35s ${EASE} ${ti * 0.04 + 0.2}s`,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: v(1) ? 1 : 0, transform: v(1) ? "none" : "translateY(20px)", transition: `all .5s ${EASE} 0.2s` }}>
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
              <span style={{ fontSize: 13, color: C.cyan }}>{"↓ AI prepares a working cut"}</span>
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
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.cyan }}>QA</div>
                  <div className="m" style={{ fontSize: 9, color: C.muted }}>review signals</div>
                </div>
              </div>
              <div className="m" style={{ fontSize: 10, color: C.cyan, marginTop: 8 }}>0:38 final · color graded · captions synced · music matched</div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>

      {/* Comparison — "The Two Timelines": cards converge from sides, steps stagger, total last */}
      <section ref={sr(2)} className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", textAlign: "center", marginBottom: 48, opacity: v(2) ? 1 : 0, transition: `opacity .5s ${EASE}` }}>The old way vs. <span style={{ color: C.accent }}>Insturix</span></h2>
        <div className="mkt-compare" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { title: "Fragmented", color: C.red, steps: ["Briefing - scattered", "Drafting - separate", "Editing - separate", "Review - manual", "Publishing - handoff"], total: "Many tools", cost: "more handoffs" },
            { title: "Insturix", color: C.green, steps: ["Brief - captured", "Script - drafted", "Media - assembled", "Analysis - reviewed", "Publishing - prepared"], total: "One workflow", cost: "less context switching" },
          ].map((side, i) => (
            <div key={i} style={{ background: C.s1, border: `1px solid ${side.color}18`, borderRadius: 12, padding: "32px 24px", transform: v(2) ? "none" : `translateX(${i === 0 ? "-40px" : "40px"})`, opacity: v(2) ? 1 : 0, transition: `all .5s ${EASE}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: side.color }} />
                <span style={{ fontSize: 18, fontWeight: 800, color: side.color }}>{side.title}</span>
              </div>
              {side.steps.map((st, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: C.s2, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}`, opacity: v(2) ? 1 : 0, transition: `opacity .35s ${EASE} ${j * 0.06 + 0.15}s` }}>
                  <span style={{ fontSize: 13, color: C.soft }}>{st.split(" - ")[0]}</span>
                  <span className="m" style={{ fontSize: 11, color: side.color }}>{st.split(" - ")[1]}</span>
                </div>
              ))}
              <div style={{ textAlign: "center", marginTop: 16, padding: "16px", background: `${side.color}08`, borderRadius: 8, border: `1px solid ${side.color}12`, opacity: v(2) ? 1 : 0, transform: v(2) ? "none" : "scale(0.9)", transition: `all .5s ${EASE} 0.5s` }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: side.color }}>{side.total}</span>
                <span style={{ fontSize: 13, color: side.color, display: "block", marginTop: 4, opacity: 0.6 }}>and {side.cost}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px" }}><div style={{ height: 1, background: C.border }} /></div>


      {/* Two Paths — "The Fork": cards enter from their respective sides */}
      <section ref={sr(3)} className="mkt-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 48px" }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", marginBottom: 48, opacity: v(3) ? 1 : 0, transition: `opacity .5s ${EASE}` }}>Two paths. Same engine.</h2>
        <div className="mkt-paths" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { t: "For in-house teams", d: "Produce more content without growing the toolchain.", items: ["Chat-based workflow with manual control", "Every output stays close to the brand", "Brief to publish-ready in one place"], c: C.accent },
            { t: "For agencies", d: "Scale across clients with repeatable brand profiles.", items: ["Separate brand config per client", "White-label delivery where supported", "Fewer handoffs across production"], c: C.green },
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
                "--hover-border": `${card.c}20`,
                opacity: v(3) ? 1 : 0,
                transform: v(3) ? "none" : `translateX(${i === 0 ? "-24px" : "24px"})`,
                transition: `all .5s ${EASE} ${i * 0.1}s, border-color .35s ${EASE}, transform .35s ${EASE}`,
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

      {/* CTA — "The Ask": slowest, most deliberate cascade on the page */}
      <section ref={sr(4)} className="mkt-section" style={{ padding: "120px 48px", textAlign: "center", maxWidth: 1120, margin: "0 auto" }}>
        <span className="m" style={{ fontSize: 13, color: C.accent, letterSpacing: "0.08em", display: "block", marginBottom: 24, opacity: v(4) ? 1 : 0, transition: `opacity .35s ${EASE}` }}>
          READY TO START?
        </span>
        <h2 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.035em", marginBottom: 16, opacity: v(4) ? 1 : 0, transform: v(4) ? "none" : "translateY(16px)", transition: `all .5s ${EASE} 0.25s` }}>
          Your vision. Not a version
        </h2>
        <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.55, maxWidth: 480, margin: "0 auto 48px", opacity: v(4) ? 1 : 0, transition: `opacity .35s ${EASE} 0.45s` }}>
          Start with a brief, raw footage, or a campaign idea. Move from concept to publish-ready content in one production workflow.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", pointerEvents: "auto", opacity: v(4) ? 1 : 0, transition: `opacity .35s ${EASE} 0.65s` }}>
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
              animation: v(4) ? `ctaGlow .8s ${EASE} 0.8s both` : "none",
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 28, pointerEvents: "auto", opacity: v(4) ? 1 : 0, transition: `opacity .35s ${EASE} 0.8s` }}>
          <a
            href="https://startupbase.io/products/insturix?utm_source=startupbase&utm_medium=badge&utm_campaign=launch-badge-dark"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Insturix launched on StartupBase"
            style={{ display: "inline-flex", lineHeight: 0 }}
          >
            <img
              src="https://statics.startupbase.io/site/badges/launched-on-sb-dark.svg"
              alt="Launched on StartupBase"
              height={55}
              style={{ height: 55, width: "auto" }}
            />
          </a>
          <a
            href="https://startupbase.io/products/insturix?utm_source=startupbase&utm_medium=badge&utm_campaign=featured-badge-dark"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Insturix featured on StartupBase"
            style={{ display: "inline-flex", lineHeight: 0 }}
          >
            <img
              src="https://statics.startupbase.io/site/badges/featured-on-sb-dark.svg"
              alt="Featured on StartupBase"
              height={55}
              style={{ height: 55, width: "auto" }}
            />
          </a>
        </div>
      </section>
    </div>
  );
}
