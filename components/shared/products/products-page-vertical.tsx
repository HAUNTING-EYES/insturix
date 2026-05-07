"use client";

/**
 * Products Page — "The Studio Tour"
 *
 * Each tool gets a full-viewport section with a BUILT HTML mockup
 * of its interface. Not screenshots. Not descriptions. The workspace itself.
 *
 * The agency owner scrolls through and sees what they'd actually use:
 * Script workspace → Edit workspace → Analyze workspace → etc.
 *
 * RAMS: The mockup IS the feature explanation. Nothing else needed.
 * JOBS: "Can I see myself working in this?" → Yes, here's what you'd see.
 * IVE: One mockup per tool. The interface reveals the capability.
 * VIGNELLI: Every section follows: label + heading + description (left) + mockup (right).
 * MÜLLER-BROCKMANN: The mockup dominates each viewport. ONE focal point.
 */

import React from "react";
import { motion } from "framer-motion";
import { ScriptMockup } from "./mockups/script-mockup";

const EASE = [0.16, 1, 0.3, 1] as const;

// ─── Rooms ──────────────────────────────────────────────────────
// Each room = one tool in the pipeline
type Room = {
  label: string;
  verb: string;
  heading: string;
  description: string;
  output: string;
  color: string;
  mockup: React.ReactNode | null; // null = placeholder until built
};

const rooms: Room[] = [
  {
    label: "STEP 01",
    verb: "Script",
    heading: "Start with a prompt. Get a production-ready script.",
    description:
      "Describe what you want in plain language. The AI brainstorms, outlines, and writes a complete script — structured into acts with hooks, pacing, and CTAs built in.",
    output: "Full script with narration, visual directions, and timing",
    color: "var(--accent-gold)",
    mockup: <ScriptMockup />,
  },
  {
    label: "STEP 02",
    verb: "Edit",
    heading: "Your script becomes a finished video. Automatically.",
    description:
      "The script flows into the editing pipeline: AI generates video clips, layers captions, syncs music to beat drops, applies transitions, and color-grades — all following professional editing rules.",
    output: "Complete video with captions, music, graphics, and transitions",
    color: "var(--status-danger)",
    mockup: null, // TODO: EditMockup
  },
  {
    label: "STEP 03",
    verb: "Analyze",
    heading: "Know what works before you publish.",
    description:
      "Every video gets scored across hook strength, pacing, retention, CTA clarity, and brand fit. You get a number, a verdict, and three timestamped fixes.",
    output: "Quality score, verdict, and three actionable fixes",
    color: "var(--category-purple)",
    mockup: null, // TODO: AnalyzeMockup
  },
  {
    label: "STEP 04",
    verb: "Design",
    heading: "Thumbnails that get clicked. Not guessed.",
    description:
      "The engine generates multiple thumbnail variants, predicts click-through rate for each, and picks the winner. Edit inline — swap text, recolor, tweak without leaving the canvas.",
    output: "Multiple thumbnail variants with predicted CTR",
    color: "var(--category-purple)",
    mockup: null, // TODO: DesignMockup
  },
  {
    label: "STEP 05",
    verb: "Score",
    heading: "Custom music. Royalty-free. Matched to your video.",
    description:
      "Tell it a mood, a genre, or let it listen to your video and compose something that fits. Every track is original, royalty-free, and yours to use anywhere.",
    output: "Original soundtrack matched to your video's pacing",
    color: "var(--category-pink)",
    mockup: null, // TODO: MusicMockup
  },
  {
    label: "STEP 06",
    verb: "Distribute",
    heading: "Published everywhere. One click.",
    description:
      "YouTube, Instagram, TikTok, LinkedIn, X, Facebook — auto-formatted for each platform. Your video, thumbnails, and metadata pushed live simultaneously.",
    output: "Live on 6 platforms with platform-specific formatting",
    color: "var(--status-success)",
    mockup: null, // TODO: DistributeMockup
  },
];

// ─── Animation ──────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const stagger = { visible: { transition: { staggerChildren: 0.12 } } };

// ═══════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════

export function ProductsPage() {
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "96px 48px 48px", textAlign: "center" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
          <motion.span variants={fadeUp} className="mono-label" style={{ display: "block", marginBottom: 24, color: "var(--accent-gold)" }}>
            THE STUDIO
          </motion.span>
          <motion.h1 variants={fadeUp} style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, marginBottom: 16, color: "var(--text-primary)" }}>
            Six rooms. One production floor.
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1.55, maxWidth: 520, margin: "0 auto" }}>
            Walk through each workspace. Every room handles one step of your video production — from idea to published.
          </motion.p>
        </motion.div>
      </section>

      {/* Pipeline nav — quick jump to any room */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 48px 64px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            padding: 4,
            background: "var(--bg-raised)",
            borderRadius: 7,
            border: "1px solid var(--border-subtle)",
            width: "fit-content",
            margin: "0 auto",
          }}
        >
          {rooms.map((room) => (
            <a
              key={room.verb}
              href={`#${room.verb.toLowerCase()}`}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-muted)",
                padding: "8px 16px",
                borderRadius: 4,
                textDecoration: "none",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.background = "var(--bg-deeper)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              {room.verb}
            </a>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 48px" }}>
        <div style={{ height: 1, background: "var(--border-subtle)" }} />
      </div>

      {/* Rooms */}
      {rooms.map((room, i) => (
        <StudioRoom key={room.verb} room={room} index={i} isLast={i === rooms.length - 1} />
      ))}

      {/* Bottom CTA */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 48px 120px", textAlign: "center" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.h2 variants={fadeUp} style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", marginBottom: 16, color: "var(--text-primary)" }}>
            Try the full studio. Free.
          </motion.h2>
          <motion.p variants={fadeUp} style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
            Three minutes from prompt to published video.
          </motion.p>
          <motion.div variants={fadeUp} style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a href="/signup" style={{ background: "var(--accent-gold)", color: "var(--bg-canvas)", padding: "14px 32px", borderRadius: 7, fontSize: 14, fontWeight: 800, textDecoration: "none" }}>
              Start free
            </a>
            <a href="/contactus" style={{ color: "var(--text-secondary)", border: "1px solid var(--border-emphasis)", padding: "13px 32px", borderRadius: 7, fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              Talk to sales
            </a>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDIO ROOM — one per tool
// ═══════════════════════════════════════════════════════════════

function StudioRoom({ room, index, isLast }: { room: Room; index: number; isLast: boolean }) {
  return (
    <section
      id={room.verb.toLowerCase()}
      style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 48px" }}
    >
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
      >
        {/* Room header */}
        <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
          <span className="mono-label" style={{ color: room.color, display: "block", marginBottom: 12 }}>
            {room.label} · {room.verb.toUpperCase()}
          </span>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.15, marginBottom: 12, color: "var(--text-primary)", maxWidth: 560 }}>
            {room.heading}
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 560, marginBottom: 16 }}>
            {room.description}
          </p>
          {/* Output badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "var(--bg-deeper)", borderRadius: 7, border: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: room.color }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {room.output}
            </span>
          </div>
        </motion.div>

        {/* Mockup — the actual workspace */}
        <motion.div variants={fadeUp}>
          {room.mockup || <MockupPlaceholder verb={room.verb} color={room.color} />}
        </motion.div>
      </motion.div>

      {/* Divider */}
      {!isLast && (
        <div style={{ marginTop: 80 }}>
          <div style={{ height: 1, background: "var(--border-subtle)" }} />
        </div>
      )}
    </section>
  );
}

// ─── Placeholder for rooms without mockups yet ──────────────────
function MockupPlaceholder({ verb, color }: { verb: string; color: string }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/10",
        background: "var(--bg-raised)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.4 }} />
      <span style={{ fontSize: 44, fontWeight: 800, color, opacity: 0.06, letterSpacing: "-0.04em" }}>
        {verb}
      </span>
      <span className="mono-label">
        {verb.toUpperCase()} · MOCKUP COMING
      </span>
    </div>
  );
}
