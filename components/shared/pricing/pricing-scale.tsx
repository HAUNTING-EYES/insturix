"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "@/lib/config/creditCosts";

/* ────────────────────────────────────────────
   Cost items that pile onto the left pan
   ──────────────────────────────────────────── */
const OLD_COSTS = [
  { label: "Video editing", cost: "$55" },
  { label: "Color grading", cost: "$295" },
  { label: "Editors", cost: "$100/hr" },
  { label: "Thumbnails", cost: "$13" },
  { label: "Distribution", cost: "$80" },
  { label: "Analytics", cost: "$50" },
] as const;

/* ────────────────────────────────────────────
   Volume tiers for the pricing table
   ──────────────────────────────────────────── */
const VOLUME_TIERS = [
  { label: "Starter", idx: 0 },
  { label: "Growing", idx: 1 },
  { label: "Scaling", idx: 2 },
  { label: "Enterprise", idx: 3 },
] as const;

/* ────────────────────────────────────────────
   Spring / easing tokens
   ──────────────────────────────────────────── */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */
export function PricingScale() {
  /* --- scroll tracking for the scale -------- */
  const stickyRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback(() => {
    if (!stickyRef.current) return;
    const rect = stickyRef.current.getBoundingClientRect();
    const viewH = window.innerHeight;
    const totalTravel = stickyRef.current.offsetHeight - viewH;
    if (totalTravel <= 0) return;
    const travelled = -rect.top;
    setScrollProgress(Math.min(1, Math.max(0, travelled / totalTravel)));
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  /* --- how many cost pills are visible ------ */
  const costCount = OLD_COSTS.length;
  // First 80% of scroll = costs appearing; last 20% = Insturix drop
  const costPhaseEnd = 0.8;
  const visibleCosts = Math.min(
    costCount,
    Math.floor((scrollProgress / costPhaseEnd) * (costCount + 0.99))
  );
  const insturixVisible = scrollProgress > costPhaseEnd;

  // Tilt: each cost adds -2.5deg, max -15deg
  const tiltFromCosts = Math.min(15, visibleCosts * 2.5);
  const tiltDeg = -tiltFromCosts;

  /* --- pricing table state ------------------ */
  const [selectedTier, setSelectedTier] = useState(1);

  return (
    <section
      style={{
        background: "var(--bg-canvas)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ═══════════════ HERO ═══════════════ */}
      <div
        style={{
          textAlign: "center",
          padding: "64px 24px 0",
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          viewport={{ amount: 0.5 }}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: 0,
            color: "var(--text-primary)",
          }}
        >
          Weigh your options.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
          viewport={{ amount: 0.5 }}
          style={{
            fontSize: 18,
            color: "var(--text-secondary)",
            marginTop: 12,
            fontWeight: 400,
          }}
        >
          Scroll to see the old way stack up.
        </motion.p>
      </div>

      {/* ═══════════════ STICKY SCALE SECTION ═══════════════ */}
      <div
        ref={stickyRef}
        style={{
          height: "400vh",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* --- The Scale --- */}
          <div
            style={{
              position: "relative",
              width: 540,
              maxWidth: "90vw",
              height: 320,
            }}
          >
            {/* Fulcrum: vertical line */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 0,
                transform: "translateX(-50%)",
                width: 2,
                height: 200,
                background: "var(--border-emphasis)",
              }}
            />

            {/* Fulcrum base triangle */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 0,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderBottom: "12px solid var(--border-emphasis)",
              }}
            />

            {/* Beam: horizontal line that rotates */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 200,
                transform: `translateX(-50%) rotate(${tiltDeg}deg)`,
                transformOrigin: "center center",
                width: 500,
                maxWidth: "88vw",
                height: 2,
                background: "var(--border-emphasis)",
                transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* ---- LEFT PAN ---- */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 2,
                  transform: `translateX(-50%) rotate(${-tiltDeg}deg)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 160,
                }}
              >
                {/* Pan rectangle */}
                <div
                  style={{
                    width: 160,
                    minHeight: 48,
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    background: "var(--bg-raised)",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <AnimatePresence>
                    {OLD_COSTS.slice(0, visibleCosts).map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: -12, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{
                          duration: 0.35,
                          ease: EASE_OUT,
                          delay: i * 0.04,
                        }}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          borderRadius: 4,
                          background: "var(--bg-deeper)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: 11,
                          fontWeight: 500,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          {item.label}
                        </span>
                        <span style={{ color: "var(--status-danger)" }}>
                          {item.cost}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Total label */}
                <AnimatePresence>
                  {visibleCosts === costCount && (
                    <motion.span
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE_OUT }}
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "var(--status-danger)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      $2,000+/mo
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* ---- RIGHT PAN ---- */}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 2,
                  transform: `translateX(50%) rotate(${-tiltDeg}deg)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 160,
                }}
              >
                {/* Pan rectangle */}
                <div
                  style={{
                    width: 160,
                    minHeight: 48,
                    border: insturixVisible
                      ? "1px solid var(--accent-gold)"
                      : "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    background: "var(--bg-raised)",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <AnimatePresence>
                    {insturixVisible && (
                      <motion.div
                        initial={{ opacity: 0, y: -24, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.5, ease: EASE_OUT }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          padding: "8px 12px",
                          borderRadius: 4,
                          background: "var(--bg-deeper)",
                          border: "1px solid var(--accent-gold)",
                          width: "100%",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "var(--accent-gold)",
                          }}
                        >
                          Insturix
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          Everything. One tool.
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Price label */}
                <AnimatePresence>
                  {insturixVisible && (
                    <motion.span
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, delay: 0.15, ease: EASE_OUT }}
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "var(--accent-gold)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      $20/mo
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ STANDARD PRICING SECTION ═══════════════ */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px",
        }}
      >
        {/* Volume tier buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          viewport={{ amount: 0.3 }}
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginBottom: 48,
            flexWrap: "wrap",
          }}
        >
          {VOLUME_TIERS.map((tier) => {
            const active = selectedTier === tier.idx;
            return (
              <button
                key={tier.idx}
                onClick={() => setSelectedTier(tier.idx)}
                style={{
                  padding: "8px 24px",
                  borderRadius: 7,
                  border: active
                    ? "1px solid var(--accent-gold)"
                    : "1px solid var(--border-subtle)",
                  background: active ? "var(--bg-deeper)" : "transparent",
                  color: active
                    ? "var(--accent-gold)"
                    : "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  transition:
                    "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {tier.label}
              </button>
            );
          })}
        </motion.div>

        {/* Plan cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {SUBSCRIPTION_PLANS.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              recommended={!!plan.popular}
            />
          ))}

          {/* Enterprise card */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: EASE_OUT }}
            viewport={{ amount: 0.3 }}
            style={{
              border: "1px dashed var(--border-subtle)",
              borderRadius: 12,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              background: "var(--bg-raised)",
            }}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Enterprise
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
                maxWidth: 200,
                fontWeight: 400,
              }}
            >
              Custom credits, SLA, dedicated support, SSO, and on-prem options.
            </span>
            <Link
              href="/contact"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 24px",
                borderRadius: 7,
                border: "1px solid var(--border-emphasis)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                transition:
                  "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              Talk to us
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────
   Plan Card sub-component
   ──────────────────────────────────────────── */
function PlanCard({
  plan,
  index,
  recommended,
}: {
  plan: SubscriptionPlan;
  index: number;
  recommended: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: EASE_OUT }}
      viewport={{ amount: 0.3 }}
      style={{
        border: recommended
          ? "1px solid var(--accent-gold)"
          : "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 32,
        background: "var(--bg-raised)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        position: "relative",
      }}
    >
      {/* Recommended badge */}
      {recommended && (
        <span
          style={{
            position: "absolute",
            top: -1,
            right: 24,
            transform: "translateY(-50%)",
            padding: "4px 12px",
            borderRadius: 4,
            background: "var(--accent-gold)",
            color: "var(--bg-canvas)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Recommended
        </span>
      )}

      {/* Name + description */}
      <div>
        <h3
          style={{
            fontSize: 24,
            fontWeight: 800,
            margin: 0,
            color: "var(--text-primary)",
          }}
        >
          {plan.name}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "4px 0 0",
            fontWeight: 400,
          }}
        >
          {plan.description}
        </p>
      </div>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: recommended
              ? "var(--accent-gold)"
              : "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          ${plan.price}
        </span>
        <span
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            fontWeight: 400,
          }}
        >
          /mo
        </span>
      </div>

      {/* Credits */}
      <span
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
        }}
      >
        {plan.credits.toLocaleString()} credits/mo
      </span>

      {/* Features */}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {plan.features.map((feature) => (
          <li
            key={feature}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-secondary)",
              fontWeight: 400,
            }}
          >
            <Check
              size={14}
              style={{ color: "var(--status-success)", flexShrink: 0 }}
            />
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href="/signup"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 24px",
          borderRadius: 7,
          border: recommended
            ? "none"
            : "1px solid var(--border-emphasis)",
          background: recommended ? "var(--accent-gold)" : "transparent",
          color: recommended
            ? "var(--bg-canvas)"
            : "var(--text-secondary)",
          fontSize: 14,
          fontWeight: 500,
          textDecoration: "none",
          cursor: "pointer",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          marginTop: "auto",
        }}
      >
        Get started
        <ArrowRight size={14} />
      </Link>
    </motion.div>
  );
}
