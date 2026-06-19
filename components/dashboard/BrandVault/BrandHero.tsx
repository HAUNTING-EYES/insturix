'use client';

/**
 * BrandHero
 *
 * Brand-first hero for the Brand Vault review. The brand itself leads —
 * name, what it is, palette, voice — rendered from real, evidence-backed
 * signals. The constellation is demoted to a compact "coverage map" in the
 * rail (atmosphere on the field, crisp marks), and typography shows live
 * provenance. Deterministic (no Math.random) so it is hydration-safe.
 *
 * Only renders fields that exist on the profile — there is no tagline or
 * brand-values signal, so those are derived from category/audience/
 * productServices/proofStyle or omitted, never faked.
 */

import { useMemo } from 'react';
import type {
  BrandConstellationFacet,
  BrandVaultFontPreview,
  BrandVaultVisualIdentitySummary,
  BrandVaultVisualSwatch,
  SignalRow,
} from './brand-vault-types';

interface BrandHeroProps {
  brandName: string;
  signals: SignalRow[];
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined;
  facets: BrandConstellationFacet[];
  /** Active source conflict, if any — surfaces as the coverage-map anomaly. */
  conflict?: { label: string; sourceLabel?: string } | null;
}

const RAIL_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 74, y: 68 },
  { x: 238, y: 76 },
  { x: 246, y: 174 },
  { x: 78, y: 182 },
  { x: 156, y: 206 },
  { x: 232, y: 196 },
];
const RAIL_CENTER = { x: 156, y: 124 } as const;
const RAIL_ANOMALY = { x: 30, y: 38 } as const;

export function BrandHero({
  brandName,
  signals,
  visualIdentity,
  facets,
  conflict,
}: BrandHeroProps) {
  const signalMap = useMemo(() => {
    const map = new Map<string, SignalRow>();
    for (const signal of signals) map.set(signal.path, signal);
    return map;
  }, [signals]);

  const category = firstString(signalMap.get('identity.category')?.value);
  const audience = firstString(signalMap.get('identity.audience')?.value);
  const proofStyle = firstString(signalMap.get('identity.proofStyle')?.value);
  const productServices = stringList(signalMap.get('identity.productServices')?.value);
  const recurringPhrases = stringList(signalMap.get('voice.recurringPhrases')?.value);

  const metaParts = [category, audience].filter((part): part is string => Boolean(part));
  const chips = (productServices.length > 0 ? productServices : proofStyle ? [proofStyle] : []).slice(0, 4);
  const phrase = recurringPhrases[0] ?? null;

  const colors = (visualIdentity?.colors ?? []).slice(0, 5);
  const fonts = (visualIdentity?.fonts ?? []).slice(0, 2);
  const facetsForMap = facets.slice(0, RAIL_POSITIONS.length);

  return (
    <section className="relative overflow-hidden border-b border-[#1C1B19]" aria-label="Brand identity">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 54% 48% at 24% 26%, rgba(212,166,82,0.07), transparent 60%),' +
            'radial-gradient(ellipse 46% 44% at 88% 70%, rgba(144,136,212,0.055), transparent 58%),' +
            'radial-gradient(ellipse 40% 38% at 70% 16%, rgba(92,184,204,0.045), transparent 55%),' +
            '#08080A',
        }}
      />
      <div className="relative z-[1] mx-auto grid max-w-[1180px] gap-12 px-10 py-12 lg:grid-cols-[minmax(0,1fr)_348px]">
        {/* identity */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 font-['JetBrains_Mono'] text-[10px] font-medium uppercase tracking-[0.18em] text-[#5F5E5A]">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#5EC97E] shadow-[0_0_0_3px_rgba(94,201,126,0.14)]" />
            <span>
              Brand memory / assembled from{' '}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{signals.length}</span> signals
            </span>
          </div>

          <h1 className="mt-3.5 text-[60px] font-extrabold leading-[0.98] tracking-[-0.03em] text-[#ECE9E1]">
            {brandName}
          </h1>

          {metaParts.length > 0 && (
            <p className="mt-3.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.12em] text-[#5F5E5A]">
              {metaParts.join(' / ')}
            </p>
          )}

          {chips.length > 0 && (
            <div className="mt-[18px] flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#1C1B19] bg-[#0F0F0E] px-3 py-1.5 text-[12px] text-[#B5B2A8]"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          {colors.length > 0 && (
            <div className="mt-6 flex gap-3">
              {colors.map((swatch) => (
                <HeroSwatch key={swatch.id} swatch={swatch} />
              ))}
            </div>
          )}

          {phrase && (
            <div className="mt-[26px]">
              <p className="m-0 text-[24px] font-medium leading-snug tracking-[-0.01em] text-[#ECE9E1]">
                <span className="mr-0.5 text-[28px] leading-[0] text-[#D4A652]">&ldquo;</span>
                {phrase}
              </p>
              <p className="mt-2.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.1em] text-[#5F5E5A]">
                recurring phrase / voice signal
              </p>
            </div>
          )}
        </div>

        {/* rail: coverage map + typography */}
        <div className="grid content-start gap-4">
          <div className="rounded-[14px] border border-[#1C1B19] bg-[rgba(15,15,14,0.66)] p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A776E]">
                Coverage map
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#5F5E5A]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {facetsForMap.length} facets{conflict ? ' / 1 anomaly' : ''}
              </span>
            </div>
            <CoverageMap brandName={brandName} facets={facetsForMap} hasConflict={Boolean(conflict)} />
            <p className="mt-0.5 text-center font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.06em] text-[#5F5E5A]">
              magnitude = confidence{conflict ? ' / red = conflict' : ''}
            </p>
          </div>

          {fonts.length > 0 && (
            <div className="rounded-[14px] border border-[#1C1B19] bg-[rgba(15,15,14,0.66)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A776E]">
                  Typography
                </span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5F5E5A]">
                  {fonts.length} {fonts.length === 1 ? 'family' : 'families'}
                </span>
              </div>
              <div className="grid gap-3">
                {fonts.map((font) => (
                  <HeroFontRow key={font.id} font={font} sample={brandName} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroSwatch({ swatch }: { swatch: BrandVaultVisualSwatch }) {
  const isCandidate = swatch.role === 'candidate';
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-[12px] border border-[#282724] bg-[#0F0F0E]">
      <div className="relative h-20" style={{ background: swatch.value }}>
        {isCandidate && (
          <span className="absolute left-2 top-2 rounded-[4px] bg-black/35 px-1.5 py-1 font-['JetBrains_Mono'] text-[8px] uppercase tracking-[0.1em] text-white/85">
            candidate
          </span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2.5">
        <div className="font-['JetBrains_Mono'] text-[11px] tracking-[0.02em] text-[#B5B2A8]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {swatch.value}
        </div>
        <div className="mt-1 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5F5E5A]">
          <span
            className="h-1.5 w-1.5 flex-none rounded-full"
            style={{ background: isCandidate ? '#D4A652' : '#5EC97E' }}
          />
          {swatch.role}
        </div>
      </div>
    </div>
  );
}

function HeroFontRow({ font, sample }: { font: BrandVaultFontPreview; sample: string }) {
  const live = font.previewStatus === 'loadable_stylesheet';
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="truncate text-[13px] font-semibold text-[#ECE9E1]">{font.family}</strong>
        <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-[#5F5E5A]">{font.role}</span>
      </div>
      <p
        className="m-0 truncate text-[20px] leading-tight text-[#B5B2A8]"
        style={{ fontFamily: font.cssFontFamily }}
      >
        {font.sampleText || sample || 'Brand system'}
      </p>
      <span
        className={`font-['JetBrains_Mono'] text-[8.5px] uppercase tracking-[0.06em] ${live ? 'text-[#5EC97E]' : 'text-[#7A776E]'}`}
      >
        {live ? 'Live preview' : 'Family-name only'}
      </span>
    </div>
  );
}

function CoverageMap({
  brandName,
  facets,
  hasConflict,
}: {
  brandName: string;
  facets: BrandConstellationFacet[];
  hasConflict: boolean;
}) {
  return (
    <svg viewBox="0 0 312 248" preserveAspectRatio="xMidYMid meet" className="block h-auto w-full" role="img" aria-label={`${brandName} coverage map`}>
      <defs>
        <radialGradient id="brand-hero-core">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="30%" stopColor="#F1DDB0" />
          <stop offset="100%" stopColor="#D4A652" stopOpacity="0" />
        </radialGradient>
        {facets.map((facet) => (
          <radialGradient id={facetGradientId(facet.id)} key={facet.id}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="45%" stopColor={facet.color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={facet.color} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="brand-hero-anomaly">
          <stop offset="0%" stopColor="#F6D9D4" />
          <stop offset="45%" stopColor="#D46A5C" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#D46A5C" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g fill="none" stroke="#ECE9E1" strokeOpacity="0.05">
        <circle cx={RAIL_CENTER.x} cy={RAIL_CENTER.y} r="68" />
        <circle cx={RAIL_CENTER.x} cy={RAIL_CENTER.y} r="110" />
      </g>
      <g stroke="#ECE9E1" strokeOpacity="0.12" strokeWidth="1">
        {facets.map((facet, index) => {
          const pos = RAIL_POSITIONS[index];
          if (!pos) return null;
          return <line key={facet.id} x1={RAIL_CENTER.x} y1={RAIL_CENTER.y} x2={pos.x} y2={pos.y} />;
        })}
      </g>

      {hasConflict && (
        <>
          <line x1={RAIL_POSITIONS[0].x} y1={RAIL_POSITIONS[0].y} x2={RAIL_ANOMALY.x} y2={RAIL_ANOMALY.y} stroke="#D46A5C" strokeWidth="1.3" />
          <circle cx={RAIL_ANOMALY.x} cy={RAIL_ANOMALY.y} r="11" fill="url(#brand-hero-anomaly)" />
          <circle cx={RAIL_ANOMALY.x} cy={RAIL_ANOMALY.y} r="3.5" fill="none" stroke="#D46A5C" strokeWidth="1.1" strokeDasharray="2.5 2.5" />
        </>
      )}

      <circle cx={RAIL_CENTER.x} cy={RAIL_CENTER.y} r="26" fill="url(#brand-hero-core)" />
      <circle cx={RAIL_CENTER.x} cy={RAIL_CENTER.y} r="2.4" fill="#FFFDF8" />
      <text
        x={RAIL_CENTER.x}
        y={RAIL_CENTER.y + 24}
        textAnchor="middle"
        fill="#ECE9E1"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontSize="11"
        fontWeight="600"
      >
        {truncateLabel(brandName, 14)}
      </text>

      {facets.map((facet, index) => {
        const pos = RAIL_POSITIONS[index];
        if (!pos) return null;
        const radius = 7 + normalizeCoverage(facet.coverage) * 7;
        return (
          <g key={facet.id}>
            <circle cx={pos.x} cy={pos.y} r={radius} fill={`url(#${facetGradientId(facet.id)})`} />
            <text
              x={pos.x}
              y={pos.y + radius + 12}
              textAnchor="middle"
              fill="#8C8A82"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="8"
            >
              {truncateLabel(facet.label, 12)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim());
    return typeof first === 'string' ? first.trim() : null;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
  }
  return [];
}

function normalizeCoverage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function facetGradientId(id: string): string {
  return `brand-hero-facet-${id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
}

function truncateLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
