"use client";

/**
 * ShowcaseCaseStudy — "The Case Study"
 *
 * Full-width scrolling case studies. Each: Industry, Challenge, Input,
 * Rooms used, Output, Results. Not cards — STORIES. Each case study is a
 * full section. This is what agencies actually evaluate.
 *
 * Design system: warm editorial dark, gold accent, Plus Jakarta Sans + JetBrains Mono.
 * All animations whileInView, NO once: true. NO gradients, blur, shadows.
 */

import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Play, ArrowRight } from "lucide-react";
import Link from "next/link";

/* ─── Constants ─── */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const ALL_ROOMS = [
  "Script",
  "Edit",
  "Analyze",
  "Design",
  "Distribute",
  "Share",
] as const;

const ROOM_COLORS: Record<string, string> = {
  Script: "var(--accent-gold)",
  Edit: "var(--status-danger)",
  Analyze: "var(--category-purple)",
  Design: "var(--category-cyan)",
  Distribute: "var(--status-success)",
  Share: "var(--category-pink)",
};

/* ─── Industry → room-color mapping for tags ─── */
const INDUSTRY_COLORS: Record<string, string> = {
  Food: "var(--accent-gold)",
  Health: "var(--status-success)",
  Tech: "var(--category-cyan)",
  Fashion: "var(--category-pink)",
};

/* ─── Case study data ─── */

interface CaseStudyData {
  id: string;
  number: string;
  title: string;
  industry: string;
  input: "prompt" | "footage";
  score: number;
  challenge: string;
  inputDetail: string;
  rooms: string[];
  /** One-line description per room of what it did for THIS production. Keyed by room name. */
  roomDescriptions: Record<string, string>;
  stats: {
    time: string;
    platforms: number;
    score: number;
    inputType: "prompt" | "footage";
  };
}

const CASE_STUDIES: CaseStudyData[] = [
  {
    id: "premium-coffee-launch",
    number: "01",
    title: "Premium Coffee Launch",
    industry: "Food",
    input: "prompt",
    score: 94,
    challenge:
      "30-second product launch for Q4 holiday campaign. The client needed a premium feel with rapid turnaround — agency had 48 hours before the media buy deadline.",
    inputDetail:
      "Premium holiday coffee launch — warm tones, close-up pour shots, cozy atmosphere. 30 seconds for Instagram Reels and TikTok.",
    rooms: ["Script", "Edit", "Analyze", "Design", "Distribute", "Share"],
    roomDescriptions: {
      Script: "Wrote hook-body-CTA structure",
      Edit: "Cut to music peaks, 0.8s avg shot length",
      Analyze: "Scored 94, flagged CTA timing",
      Design: "Holiday color grade, logo lower-third",
      Distribute: "6 platform exports, auto-captions",
      Share: "Client review link, 3 rounds",
    },
    stats: { time: "6 min", platforms: 6, score: 94, inputType: "prompt" },
  },
  {
    id: "fitness-brand-reel",
    number: "02",
    title: "Fitness Brand Reel",
    industry: "Health",
    input: "footage",
    score: 91,
    challenge:
      "Turn 12 minutes of gym footage into a 75-second brand reel. Raw footage had inconsistent lighting and no clear narrative arc — needed AI to find the story.",
    inputDetail: "4 raw clips, 12 minutes of footage",
    rooms: ["Edit", "Analyze", "Design", "Distribute"],
    roomDescriptions: {
      Edit: "Selected best 75s from 12min, beat-synced cuts",
      Analyze: "Scored 91, flagged two underlit shots",
      Design: "Energy-matched color grade, kinetic text overlays",
      Distribute: "4 platform exports, vertical + horizontal",
    },
    stats: { time: "9 min", platforms: 4, score: 91, inputType: "footage" },
  },
  {
    id: "saas-product-demo",
    number: "03",
    title: "SaaS Product Demo",
    industry: "Tech",
    input: "prompt",
    score: 88,
    challenge:
      "Explain a complex B2B product in 45 seconds for LinkedIn. The product had 8 features but the video needed to focus on the one that drives signups.",
    inputDetail:
      "45-second explainer for B2B analytics platform — clean, professional, data-visualization-forward. LinkedIn and website embed.",
    rooms: ["Script", "Edit", "Analyze", "Design"],
    roomDescriptions: {
      Script: "Distilled 8 features to 1 core value prop",
      Edit: "Paced for professional attention span, 1.2s avg",
      Analyze: "Scored 88, flagged jargon density in first 5s",
      Design: "UI screen recordings composited with motion graphics",
    },
    stats: { time: "7 min", platforms: 3, score: 88, inputType: "prompt" },
  },
  {
    id: "fashion-lookbook",
    number: "04",
    title: "Fashion Lookbook",
    industry: "Fashion",
    input: "footage",
    score: 92,
    challenge:
      "Edit a runway shoot into a social-first lookbook video. Raw footage was single-angle, 22 minutes — needed AI to identify the best looks and create visual variety.",
    inputDetail: "6 raw clips, 22 minutes of runway footage",
    rooms: ["Edit", "Design", "Distribute", "Share"],
    roomDescriptions: {
      Edit: "Selected 14 best looks, rhythm-matched to track",
      Design: "Minimal editorial grade, collection title cards",
      Distribute: "4 platform exports, 9:16 + 1:1 + 16:9",
      Share: "Buyer review link with timestamp comments",
    },
    stats: { time: "11 min", platforms: 4, score: 92, inputType: "footage" },
  },
  {
    id: "startup-pitch-video",
    number: "05",
    title: "Startup Pitch Video",
    industry: "Tech",
    input: "prompt",
    score: 90,
    challenge:
      "90-second investor pitch with data visualizations and founder VO. The startup needed to look like a Series B company while still being pre-seed.",
    inputDetail:
      "90-second investor pitch — confident, data-driven, founder voiceover over product demo and market charts. For pitch deck follow-up and LinkedIn.",
    rooms: ["Script", "Edit", "Analyze", "Distribute"],
    roomDescriptions: {
      Script: "Wrote narrative arc: problem-solution-traction-ask",
      Edit: "Synced VO to visual transitions, 1.5s avg shot",
      Analyze: "Scored 90, flagged pacing drag at 0:52",
      Distribute: "3 platform exports, embedded in pitch deck",
    },
    stats: { time: "8 min", platforms: 3, score: 90, inputType: "prompt" },
  },
];

/* ─── Helpers ─── */

function scoreColor(score: number): string {
  if (score >= 90) return "var(--status-success)";
  if (score >= 80) return "var(--accent-gold)";
  return "var(--status-danger)";
}

function industryColor(industry: string): string {
  return INDUSTRY_COLORS[industry] ?? "var(--text-dim)";
}

/* ─── Animation variants ─── */

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const fadeUpSmall = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/* ─── Shared inline style fragments ─── */

const monoLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-dim)",
  marginBottom: 6,
};

/* ─── Component ─── */

export function ShowcaseCaseStudy() {
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <section
      style={{
        background: "var(--bg-canvas)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Hero ── */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px 32px",
          textAlign: "center",
        }}
      >
        <motion.h2
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
          Real productions. Real results.
        </motion.h2>
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
          Each case study shows exactly how Insturix handled the brief — from
          input to published output.
        </motion.p>
      </div>

      {/* ── Case study nav pills ── */}
      <motion.nav
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 32px",
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
        {CASE_STUDIES.map((cs) => (
          <button
            key={cs.id}
            onClick={() => scrollTo(cs.id)}
            style={{
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              color: "var(--text-secondary)",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 7,
              padding: "8px 16px",
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--accent-gold)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--accent-gold)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--border-subtle)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-secondary)";
            }}
          >
            {cs.title}
          </button>
        ))}
      </motion.nav>

      {/* ── Case studies ── */}
      {CASE_STUDIES.map((cs) => (
        <CaseStudySection key={cs.id} data={cs} />
      ))}

      {/* ── Bottom CTA ── */}
      <motion.div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px",
          textAlign: "center",
        }}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        viewport={{ margin: "-48px" }}
      >
        <p
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Your brief is next.
        </p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "var(--text-secondary)",
            margin: "12px 0 24px",
            lineHeight: 1.6,
          }}
        >
          Start with a prompt or upload your footage.
        </p>
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
          <ArrowRight size={16} strokeWidth={1.8} />
        </Link>
      </motion.div>
    </section>
  );
}

/* ─── Individual case study section ─── */

function CaseStudySection({ data }: { data: CaseStudyData }) {
  const cs = data;

  return (
    <motion.article
      id={cs.id}
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "64px 24px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ margin: "-48px" }}
    >
      {/* ── a. Header row ── */}
      <motion.div
        variants={fadeUp}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
        }}
      >
        {/* Left: industry tag + number */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: industryColor(cs.industry),
            }}
          >
            {cs.industry}
          </span>
          <span
            style={{
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1,
              color: "var(--text-dim)",
              opacity: 0.25,
            }}
          >
            {cs.number}
          </span>
        </div>

        {/* Right: score badge */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              color: scoreColor(cs.score),
              lineHeight: 1,
            }}
          >
            {cs.score}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
            }}
          >
            /100
          </span>
        </div>
      </motion.div>

      {/* ── b. Title ── */}
      <motion.h3
        variants={fadeUp}
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: "var(--text-primary)",
          margin: "0 0 32px",
          lineHeight: 1.2,
        }}
      >
        {cs.title}
      </motion.h3>

      {/* ── c. Two-column grid: THE BRIEF / THE OUTPUT ── */}
      <motion.div
        variants={fadeUpSmall}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          marginBottom: 32,
        }}
      >
        {/* Left: THE BRIEF */}
        <div>
          {/* CHALLENGE */}
          <div style={{ marginBottom: 20 }}>
            <p style={monoLabel}>CHALLENGE</p>
            <p
              style={{
                fontSize: 13,
                fontWeight: 400,
                color: "var(--text-secondary)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {cs.challenge}
            </p>
          </div>

          {/* INPUT */}
          <div>
            <p style={monoLabel}>INPUT</p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color:
                    cs.input === "prompt"
                      ? "var(--accent-gold)"
                      : "var(--category-cyan)",
                  border: `1px solid ${
                    cs.input === "prompt"
                      ? "var(--accent-gold)"
                      : "var(--category-cyan)"
                  }`,
                  borderRadius: 4,
                  padding: "3px 8px",
                }}
              >
                {cs.input === "prompt" ? "PROMPT" : "FOOTAGE"}
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 400,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                margin: 0,
                fontStyle: cs.input === "prompt" ? "italic" : "normal",
              }}
            >
              {cs.inputDetail}
            </p>
          </div>
        </div>

        {/* Right: THE OUTPUT */}
        <div>
          <p style={monoLabel}>OUTPUT</p>
          <div
            style={{
              aspectRatio: "16 / 9",
              background: "var(--bg-deeper)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Play
              size={48}
              strokeWidth={1.2}
              style={{ color: "var(--text-dim)", opacity: 0.4 }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── d. Pipeline strip ── */}
      <motion.div variants={fadeUpSmall} style={{ marginBottom: 32 }}>
        {/* Room bars */}
        <div style={{ display: "flex", gap: 4 }}>
          {ALL_ROOMS.map((room) => {
            const isUsed = cs.rooms.includes(room);
            return (
              <div
                key={room}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 4,
                  background: isUsed ? ROOM_COLORS[room] : "var(--bg-well)",
                  opacity: isUsed ? 1 : 0.4,
                  transition:
                    "background 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            );
          })}
        </div>

        {/* Room labels */}
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {ALL_ROOMS.map((room) => {
            const isUsed = cs.rooms.includes(room);
            return (
              <div key={room} style={{ flex: 1, textAlign: "center" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 400,
                    color: isUsed ? ROOM_COLORS[room] : "var(--text-faint)",
                  }}
                >
                  {room}
                </span>
              </div>
            );
          })}
        </div>

        {/* Room descriptions — only for used rooms */}
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {ALL_ROOMS.map((room) => {
            const isUsed = cs.rooms.includes(room);
            const desc = cs.roomDescriptions[room];
            return (
              <div key={room} style={{ flex: 1, textAlign: "center" }}>
                {isUsed && desc ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 400,
                      color: "var(--text-dim)",
                      lineHeight: 1.5,
                    }}
                  >
                    {desc}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── e. Results row ── */}
      <motion.div
        variants={fadeUpSmall}
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 32,
        }}
      >
        <ResultStat label="Time" value={cs.stats.time} />
        <ResultStat
          label="Platforms"
          value={`${cs.stats.platforms} platforms`}
        />
        <ResultStat
          label="Score"
          value={`${cs.stats.score}`}
          color={scoreColor(cs.stats.score)}
        />
        <ResultStat
          label="Input"
          value={cs.stats.inputType === "prompt" ? "Prompt" : "Footage"}
          color={
            cs.stats.inputType === "prompt"
              ? "var(--accent-gold)"
              : "var(--category-cyan)"
          }
        />
      </motion.div>
    </motion.article>
  );
}

/* ─── Result stat cell ─── */

function ResultStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          margin: "0 0 4px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          color: color ?? "var(--text-secondary)",
          margin: 0,
        }}
      >
        {value}
      </p>
    </div>
  );
}
