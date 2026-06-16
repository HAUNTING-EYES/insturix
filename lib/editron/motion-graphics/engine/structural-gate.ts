/**
 * Tier 1 Aesthetic Gate — Structural Quality Check (No API, No Rendering)
 *
 * Checks Recipe + MotionTokens + video analysis BEFORE rendering.
 * Catches the structural aesthetic issues at zero cost, zero latency.
 *
 * Checks:
 *   1. Contrast ratio: text vs surface (WCAG AA: 4.5:1 normal, 3:1 large)
 *   2. CRG per-role font floors: each text element's minSize meets its role's CRG minimum
 *      (counter 64 / primary 48 / secondary 36 / label 36, else general 72) — the
 *      constraint:overlay.graphic_too_small check (was: a weak <24px-only check).
 *   3. Element density: too many foreground elements = visual clutter
 *   4. Frame brightness match: dark-on-dark or light-on-light detection
 *   5. Focal hierarchy: exactly one hero text element (no two competing focal points)
 *
 * NOT checked here (deliberately): title-safe pixel clipping. The recipe carries no
 * measured pixel bounds at plan time; title-safe is already enforced by (a) the layout's
 * 5% insets (composition-renderer.tsx resolveLayout, = title_safe 90%) and (b) G-1's
 * render-time text fit (composition-renderer.tsx computeFittedSize, which fails loud via
 * [MG-Fit]). A plan-time title-safe heuristic would be redundant + false-positive-prone.
 *
 * Phase E — OBSERVE MODE. Called inline by the EDL executor after planComposition
 * (edl-executor.ts:1169). The result's `pass` is LOGGED, never acted on (no blocking, no
 * correction). The log line is structured so an offline sweep over real projects can tally
 * the would-suppress rate by dimension BEFORE we ever flip the gate to enforce (Rule 29).
 */

import type { Recipe } from './recipe-types';
import type { MotionTokens } from '../types';

export interface StructuralIssue {
  dimension: 'contrast' | 'readability' | 'density' | 'brightness-match' | 'hierarchy';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface StructuralGateResult {
  pass: boolean;
  score: number;
  issues: StructuralIssue[];
}

const PASS_THRESHOLD = 60;

// CRG per-role font floors @1080p (constraint:overlay.graphic_too_small + per-role constants,
// verified against creative-knowledge-graph.json this session). Specific role floors win;
// roles not listed fall back to the general "unreadable on mobile" floor. These are GRAPHIC
// floors — captions are a separate overlay type with their own 48px floor (BBC/Facebook), not
// validated by this gate.
const CRG_MIN_FONTS: Record<string, number> = {
  counter: 64,    // constant:typography.stat_counter_min_font (graph 16725)
  primary: 48,    // constant:typography.lower_third_name_min_font (graph 16667)
  secondary: 36,  // constant:typography.lower_third_title_min_font (graph 16696)
  label: 36,      // constant:typography.callout_label_min_font (graph 16812)
};
const GENERAL_MIN_FONT = 72; // constraint:overlay.graphic_too_small (graph 9947): "<72px @1080p unreadable on mobile"
const UNREADABLE_FLOOR = 24; // hard floor — below this is unreadable at any role

// Text roles that occupy a hero (focal) size. The render maps these to the largest FOCAL_FRAC
// (~0.09 of frame height vs ~0.055 for secondary/label — composition-renderer.tsx:291), so a
// recipe with two of them has no single focal point.
const HERO_ROLES = new Set(['primary', 'counter', 'hero']);

export function checkCompositionStructure(
  recipe: Recipe,
  tokens: MotionTokens,
  frameContext?: { brightness?: number },
): StructuralGateResult {
  const issues: StructuralIssue[] = [];
  let deductions = 0;

  // 1. Contrast ratio: textPrimary vs surfaceBase
  // WCAG AA: 4.5:1 for normal text, 3:1 for large text (≥24px or ≥18.66px bold)
  const textLum = relativeLuminance(tokens.color.textPrimary);
  const surfaceLum = relativeLuminance(tokens.color.surfaceBase);
  const contrastRatio = computeContrastRatio(textLum, surfaceLum);

  if (contrastRatio < 3) {
    issues.push({ dimension: 'contrast', severity: 'high', description: `Text/surface contrast ${contrastRatio.toFixed(1)}:1 — below WCAG minimum 3:1` });
    deductions += 30;
  } else if (contrastRatio < 4.5) {
    issues.push({ dimension: 'contrast', severity: 'medium', description: `Text/surface contrast ${contrastRatio.toFixed(1)}:1 — below WCAG AA 4.5:1 for normal text` });
    deductions += 15;
  }

  // 2. CRG per-role font floors (constraint:overlay.graphic_too_small + per-role constants).
  // A declared minSize below the role's CRG floor means the text can render unreadably small
  // (G-1's render-time fit may shrink toward minReadable). <24px is the hard unreadable line;
  // below the per-role floor is the CRG-ideal miss. OBSERVE-ONLY (logged, not corrected).
  const textElements = recipe.elements.filter(el => el.primitive === 'text');
  for (const el of textElements) {
    const minSize = el.bind.minSize;
    if (typeof minSize !== 'number') continue;
    const roleFloor = CRG_MIN_FONTS[el.role] ?? GENERAL_MIN_FONT;
    if (minSize < UNREADABLE_FLOOR) {
      issues.push({ dimension: 'readability', severity: 'high', description: `Element "${el.role}" minSize=${minSize}px — below ${UNREADABLE_FLOOR}px unreadable floor` });
      deductions += 20;
    } else if (minSize < roleFloor) {
      issues.push({ dimension: 'readability', severity: 'medium', description: `Element "${el.role}" minSize=${minSize}px — below CRG ${el.role} floor ${roleFloor}px (graphic_too_small)` });
      deductions += 8; // ⚠️ INVENTED magnitude — observe-mode calibration target
    }
  }

  // 2b. Secondary text contrast: textSecondary vs surfaceBase
  const secondaryLum = relativeLuminance(tokens.color.textSecondary);
  const secondaryContrast = computeContrastRatio(secondaryLum, surfaceLum);
  if (secondaryContrast < 3) {
    issues.push({ dimension: 'contrast', severity: 'medium', description: `Secondary text contrast ${secondaryContrast.toFixed(1)}:1 — below WCAG 3:1 for large text` });
    deductions += 10;
  }

  // 2c. Accent color vs surface contrast
  const accentLum = relativeLuminance(tokens.color.accent);
  const accentContrast = computeContrastRatio(accentLum, surfaceLum);
  if (accentContrast < 2) {
    issues.push({ dimension: 'contrast', severity: 'low', description: `Accent/surface contrast ${accentContrast.toFixed(1)}:1 — accent line may be invisible` });
    deductions += 5;
  }

  // 3. Element density: too many foreground elements
  const foregroundCount = recipe.elements.filter(el => el.layer === 'foreground').length;
  // ⚠️ threshold 6 INVENTED — professional MG rarely exceeds 5-6 visible elements
  if (foregroundCount > 6) {
    issues.push({ dimension: 'density', severity: 'medium', description: `${foregroundCount} foreground elements — visual clutter risk (max 6 recommended)` });
    deductions += 10;
  }

  // 3b. Narrow layout overflow: bottom-left/right/top-left/right have maxWidth 45%
  // ⚠️ threshold 3 INVENTED — 3+ text elements in 45% width risks line overflow
  const isNarrowLayout = ['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(recipe.layout.position);
  if (isNarrowLayout && textElements.length > 3) {
    issues.push({ dimension: 'density', severity: 'low', description: `${textElements.length} text elements in narrow layout (${recipe.layout.position}, 45% width) — overflow risk` });
    deductions += 5;
  }

  // 4. Frame brightness match: MG colors vs video frame brightness
  if (frameContext?.brightness != null) {
    const brightness = frameContext.brightness;
    const textBright = textLum > 0.5;

    if (brightness > 0.7 && textBright) {
      // ⚠️ threshold 0.7 INVENTED — light text on bright frame = low contrast
      issues.push({ dimension: 'brightness-match', severity: 'medium', description: `Light text on bright frame (frame=${brightness.toFixed(2)}) — may be hard to read without surface` });
      // Check if surface provides contrast. surfaceOpacity lives under `color`, not `surface`
      // (MotionTokens.color.surfaceOpacity) — the wrong namespace was undefined, so this
      // legibility deduction silently never fired (found via real-resolver render check 2026-05-30).
      const surfaceOpacity = tokens.color.surfaceOpacity;
      if (surfaceOpacity < 0.3) {
        deductions += 15;
      }
    } else if (brightness < 0.3 && !textBright) {
      issues.push({ dimension: 'brightness-match', severity: 'medium', description: `Dark text on dark frame (frame=${brightness.toFixed(2)}) — may be hard to read` });
      deductions += 15;
    }
  }

  // 5. Focal hierarchy: exactly one hero. The render assigns focal size by role (FOCAL_FRAC),
  // so hierarchy is normally built in. Flag the failure case: 2+ text elements both claim a
  // hero role → no single focal point. The gate VALIDATES hierarchy; the spine AUTHORS it
  // (Director GAP4). OBSERVE-ONLY.
  const heroRoles = textElements.filter(el => HERO_ROLES.has(el.role)).map(el => el.role);
  if (heroRoles.length > 1) {
    issues.push({ dimension: 'hierarchy', severity: 'medium', description: `${heroRoles.length} hero-scale text elements (${heroRoles.join(', ')}) — no single focal point` });
    deductions += 12; // ⚠️ INVENTED magnitude — observe-mode calibration target
  }

  const score = Math.max(0, 100 - deductions);
  const pass = score >= PASS_THRESHOLD;

  // OBSERVE-ONLY: the caller (edl-executor.ts:1169) does NOT block on `pass`. Structured so an
  // offline sweep (scripts/eval-mg-gate.ts) can tally the would-suppress rate by dimension over
  // real projects before we flip to enforce (Rule 29: enforce only at FP-suppression ≈ 0).
  if (!pass) {
    const dims = [...new Set(issues.map(i => i.dimension))].join(',');
    console.warn(`[MG-Gate] WOULD-SUPPRESS ${recipe.id} (${score}/100) dims=[${dims}]: ${issues.map(i => i.description).join('; ')}`);
  }

  return { pass, score, issues };
}

// ─── Color Utilities (WCAG 2.1) ────────────────────────────

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map(sRGBtoLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sRGBtoLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function computeContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHex(hex: string): [number, number, number] | null {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}
