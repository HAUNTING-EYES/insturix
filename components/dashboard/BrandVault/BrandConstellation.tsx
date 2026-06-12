'use client';

/**
 * BrandConstellation
 *
 * C1 Star Chart hero for Brand Vault review. The atmosphere lives in the
 * field; the signal marks stay crisp, small, and evidence-coded.
 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';

export interface BrandConstellationFacet {
  id: string;
  label: string;
  color: string;
  coverage: number;
}

export interface BrandConstellationConflict {
  facetId?: string;
  label?: string;
  sourceLabel?: string;
  detail?: string;
}

interface BrandConstellationProps {
  brandName: string;
  facets: BrandConstellationFacet[];
  conflict?: BrandConstellationConflict | null;
  resolved?: boolean;
}

interface StarPoint {
  x: number;
  y: number;
}

const BG_STAR_COUNT = 170;
const CENTER: StarPoint = { x: 600, y: 320 };
const POSITIONS: StarPoint[] = [
  { x: 384, y: 196 },
  { x: 822, y: 206 },
  { x: 846, y: 452 },
  { x: 372, y: 456 },
  { x: 600, y: 512 },
  { x: 600, y: 128 },
];
const ANOMALY: StarPoint = { x: 208, y: 118 };

function normalizeCoverage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function gradientId(id: string): string {
  return `brand-vault-star-${id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
}

function StarField() {
  const stars = useMemo(
    () =>
      Array.from({ length: BG_STAR_COUNT }, (_, id) => {
        const bright = Math.random();
        const size = bright > 0.93 ? 2.4 : bright > 0.7 ? 1.6 : 1;
        return {
          id,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          size: `${size}px`,
          opacity: (0.25 + Math.random() * 0.5).toFixed(2),
          duration: `${3.5 + Math.random() * 5}s`,
          delay: `${Math.random() * 6}s`,
          color: bright > 0.97 ? '#F1DDB0' : '#ECE9E1',
        };
      }),
    [],
  );

  return (
    <div className="absolute inset-0 z-0">
      {stars.map((star) => (
        <i
          key={star.id}
          className="absolute rounded-full"
          style={{
            '--star-opacity': star.opacity,
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            background: star.color,
            animation: `brandVault-twinkle ${star.duration} ease-in-out infinite`,
            animationDelay: star.delay,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function facetPosition(index: number): StarPoint {
  return POSITIONS[index % POSITIONS.length];
}

export function BrandConstellation({
  brandName,
  facets,
  conflict,
  resolved = false,
}: BrandConstellationProps) {
  const chartFacets = facets.slice(0, 6);
  const conflictFacetIndex = Math.max(
    0,
    chartFacets.findIndex((facet) => facet.id === conflict?.facetId),
  );
  const conflictAnchor = facetPosition(conflictFacetIndex);
  const anomalyVisible = Boolean(conflict) && !resolved;
  const anomalyText = conflict?.label ?? 'anomaly';
  const anomalySource = conflict?.sourceLabel ?? 'public source';
  const anomalyDetail = conflict?.detail ?? 'conflicts';

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes brandVault-twinkle {
  0%, 100% { opacity: var(--star-opacity, 0.5); }
  50% { opacity: calc(var(--star-opacity, 0.5) * 0.35); }
}
@keyframes brandVault-heroIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes brandVault-draw {
  to { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .brand-vault-motion {
    animation: none !important;
    transition: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}`,
        }}
      />
      <section
        className="relative w-full overflow-hidden"
        style={{
          height: 620,
          borderBottom: '1px solid #1C1B19',
          background:
            'radial-gradient(ellipse 50% 42% at 50% 30%, rgba(212,166,82,0.07), transparent 60%), radial-gradient(ellipse 44% 40% at 82% 72%, rgba(144,136,212,0.06), transparent 55%), radial-gradient(ellipse 42% 36% at 16% 74%, rgba(92,184,204,0.05), transparent 55%), #08080A',
        }}
      >
        <StarField />

        <div
          className="brand-vault-motion absolute left-10 top-[30px] z-[6]"
          style={{
            opacity: 0,
            animation: 'brandVault-heroIn 0.9s cubic-bezier(.16,1,.3,1) 0.15s forwards',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#5F5E5A',
            }}
          >
            Brand memory &middot; celestial atlas
          </div>
          <h1
            style={{
              margin: '8px 0 0',
              fontSize: 34,
              lineHeight: 1.12,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#ECE9E1',
            }}
          >
            {brandName}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#7A776E' }}>
            {chartFacets.length} facets charted &middot; {anomalyVisible ? '1 anomaly' : '0 anomalies'}
          </p>
        </div>

        <div
          className="brand-vault-motion absolute right-10 top-[30px] z-[6] flex items-center gap-2"
          style={{
            opacity: 0,
            animation: 'brandVault-heroIn 0.9s cubic-bezier(.16,1,.3,1) 0.25s forwards',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#5F5E5A',
            }}
          >
            mag = confidence
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 11px',
              borderRadius: 7,
              border: '1px solid rgba(212,166,82,0.25)',
              background: '#1B1A18',
              color: '#D4A652',
              fontSize: 11,
            }}
          >
            Chart
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 11px',
              borderRadius: 7,
              border: '1px solid #1C1B19',
              background: 'rgba(11,11,10,0.5)',
              color: '#7A776E',
              fontSize: 11,
            }}
          >
            Docs
          </span>
        </div>

        <div
          className="brand-vault-motion absolute inset-0 z-[3]"
          style={{
            opacity: 0,
            animation: 'brandVault-heroIn 1s cubic-bezier(.16,1,.3,1) 0.35s forwards',
          }}
        >
          <svg
            viewBox="0 0 1200 620"
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
            aria-label={`${brandName} brand signal constellation`}
            role="img"
          >
            <defs>
              <radialGradient id="brand-vault-star-brand">
                <stop offset="0%" stopColor="#FFFDF8" />
                <stop offset="28%" stopColor="#F1DDB0" />
                <stop offset="60%" stopColor="#D4A652" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#D4A652" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="brand-vault-star-anomaly">
                <stop offset="0%" stopColor="#F6D9D4" />
                <stop offset="45%" stopColor="#D46A5C" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#D46A5C" stopOpacity="0" />
              </radialGradient>
              {chartFacets.map((facet) => (
                <radialGradient key={facet.id} id={gradientId(facet.id)}>
                  <stop offset="0%" stopColor="#FFFDF8" />
                  <stop offset="45%" stopColor={facet.color} stopOpacity="0.82" />
                  <stop offset="100%" stopColor={facet.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            <g fill="none" stroke="#ECE9E1" strokeOpacity="0.04">
              <circle cx={CENTER.x} cy={CENTER.y} r="150" />
              <circle cx={CENTER.x} cy={CENTER.y} r="250" />
            </g>
            <g stroke="#ECE9E1" strokeOpacity="0.12" strokeWidth="1">
              {chartFacets.map((facet, index) => {
                const pos = facetPosition(index);
                return (
                  <line
                    key={`${facet.id}-line`}
                    x1={CENTER.x}
                    y1={CENTER.y}
                    x2={pos.x}
                    y2={pos.y}
                  />
                );
              })}
            </g>

            <g
              style={{
                opacity: anomalyVisible ? 1 : 0,
                transition: 'opacity 0.7s cubic-bezier(.16,1,.3,1)',
              }}
            >
              <line
                x1={conflictAnchor.x}
                y1={conflictAnchor.y}
                x2={ANOMALY.x}
                y2={ANOMALY.y}
                stroke="#D46A5C"
                strokeWidth="1.4"
                strokeDasharray="200"
                strokeDashoffset="200"
                style={{
                  animation: anomalyVisible
                    ? 'brandVault-draw 1.4s cubic-bezier(.16,1,.3,1) 1.1s forwards'
                    : undefined,
                }}
              />
              <text
                x="270"
                y="142"
                fill="#D46A5C"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10"
                letterSpacing="1"
              >
                anomaly &middot; {anomalyDetail}
              </text>
              <circle cx={ANOMALY.x} cy={ANOMALY.y} r="20" fill="url(#brand-vault-star-anomaly)" />
              <circle
                cx={ANOMALY.x}
                cy={ANOMALY.y}
                r="6.5"
                fill="none"
                stroke="#D46A5C"
                strokeWidth="1.4"
                strokeDasharray="3 3"
              />
              <text
                x={ANOMALY.x}
                y="100"
                textAnchor="middle"
                fill="#D46A5C"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                fontSize="13"
              >
                {anomalyText}
              </text>
              <text
                x={ANOMALY.x}
                y="154"
                textAnchor="middle"
                fill="#9C5048"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="9"
              >
                {anomalySource}
              </text>
            </g>

            <circle cx={CENTER.x} cy={CENTER.y} r="46" fill="url(#brand-vault-star-brand)" />
            <g stroke="#FFFDF8" strokeOpacity="0.7">
              <line x1="600" y1="296" x2="600" y2="344" />
              <line x1="576" y1="320" x2="624" y2="320" />
            </g>
            <circle cx={CENTER.x} cy={CENTER.y} r="3.2" fill="#FFFDF8" />
            <text
              x={CENTER.x}
              y="362"
              textAnchor="middle"
              fill="#ECE9E1"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              fontSize="16"
              fontWeight="500"
            >
              {brandName}
            </text>
            <text
              x={CENTER.x}
              y="378"
              textAnchor="middle"
              fill="#7A776E"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="9"
              letterSpacing="2"
            >
              alpha / BRAND
            </text>

            {chartFacets.map((facet, index) => {
              const pos = facetPosition(index);
              const coverage = normalizeCoverage(facet.coverage);
              const radius = Math.max(15, 16 + coverage * 12);
              const labelY = pos.y + radius + 15;
              const magY = labelY + 15;
              return (
                <g key={facet.id}>
                  <circle cx={pos.x} cy={pos.y} r={radius} fill={`url(#${gradientId(facet.id)})`} />
                  <circle cx={pos.x} cy={pos.y} r={2 + coverage * 1.4} fill="#FFFDF8" />
                  <text
                    x={pos.x}
                    y={labelY}
                    textAnchor="middle"
                    fill="#B5B2A8"
                    fontFamily="'Plus Jakarta Sans', sans-serif"
                    fontSize="13"
                  >
                    {facet.label}
                  </text>
                  <text
                    x={pos.x}
                    y={magY}
                    textAnchor="middle"
                    fill="#5F5E5A"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize="9"
                  >
                    mag {coverage.toFixed(2)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>
    </>
  );
}
