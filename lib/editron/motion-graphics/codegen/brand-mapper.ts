/**
 * MG Codegen — Brand mapper (E0 Phase A). The ONE place a client's identity enters the codegen kit
 * (Law 4: brand by construction). It turns Editron's `UnifiedBrand.visual` — an UNORDERED color list
 * plus loose style/type hints — into the kit's semantic `Brand` (bg/surface/text/muted/border/accent
 * + type/shape/density/decor/motion), with roles assigned by luminance / saturation / WCAG contrast so
 * the graphic is legible and on-brand, never a random recolor.
 *
 * The generated component reads `brand.colors.*` only (the scan bans raw hex), so this mapper is where
 * the real colors live. When the brand is absent we return the platform default (INSTURIX) and say so —
 * a GENERATION path for a real client should refuse upstream (strict brand resolution) rather than ship
 * the wrong brand (agency ICP: never one-brand-for-all).
 *
 * Pure; never throws. Color heuristics are INVENTED-PLACEHOLDER (calibrate on real brands).
 */

import type { Brand } from './kit/brand';
import { INSTURIX } from './kit/brand';

/** The subset of UnifiedBrand this mapper reads (structural — avoids a hard import, survives churn). */
export interface UnifiedBrandLike {
  name?: string;
  visual?: {
    colors?: string[] | null;
    visualStyle?: string | null;
    typography?: string | null;
  } | null;
}

interface RGB { r: number; g: number; b: number }
interface Swatch extends RGB { hex: string; lum: number; sat: number }

// ─── color parsing + math ───────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  gold: '#d4a652', navy: '#001f3f', gray: '#808080', grey: '#808080',
};

/** Parse hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), or a common name → RGB. null if unparseable. */
function parseColor(input: string): RGB | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  const rgbM = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbM) {
    const r = clampByte(+rgbM[1]); const g = clampByte(+rgbM[2]); const b = clampByte(+rgbM[3]);
    return { r, g, b };
  }
  let hex = s.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

function clampByte(n: number): number { return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 255 ? 255 : Math.round(n); }
function toHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance (0..1). */
function relLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** HSV-style saturation (0..1) — "vibrancy". */
function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
/** WCAG contrast ratio between two colors (1..21). */
function contrast(a: RGB, b: RGB): number {
  const la = relLuminance(a); const lb = relLuminance(b);
  const hi = Math.max(la, lb); const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
/** Linear blend a→b by t (0..1). */
function blend(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
function rgba({ r, g, b }: RGB, alpha: number): string {
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}

const BLACK: RGB = { r: 11, g: 11, b: 10 };
const WHITE: RGB = { r: 247, g: 244, b: 234 };

// ─── the mapping ─────────────────────────────────────────────────────────────

/**
 * Assign semantic color roles from an unordered swatch list. `lightBrand` decides theme (a palette
 * alone is ambiguous — a light brand still carries a dark text swatch — so the caller derives it from
 * a style hint + color counts, biased to DARK, which reads best over arbitrary footage).
 */
function mapColors(swatches: Swatch[], lightBrand: boolean): Brand['colors'] {
  // accent = most vibrant swatch; if all near-grey, the mid-luminance one.
  const byS = [...swatches].sort((a, b) => b.sat - a.sat);
  const accent = byS[0].sat > 0.15 ? byS[0] : [...swatches].sort((a, b) => Math.abs(a.lum - 0.5) - Math.abs(b.lum - 0.5))[0];

  const byLum = [...swatches].sort((a, b) => a.lum - b.lum);
  const darkest = byLum[0]; const lightest = byLum[byLum.length - 1];

  // bg = the theme extreme, text = the opposite extreme. GUARANTEE legibility: if the brand's own pair
  // fails WCAG AA (4.5:1), fall bg+text back to safe near-black/near-white (the accent still stays on-brand).
  let bg: RGB = lightBrand ? lightest : darkest;
  let text: RGB = lightBrand ? darkest : lightest;
  if (contrast(bg, text) < 4.5) {
    bg = lightBrand ? WHITE : BLACK;
    text = lightBrand ? BLACK : WHITE;
  }

  const surface = blend(bg, text, 0.06);
  const surfaceAlt = blend(bg, text, 0.12);
  const muted = blend(text, bg, 0.42);
  const accentText = contrast(accent, BLACK) >= contrast(accent, WHITE) ? toHex(BLACK) : toHex(WHITE);

  return {
    bg: toHex(bg),
    surface: toHex(surface),
    surfaceAlt: toHex(surfaceAlt),
    text: toHex(text),
    muted: toHex(muted),
    border: rgba(text, 0.1),
    accent: toHex(accent),
    accentText,
  };
}

const SERIF = /serif|garamond|times|georgia|playfair|editorial/i;
const MONO = /mono|code|courier/i;

function mapFont(typography?: string | null): string {
  if (typography && SERIF.test(typography)) return 'Georgia, "Times New Roman", serif';
  if (typography && MONO.test(typography)) return '"SF Mono", "Roboto Mono", monospace';
  return 'Plus Jakarta Sans, Inter, sans-serif';
}

/** Style hints → type/shape/density/decor/motion. Conservative: defaults with a light nudge from a few
 *  unambiguous keywords. INVENTED-PLACEHOLDER. */
function mapStyle(visualStyle?: string | null): Pick<Brand, 'type' | 'shape' | 'density' | 'decor' | 'motion'> {
  const s = (visualStyle ?? '').toLowerCase();
  const minimal = /minimal|clean|airy|simple|calm|elegant/.test(s);
  const bold = /bold|editorial|dense|energetic|dynamic|loud|vibrant/.test(s);
  const heavyType = /bold|black|heavy|strong/.test(s);
  const lightType = /light|thin|delicate/.test(s);

  return {
    type: {
      headingWeight: heavyType ? 800 : lightType ? 500 : 700,
      tracking: '-0.018em',
      lineHeight: 1.05,
      eyebrowCase: minimal ? 'none' : 'upper',
    },
    shape: { radius: bold ? 12 : 18, border: 1 },
    density: bold ? 0.72 : minimal ? 0.34 : 0.5,
    decor: { grid: bold, glow: bold },
    motion: { energy: bold ? 0.82 : minimal ? 0.4 : 0.6, overshoot: bold ? 0.5 : 0.2 },
  };
}

export interface BrandMapResult {
  brand: Brand;
  /** true when we fell back to the platform default because no usable brand was given. */
  isDefault: boolean;
}

/**
 * Map a UnifiedBrand → the kit Brand. Pure. Returns the platform default (INSTURIX) with isDefault=true
 * when the brand or its colors are missing/unusable — the caller must decide whether that's acceptable
 * (platform content = yes; a specific client's generation = refuse upstream, don't ship a wrong brand).
 */
export function brandToKit(source: UnifiedBrandLike | null | undefined): BrandMapResult {
  const raw = source?.visual?.colors;
  const swatches: Swatch[] = (Array.isArray(raw) ? raw : [])
    .map((c) => { const rgb = parseColor(c); return rgb ? { ...rgb, hex: toHex(rgb), lum: relLuminance(rgb), sat: saturation(rgb) } : null; })
    .filter((s): s is Swatch => s !== null);

  if (swatches.length === 0) {
    return { brand: { ...INSTURIX, name: source?.name || INSTURIX.name, productName: source?.name || INSTURIX.productName }, isDefault: true };
  }

  const style = mapStyle(source?.visual?.visualStyle);
  // Theme: an explicit light hint, or a palette that is majority light. Default DARK (reads over footage).
  const lightHint = /light|airy|clean|bright|white|pastel|minimal/i.test(source?.visual?.visualStyle ?? '');
  const lightCount = swatches.filter((s) => s.lum > 0.6).length;
  const darkCount = swatches.filter((s) => s.lum < 0.4).length;
  const lightBrand = lightHint || lightCount > darkCount;

  return {
    brand: {
      name: source?.name || 'Brand',
      productName: source?.name || 'Brand',
      colors: mapColors(swatches, lightBrand),
      fontSans: mapFont(source?.visual?.typography),
      ...style,
    },
    isDefault: false,
  };
}
