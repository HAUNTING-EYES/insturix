"use client";

/**
 * NewsroomWire — "The Wire"
 *
 * Reuters/AP wire service aesthetic. Mono timestamps + headlines
 * in chronological feed. Latest gets pulsing "LATEST" tag.
 * Professional, credible.
 */

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

/* ─── Constants ─── */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Category = "Product" | "Company" | "Engineering";

const CATEGORY_COLORS: Record<Category, string> = {
  Product: "var(--accent-gold)",
  Company: "var(--status-success)",
  Engineering: "var(--category-purple)",
};

interface WireEntry {
  timestamp: string;
  headline: string;
  summary: string;
  category: Category;
}

const WIRE_ENTRIES: WireEntry[] = [
  {
    timestamp: "2026-05-07 · 09:14 UTC",
    headline: "Insturix opens the production floor to public beta",
    summary:
      "After six months of private testing with 50 agencies, the platform is now open to any business that produces content.",
    category: "Company",
  },
  {
    timestamp: "2026-05-05 · 14:32 UTC",
    headline: "AI editing: upload footage, get a final cut in minutes",
    summary:
      "Mode 2 is live. Upload raw footage and the platform applies professional cuts, pacing, color, and audio mixing automatically.",
    category: "Product",
  },
  {
    timestamp: "2026-05-03 · 11:00 UTC",
    headline: "Pricing update: new tiers starting at $20/mo",
    summary:
      "Three plans designed around production volume. Solo creators, teams, and enterprise agencies each get a dedicated tier.",
    category: "Product",
  },
  {
    timestamp: "2026-04-28 · 08:45 UTC",
    headline: "How we built the 6-room architecture",
    summary:
      "A technical deep-dive into how Script, Edit, Analyze, Design, Distribute, and Share rooms share a unified pipeline.",
    category: "Engineering",
  },
  {
    timestamp: "2026-04-20 · 16:20 UTC",
    headline: "Partnership with agency networks: early access program",
    summary:
      "Selected agency networks get priority onboarding, dedicated support, and volume pricing ahead of general availability.",
    category: "Company",
  },
  {
    timestamp: "2026-04-15 · 10:05 UTC",
    headline: "Analyze room: quality scoring hits 95% accuracy",
    summary:
      "The automated quality scoring system now matches human reviewers on 95% of production checks across all content types.",
    category: "Engineering",
  },
  {
    timestamp: "2026-04-01 · 09:00 UTC",
    headline: "Series A: building the future of content production",
    summary:
      "Funding secured to scale the platform, expand the engineering team, and accelerate the SaaS motion graphics engine.",
    category: "Company",
  },
  {
    timestamp: "2026-03-15 · 12:00 UTC",
    headline: "Insturix private beta launches with 50 agencies",
    summary:
      "First cohort of agencies begin running real client work through the production floor. Feedback loop begins.",
    category: "Company",
  },
];

/* ─── Keyframes ─── */

const pulseKeyframes = `
@keyframes wirePulse {
  0% { opacity: 1; box-shadow: 0 0 0 0 rgba(94, 201, 126, 0.5); }
  70% { opacity: 1; box-shadow: 0 0 0 6px rgba(94, 201, 126, 0); }
  100% { opacity: 1; box-shadow: 0 0 0 0 rgba(94, 201, 126, 0); }
}
`;

/* ─── Animation Variants ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ─── Sub-components ─── */

function CategoryPill({ category }: { category: Category }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "2px 8px",
        lineHeight: 1.4,
      }}
    >
      {category}
    </span>
  );
}

function LatestTag() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {/* Pulsing green dot */}
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--status-success)",
          animation: "wirePulse 1.8s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--status-success)",
        }}
      >
        LATEST
      </span>
    </span>
  );
}

function WireItem({
  entry,
  index,
  isLast,
}: {
  entry: WireEntry;
  index: number;
  isLast: boolean;
}) {
  const isFirst = index === 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ margin: "-32px" }}
      transition={{ duration: 0.45, ease: EASE, delay: index * 0.06 }}
      style={{
        paddingBottom: isLast ? 0 : 24,
        marginBottom: isLast ? 0 : 24,
        borderBottom: isLast ? "none" : "1px dashed var(--border-subtle)",
      }}
    >
      {/* Latest tag — first item only */}
      {isFirst && (
        <div style={{ marginBottom: 8 }}>
          <LatestTag />
        </div>
      )}

      {/* Timestamp */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 400,
          color: "var(--accent-gold)",
          marginBottom: 6,
        }}
      >
        {entry.timestamp}
      </div>

      {/* Headline */}
      <h3
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text-primary)",
          lineHeight: 1.35,
          margin: "0 0 6px",
        }}
      >
        {entry.headline}
      </h3>

      {/* Summary */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          margin: "0 0 10px",
        }}
      >
        {entry.summary}
      </p>

      {/* Category pill */}
      <CategoryPill category={entry.category} />
    </motion.article>
  );
}

/* ─── Main Component ─── */

export function NewsroomWire() {
  return (
    <main
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Inject keyframes */}
      <style>{pulseKeyframes}</style>

      {/* ─── Hero ─── */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "96px 24px 48px",
          textAlign: "center",
        }}
      >
        <motion.h1
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
            color: "var(--text-primary)",
            margin: "0 0 12px",
          }}
        >
          The wire.
        </motion.h1>
        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Company news. Product updates. No fluff.
        </motion.p>
      </section>

      {/* ─── Wire Feed ─── */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "0 24px 64px",
        }}
      >
        {WIRE_ENTRIES.map((entry, i) => (
          <WireItem
            key={entry.timestamp}
            entry={entry}
            index={i}
            isLast={i === WIRE_ENTRIES.length - 1}
          />
        ))}
      </section>

      {/* ─── Press Kit ─── */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "0 24px 96px",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: "32px",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: "0 0 8px",
            }}
          >
            Press kit
          </h2>
          <p
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-secondary)",
              margin: "0 0 20px",
              lineHeight: 1.5,
            }}
          >
            Download brand assets, logos, and guidelines.
          </p>
          <Link
            href="#"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--bg-canvas)",
              background: "var(--accent-gold)",
              border: "none",
              borderRadius: 7,
              padding: "10px 20px",
              textDecoration: "none",
              cursor: "pointer",
              transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            Download kit
            <ArrowRight size={14} />
          </Link>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--text-dim)",
              marginTop: 16,
            }}
          >
            Media inquiries: press@insturix.com
          </div>
        </motion.div>
      </section>
    </main>
  );
}
