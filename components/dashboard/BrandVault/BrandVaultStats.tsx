'use client';

/**
 * BrandVaultStats
 *
 * Four C1 stat cards mirroring OrgStatsBar: restrained surfaces, a tiny top
 * accent, staggered reveal, and rAF count-up for decision-critical numbers.
 */

import { useEffect, useRef, useState } from 'react';
import type { BrandVaultSummary } from './brand-vault-data';

interface BrandVaultStatsProps {
  summary: BrandVaultSummary;
}

const ANIM_DURATION = 1400;

const CARDS: {
  key: keyof BrandVaultSummary;
  label: string;
  sub: string;
  accentColor: string;
}[] = [
  { key: 'actionable', label: 'Actionable', sub: 'affects output', accentColor: '#D4A652' },
  { key: 'conflicts', label: 'Needs decision', sub: 'source conflicts', accentColor: '#D46A5C' },
  { key: 'reviewOnly', label: 'Review only', sub: 'below 0.55', accentColor: '#5F5E5A' },
  { key: 'evidence', label: 'Evidence', sub: 'candidates', accentColor: '#5EC97E' },
];

function useAnimatedCount(target: number, duration: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(undefined);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    startRef.current = null;
    setValue(0);

    function update(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(update);
      }
    }

    const timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(update);
    }, 280);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [duration, enabled, target]);

  return value;
}

function StatCard({
  label,
  value,
  sub,
  accentColor,
  index,
  inView,
}: {
  label: string;
  value: number;
  sub: string;
  accentColor: string;
  index: number;
  inView: boolean;
}) {
  const displayValue = useAnimatedCount(value, ANIM_DURATION, inView);

  return (
    <div
      className="brand-vault-stat-card relative overflow-hidden rounded-[14px]"
      style={{
        background: '#0F0F0E',
        border: '1px solid #1C1B19',
        padding: '20px 22px',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        transition:
          'opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1)',
        transitionDelay: `${0.05 + index * 0.07}s`,
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-0.5"
        style={{ background: accentColor }}
      />
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: '#ECE9E1',
        }}
      >
        {displayValue}
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#5F5E5A',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#7A776E' }}>{sub}</div>
    </div>
  );
}

export function BrandVaultStats({ summary }: BrandVaultStatsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="grid gap-4"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        padding: '28px 0',
      }}
    >
      {CARDS.map((card, index) => (
        <StatCard
          key={card.key}
          label={card.label}
          value={summary[card.key]}
          sub={card.sub}
          accentColor={card.accentColor}
          index={index}
          inView={inView}
        />
      ))}
    </div>
  );
}
