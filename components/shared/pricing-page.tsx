"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Minus } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  CREDIT_PACKAGES,
  type SubscriptionPlan,
  type CreditPackage,
} from "@/lib/config/creditCosts";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ─── Volume tiers mapped to plans ─────────────────────────────
const VOLUME_TIERS = [
  { label: "1–5 videos", sublabel: "Solo creator", planId: "plus" },
  { label: "5–20 videos", sublabel: "Small team", planId: "pro" },
  { label: "20–50 videos", sublabel: "Growing agency", planId: "premium" },
  { label: "50+", sublabel: "Full-scale agency", planId: "enterprise" },
] as const;

// ─── The old stack breakdown ──────────────────────────────────
const OLD_STACK = [
  { tool: "Adobe Creative Cloud", cost: "$55/seat/mo" },
  { tool: "DaVinci Resolve Studio", cost: "$295 one-time" },
  { tool: "Freelance editors", cost: "$50–100/hr" },
  { tool: "Thumbnail design tools", cost: "$13/mo" },
  { tool: "Distribution & scheduling", cost: "$30–80/mo" },
  { tool: "Analytics platforms", cost: "$20–50/mo" },
];

// ─── Credit distribution across rooms ─────────────────────────
const ROOM_DISTRIBUTION = [
  { room: "Script", pct: 8, color: "var(--accent-gold)" },
  { room: "Edit", pct: 45, color: "var(--status-danger)" },
  { room: "Analyze", pct: 12, color: "var(--category-purple)" },
  { room: "Design", pct: 15, color: "var(--category-cyan)" },
  { room: "Distribute", pct: 10, color: "var(--status-success)" },
  { room: "Share", pct: 10, color: "var(--category-pink)" },
];

// ─── Component ────────────────────────────────────────────────

export function PricingPage() {
  const [selectedTier, setSelectedTier] = useState(1); // default to "5–20 videos" (Pro)
  const [showCredits, setShowCredits] = useState(false);

  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId);
  const isEnterprise = activePlanId === "enterprise";

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "96px 24px 120px",
        }}
      >
        {/* ── Section 1: Stack Replacement ──────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ marginBottom: 96 }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            WHAT YOU&apos;RE REPLACING
          </span>

          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              textAlign: "center",
              color: "var(--text-primary)",
              marginBottom: 64,
            }}
          >
            Your current stack costs
            <br />
            more than you think.
          </h1>

          {/* Old stack items */}
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              marginBottom: 48,
            }}
          >
            {OLD_STACK.map((item, i) => (
              <motion.div
                key={item.tool}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: EASE }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom:
                    i < OLD_STACK.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    fontWeight: 400,
                  }}
                >
                  {item.tool}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {item.cost}
                </span>
              </motion.div>
            ))}

            {/* Total */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "24px 0 0",
                marginTop: 16,
                borderTop: "1px solid var(--border-emphasis)",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                Total per seat
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--status-danger)",
                  fontFamily: "var(--font-mono)",
                  textDecoration: "line-through",
                  textDecorationColor: "var(--status-danger)",
                }}
              >
                $500–2,000/mo
              </span>
            </motion.div>
          </div>

          {/* The replacement line */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7, ease: EASE }}
            style={{ textAlign: "center" }}
          >
            <p
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              One platform. Six rooms. Starting at{" "}
              <span style={{ color: "var(--accent-gold)" }}>
                ${SUBSCRIPTION_PLANS[0]?.price ?? "9.99"}/mo
              </span>
            </p>
          </motion.div>
        </motion.section>

        {/* ── Section 2: Volume Selector ───────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
          style={{ marginBottom: 48 }}
        >
          <h2
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
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            Videos per month — we&apos;ll recommend the right plan.
          </p>

          {/* Segmented control */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 48,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                background: "var(--bg-deeper)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 7,
                padding: 4,
                gap: 4,
              }}
            >
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
                    transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                    background:
                      selectedTier === i ? "var(--bg-raised)" : "transparent",
                    color:
                      selectedTier === i
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
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
          </div>
        </motion.section>

        {/* ── Section 3: The One Card ──────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.section
            key={activePlanId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{
              maxWidth: 480,
              margin: "0 auto",
              marginBottom: 48,
            }}
          >
            {isEnterprise ? (
              <EnterpriseCard />
            ) : (
              activePlan && <PlanCard plan={activePlan} />
            )}
          </motion.section>
        </AnimatePresence>

        {/* ── Flanking tiers (muted) ───────────────────────── */}
        {!isEnterprise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              marginBottom: 96,
            }}
          >
            {SUBSCRIPTION_PLANS.filter((p) => p.id !== activePlanId).map(
              (plan) => (
                <button
                  key={plan.id}
                  onClick={() => {
                    const tierIdx = VOLUME_TIERS.findIndex(
                      (t) => t.planId === plan.id
                    );
                    if (tierIdx >= 0) setSelectedTier(tierIdx);
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
                    transition: "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-emphasis)";
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
                </button>
              )
            )}
          </motion.div>
        )}

        {/* ── Section 4: Credit top-ups (collapsible) ──────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 48,
            marginBottom: 64,
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
                transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: showCredits ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▾
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
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

        {/* ── Section 5: Enterprise quiet CTA ──────────────── */}
        {!isEnterprise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
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
              Talk to us →
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── The One Card ─────────────────────────────────────────────

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--accent-gold)",
        borderRadius: 12,
        padding: 48,
        textAlign: "center",
      }}
    >
      {/* Badge */}
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

      {/* Plan name */}
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

      {/* Price */}
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
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/mo</span>
      </div>

      {/* Credits */}
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 32,
        }}
      >
        {plan.credits.toLocaleString()} credits included
      </p>

      {/* Credit distribution bar */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            height: 4,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {ROOM_DISTRIBUTION.map((room) => (
            <div
              key={room.room}
              style={{
                width: `${room.pct}%`,
                background: room.color,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {ROOM_DISTRIBUTION.map((room) => (
            <div
              key={room.room}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: room.color,
                  opacity: 0.7,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {room.room}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <ul
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
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              fontSize: 13,
              fontWeight: i === 0 ? 500 : 400,
              color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <Check
              size={14}
              style={{
                color: i === 0 ? "var(--status-success)" : "var(--text-dim)",
                flexShrink: 0,
              }}
            />
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
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
          transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        Get started
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ─── Enterprise Card ──────────────────────────────────────────

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
          marginBottom: 32,
          maxWidth: 320,
          margin: "0 auto 32px",
          lineHeight: 1.6,
        }}
      >
        Custom credits. Custom terms. Dedicated account management. White-glove
        onboarding for your team.
      </p>

      <ul
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
        ].map((feature, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-secondary)",
            }}
          >
            <Check
              size={14}
              style={{ color: "var(--text-dim)", flexShrink: 0 }}
            />
            {feature}
          </li>
        ))}
      </ul>

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
          transition:
            "background 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
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
        Contact us
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ─── Credit Package Card ──────────────────────────────────────

function CreditCard({ pkg }: { pkg: CreditPackage }) {
  return (
    <div
      style={{
        background: "var(--bg-deeper)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
        transition: "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
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
