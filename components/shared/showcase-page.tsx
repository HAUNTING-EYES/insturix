"use client";

/**
 * Showcase Page — "The Screening Room"
 *
 * Score-first production reports. The score IS the visual hook, not a thumbnail.
 * Featured production dominates viewport. Filmstrip below for browsing.
 * Mirrors the Analyze room output: score + verdict + pipeline strip.
 *
 * Design system: warm editorial dark, gold accent, Plus Jakarta Sans + JetBrains Mono.
 * All animations whileInView, NO once: true. NO gradients, blur, shadows.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ─── Room definitions ─── */
const ALL_ROOMS = ["Script", "Edit", "Analyze", "Design", "Distribute", "Share"] as const;

const ROOM_COLORS: Record<string, string> = {
  Script: "var(--accent-gold)",
  Edit: "var(--status-danger)",
  Analyze: "var(--category-purple)",
  Design: "var(--category-cyan)",
  Distribute: "var(--status-success)",
  Share: "var(--category-pink)",
};

/* ─── Filter definitions ─── */
const FILTERS = [
  { label: "All", value: "all" },
  { label: "Product launch", value: "product-launch" },
  { label: "Social", value: "social-content" },
  { label: "Brand film", value: "brand-film" },
  { label: "Tutorial", value: "tutorial" },
  { label: "Agency reel", value: "agency-reel" },
] as const;

/* ─── Production data ─── */
interface Production {
  title: string;
  industry: string;
  type: string;
  input: "prompt" | "footage";
  prompt: string;
  duration: string;
  score: number;
  rooms: string[];
  stats: { time: string; platforms: number };
}

const PRODUCTIONS: Production[] = [
  {
    title: "Premium Coffee Launch",
    industry: "Food & Beverage",
    type: "product-launch",
    input: "prompt",
    prompt: "30-second product launch for premium coffee brand",
    duration: "0:32",
    score: 94,
    rooms: ["Script", "Edit", "Analyze", "Design", "Distribute"],
    stats: { time: "6 min", platforms: 6 },
  },
  {
    title: "Fitness App Walkthrough",
    industry: "Health & Wellness",
    type: "tutorial",
    input: "footage",
    prompt: "4 clips uploaded",
    duration: "1:48",
    score: 88,
    rooms: ["Edit", "Analyze", "Design", "Distribute"],
    stats: { time: "9 min", platforms: 4 },
  },
  {
    title: "SaaS Onboarding Reel",
    industry: "Technology",
    type: "social-content",
    input: "prompt",
    prompt: "60-second onboarding walkthrough for B2B SaaS product",
    duration: "1:02",
    score: 91,
    rooms: ["Script", "Edit", "Design", "Distribute"],
    stats: { time: "7 min", platforms: 5 },
  },
  {
    title: "Luxury Hotel Brand Film",
    industry: "Hospitality",
    type: "brand-film",
    input: "footage",
    prompt: "12 clips uploaded",
    duration: "2:15",
    score: 96,
    rooms: ["Script", "Edit", "Analyze", "Design", "Distribute", "Share"],
    stats: { time: "14 min", platforms: 3 },
  },
  {
    title: "Sneaker Drop Teaser",
    industry: "Fashion & Retail",
    type: "product-launch",
    input: "prompt",
    prompt: "15-second teaser for limited-edition sneaker drop",
    duration: "0:16",
    score: 89,
    rooms: ["Script", "Edit", "Design", "Distribute"],
    stats: { time: "4 min", platforms: 7 },
  },
  {
    title: "Agency Showreel 2026",
    industry: "Creative Agency",
    type: "agency-reel",
    input: "footage",
    prompt: "22 clips uploaded",
    duration: "3:10",
    score: 72,
    rooms: ["Edit", "Analyze", "Design", "Distribute", "Share"],
    stats: { time: "18 min", platforms: 2 },
  },
  {
    title: "Cooking Class Series Intro",
    industry: "Education",
    type: "tutorial",
    input: "footage",
    prompt: "6 clips uploaded",
    duration: "1:25",
    score: 85,
    rooms: ["Edit", "Analyze", "Design", "Distribute"],
    stats: { time: "8 min", platforms: 4 },
  },
  {
    title: "Real Estate Walkthrough",
    industry: "Real Estate",
    type: "social-content",
    input: "prompt",
    prompt: "45-second property tour for luxury apartment listing",
    duration: "0:47",
    score: 92,
    rooms: ["Script", "Edit", "Design", "Distribute"],
    stats: { time: "5 min", platforms: 5 },
  },
  {
    title: "Nonprofit Impact Film",
    industry: "Nonprofit",
    type: "brand-film",
    input: "footage",
    prompt: "8 clips uploaded",
    duration: "2:40",
    score: 78,
    rooms: ["Script", "Edit", "Analyze", "Design", "Distribute", "Share"],
    stats: { time: "12 min", platforms: 3 },
  },
];

/* ─── Score color helper ─── */
function scoreColor(score: number): string {
  if (score >= 85) return "var(--status-success)";
  if (score >= 70) return "var(--accent-gold)";
  return "var(--status-danger)";
}

/* ─── Animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const featuredEnter = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.25, ease: EASE } },
};

/* ─── Component ─── */
export function ShowcasePage() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered =
    filter === "all"
      ? PRODUCTIONS
      : PRODUCTIONS.filter((p) => p.type === filter);

  /* Reset selection when filter changes and current index is out of bounds */
  const safeIndex = selectedIndex >= filtered.length ? 0 : selectedIndex;
  const featured = filtered[safeIndex];

  return (
    <main
      style={{
        background: "var(--bg-canvas)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        minHeight: "100vh",
      }}
    >
      {/* ── Hero ── */}
      <section
        style={{
          padding: "64px 24px 32px",
          maxWidth: 960,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <motion.h1
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--text-primary)",
            margin: 0,
          }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          viewport={{ margin: "-48px" }}
        >
          See what&rsquo;s possible.
        </motion.h1>
        <motion.p
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "var(--text-secondary)",
            maxWidth: 480,
            margin: "16px auto 0",
            lineHeight: 1.6,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
          viewport={{ margin: "-48px" }}
        >
          Real productions. From prompt or footage. Scored, analyzed, shipped.
        </motion.p>
      </section>

      {/* ── Featured production ── */}
      {featured && (
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 24px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={safeIndex + "-" + filter}
              {...featuredEnter}
              style={{
                display: "flex",
                gap: 24,
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* Left: thumbnail area (60%) */}
              <div
                style={{
                  width: "60%",
                  flexShrink: 0,
                  aspectRatio: "16 / 9",
                  background: "var(--bg-deeper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRight: "1px solid var(--border-subtle)",
                  borderRadius: "12px 0 0 12px",
                  position: "relative",
                }}
              >
                <Play
                  size={48}
                  strokeWidth={1.2}
                  style={{ color: "var(--text-dim)", opacity: 0.4 }}
                />
              </div>

              {/* Right: production report (40%) */}
              <div
                style={{
                  width: "40%",
                  padding: "24px 24px 24px 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {/* Score */}
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 800,
                        color: scoreColor(featured.score),
                        lineHeight: 1,
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {featured.score}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 400,
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      / 100
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-dim)",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                    }}
                  >
                    Quality score
                  </span>
                </div>

                {/* Input badge */}
                <div>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color:
                        featured.input === "prompt"
                          ? "var(--accent-gold)"
                          : "var(--category-cyan)",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {featured.input === "prompt" ? "PROMPT" : "FOOTAGE"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-dim)",
                      marginLeft: 8,
                    }}
                  >
                    {featured.prompt}
                  </span>
                </div>

                {/* Room pipeline strip */}
                <div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {ALL_ROOMS.map((room) => {
                      const isUsed = featured.rooms.includes(room);
                      return (
                        <div
                          key={room}
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 4,
                            background: isUsed
                              ? ROOM_COLORS[room]
                              : "var(--bg-well)",
                            opacity: isUsed ? 1 : 0.4,
                            transition: "background 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {ALL_ROOMS.map((room) => (
                      <span
                        key={room}
                        style={{
                          flex: 1,
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 400,
                          color: "var(--text-dim)",
                          textAlign: "center" as const,
                        }}
                      >
                        {room}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {featured.duration}
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 13 }}>&middot;</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {featured.stats.platforms} platforms
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 13 }}>&middot;</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {featured.stats.time}
                  </span>
                </div>

                {/* Industry tag */}
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 400,
                    color: "var(--text-dim)",
                    marginTop: "auto",
                  }}
                >
                  {featured.industry}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Title below the card */}
          <AnimatePresence mode="wait">
            <motion.h2
              key={safeIndex + "-title-" + filter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.35, ease: EASE, delay: 0.1 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              style={{
                fontSize: 24,
                fontWeight: 500,
                color: "var(--text-primary)",
                margin: "16px 0 0",
              }}
            >
              {featured.title}
            </motion.h2>
          </AnimatePresence>
        </section>
      )}

      {/* ── Filter bar ── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "24px 24px 12px",
        }}
      >
        <motion.div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
          }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          viewport={{ margin: "-48px" }}
        >
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => {
                  setFilter(f.value);
                  setSelectedIndex(0);
                }}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "var(--font-sans)",
                  color: isActive
                    ? "var(--accent-gold)"
                    : "var(--text-secondary)",
                  background: "transparent",
                  border: `1px solid ${
                    isActive
                      ? "var(--accent-gold)"
                      : "var(--border-subtle)"
                  }`,
                  borderRadius: 7,
                  padding: "8px 16px",
                  cursor: "pointer",
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </motion.div>
      </section>

      {/* ── Production filmstrip ── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "12px 24px 48px",
        }}
      >
        <motion.div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto" as const,
            paddingBottom: 8,
            /* Hide scrollbar but keep scroll */
            scrollbarWidth: "none" as const,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          viewport={{ margin: "-48px" }}
        >
          {filtered.map((prod, i) => {
            const isActive = i === safeIndex;
            return (
              <motion.div
                key={prod.title}
                onClick={() => setSelectedIndex(i)}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.4, ease: EASE, delay: i * 0.04 }}
                viewport={{ margin: "-48px" }}
                style={{
                  minWidth: 160,
                  maxWidth: 160,
                  background: "var(--bg-raised)",
                  border: `1px solid ${
                    isActive
                      ? "var(--accent-gold)"
                      : "var(--border-subtle)"
                  }`,
                  borderRadius: 7,
                  padding: 8,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Mini thumbnail */}
                <div
                  style={{
                    aspectRatio: "16 / 9",
                    background: "var(--bg-deeper)",
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    marginBottom: 8,
                  }}
                >
                  <Play
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: "var(--text-dim)", opacity: 0.35 }}
                  />
                  {/* Score badge overlaid */}
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 800,
                      color: scoreColor(prod.score),
                      lineHeight: 1,
                    }}
                  >
                    {prod.score}
                  </span>
                </div>

                {/* Title */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {/* Input type dot */}
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 4,
                      background:
                        prod.input === "prompt"
                          ? "var(--accent-gold)"
                          : "var(--category-cyan)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {prod.title}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "48px 24px 64px",
          textAlign: "center",
        }}
      >
        <motion.h2
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          viewport={{ margin: "-48px" }}
        >
          Ready to produce?
        </motion.h2>
        <motion.p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "var(--text-secondary)",
            margin: "12px auto 24px",
            maxWidth: 400,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
          viewport={{ margin: "-48px" }}
        >
          Start with a prompt or upload your footage.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
          viewport={{ margin: "-48px" }}
        >
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              color: "var(--bg-canvas)",
              background: "var(--accent-gold)",
              border: "none",
              borderRadius: 7,
              padding: "12px 24px",
              textDecoration: "none",
              cursor: "pointer",
              transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            Get started
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
