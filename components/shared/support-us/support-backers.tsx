"use client";

/**
 * Support Backers — "The Backers Board"
 *
 * Three-column board: Contribute / Sponsor / Donate.
 * Simple, action-oriented. No metaphor — just clarity.
 */

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface Column {
  key: string;
  label: string;
  color: string;
  heading: string;
  description: string;
  items: string[];
  cta: string;
  filled: boolean;
}

const COLUMNS: Column[] = [
  {
    key: "contribute",
    label: "CONTRIBUTE",
    color: "var(--status-success)",
    heading: "Build a room.",
    description:
      "Open source contributions — code, docs, or creative assets.",
    items: [
      "Submit a pull request",
      "Write documentation",
      "Create templates",
    ],
    cta: "Start contributing",
    filled: false,
  },
  {
    key: "sponsor",
    label: "SPONSOR",
    color: "var(--accent-gold)",
    heading: "Fund a room.",
    description:
      "Your brand powers a specific room on the production floor.",
    items: [
      "Choose a room to sponsor",
      "Brand visibility inside the room",
      "Quarterly impact reports",
    ],
    cta: "Become a sponsor",
    filled: true,
  },
  {
    key: "donate",
    label: "DONATE",
    color: "var(--category-cyan)",
    heading: "Back the mission.",
    description: "Help keep the floor accessible to everyone.",
    items: [
      "One-time or recurring",
      "Supporter badge on profile",
      "Community Discord access",
    ],
    cta: "Make a donation",
    filled: false,
  },
];

const STATS = [
  { value: "12 contributors", color: "var(--status-success)" },
  { value: "3 sponsors", color: "var(--accent-gold)" },
  { value: "48 supporters", color: "var(--category-cyan)" },
];

/* ------------------------------------------------------------------ */
/*  Column card                                                        */
/* ------------------------------------------------------------------ */

function BoardCard({ col }: { col: Column }) {
  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.04em",
    padding: "10px 18px",
    borderRadius: 7,
    cursor: "pointer",
    transition: "opacity 0.2s",
  };

  const btnStyle: React.CSSProperties = col.filled
    ? {
        ...btnBase,
        background: col.color,
        color: "var(--bg-canvas)",
        border: "none",
      }
    : {
        ...btnBase,
        background: "transparent",
        color: col.color,
        border: `1px solid ${col.color}`,
      };

  return (
    <motion.div
      variants={fadeUp}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Dot + mono label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: col.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: col.color,
          }}
        >
          {col.label}
        </span>
      </div>

      {/* Heading */}
      <h3
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text-primary)",
          margin: "0 0 8px",
          letterSpacing: "-0.01em",
        }}
      >
        {col.heading}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-secondary)",
          margin: "0 0 20px",
        }}
      >
        {col.description}
      </p>

      {/* Item list */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 24px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {col.items.map((item) => (
          <li
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: col.color,
                flexShrink: 0,
              }}
            />
            {item}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div style={{ marginTop: "auto" }}>
        <Link href="/contactus" style={{ textDecoration: "none" }}>
          <span style={btnStyle}>
            {col.cta}
            <ArrowRight size={14} />
          </span>
        </Link>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SupportBackers() {
  return (
    <section
      style={{
        background: "var(--bg-canvas)",
        fontFamily: "var(--font-sans)",
        minHeight: "100vh",
      }}
    >
      {/* ---------- Hero ---------- */}
      <div
        style={{
          maxWidth: 960,
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
            lineHeight: 1.05,
            color: "var(--text-primary)",
            margin: "0 0 16px",
          }}
        >
          Support the floor.
        </motion.h1>
        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          The production floor is built by the community. Here&apos;s how you
          can help.
        </motion.p>
      </div>

      {/* ---------- Three-column board ---------- */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ margin: "-48px" }}
        variants={staggerContainer}
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 48px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {COLUMNS.map((col) => (
          <BoardCard key={col.key} col={col} />
        ))}
      </motion.div>

      {/* ---------- Community stats bar ---------- */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ margin: "-48px" }}
        variants={fadeUp}
        style={{
          background: "var(--bg-deeper)",
          padding: "24px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            justifyContent: "center",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          {STATS.map((s) => (
            <span
              key={s.value}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 500,
                color: s.color,
                letterSpacing: "0.02em",
              }}
            >
              {s.value}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ---------- Bottom ---------- */}
      <div style={{ textAlign: "center", padding: "32px 24px 64px" }}>
        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          Questions? support@insturix.com
        </motion.p>
      </div>
    </section>
  );
}
