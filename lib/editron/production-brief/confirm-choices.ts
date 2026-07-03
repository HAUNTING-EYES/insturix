/**
 * confirm-choices - the OPTIONS to present when asking the user to confirm a field.
 * Logic only (which values are plausible), no UI copy. Pairs with pendingConfirmFields /
 * nextConfirmField in intake-resolver: those decide WHAT to ask; this decides the CHOICES
 * to show. Pure and isolated, like the rest of the spine.
 */

import type { AspectRatio, OutputFormat, ProductionBrief } from './production-brief';

/**
 * Plausible sibling formats to offer alongside the current inference. Keyed by the
 * inferred format; the founder's case lives here: a talky auto-edit is offered next to a
 * reel ("keep it a full edit, or cut a short reel?"). Domain-curated adjacency, not a
 * template list - every format resolves to a small, sensible alternative set.
 */
const FORMAT_SIBLINGS: Record<OutputFormat, OutputFormat[]> = {
  'auto-edit': ['reel'],
  reel: ['auto-edit'],
  explainer: ['talking-head'],
  'talking-head': ['explainer'],
  ad: ['ugc'],
  ugc: ['ad'],
};

/**
 * The format options to present when confirming `format`: the current inference first
 * (the default choice), then its plausible siblings, deduped. A UI renders these as the
 * choice buttons.
 */
export function formatChoicesFor(brief: ProductionBrief): OutputFormat[] {
  const current = brief.output.format;
  const siblings = FORMAT_SIBLINGS[current] ?? [];
  return [current, ...siblings.filter((f) => f !== current)];
}

/** Common target-length presets (seconds) to offer when confirming duration. */
export const DURATION_PRESET_SECONDS: readonly number[] = [15, 30, 60, 90];

/** The supported aspect ratios to offer when confirming aspect. */
export const ASPECT_CHOICES: readonly AspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];
