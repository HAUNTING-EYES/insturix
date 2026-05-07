"use client";

/**
 * Pricing Page — Final Mashup
 *
 * Top: Scroll-driven sticky section — meter fills on left, receipt prints on right
 * Both driven by same scroll position. Meter overflows, receipt totals, then both fade.
 * Bottom: Badge-style plan cards with rooms lighting up (production floor pass)
 * Micro-scale icon next to recommended price.
 *
 * Prices: Plus $20 / Pro $49 / Premium $99
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  CREDIT_PACKAGES,
  type SubscriptionPlan,
  type CreditPackage,
} from "@/lib/config/creditCosts";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

const RECEIPT_ITEMS = [
  { name: "Video editing suite", cost: "$55/mo", threshold: 0.08 },
  { name: "Color grading software", cost: "$295", threshold: 0.2 },
  { name: "Freelance editors", cost: "$50-100/hr", threshold: 0.32 },
  { name: "Thumbnail design", cost: "$13/mo", threshold: 0.44 },
  { name: "Distribution tools", cost: "$30-80/mo", threshold: 0.56 },
  { name: "Analytics platform", cost: "$20-50/mo", threshold: 0.68 },
];

const ROOMS = [
  { label: "Script", color: "var(--accent-gold)", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" },
  { label: "Edit", color: "var(--status-danger)", icon: "M7 7l10 10M21 11V3h-8M3 21h8V13" },
  { label: "Analyze", color: "var(--category-purple)", icon: "M3 3v18h18M7 16l4-8 4 5 4-6" },
  { label: "Design", color: "var(--category-cyan)", icon: "M12 3a9 9 0 1 0 9 9M12 3v9h9" },
  { label: "Distribute", color: "var(--status-success)", icon: "M12 2v10M5 12l7 7 7-7M5 20h14" },
  { label: "Share", color: "var(--category-pink)", icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" },
];

const VOLUME_TIERS = [
  { label: "1-5 videos", sublabel: "Solo", planId: "plus" },
  { label: "5-20 videos", sublabel: "Small team", planId: "pro" },
  { label: "20-50 videos", sublabel: "Growing business", planId: "premium" },
  { label: "50+", sublabel: "Full-scale", planId: "enterprise" },
] as const;

const TOTAL_DIGITS = ["$", "2", ",", "0", "0", "0", "+"];

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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// =====================================================================
// PAGE
// =====================================================================

export function PricingPage() {
  const [selectedTier, setSelectedTier] = useState(1);
  const [showCredits, setShowCredits] = useState(false);

  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId);
  const isEnterprise = activePlanId === "enterprise";
  const tierIndex = selectedTier;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "96px 24px 32px", textAlign: "center" }}>
        <motion.span initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 24 }}>
          PRICING
        </motion.span>
        <motion.h1 initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeUp}
          style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text-primary)", margin: "0 0 16px" }}>
          Your current stack costs<br />
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            style={{ color: "var(--accent-gold)" }}
          >
            more than you think.
          </motion.span>
        </motion.h1>
      </section>

      {/* ── Meter + Receipt (scroll-driven) ───────────────────── */}
      <CostAccumulation />

      {/* ── Plan Selection (Badge style) ──────────────────────── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px" }}>
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeUp}
          style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", textAlign: "center", marginBottom: 8 }}>
          Choose your access level
        </motion.h2>
        <motion.p initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginBottom: 32 }}>
          Every plan unlocks all six rooms. Choose your production volume.
        </motion.p>

        {/* Room indicators */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={stagger}
          style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
          {ROOMS.map((room) => (
            <motion.div key={room.label} variants={fadeIn} style={{ textAlign: "center" }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 8,
                filter: `brightness(${0.3 + (tierIndex / 3) * 0.7})`,
                transition: `filter 0.35s ${EASE_CSS}`,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={room.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={room.icon} />
                </svg>
              </div>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{room.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Volume selector */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={fadeUp}
          style={{ display: "flex", justifyContent: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-flex", position: "relative",
            background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
            borderRadius: 7, padding: 4, gap: 4,
          }}>
            <motion.div layout transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{
                position: "absolute", top: 4, bottom: 4,
                left: `calc(${selectedTier * 25}% + 4px)`,
                width: "calc(25% - 4px)",
                background: "var(--bg-raised)", borderRadius: 4, zIndex: 0,
              }}
            />
            {VOLUME_TIERS.map((tier, i) => (
              <button key={tier.label} onClick={() => setSelectedTier(i)}
                style={{
                  padding: "12px 24px", borderRadius: 4, fontSize: 13, fontWeight: 500,
                  fontFamily: "var(--font-sans)", border: "none", cursor: "pointer",
                  background: "transparent", position: "relative", zIndex: 1,
                  color: selectedTier === i ? "var(--text-primary)" : "var(--text-muted)",
                  transition: `color 0.25s ${EASE_CSS}`,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                <span>{tier.label}</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{tier.sublabel}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Badge Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePlanId}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ maxWidth: 440, margin: "0 auto 48px" }}
          >
            {isEnterprise ? <EnterpriseCard /> : activePlan && <BadgeCard plan={activePlan} tierIndex={tierIndex} />}
          </motion.div>
        </AnimatePresence>

        {/* Flanking tiers */}
        {!isEnterprise && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 64 }}>
            {SUBSCRIPTION_PLANS.filter((p) => p.id !== activePlanId).map((plan) => (
              <button key={plan.id}
                onClick={() => { const idx = VOLUME_TIERS.findIndex((t) => t.planId === plan.id); if (idx >= 0) setSelectedTier(idx); }}
                style={{
                  padding: "12px 24px", background: "transparent",
                  border: "1px solid var(--border-subtle)", borderRadius: 7, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12,
                  transition: `border-color 0.25s ${EASE_CSS}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{plan.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>${plan.price}/mo</span>
              </button>
            ))}
          </div>
        )}

        {/* Credits */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 48, marginBottom: 64 }}>
          <button onClick={() => setShowCredits(!showCredits)}
            style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 auto", padding: "8px 0", background: "transparent", border: "none", cursor: "pointer" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Need extra credits?</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", transition: `transform 0.25s ${EASE_CSS}`, transform: showCredits ? "rotate(180deg)" : "rotate(0deg)" }}>{"▾"}</span>
          </button>
          <AnimatePresence>
            {showCredits && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: "hidden" }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 16, marginBottom: 24 }}>Top up anytime. Credits never expire.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, maxWidth: 640, margin: "0 auto" }}>
                  {CREDIT_PACKAGES.map((pkg) => <CreditCard key={pkg.id} pkg={pkg} />)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Enterprise CTA */}
        {!isEnterprise && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Producing at scale? Need custom terms?</p>
            <Link href="/contactus" style={{ fontSize: 13, color: "var(--accent-gold)", textDecoration: "none", fontWeight: 500 }}>Talk to us {"→"}</Link>
          </div>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// COST ACCUMULATION — meter left + receipt right, same scroll
// =====================================================================

function CostAccumulation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    setScrollPct(clamp(-rect.top / scrollable, 0, 1));
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const visibleItems = RECEIPT_ITEMS.filter((item) => scrollPct >= item.threshold);
  const fillPct = clamp(scrollPct * 1.1, 0, 1.08);
  const meterColor = fillPct > 0.7 ? "var(--status-danger)" : fillPct > 0.35 ? "var(--accent-gold)" : "var(--status-success)";
  const showTotal = scrollPct > 0.78;
  const showInsturix = scrollPct > 0.9;

  return (
    <div ref={containerRef} style={{ height: "350vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 64, height: "calc(100vh - 128px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        maxWidth: 960, margin: "0 auto", padding: "0 24px",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 48, width: "100%", maxWidth: 560, alignItems: "start" }}>

          {/* Left: Vertical cost meter */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 48, height: 320, borderRadius: 12,
              border: "1px solid var(--border-emphasis)",
              background: "var(--bg-deeper)",
              position: "relative", overflow: "hidden",
            }}>
              {/* Fill from bottom */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                height: `${Math.min(fillPct * 100, 108)}%`,
                background: meterColor,
                opacity: 0.6,
                borderRadius: "0 0 12px 12px",
                transition: `height 0.15s linear, background 0.5s ${EASE_CSS}`,
                animation: fillPct > 0.7 ? `meterShimmer 1.5s ease-in-out infinite` : "none",
              }} />
              {/* Tick marks at 25%, 50%, 75% */}
              {[0.25, 0.5, 0.75].map((pct) => (
                <div key={pct} style={{
                  position: "absolute", right: 0, bottom: `${pct * 100}%`,
                  width: 8, height: 1,
                  background: "var(--border-emphasis)",
                }} />
              ))}
              {/* Overflow glow */}
              {fillPct > 1 && (
                <div style={{
                  position: "absolute", top: -4, left: -4, right: -4, height: 16,
                  background: "var(--status-danger)", opacity: 0.3, borderRadius: 12,
                }} />
              )}
            </div>
            {/* Meter label */}
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>
              {showInsturix ? "$20" : showTotal ? "$2K+" : visibleItems.length > 0 ? `${visibleItems.length}/6` : ""}
            </span>
          </div>

          {/* Right: Receipt — crush-and-toss crumple */}
          <motion.div
            animate={showInsturix ? {
              scaleY: [1, 1.02, 0.55, 0.15],
              scaleX: [1, 0.98, 1.08, 0.8],
              rotate: [0, -1, 4, 12],
              y: [0, -4, 12, 64],
              opacity: [1, 1, 0.5, 0],
              borderRadius: [4, 4, 8, 16],
            } : { scaleY: 1, scaleX: 1, rotate: 0, y: 0, opacity: 1, borderRadius: 4 }}
            transition={{ duration: 0.8, ease: EASE }}
            style={{
              background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
              padding: "24px 24px", fontFamily: "var(--font-mono)",
              transformOrigin: "center center",
              position: "relative",
              overflow: "hidden",
            }}>
            {/* Diagonal wrinkle lines — appear during crush */}
            {showInsturix && (
              <>
                <div style={{ position: "absolute", top: "18%", left: 0, width: "120%", height: 1, background: "var(--border-emphasis)", opacity: 0.5, transform: "rotate(-8deg)", transformOrigin: "left center", zIndex: 2, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "48%", left: "-8%", width: "120%", height: 1, background: "var(--border-emphasis)", opacity: 0.4, transform: "rotate(5deg)", transformOrigin: "left center", zIndex: 2, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "72%", left: 0, width: "115%", height: 1, background: "var(--border-emphasis)", opacity: 0.3, transform: "rotate(-4deg)", transformOrigin: "right center", zIndex: 2, pointerEvents: "none" }} />
              </>
            )}
            {/* Receipt header */}
            <div style={{ borderBottom: "1px dashed var(--border-emphasis)", paddingBottom: 16, marginBottom: 16, textAlign: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-dim)" }}>PRODUCTION COSTS</span>
            </div>

            {/* Receipt items */}
            <div style={{ minHeight: 200 }}>
              {RECEIPT_ITEMS.map((item) => {
                const visible = scrollPct >= item.threshold;
                return (
                  <div key={item.name} style={{
                    display: "flex", justifyContent: "space-between", padding: "8px 0",
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateY(0)" : "translateY(8px)",
                    transition: `all 0.35s ${EASE_CSS}`,
                  }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", position: "relative" }}>
                      {item.cost}
                      {visible && (
                        <span style={{
                          position: "absolute", left: -4, right: -4, top: "50%",
                          height: 1, background: "var(--status-danger)",
                          animation: `strikeIn 0.4s ${EASE_CSS} 0.3s both`,
                        }} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Dashed separator */}
            <div style={{
              borderTop: "1px dashed var(--border-emphasis)",
              margin: "16px 0", opacity: showTotal ? 1 : 0,
              transition: `opacity 0.3s ${EASE_CSS}`,
            }} />

            {/* Total with digit roll */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              opacity: showTotal ? 1 : 0,
              transition: `opacity 0.35s ${EASE_CSS}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>TOTAL</span>
              <div style={{ display: "flex", overflow: "hidden", height: 24 }}>
                {TOTAL_DIGITS.map((digit, i) => (
                  <span key={i} style={{
                    display: "inline-block", fontSize: 18, fontWeight: 800, color: "var(--status-danger)",
                    transform: showTotal ? "translateY(0)" : "translateY(-100%)",
                    opacity: showTotal ? 1 : 0,
                    transition: `all 0.4s ${EASE_CSS}`,
                    transitionDelay: `${i * 0.06}s`,
                  }}>
                    {digit}
                  </span>
                ))}
                <span style={{
                  fontSize: 11, color: "var(--text-dim)", alignSelf: "end", marginLeft: 4,
                  opacity: showTotal ? 1 : 0,
                  transition: `opacity 0.3s ${EASE_CSS}`,
                  transitionDelay: "0.5s",
                }}>/mo</span>
              </div>
            </div>

            {/* Receipt footer */}
            {showTotal && (
              <div style={{ borderTop: "1px dashed var(--border-emphasis)", marginTop: 16, paddingTop: 12, textAlign: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--status-danger)", letterSpacing: "0.08em" }}>THANK YOU FOR OVERPAYING</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Insturix reveal */}
        {showInsturix && (
          <div style={{
            position: "absolute", bottom: 48, left: 0, right: 0, textAlign: "center",
            animation: `fadeSlideUp 0.5s ${EASE_CSS} both`,
          }}>
            <span style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
              One platform. Starting at{" "}
              <span style={{ color: "var(--accent-gold)", fontWeight: 800 }}>$20/mo</span>
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes strikeIn { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes meterShimmer { 0% { opacity: 0.5; } 50% { opacity: 0.7; } 100% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// =====================================================================
// BADGE CARD — access pass to the production floor
// =====================================================================

function BadgeCard({ plan, tierIndex }: { plan: SubscriptionPlan; tierIndex: number }) {
  return (
    <div style={{
      background: "var(--bg-raised)", border: "1px solid var(--accent-gold)",
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Badge header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-dim)" }}>
          INSTURIX PRODUCTION FLOOR
        </span>
        <div style={{ width: 32, height: 4, borderRadius: 4, background: "var(--accent-gold)" }} />
      </div>

      {/* Badge body */}
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--text-dim)", display: "block", marginBottom: 8 }}>
          CLEARANCE LEVEL
        </span>
        <h3 style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
          {plan.name}
        </h3>

        {/* Price with micro scale */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            ${plan.price}
          </span>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/mo</span>
        </div>

        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent-gold)", display: "block", marginBottom: 24 }}>
          {plan.credits.toLocaleString()} CREDITS/MONTH
        </span>

        {/* Room dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {ROOMS.map((room) => (
            <div key={room.label} style={{
              width: 8, height: 8, borderRadius: "50%", background: room.color,
              opacity: 0.4 + (tierIndex / 3) * 0.6,
              transition: `opacity 0.35s ${EASE_CSS}`,
            }} />
          ))}
        </div>

        {/* Features */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", textAlign: "left", maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
          {plan.features.map((f, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: 13, color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: i === 0 ? 500 : 400 }}>
              <Check size={14} style={{ color: i === 0 ? "var(--status-success)" : "var(--text-dim)", flexShrink: 0 }} />
              {f}
            </li>
          ))}
        </ul>

        {/* Barcode */}
        <Barcode />

        {/* CTA */}
        <button style={{
          width: "100%", maxWidth: 280, padding: "14px 24px", borderRadius: 7,
          fontSize: 14, fontWeight: 500, fontFamily: "var(--font-sans)", cursor: "pointer",
          border: "none", background: "var(--accent-gold)", color: "var(--bg-canvas)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: `opacity 0.25s ${EASE_CSS}`, marginTop: 16,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Activate <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

function EnterpriseCard() {
  return (
    <div style={{ background: "var(--bg-raised)", border: "1px dashed var(--border-emphasis)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-dim)" }}>INSTURIX CUSTOM CLEARANCE</span>
      </div>
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <h3 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>Enterprise</h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, maxWidth: 320, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Custom credits, terms, and onboarding for your team.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", textAlign: "left", maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
          {["Unlimited credits", "Dedicated account manager", "SLA & priority support", "Custom billing", "API access"].map((f, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: 13, color: "var(--text-secondary)" }}>
              <Check size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} /> {f}
            </li>
          ))}
        </ul>
        <Link href="/contactus" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px",
          borderRadius: 7, fontSize: 14, fontWeight: 500, textDecoration: "none",
          border: "1px solid var(--border-emphasis)", background: "transparent", color: "var(--text-primary)",
          transition: `background 0.25s ${EASE_CSS}`,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-deeper)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          Contact us <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function CreditCard({ pkg }: { pkg: CreditPackage }) {
  return (
    <div style={{
      background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: 24, textAlign: "center",
      transition: `border-color 0.25s ${EASE_CSS}`,
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-emphasis)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
    >
      <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>{pkg.credits}</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 16 }}>credits</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>${pkg.prices.USD}</span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>${(pkg.prices.USD / pkg.credits).toFixed(2)}/credit</span>
    </div>
  );
}

function Barcode() {
  const w = [1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, height: 24, padding: "0 16px", opacity: 0.2 }}>
      {w.map((v, i) => <span key={i} style={{ display: "inline-block", width: v, height: "100%", background: "var(--text-primary)" }} />)}
    </div>
  );
}

