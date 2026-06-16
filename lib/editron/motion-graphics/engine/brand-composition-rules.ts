/**
 * Brand Composition Rules
 *
 * Derives spatial, animation, and material composition rules from brand tokens.
 * Brand identity is NOT just color swap -- it permeates spatial relationships,
 * animation character, and material choices.
 *
 * Called by composition-planner.ts to influence element construction.
 * Pure function, deterministic, no I/O.
 *
 * Sources:
 *   creative_production_knowledge_v3:4408-4447 (font category → personality)
 *   creative_production_knowledge_v3:5706-5714 (logo specs)
 *   CRG technique:graphic.logo_reveal (clear space, min size, contrast)
 *   CRG constraint:overlay.graphic_too_small (min 72px at 1080p)
 */

import type { BrandInputs } from '../types';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';

// ─── Font Classification ────────────────────────────────
// creative_production_knowledge_v3:4411-4437
// Font category → emotional association. Drives animation + spatial rules.

export type FontCategory = 'sans-serif' | 'serif' | 'slab' | 'script' | 'mono' | 'geometric';

const FONT_CLASSIFICATION: Record<string, FontCategory> = {
  // Sans-serif: modern, clean, neutral
  'inter': 'sans-serif', 'roboto': 'sans-serif', 'sf pro': 'sans-serif',
  'open sans': 'sans-serif', 'lato': 'sans-serif', 'montserrat': 'sans-serif',
  'nunito': 'sans-serif', 'source sans': 'sans-serif', 'dm sans': 'sans-serif',
  'system-ui': 'sans-serif', 'sans-serif': 'sans-serif', 'arial': 'sans-serif',
  'helvetica': 'sans-serif',

  // Serif: traditional, authoritative, literary
  'playfair': 'serif', 'garamond': 'serif', 'georgia': 'serif',
  'times': 'serif', 'merriweather': 'serif', 'lora': 'serif',
  'crimson': 'serif', 'noto serif': 'serif', 'libre baskerville': 'serif',

  // Slab: bold, confident, industrial
  'rockwell': 'slab', 'roboto slab': 'slab', 'arvo': 'slab',
  'zilla slab': 'slab', 'bitter': 'slab',

  // Script: personal, artisanal ← "Headlines ONLY, never below 36px" (creative doc:4428-4429)
  'pacifico': 'script', 'dancing script': 'script', 'great vibes': 'script',
  'sacramento': 'script', 'satisfy': 'script',

  // Mono: technical, precise
  'jetbrains mono': 'mono', 'fira code': 'mono', 'source code': 'mono',
  'ibm plex mono': 'mono', 'monospace': 'mono', 'courier': 'mono',

  // Geometric sans: minimal, premium, architectural
  'futura': 'geometric', 'poppins': 'geometric', 'raleway': 'geometric',
  'josefin sans': 'geometric', 'quicksand': 'geometric', 'comfortaa': 'geometric',
};

const FONT_CANONICAL: Record<string, string> = {
  'inter': 'Inter',
  'roboto': 'Roboto',
  'sf pro': 'SF Pro',
  'open sans': 'Open Sans',
  'lato': 'Lato',
  'montserrat': 'Montserrat',
  'nunito': 'Nunito',
  'dm sans': 'DM Sans',
  'helvetica': 'Helvetica',
  'playfair': 'Playfair Display',
  'garamond': 'Garamond',
  'georgia': 'Georgia',
  'merriweather': 'Merriweather',
  'lora': 'Lora',
  'roboto slab': 'Roboto Slab',
  'rockwell': 'Rockwell',
  'pacifico': 'Pacifico',
  'dancing script': 'Dancing Script',
  'jetbrains mono': 'JetBrains Mono',
  'fira code': 'Fira Code',
  'source code': 'Source Code Pro',
  'ibm plex mono': 'IBM Plex Mono',
  'futura': 'Futura',
  'poppins': 'Poppins',
  'raleway': 'Raleway',
};

function classifyFont(fontFamily: string): FontCategory {
  const lower = fontFamily.toLowerCase().replace(/['"]/g, '').trim();
  for (const [key, category] of Object.entries(FONT_CLASSIFICATION)) {
    if (lower.includes(key)) return category;
  }
  return 'sans-serif'; // default ← creative_production_knowledge_v3:4416 "Default for all"
}

export type AtomicBrandStyleSignal =
  | 'minimal'
  | 'premium'
  | 'technical'
  | 'bold'
  | 'warm'
  | 'playful'
  | 'editorial'
  | 'corporate'
  | 'luxury';

export interface AtomicBrandProfile {
  source: 'brand-vault' | 'tokens-only';
  colors: {
    palette: string[];
    primary?: string;
    accent?: string;
    background?: string;
    legibleAccentCount: number;
    vividCount: number;
    neutralCount: number;
  };
  typography: {
    headingFont?: string;
    bodyFont?: string;
    monoFont?: string;
    headingCategory: FontCategory;
    bodyCategory: FontCategory;
    contrastAxis: BrandRules['typographicContrast'];
  };
  styleSignals: Record<AtomicBrandStyleSignal, number>;
  rules: BrandRules;
}

// ─── Brand Composition Rules ────────────────────────────

export interface BrandRules {
  // Spatial rules
  preferredAlignment: 'left' | 'center' | 'right';
  paddingMultiplier: number;         // 0.8 (tight) to 1.4 (generous)
  elementSpacing: 'tight' | 'standard' | 'generous';

  // Animation character
  animationPersonality: 'gentle' | 'smooth' | 'snappy' | 'sharp' | 'elastic';
  entrancePreference: 'fade' | 'slide-up' | 'slide-left' | 'scale-up' | 'pop';
  allowOvershoot: boolean;

  // Material/surface
  surfacePreference: 'glass' | 'solid' | 'minimal' | 'gradient';
  cornerRadiusPreference: number;    // px ← ⚠️ INVENTED range, no creative doc source
  accentWeight: number;              // px for accent line. 2 (subtle) to 4 (bold)

  // Typography
  fontCategory: FontCategory;
  typographicContrast: 'weight' | 'size' | 'style'; // creative_production_knowledge_v3:4441
  maxFontFamilies: number;           // creative_production_knowledge_v3:4440 "Maximum 2-3"
}

/**
 * Derive composition rules from brand inputs.
 * Rules inform how the composition planner builds elements.
 * Pure function, no side effects.
 */
export function deriveBrandRules(brand: Partial<BrandInputs>): BrandRules {
  const headingCategory = classifyFont(brand.headingFont || 'Inter');
  const bodyCategory = classifyFont(brand.bodyFont || 'Inter');

  return {
    ...deriveSpatialRules(headingCategory),
    ...deriveAnimationRules(headingCategory),
    ...deriveMaterialRules(headingCategory, brand),
    ...deriveTypographyRules(headingCategory, bodyCategory),
  };
}

export function deriveAtomicBrandProfile(
  brand: Partial<BrandInputs>,
  tokens?: {
    color?: { primary?: string; accent?: string; surfaceBase?: string };
    typography?: { headingFamily?: string; bodyFamily?: string; monoFamily?: string };
  },
): AtomicBrandProfile {
  const palette = uniqueHexes([
    ...(brand.palette ?? []),
    brand.primaryColor,
    brand.accentColor,
    brand.backgroundColor,
  ]);
  const headingFont = brand.headingFont ?? tokens?.typography?.headingFamily;
  const bodyFont = brand.bodyFont ?? tokens?.typography?.bodyFamily;
  const monoFont = brand.monoFont ?? tokens?.typography?.monoFamily;
  const rules = deriveBrandRules({
    ...brand,
    headingFont,
    bodyFont,
    monoFont,
  });
  const combinedText = [
    brand.industry,
    brand.visualStyle,
    brand.typography,
    headingFont,
    bodyFont,
    monoFont,
  ].filter(Boolean).join(' ');

  return {
    source: hasVaultSignal(brand) ? 'brand-vault' : 'tokens-only',
    colors: {
      palette,
      primary: brand.primaryColor ?? tokens?.color?.primary,
      accent: brand.accentColor ?? tokens?.color?.accent,
      background: brand.backgroundColor ?? tokens?.color?.surfaceBase,
      legibleAccentCount: palette.filter((color) => contrastOnSurface(color) >= MIN_ACCENT_CONTRAST).length,
      vividCount: palette.filter((color) => saturationOf(color) >= 0.45).length,
      neutralCount: palette.filter((color) => saturationOf(color) < 0.12).length,
    },
    typography: {
      headingFont,
      bodyFont,
      monoFont,
      headingCategory: classifyFont(headingFont || 'Inter'),
      bodyCategory: classifyFont(bodyFont || 'Inter'),
      contrastAxis: rules.typographicContrast,
    },
    styleSignals: deriveStyleSignals(combinedText),
    rules,
  };
}

function deriveSpatialRules(fontCategory: FontCategory): Pick<BrandRules,
  'preferredAlignment' | 'paddingMultiplier' | 'elementSpacing'
> {
  // Font personality → spatial treatment
  // creative_production_knowledge_v3:4445-4447 (Doyle & Bottomley 2006)
  // Rounded = friendly, generous spacing. Angular = sharp, tight spacing.
  switch (fontCategory) {
    case 'serif':
    case 'script':
      // Traditional/personal: generous spacing, centered
      return { preferredAlignment: 'center', paddingMultiplier: 1.3, elementSpacing: 'generous' };
    case 'geometric':
      // Minimal/premium: generous spacing, centered
      return { preferredAlignment: 'center', paddingMultiplier: 1.2, elementSpacing: 'generous' };
    case 'slab':
      // Bold/industrial: tight spacing, left-aligned
      return { preferredAlignment: 'left', paddingMultiplier: 0.9, elementSpacing: 'tight' };
    case 'mono':
      // Technical/precise: tight spacing, left-aligned
      return { preferredAlignment: 'left', paddingMultiplier: 0.85, elementSpacing: 'tight' };
    case 'sans-serif':
    default:
      // Modern/clean: standard
      return { preferredAlignment: 'left', paddingMultiplier: 1.0, elementSpacing: 'standard' };
  }
}

function deriveAnimationRules(fontCategory: FontCategory): Pick<BrandRules,
  'animationPersonality' | 'entrancePreference' | 'allowOvershoot'
> {
  // Font personality → animation character
  // creative_production_knowledge_v3:3495 "overshoot: punch past target by 2-3%, settle"
  // creative_production_knowledge_v3:4107 "Disney's anticipation + follow-through"
  switch (fontCategory) {
    case 'serif':
      // Authoritative: gentle, no bounce
      return { animationPersonality: 'gentle', entrancePreference: 'fade', allowOvershoot: false };
    case 'geometric':
      // Premium: smooth, precise, no bounce
      return { animationPersonality: 'smooth', entrancePreference: 'scale-up', allowOvershoot: false };
    case 'slab':
      // Bold/commanding: sharp entrance
      return { animationPersonality: 'sharp', entrancePreference: 'slide-left', allowOvershoot: true };
    case 'script':
      // Personal/artisanal: gentle fade
      return { animationPersonality: 'gentle', entrancePreference: 'fade', allowOvershoot: false };
    case 'mono':
      // Technical: snappy, typewriter feel
      return { animationPersonality: 'snappy', entrancePreference: 'slide-up', allowOvershoot: false };
    case 'sans-serif':
    default:
      // Modern/clean: smooth default
      return { animationPersonality: 'smooth', entrancePreference: 'slide-up', allowOvershoot: true };
  }
}

function deriveMaterialRules(
  fontCategory: FontCategory,
  brand: Partial<BrandInputs>,
): Pick<BrandRules, 'surfacePreference' | 'cornerRadiusPreference' | 'accentWeight'> {
  // Background color luminance determines surface treatment
  const bgLuminance = brand.backgroundColor
    ? approximateLuminance(brand.backgroundColor)
    : 0.05; // dark default

  // Dark backgrounds: glass surfaces. Light backgrounds: solid/minimal.
  const surfacePreference: BrandRules['surfacePreference'] =
    bgLuminance < 0.15 ? 'glass'
    : bgLuminance < 0.5 ? 'gradient'
    : 'minimal';

  // Corner radius: serif/geometric = sharp (4-6px), sans/slab = medium (8-12px)
  // ⚠️ INVENTED: no creative doc source for radius-from-font mapping
  const cornerRadiusPreference = fontCategory === 'serif' || fontCategory === 'geometric' ? 4
    : fontCategory === 'script' ? 12
    : 8;

  // Accent line weight: bolder fonts = thicker accent
  const accentWeight = fontCategory === 'slab' || fontCategory === 'mono' ? 4
    : fontCategory === 'script' || fontCategory === 'geometric' ? 2
    : 3;

  return { surfacePreference, cornerRadiusPreference, accentWeight };
}

function deriveTypographyRules(
  headingCategory: FontCategory,
  bodyCategory: FontCategory,
): Pick<BrandRules, 'fontCategory' | 'typographicContrast' | 'maxFontFamilies'> {
  // creative_production_knowledge_v3:4441 "Contrast through ONE axis only"
  let typographicContrast: BrandRules['typographicContrast'];
  if (headingCategory !== bodyCategory) {
    typographicContrast = 'style'; // different categories = style contrast
  } else {
    typographicContrast = 'weight'; // same category = weight contrast
  }

  return {
    fontCategory: headingCategory,
    typographicContrast,
    maxFontFamilies: 3, // creative_production_knowledge_v3:4440 "Maximum 2-3"
  };
}

// ─── Color Utilities ────────────────────────────────────

function approximateLuminance(hex: string): number {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.05;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // sRGB relative luminance (Rec. 709)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ─── Brand → BrandInputs role mapping (G-2: seed of the VisualLanguage spine) ───
// UnifiedBrand stores a FLAT hex palette with no role labels (brand.visual.colors). Assign the
// ACCENT (emphasis) role to the brand's signature colour — the most SATURATED colour still legible
// on the dark MG surface — so graphics render in the customer's colour, not DEFAULT_BRAND gold.
// Text/surface/fonts keep the legible defaults until the full role spine (G-2.2 / G-3).
// Deterministic, no LLM. Legibility = WCAG contrast against the dark surface (sourced, not invented):
// a near-black brand colour (e.g. #1A1A2E) is unreadable on the canvas and must NOT become the accent.
const SURFACE_HEX = '#0B0B0A';    // ← DEFAULT_BRAND.backgroundColor (keep in sync)
const MIN_ACCENT_CONTRAST = 3.0;  // ← WCAG 2.1 AA large-text minimum (SC 1.4.3); keyword/focal text is large

/** WCAG contrast ratio of a colour against the dark MG surface (>=3:1 ⇒ legible large text). */
function contrastOnSurface(hex: string): number {
  const a = approximateLuminance(hex), b = approximateLuminance(SURFACE_HEX);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function normalizeHex(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s.slice(1).split('').map(x => x + x).join('');
  return null;
}

/** HSL saturation (0-1) of a #RRGGBB colour — how vivid it is. */
function saturationOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0; // grey
  const l = (max + min) / 2, d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/**
 * Map a UnifiedBrand to motion-graphics BrandInputs (the input resolveMotionTokens already accepts).
 * Picks the brand's signature colour as the ACCENT so MGs stop rendering DEFAULT_BRAND gold.
 * Returns {} when there is no usable/legible brand colour, so the resolver falls back to DEFAULT_BRAND
 * unchanged (fail-safe — never worse than today). G-2.1: accent only; fonts + full roles are G-2.2/G-3.
 */
export function brandInputsFromUnifiedBrand(brand: UnifiedBrand | null | undefined): Partial<BrandInputs> {
  const palette = (brand?.visual?.colors ?? []).map(normalizeHex).filter((c): c is string => c !== null);
  if (palette.length === 0) return {};
  const legible = palette.filter(c => contrastOnSurface(c) >= MIN_ACCENT_CONTRAST);
  if (legible.length === 0) return {}; // no colour reads on the dark surface → keep DEFAULT (legible); surface flip = G-3
  const accentColor = legible.reduce((best, c) => (saturationOf(c) > saturationOf(best) ? c : best), legible[0]);
  return { accentColor };
}
export function brandInputsFromUnifiedBrandAtomic(brand: UnifiedBrand | null | undefined): Partial<BrandInputs> {
  const palette = (brand?.visual?.colors ?? []).map(normalizeHex).filter((c): c is string => c !== null);
  const textInputs = extractBrandTextInputs(brand);
  const baseColorInputs = brandInputsFromUnifiedBrand(brand);
  return compact({
    ...textInputs,
    ...baseColorInputs,
    palette: palette.length > 0 ? palette : undefined,
  });
}

function extractBrandTextInputs(brand: UnifiedBrand | null | undefined): Partial<BrandInputs> {
  if (!brand) return {};
  const fontHints = extractFontHints(brand.visual?.typography);
  return compact({
    ...fontHints,
    industry: brand.visual?.industry,
    visualStyle: brand.visual?.visualStyle,
    typography: brand.visual?.typography,
  });
}

function extractFontHints(typography?: string): Partial<BrandInputs> {
  if (!typography) return {};
  const lower = typography.toLowerCase();
  const matches = Object.entries(FONT_CLASSIFICATION)
    .filter(([key]) => lower.includes(key))
    .map(([key, category]) => ({ key, category, font: FONT_CANONICAL[key] ?? key }));
  const heading = matches.find((match) => match.category !== 'mono') ?? matches[0];
  const mono = matches.find((match) => match.category === 'mono');
  const fallbackCategory = lower.includes('geometric') ? 'Poppins'
    : lower.includes('serif') ? 'Georgia'
      : lower.includes('mono') || lower.includes('code') ? 'JetBrains Mono'
        : undefined;
  const resolvedHeading = heading?.font ?? fallbackCategory;

  return compact({
    headingFont: resolvedHeading,
    bodyFont: matches.find((match) => match.category === 'sans-serif')?.font ?? resolvedHeading,
    monoFont: mono?.font ?? (lower.includes('mono') || lower.includes('code') ? 'JetBrains Mono' : undefined),
  });
}

function deriveStyleSignals(text: string): Record<AtomicBrandStyleSignal, number> {
  const lower = text.toLowerCase();
  return {
    minimal: keywordScore(lower, ['minimal', 'clean', 'simple', 'restrained', 'quiet']),
    premium: keywordScore(lower, ['premium', 'elevated', 'polished', 'refined', 'architectural']),
    technical: keywordScore(lower, ['technical', 'developer', 'engineering', 'code', 'systematic', 'precise']),
    bold: keywordScore(lower, ['bold', 'loud', 'confident', 'high contrast', 'punchy']),
    warm: keywordScore(lower, ['warm', 'human', 'friendly', 'approachable', 'organic']),
    playful: keywordScore(lower, ['playful', 'fun', 'youthful', 'quirky', 'casual']),
    editorial: keywordScore(lower, ['editorial', 'magazine', 'literary', 'story', 'journal']),
    corporate: keywordScore(lower, ['corporate', 'enterprise', 'b2b', 'professional', 'saas']),
    luxury: keywordScore(lower, ['luxury', 'luxe', 'heritage', 'exclusive', 'prestige']),
  };
}

function keywordScore(text: string, keywords: string[]): number {
  if (!text) return 0;
  const hits = keywords.filter((keyword) => text.includes(keyword)).length;
  return Math.min(1, hits / 2);
}

function hasVaultSignal(brand: Partial<BrandInputs>): boolean {
  return Boolean(
    brand.palette?.length
    || brand.industry
    || brand.visualStyle
    || brand.typography
    || brand.headingFont
    || brand.bodyFont
    || brand.monoFont
  );
}

function uniqueHexes(values: unknown[]): string[] {
  return Array.from(new Set(values.map(normalizeHex).filter((color): color is string => color !== null)));
}

function compact<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== '') result[key] = entry;
  }
  return result as T;
}
