"use client";

/**
 * Pricing Drain — "See where your money goes"
 *
 * Scroll-driven vertical cost meter fills green -> gold -> red as legacy tool
 * costs accumulate, then DRAINS instantly to Insturix price. Below the sticky
 * section: volume selector + plan card + enterprise card.
 *
 * Design system: warm editorial dark, gold accent, Plus Jakarta Sans + JetBrains Mono.
 * No gradients, blur, or shadows. Easing: cubic-bezier(0.16, 1, 0.3, 1).
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "@/lib/config/creditCosts";

// ── Constants ────────────────────────────────────────────────────────

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

const VOLUME_TIERS = [
  { label: "1-5 videos", sublabel: "Solo creator", planId: "plus" },
  { label: "5-20 videos", sublabel: "Small team", planId: "pro" },
  { label: "20-50 videos", sublabel: "Growing business", planId: "premium" },
  { label: "50+", sublabel: "Full-scale operation", planId: "enterprise" },
] as const;

/** Tool labels that appear at scroll thresholds (pct = when they appear) */
const TOOL_THRESHOLDS = [
  { pct: 5, label: "Video editing", cost: "$55/mo" },
  { pct: 20, label: "Color grading", cost: "$295" },
  { pct: 35, label: "Freelance editors", cost: "$50-100/hr" },
  { pct: 50, label: "Thumbnails", cost: "$13/mo" },
  { pct: 70, label: "Distribution", cost: "$30-80/mo" },
  { pct: 85, label: "Analytics", cost: "$20-50/mo" },
] as const;

/** Scroll ranges within the 350vh container (as fractions of scroll distance) */
const FILL_END = 0.65; // 0 -> 0.65: meter fills to 100% (and overflows)
const DRAIN_START = 0.7; // 0.7 -> 0.85: meter drains to tiny sliver
const DRAIN_END = 0.85;

// ── Framer variants ──────────────────────────────────────────────────

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/** Returns the fill color based on fill percentage */
function fillColor(pct: number): string {
  if (pct <= 30) return "var(--status-success)";
  if (pct <= 60) return "var(--accent-gold)";
  return "var(--status-danger)";
}

/** Linearly interpolate between two numbers */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// =====================================================================
// MAIN EXPORT
// =====================================================================

export function PricingDrain() {
  const [selectedTier, setSelectedTier] = useState(1);

  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId);
  const isEnterprise = activePlanId === "enterprise";

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* ── Hero ────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ margin: "-48px" }}
        variants={stagger}
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "96px 24px 48px",
          textAlign: "center",
        }}
      >
        <motion.span
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
          }}
        >
          PRICING
        </motion.span>

        <motion.h1
          variants={fadeUp}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            marginBottom: 16,
          }}
        >
          See where your money goes.
        </motion.h1>

        <motion.p
          variants={fadeIn}
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            maxWidth: 420,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Scroll to watch legacy costs stack up — then watch them drain.
        </motion.p>
      </motion.section>

      {/* ── The Meter (sticky scroll-driven) ─────────── */}
      <MeterSection />

      {/* ── Plan Selector + Card ────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 120px",
        }}
      >
        {/* Volume selector */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={stagger}
          style={{ marginBottom: 48 }}
        >
          <motion.h2
            variants={fadeUp}
            style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            How much does your team produce?
          </motion.h2>
          <motion.p
            variants={fadeUp}
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            Videos per month — we&apos;ll recommend the right plan.
          </motion.p>

          <motion.div
            variants={fadeUp}
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 48,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                position: "relative",
                background: "var(--bg-deeper)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 7,
                padding: 4,
                gap: 4,
              }}
            >
              {/* Sliding indicator */}
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  position: "absolute",
                  top: 4,
                  bottom: 4,
                  left: `calc(${selectedTier * 25}% + 4px)`,
                  width: "calc(25% - 4px)",
                  background: "var(--bg-raised)",
                  borderRadius: 4,
                  zIndex: 0,
                }}
              />
              {VOLUME_TIERS.map((tier, i) => (
                <button
                  key={tier.label}
                  onClick={() => setSelectedTier(i)}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                    border: "none",
                    cursor: "pointer",
                    background: "transparent",
                    position: "relative",
                    zIndex: 1,
                    color:
                      selectedTier === i
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    transition: `color 0.25s ${EASE_CSS}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{tier.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: "var(--text-dim)",
                    }}
                  >
                    {tier.sublabel}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.section>

        {/* Plan card */}
        <AnimatePresence mode="wait">
          <motion.section
            key={activePlanId}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ maxWidth: 480, margin: "0 auto", marginBottom: 48 }}
          >
            {isEnterprise ? (
              <EnterpriseCard />
            ) : (
              activePlan && <PlanCard plan={activePlan} />
            )}
          </motion.section>
        </AnimatePresence>

        {/* Flanking tiers */}
        {!isEnterprise && (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ margin: "-32px" }}
            variants={stagger}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              marginBottom: 96,
            }}
          >
            {SUBSCRIPTION_PLANS.filter((p) => p.id !== activePlanId).map(
              (plan) => (
                <motion.button
                  key={plan.id}
                  variants={fadeIn}
                  onClick={() => {
                    const idx = VOLUME_TIERS.findIndex(
                      (t) => t.planId === plan.id
                    );
                    if (idx >= 0) setSelectedTier(idx);
                  }}
                  style={{
                    padding: "12px 24px",
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: `border-color 0.25s ${EASE_CSS}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--border-emphasis)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {plan.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    ${plan.price}/mo
                  </span>
                </motion.button>
              )
            )}
          </motion.div>
        )}

        {/* Enterprise CTA */}
        {!isEnterprise && (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ margin: "-32px" }}
            variants={fadeIn}
            style={{ textAlign: "center" }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              Producing at scale? Need custom terms?
            </p>
            <Link
              href="/contactus"
              style={{
                fontSize: 13,
                color: "var(--accent-gold)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Talk to us {"→"}
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// METER SECTION — scroll-driven sticky fill + drain
// =====================================================================

function MeterSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    // How far the top of the container has scrolled above the viewport top
    const scrolled = -rect.top;
    const pct = clamp(scrolled / scrollable, 0, 1);
    setScrollPct(pct);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // ── Derived state from scrollPct ────────────────────────

  // Phase 1: fill (0 -> FILL_END maps to 0% -> 108% for overflow)
  // Phase 2: drain (DRAIN_START -> DRAIN_END maps to 108% -> 2%)
  let fillPct: number;
  let isDraining = false;
  let isDrained = false;

  if (scrollPct <= FILL_END) {
    // Filling phase
    const t = scrollPct / FILL_END;
    // Go up to 108% to create "overflow" visual
    fillPct = lerp(0, 108, t);
  } else if (scrollPct < DRAIN_START) {
    // Brief hold at overflow
    fillPct = 108;
  } else if (scrollPct <= DRAIN_END) {
    // Draining phase
    isDraining = true;
    const t = (scrollPct - DRAIN_START) / (DRAIN_END - DRAIN_START);
    fillPct = lerp(108, 2, t);
  } else {
    // Fully drained
    isDrained = true;
    isDraining = false;
    fillPct = 2;
  }

  const isOverflowing = fillPct > 100;
  const showTotal = scrollPct >= FILL_END * 0.95;
  const showInsturix = isDrained || (isDraining && fillPct < 20);
  const meterColor =
    isDrained || isDraining ? "var(--status-success)" : fillColor(fillPct);

  return (
    <div
      ref={containerRef}
      style={{
        height: "350vh",
        position: "relative",
      }}
    >
      {/* Sticky viewport */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 48,
            maxWidth: 640,
            width: "100%",
          }}
        >
          {/* ── The Gauge ─────────────────────────────── */}
          <div
            style={{
              width: 48,
              height: 400,
              borderRadius: 12,
              border: "1px solid var(--border-emphasis)",
              background: "var(--bg-deeper)",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Fill */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${fillPct}%`,
                background: meterColor,
                opacity: 0.85,
                transition: `height 0.15s ${EASE_CSS}, background 0.3s ${EASE_CSS}`,
                borderRadius: fillPct >= 100 ? "0" : "0 0 11px 11px",
              }}
            />

            {/* Overflow glow at the top when > 100% */}
            {isOverflowing && (
              <div
                style={{
                  position: "absolute",
                  top: -4,
                  left: -4,
                  right: -4,
                  height: 16,
                  background: "var(--status-danger)",
                  opacity: 0.4,
                  borderRadius: "12px 12px 0 0",
                  transition: `opacity 0.3s ${EASE_CSS}`,
                }}
              />
            )}
          </div>

          {/* ── Labels Column ─────────────────────────── */}
          <div
            style={{
              flex: 1,
              position: "relative",
              height: 400,
            }}
          >
            {/* Tool labels appear at their threshold */}
            {TOOL_THRESHOLDS.map((tool) => {
              // Map tool pct to scrollPct (tool.pct is % of the fill, which maps to 0..FILL_END of scroll)
              const toolScrollPct = (tool.pct / 100) * FILL_END;
              const visible = scrollPct >= toolScrollPct && !isDraining && !isDrained;
              // Position: tool.pct maps to vertical position in the 400px column (inverted: 0% = bottom)
              const topOffset = 400 - (tool.pct / 100) * 400;

              return (
                <div
                  key={tool.label}
                  style={{
                    position: "absolute",
                    top: topOffset,
                    left: 0,
                    right: 0,
                    transform: "translateY(-50%)",
                    opacity: visible ? 1 : 0,
                    transition: `opacity 0.35s ${EASE_CSS}, transform 0.35s ${EASE_CSS}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {tool.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        color: "var(--text-muted)",
                      }}
                    >
                      {tool.cost}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Total label — appears when meter overflows */}
            <div
              style={{
                position: "absolute",
                top: -32,
                left: 0,
                right: 0,
                opacity: showTotal && !isDraining && !isDrained ? 1 : 0,
                transition: `opacity 0.4s ${EASE_CSS}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    color: "var(--status-danger)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  $2,000+
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  /mo
                </span>
              </div>
            </div>

            {/* Insturix label — appears after drain */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                opacity: showInsturix ? 1 : 0,
                transition: `opacity 0.5s ${EASE_CSS}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    color: "var(--status-success)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  $20
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  /mo
                </span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  display: "block",
                  marginTop: 8,
                }}
              >
                Insturix
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  display: "block",
                  marginTop: 4,
                }}
              >
                Everything. One price.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PLAN CARD
// =====================================================================

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: plan.popular
          ? "1px solid var(--accent-gold)"
          : "1px solid var(--border-emphasis)",
        borderRadius: 12,
        padding: 48,
        textAlign: "center",
      }}
    >
      {plan.popular && (
        <div
          style={{
            display: "inline-block",
            background: "var(--accent-gold)",
            color: "var(--bg-canvas)",
            fontSize: 10,
            fontWeight: 800,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "4px 16px",
            borderRadius: 4,
            marginBottom: 24,
          }}
        >
          RECOMMENDED
        </div>
      )}

      <h3
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: 8,
        }}
      >
        {plan.name}
      </h3>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 4,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          ${plan.price}
        </span>
        <span
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
          }}
        >
          /mo
        </span>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 32,
        }}
      >
        {plan.credits.toLocaleString()} credits included
      </p>

      {/* Features */}
      <motion.ul
        initial="hidden"
        whileInView="visible"
        viewport={{}}
        variants={stagger}
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 32px",
          textAlign: "left",
          maxWidth: 280,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {plan.features.map((feature, i) => (
          <motion.li
            key={i}
            variants={fadeIn}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              fontSize: 13,
              fontWeight: i === 0 ? 500 : 400,
              color:
                i === 0 ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <Check
              size={14}
              style={{
                color:
                  i === 0 ? "var(--status-success)" : "var(--text-dim)",
                flexShrink: 0,
              }}
            />
            {feature}
          </motion.li>
        ))}
      </motion.ul>

      <button
        style={{
          width: "100%",
          maxWidth: 280,
          padding: "14px 24px",
          borderRadius: 7,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--font-sans)",
          cursor: "pointer",
          border: "none",
          background: "var(--accent-gold)",
          color: "var(--bg-canvas)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: `opacity 0.25s ${EASE_CSS}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        Get started <ArrowRight size={14} />
      </button>
    </div>
  );
}

// =====================================================================
// ENTERPRISE CARD
// =====================================================================

function EnterpriseCard() {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px dashed var(--border-emphasis)",
        borderRadius: 12,
        padding: 48,
        textAlign: "center",
      }}
    >
      <h3
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: 8,
        }}
      >
        Enterprise
      </h3>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          maxWidth: 320,
          margin: "0 auto 32px",
          lineHeight: 1.6,
        }}
      >
        Custom credits. Custom terms. Dedicated account management. White-glove
        onboarding for your team.
      </p>
      <motion.ul
        initial="hidden"
        whileInView="visible"
        viewport={{}}
        variants={stagger}
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 32px",
          textAlign: "left",
          maxWidth: 280,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {[
          "Unlimited credits",
          "Dedicated account manager",
          "SLA & priority support",
          "Custom billing & invoicing",
          "API access",
        ].map((f, i) => (
          <motion.li
            key={i}
            variants={fadeIn}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <Check
              size={14}
              style={{ color: "var(--text-dim)", flexShrink: 0 }}
            />
            {f}
          </motion.li>
        ))}
      </motion.ul>
      <Link
        href="/contactus"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 24px",
          borderRadius: 7,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--font-sans)",
          textDecoration: "none",
          border: "1px solid var(--border-emphasis)",
          background: "transparent",
          color: "var(--text-primary)",
          transition: `background 0.25s ${EASE_CSS}, border-color 0.25s ${EASE_CSS}`,
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
        Contact us <ArrowRight size={14} />
      </Link>
    </div>
  );
}
