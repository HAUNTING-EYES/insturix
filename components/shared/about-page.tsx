"use client";

/**
 * About Page — "The Scroll Manifesto"
 *
 * RAMS: No decoration. Every section earns its place.
 * JOBS: User understands what Insturix replaces in 3 seconds.
 * IVE: Emptiness between sections is the breathing room.
 * VIGNELLI: All values from design system. No one-offs.
 * MÜLLER-BROCKMANN: ONE focal point per viewport — the belief statement.
 *
 * Flow:
 *  1. Hero — the broken workflow (visual pipeline)
 *  2. The collapse — one prompt, one floor
 *  3. Beliefs — four conviction statements, scroll-revealed
 *  4. Close — CTA
 */

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: EASE },
  }),
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

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
    statement: "One tool. Not ten.",
    supporting:
      "We don't integrate with Adobe. We replace it. Six rooms, one production floor — script to publish without leaving.",
  },
  {
    statement: "Your tool should think.",
    supporting:
      "Not a canvas that waits for instructions. A partner that understands the brief, makes editorial decisions, and delivers production-ready output.",
  },
  {
    statement: "Built for agencies. Built for scale.",
    supporting:
      "One video or a hundred. Same quality. Same speed. The platform that grows with your client roster, not against it.",
  },
  {
    statement: "Reliable means predictable.",
    supporting:
      "Same input, same output. Every single time. No randomness, no surprises. That's the bar for production-grade tools.",
  },
];

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
            color: "var(--text-muted)",
            textAlign: "center",
            maxWidth: 480,
            margin: "0 auto 64px",
            lineHeight: 1.6,
          }}
        >
          Seven steps. Five tools. Three weeks. For one video.
        </motion.p>

        {/* The pipeline visualization */}
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          {BROKEN_STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-32px" }}
              custom={i}
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
                  color: "var(--text-muted)",
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
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-32px" }}
            variants={fadeIn}
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
        </div>
      </section>

      {/* ── Section 2: The Collapse ────────────────────────── */}
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
          variants={fadeIn}
          style={{
            padding: "64px 32px",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            background: "var(--bg-raised)",
          }}
        >
          <span
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
          </span>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              marginBottom: 32,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
              }}
            >
              Brief
            </span>
            <span
              style={{
                fontSize: 18,
                color: "var(--text-dim)",
              }}
            >
              →
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--accent-gold)",
                letterSpacing: "-0.02em",
              }}
            >
              Insturix
            </span>
            <span
              style={{
                fontSize: 18,
                color: "var(--text-dim)",
              }}
            >
              →
            </span>
            <span
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
              }}
            >
              Done
            </span>
          </div>

          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              maxWidth: 320,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            One prompt. Six rooms. Minutes, not weeks.
          </p>
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
          {BELIEFS.map((belief, i) => (
            <motion.div
              key={belief.statement}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-48px" }}
              custom={i}
              variants={fadeUp}
              style={{
                textAlign: "center",
              }}
            >
              <h2
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
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  maxWidth: 480,
                  margin: "0 auto",
                }}
              >
                {belief.supporting}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Close ───────────────────────────────── */}
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
          variants={fadeIn}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}
        >
          <h2
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
          </h2>

          <div style={{ display: "flex", gap: 16 }}>
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
          </div>
        </motion.div>
      </section>
    </main>
  );
}
