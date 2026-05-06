"use client";

/**
 * ShowcaseGallery — "The Gallery Wall"
 *
 * Dark room, spotlight aesthetic. One production in the spotlight at a time.
 * Scroll-driven sticky section: scroll down and the next production slides
 * into the spotlight. Museum placard beneath each piece. Progress dots at bottom.
 *
 * Design system: warm editorial dark, gold accent, Plus Jakarta Sans + JetBrains Mono.
 * All animations whileInView, NO once: true. NO gradients, blur, shadows, shadcn.
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ArrowRight } from "lucide-react";
import Link from "next/link";

/* ─── Constants ─── */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const SCROLL_PER_ITEM_VH = 150;

/* ─── Room definitions ─── */
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

/* ─── Production data ─── */
interface Production {
  title: string;
  description: string;
  input: "prompt" | "footage";
  industry: string;
  duration: string;
  score: number;
  rooms: string[];
}

const PRODUCTIONS: Production[] = [
  {
    title: "Premium Coffee Launch",
    description:
      "30-second product launch for a premium specialty coffee brand.",
    input: "prompt",
    industry: "Food",
    duration: "0:32",
    score: 94,
    rooms: ["Script", "Edit", "Analyze", "Design", "Distribute"],
  },
  {
    title: "Fitness Brand Reel",
    description:
      "High-energy brand reel cut from user-uploaded gym footage.",
    input: "footage",
    industry: "Health",
    duration: "1:15",
    score: 91,
    rooms: ["Edit", "Analyze", "Design", "Distribute"],
  },
  {
    title: "SaaS Product Demo",
    description:
      "Concise product walkthrough for a B2B analytics dashboard.",
    input: "prompt",
    industry: "Technology",
    duration: "0:45",
    score: 88,
    rooms: ["Script", "Edit", "Analyze", "Design"],
  },
  {
    title: "Fashion Lookbook",
    description:
      "Seasonal lookbook assembled from studio footage and product shots.",
    input: "footage",
    industry: "Fashion",
    duration: "0:58",
    score: 92,
    rooms: ["Edit", "Design", "Distribute", "Share"],
  },
  {
    title: "Restaurant Social Pack",
    description:
      "Multi-format social content for a farm-to-table restaurant.",
    input: "prompt",
    industry: "Food",
    duration: "0:22",
    score: 86,
    rooms: ["Script", "Edit", "Design", "Share"],
  },
  {
    title: "Startup Pitch Video",
    description:
      "Investor-ready pitch video for a seed-stage climate startup.",
    input: "prompt",
    industry: "Technology",
    duration: "1:30",
    score: 90,
    rooms: ["Script", "Edit", "Analyze", "Distribute"],
  },
];

/* ─── Score color helper ─── */
function scoreColor(score: number): string {
  if (score >= 85) return "var(--status-success)";
  if (score >= 70) return "var(--accent-gold)";
  return "var(--status-danger)";
}

/* ─── Animation variants ─── */
const spotlightIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.25, ease: EASE } },
};

/* ─── Component ─── */
export function ShowcaseGallery() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const count = PRODUCTIONS.length;

  /* ── Scroll-driven index tracking ── */
  const handleScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const sectionTop = -rect.top;
    const sectionHeight = section.offsetHeight - window.innerHeight;

    if (sectionHeight <= 0) return;

    const scrollPct = Math.max(0, Math.min(1, sectionTop / sectionHeight));
    const idx = Math.min(count - 1, Math.floor(scrollPct * count));
    setCurrentIndex(idx);
  }, [count]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  /* ── Jump to production by dot click ── */
  const jumpToIndex = (idx: number) => {
    const section = sectionRef.current;
    if (!section) return;

    const sectionTop =
      section.getBoundingClientRect().top + window.scrollY;
    const sectionHeight = section.offsetHeight - window.innerHeight;
    const targetScroll =
      sectionTop + (sectionHeight * idx) / count + 1;

    window.scrollTo({ top: targetScroll, behavior: "smooth" });
  };

  const production = PRODUCTIONS[currentIndex];

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
          padding: "64px 24px 48px",
          maxWidth: 960,
          margin: "0 auto",
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
          The gallery.
        </motion.h2>
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
          Productions made with Insturix. One at a time.
        </motion.p>
      </div>

      {/* ── Scroll-driven gallery section ── */}
      <div
        ref={sectionRef}
        style={{
          height: `${count * SCROLL_PER_ITEM_VH}vh`,
          position: "relative",
        }}
      >
        {/* ── Sticky viewport ── */}
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
          }}
        >
          {/* ── Spotlight layout ── */}
          <div style={{ maxWidth: 960, width: "100%" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                {...spotlightIn}
                style={{ width: "100%" }}
              >
                {/* Main artwork — 16:9 thumbnail area */}
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    background: "var(--bg-deeper)",
                    borderRadius: 12,
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Play
                      size={24}
                      style={{
                        color: "var(--text-primary)",
                        marginLeft: 2,
                      }}
                    />
                  </div>
                </div>

                {/* Museum placard */}
                <div
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: 560,
                    margin: "16px auto 0",
                  }}
                >
                  {/* Title */}
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {production.title}
                  </p>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                      margin: "8px 0 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {production.description}
                  </p>

                  {/* Placard detail row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      {
                        label:
                          production.input === "prompt"
                            ? "From prompt"
                            : "From footage",
                        color:
                          production.input === "prompt"
                            ? "var(--accent-gold)"
                            : "var(--category-cyan)",
                      },
                      {
                        label: production.industry,
                        color: "var(--text-dim)",
                      },
                      {
                        label: production.duration,
                        color: "var(--text-dim)",
                      },
                      {
                        label: String(production.score),
                        color: scoreColor(production.score),
                      },
                      {
                        label: "2026",
                        color: "var(--text-dim)",
                      },
                    ].map((item, i, arr) => (
                      <React.Fragment key={i}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            fontWeight: 500,
                            color: item.color,
                            lineHeight: 1,
                          }}
                        >
                          {item.label}
                        </span>
                        {i < arr.length - 1 && (
                          <span
                            style={{
                              color: "var(--text-faint)",
                              fontSize: 11,
                              margin: "0 8px",
                              lineHeight: 1,
                            }}
                          >
                            &middot;
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Room pipeline dots */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 14,
                    }}
                  >
                    {ALL_ROOMS.map((room) => {
                      const active = production.rooms.includes(room);
                      return (
                        <div
                          key={room}
                          title={room}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: active
                              ? ROOM_COLORS[room]
                              : "var(--bg-well)",
                            transition: "background 0.3s ease",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* ── Progress indicator dots ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 24,
              }}
            >
              {PRODUCTIONS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => jumpToIndex(i)}
                  aria-label={`Go to production ${i + 1}`}
                  style={{
                    width: currentIndex === i ? 10 : 6,
                    height: currentIndex === i ? 10 : 6,
                    borderRadius: "50%",
                    background:
                      currentIndex === i
                        ? "var(--accent-gold)"
                        : "var(--text-faint)",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA below gallery ── */}
      <div
        style={{
          padding: "64px 24px",
          maxWidth: 960,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <motion.p
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: 1.3,
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          viewport={{ margin: "-48px" }}
        >
          Ready to produce yours?
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
          viewport={{ margin: "-48px" }}
          style={{ marginTop: 24 }}
        >
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--accent-gold)",
              color: "var(--bg-canvas)",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              padding: "12px 24px",
              borderRadius: 7,
              border: "none",
              textDecoration: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            Get started
            <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
