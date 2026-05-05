'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  SUBSCRIPTION_PLANS,
  CREDIT_PACKAGES,
  type SubscriptionPlan,
} from '@/lib/config/creditCosts';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const EASING = [0.16, 1, 0.3, 1] as const;

/** The six production rooms and their accent colors. */
const ROOMS = [
  { label: 'Script', color: 'var(--accent-gold)' },
  { label: 'Edit', color: 'var(--status-danger)' },
  { label: 'Analyze', color: 'var(--category-purple)' },
  { label: 'Design', color: 'var(--category-cyan)' },
  { label: 'Distribute', color: 'var(--status-success)' },
  { label: 'Share', color: 'var(--category-pink)' },
] as const;

/** Volume tiers shown as selectable buttons. */
const VOLUME_TIERS = [
  { id: 0, label: '1-5 videos', planId: 'plus' },
  { id: 1, label: '5-20', planId: 'pro' },
  { id: 2, label: '20-50', planId: 'premium' },
  { id: 3, label: '50+', planId: 'enterprise' },
] as const;

/** SVG room icons keyed by label. */
const ROOM_ICONS: Record<string, React.ReactNode> = {
  Script: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  ),
  Edit: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 7 10 10" />
      <path d="M21 11V3h-8" />
      <path d="M3 21h8V13" />
    </svg>
  ),
  Analyze: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m7 16 4-8 4 5 4-6" />
    </svg>
  ),
  Design: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r="2.5" />
      <path d="M3 20c2-4 6-8 10-10" />
      <path d="M20.7 20.7a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 0l3 3" />
    </svg>
  ),
  Distribute: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10" />
      <path d="m5 12 7 7 7-7" />
      <path d="M5 20h14" />
    </svg>
  ),
  Share: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4" />
      <path d="m8.6 10.5 6.8-4" />
    </svg>
  ),
};

/** Enterprise pseudo-plan. */
const ENTERPRISE_PLAN: SubscriptionPlan = {
  id: 'enterprise',
  name: 'Enterprise',
  description: 'Custom production infrastructure',
  credits: -1,
  price: -1,
  currency: 'USD',
  features: [
    'Unlimited credits',
    'Custom integrations',
    'Dedicated support',
    'SLA guarantee',
    'On-prem deployment option',
  ],
};

/* ------------------------------------------------------------------ */
/*  Barcode (decorative)                                              */
/* ------------------------------------------------------------------ */

function Barcode() {
  const widths = [1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        height: 32,
        padding: '0 16px',
        opacity: 0.3,
      }}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: w,
            height: '100%',
            backgroundColor: 'var(--text-primary)',
            borderRadius: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Room Icon                                                         */
/* ------------------------------------------------------------------ */

function RoomIcon({
  room,
  intensity,
}: {
  room: (typeof ROOMS)[number];
  intensity: number; // 0..1
}) {
  return (
    <motion.div
      whileInView={{
        opacity: 0.25 + intensity * 0.75,
        scale: 0.9 + intensity * 0.1,
      }}
      transition={{ duration: 0.5, ease: EASING }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        color: room.color,
        filter: `brightness(${0.4 + intensity * 0.6})`,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          border: '1px solid',
          borderColor: intensity > 0.5 ? room.color : 'var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: intensity > 0.5
            ? `color-mix(in srgb, ${room.color} 8%, transparent)`
            : 'var(--bg-raised)',
          transition: 'border-color 0.4s cubic-bezier(0.16,1,0.3,1), background-color 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {ROOM_ICONS[room.label]}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {room.label}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Badge Card                                                        */
/* ------------------------------------------------------------------ */

function BadgeCard({
  plan,
  tierIndex,
}: {
  plan: SubscriptionPlan;
  tierIndex: number;
}) {
  const isEnterprise = plan.id === 'enterprise';

  return (
    <motion.div
      key={plan.id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASING }}
      style={{
        width: '100%',
        maxWidth: 400,
        border: isEnterprise ? '1px dashed var(--border-emphasis)' : '1px solid var(--border-emphasis)',
        borderRadius: 12,
        backgroundColor: 'var(--bg-raised)',
        overflow: 'hidden',
      }}
    >
      {/* Header stripe */}
      <div
        style={{
          padding: '12px 24px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        {isEnterprise ? 'INSTURIX CUSTOM CLEARANCE' : 'INSTURIX PRODUCTION FLOOR'}
      </div>

      {/* Gold separator */}
      <div
        style={{
          height: 1,
          backgroundColor: isEnterprise ? 'var(--border-emphasis)' : 'var(--accent-gold)',
          margin: '0 24px',
        }}
      />

      {/* Body */}
      <div style={{ padding: '24px 24px 16px' }}>
        {/* Clearance level */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            marginBottom: 4,
          }}
        >
          CLEARANCE LEVEL
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          {isEnterprise ? 'CUSTOM' : plan.name.toUpperCase()}
        </div>

        {/* Price */}
        {isEnterprise ? (
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            Custom pricing
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              ${plan.price}
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
          </div>
        )}

        {/* Credits */}
        {!isEnterprise && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--accent-gold)',
              marginBottom: 16,
            }}
          >
            {plan.credits.toLocaleString()} CREDITS/MONTH
          </div>
        )}

        {/* Room dots */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 24,
          }}
        >
          {ROOMS.map((room) => (
            <motion.span
              key={room.label}
              whileInView={{
                opacity: 1,
                scale: 1,
              }}
              transition={{ duration: 0.4, ease: EASING }}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: room.color,
                filter: `brightness(${0.5 + (tierIndex / 3) * 0.5})`,
              }}
            />
          ))}
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {plan.features.map((feature) => (
            <div
              key={feature}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Check
                size={14}
                style={{ color: 'var(--status-success)', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {feature}
              </span>
            </div>
          ))}
        </div>

        {/* Barcode */}
        {!isEnterprise && <Barcode />}
      </div>

      {/* CTA */}
      <div style={{ padding: '0 24px 24px' }}>
        {isEnterprise ? (
          <Link
            href="/contact"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              height: 48,
              borderRadius: 7,
              border: '1px dashed var(--border-emphasis)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'border-color 0.3s cubic-bezier(0.16,1,0.3,1), color 0.3s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            Contact Sales
            <ArrowRight size={14} />
          </Link>
        ) : (
          <Link
            href={`/checkout?plan=${plan.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              height: 48,
              borderRadius: 7,
              border: 'none',
              backgroundColor: 'var(--accent-gold)',
              color: 'var(--bg-canvas)',
              fontSize: 14,
              fontWeight: 800,
              textDecoration: 'none',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'opacity 0.3s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            Activate
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flanking plan button                                              */
/* ------------------------------------------------------------------ */

function PlanButton({
  plan,
  isActive,
  onClick,
}: {
  plan: SubscriptionPlan;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 7,
        border: isActive
          ? '1px solid var(--accent-gold)'
          : '1px solid var(--border-subtle)',
        backgroundColor: isActive ? 'var(--bg-well)' : 'var(--bg-raised)',
        color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {plan.name}
      {!isEnterprisePlan(plan) && (
        <span
          style={{
            marginLeft: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: isActive ? 'var(--text-secondary)' : 'var(--text-dim)',
          }}
        >
          ${plan.price}
        </span>
      )}
    </button>
  );
}

function isEnterprisePlan(plan: SubscriptionPlan): boolean {
  return plan.id === 'enterprise';
}

/* ------------------------------------------------------------------ */
/*  Credit packs section                                              */
/* ------------------------------------------------------------------ */

function CreditPacks() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASING }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        marginTop: 48,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        TOP-UP PACKS
      </span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {CREDIT_PACKAGES.map((pkg) => (
          <div
            key={pkg.id}
            style={{
              padding: '12px 24px',
              borderRadius: 7,
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-raised)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              {pkg.credits} credits
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              ${pkg.prices.USD}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

export function PricingBadge() {
  const [selectedTier, setSelectedTier] = useState(1);

  /** Resolve which plan is featured for the active tier. */
  const allPlans = [...SUBSCRIPTION_PLANS, ENTERPRISE_PLAN];
  const activePlanId = VOLUME_TIERS[selectedTier].planId;
  const activePlan =
    allPlans.find((p) => p.id === activePlanId) ?? SUBSCRIPTION_PLANS[1];

  /** Room intensity scales with tier (all rooms always lit). */
  const intensityForTier = (tierIdx: number): number => {
    // tier 0 = 0.35, tier 1 = 0.55, tier 2 = 0.75, tier 3 = 1.0
    return Math.min(1, 0.35 + tierIdx * 0.22);
  };

  const intensity = intensityForTier(selectedTier);

  /** Plans shown as flanking buttons (everything except the active plan). */
  const flankingPlans = allPlans.filter((p) => p.id !== activePlanId);

  return (
    <section
      style={{
        width: '100%',
        padding: '64px 24px',
        backgroundColor: 'var(--bg-canvas)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* ---- Hero ---- */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASING }}
        style={{ textAlign: 'center', marginBottom: 48 }}
      >
        <h2
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          One platform. Entire production.
        </h2>
        <p
          style={{
            fontSize: 18,
            color: 'var(--text-secondary)',
            fontWeight: 400,
          }}
        >
          Choose your access level
        </p>
      </motion.div>

      {/* ---- Room selector ---- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: EASING }}
        style={{
          display: 'flex',
          gap: 24,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 32,
        }}
      >
        {ROOMS.map((room) => (
          <RoomIcon key={room.label} room={room} intensity={intensity} />
        ))}
      </motion.div>

      {/* ---- Volume tier buttons ---- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: EASING }}
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 48,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {VOLUME_TIERS.map((tier) => (
          <button
            key={tier.id}
            onClick={() => setSelectedTier(tier.id)}
            style={{
              padding: '8px 24px',
              borderRadius: 7,
              border:
                selectedTier === tier.id
                  ? '1px solid var(--accent-gold)'
                  : '1px solid var(--border-subtle)',
              backgroundColor:
                selectedTier === tier.id ? 'var(--bg-well)' : 'var(--bg-raised)',
              color:
                selectedTier === tier.id ? 'var(--accent-gold)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {tier.label}
          </button>
        ))}
      </motion.div>

      {/* ---- Badge card ---- */}
      <BadgeCard plan={activePlan} tierIndex={selectedTier} />

      {/* ---- Flanking plan buttons ---- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: EASING }}
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 32,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {flankingPlans.map((p) => (
          <PlanButton
            key={p.id}
            plan={p}
            isActive={false}
            onClick={() => {
              const tierMatch = VOLUME_TIERS.findIndex((t) => t.planId === p.id);
              if (tierMatch >= 0) setSelectedTier(tierMatch);
            }}
          />
        ))}
      </motion.div>

      {/* ---- Credit top-up packs ---- */}
      <CreditPacks />
    </section>
  );
}
