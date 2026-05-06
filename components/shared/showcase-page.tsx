"use client";

/**
 * Showcase Page
 *
 * Portfolio/gallery of example productions. Shows INPUT -> OUTPUT with stats
 * so agencies/businesses can see output quality without a free trial.
 *
 * Design system: warm editorial dark, gold accent, Plus Jakarta Sans + JetBrains Mono.
 * All animations whileInView, NO once: true. NO gradients, blur, shadows.
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Play, ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ─── Room color map ─── */
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
  { label: "Social content", value: "social-content" },
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
    prompt: "Uploaded 4 clips",
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
    prompt: "Uploaded 12 clips",
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
    prompt: "Uploaded 22 clips",
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
    prompt: "Uploaded 6 clips",
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
    prompt: "Uploaded 8 clips",
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
const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ─── Component ─── */
export function ShowcasePage() {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all"
      ? PRODUCTIONS
      : PRODUCTIONS.filter((p) => p.type === filter);

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
          maxWidth: 1120,
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
            maxWidth: 520,
            margin: "16px auto 0",
            lineHeight: 1.6,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
          viewport={{ margin: "-48px" }}
        >
          Real productions made with Insturix. From prompt to published&mdash;or
          from raw footage to final cut.
        </motion.p>
      </section>

      {/* ── Filter bar ── */}
      <section
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "0 24px 24px",
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
                onClick={() => setFilter(f.value)}
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

      {/* ── Showcase grid ── */}
      <section
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "0 24px 48px",
        }}
      >
        <motion.div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          key={filter}
        >
          {filtered.map((prod, i) => (
            <motion.div
              key={prod.title}
              variants={fadeUp}
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Thumbnail placeholder */}
              <div
                style={{
                  aspectRatio: "16 / 9",
                  background: "var(--bg-deeper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderBottom: "1px solid var(--border-subtle)",
                  position: "relative",
                }}
              >
                <Play
                  size={32}
                  strokeWidth={1.5}
                  style={{ color: "var(--text-dim)", opacity: 0.5 }}
                />
              </div>

              {/* Card body */}
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {/* Room pills */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  {prod.rooms.map((room) => (
                    <span
                      key={room}
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 4,
                          background: ROOM_COLORS[room] || "var(--text-dim)",
                          flexShrink: 0,
                        }}
                      />
                      {room}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    lineHeight: 1.3,
                  }}
                >
                  {prod.title}
                </span>

                {/* Input indicator */}
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color:
                      prod.input === "prompt"
                        ? "var(--accent-gold)"
                        : "var(--category-cyan)",
                    lineHeight: 1.4,
                  }}
                >
                  {prod.input === "prompt" ? "PROMPT" : "FOOTAGE"}
                  <span
                    style={{
                      color: "var(--text-dim)",
                      fontWeight: 400,
                      marginLeft: 6,
                    }}
                  >
                    {prod.prompt}
                  </span>
                </span>

                {/* Stats row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {prod.duration}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: scoreColor(prod.score),
                    }}
                  >
                    {prod.score}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {prod.stats.platforms} platforms
                  </span>
                </div>

                {/* Industry tag */}
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 400,
                    color: "var(--text-dim)",
                    marginTop: "auto",
                  }}
                >
                  {prod.industry}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        style={{
          maxWidth: 1120,
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
            fontSize: 14,
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
