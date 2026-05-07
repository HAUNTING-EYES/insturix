"use client";

/**
 * MobileHomepage — Simplified mobile-optimized homepage
 *
 * Option B: Instead of the complex scroll-driven editor demo (unusable on phones),
 * this shows a compact pipeline visualization, key stats, marketing sections, and CTA.
 *
 * Design system compliance:
 *  - All colors via CSS custom properties (design-tokens.css)
 *  - No gradients, no blur, no shadows
 *  - Plus Jakarta Sans + JetBrains Mono
 *  - Gold accent for primary CTA only
 *  - All animations whileInView, NO once: true
 *  - cubic-bezier(0.16, 1, 0.3, 1) easing
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────

const EASE = [0.16, 1, 0.3, 1] as const;

const PIPELINE_PHASES = [
  { name: "Input", description: "Upload footage or describe your vision", color: "var(--accent-gold)" },
  { name: "Script", description: "AI writes and structures your narrative", color: "var(--accent-gold)" },
  { name: "Edit", description: "Intelligent cuts, pacing, and assembly", color: "var(--status-danger)" },
  { name: "Analyze", description: "Quality scoring and content analysis", color: "var(--category-purple)" },
  { name: "Design", description: "Motion graphics, titles, and overlays", color: "var(--category-cyan)" },
  { name: "Publish", description: "Multi-platform export and delivery", color: "var(--status-success)" },
] as const;

const STATS = [
  { number: "40%", label: "lower cost vs agencies" },
  { number: "10x", label: "faster, prompt to published" },
  { number: "$2,353", label: "saved per video" },
  { number: "8 min", label: "average production" },
] as const;

const AI_CAPABILITIES = ["Auto-cut", "Color grade", "Caption sync", "Audio mix", "Hook-body-CTA"] as const;

const OLD_WAY_STEPS = [
  { step: "Brief the agency", time: "1 day" },
  { step: "Script revisions", time: "2 days" },
  { step: "Shoot or source footage", time: "1 day" },
  { step: "Edit rounds", time: "1.5 days" },
  { step: "Final approval", time: "0.5 days" },
] as const;

const NEW_WAY_STEPS = [
  { step: "Describe your video", time: "30 sec" },
  { step: "AI generates script", time: "45 sec" },
  { step: "Pipeline produces video", time: "5 min" },
  { step: "Review & adjust", time: "2 min" },
  { step: "Export & publish", time: "10 sec" },
] as const;

const BRAND_BULLETS = [
  "Consistent brand voice across every video",
  "From brief to published in under 10 minutes",
  "No freelancer coordination or revision cycles",
] as const;

const AGENCY_BULLETS = [
  "White-label production for your clients",
  "Handle 10x the volume with the same team",
  "Per-brand style profiles and guardrails",
] as const;

// ─── Animation helpers ──────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { amount: 0.3 },
  transition: { duration: 0.5, ease: EASE },
};

const staggerChild = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { amount: 0.2 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.08 },
});

// ─── Component ──────────────────────────────────────────────────

export function MobileHomepage() {
  return (
    <main
      style={{
        background: "var(--bg-canvas)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        overflowX: "hidden",
      }}
    >
      {/* ── 1. Hero ── */}
      <section
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px",
          textAlign: "center",
        }}
      >
        <motion.h1
          {...fadeUp}
          style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, margin: 0 }}
        >
          One platform.
          <br />
          <span style={{ color: "var(--accent-gold)" }}>Entire production.</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginTop: 16,
            marginBottom: 32,
          }}
        >
          Watch a complete video get produced.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.2 }}
          style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}
        >
          <Link
            href="/signup"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--accent-gold)",
              color: "var(--bg-canvas)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 24px",
              borderRadius: 7,
              textDecoration: "none",
            }}
          >
            Get started <ArrowRight size={16} />
          </Link>
          <Link
            href="/products"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 24px",
              borderRadius: 7,
              border: "1px solid var(--border-emphasis)",
              textDecoration: "none",
            }}
          >
            See products
          </Link>
        </motion.div>
      </section>

      {/* ── 2. Pipeline strip ── */}
      <section style={{ padding: "48px 24px" }}>
        <motion.h2
          {...fadeUp}
          style={{ fontSize: 18, fontWeight: 800, margin: 0, marginBottom: 32 }}
        >
          The production pipeline
        </motion.h2>

        <div style={{ position: "relative", paddingLeft: 24 }}>
          {/* Vertical connecting line */}
          <div
            style={{
              position: "absolute",
              left: 7,
              top: 8,
              bottom: 8,
              width: 1,
              background: "var(--border-emphasis)",
            }}
          />

          {PIPELINE_PHASES.map((phase, i) => (
            <motion.div
              key={phase.name}
              {...staggerChild(i)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                marginBottom: i < PIPELINE_PHASES.length - 1 ? 24 : 0,
                position: "relative",
              }}
            >
              {/* Colored dot */}
              <div
                style={{
                  position: "absolute",
                  left: -20,
                  top: 4,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: phase.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {phase.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                  {phase.description}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 3. Stats section ── */}
      <section style={{ padding: "48px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              {...staggerChild(i)}
              style={{
                background: "var(--bg-raised)",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800 }}>{stat.number}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 4. AI editing callout ── */}
      <section style={{ padding: "48px 24px" }}>
        <motion.div {...fadeUp}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--category-cyan)",
              letterSpacing: "0.05em",
            }}
          >
            AI EDITING
          </span>
        </motion.div>

        <motion.h2
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          style={{ fontSize: 24, fontWeight: 500, marginTop: 12, marginBottom: 12 }}
        >
          Already have footage?
        </motion.h2>

        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}
        >
          Upload your raw clips and let our AI handle the edit. Auto-cutting, color grading,
          caption sync, audio mixing, and narrative structure — all in one pass.
        </motion.p>

        {/* Capability pills */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.15 }}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}
        >
          {AI_CAPABILITIES.map((cap) => (
            <span
              key={cap}
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid var(--border-emphasis)",
              }}
            >
              {cap}
            </span>
          ))}
        </motion.div>

        {/* Before / After inline */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.2 }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* RAW */}
          <div
            style={{
              background: "var(--bg-well)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                marginBottom: 8,
                letterSpacing: "0.05em",
              }}
            >
              RAW FOOTAGE
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Interview_01.mp4", "Broll_03.mov", "Screen_rec.mp4", "Outro_v2.mp4"].map(
                (clip) => (
                  <span
                    key={clip}
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-dim)",
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "var(--bg-deeper)",
                    }}
                  >
                    {clip}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Arrow */}
          <div style={{ textAlign: "center", color: "var(--text-dim)" }}>
            <ArrowRight size={16} style={{ transform: "rotate(90deg)" }} />
          </div>

          {/* FINAL CUT */}
          <div
            style={{
              background: "var(--bg-well)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                FINAL CUT
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                Brand_Video_Final.mp4
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--status-success)",
              }}
            >
              91
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── 5. Before / After comparison ── */}
      <section style={{ padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <motion.h2
          {...fadeUp}
          style={{ fontSize: 18, fontWeight: 800, margin: 0, marginBottom: 16 }}
        >
          The difference
        </motion.h2>

        {/* Old way */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          style={{
            background: "var(--bg-raised)",
            borderRadius: 12,
            padding: 24,
            borderLeft: "3px solid var(--status-danger)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>The old way</div>
          {OLD_WAY_STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom:
                  i < OLD_WAY_STEPS.length - 1 ? "1px solid var(--border-subtle)" : "none",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.step}</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                {s.time}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border-emphasis)",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger)" }}>
              ~6 days
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger)" }}>
              $2,400
            </span>
          </div>
        </motion.div>

        {/* New way */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          style={{
            background: "var(--bg-raised)",
            borderRadius: 12,
            padding: 24,
            borderLeft: "3px solid var(--status-success)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Insturix</div>
          {NEW_WAY_STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom:
                  i < NEW_WAY_STEPS.length - 1 ? "1px solid var(--border-subtle)" : "none",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.step}</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                {s.time}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border-emphasis)",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--status-success)" }}>
              ~8 minutes
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--status-success)" }}>
              $47
            </span>
          </div>
        </motion.div>
      </section>

      {/* ── 6. Two paths ── */}
      <section style={{ padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <motion.h2
          {...fadeUp}
          style={{ fontSize: 18, fontWeight: 800, margin: 0, marginBottom: 16 }}
        >
          Built for your workflow
        </motion.h2>

        {/* Brand teams */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          style={{
            background: "var(--bg-raised)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>For brand teams</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {BRAND_BULLETS.map((b, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  paddingLeft: 16,
                  position: "relative",
                  marginBottom: i < BRAND_BULLETS.length - 1 ? 8 : 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    color: "var(--accent-gold)",
                  }}
                >
                  -
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Link
            href="/contactus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--accent-gold)",
              textDecoration: "none",
              marginTop: 16,
            }}
          >
            Get in touch <ArrowRight size={14} />
          </Link>
        </motion.div>

        {/* Agencies */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          style={{
            background: "var(--bg-raised)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>For agencies</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {AGENCY_BULLETS.map((b, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  paddingLeft: 16,
                  position: "relative",
                  marginBottom: i < AGENCY_BULLETS.length - 1 ? 8 : 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    color: "var(--accent-gold)",
                  }}
                >
                  -
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Link
            href="/contactus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--accent-gold)",
              textDecoration: "none",
              marginTop: 16,
            }}
          >
            Get in touch <ArrowRight size={14} />
          </Link>
        </motion.div>
      </section>

      {/* ── 7. CTA ── */}
      <section
        style={{
          padding: "64px 24px",
          textAlign: "center",
        }}
      >
        <motion.h2
          {...fadeUp}
          style={{ fontSize: 24, fontWeight: 500, margin: 0, marginBottom: 24 }}
        >
          Ready to produce?
        </motion.h2>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--accent-gold)",
              color: "var(--bg-canvas)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 32px",
              borderRadius: 7,
              textDecoration: "none",
            }}
          >
            Start free <ArrowRight size={16} />
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
