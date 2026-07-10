/**
 * ordering-plan - the narrative-ordering seam. An OrderingPlan is what the LLM narrative
 * pass PROPOSES (an order over the picked scenes, with a rhetorical link on each seam and a
 * designated hook); `validateOrderingPlan` is what the pure composer uses to DISPOSE - it
 * enforces the hard contracts the LLM must not break. The composer applies a plan only when
 * it validates; otherwise it falls back to the deterministic continuum order. This keeps the
 * language work (narrative) at the edge (Rule 30) and the invariants in deterministic code.
 *
 * This module is the SCORER CORE too: the eval harness scores an LLM ordering with the same
 * `validateOrderingPlan` used at runtime, so "does the model obey the rules" is one function,
 * not two drifting copies.
 *
 * Rules encoded (from the storytelling dig + the coherence contract):
 *  - known refs: every ordered ref is a real picked scene (HARD).
 *  - coherence contract: scenes from ONE source keep that source's chronological order - a
 *    continuous recording is never scrambled against itself (HARD).
 *  - hook-first: the designated hook, if any, is the first clip (HARD).
 *  - budget: ordered duration stays within the target + tolerance (HARD).
 *  - and-but-therefore: every seam carries a rhetorical link; 'and-then' (mere sequence) is
 *    the weak-glue smell (WARNING, not fatal - the composer can still run it).
 *  - coverage: a plan may drop picked scenes, but dropping is surfaced (WARNING).
 *
 * Pure; never throws. No import from compose.ts (avoids a cycle) - it reasons over Scene[].
 */

import type { Scene } from './scene';
import { DURATION_TOLERANCE_SEC, MIN_CLIP_DURATION_SEC, type SeamLink } from './storyline';

/**
 * The rhetorical link INTO a clip from the previous one. 'therefore' (consequence) and 'but'
 * (reversal) are strong narrative glue; 'and-then' is mere sequence (the weak link the
 * and-but-therefore rule flags); 'meanwhile' is deliberate parallelism.
 */
export type { SeamLink }; // owned by storyline.ts (clip-level relation); re-exported for existing importers

export const SEAM_LINKS: readonly SeamLink[] = ['therefore', 'but', 'and-then', 'meanwhile'];
/** Links that count as strong narrative glue (the and-but-therefore rule). */
export const STRONG_LINKS: readonly SeamLink[] = ['therefore', 'but', 'meanwhile'];

export interface OrderedItem {
  /** Ref back to the Scene being placed (its `id`). Must be one of the picked scenes. */
  sourceRef: string;
  /** Rhetorical link from the PREVIOUS clip. Absent on the first clip. */
  linkFromPrev?: SeamLink;
  /** One-line rationale for this placement (from the LLM; provenance/telemetry). */
  reason?: string;
}

export interface OrderingPlan {
  /** The proposed narrative order, by Scene id. */
  order: OrderedItem[];
  /** Which scene is the hook (should be order[0]); optional. */
  hookRef?: string;
  /** Overall narrative logic (from the LLM; provenance). */
  rationale?: string;
}

export interface OrderingIssue {
  code: string;
  message: string;
  ref?: string;
}

export interface OrderingValidation {
  /** True only when there are zero HARD issues. Warnings do not block. */
  valid: boolean;
  issues: OrderingIssue[];
  warnings: OrderingIssue[];
}

export interface ValidateOrderingOptions {
  /** Target length (seconds); null/undefined = follow content (no budget check). */
  targetDurationSec?: number | null;
  durationToleranceSec?: number;
  minClipDurationSec?: number;
}

/** Effective duration of a scene in seconds (out - in), floored at 0. */
function sceneDuration(scene: Scene): number {
  const d = scene.endTime - scene.startTime;
  return d > 0 ? d : 0;
}

/**
 * Validate an OrderingPlan against the picked scenes + the brief's budget. Pure; never throws.
 * `valid` is true only when there are zero HARD issues; warnings are advisory (the composer
 * can still apply a plan that only has warnings). The same function scores the eval.
 */
export function validateOrderingPlan(
  plan: OrderingPlan,
  scenes: readonly Scene[],
  opts?: ValidateOrderingOptions,
): OrderingValidation {
  const issues: OrderingIssue[] = [];
  const warnings: OrderingIssue[] = [];
  const byId = new Map<string, Scene>();
  for (const s of scenes) byId.set(s.id, s);

  // 1. known refs + no duplicates
  const seen = new Set<string>();
  const orderedScenes: Scene[] = [];
  for (const item of plan.order) {
    if (seen.has(item.sourceRef)) {
      issues.push({ code: 'duplicate_ref', message: `ref ${item.sourceRef} appears twice`, ref: item.sourceRef });
      continue;
    }
    seen.add(item.sourceRef);
    const scene = byId.get(item.sourceRef);
    if (!scene) {
      issues.push({ code: 'unknown_ref', message: `ref ${item.sourceRef} is not a picked scene`, ref: item.sourceRef });
      continue;
    }
    orderedScenes.push(scene);
  }

  // 2. coherence contract: scenes sharing a source keep that source's chronological order.
  const lastStartBySource = new Map<string, number>();
  for (const scene of orderedScenes) {
    const prev = lastStartBySource.get(scene.source);
    if (prev !== undefined && scene.startTime < prev) {
      issues.push({
        code: 'source_order_violation',
        message: `source ${scene.source} is scrambled: a clip at ${scene.startTime}s follows one at ${prev}s`,
        ref: scene.id,
      });
    }
    lastStartBySource.set(scene.source, Math.max(prev ?? -Infinity, scene.startTime));
  }

  // 3. hook-first
  if (plan.hookRef !== undefined && plan.order.length > 0 && plan.order[0].sourceRef !== plan.hookRef) {
    issues.push({ code: 'hook_not_first', message: `hookRef ${plan.hookRef} is not the first clip`, ref: plan.hookRef });
  }

  // 4. budget (only when a finite positive target is given)
  const target = opts?.targetDurationSec;
  if (typeof target === 'number' && Number.isFinite(target) && target > 0) {
    const tolerance = opts?.durationToleranceSec ?? DURATION_TOLERANCE_SEC;
    const total = orderedScenes.reduce((acc, s) => acc + sceneDuration(s), 0);
    if (total > target + tolerance) {
      issues.push({ code: 'over_budget', message: `ordered ${total.toFixed(2)}s exceeds target ${target}s + tol ${tolerance}s` });
    }
  }

  // 5. and-but-therefore: every non-first seam should carry a STRONG link. 'and-then' or a
  //    missing link is weak narrative glue - a warning, not fatal.
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;
  plan.order.forEach((item, i) => {
    if (i === 0) return;
    if (item.linkFromPrev === undefined) {
      warnings.push({ code: 'missing_link', message: `seam before ${item.sourceRef} has no rhetorical link`, ref: item.sourceRef });
    } else if (!STRONG_LINKS.includes(item.linkFromPrev)) {
      warnings.push({ code: 'weak_link', message: `seam before ${item.sourceRef} is '${item.linkFromPrev}' (mere sequence)`, ref: item.sourceRef });
    }
  });

  // 6. coverage: a dropped picked scene is allowed (the LLM may cut), but surfaced.
  const dropped = scenes.filter((s) => !seen.has(s.id));
  if (dropped.length > 0) {
    warnings.push({ code: 'dropped_scenes', message: `${dropped.length} picked scene(s) not placed by the plan` });
  }

  // 7. any clip shorter than the floor is a flicker (surfaced; the composer's own contract also guards).
  for (const scene of orderedScenes) {
    if (sceneDuration(scene) < minClip) {
      warnings.push({ code: 'below_min_duration', message: `clip ${scene.id} is under ${minClip}s`, ref: scene.id });
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}
