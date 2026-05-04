"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

/**
 * Version B — "The Quiet Factory"
 *
 * Creative direction:
 * - Editorial restraint. Typography IS the design.
 * - Non-linear scroll rhythm (fast prompt, slow script, rapid edit, heavy pause at score).
 * - Chat as floating director notes, not a sidebar log.
 * - Preview dominates. Editor chrome recedes.
 * - No toasts, no confetti, no celebration noise.
 * - Every animation earns its place or dies.
 *
 * Design system: Insturix v1.0 (locked Apr 19 2026)
 * Palette: warm editorial dark, gold accent for decisions only
 * Fonts: Plus Jakarta Sans (400/500/800) + JetBrains Mono (400/500)
 * Spacing: 4/8/12/16/24/32/48/64 only
 * Radius: 4/7/12 only
 * Motion: cubic-bezier(0.16, 1, 0.3, 1) everywhere
 */

// ─── Design tokens ──────────────────────────────────────────────
const C = {
  bg: "#0B0B0A",
  raised: "#0F0F0E",
  deeper: "#131312",
  well: "#1B1A18",
  border: "#1C1B19",
  borderEmph: "#282724",
  text: "#ECE9E1",
  soft: "#B5B2A8",
  muted: "#7A776E",
  dim: "#5F5E5A",
  faint: "#454340",
  gold: "#D4A652",
  green: "#5EC97E",
  red: "#D46A5C",
  purple: "#9088D4",
  pink: "#D088B4",
  cyan: "#5CB8CC",
  stage: "#060605",
} as const;

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Scroll phase mapping (NON-LINEAR) ──────────────────────────
// Key insight: prompt is fast (short), script is slow (reading),
// edit is rapid (energy), analysis PAUSES (weight), publish is fast (confidence)
const PHASES = {
  welcome: [0, 0.05],
  prompt: [0.05, 0.12], // fast — one sentence
  script: [0.12, 0.30], // slow — words need reading time
  edit: [0.30, 0.52], // medium — layered build
  analyze: [0.52, 0.70], // heavy — score reveal deserves weight
  publish: [0.70, 0.82], // fast — confidence
  done: [0.82, 0.92], // hold — let it land
  marketing: [0.92, 1.0],
} as const;

type Phase = keyof typeof PHASES;

function getPhase(pct: number): Phase {
  for (const [phase, [lo, hi]] of Object.entries(PHASES)) {
    if (pct >= lo && pct < hi) return phase as Phase;
  }
  return "marketing";
}

function subProgress(pct: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(1, (pct - lo) / (hi - lo)));
}

// ─── Script lines ───────────────────────────────────────────────
const SCRIPT_LINES = [
  { type: "label" as const, text: "HOOK · 0–3s" },
  { type: "line" as const, text: "Open tight on the product. Fast zoom out." },
  { type: "line" as const, text: "VO: \"What if one product changed everything?\"" },
  { type: "label" as const, text: "BODY · 3–22s" },
  { type: "line" as const, text: "3 feature callouts with kinetic text overlays." },
  { type: "line" as const, text: "B-roll: hands using product, close-ups, team shots." },
  { type: "line" as const, text: "Stat counter animation: 3× ROI at 0:08." },
  { type: "line" as const, text: "Testimonial clip, 4 seconds, lower third." },
  { type: "label" as const, text: "CTA · 22–30s" },
  { type: "line" as const, text: "Logo reveal. Brand sound. URL hold 2.5s. End card." },
];

// ─── Director chat messages (fewer, weightier) ──────────────────
const DIRECTOR_MSGS: { at: number; side: "user" | "ai"; text: string }[] = [
  { at: 0.07, side: "user", text: "Make a 30-second promo for our Q1 product launch" },
  { at: 0.28, side: "ai", text: "Hook-first. 3 acts. 30 seconds tight." },
  { at: 0.45, side: "ai", text: "Cuts locked to beat drops at 0:08 and 0:22." },
  { at: 0.65, side: "ai", text: "91. CTA needs 0.5s more hold — fixing." },
  { at: 0.78, side: "ai", text: "B wins. 5.1% predicted CTR." },
  { at: 0.86, side: "ai", text: "Live everywhere. 8 minutes total." },
];

// ─── Analysis scores ────────────────────────────────────────────
const SCORES = [
  { label: "Hook strength", score: 92 },
  { label: "Pacing", score: 88 },
  { label: "Retention", score: 78 },
  { label: "CTA clarity", score: 95 },
  { label: "Brand match", score: 100 },
];

// ─── Pipeline steps ─────────────────────────────────────────────
const PIPELINE_STEPS = [
  { id: "prompt", label: "Prompt" },
  { id: "script", label: "Script" },
  { id: "edit", label: "Edit" },
  { id: "analyze", label: "Analyze" },
  { id: "publish", label: "Publish" },
];

const PHASE_ORDER: Phase[] = ["welcome", "prompt", "script", "edit", "analyze", "publish", "done", "marketing"];

// ─── Platforms ──────────────────────────────────────────────────
const PLATFORMS = [
  { name: "YouTube", color: "#FF0000" },
  { name: "Instagram", color: "#E1306C" },
  { name: "TikTok", color: C.text },
  { name: "LinkedIn", color: "#0A66C2" },
  { name: "X", color: C.text },
  { name: "Facebook", color: "#1877F2" },
];

// ─── Layers ─────────────────────────────────────────────────────
const LAYERS = [
  { name: "Video", color: C.red, appearsAt: 0.30 },
  { name: "Captions", color: C.green, appearsAt: 0.36 },
  { name: "Music", color: C.pink, appearsAt: 0.40 },
  { name: "Graphics", color: C.purple, appearsAt: 0.44 },
];

// ─── Thumbnails ─────────────────────────────────────────────────
const THUMBS = [
  { label: "A", ctr: "4.2%" },
  { label: "B", ctr: "5.1%" },
  { label: "C", ctr: "3.8%" },
  { label: "D", ctr: "3.2%" },
];

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function LandingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) setPct(el.scrollTop / max);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const phase = getPhase(pct);
  const editorPct = Math.min(1, pct / 0.92); // editor fills 0-92% of scroll
  const showMarketing = pct > 0.90;
  const marketingPct = Math.max(0, (pct - 0.90) / 0.10);

  const elapsed = useMemo(() => {
    if (editorPct < 0.06) return "0:00";
    const t = Math.round(Math.min(1, (editorPct - 0.06) / 0.88) * 480);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }, [editorPct]);

  const visibleMsgs = useMemo(
    () => DIRECTOR_MSGS.filter((m) => pct >= m.at),
    [pct]
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; overflow: hidden; }
        body {
          font-family: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          background: ${C.bg};
          color: ${C.text};
        }
        ::selection { background: rgba(212, 166, 82, 0.18); }
        .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace; }
        ::-webkit-scrollbar { width: 0; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes breathe { 0%, 100% { opacity: 0.02; } 50% { opacity: 0.06; } }
        @keyframes eqBounce { 0%, 100% { transform: scaleY(0.15); } 50% { transform: scaleY(1); } }
      `}</style>

      {/* Scroll driver — invisible tall div */}
      <div
        ref={scrollRef}
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "auto",
          zIndex: 1,
        }}
      >
        <div style={{ height: "2400vh" }} />
      </div>

      {/* ═══ EDITOR SHELL ═══ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          opacity: ready ? (showMarketing ? Math.max(0, 1 - marketingPct * 3) : 1) : 0,
          transform: showMarketing
            ? `scale(${1 - Math.min(marketingPct, 0.8) * 0.04}) translateY(${-Math.min(marketingPct, 0.8) * 20}px)`
            : "none",
          transition: `opacity 0.5s ${EASE}, transform 0.5s ${EASE}`,
        }}
      >
        {/* ─── Topbar ─── */}
        <Topbar phase={phase} elapsed={elapsed} editorPct={editorPct} />

        {/* ─── Main area ─── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left rail — minimal pipeline dots */}
          <Rail phase={phase} pct={pct} />

          {/* Center — preview dominates */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: C.stage,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                padding: 24,
              }}
            >
              <Preview phase={phase} pct={pct} />

              {/* Director chat — floating over preview */}
              {visibleMsgs.length > 0 && phase !== "welcome" && !showMarketing && (
                <DirectorChat messages={visibleMsgs} />
              )}
            </div>

            {/* Timeline — minimal */}
            <TimelineBar phase={phase} pct={pct} />
          </div>
        </div>
      </div>

      {/* ═══ MARKETING SECTION ═══ */}
      {showMarketing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            overflowY: "auto",
            opacity: Math.min(1, marketingPct * 2.5),
            transition: `opacity 0.5s ${EASE}`,
          }}
        >
          <MarketingSection />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TOPBAR
// ═══════════════════════════════════════════════════════════════

function Topbar({
  phase,
  elapsed,
  editorPct,
}: {
  phase: Phase;
  elapsed: string;
  editorPct: number;
}) {
  const phaseLabel: Record<Phase, string> = {
    welcome: "",
    prompt: "Receiving prompt",
    script: "Writing script",
    edit: "Producing video",
    analyze: "Analyzing",
    publish: "Publishing",
    done: "Complete",
    marketing: "",
  };

  const isDone = phase === "done" || phase === "marketing";

  return (
    <div
      style={{
        height: 48,
        background: C.raised,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6 }}>
          {[C.red, C.gold, C.green].map((c, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: c,
                opacity: 0.45,
              }}
            />
          ))}
        </div>
        <Divider />
        <span
          style={{
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: "-0.02em",
          }}
        >
          Insturix
        </span>
        <Divider />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: phase === "welcome" ? C.dim : C.text,
            transition: `color 0.5s ${EASE}`,
          }}
        >
          {phase === "welcome" ? "New project" : "Brand Demo"}
        </span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Running timecode */}
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: isDone ? C.green : editorPct > 0.06 ? C.gold : C.dim,
            transition: `color 0.5s ${EASE}`,
          }}
        >
          {elapsed}
        </span>

        {/* Phase chip */}
        {phase !== "welcome" && phase !== "marketing" && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              padding: "3px 8px",
              borderRadius: 4,
              background: isDone ? `${C.green}14` : `${C.gold}12`,
              color: isDone ? C.green : C.gold,
              fontWeight: 500,
              transition: `all 0.5s ${EASE}`,
            }}
          >
            {phaseLabel[phase]}
          </span>
        )}

        {/* CTA */}
        <button
          style={{
            background: isDone ? C.gold : C.well,
            color: isDone ? C.bg : C.dim,
            border: "none",
            padding: "8px 16px",
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            pointerEvents: "auto",
            transition: `all 0.5s ${EASE}`,
          }}
        >
          {isDone ? "Try with your video" : "Export"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEFT RAIL — minimal pipeline + layers
// ═══════════════════════════════════════════════════════════════

function Rail({ phase, pct }: { phase: Phase; pct: number }) {
  return (
    <div
      style={{
        width: 148,
        background: C.raised,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Pipeline */}
      <div
        style={{
          padding: "16px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: C.dim,
            letterSpacing: "0.08em",
            display: "block",
            marginBottom: 12,
          }}
        >
          PIPELINE
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PIPELINE_STEPS.map((step) => {
            const stepPhase = step.id as Phase;
            const phaseIdx = PHASE_ORDER.indexOf(stepPhase);
            const currentIdx = PHASE_ORDER.indexOf(phase);
            const isDone = currentIdx > phaseIdx;
            const isActive = phase === stepPhase || (stepPhase === "edit" && phase === "edit");

            return (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: isDone
                      ? `${C.green}18`
                      : isActive
                      ? `${C.gold}14`
                      : "transparent",
                    border: `1px solid ${
                      isDone ? `${C.green}30` : isActive ? `${C.gold}30` : C.border
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: `all 0.4s ${EASE}`,
                  }}
                >
                  {isDone && <Check size={8} color={C.green} />}
                  {isActive && !isDone && (
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        background: C.gold,
                      }}
                    />
                  )}
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: isDone ? C.green : isActive ? C.gold : C.dim,
                    transition: `color 0.4s ${EASE}`,
                  }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Layers */}
      <div style={{ flex: 1, padding: "16px 12px" }}>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: C.dim,
            letterSpacing: "0.08em",
            display: "block",
            marginBottom: 12,
            paddingLeft: 4,
          }}
        >
          LAYERS
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {LAYERS.map((layer) => {
            const visible = pct >= layer.appearsAt;
            const active =
              (phase === "edit" && pct >= layer.appearsAt) ||
              phase === "done";

            return (
              <div
                key={layer.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 4,
                  background: active ? C.deeper : "transparent",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateX(0)" : "translateX(-8px)",
                  transition: `all 0.35s ${EASE}`,
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 1.5,
                    background: layer.color,
                    opacity: active ? 1 : 0.3,
                    transition: `opacity 0.35s ${EASE}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: active ? C.text : C.muted,
                    fontWeight: active ? 500 : 400,
                    transition: `all 0.3s ${EASE}`,
                  }}
                >
                  {layer.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW — the heart of the page
// ═══════════════════════════════════════════════════════════════

function Preview({ phase, pct }: { phase: Phase; pct: number }) {
  const editSub = subProgress(pct, ...PHASES.edit);
  const analyzeSub = subProgress(pct, ...PHASES.analyze);
  const scriptSub = subProgress(pct, ...PHASES.script);
  const promptSub = subProgress(pct, ...PHASES.prompt);
  const publishSub = subProgress(pct, ...PHASES.publish);

  // Preview warmth builds during edit phase
  const warmth = phase === "edit" ? editSub * 0.12 : PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf("edit") ? 0.12 : 0;

  return (
    <div
      style={{
        width: "82%",
        maxWidth: 740,
        aspectRatio: "16/9",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        background: `rgb(${10 + warmth * 35}, ${12 + warmth * 18}, ${11 + warmth * 8})`,
        border: phase === "done"
          ? `1px solid ${C.green}12`
          : `1px solid ${C.borderEmph}40`,
        transition: `all 1s ${EASE}`,
      }}
    >
      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)",
          zIndex: 5,
          pointerEvents: "none",
        }}
      />

      {/* ─── WELCOME ─── */}
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
          <div style={{ textAlign: "center", maxWidth: 420, padding: "0 32px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                margin: "0 auto 32px",
                border: `1px solid ${C.borderEmph}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "breathe 4s ease infinite",
              }}
            >
              <Check size={18} color={C.gold} strokeWidth={1.5} />
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
                marginBottom: 16,
              }}
            >
              One prompt.
              <br />
              <span style={{ color: C.gold }}>Entire production.</span>
            </h1>
            <p
              style={{
                fontSize: 14,
                color: C.muted,
                lineHeight: 1.65,
                marginBottom: 32,
              }}
            >
              Watch a complete video get produced as you scroll.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 1,
                  height: 32,
                  background: `linear-gradient(to bottom, transparent, ${C.gold}30)`,
                }}
              />
              <span
                className="mono"
                style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em" }}
              >
                SCROLL TO BEGIN
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── PROMPT ─── */}
      {phase === "prompt" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            animation: "fadeIn 0.5s ease",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: C.gold,
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 24,
              }}
            >
              PROMPT
            </span>
            <p
              style={{
                fontSize: 24,
                fontWeight: 500,
                color: C.soft,
                lineHeight: 1.45,
                letterSpacing: "-0.015em",
                opacity: Math.min(1, promptSub * 2),
                transform: `translateY(${(1 - Math.min(1, promptSub * 2)) * 8}px)`,
                transition: `all 0.4s ${EASE}`,
              }}
            >
              Make a 30-second promo video for our Q1 product launch
            </p>
          </div>
        </div>
      )}

      {/* ─── SCRIPT ─── */}
      {phase === "script" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "32px 40px",
            overflow: "hidden",
            zIndex: 6,
            animation: "fadeIn 0.4s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 10, color: C.gold, letterSpacing: "0.08em" }}
            >
              WRITING SCRIPT
            </span>
            <span className="mono" style={{ fontSize: 10, color: C.dim }}>
              {Math.round(scriptSub * 100)}%
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SCRIPT_LINES.slice(
              0,
              Math.ceil(scriptSub * SCRIPT_LINES.length)
            ).map((line, i) => (
              <div key={i} style={{ animation: `slideRight 0.3s ${EASE} both` }}>
                {line.type === "label" ? (
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: C.gold,
                      letterSpacing: "0.08em",
                      display: "block",
                      marginTop: i > 0 ? 16 : 0,
                      marginBottom: 4,
                    }}
                  >
                    {line.text}
                  </span>
                ) : (
                  <div
                    style={{
                      padding: "8px 16px",
                      background: `${C.text}04`,
                      borderRadius: 8,
                      border: `1px solid ${C.text}06`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: C.soft,
                        lineHeight: 1.55,
                      }}
                    >
                      {line.text}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {/* Cursor */}
            {scriptSub < 0.9 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    width: 2,
                    height: 14,
                    background: C.gold,
                    borderRadius: 1,
                    display: "inline-block",
                    animation: "blink 0.8s step-end infinite",
                  }}
                />
              </div>
            )}
            {/* Complete indicator */}
            {scriptSub >= 0.9 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 16,
                  padding: "8px 12px",
                  background: `${C.green}08`,
                  borderRadius: 8,
                  border: `1px solid ${C.green}12`,
                  animation: `slideUp 0.35s ${EASE} both`,
                }}
              >
                <Check size={12} color={C.green} />
                <span style={{ fontSize: 13, fontWeight: 500, color: C.green }}>
                  Script complete
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── EDIT ─── */}
      {phase === "edit" && (
        <>
          {/* Brand logo */}
          {editSub >= 0.08 && (
            <div
              style={{
                position: "absolute",
                top: 24,
                left: 28,
                zIndex: 7,
                padding: "6px 16px",
                background: `${C.bg}80`,
                borderRadius: 8,
                border: `1px solid ${C.borderEmph}40`,
                animation: `slideUp 0.4s ${EASE} both`,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>
                Insturix
              </span>
            </div>
          )}
          {/* Caption */}
          {editSub >= 0.3 && (
            <div
              style={{
                position: "absolute",
                bottom: 56,
                left: 28,
                right: 28,
                zIndex: 7,
                animation: `slideUp 0.35s ${EASE} both`,
              }}
            >
              <div
                style={{
                  padding: "8px 16px",
                  background: `${C.bg}70`,
                  borderRadius: 8,
                  border: `1px solid ${C.borderEmph}30`,
                  display: "inline-block",
                }}
              >
                <span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>
                  What if one product changed{" "}
                  <span style={{ color: C.gold }}>everything</span>?
                </span>
              </div>
            </div>
          )}
          {/* Music EQ bars */}
          {editSub >= 0.5 && (
            <div
              style={{
                position: "absolute",
                bottom: 60,
                right: 28,
                display: "flex",
                gap: 2,
                alignItems: "flex-end",
                height: 28,
                zIndex: 7,
                animation: "fadeIn 0.5s ease",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 3,
                    borderRadius: 1.5,
                    background: `${C.pink}50`,
                    height: "100%",
                    transformOrigin: "bottom",
                    animation: `eqBounce ${0.35 + i * 0.07}s ease ${i * 0.04}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}
          {/* ROI stat */}
          {editSub >= 0.75 && (
            <div
              style={{
                position: "absolute",
                top: 24,
                right: 28,
                zIndex: 7,
                animation: `slideUp 0.4s ${EASE} both`,
              }}
            >
              <div
                style={{
                  padding: "12px 20px",
                  background: `${C.bg}70`,
                  borderRadius: 8,
                  border: `1px solid ${C.borderEmph}30`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: C.gold,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  3x
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10, color: C.muted, marginTop: 4 }}
                >
                  ROI
                </div>
              </div>
            </div>
          )}
          {/* Timeline cuts */}
          {editSub >= 0.55 && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: 28,
                right: 28,
                display: "flex",
                gap: 2,
                zIndex: 7,
                animation: "fadeIn 0.4s ease",
              }}
            >
              {Array.from({ length: 20 }).map((_, i) => {
                const lit = editSub > 0.55 + (i / 20) * 0.3;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 1.5,
                      background: lit
                        ? i % 5 === 0
                          ? C.gold
                          : C.well
                        : `${C.text}08`,
                      transition: `background 0.2s ${EASE}`,
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── ANALYZE ─── */}
      {phase === "analyze" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: `${C.bg}E0`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.5s ease",
          }}
        >
          <div style={{ width: "68%", maxWidth: 300 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: C.purple,
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 24,
              }}
            >
              ANALYZING
            </span>
            {SCORES.map((sc, i) => {
              if (analyzeSub <= i / SCORES.length) return null;
              const scoreColor = sc.score >= 85 ? C.green : C.gold;
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 16,
                    animation: `slideRight 0.3s ${EASE} both`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.soft }}>
                      {sc.label}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 13,
                        color: scoreColor,
                        fontWeight: 500,
                      }}
                    >
                      {sc.score}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: `${C.text}06`,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 2,
                        background: scoreColor,
                        width: `${sc.score}%`,
                        transition: `width 0.8s ${EASE}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {/* Final score */}
            {analyzeSub > 0.85 && (
              <div
                style={{
                  marginTop: 32,
                  textAlign: "center",
                  animation: `slideUp 0.5s ${EASE} both`,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 44,
                    fontWeight: 500,
                    color: C.green,
                    letterSpacing: "-0.06em",
                    lineHeight: 1,
                  }}
                >
                  91
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    display: "block",
                    marginTop: 8,
                  }}
                >
                  Production quality verified
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── PUBLISH ─── */}
      {phase === "publish" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: `${C.bg}E0`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.4s ease",
          }}
        >
          <div style={{ width: "62%", maxWidth: 260 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: C.green,
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 16,
              }}
            >
              PUBLISHING
            </span>
            {PLATFORMS.map((p, i) => {
              const live = publishSub > (i / PLATFORMS.length) * 0.85;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: C.deeper,
                    borderRadius: 7,
                    marginBottom: 4,
                    border: live
                      ? `1px solid ${C.green}18`
                      : `1px solid ${C.border}`,
                    opacity: live ? 1 : 0.2,
                    transition: `all 0.4s ${EASE}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: p.color,
                        opacity: 0.6,
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.name}
                    </span>
                  </div>
                  {live && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        animation: "fadeIn 0.3s ease",
                      }}
                    >
                      <Check size={10} color={C.green} />
                      <span
                        className="mono"
                        style={{ fontSize: 10, color: C.green }}
                      >
                        Live
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DONE ─── */}
      {phase === "done" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 8,
            background: `${C.bg}B0`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.5s ease",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                margin: "0 auto 24px",
                background: `${C.green}10`,
                border: `1px solid ${C.green}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: `slideUp 0.5s ${EASE} 0.1s both`,
                opacity: 0,
              }}
            >
              <Check size={24} color={C.green} />
            </div>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.035em",
                lineHeight: 1.1,
                marginBottom: 12,
                animation: `slideUp 0.5s ${EASE} 0.2s both`,
                opacity: 0,
              }}
            >
              One prompt. Entire production.
            </h2>
            <p
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: C.green,
                marginBottom: 8,
                animation: `slideUp 0.5s ${EASE} 0.35s both`,
                opacity: 0,
              }}
            >
              8 minutes. $47 spent. $2,353 saved.
            </p>
            <p
              style={{
                fontSize: 13,
                color: C.muted,
                marginBottom: 32,
                animation: `slideUp 0.5s ${EASE} 0.45s both`,
                opacity: 0,
              }}
            >
              Keep scrolling to learn more.
            </p>
            <div
              style={{
                animation: `slideUp 0.5s ${EASE} 0.55s both`,
                opacity: 0,
                pointerEvents: "auto",
              }}
            >
              <button
                style={{
                  background: C.gold,
                  color: C.bg,
                  border: "none",
                  padding: "12px 32px",
                  borderRadius: 7,
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
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DIRECTOR CHAT — floating over preview, not a sidebar
// ═══════════════════════════════════════════════════════════════

function DirectorChat({
  messages,
}: {
  messages: typeof DIRECTOR_MSGS;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: -200,
        width: 192,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 10,
      }}
    >
      {messages.slice(-3).map((m, i) => {
        const isLatest = i === messages.slice(-3).length - 1;
        return (
          <div
            key={`${m.at}-${i}`}
            style={{
              padding: m.side === "user" ? "8px 12px" : "6px 12px",
              borderRadius: m.side === "user" ? "8px 8px 4px 8px" : "4px 8px 8px 8px",
              background: m.side === "user" ? C.gold : C.raised,
              border: m.side === "user" ? "none" : `1px solid ${C.border}`,
              color: m.side === "user" ? C.bg : C.soft,
              fontSize: 11,
              fontWeight: m.side === "user" ? 500 : 400,
              lineHeight: 1.45,
              opacity: isLatest ? 1 : 0.4,
              transition: `opacity 0.4s ${EASE}`,
              animation: isLatest ? `slideUp 0.3s ${EASE} both` : "none",
            }}
          >
            {m.text}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE BAR — minimal strip at bottom
// ═══════════════════════════════════════════════════════════════

function TimelineBar({ phase, pct }: { phase: Phase; pct: number }) {
  const tracks = [
    { label: "V", color: C.red, lo: 0.30, hi: 0.52 },
    { label: "C", color: C.green, lo: 0.36, hi: 0.52 },
    { label: "M", color: C.pink, lo: 0.40, hi: 0.52 },
    { label: "G", color: C.purple, lo: 0.44, hi: 0.52 },
  ];

  return (
    <div
      style={{
        height: 64,
        background: C.raised,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        padding: "8px 16px",
        gap: 2,
      }}
    >
      {tracks.map((t) => {
        const visible = pct >= t.lo;
        const fill = Math.max(0, Math.min(1, (pct - t.lo) / (t.hi - t.lo)));
        return (
          <div
            key={t.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 10,
              opacity: visible ? 1 : 0,
              transition: `opacity 0.3s ${EASE}`,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 9, color: C.dim, width: 12, textAlign: "right" }}
            >
              {t.label}
            </span>
            <div
              style={{
                flex: 1,
                height: "100%",
                background: C.deeper,
                borderRadius: 2,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 1,
                  bottom: 1,
                  width: `${fill * 100}%`,
                  background: `${t.color}25`,
                  border: `1px solid ${t.color}35`,
                  borderRadius: 2,
                  transition: `width 0.2s ${EASE}`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MARKETING SECTION
// ═══════════════════════════════════════════════════════════════

function MarketingSection() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingTop: 48 }}>
      {/* Stats */}
      <section
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "64px 48px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 2,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {[
            { value: "40%", label: "Lower cost", sub: "vs. agencies" },
            { value: "10x", label: "Faster", sub: "prompt to published" },
            { value: "$2,353", label: "Saved per video", sub: "vs. traditional" },
            { value: "8 min", label: "Average production", sub: "complete video" },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: i % 2 === 0 ? `${C.bg}` : C.raised,
                border: `1px solid ${C.border}`,
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: "-0.05em",
                  color: C.gold,
                  lineHeight: 1,
                  marginBottom: 12,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 13, color: C.dim }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 48px",
        }}
      >
        <div style={{ height: 1, background: C.border }} />
      </div>

      {/* Before/After */}
      <section
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "80px 48px",
        }}
      >
        <h2
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          The old way vs.{" "}
          <span style={{ color: C.gold }}>Insturix</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              title: "Traditional",
              color: C.red,
              steps: [
                ["Brief freelancer", "2 hours"],
                ["Wait for draft", "3 days"],
                ["Revision round 1", "2 days"],
                ["Revision round 2", "1 day"],
                ["Final export", "2 hours"],
              ],
              total: "~6 days",
              cost: "$2,400",
            },
            {
              title: "Insturix",
              color: C.green,
              steps: [
                ["Type your prompt", "30 seconds"],
                ["AI writes script", "48 seconds"],
                ["AI produces video", "4 minutes"],
                ["AI analyzes + optimizes", "45 seconds"],
                ["Published to 6 platforms", "1 minute"],
              ],
              total: "~8 minutes",
              cost: "$47",
            },
          ].map((side, i) => (
            <div
              key={i}
              style={{
                background: C.raised,
                border: `1px solid ${side.color}18`,
                borderRadius: 12,
                padding: "32px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: side.color,
                  }}
                />
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: side.color,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {side.title}
                </span>
              </div>
              {side.steps.map(([step, time], j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: C.deeper,
                    borderRadius: 7,
                    marginBottom: 4,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: C.soft }}>{step}</span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: side.color }}
                  >
                    {time}
                  </span>
                </div>
              ))}
              <div
                style={{
                  textAlign: "center",
                  marginTop: 16,
                  padding: "16px",
                  background: `${side.color}08`,
                  borderRadius: 8,
                  border: `1px solid ${side.color}12`,
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: side.color,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {side.total}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: side.color,
                    display: "block",
                    marginTop: 4,
                    opacity: 0.6,
                  }}
                >
                  and {side.cost} spent
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 48px",
        }}
      >
        <div style={{ height: 1, background: C.border }} />
      </div>

      {/* Two paths */}
      <section
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "80px 48px",
        }}
      >
        <h2
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            marginBottom: 48,
          }}
        >
          Two paths. Same engine.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              t: "For brand teams",
              d: "Produce 10x more content without growing headcount.",
              items: [
                "Chat-based editing — no skills needed",
                "Every output matches your brand",
                "Script to published in hours, not weeks",
              ],
              c: C.gold,
            },
            {
              t: "For agencies",
              d: "Scale across every client. 40% lower cost.",
              items: [
                "Separate brand config per client",
                "White-label delivery",
                "40% below market rate",
              ],
              c: C.green,
            },
          ].map((card, i) => (
            <div
              key={i}
              style={{
                background: C.raised,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "32px 32px",
              }}
            >
              <h3
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  marginBottom: 12,
                }}
              >
                {card.t}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: C.muted,
                  lineHeight: 1.65,
                  marginBottom: 32,
                }}
              >
                {card.d}
              </p>
              {card.items.map((item, j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      background: card.c,
                      marginTop: 8,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      color: C.soft,
                      lineHeight: 1.55,
                    }}
                  >
                    {item}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 32, pointerEvents: "auto" }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: card.c,
                    cursor: "pointer",
                  }}
                >
                  Learn more →
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 48px",
        }}
      >
        <div style={{ height: 1, background: C.border }} />
      </div>

      {/* Final CTA */}
      <section
        style={{
          padding: "120px 48px",
          textAlign: "center",
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            marginBottom: 16,
          }}
        >
          Your next video is a
          <br />
          conversation away.
        </h2>
        <p
          style={{
            fontSize: 14,
            color: C.muted,
            lineHeight: 1.65,
            maxWidth: 400,
            margin: "0 auto 48px",
          }}
        >
          Free to start. Three minutes to first video.
        </p>
        <div style={{ pointerEvents: "auto" }}>
          <button
            style={{
              background: C.gold,
              color: C.bg,
              border: "none",
              padding: "14px 40px",
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Start free
          </button>
        </div>
        <p
          style={{
            marginTop: 48,
            fontSize: 13,
            color: C.faint,
          }}
        >
          Insturix — Building Future, Together.
        </p>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function Check({
  size = 14,
  color = C.gold,
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l5 5L19 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        background: C.border,
        margin: "0 4px",
      }}
    />
  );
}
