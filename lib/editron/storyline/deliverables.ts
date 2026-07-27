/**
 * deliverables - one project (the shared Scene set = the substrate) into MANY cuts. The old
 * model was one brief -> one Storyline; a real project usually needs several outputs from the
 * same footage (a 60s YouTube, a 15s vertical Reel, a square feed post). Each deliverable is a
 * SPEC (platform/aspect/duration override) applied to a base brief via the same
 * invariant-preserving edit path (applyUserOutput: platform cascade + duration clamp), then
 * composed against the ONE shared scene set. Pure, deterministic, never throws.
 *
 * LLM ordering is per-deliverable (a shorter cut picks + orders differently): loop
 * orderStorylineWithLLM (order-storyline-service) over `deliverableBriefs` at the impure edge;
 * this file is the pure, deterministic composition.
 */

import { applyUserOutput, type AspectRatio, type BriefOutputSpec, type Platform, type ProductionBrief } from '../production-brief/production-brief';
import { type ComposeOptions, composeStoryline } from './compose';
import type { Scene } from './scene';
import type { Storyline } from './storyline';

/** One requested output. Any field left unset inherits the base brief. */
export interface DeliverableSpec {
  /** Human label for the cut ("15s Reel"). Auto-derived from platform+duration when absent. */
  label?: string;
  platform?: Platform;
  aspectRatio?: AspectRatio;
  targetDurationSec?: number | null;
}

export interface Deliverable {
  label: string;
  brief: ProductionBrief;
  storyline: Storyline;
}

function defaultLabel(brief: ProductionBrief): string {
  const d = brief.output.targetDurationSec;
  return `${brief.output.platform}-${typeof d === 'number' && d > 0 ? `${Math.round(d)}s` : 'full'}`;
}

/**
 * Build one brief per deliverable spec by applying it as a spec-card edit to the base, so every
 * variant respects the SAME invariants (platform re-defaults aspect/duration, duration clamps
 * to source). Empty `specs` yields a single deliverable from the base unchanged. Pure.
 */
export function deliverableBriefs(
  base: ProductionBrief,
  specs: readonly DeliverableSpec[],
): { label: string; brief: ProductionBrief }[] {
  const effective = specs.length > 0 ? specs : [{}];
  return effective.map((spec) => {
    const patch: Partial<BriefOutputSpec> = {};
    if (spec.platform !== undefined) patch.platform = spec.platform;
    if (spec.aspectRatio !== undefined) patch.aspectRatio = spec.aspectRatio;
    if (spec.targetDurationSec !== undefined) patch.targetDurationSec = spec.targetDurationSec;
    const brief = applyUserOutput(base, patch);
    return { label: spec.label && spec.label.trim().length > 0 ? spec.label : defaultLabel(brief), brief };
  });
}

/**
 * Compose one Storyline per deliverable from ONE shared scene set. Deterministic ordering;
 * for LLM-ordered deliverables loop orderStorylineWithLLM over deliverableBriefs at the edge.
 * Pure; never throws. Empty `specs` yields a single deliverable from the base.
 */
export function composeDeliverables(
  scenes: Scene[],
  base: ProductionBrief,
  specs: readonly DeliverableSpec[],
  opts?: ComposeOptions,
): Deliverable[] {
  return deliverableBriefs(base, specs).map(({ label, brief }) => ({
    label,
    brief,
    storyline: composeStoryline(scenes, brief, opts),
  }));
}
