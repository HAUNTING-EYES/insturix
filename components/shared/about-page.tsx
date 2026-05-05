"use client";

/**
 * About Page — "The Scroll Manifesto" v2
 *
 * RAMS: Every animation communicates transformation — nothing decorative.
 * JOBS: User understands the value prop in 3 seconds through animation, not text.
 * IVE: Breathing room between sections lets each land.
 * VIGNELLI: All values from design system. All motion from the three durations.
 * MÜLLER-BROCKMANN: ONE focal point per viewport.
 *
 * Flow:
 *  1. Hero — the broken workflow (staggered table)
 *  2. The collapse — animated pipeline compression
 *  3. Beliefs — scroll-revealed with staggered heading/body
 *  4. Journey — vertical timeline with drawing line
 *  5. Close — CTA
 */

import React, { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ─── The broken workflow steps ─────────────────────────────────
const BROKEN_STEPS = [
  { label: "Brief", time: "Day 1", tool: "Google Docs" },
  { label: "Script", time: "3–5 days", tool: "Freelancer" },
  { label: "Shoot / Generate", time: "1–2 weeks", tool: "Camera / Runway" },
  { label: "Edit", time: "3–5 days", tool: "Adobe Premiere / DaVinci" },
  { label: "Review", time: "2–4 rounds", tool: "Frame.io / Email" },
  { label: "Thumbnail", time: "1 day", tool: "Canva / Photoshop" },
  { label: "Upload", time: "Manual × 6", tool: "Each platform" },
];

// ─── The beliefs ──────────────────────────────────────────────
const BELIEFS = [
  {
    statement: "One platform. Not ten.",
    supporting:
      "Everything your team needs to produce content. Six rooms, one production floor — script to publish without switching tools.",
  },
  {
    statement: "Your tool should think.",
    supporting:
      "Not a canvas waiting for instructions. A partner that understands the brief, makes editorial decisions, and delivers production-ready output.",
  },
  {
    statement: "Built for businesses. Built for scale.",
    supporting:
      "One video or a hundred. Same quality. Same speed. The platform that grows with your content needs, not against them.",
  },
  {
    statement: "Reliable means predictable.",
    supporting:
      "Same input, same output. Every single time. No randomness, no surprises — that's the standard for production-grade tools.",
  },
];

// ─── Journey milestones ───────────────────────────────────────
const JOURNEY = [
  { date: "2024", title: "The idea", description: "Watched teams spend weeks producing what should take minutes." },
  { date: "Early 2025", title: "First prototype", description: "Built the first AI-native editing pipeline. Script to video in one pass." },
  { date: "Mid 2025", title: "Six rooms take shape", description: "Script, Edit, Analyze, Design, Distribute, Share — the full production floor." },
  { date: "Late 2025", title: "Private beta", description: "First teams run real client work through the platform." },
  { date: "2026", title: "Public launch", description: "Opening the production floor to every business that creates content." },
];

// ─── Animation variants ───────────────────────────────────────

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const slideFromLeft = {
  hidden: { opacity: 0, x: -32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const slideFromRight = {
  hidden: { opacity: 0, x: 32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const drawLine = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 0.5, ease: EASE },
  },
};

const scaleFadeIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: EASE },
  },
};

// ─── Component ────────────────────────────────────────────────

export function AboutPage() {
  return (
    <main
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Section 1: The Broken Workflow ──────────────────── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "96px 24px 64px",
        }}
      >
        <motion.span
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={fadeIn}
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          THE PROBLEM
        </motion.span>

        <motion.h1
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={fadeIn}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            textAlign: "center",
            margin: "0 0 16px",
          }}
        >
          Content production is broken.
        </motion.h1>

        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={fadeIn}
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            textAlign: "center",
            maxWidth: 480,
            margin: "0 auto 64px",
            lineHeight: 1.6,
          }}
        >
          Seven steps. Five tools. Three weeks. For one video.
        </motion.p>

        {/* Staggered pipeline table */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-32px" }}
          variants={staggerContainer}
          style={{ maxWidth: 640, margin: "0 auto" }}
        >
          {BROKEN_STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              variants={fadeUp}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 120px",
                alignItems: "center",
                padding: "16px 0",
                borderBottom:
                  i < BROKEN_STEPS.length - 1
                    ? "1px solid var(--border-subtle)"
                    : "none",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                {step.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {step.tool}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                }}
              >
                {step.time}
              </span>
            </motion.div>
          ))}

          {/* Total */}
          <motion.div
            variants={fadeUp}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "24px 0 0",
              marginTop: 16,
              borderTop: "1px solid var(--border-emphasis)",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              Total
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--status-danger)",
                fontFamily: "var(--font-mono)",
              }}
            >
              2–3 weeks · $2,000+
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Section 2: The Collapse (animated) ─────────────── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-64px" }}
          variants={scaleFadeIn}
          style={{
            padding: "64px 32px",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            background: "var(--bg-raised)",
            overflow: "hidden",
          }}
        >
          {/* Staggered inner content */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-32px" }}
            variants={staggerContainer}
          >
            <motion.span
              variants={fadeIn}
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
                marginBottom: 32,
              }}
            >
              THE REPLACEMENT
            </motion.span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0,
                marginBottom: 32,
              }}
            >
              {/* Brief slides from left */}
              <motion.span
                variants={slideFromLeft}
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  padding: "0 12px",
                }}
              >
                Brief
              </motion.span>

              {/* Arrow 1 draws */}
              <motion.div
                variants={drawLine}
                style={{
                  width: 48,
                  height: 1,
                  background: "var(--text-dim)",
                  transformOrigin: "left center",
                }}
              />

              {/* Insturix scales in with gold */}
              <motion.span
                variants={scaleFadeIn}
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "var(--accent-gold)",
                  letterSpacing: "-0.02em",
                  padding: "0 16px",
                }}
              >
                Insturix
              </motion.span>

              {/* Arrow 2 draws */}
              <motion.div
                variants={drawLine}
                style={{
                  width: 48,
                  height: 1,
                  background: "var(--text-dim)",
                  transformOrigin: "left center",
                }}
              />

              {/* Done slides from right */}
              <motion.span
                variants={slideFromRight}
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  padding: "0 12px",
                }}
              >
                Done
              </motion.span>
            </div>

            <motion.p
              variants={fadeUp}
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                maxWidth: 360,
                margin: "0 auto",
                lineHeight: 1.6,
              }}
            >
              One prompt. Six rooms. Minutes, not weeks.
            </motion.p>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Section 3: The Beliefs ─────────────────────────── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px",
        }}
      >
        <motion.span
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={fadeIn}
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          WHAT WE BELIEVE
        </motion.span>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 64,
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          {BELIEFS.map((belief) => (
            <motion.div
              key={belief.statement}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-48px" }}
              variants={staggerContainer}
              style={{ textAlign: "center" }}
            >
              <motion.h2
                variants={fadeUp}
                style={{
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                {belief.statement}
              </motion.h2>
              <motion.p
                variants={fadeUp}
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  maxWidth: 480,
                  margin: "0 auto",
                }}
              >
                {belief.supporting}
              </motion.p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Journey ─────────────────────────────── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px",
        }}
      >
        <motion.span
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={fadeIn}
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          THE JOURNEY
        </motion.span>

        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            position: "relative",
          }}
        >
          {/* Vertical timeline line */}
          <JourneyLine />

          {JOURNEY.map((milestone, i) => (
            <motion.div
              key={milestone.date}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-32px" }}
              variants={staggerContainer}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 16px 1fr",
                gap: 16,
                alignItems: "start",
                marginBottom: i < JOURNEY.length - 1 ? 48 : 0,
                position: "relative",
              }}
            >
              {/* Date */}
              <motion.span
                variants={fadeUp}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-dim)",
                  textAlign: "right",
                  paddingTop: 4,
                }}
              >
                {milestone.date}
              </motion.span>

              {/* Dot */}
              <motion.div
                variants={scaleFadeIn}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--accent-gold)",
                  marginTop: 8,
                  position: "relative",
                  zIndex: 2,
                }}
              />

              {/* Content */}
              <motion.div variants={fadeUp}>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: "0 0 4px",
                  }}
                >
                  {milestone.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {milestone.description}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Section 5: Close ───────────────────────────────── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px 96px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-48px" }}
          variants={staggerContainer}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}
        >
          <motion.h2
            variants={fadeUp}
            style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            We&apos;re building the production floor
            <br />
            the industry deserves.
          </motion.h2>

          <motion.div variants={fadeUp} style={{ display: "flex", gap: 16 }}>
            <Link
              href="/products"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 24px",
                background: "var(--accent-gold)",
                color: "var(--bg-canvas)",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 7,
                textDecoration: "none",
                transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              See the floor
              <ArrowRight size={14} />
            </Link>

            <Link
              href="/careers"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 24px",
                border: "1px solid var(--border-emphasis)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 7,
                textDecoration: "none",
                transition:
                  "background 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-deeper)";
                e.currentTarget.style.borderColor = "var(--text-dim)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--border-emphasis)";
              }}
            >
              Build with us
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}

// ─── Journey line (draws on scroll) ──────────────────────────

function JourneyLine() {
  const lineRef = useRef<HTMLDivElement>(null);
  const [drawPct, setDrawPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!lineRef.current) return;
      const rect = lineRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.4) / (vh * 0.5)));
      setDrawPct(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={lineRef}
      style={{
        position: "absolute",
        left: 99, // aligned with dot column center (80 + 16/2 + 8/2 = 99)
        top: 8,
        bottom: 8,
        width: 1,
        background: "var(--border-subtle)",
        zIndex: 1,
      }}
    >
      <div
        style={{
          width: "100%",
          height: `${drawPct * 100}%`,
          background: "var(--accent-gold)",
          transition: "height 0.1s linear",
          opacity: 0.4,
        }}
      />
    </div>
  );
}
