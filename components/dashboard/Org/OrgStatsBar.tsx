'use client';

/**
 * OrgStatsBar
 *
 * Four stats cards with animated count-up on mount.
 * Uses requestAnimationFrame for smooth number transitions.
 */

import { useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OrgStats {
  activeProjects: number;
  activeMembers: number;
  videosRendered: number;
  storageUsedGB: number;
}

interface OrgStatsBarProps {
  stats: OrgStats;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CARDS: {
  key: keyof OrgStats;
  label: string;
  suffix: string;
  accentColor: string;
}[] = [
  { key: 'activeProjects', label: 'Active Projects', suffix: '', accentColor: '#D4A652' },
  { key: 'activeMembers', label: 'Active Members', suffix: '', accentColor: '#5EC97E' },
  { key: 'videosRendered', label: 'Videos Rendered', suffix: '', accentColor: '#5CB8CC' },
  { key: 'storageUsedGB', label: 'Storage Used', suffix: ' GB', accentColor: '#9088D4' },
];

const ANIM_DURATION = 1400; // ms

/* ------------------------------------------------------------------ */
/*  Animated counter hook                                              */
/* ------------------------------------------------------------------ */

function useAnimatedCount(target: number, duration: number): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    startRef.current = null;

    function update(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(update);
      }
    }

    // Short delay so cards appear first
    const timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(update);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

/* ------------------------------------------------------------------ */
/*  StatCard                                                           */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  suffix,
  accentColor,
  index,
}: {
  label: string;
  value: number;
  suffix: string;
  accentColor: string;
  index: number;
}) {
  const displayValue = useAnimatedCount(value, ANIM_DURATION);

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        background: '#0F0F0E',
        border: '1px solid #1C1B19',
        padding: '20px 22px',
        opacity: 0,
        transform: 'translateY(14px)',
        animation: `orgStats-cardAppear 0.5s cubic-bezier(.16,1,.3,1) forwards`,
        animationDelay: `${0.15 + index * 0.07}s`,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: accentColor }}
      />

      <div
        className="text-[10px] tracking-[1.5px] uppercase mb-2"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: '#5F5E5A',
        }}
      >
        {label}
      </div>
      <div
        className="text-[28px] font-bold"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: '#ECE9E1',
        }}
      >
        {displayValue}
        {suffix}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function OrgStatsBar({ stats }: OrgStatsBarProps) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes orgStats-cardAppear {
  to { opacity: 1; transform: translateY(0); }
}`,
        }}
      />
      <div
        className="grid gap-4 mb-9 max-w-[1100px] mx-auto px-10"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        {CARDS.map((card, i) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={stats[card.key]}
            suffix={card.suffix}
            accentColor={card.accentColor}
            index={i}
          />
        ))}
      </div>
    </>
  );
}
