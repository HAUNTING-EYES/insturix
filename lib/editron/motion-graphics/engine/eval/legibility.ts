/**
 * MG Eval — L1 Legibility layer.
 *
 * Adapts the recipe-based structural gate (WCAG contrast, CRG per-role font floors, density,
 * focal hierarchy, footage-contrast) into a normalized [0,1] LayerResult for the composite reward.
 *
 * NOTE (plan §11 E6): the reviewed plan said "extract the gate's logic into a pure module and have
 * the gate delegate". This v1 instead WRAPS the gate (legibility → gate, one direction): same DRY
 * outcome (one source of legibility logic, consumed by the composite AND the gate's existing
 * callers) with ZERO change to the production-path structural-gate.ts. Flagged for review.
 *
 * Footage-contrast (E4): the gate's brightness-match check is dead in prod (no frameContext is
 * passed at edl-executor.ts:1194). This layer FORWARDS an optional frameContext, so when the eval
 * harness samples the real frame brightness behind the graphic the check fires — revived in eval;
 * the production wiring is a separate, later step.
 */
import { checkCompositionStructure, type StructuralGateResult } from '../structural-gate';
import type { Recipe } from '../recipe-types';
import type { MotionTokens } from '../../types';
import type { LayerResult } from './composite';

function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Legibility score ∈ [0,1] (the gate's 0-100 deduction score / 100). Pure + deterministic.
 * `frameContext`, when supplied by the eval harness (sampled frame brightness behind the
 * graphic), enables the footage-contrast check that is dead in production.
 */
export function scoreLegibility(
  recipe: Recipe,
  tokens: MotionTokens,
  frameContext?: { brightness?: number },
): LayerResult {
  const gate: StructuralGateResult = checkCompositionStructure(recipe, tokens, frameContext);
  const notes = gate.issues.length
    ? `${gate.issues.length} issue(s): ${gate.issues.map((i) => `${i.dimension}(${i.severity})`).join(', ')}`
    : undefined;
  return {
    layer: 'legibility',
    score: clamp01(gate.score / 100),
    status: 'scored',
    notes,
  };
}
