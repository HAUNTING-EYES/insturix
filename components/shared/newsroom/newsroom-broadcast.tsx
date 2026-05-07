"use client";

/**
 * NewsroomBroadcast — "The Broadcast"
 *
 * TV news feel. Horizontal ticker at top scrolling latest headline.
 * Featured story full-width. Smaller stories in 2-column grid below.
 * Category badges. Press section at bottom.
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

interface Story {
  date: string;
  title: string;
  summary: string;
  category: Category;
}

const FEATURED_STORY: Story = {
  date: "May 5, 2026",
  title: "AI editing: upload footage, get a final cut in minutes",
  summary:
    "Mode 2 is live. Upload raw footage and the platform applies professional cuts, pacing, color, and audio mixing automatically. No timeline. No manual work. The same decisions a senior editor makes, applied in minutes instead of days.",
  category: "Product",
};

const GRID_STORIES: Story[] = [
  {
    date: "May 7, 2026",
    title: "Insturix opens the production floor to public beta",
    summary:
      "After six months of private testing with 50 agencies, the platform is now open to any business that produces content.",
    category: "Company",
  },
  {
    date: "May 3, 2026",
    title: "Pricing update: new tiers starting at $20/mo",
    summary:
      "Three plans designed around production volume. Solo creators, teams, and enterprise agencies each get a dedicated tier.",
    category: "Product",
  },
  {
    date: "Apr 28, 2026",
    title: "How we built the 6-room architecture",
    summary:
      "A technical deep-dive into how Script, Edit, Analyze, Design, Distribute, and Share rooms share a unified pipeline.",
    category: "Engineering",
  },
  {
    date: "Apr 20, 2026",
    title: "Partnership with agency networks: early access program",
    summary:
      "Selected agency networks get priority onboarding, dedicated support, and volume pricing ahead of general availability.",
    category: "Company",
  },
  {
    date: "Apr 15, 2026",
    title: "Analyze room: quality scoring hits 95% accuracy",
    summary:
      "The automated quality scoring system now matches human reviewers on 95% of production checks across all content types.",
    category: "Engineering",
  },
  {
    date: "Apr 1, 2026",
    title: "Series A: building the future of content production",
    summary:
      "Funding secured to scale the platform, expand the engineering team, and accelerate the SaaS motion graphics engine.",
    category: "Company",
  },
];

/* ─── CSS Keyframes ─── */

const broadcastKeyframes = `
@keyframes tickerScroll {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}
`;

/* ─── Animation Variants ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/* ─── Sub-components ─── */

function CategoryBadge({ category }: { category: Category }) {
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
        lineHeight: 1.4,
      }}
    >
      {category}
    </span>
  );
}

function StoryCard({
  story,
  index,
}: {
  story: Story;
  index: number;
}) {
  return (
    <motion.article
      variants={staggerItem}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      {/* Category */}
      <div style={{ marginBottom: 12 }}>
        <CategoryBadge category={story.category} />
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
          lineHeight: 1.45,
          margin: "0 0 8px",
        }}
      >
        {story.title}
      </h3>

      {/* Date */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 400,
          color: "var(--text-dim)",
          marginBottom: 8,
        }}
      >
        {story.date}
      </div>

      {/* Summary */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {story.summary}
      </p>
    </motion.article>
  );
}

/* ─── Main Component ─── */

export function NewsroomBroadcast() {
  return (
    <main
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Inject keyframes */}
      <style>{broadcastKeyframes}</style>

      {/* ─── Ticker Bar ─── */}
      <div
        style={{
          width: "100%",
          height: 32,
          background: "var(--bg-deeper)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            whiteSpace: "nowrap",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: "var(--accent-gold)",
            animation: "tickerScroll 30s linear infinite",
            willChange: "transform",
          }}
        >
          BREAKING: Insturix opens public beta &nbsp;&middot;&nbsp; AI editing
          now available &nbsp;&middot;&nbsp; New pricing from $20/mo
          &nbsp;&middot;&nbsp; 6-room architecture documented
          &nbsp;&middot;&nbsp; BREAKING: Insturix opens public beta
          &nbsp;&middot;&nbsp; AI editing now available &nbsp;&middot;&nbsp; New
          pricing from $20/mo &nbsp;&middot;&nbsp; 6-room architecture
          documented
        </div>
      </div>

      {/* ─── Hero ─── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "80px 24px 48px",
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
          Newsroom.
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
          What&apos;s happening on the production floor.
        </motion.p>
      </section>

      {/* ─── Featured Story ─── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 48px",
        }}
      >
        <motion.article
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: 32,
          }}
        >
          {/* Category */}
          <div style={{ marginBottom: 12 }}>
            <CategoryBadge category={FEATURED_STORY.category} />
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "var(--text-primary)",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              margin: "0 0 10px",
            }}
          >
            {FEATURED_STORY.title}
          </h2>

          {/* Date */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--text-dim)",
              marginBottom: 12,
            }}
          >
            {FEATURED_STORY.date}
          </div>

          {/* Summary */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 20px",
              maxWidth: 680,
            }}
          >
            {FEATURED_STORY.summary}
          </p>

          {/* Read more link */}
          <Link
            href="#"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--accent-gold)",
              textDecoration: "none",
              transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            Read more
            <ArrowRight size={14} />
          </Link>
        </motion.article>
      </section>

      {/* ─── Story Grid ─── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 64px",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={staggerContainer}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {GRID_STORIES.map((story, i) => (
            <StoryCard key={story.title} story={story} index={i} />
          ))}
        </motion.div>
      </section>

      {/* ─── Press Kit ─── */}
      <section
        style={{
          maxWidth: 960,
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
            padding: 32,
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
