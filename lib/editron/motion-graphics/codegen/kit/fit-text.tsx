/**
 * MG Codegen kit — Fit-Text (the only way words reach the screen). PORTED VERBATIM from
 * explainer-remotion/src/bricks/fit-text.tsx. MG Codegen Lane E0, §5.
 *
 * No fontSize prop, no color prop: size is COMPUTED (deterministic width estimation → binary-search fit
 * inside the Region, greedy word-wrap, words never split), and colour comes from a closed `tone` enum
 * mapped to brand tokens. Clipping and off-brand colour are UNREPRESENTABLE through this API (Law 4:
 * brand by construction — the scan additionally rejects any hand-typed fontSize / hex colour).
 */
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Brand } from './brand';
import { withAlpha, dv } from './brand';
import { useRegionSize } from './stage';

const avgAdvance = (weight: number, upper: boolean): number => {
  const base = weight >= 700 ? 0.6 : weight >= 500 ? 0.565 : 0.535; // Plus Jakarta-ish, conservative
  return base * (upper ? 1.08 : 1);
};
const lineWidth = (line: string, px: number, weight: number, trackingEm: number, upper: boolean): number =>
  line.length * px * avgAdvance(weight, upper) + Math.max(0, line.length - 1) * trackingEm * px;

const wrap = (text: string, px: number, maxW: number, weight: number, trEm: number, upper: boolean): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (lineWidth(cand, px, weight, trEm, upper) <= maxW || !cur) cur = cand;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

/** Largest font size (px) at which `text` wraps into ≤ maxLines lines, every line ≤ maxW. Deterministic. */
export const fitSize = (
  text: string,
  maxW: number,
  maxLines: number,
  capPx: number,
  weight = 800,
  trackingEm = -0.02,
  upper = false,
): number => {
  let lo = 10;
  let hi = Math.max(12, Math.round(capPx));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const lines = wrap(text, mid, maxW, weight, trackingEm, upper);
    const fits = lines.length <= maxLines && lines.every((l) => lineWidth(l, mid, weight, trackingEm, upper) <= maxW);
    if (fits) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

type Tone = 'text' | 'muted' | 'accent';
const toneColor = (brand: Brand, t: Tone): string =>
  t === 'accent' ? brand.colors.accent : t === 'muted' ? brand.colors.muted : brand.colors.text;

const SIZE_CAP: Record<'display' | 'xl' | 'l' | 'm' | 's', { frac: number; lines: number }> = {
  display: { frac: 0.15, lines: 2 },
  xl: { frac: 0.115, lines: 2 },
  l: { frac: 0.085, lines: 3 },
  m: { frac: 0.06, lines: 3 },
  s: { frac: 0.042, lines: 4 },
};

const clean = (w: string) => w.replace(/[.,!?;:]/g, '').toLowerCase();

/** Headline that fits itself to its Region. Per-word (or per-char) kinetic reveal, choreography from
 *  brand.motion. `accentWords` are the ONLY route to gold. */
export const FitHeadline: React.FC<{
  brand: Brand;
  text: string;
  accentWords?: string[];
  size?: keyof typeof SIZE_CAP;
  maxLines?: number;
  startAt?: number;
  kinetic?: 'rise' | 'chars' | 'none';
  align?: 'left' | 'center' | 'right';
}> = ({ brand, text, accentWords = [], size = 'xl', maxLines, startAt = 0, kinetic = 'rise', align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { wPx } = useRegionSize();
  const cap = SIZE_CAP[size];
  const lines = maxLines ?? cap.lines;
  const weight = brand.type.headingWeight;
  const trEm = parseFloat(brand.type.tracking) || -0.02;
  const px = fitSize(text, wPx, lines, cap.frac * (wPx / 0.9) /* cap relative to region */, weight, trEm, false);
  const wrapped = wrap(text, px, wPx, weight, trEm, false);
  const accents = new Set(accentWords.map(clean));
  const stg = interpolate(brand.motion.energy, [0, 1], [5.5, 2.2]);
  const damping = interpolate(brand.motion.overshoot, [0, 1], [26, 11]);
  let idx = 0;
  return (
    <div
      style={{
        width: '100%',
        fontWeight: weight,
        fontSize: px,
        lineHeight: brand.type.lineHeight,
        letterSpacing: brand.type.tracking,
        textAlign: align,
      }}
    >
      {wrapped.map((line, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {line.split(' ').map((w, wi) => {
            const isAccent = accents.has(clean(w));
            const units = kinetic === 'chars' ? Array.from(w) : [w];
            const wordStart = startAt + idx * stg;
            idx += 1;
            return (
              <span key={`${li}-${wi}`} style={{ display: 'inline-block', whiteSpace: 'pre', marginRight: px * 0.26 }}>
                {units.map((u, ui) => {
                  const at = kinetic === 'chars' ? wordStart + ui * Math.max(0.8, stg * 0.35) : wordStart;
                  const s =
                    kinetic === 'none'
                      ? 1
                      : spring({ frame: frame - at, fps, config: { damping, mass: 0.6, stiffness: 165 + brand.motion.energy * 55 } });
                  const o = Math.max(0, Math.min(1, s));
                  return (
                    <span
                      key={ui}
                      style={{
                        display: 'inline-block',
                        color: isAccent ? brand.colors.accent : brand.colors.text,
                        opacity: o,
                        transform: `translateY(${(1 - o) * px * 0.45}px)`,
                      }}
                    >
                      {u}
                    </span>
                  );
                })}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Supporting copy. Auto-fits, tone-mapped, gently fades/rises as one block. */
export const TextBlock: React.FC<{
  brand: Brand;
  text: string;
  tone?: Tone;
  size?: 'm' | 's';
  maxLines?: number;
  startAt?: number;
  align?: 'left' | 'center' | 'right';
}> = ({ brand, text, tone = 'muted', size = 's', maxLines, startAt = 0, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { wPx } = useRegionSize();
  const cap = SIZE_CAP[size];
  const px = fitSize(text, wPx, maxLines ?? cap.lines, cap.frac * (wPx / 0.9), 500, 0, false);
  const s = spring({ frame: frame - startAt, fps, config: { damping: 24, mass: 0.7, stiffness: 140 } });
  const o = Math.max(0, Math.min(1, s));
  return (
    <div
      style={{
        width: '100%',
        fontWeight: 500,
        fontSize: px,
        lineHeight: 1.42,
        color: toneColor(brand, tone),
        textAlign: align,
        opacity: o,
        transform: `translateY(${(1 - o) * 14}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** Kicker / label / annotation pill. `tone='accent'` = gold pill with dark text (the ONE loud chip);
 *  `tone='ghost'` = hairline outline. Single line, auto-fits, never wraps or clips. */
export const Chip: React.FC<{
  brand: Brand;
  text: string;
  tone?: 'accent' | 'ghost';
  startAt?: number;
}> = ({ brand, text, tone = 'ghost', startAt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { wPx } = useRegionSize();
  const upper = brand.type.eyebrowCase === 'upper';
  const shown = upper ? text.toUpperCase() : text;
  const px = fitSize(shown, Math.min(wPx, 560) - dv(brand, 44, 30), 1, 26, 700, 0.12, upper);
  const s = spring({ frame: frame - startAt, fps, config: { damping: 16, mass: 0.55, stiffness: 190 } });
  const o = Math.max(0, Math.min(1, s));
  const accent = tone === 'accent';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: `${dv(brand, 10, 7)}px ${dv(brand, 20, 14)}px`,
        borderRadius: 999,
        backgroundColor: accent ? brand.colors.accent : withAlpha(brand.colors.text, 0.04),
        border: `${brand.shape.border}px solid ${accent ? brand.colors.accent : brand.colors.border}`,
        color: accent ? brand.colors.accentText : brand.colors.muted,
        fontWeight: 700,
        fontSize: px,
        letterSpacing: upper ? '0.14em' : '0.02em',
        whiteSpace: 'nowrap',
        opacity: o,
        transform: `scale(${0.9 + 0.1 * o})`,
      }}
    >
      {!accent && (
        <span style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: brand.colors.accent, display: 'inline-block' }} />
      )}
      {shown}
    </div>
  );
};
