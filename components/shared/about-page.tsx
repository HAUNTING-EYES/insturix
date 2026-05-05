"use client";

/**
 * About Page — v6
 *
 * Phase A: Bigger cards with falling/chaos animation, repeatable viewport animations
 * Phase B: Tagline updated to "Prompt or footage. Professional either way."
 */

import React, { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Upload, FileText, Users, Video, Film, MessageSquare, Palette, Globe } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

const TOOLS = [
  { name: "Google Docs", desc: "Briefing, planning, and alignment across stakeholders", cumDays: 1, icon: FileText, color: "var(--accent-gold)" },
  { name: "Freelancer", desc: "Back-and-forth scripting with external writers", cumDays: 5, icon: Users, color: "var(--accent-gold)" },
  { name: "Camera / Runway", desc: "Shooting raw footage or generating AI clips", cumDays: 15, icon: Video, color: "var(--status-danger)" },
  { name: "Adobe Premiere", desc: "Manual cuts, color grading, audio sync, titles", cumDays: 19, icon: Film, color: "var(--category-purple)" },
  { name: "Frame.io", desc: "Review rounds, timestamp comments, re-exports", cumDays: 22, icon: MessageSquare, color: "var(--category-cyan)" },
  { name: "Canva", desc: "Thumbnail design, A/B variants, brand compliance", cumDays: 23, icon: Palette, color: "var(--category-pink)" },
  { name: "Manual upload ×6", desc: "Reformat and publish to each platform individually", cumDays: 23, icon: Globe, color: "var(--status-success)" },
];

const ROOMS = [
  { verb: "Script", color: "var(--accent-gold)" },
  { verb: "Edit", color: "var(--status-danger)" },
  { verb: "Analyze", color: "var(--category-purple)" },
  { verb: "Design", color: "var(--category-cyan)" },
  { verb: "Distribute", color: "var(--status-success)" },
  { verb: "Share", color: "var(--category-pink)" },
];

const BELIEFS = [
  {
    statement: "One platform. Not ten.",
    supporting: "Everything your team needs to produce content. Six rooms, one production floor — script to publish without switching tools.",
  },
  {
    statement: "Edit your footage. Not just generate.",
    supporting: "Upload raw footage. AI applies professional cuts, color grading, pacing, audio mixing — the same decisions a senior editor makes. Generate from scratch or edit what you already shot.",
  },
  {
    statement: "Built for businesses. Built for scale.",
    supporting: "One video or a hundred. Same quality. Same speed. The platform that grows with your content needs, not against them.",
  },
  {
    statement: "Reliable means predictable.",
    supporting: "Same input, same output. Every single time. No randomness, no surprises — that’s the standard for production-grade tools.",
  },
];

const JOURNEY = [
  { date: "2024", title: "The idea", description: "Watched teams spend weeks producing what should take minutes." },
  { date: "Early 2025", title: "First prototype", description: "Built the first AI-native editing pipeline. Script to video in one pass." },
  { date: "Mid 2025", title: "Six rooms take shape", description: "Script, Edit, Analyze, Design, Distribute, Share — the full production floor." },
  { date: "Late 2025", title: "Private beta", description: "First teams run real client work through the platform." },
  { date: "2026", title: "Public launch", description: "Opening the production floor to every business that creates content." },
];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
const scaleFadeIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE } },
};

// =====================================================================

export function AboutPage() {
  return (
    <main style={{ background: "var(--bg-canvas)", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "96px 24px 48px", textAlign: "center" }}>
        <motion.span
          initial="hidden" whileInView="visible"
          viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 24 }}
        >
          THE PROBLEM
        </motion.span>
        <motion.h1
          initial="hidden" whileInView="visible"
          viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text-primary)", margin: "0 0 16px" }}
        >
          Content production is broken.
        </motion.h1>
        <motion.p
          initial="hidden" whileInView="visible"
          viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}
        >
          Seven tools. Three weeks. Thousands of dollars. For one video.
        </motion.p>
      </section>

      <ToolAccumulation />

      {/* The Revolution */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px" }}>
        <motion.div
          initial="hidden" whileInView="visible"
          viewport={{ margin: "-64px" }} variants={scaleFadeIn}
          style={{ padding: "48px 32px", border: "1px solid var(--border-subtle)", borderRadius: 12, background: "var(--bg-raised)", overflow: "hidden" }}
        >
          <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={staggerContainer}>
            <motion.h2 variants={fadeIn} style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 32, textAlign: "center" }}>
              The Revolution
            </motion.h2>

            <motion.div variants={fadeUp} style={{ maxWidth: 520, margin: "0 auto 24px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ padding: "12px 16px", background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)", borderRadius: 7, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--accent-gold)", letterSpacing: "0.08em" }}>PROMPT</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>&quot;Launch video for premium coffee brand&quot;</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              </div>
              <div style={{ padding: "12px 16px", background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)", borderRadius: 7, display: "flex", alignItems: "center", gap: 12 }}>
                <Upload size={14} style={{ color: "var(--category-cyan)", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--category-cyan)", letterSpacing: "0.08em" }}>UPLOAD</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>product-shoot-raw.mp4</span>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginLeft: "auto" }}>260 MB</span>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} style={{ textAlign: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>{"↓"}</span>
            </motion.div>

            <motion.div variants={fadeUp} style={{ maxWidth: 480, margin: "0 auto 16px", display: "flex", gap: 4 }}>
              {ROOMS.map((room, i) => (
                <motion.div
                  key={room.verb}
                  initial={{ scaleX: 0, opacity: 0 }}
                  whileInView={{ scaleX: 1, opacity: 1 }}
                  viewport={{}}
                  transition={{ duration: 0.35, delay: 0.4 + i * 0.12, ease: EASE }}
                  style={{ flex: 1, height: 4, borderRadius: 4, background: room.color, opacity: 0.7, transformOrigin: "left center" }}
                />
              ))}
            </motion.div>
            <motion.div variants={fadeUp} style={{ maxWidth: 480, margin: "0 auto 32px", display: "flex", gap: 4 }}>
              {ROOMS.map((room) => (
                <span key={room.verb} style={{ flex: 1, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", textAlign: "center" }}>{room.verb}</span>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} style={{ maxWidth: 480, margin: "0 auto 32px", display: "flex", justifyContent: "center", gap: 24 }}>
              <OutputStat label="TIME" value="8 min" />
              <OutputStat label="SCORE" value="91/100" color="var(--status-success)" />
              <OutputStat label="PLATFORMS" value="6" />
            </motion.div>

            <motion.p variants={fadeUp} style={{ fontSize: 14, color: "var(--text-secondary)", textAlign: "center", margin: 0, lineHeight: 1.6 }}>
              Prompt or footage. Professional either way.
            </motion.p>
          </motion.div>
        </motion.div>
      </section>

      {/* Beliefs */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px" }}>
        <motion.span initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 48, textAlign: "center" }}>
          WHAT WE BELIEVE
        </motion.span>
        <div style={{ display: "flex", flexDirection: "column", gap: 64, maxWidth: 640, margin: "0 auto" }}>
          {BELIEFS.map((belief) => (
            <motion.div key={belief.statement} initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={staggerContainer} style={{ textAlign: "center" }}>
              <motion.h2 variants={fadeUp} style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, color: "var(--text-primary)", margin: "0 0 16px" }}>
                {belief.statement}
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                {belief.supporting}
              </motion.p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Journey */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px" }}>
        <motion.span initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 48, textAlign: "center" }}>
          THE JOURNEY
        </motion.span>
        <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
          <JourneyLine />
          {JOURNEY.map((m, i) => (
            <motion.div key={m.date} initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={staggerContainer}
              style={{ display: "grid", gridTemplateColumns: "80px 16px 1fr", gap: 16, alignItems: "start", marginBottom: i < JOURNEY.length - 1 ? 48 : 0, position: "relative" }}>
              <motion.span variants={fadeUp} style={{ fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)", color: "var(--text-dim)", textAlign: "right", paddingTop: 4 }}>{m.date}</motion.span>
              <motion.div variants={scaleFadeIn} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-gold)", marginTop: 8, position: "relative", zIndex: 2 }} />
              <motion.div variants={fadeUp}>
                <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: "0 0 4px" }}>{m.title}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{m.description}</p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px 96px", textAlign: "center" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={staggerContainer}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
          <motion.h2 variants={fadeUp} style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
            Prompt or footage.<br />Professional either way.
          </motion.h2>
          <motion.div variants={fadeUp} style={{ display: "flex", gap: 16 }}>
            <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", background: "var(--accent-gold)", color: "var(--bg-canvas)", fontSize: 13, fontWeight: 500, borderRadius: 7, textDecoration: "none", transition: `opacity 0.25s ${EASE_CSS}` }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
              See the floor <ArrowRight size={14} />
            </Link>
            <Link href="/careers" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", border: "1px solid var(--border-emphasis)", background: "transparent", color: "var(--text-primary)", fontSize: 13, fontWeight: 500, borderRadius: 7, textDecoration: "none", transition: `background 0.25s ${EASE_CSS}, border-color 0.25s ${EASE_CSS}` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-deeper)"; e.currentTarget.style.borderColor = "var(--text-dim)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}>
              Build with us <ArrowRight size={14} />
            </Link>
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}

// =====================================================================
// TOOL ACCUMULATION — cards fall from above creating chaos
// =====================================================================

function ToolAccumulation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollable = containerRef.current.offsetHeight - window.innerHeight;
      const pct = Math.max(0, Math.min(1, -rect.top / scrollable));
      setScrollPct(pct);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toolCount = TOOLS.length;
  const visibleCount = Math.min(toolCount, Math.floor(scrollPct * (toolCount + 1)));

  const progress = scrollPct * (toolCount + 1);
  const idx = Math.max(0, Math.min(toolCount - 1, Math.floor(progress)));
  const frac = Math.min(1, progress - idx);
  let smoothDay = 0;
  if (visibleCount > 0) {
    const prev = idx > 0 ? TOOLS[idx - 1].cumDays : 0;
    const curr = TOOLS[idx].cumDays;
    smoothDay = Math.round(prev + frac * (curr - prev));
  }

  const showCost = scrollPct > 0.92;

  // Rotation per card — deterministic chaos
  const rotations = [-2.5, 1.8, -1.2, 2.4, -0.8, 1.5, -2];

  return (
    <div ref={containerRef} style={{ height: "420vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 64,
        height: "calc(100vh - 128px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        maxWidth: 1080, margin: "0 auto", padding: "0 24px",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, width: "100%", alignItems: "center" }}>

          {/* Left: Falling tool cards */}
          <div style={{ position: "relative", minHeight: 560 }}>
            {TOOLS.map((tool, i) => {
              const isVisible = i < visibleCount;
              const stackY = i * 24;
              const stackX = (i % 2) * 12 - 4;
              const rot = rotations[i];
              const Icon = tool.icon;
              const dayDelta = i === 0 ? tool.cumDays : tool.cumDays - TOOLS[i - 1].cumDays;
              return (
                <div
                  key={tool.name}
                  style={{
                    position: "absolute",
                    top: stackY,
                    left: stackX,
                    right: -stackX,
                    padding: "20px 24px",
                    background: "var(--bg-raised)",
                    border: `1px solid ${isVisible ? "var(--border-emphasis)" : "var(--border-subtle)"}`,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible
                      ? `translateY(0) rotate(${rot}deg) scale(1)`
                      : `translateY(-80px) rotate(${rot - 8}deg) scale(0.88)`,
                    transition: `all 0.5s ${EASE_CSS}`,
                    zIndex: i,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: "var(--bg-deeper)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    border: `1px solid var(--border-subtle)`,
                  }}>
                    <Icon size={24} style={{ color: tool.color }} />
                  </div>
                  {/* Name + desc */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 18, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
                      {tool.name}
                    </span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.4 }}>
                      {tool.desc}
                    </span>
                  </div>
                  {/* Day badge */}
                  <span style={{
                    fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500,
                    color: tool.color,
                    background: "var(--bg-deeper)",
                    padding: "4px 12px", borderRadius: 4, whiteSpace: "nowrap",
                    border: `1px solid var(--border-subtle)`,
                  }}>
                    +{dayDelta}{dayDelta === 1 ? " day" : " days"}
                  </span>
                </div>
              );
            })}

            {/* Cost */}
            <div style={{
              position: "absolute", bottom: -16, left: 0, right: 0, textAlign: "center",
              opacity: showCost ? 1 : 0,
              transform: showCost ? "translateY(0)" : "translateY(8px)",
              transition: `all 0.35s ${EASE_CSS}`,
            }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: "var(--status-danger)", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
                $2,000+
              </span>
            </div>
          </div>

          {/* Right: Day counter */}
          <div style={{ textAlign: "center" }}>
            <span style={{
              display: "block", fontFamily: "var(--font-mono)",
              fontSize: 10, fontWeight: 500, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 16,
              opacity: visibleCount > 0 ? 1 : 0,
              transition: `opacity 0.25s ${EASE_CSS}`,
            }}>
              TIME ELAPSED
            </span>

            <span style={{
              display: "block", fontSize: 110, fontWeight: 800,
              fontFamily: "var(--font-mono)", letterSpacing: "-0.06em", lineHeight: 1,
              color: smoothDay > 15 ? "var(--status-danger)" : smoothDay > 5 ? "var(--text-primary)" : "var(--text-secondary)",
              transition: `color 0.5s ${EASE_CSS}`,
            }}>
              {smoothDay}
            </span>

            <span style={{
              display: "block", fontSize: 18, fontWeight: 500,
              color: "var(--text-secondary)", marginTop: 8,
              opacity: visibleCount > 0 ? 1 : 0,
            }}>
              {smoothDay === 1 ? "day" : "days"}
            </span>

            <span style={{
              display: "block", fontSize: 13, fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)", marginTop: 24,
              opacity: visibleCount > 0 ? 1 : 0,
              transition: `opacity 0.25s ${EASE_CSS}`,
            }}>
              {visibleCount} {visibleCount === 1 ? "tool" : "tools"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================

function OutputStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <span style={{ display: "block", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 4 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--font-mono)", color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function JourneyLine() {
  const lineRef = useRef<HTMLDivElement>(null);
  const [drawPct, setDrawPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      if (!lineRef.current) return;
      const rect = lineRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      setDrawPct(Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.4) / (vh * 0.5))));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={lineRef} style={{ position: "absolute", left: 99, top: 8, bottom: 8, width: 1, background: "var(--border-subtle)", zIndex: 1 }}>
      <div style={{ width: "100%", height: `${drawPct * 100}%`, background: "var(--accent-gold)", transition: "height 0.1s linear", opacity: 0.4 }} />
    </div>
  );
}
