/**
 * MG Eval — L4 Aesthetic layer (v1 = VARIETY / anti-monotony).
 *
 * "Does it look good" has no clean formula (research-confirmed). v1 builds the one piece that is
 * computable now AND catches a real baseline problem: VARIETY — is this graphic too samey vs the
 * recent ones in the same video? (The 13-MG baseline is 8 near-identical keyword boxes → monotony.)
 *
 * DEFERRED (plan §13.5, NOT faked): distributional match to professional reference MGs (needs the
 * "what good MGs look like" research + a reference library) and the motion-congruence law (needs
 * motion data). Those are the rest of L4. v1 is variety only. The L4 weight in the composite is the
 * founder-calibratable one (decision D2).
 */
import type { Recipe } from '../recipe-types';
import type { LayerResult } from './composite';

export interface AestheticContext {
  /** forms (recipe kind, e.g. "numeric"|"emphasis") of the PRECEDING graphics in the video, in order. */
  recentForms?: string[];
  /** layout positions of the preceding graphics, in order. */
  recentPositions?: string[];
  /** how many preceding graphics count as "recent". ⚠️ INVENTED default. */
  window?: number;
}

function clamp01(v: number): number {
  return !isFinite(v) ? 0 : Math.max(0, Math.min(1, v));
}

/**
 * Aesthetic score ∈ [0,1], v1 = variety. 1 = fresh; low = repeats the recent form/position.
 * Pure + deterministic. Pass the preceding graphics' forms/positions as context.
 */
export function scoreAesthetic(recipe: Recipe, ctx: AestheticContext = {}): LayerResult {
  const window = ctx.window ?? 4; // ⚠️ INVENTED — "recent" window size
  const form = recipe.id.replace('composed-', '');
  const pos = recipe.layout?.position ?? 'center';
  const recentForms = (ctx.recentForms ?? []).slice(-window);
  const recentPos = (ctx.recentPositions ?? []).slice(-window);

  const sameForm = recentForms.filter((f) => f === form).length;
  const samePos = recentPos.filter((p) => p === pos).length;
  // ⚠️ INVENTED weights 0.6/0.4 — repeating the FORM hurts variety more than repeating position.
  const variety = clamp01(1 - 0.6 * (sameForm / window) - 0.4 * (samePos / window));

  return {
    layer: 'aesthetic',
    score: variety,
    status: 'scored',
    notes: variety < 0.6 ? `repetitive (form×${sameForm}, pos×${samePos} in last ${window})` : undefined,
  };
}
