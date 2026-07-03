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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  CREDIT_PACKAGES,
  getPlanMediaCreditAllocation,
  type SubscriptionPlan,
  type CreditPackage,
} from "@/lib/config/creditCosts";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { normalizePlanKey } from "@/lib/config/plan-limits";
import { FRAMER_VARIANTS } from "@/lib/animation/presets";

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
  { label: "Starter", sublabel: "Solo", planId: "agency_starter" },
  { label: "Growth", sublabel: "Small team", planId: "agency_growth" },
  { label: "Scale", sublabel: "Growing business", planId: "agency_scale" },
  { label: "Custom", sublabel: "Full-scale", planId: "enterprise" },
] as const;

// What each plan's credits are worth, service by service — an "UP TO ... mix
// freely" capacity list, NOT an implied "you get all of this at once".
//
// Honest framing: credits are ONE shared workflow pool. Each row is the true
// per-service CEILING (spend the whole pool on that one thing). "One pool, mix
// freely" tells the user it's shared, so nobody thinks they get 42 hrs of editing
// AND 6,000 scripts simultaneously. Never render these as a checklist of
// things-you-get — the "up to / or" wrapper is what keeps it truthful.
//
// Numbers from real per-action costs (creditCosts.ts): edit auto-analysis 12cr/min,
// analysis 8cr/min, script 5, calendar 20, scan 15, post 1. Media (separate wallet)
// after the 2026-07-04 reprice: image 1cr, video 5cr/sec.
type ValueItem = { tool: string; n: string; unit: string };
type PlanBundle = { workflow: ValueItem[]; media: ValueItem[] };

const PLAN_VALUE_BUNDLES: Record<string, PlanBundle> = {
  agency_starter: {
    workflow: [
      { tool: "Edit", n: "~4 hrs", unit: "of video edited" },
      { tool: "Analyze", n: "~6 hrs", unit: "of video analyzed" },
      { tool: "Script", n: "600", unit: "scripts" },
      { tool: "Plan", n: "150", unit: "content calendars" },
      { tool: "Distribute", n: "3,000", unit: "social posts" },
      { tool: "Vault", n: "200", unit: "brand scans" },
    ],
    media: [
      { tool: "Design", n: "300", unit: "AI images" },
      { tool: "Video", n: "~1 min", unit: "of AI video" },
    ],
  },
  agency_growth: {
    workflow: [
      { tool: "Edit", n: "~21 hrs", unit: "of video edited" },
      { tool: "Analyze", n: "~31 hrs", unit: "of video analyzed" },
      { tool: "Script", n: "3,000", unit: "scripts" },
      { tool: "Plan", n: "750", unit: "content calendars" },
      { tool: "Distribute", n: "15,000", unit: "social posts" },
      { tool: "Vault", n: "1,000", unit: "brand scans" },
    ],
    media: [
      { tool: "Design", n: "900", unit: "AI images" },
      { tool: "Video", n: "~3 min", unit: "of AI video" },
    ],
  },
  agency_scale: {
    workflow: [
      { tool: "Edit", n: "~42 hrs", unit: "of video edited" },
      { tool: "Analyze", n: "~62 hrs", unit: "of video analyzed" },
      { tool: "Script", n: "6,000", unit: "scripts" },
      { tool: "Plan", n: "1,500", unit: "content calendars" },
      { tool: "Distribute", n: "30,000", unit: "social posts" },
      { tool: "Vault", n: "2,000", unit: "brand scans" },
    ],
    media: [
      { tool: "Design", n: "1,500", unit: "AI images" },
      { tool: "Video", n: "~5 min", unit: "of AI video" },
    ],
  },
};

const TOTAL_DIGITS = ["$", "2", ",", "0", "0", "0", "+"];

// OLD: local stagger/fadeUp/fadeIn variant declarations
// NEW: stagger + fadeUp imported from lib/animation/presets.ts (one source of truth)
// fadeIn kept local — uses y:12 (smaller) vs shared y:24
const stagger = FRAMER_VARIANTS.staggerContainer;
const fadeUp = FRAMER_VARIANTS.fadeUp;
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  // The signed-in user's current plan key (normalized). null when logged out.
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.currentPlan?.name) setCurrentPlanKey(normalizePlanKey(d.currentPlan.name)); })
      .catch(() => {});
  }, []);

  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId);
  const isEnterprise = activePlanId === "enterprise";
  const tierIndex = selectedTier;
  const activeIsCurrent = !!currentPlanKey && !!activePlan && normalizePlanKey(activePlan.id) === currentPlanKey;

  const handleActivatePlan = (planId: string) => {
    setSelectedPlanId(planId);
    setSelectedPackageId(planId);
    setPaymentModalOpen(true);
  };

  const handleBuyCredits = (packageId: string) => {
    setSelectedPlanId(null);
    setSelectedPackageId(packageId);
    setPaymentModalOpen(true);
  };

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "var(--r-section-padding) var(--r-page-padding) 32px", textAlign: "center" }}>
        <motion.span initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 24 }}>
          PRICING
        </motion.span>
        <motion.h1 initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeUp}
          style={{ fontSize: "var(--r-hero-size)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text-primary)", margin: "0 0 16px" }}>
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
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "var(--r-section-padding) var(--r-page-padding)" }}>
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeUp}
          style={{ fontSize: "var(--r-heading-size)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", textAlign: "center", marginBottom: 8 }}>
          Choose your access level
        </motion.h2>
        <motion.p initial="hidden" whileInView="visible" viewport={{ margin: "-48px" }} variants={fadeIn}
          style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>
          Every plan unlocks all six rooms. Pick the monthly credit budget that fits your output — one shared wallet, spend it any way.
        </motion.p>

        {/* Billing cycle toggle */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={fadeUp}
          style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", position: "relative",
            background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
            borderRadius: 7, padding: 3, gap: 2,
          }}>
            {(["monthly", "yearly"] as const).map((cycle) => (
              <button key={cycle} onClick={() => setBillingCycle(cycle)}
                style={{
                  padding: "8px 20px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                  fontFamily: "var(--font-sans)", border: "none", cursor: "pointer",
                  background: billingCycle === cycle ? "var(--bg-raised)" : "transparent",
                  color: billingCycle === cycle ? "var(--text-primary)" : "var(--text-muted)",
                  transition: `all 0.25s ${EASE_CSS}`,
                  position: "relative",
                }}>
                {cycle === "monthly" ? "Monthly" : "Yearly"}
                {cycle === "yearly" && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, fontWeight: 600,
                    color: "var(--status-success)", fontFamily: "var(--font-mono)",
                  }}>
                    Save 17%
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Room indicators */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ margin: "-32px" }} variants={stagger}
          style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
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
            display: "inline-flex", position: "relative", flexWrap: "wrap",
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
            style={{ maxWidth: "min(440px, 100%)", margin: "0 auto 48px" }}
          >
            {isEnterprise ? <EnterpriseCard /> : activePlan && <BadgeCard plan={activePlan} tierIndex={tierIndex} billingCycle={billingCycle} onActivate={handleActivatePlan} isCurrent={activeIsCurrent} />}
          </motion.div>
        </AnimatePresence>

        {/* Flanking tiers */}
        {!isEnterprise && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 64, flexWrap: "wrap" }}>
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
                <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 16, marginBottom: 24 }}>Top up anytime at $1 = 30 credits. Credits never expire.</p>

                {/* Workflow top-ups */}
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--text-dim)", display: "block", textAlign: "center", marginBottom: 12 }}>
                  WORKFLOW CREDITS
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, maxWidth: 640, margin: "0 auto 32px" }}>
                  {CREDIT_PACKAGES.filter((pkg) => pkg.pool !== "media").map((pkg) => <CreditCard key={pkg.id} pkg={pkg} onBuy={handleBuyCredits} />)}
                </div>

                {/* AI media recharge */}
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--accent-gold)", display: "block", textAlign: "center", marginBottom: 12 }}>
                  AI MEDIA RECHARGE · IMAGE / VIDEO / AUDIO
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, maxWidth: 640, margin: "0 auto" }}>
                  {CREDIT_PACKAGES.filter((pkg) => pkg.pool === "media").map((pkg) => <CreditCard key={pkg.id} pkg={pkg} onBuy={handleBuyCredits} />)}
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

      {/* Payment Modal */}
      <BillingPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => { setPaymentModalOpen(false); setSelectedPackageId(null); }}
        onSuccess={() => { setPaymentModalOpen(false); setSelectedPackageId(null); }}
        initialPackageId={selectedPackageId}
        billingCycle={billingCycle}
      />
    </div>
  );
}

// =====================================================================
// COST ACCUMULATION — meter left + receipt right, same scroll
// =====================================================================

function CostAccumulation() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const lastScrollRef = useRef(0);

  // PERF: Throttle scroll to ~20fps (50ms). Receipt items + meter use CSS transitions.
  // OLD: setScrollPct on every frame (~60fps)
  // NEW: 20fps state updates, scrollend catches final frame
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const now = performance.now();
    if (now - lastScrollRef.current > 50) {
      setScrollPct(clamp(-rect.top / scrollable, 0, 1));
      lastScrollRef.current = now;
    }
  }, []);

  const handleScrollEnd = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    setScrollPct(clamp(-rect.top / scrollable, 0, 1));
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scrollend", handleScrollEnd, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [handleScroll, handleScrollEnd]);

  const visibleItems = RECEIPT_ITEMS.filter((item) => scrollPct >= item.threshold);
  const fillPct = clamp(scrollPct * 1.1, 0, 1.08);
  const meterColor = fillPct > 0.7 ? "var(--status-danger)" : fillPct > 0.35 ? "var(--accent-gold)" : "var(--status-success)";
  const showTotal = scrollPct > 0.78;
  const showInsturix = scrollPct > 0.9;

  return (
    <div ref={containerRef} style={{ height: isMobile ? "280vh" : "350vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 64, height: "calc(100vh - 128px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        maxWidth: 960, margin: "0 auto", padding: "0 var(--r-page-padding)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "64px 1fr", gap: isMobile ? 24 : 48, width: "100%", maxWidth: 560, alignItems: "start" }}>

          {/* Left: Vertical cost meter */}
          <div style={{ display: isMobile ? "none" : "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
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

          {/* Right: Receipt */}
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
            borderRadius: 4, padding: "24px 24px", fontFamily: "var(--font-mono)",
            opacity: showInsturix ? 0 : 1,
            transform: showInsturix ? "scale(0.95) translateY(16px)" : "scale(1) translateY(0)",
            transition: `opacity 0.5s ${EASE_CSS}, transform 0.5s ${EASE_CSS}`,
          }}>
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
          </div>
        </div>

        {/* Insturix reveal */}
        {showInsturix && (
          <div style={{
            position: "absolute", bottom: 48, left: 0, right: 0, textAlign: "center",
            animation: `fadeSlideUp 0.5s ${EASE_CSS} both`,
          }}>
            <span style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
              One platform. Starting at{" "}
              <span style={{ color: "var(--accent-gold)", fontWeight: 800 }}>${Math.min(...SUBSCRIPTION_PLANS.map((p) => p.price))}/mo</span>
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

function BadgeCard({ plan, tierIndex, billingCycle, onActivate, isCurrent = false }: { plan: SubscriptionPlan; tierIndex: number; billingCycle: 'monthly' | 'yearly'; onActivate: (planId: string) => void; isCurrent?: boolean }) {
  const displayPrice = billingCycle === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price;
  const totalYearly = plan.yearlyPrice;
  const monthlySavings = billingCycle === 'yearly' ? plan.price - displayPrice : 0;
  const mediaCredits = getPlanMediaCreditAllocation(plan.id);
  const bundle = PLAN_VALUE_BUNDLES[plan.id];
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
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            ${displayPrice}
          </span>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/mo</span>
        </div>
        {billingCycle === 'yearly' && (
          <div style={{ fontSize: 11, color: "var(--status-success)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
            ${totalYearly}/yr · save ${monthlySavings * 12}/yr
          </div>
        )}

        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent-gold)", display: "block", marginBottom: 24 }}>
          {plan.credits.toLocaleString()} WORKFLOW CREDITS/MO · +{mediaCredits.toLocaleString()} AI-MEDIA SAMPLE
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

        {/* Per-service capacity — "up to ... mix freely" (NOT an implied you-get-all) */}
        {bundle && (
          <div style={{
            textAlign: "left", maxWidth: 300, margin: "0 auto 24px",
            padding: "16px", borderRadius: 8,
            background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
          }}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
              ONE FLEXIBLE POOL — UP TO ANY OF
            </span>
            <span style={{ fontSize: 10, color: "var(--text-dim)", display: "block", marginBottom: 12 }}>
              Spend it however your month goes.
            </span>

            {bundle.workflow.map((ex) => (
              <div key={ex.tool} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 62 }}>{ex.tool}</span>
                <span style={{ color: "var(--text-secondary)", textAlign: "right", flex: 1 }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{ex.n}</span> {ex.unit}
                </span>
              </div>
            ))}

            {/* AI media — separate pay-as-you-go wallet */}
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--accent-gold)", display: "block", margin: "12px 0 8px" }}>
              AI MEDIA · PAY AS YOU GO
            </span>
            {bundle.media.map((ex) => (
              <div key={ex.tool} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 62 }}>{ex.tool}</span>
                <span style={{ textAlign: "right", flex: 1, color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent-gold)", fontWeight: 600 }}>{ex.n}</span> {ex.unit}
                </span>
              </div>
            ))}

            <span style={{ fontSize: 10, color: "var(--text-dim)", display: "block", marginTop: 8, lineHeight: 1.5 }}>
              One shared pool — do all video, all scripts, or any blend. AI media is separate &amp; pay-as-you-go: standard images ~free, recharge at <span style={{ color: "var(--accent-gold)" }}>$1 = 30 credits</span>.
            </span>
          </div>
        )}

        {/* Barcode */}
        <Barcode />

        {/* CTA — or a "current plan" state when this is the user's active plan */}
        {isCurrent ? (
          <button
            disabled
            style={{
              width: "100%", maxWidth: 280, padding: "14px 24px", borderRadius: 7,
              fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)", cursor: "default",
              border: "1px solid var(--status-success, #46A758)",
              background: "rgba(70,167,88,0.12)", color: "var(--status-success, #46A758)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16,
            }}
          >
            <Check size={14} /> Current Plan
          </button>
        ) : (
          <button
            onClick={() => onActivate(plan.id)}
            style={{
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
        )}
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

function CreditCard({ pkg, onBuy }: { pkg: CreditPackage; onBuy: (packageId: string) => void }) {
  return (
    <button
      onClick={() => onBuy(pkg.id)}
      style={{
        background: "var(--bg-deeper)", border: "1px solid var(--border-subtle)",
        borderRadius: 12, padding: 24, textAlign: "center",
        transition: `border-color 0.25s ${EASE_CSS}`,
        cursor: "pointer", fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-emphasis)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
    >
      <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>{pkg.credits}</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 16 }}>credits</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>${pkg.prices.USD}</span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>${(pkg.prices.USD / pkg.credits).toFixed(2)}/credit</span>
    </button>
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

