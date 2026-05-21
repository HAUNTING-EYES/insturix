/**
 * Brand Pattern Generator
 *
 * Generates procedural background patterns from brand tokens.
 * Dot grids, geometric fills, gradient sweeps -- derived from brand colors and font personality.
 * Patterns render as CSS background-image values (SVG data URIs) consumable by Remotion.
 *
 * All parameters are ⚠️ INVENTED -- no CRG or creative doc covers procedural pattern generation.
 * These need calibration with real brand examples.
 *
 * Sources:
 *   creative_production_knowledge_v3:2362 "ambient style preferences per brand"
 *   creative_production_knowledge_v3:4691 "geometric patterns" (cultural reference)
 *   Graphify: "backgrounds: gradient meshes, noise textures, geometric patterns, grain overlays"
 *
 * Pure function, deterministic, no I/O.
 */

import type { BrandInputs } from '../types';
import type { BrandRules } from './brand-composition-rules';

// ─── Pattern Types ──────────────────────────────────────

export type PatternType = 'dot-grid' | 'diagonal-lines' | 'gradient-sweep' | 'none';

export interface GeneratedPattern {
  type: PatternType;
  css: string;           // CSS background-image value (SVG data URI or gradient)
  opacity: number;       // Recommended layer opacity (0-1)
  description: string;   // Human-readable description for logging
}

// ─── Pattern Selection ──────────────────────────────────

/**
 * Select and generate a brand-appropriate background pattern.
 * Returns 'none' pattern if brand signals suggest minimal/no patterns.
 */
export function generateBrandPattern(
  brand: Partial<BrandInputs>,
  brandRules: BrandRules,
): GeneratedPattern {
  const patternType = selectPatternType(brandRules);

  if (patternType === 'none') {
    return { type: 'none', css: 'none', opacity: 0, description: 'No pattern (minimal brand)' };
  }

  const accentColor = brand.accentColor || '#10B981';

  switch (patternType) {
    case 'dot-grid':
      return generateDotGrid(accentColor, brandRules);
    case 'diagonal-lines':
      return generateDiagonalLines(accentColor, brandRules);
    case 'gradient-sweep':
      return generateGradientSweep(accentColor, brand.primaryColor || '#6366F1');
    default:
      return { type: 'none', css: 'none', opacity: 0, description: 'Fallback: no pattern' };
  }
}

/**
 * Select pattern type based on brand personality.
 * Font category drives pattern choice (same logic as brand-composition-rules.ts).
 */
function selectPatternType(rules: BrandRules): PatternType {
  switch (rules.fontCategory) {
    case 'mono':
      // Technical brands: dot grid (precise, systematic)
      return 'dot-grid';
    case 'geometric':
      // Premium brands: diagonal lines (architectural, minimal)
      return 'diagonal-lines';
    case 'slab':
      // Bold brands: gradient sweep (confident, commanding)
      return 'gradient-sweep';
    case 'serif':
    case 'script':
      // Traditional/personal brands: no pattern (clean, uncluttered)
      // ← creative_production_knowledge_v3:2362 "some prefer clean/minimal"
      return 'none';
    case 'sans-serif':
    default:
      // Modern brands: dot grid (clean, contemporary)
      return 'dot-grid';
  }
}

// ─── Pattern Generators ─────────────────────────────────

/**
 * Generate a dot grid pattern as SVG data URI.
 *
 * ⚠️ ALL PARAMETERS INVENTED. No CRG or creative doc source.
 * Spacing: 20-40px (dense for tech, sparse for luxury)
 * Dot size: 1-2px
 * Opacity: 0.04-0.12 (must be subtle, not distracting)
 */
function generateDotGrid(color: string, rules: BrandRules): GeneratedPattern {
  // Spacing from brand personality: tight brands = dense grid, spacious = sparse
  const spacing = rules.elementSpacing === 'tight' ? 20
    : rules.elementSpacing === 'generous' ? 40
    : 28; // standard ← ⚠️ INVENTED

  const dotSize = rules.elementSpacing === 'tight' ? 1 : 1.5; // ← ⚠️ INVENTED
  const opacity = rules.elementSpacing === 'tight' ? 0.10 : 0.06; // ← ⚠️ INVENTED

  const rgb = hexToRgb(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spacing}" height="${spacing}"><circle cx="${spacing / 2}" cy="${spacing / 2}" r="${dotSize}" fill="rgb(${rgb.r},${rgb.g},${rgb.b})" opacity="${opacity}"/></svg>`;

  const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return {
    type: 'dot-grid',
    css: encoded,
    opacity: 0.8, // Layer opacity (pattern SVG has its own dot opacity)
    description: `Dot grid: ${spacing}px spacing, ${dotSize}px dots, ${opacity} opacity, color=${color}`,
  };
}

/**
 * Generate diagonal line pattern as SVG data URI.
 *
 * ⚠️ ALL PARAMETERS INVENTED. No CRG or creative doc source.
 * Angle: 45° (standard broadcast convention)
 * Line width: 1px
 * Spacing: 24-36px
 */
function generateDiagonalLines(color: string, rules: BrandRules): GeneratedPattern {
  const spacing = rules.elementSpacing === 'tight' ? 24 : 36; // ← ⚠️ INVENTED
  const lineWidth = 1;
  const opacity = 0.06; // ← ⚠️ INVENTED

  const rgb = hexToRgb(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spacing}" height="${spacing}"><line x1="0" y1="${spacing}" x2="${spacing}" y2="0" stroke="rgb(${rgb.r},${rgb.g},${rgb.b})" stroke-width="${lineWidth}" opacity="${opacity}"/></svg>`;

  const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return {
    type: 'diagonal-lines',
    css: encoded,
    opacity: 0.8,
    description: `Diagonal lines: ${spacing}px spacing, ${lineWidth}px width, ${opacity} opacity, color=${color}`,
  };
}

/**
 * Generate gradient sweep as CSS linear-gradient.
 *
 * ⚠️ ANGLE INVENTED. 135° = top-left to bottom-right (reading direction convention).
 * Opacity kept very low (0.08) to avoid competing with content.
 */
function generateGradientSweep(accentColor: string, primaryColor: string): GeneratedPattern {
  const angle = 135; // ← ⚠️ INVENTED. Reading direction convention.
  const opacity = 0.08; // ← ⚠️ INVENTED

  const css = `linear-gradient(${angle}deg, ${primaryColor}${opacityToHex(opacity)}, transparent 60%, ${accentColor}${opacityToHex(opacity * 0.5)})`;

  return {
    type: 'gradient-sweep',
    css,
    opacity: 1, // Gradient has built-in opacity via color stops
    description: `Gradient sweep: ${angle}°, primary→transparent→accent, ${opacity} opacity`,
  };
}

// ─── Utilities ──────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!hex || !hex.startsWith('#') || hex.length < 7) {
    return { r: 99, g: 102, b: 241 }; // fallback: DEFAULT_BRAND.primaryColor (#6366F1)
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function opacityToHex(opacity: number): string {
  if (!isFinite(opacity)) return '00'; // NaN/Infinity → transparent
  const clamped = Math.max(0, Math.min(1, opacity));
  const hex = Math.round(clamped * 255).toString(16).padStart(2, '0');
  return hex;
}
