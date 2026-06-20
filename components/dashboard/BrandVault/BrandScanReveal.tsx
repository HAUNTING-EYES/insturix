'use client';

/**
 * BrandScanReveal — the scanning state, shown while a refinery job is
 * queued/running and no draft has landed yet. When the draft arrives this
 * unmounts and BrandHero mounts (its entrance animation is the "reveal").
 *
 * Honest progress: the refinery reports only a coarse status, not a live
 * per-signal count, so this shows the REAL pipeline stages cycling + an
 * indeterminate sweep — never a fabricated "0 -> N signals" counter (R31).
 * Deterministic (no Math.random) and reduced-motion aware.
 */

import { useEffect, useState } from 'react';

const SCAN_STAGES = [
  'Fetching the site…',
  'Reading pages…',
  'Extracting palette & type…',
  'Listening for the voice…',
  'Profiling the audience…',
  'Cross-checking sources…',
] as const;

const SCAN_FACETS = ['Palette', 'Type', 'Voice', 'Audience', 'Sources'] as const;

const SCAN_FIELD =
  'radial-gradient(ellipse 54% 48% at 24% 26%, rgba(212,166,82,0.07), transparent 60%),' +
  'radial-gradient(ellipse 46% 44% at 88% 70%, rgba(144,136,212,0.055), transparent 58%),' +
  'radial-gradient(ellipse 40% 38% at 70% 16%, rgba(92,184,204,0.045), transparent 55%),' +
  '#08080A';

export function BrandScanReveal({ label }: { label?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1500);
    return () => clearInterval(id);
  }, []);

  const status = SCAN_STAGES[tick % SCAN_STAGES.length];
  const litCount = Math.min(tick + 1, SCAN_FACETS.length);

  return (
    <section
      className="relative overflow-hidden border-b border-[#1C1B19]"
      aria-label="Reading your brand"
      aria-live="polite"
      style={{ background: SCAN_FIELD }}
    >
      <style>{'@keyframes bvscan-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}'}</style>
      <div className="relative z-[1] mx-auto flex min-h-[360px] max-w-[1180px] flex-col items-center justify-center px-5 py-16 text-center sm:px-10">
        <span className="font-['JetBrains_Mono'] text-[10px] font-medium uppercase tracking-[0.18em] text-[#5F5E5A]">
          Establishing brand memory
        </span>

        <span
          className="mt-5 h-3.5 w-3.5 rounded-full bg-[#F1DDB0] animate-pulse motion-reduce:animate-none"
          style={{ boxShadow: '0 0 0 6px rgba(212,166,82,0.12)' }}
          aria-hidden="true"
        />

        <h2 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em] text-[#ECE9E1] sm:text-[28px]">
          {label ? `Reading ${label}` : 'Reading your brand'}
        </h2>

        <p className="mt-2.5 h-5 text-[13px] text-[#B5B2A8]">{status}</p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {SCAN_FACETS.map((facet, index) => {
            const lit = index < litCount;
            return (
              <span
                key={facet}
                className={`flex items-center gap-2 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.05em] transition-opacity duration-500 ${lit ? 'text-[#B5B2A8] opacity-100' : 'text-[#5F5E5A] opacity-30'}`}
              >
                <span className={`h-2 w-2 flex-none rounded-full ${lit ? 'bg-[#5EC97E]' : 'bg-[#454340]'}`} />
                {facet}
              </span>
            );
          })}
        </div>

        <div className="mt-8 h-0.5 w-full max-w-[320px] overflow-hidden rounded-full bg-[#282724]">
          <div
            className="h-full w-1/3 rounded-full bg-[#D4A652] motion-reduce:hidden"
            style={{ animation: 'bvscan-sweep 1.5s linear infinite' }}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
