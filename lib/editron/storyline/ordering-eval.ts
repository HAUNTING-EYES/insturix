/**
 * ordering-eval - the scoring core for the narrative-ordering eval (Rule 35: harness before
 * prompt). Narrative has no single "correct" order, so we score two ways:
 *  1. sequenceRecovery - how close a produced order is to a KNOWN-GOOD reference order, via
 *     pairwise (Kendall-style) concordance, plus exact-match and hook-match. Robust to the
 *     order having many acceptable variants (pairwise degrades gracefully; exact does not).
 *  2. rule-compliance - handled by validateOrderingPlan (imported by the harness, not here),
 *     so "obeys the hard contracts" and "matches a human order" are separate axes.
 *
 * Pure, deterministic. Compares by clip ref (Scene id or short label - caller's choice, just
 * be consistent). Refs present in only one of the two sequences are ignored for pairwise
 * (we score the order of the shared clips), but counted for coverage.
 */

export interface SequenceRecovery {
  /** Produced order equals the reference exactly (over their shared refs, in order). */
  exactMatch: boolean;
  /** Fraction of shared-clip PAIRS in the same relative order as the reference (0..1).
   *  1 = same order; 0 = fully reversed; 0.5 = no better than chance. Kendall-tau concordance. */
  pairwiseAccuracy: number;
  /** The reference's first clip is also the produced first clip (the hook landed). */
  hookMatch: boolean;
  /** Shared refs used for the pairwise score. */
  sharedCount: number;
  /** Refs in the reference the produced order never placed. */
  missingCount: number;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * Score a produced ordering against a reference ("good") ordering. Both are arrays of clip
 * refs. Pure; never throws. Empty/degenerate inputs yield a defined, neutral result.
 */
export function sequenceRecovery(
  produced: readonly string[],
  reference: readonly string[],
): SequenceRecovery {
  const prodPos = new Map<string, number>();
  produced.forEach((r, i) => {
    if (!prodPos.has(r)) prodPos.set(r, i);
  });
  const refPos = new Map<string, number>();
  reference.forEach((r, i) => {
    if (!refPos.has(r)) refPos.set(r, i);
  });

  // shared refs, in reference order (stable, deterministic)
  const shared = reference.filter((r) => prodPos.has(r));
  const missingCount = reference.length - shared.length;

  // pairwise concordance over shared refs
  let concordant = 0;
  let totalPairs = 0;
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      const a = shared[i];
      const b = shared[j];
      const refOrder = sign(refPos.get(a)! - refPos.get(b)!);
      const prodOrder = sign(prodPos.get(a)! - prodPos.get(b)!);
      totalPairs++;
      if (refOrder === prodOrder) concordant++;
    }
  }
  const pairwiseAccuracy = totalPairs === 0 ? 1 : concordant / totalPairs;

  // exact match over shared refs (produced restricted to shared, compared to reference-shared order)
  const prodShared = produced.filter((r) => refPos.has(r));
  const exactMatch =
    prodShared.length === shared.length && prodShared.every((r, i) => r === shared[i]);

  const hookMatch =
    produced.length > 0 && reference.length > 0 && produced[0] === reference[0];

  return { exactMatch, pairwiseAccuracy, hookMatch, sharedCount: shared.length, missingCount };
}

/** Mean of a numeric list, or 0 when empty. */
export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export interface AggregateRecovery {
  cases: number;
  exactMatchRate: number;
  meanPairwiseAccuracy: number;
  hookMatchRate: number;
}

/** Aggregate per-case recoveries into a suite score. Pure. */
export function aggregateRecovery(results: readonly SequenceRecovery[]): AggregateRecovery {
  return {
    cases: results.length,
    exactMatchRate: results.length === 0 ? 0 : results.filter((r) => r.exactMatch).length / results.length,
    meanPairwiseAccuracy: mean(results.map((r) => r.pairwiseAccuracy)),
    hookMatchRate: results.length === 0 ? 0 : results.filter((r) => r.hookMatch).length / results.length,
  };
}
