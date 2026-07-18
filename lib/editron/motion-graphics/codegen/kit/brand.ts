/**
 * MG Codegen kit — Brand tokens. PORTED VERBATIM from explainer-remotion/src/bricks/brand.ts
 * (render-proven). MG Codegen Lane E0, §5 "port, don't rebuild".
 *
 * The ONLY thing that changes between customers. Every brick reads these; none hardcode a value.
 * NOT just a palette: it carries SHAPE (corner roundness, border weight), TYPE character (weight,
 * tracking, line-height, case), DENSITY (airy↔dense spacing), DECORATION (grid/glow) and MOTION
 * personality. Two brands can share a form yet feel structurally different, not just recolored.
 * Editron's real client brand is mapped INTO this type by the brand-mapper (Phase 2b).
 */
import type { CSSProperties } from 'react';

export type Brand = {
  name: string;
  productName: string;
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentText: string; // legible text ON the accent
  };
  fontSans: string;
  /** Heavy CONDENSED display face for impact/kinetic headlines (FitHeadline face='display', rendered ALL-CAPS).
   *  Loaded by kit/fonts.ts. Optional — falls back to Anton when a brand doesn't specify one. */
  fontDisplay?: string;
  type: {
    headingWeight: number; // 500..900
    tracking: string; // letter-spacing on headings
    lineHeight: number;
    eyebrowCase: 'none' | 'upper';
  };
  shape: {
    radius: number; // corner roundness personality
    border: number; // hairline (1) ↔ bold (2-3)
  };
  density: number; // 0 = airy/minimal, 1 = dense/editorial → scales padding, gaps, sizes, element counts
  decor: {
    grid: boolean;
    glow: boolean;
  };
  motion: {
    energy: number; // 0..1 higher = faster, tighter reveals
    overshoot: number; // 0..1 higher = springier pop
  };
};

// Insturix — warm editorial dark. Heavy tight type, dense, mid-round, gold, grid + glow, snappy.
// Kept as the default/fallback Brand for the platform's own graphics.
export const INSTURIX: Brand = {
  name: 'Insturix',
  productName: 'Insturix',
  colors: {
    bg: '#0B0B0A',
    surface: '#16171A',
    surfaceAlt: '#1E2026',
    text: '#F7F4EA',
    muted: '#9C978C',
    border: 'rgba(255,255,255,0.10)',
    accent: '#D4A652',
    accentText: '#0B0B0A',
  },
  fontSans: 'Plus Jakarta Sans, Inter, sans-serif',
  fontDisplay: 'Anton, sans-serif',
  type: { headingWeight: 800, tracking: '-0.022em', lineHeight: 1.0, eyebrowCase: 'upper' },
  shape: { radius: 14, border: 1 },
  density: 0.78,
  decor: { grid: true, glow: true },
  motion: { energy: 0.85, overshoot: 0.5 },
};

// Northwind — a totally different company: airy corporate light. Lighter type, roomy, very rounded,
// cool blue, NO grid/glow (flat + soft shadow), calm motion. (Fictional, proves structural re-skin.)
export const NORTHWIND: Brand = {
  name: 'Northwind',
  productName: 'Northwind',
  colors: {
    bg: '#F5F7FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF2FA',
    text: '#0F1B2D',
    muted: '#6B7890',
    border: 'rgba(15,27,45,0.09)',
    accent: '#2F6BFF',
    accentText: '#FFFFFF',
  },
  fontSans: 'Inter, Helvetica, Arial, sans-serif',
  fontDisplay: 'Anton, sans-serif',
  type: { headingWeight: 600, tracking: '-0.005em', lineHeight: 1.14, eyebrowCase: 'none' },
  shape: { radius: 24, border: 1.5 },
  density: 0.32,
  decor: { grid: false, glow: false },
  motion: { energy: 0.35, overshoot: 0.1 },
};

/** Append a 2-digit hex alpha to a 6-digit hex, else return unchanged (safe for rgba() brands). */
export const withAlpha = (color: string, alpha: number): string => {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    // NaN-safe (same rule as clampByte below): a non-finite alpha degrades to fully transparent, never '#..NaN'.
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(255, Math.round(alpha * 255))) : 0;
    return color + a.toString(16).padStart(2, '0');
  }
  return color;
};

/** density → linear scale between an airy value and a dense value. */
export const dv = (brand: Brand, airy: number, dense: number): number => airy + (dense - airy) * brand.density;

// ─── Colour axis (in-brand palette moves) ───────────────
// tint/shade/mix derive NEW colours FROM the brand palette, so a style can shift mood (neon-energy ↔ muted-calm,
// duotone, gradient stops) while staying brand-locked (Law 4). They operate on #rgb/#rrggbb; any non-hex token
// (e.g. an rgba() border) passes through unchanged, exactly like withAlpha.
const parseHex = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
// NaN-safe: a non-finite channel or amount (e.g. a model-computed value that went NaN via frame math) must NEVER
// emit a garbage '#NaNNaNNaN' string — it degrades to a valid colour. clampByte→0; unit01→0 (0 = identity, so
// tint/shade/mix return the base colour unblended rather than a broken hex).
const clampByte = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0);
const unit01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;

/** Lighten a brand colour toward white by `amount` (0..1) — the bright/energetic end of the colour axis. */
export const tint = (color: string, amount: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const t = unit01(amount);
  return toHex(rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t);
};
/** Darken a brand colour toward black by `amount` (0..1) — the muted/calm/deep end of the colour axis. */
export const shade = (color: string, amount: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const t = unit01(amount);
  return toHex(rgb[0] * (1 - t), rgb[1] * (1 - t), rgb[2] * (1 - t));
};
/** Blend two brand colours (`t`=0 → a, 1 → b) — duotone / gradient stops within the brand palette. */
export const mix = (a: string, b: string, t: number): string => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const u = unit01(t);
  return toHex(ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u);
};

// ─── Surface axis (material depth, DERIVED from brand tokens) ─────────────
// The SURFACE axis (atomize-the-style, axis 4) as PHYSICAL finishes — NOT named brand looks ("Iman glass") and
// NOT free scalar knobs (an LLM has no grounded meaning for gloss:0.4 — the C1 illegibility corpse). Each mode is
// a point on the axis; its material depth (top-lit rim, layered elevation shadow, gradient fill, accent halo,
// tactile grain) is COMPUTED from the brand's own tokens + the moment's emphasis, so the SAME mode reads right on
// a dark editorial brand and a light corporate one. Harvest mapping (brand-composition-rules.deriveMaterialRules):
// the finish keys off BG LUMINANCE — dark surfaces carry depth via specular rims + fill gradients (shadows vanish
// on dark), light surfaces via ambient elevation shadow (rims vanish on white). Every colour is a brand
// derivation (Law 4); every number is NaN-safe via the helpers above.

/** Rec709 relative luminance of a brand colour (0=black … 1=white). Non-hex (an rgba() token) → 0.15 (treat as
 *  dark). The one signal the material finish keys off, per the harvest audit. */
export const luminance = (color: string): number => {
  const rgb = parseHex(color);
  if (!rgb) return 0.15;
  const [r, g, b] = rgb.map((v) => v / 255);
  return unit01(0.2126 * r + 0.7152 * g + 0.0722 * b);
};

/** The surface-axis values — physical finishes, not looks. flat (scrim) · gradient (top-lit fill) · frosted
 *  (glass: rim + inner sheen) · raised (layered elevation shadow) · glow (accent-lit rim + halo). */
export const SURFACE_MODES = ['flat', 'gradient', 'frosted', 'raised', 'glow'] as const;
export type SurfaceMode = (typeof SURFACE_MODES)[number];

/** A derived material: the base fill/border/shadow + any inset overlay layers (sheen, grain) the caller renders as
 *  absolutely-positioned divs. Pure data (no React) so it is unit-testable and frame-independent — the entrance
 *  fade lives on the caller's wrapper. */
export interface MaterialSurface {
  base: CSSProperties;
  overlays: CSSProperties[];
}

// Deterministic film-grain tile (seeded feTurbulence → identical every render; ink is neutral, alpha carries it).
const GRAIN_TILE = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='mg'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#mg)'/></svg>`;

/**
 * Derive a material surface from brand tokens. `mode` picks the physical finish; `emphasis` (0..1, from the
 * moment) scales its depth (a hero beat gets a richer, glossier surface; a subtle beat stays understated);
 * `grain` adds tactile noise; `opacity` is the fill alpha. NaN-safe throughout. `flat` is byte-identical to the
 * original Plate scrim (backward-compatible default).
 */
export function materialSurface(
  brand: Brand,
  mode: SurfaceMode = 'flat',
  opts: { emphasis?: number; grain?: boolean; opacity?: number } = {},
): MaterialSurface {
  const e = unit01(opts.emphasis ?? 0.5);
  const op = unit01(opts.opacity ?? 0.9);
  const dark = luminance(brand.colors.bg) < 0.4;
  const surf = brand.colors.surface;
  const surfAlt = brand.colors.surfaceAlt;
  const acc = brand.colors.accent;
  const bord = `${brand.shape.border}px solid ${brand.colors.border}`;

  // Depth primitives, all derived. Rim = a top specular highlight + a bottom occlusion line (light from above);
  // strong on dark surfaces, near-absent on light ones. Elevation = ambient + key shadow (real material layers),
  // visible on light surfaces, faint on dark. Halo = an outer accent bloom for the emphasis finish.
  const rim = `inset 0 1px 0 ${withAlpha('#ffffff', (dark ? 0.14 : 0.04) * (0.55 + 0.45 * e))}, inset 0 -1px 0 ${withAlpha('#000000', 0.1 * (0.5 + 0.5 * e))}`;
  const elevation = `0 ${2 + Math.round(5 * e)}px ${6 + Math.round(10 * e)}px ${withAlpha('#000000', dark ? 0.26 : 0.13)}, 0 ${8 + Math.round(16 * e)}px ${22 + Math.round(26 * e)}px ${withAlpha('#000000', dark ? 0.2 : 0.1)}`;
  const halo = `0 0 ${16 + Math.round(26 * e)}px ${withAlpha(acc, 0.3 * (0.5 + 0.5 * e))}, inset 0 0 ${12 + Math.round(18 * e)}px ${withAlpha(acc, 0.13 * (0.5 + 0.5 * e))}`;
  const gradientFill = `linear-gradient(157deg, ${withAlpha(tint(surf, dark ? 0.06 : 0.02), op)} 0%, ${withAlpha(surf, op)} 64%)`;

  const grainOverlay: CSSProperties = {
    backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_TILE)}")`,
    backgroundSize: '100px 100px',
    opacity: 0.07 * (0.5 + 0.5 * e),
  };
  const sheenOverlay: CSSProperties = {
    background: `linear-gradient(180deg, ${withAlpha('#ffffff', (dark ? 0.1 : 0.05) * (0.5 + 0.5 * e))} 0%, transparent 42%)`,
  };
  const withGrain = (base: CSSProperties, overlays: CSSProperties[] = []): MaterialSurface => ({
    base,
    overlays: opts.grain ? [...overlays, grainOverlay] : overlays,
  });

  switch (mode) {
    case 'gradient':
      return withGrain({ background: gradientFill, border: bord, boxShadow: rim });
    case 'frosted':
      return withGrain(
        {
          background: `linear-gradient(157deg, ${withAlpha(surf, op * 0.6)} 0%, ${withAlpha(surfAlt, op * 0.42)} 100%)`,
          border: `${brand.shape.border}px solid ${withAlpha(brand.colors.text, 0.14)}`,
          boxShadow: rim,
        },
        [sheenOverlay],
      );
    case 'raised':
      return withGrain({
        background: withAlpha(surfAlt, Math.min(1, op + 0.08)),
        border: bord,
        boxShadow: `${elevation}, ${rim}`,
      });
    case 'glow':
      return withGrain({
        background: gradientFill,
        border: `${brand.shape.border}px solid ${withAlpha(acc, 0.5)}`,
        boxShadow: halo,
      });
    default: // flat — byte-identical to the original scrim (no overlays, no shadow)
      return withGrain({ background: withAlpha(surf, op), border: bord });
  }
}
