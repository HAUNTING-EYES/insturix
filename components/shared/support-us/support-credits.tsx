"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FRAMER_VARIANTS } from "@/lib/animation/presets";

/* ─── animation constants ─── */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// OLD: local fadeUp + staggerContainer (0.14s stagger)
// NEW: shared presets. stagger 0.14→0.12 (staggerContainerWide), 20ms/child difference
const fadeUp = FRAMER_VARIANTS.fadeUp;
const staggerContainer = FRAMER_VARIANTS.staggerContainerWide;

/* ─── tier data ─── */
interface Perk {
  text: string;
}

interface Tier {
  role: string;
  color: string;
  heading: string;
  description: string;
  perks: Perk[];
  cta: string;
  href: string;
  ctaStyle: "filled" | "outlined";
}

const TIERS: Tier[] = [
  {
    role: "PRODUCER",
    color: "var(--accent-gold)",
    heading: "Sponsor a room.",
    description:
      "Fund development of a specific room on the production floor. Your brand appears in the room’s credits.",
    perks: [
      { text: "Brand placement in sponsored room" },
      { text: "Early access to room features" },
      { text: "Monthly impact report" },
      { text: "Direct line to the team" },
    ],
    cta: "Become a producer",
    href: "/contactus",
    ctaStyle: "filled",
  },
  {
    role: "CREW",
    color: "var(--status-success)",
    heading: "Build with us.",
    description:
      "Contribute code, documentation, or creative assets to the production floor.",
    perks: [
      { text: "GitHub contributor badge" },
      { text: "Community Discord access" },
      { text: "Name in the credits" },
      { text: "Early feature previews" },
    ],
    cta: "Join the crew",
    href: "/contactus",
    ctaStyle: "outlined",
  },
  {
    role: "SUPPORTER",
    color: "var(--category-cyan)",
    heading: "Back the mission.",
    description:
      "Every contribution helps us keep the floor running and accessible.",
    perks: [
      { text: "Supporter badge on profile" },
      { text: "Community access" },
      { text: "Our gratitude (genuinely)" },
    ],
    cta: "Support us",
    href: "/contactus",
    ctaStyle: "outlined",
  },
];

/* ─── component ─── */
export function SupportCredits() {
  return (
    <section
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "var(--r-section-padding) var(--r-page-padding)",
        background: "var(--bg-canvas)",
      }}
    >
      {/* ── hero ── */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ margin: "-80px" }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 640,
          marginBottom: 64,
        }}
      >
        <motion.span
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: "var(--text-dim)",
            textTransform: "uppercase" as const,
          }}
        >
          WITH THE SUPPORT OF
        </motion.span>

        <motion.div
          variants={fadeUp}
          style={{
            width: 64,
            height: 1,
            background: "var(--accent-gold)",
            margin: "24px auto",
          }}
        />

        <motion.h2
          variants={fadeUp}
          style={{
            fontSize: "var(--r-hero-size)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          The production floor is open.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "var(--text-secondary)",
            marginTop: 16,
            lineHeight: 1.6,
          }}
        >
          Three ways to be part of what we&apos;re building.
        </motion.p>
      </motion.div>

      {/* ── tier cards ── */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ margin: "-60px" }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 32,
          maxWidth: 640,
          width: "100%",
        }}
      >
        {TIERS.map((tier) => (
          <TierCard key={tier.role} tier={tier} />
        ))}
      </motion.div>

      {/* ── bottom ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        viewport={{ margin: "-60px" }}
        style={{
          textAlign: "center",
          marginTop: 64,
          maxWidth: 640,
        }}
      >
        <p
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Every name matters.
        </p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "var(--text-secondary)",
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          We list every contributor, sponsor, and supporter.
        </p>
      </motion.div>
    </section>
  );
}

/* ─── tier card ─── */
function TierCard({ tier }: { tier: Tier }) {
  const isFilled = tier.ctaStyle === "filled";

  return (
    <motion.div
      variants={fadeUp}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderLeft: `4px solid ${tier.color}`,
        borderRadius: 12,
        padding: 32,
      }}
    >
      {/* role label */}
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.08em",
          color: tier.color,
          textTransform: "uppercase" as const,
          display: "block",
          marginBottom: 12,
        }}
      >
        {tier.role}
      </span>

      {/* heading */}
      <h3
        style={{
          fontSize: 24,
          fontWeight: 500,
          color: "var(--text-primary)",
          margin: "0 0 8px 0",
          lineHeight: 1.3,
        }}
      >
        {tier.heading}
      </h3>

      {/* description */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: "var(--text-secondary)",
          margin: "0 0 24px 0",
          lineHeight: 1.6,
        }}
      >
        {tier.description}
      </p>

      {/* perks list */}
      <ul
        style={{
          listStyle: "none",
          margin: "0 0 24px 0",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {tier.perks.map((perk) => (
          <li
            key={perk.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: tier.color,
                flexShrink: 0,
              }}
            />
            {perk.text}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={tier.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          padding: "10px 20px",
          borderRadius: 7,
          textDecoration: "none",
          transition: `opacity 0.3s ${EASE.join(",")}`,
          ...(isFilled
            ? {
                background: tier.color,
                color: "var(--bg-canvas)",
                border: "none",
              }
            : {
                background: "transparent",
                color: tier.color,
                border: `1px solid ${tier.color}`,
              }),
        }}
      >
        {tier.cta}
        <ArrowRight size={14} />
      </Link>
    </motion.div>
  );
}
