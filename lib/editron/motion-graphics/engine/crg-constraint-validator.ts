/**
 * CRG Constraint Validator
 *
 * Post-composition validation pass. Checks a Recipe against Creative Knowledge Graph
 * constraints and auto-corrects violations. Hard constraints enforced, soft guidance logged.
 *
 * CRG sources:
 *   constraint:overlay.graphic_too_small — text < 72px @1080p → scale up
 *   constraint:overlay.graphic_in_caption_zone — bottom 15-25% → reposition
 *   constant:typography.stat_counter_min_font = 64px
 *   constant:typography.lower_third_name_min_font = 48px
 *   constant:typography.lower_third_title_min_font = 36px
 *   constant:typography.keyword_highlight_min_font = 48px
 *   constant:typography.quote_card_min_font = 42px
 *   constant:typography.callout_label_min_font = 36px
 *
 * Called by composition-planner.ts after building a Recipe.
 * Pure function, deterministic, no I/O (except console.warn for violations).
 */

import type { Recipe, RecipeLayout } from './recipe-types';

// ─── CRG Constants (verified against creative-knowledge-graph.json) ──

const CRG_MIN_FONTS: Record<string, number> = {
  counter: 64,    // constant:typography.stat_counter_min_font (CRG line 16725)
  primary: 48,    // constant:typography.lower_third_name_min_font (CRG line 16667)
  secondary: 36,  // constant:typography.lower_third_title_min_font (CRG line 16696)
  label: 36,      // constant:typography.callout_label_min_font (CRG line 16812)
};

// constraint:overlay.graphic_too_small (CRG part-4 line 522)
const GENERAL_MIN_FONT = 72; // "text < 72px @1080p is unreadable on mobile"

// constraint:overlay.graphic_in_caption_zone (CRG part-4 line 503)
// "bottom 15-25% of safe zone" — we use the conservative 25% boundary
const _CAPTION_ZONE_BOTTOM_FRACTION = 0.25;

// Loop guard: max correction passes before giving up
// ⚠️ INVENTED: no CRG source. CEO review Section 2 specified max 3 passes.
const MAX_CORRECTION_PASSES = 3;

// ─── Validation Result ──────────────────────────────────

export interface ValidationResult {
  recipe: Recipe;
  violations: Violation[];
  corrections: Correction[];
  passCount: number;
  converged: boolean;
}

export interface Violation {
  constraintId: string;
  severity: 'warning' | 'info';
  element?: string;
  description: string;
  deduction: number;
}

export interface Correction {
  constraintId: string;
  element: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

// ─── Main Validator ─────────────────────────────────────

/**
 * Validate a Recipe against CRG constraints. Auto-correct hard violations.
 * Returns the corrected recipe + violation/correction log.
 *
 * Loop guard: max 3 passes. If corrections in pass N cause new violations in
 * pass N+1, the loop continues. If after MAX_CORRECTION_PASSES violations remain,
 * the recipe is returned as-is with remaining violations logged.
 */
export function validateRecipeConstraints(recipe: Recipe): ValidationResult {
  let currentRecipe = recipe;
  const allViolations: Violation[] = [];
  const allCorrections: Correction[] = [];
  let passCount = 0;
  let converged = false;

  for (let pass = 0; pass < MAX_CORRECTION_PASSES; pass++) {
    passCount = pass + 1;
    const violations = detectViolations(currentRecipe);

    if (violations.length === 0) {
      converged = true;
      break;
    }

    allViolations.push(...violations);

    const { correctedRecipe, corrections } = applyCorrections(currentRecipe, violations);
    allCorrections.push(...corrections);

    if (corrections.length === 0) {
      // Violations exist but no auto-corrections available
      converged = true;
      break;
    }

    currentRecipe = correctedRecipe;
  }

  if (!converged) {
    const remaining = detectViolations(currentRecipe);
    if (remaining.length > 0) {
      console.warn(
        `[MG-CRG] Validator did not converge after ${MAX_CORRECTION_PASSES} passes. ` +
        `${remaining.length} violations remain.`,
      );
      allViolations.push(...remaining);
    }
  }

  if (allCorrections.length > 0) {
    console.warn(
      `[MG-CRG] Validation: ${allViolations.length} violations, ` +
      `${allCorrections.length} auto-corrected in ${passCount} pass(es).`,
    );
  }

  return {
    recipe: currentRecipe,
    violations: allViolations,
    corrections: allCorrections,
    passCount,
    converged,
  };
}

// ─── Violation Detection ────────────────────────────────

function detectViolations(recipe: Recipe): Violation[] {
  const violations: Violation[] = [];

  // Check 1: Font size minimums
  // constraint:overlay.graphic_too_small + per-type constants
  for (const el of recipe.elements) {
    if (el.primitive !== 'text') continue;

    const minSize = el.bind.minSize;
    if (minSize == null) {
      // No minSize set — check if the role has a CRG minimum
      const roleMin = CRG_MIN_FONTS[el.role];
      if (roleMin) {
        violations.push({
          constraintId: 'constraint:overlay.graphic_too_small',
          severity: 'warning',
          element: el.role,
          description: `Text element '${el.role}' has no minSize. CRG requires ${roleMin}px minimum.`,
          deduction: -5,
        });
      }
    } else if (typeof minSize === 'number') {
      const roleMin = CRG_MIN_FONTS[el.role] || GENERAL_MIN_FONT;
      if (minSize < roleMin) {
        violations.push({
          constraintId: 'constraint:overlay.graphic_too_small',
          severity: 'warning',
          element: el.role,
          description: `Text '${el.role}' minSize ${minSize}px < CRG minimum ${roleMin}px.`,
          deduction: -5,
        });
      }
    }
  }

  // Check 2: Caption zone awareness
  // constraint:overlay.graphic_in_caption_zone
  if (isCaptionZonePosition(recipe.layout) && !recipe.layout.captionZoneAware) {
    violations.push({
      constraintId: 'constraint:overlay.graphic_in_caption_zone',
      severity: 'warning',
      description: `Layout position '${recipe.layout.position}' is in caption zone but captionZoneAware is not set.`,
      deduction: -5,
    });
  }

  return violations;
}

function isCaptionZonePosition(layout: RecipeLayout): boolean {
  // Bottom positions are in the caption zone (bottom 15-25%)
  return layout.position === 'bottom-left'
    || layout.position === 'bottom-right'
    || layout.position === 'full-width-bottom';
}

// ─── Auto-Correction ────────────────────────────────────

function applyCorrections(
  recipe: Recipe,
  violations: Violation[],
): { correctedRecipe: Recipe; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const correctedElements = recipe.elements.map(el => ({ ...el, bind: { ...el.bind } }));
  let correctedLayout = { ...recipe.layout };

  for (const violation of violations) {
    switch (violation.constraintId) {
      case 'constraint:overlay.graphic_too_small': {
        // Auto-correct: set or increase minSize to CRG minimum
        const targetEl = correctedElements.find(e => e.role === violation.element);
        if (targetEl && targetEl.primitive === 'text') {
          const roleMin = CRG_MIN_FONTS[targetEl.role] || GENERAL_MIN_FONT;
          const oldValue = targetEl.bind.minSize;
          targetEl.bind.minSize = roleMin;
          corrections.push({
            constraintId: violation.constraintId,
            element: targetEl.role,
            property: 'minSize',
            oldValue,
            newValue: roleMin,
          });
        }
        break;
      }

      case 'constraint:overlay.graphic_in_caption_zone': {
        // Auto-correct: enable captionZoneAware flag
        // CRG: "reposition to non-overlapping region"
        const oldValue = correctedLayout.captionZoneAware;
        correctedLayout = { ...correctedLayout, captionZoneAware: true };
        corrections.push({
          constraintId: violation.constraintId,
          element: 'layout',
          property: 'captionZoneAware',
          oldValue,
          newValue: true,
        });
        break;
      }
    }
  }

  return {
    correctedRecipe: {
      ...recipe,
      elements: correctedElements,
      layout: correctedLayout,
    },
    corrections,
  };
}
