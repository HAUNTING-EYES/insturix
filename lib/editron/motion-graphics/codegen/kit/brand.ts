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
    return color + Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, '0');
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
const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;

/** Lighten a brand colour toward white by `amount` (0..1) — the bright/energetic end of the colour axis. */
export const tint = (color: string, amount: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const t = Math.max(0, Math.min(1, amount));
  return toHex(rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t);
};
/** Darken a brand colour toward black by `amount` (0..1) — the muted/calm/deep end of the colour axis. */
export const shade = (color: string, amount: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const t = Math.max(0, Math.min(1, amount));
  return toHex(rgb[0] * (1 - t), rgb[1] * (1 - t), rgb[2] * (1 - t));
};
/** Blend two brand colours (`t`=0 → a, 1 → b) — duotone / gradient stops within the brand palette. */
export const mix = (a: string, b: string, t: number): string => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const u = Math.max(0, Math.min(1, t));
  return toHex(ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u);
};
