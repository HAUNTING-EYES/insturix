"use client";

/**
 * PricingReceipt — "The Receipt" pricing variant
 *
 * A thermal receipt prints out the old tool stack costs line by line,
 * reveals a dramatic rolling total, then folds away to expose the clean
 * Insturix plan card underneath. All animations are scroll-triggered
 * (whileInView, no once:true — they replay on re-entry).
 */

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  CREDIT_PACKAGES,
  type SubscriptionPlan,
  type CreditPackage,
} from "@/lib/config/creditCosts";

/* ── Constants ──────────────────────────────────────────────── */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

const RECEIPT_ITEMS = [
  { name: "Video editing suite", cost: "$55/mo" },
  { name: "Color grading software", cost: "$295" },
  { name: "Freelance editors", cost: "$50-100/hr" },
  { name: "Thumbnail design", cost: "$13/mo" },
  { name: "Distribution", cost: "$30-80/mo" },
  { name: "Analytics", cost: "$20-50/mo" },
];

const VOLUME_TIERS = [
  { label: "1–5 videos", sublabel: "Solo", planId: "plus" },
  { label: "5–20 videos", sublabel: "Small team", planId: "pro" },
  { label: "20–50 videos", sublabel: "Growing business", planId: "premium" },
  { label: "50+", sublabel: "Full-scale", planId: "enterprise" },
] as const;

const TOTAL_DIGITS = ["2", ",", "0", "0", "0"];

/* ── Animation variants ─────────────────────────────────────── */

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

/* ── Dot leader helper ──────────────────────────────────────── */

function dotLeader(name: string, maxLen: number): string {
  const dots = maxLen - name.length;
  return dots > 0 ? name + ".".repeat(dots) : name;
}

/* ── Digit Roll ─────────────────────────────────────────────── */

function DigitRoll({
  char,
  delay,
}: {
  char: string;
  delay: number;
}) {
  const isDigit = /\d/.test(char);

  if (!isDigit) {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{}}
        transition={{ duration: 0.25, delay, ease: EASE }}
        style={{ display: "inline-block" }}
      >
        {char}
      </motion.span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, y: -24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{}}
      transition={{ duration: 0.5, delay, ease: EASE }}
      style={{
        display: "inline-block",
        position: "relative",
      }}
    >
      {char}
    </motion.span>
  );
}

/* ================================================================
   MAIN EXPORT
   ================================================================ */

export function PricingReceipt() {
  const [selectedTier, setSelectedTier] = useState(1);
  const [showCredits, setShowCredits] = useState(false);

  const receiptRef = useRef<HTMLDivElement>(null);
  const receiptInView = useInView(receiptRef, { margin: "-200px" });

  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId);
  const isEnterprise = activePlanId === "enterprise";

  // Receipt folds away once the total has been seen and scrolls out
  const totalRef = useRef<HTMLDivElement>(null);
  const totalSeen = useRef(false);
  const totalInView = useInView(totalRef, { margin: "-64px" });
  const [receiptFolded, setReceiptFolded] = useState(false);

  useEffect(() => {
    if (totalInView) {
      totalSeen.current = true;
    }
    if (totalSeen.current && !totalInView) {
      setReceiptFolded(true);
    }
    if (receiptInView && !totalInView) {
      setReceiptFolded(false);
      totalSeen.current = false;
    }
  }, [totalInView, receiptInView]);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "96px 24px 120px",
        }}
      >
        {/* ── 1. Hero heading ──────────────────────────────── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={stagger}
          style={{ marginBottom: 64, textAlign: "center" }}
        >
          <motion.h1
            variants={fadeUp}
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "var(--text-primary)",
            }}
          >
            Your current stack costs
          </motion.h1>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{}}
            transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "var(--accent-gold)",
              marginTop: 4,
            }}
          >
            more than you think.
          </motion.h1>
        </motion.section>

        {/* ── 2. The Receipt ───────────────────────────────── */}
        <div
          ref={receiptRef}
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 64,
          }}
        >
          <motion.div
            animate={{
              scale: receiptFolded ? 0.95 : 1,
              opacity: receiptFolded ? 0.3 : 1,
            }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              maxWidth: 400,
              width: "100%",
              background: "var(--bg-raised)",
              padding: "32px 24px",
              borderRadius: 4,
              position: "relative",
            }}
          >
            {/* Top dashed border */}
            <div
              style={{
                borderTop: "2px dashed var(--border-emphasis)",
                marginBottom: 24,
              }}
            />

            {/* Store name */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{}}
              transition={{ duration: 0.35, ease: EASE }}
              style={{
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                marginBottom: 24,
              }}
            >
              PRODUCTION COSTS
            </motion.div>

            {/* Receipt items — staggered print */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{}}
              variants={stagger}
            >
              {RECEIPT_ITEMS.map((item, i) => (
                <motion.div
                  key={item.name}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: {
                      opacity: 1,
                      x: 0,
                      transition: {
                        duration: 0.35,
                        delay: i * 0.12,
                        ease: EASE,
                      },
                    },
                  }}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    {dotLeader(item.name, 28)}
                  </span>
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    {item.cost}
                  </span>
                </motion.div>
              ))}
            </motion.div>

            {/* Dashed separator */}
            <div
              style={{
                borderTop: "2px dashed var(--border-emphasis)",
                margin: "24px 0",
              }}
            />

            {/* TOTAL with digit roll */}
            <div ref={totalRef}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  TOTAL
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 32,
                    fontWeight: 800,
                    color: "var(--status-danger)",
                    letterSpacing: "-0.02em",
                    display: "inline-flex",
                    alignItems: "baseline",
                  }}
                >
                  <DigitRoll char="$" delay={0.7} />
                  {TOTAL_DIGITS.map((d, i) => (
                    <DigitRoll key={i} char={d} delay={0.8 + i * 0.1} />
                  ))}
                  <motion.span
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{}}
                    transition={{ duration: 0.35, delay: 1.4, ease: EASE }}
                    style={{ fontSize: 18, marginLeft: 2 }}
                  >
                    +/mo
                  </motion.span>
                </span>
              </div>
            </div>

            {/* Bottom dashed border + overpaying message */}
            <div
              style={{
                borderTop: "2px dashed var(--border-emphasis)",
                marginTop: 24,
                paddingTop: 16,
              }}
            />
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{}}
              transition={{ duration: 0.5, delay: 1.6, ease: EASE }}
              style={{
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
              }}
            >
              THANK YOU FOR OVERPAYING
            </motion.p>
          </motion.div>
        </div>

        {/* ── 4. Volume Selector ───────────────────────────── */}
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
            Videos per month &mdash; we&apos;ll recommend the right plan.
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
              {/* Sliding active indicator */}
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

        {/* ── Plan Card ────────────────────────────────────── */}
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

        {/* ── 5. Enterprise CTA (when not already showing) ── */}
        {!isEnterprise && (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ margin: "-32px" }}
            variants={fadeIn}
            style={{ textAlign: "center", marginBottom: 64 }}
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

        {/* ── 6. Credits — collapsible ─────────────────────── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-32px" }}
          variants={fadeIn}
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 48,
          }}
        >
          <button
            onClick={() => setShowCredits(!showCredits)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "0 auto",
              padding: "8px 0",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              Need extra credits?
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                transition: `transform 0.25s ${EASE_CSS}`,
                transform: showCredits ? "rotate(180deg)" : "rotate(0deg)",
                display: "inline-block",
              }}
            >
              {"▾"}
            </span>
          </button>

          <AnimatePresence>
            {showCredits && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                style={{ overflow: "hidden" }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    marginTop: 16,
                    marginBottom: 24,
                  }}
                >
                  Top up anytime. Credits never expire.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                    maxWidth: 640,
                    margin: "0 auto",
                  }}
                >
                  {CREDIT_PACKAGES.map((pkg) => (
                    <CreditCard key={pkg.id} pkg={pkg} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </div>
  );
}

/* ================================================================
   PLAN CARD
   ================================================================ */

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
            fontWeight: 400,
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

      {/* Staggered features */}
      <motion.ul
        initial="hidden"
        whileInView="visible"
        viewport={{}}
        variants={stagger}
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 auto 32px",
          textAlign: "left",
          maxWidth: 280,
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
                  i === 0
                    ? "var(--status-success)"
                    : "var(--text-dim)",
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

/* ================================================================
   ENTERPRISE CARD
   ================================================================ */

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
        Custom credits. Custom terms. Dedicated account management.
        White-glove onboarding for your team.
      </p>
      <motion.ul
        initial="hidden"
        whileInView="visible"
        viewport={{}}
        variants={stagger}
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 auto 32px",
          textAlign: "left",
          maxWidth: 280,
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

/* ================================================================
   CREDIT CARD
   ================================================================ */

function CreditCard({ pkg }: { pkg: CreditPackage }) {
  return (
    <div
      style={{
        background: "var(--bg-deeper)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
        transition: `border-color 0.25s ${EASE_CSS}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-emphasis)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-subtle)";
      }}
    >
      <span
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          display: "block",
          marginBottom: 4,
        }}
      >
        {pkg.credits}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          display: "block",
          marginBottom: 16,
        }}
      >
        credits
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
          display: "block",
          marginBottom: 4,
        }}
      >
        ${pkg.prices.USD}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
        }}
      >
        ${(pkg.prices.USD / pkg.credits).toFixed(2)}/credit
      </span>
    </div>
  );
}
