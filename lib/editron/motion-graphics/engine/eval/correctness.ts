/**
 * MG Eval — L2 Correctness layer.
 *
 * Compares the GENERATED graphic against ground truth (founder labels / EYES extraction): did it
 * show the right VALUE, in the right FORM? This is the deterministic "is it right" anchor — the one
 * quality signal grounded in ground truth (composite weight 0.40).
 *
 * SCOPE (forced by the current form, recon 2026-06-03 — NOT a shortcut):
 *   - A recipe element's value is a binding ("content:value") resolved against the content map;
 *     colour is ALWAYS a brand/role token ('token:color.accent'|textPrimary|...), never data-semantic.
 *   - So today's composers CANNOT encode semantic colour (green=good / red=refuted) or negation
 *     (strike-through). L2 v1 therefore checks VALUE-match + FORM-match only. The colour-semantics
 *     and negation-conveyance checks activate once the generative form can express them — deferred,
 *     not faked. (This is itself evidence that the FORM is the production lever.)
 *
 * Ground truth comes from the founder's fixed labeled set (groundTruthSource='human-label'); the
 * tuner consumes human-label rows only (plan §11 E3). 'extraction'/'none' are advisory.
 */
import type { Recipe } from '../recipe-types';
import type { LayerResult } from './composite';

export interface CorrectnessGroundTruth {
  /** exact string the graphic MUST display, e.g. "90%", "1/3", "$1.2B". */
  value?: string;
  /** founder taxonomy: proportion|comparison|trend|negation|magnitude|identity|quote|concept|none */
  formFamily?: string;
  source?: 'human-label' | 'extraction' | 'none';
}

// ⚠️ INVENTED mapping (founder form-family → acceptable recipe kind) — validation/calibration target.
// `negation` maps to numeric/emphasis with the KNOWN caveat that visual negation (strike/red) is not
// conveyed by today's form, so only value+kind are checkable for it until the form can express it.
const FORM_FAMILY_TO_KIND: Record<string, string[]> = {
  proportion: ['numeric'],
  magnitude: ['numeric'],
  trend: ['data-series', 'numeric'],
  comparison: ['comparison'],
  negation: ['numeric', 'emphasis'],
  identity: ['identity'],
  quote: ['quotation'],
  concept: ['emphasis', 'free-text', 'structured'],
  none: [],
};

const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

function recipeKind(recipe: Recipe): string {
  const kind = recipe.id.replace('composed-', '');
  if (kind.startsWith('structured')) return 'structured';
  if (kind.startsWith('numeric') || /(^|[+])(literal|length|sweep|emphasis)([+]|$)/.test(kind)) return 'numeric';
  return kind;
}

/** The strings a recipe's TEXT elements actually display, resolving their "content:<key>" bindings
 *  against the content map (mirrors the renderer + mg-eval's bound()). Token/literal binds ignored. */
function displayedStrings(recipe: Recipe, content: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const el of recipe.elements) {
    if (el.primitive !== 'text') continue;
    for (const expr of Object.values(el.bind ?? {})) {
      if (typeof expr === 'string' && expr.startsWith('content:')) {
        const resolved = content[expr.slice('content:'.length)];
        if (resolved != null && String(resolved).length > 0) out.push(String(resolved));
      }
    }
  }
  return out;
}

/**
 * Score correctness ∈ [0,1] = fraction of applicable ground-truth checks the graphic satisfies.
 * Pure + deterministic. status 'skipped' (score null) when there is no ground truth to check.
 */
export function scoreCorrectness(
  recipe: Recipe,
  content: Record<string, unknown>,
  gt: CorrectnessGroundTruth | null | undefined,
): LayerResult {
  const source = gt?.source ?? 'none';
  const hasGroundTruth = !!gt && (gt.value != null || gt.formFamily != null);
  if (!hasGroundTruth) {
    return { layer: 'correctness', score: null, status: 'skipped', groundTruthSource: source, notes: 'no ground truth' };
  }

  const checks: boolean[] = [];
  const fails: string[] = [];

  if (gt!.formFamily != null) {
    const kind = recipeKind(recipe);
    const ok = (FORM_FAMILY_TO_KIND[gt!.formFamily] ?? []).includes(kind);
    checks.push(ok);
    if (!ok) fails.push(`form: "${gt!.formFamily}" → got "${kind}"`);
  }

  if (gt!.value != null) {
    const shown = displayedStrings(recipe, content);
    const ok = shown.some((s) => norm(s) === norm(gt!.value as string));
    checks.push(ok);
    if (!ok) fails.push(`value: want "${gt!.value}", shown [${shown.join(', ') || 'nothing'}]`);
  }

  const score = checks.length ? checks.filter(Boolean).length / checks.length : null;
  return {
    layer: 'correctness',
    score,
    status: score == null ? 'skipped' : 'scored',
    groundTruthSource: source,
    notes: fails.length ? fails.join('; ') : undefined,
  };
}
