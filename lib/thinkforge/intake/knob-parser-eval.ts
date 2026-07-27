/**
 * knob-parser-eval - the scoring core for the prompt->knob parser eval (Rule 35: harness before
 * prompt). Pure, deterministic. Given a PRODUCED `RequestedKnobs` and the EXPECTED one for a case,
 * it scores each field three ways, because the parser's two failure modes are asymmetric:
 *
 *   - HALLUCINATION (a field present/wrong when it should be absent or different) - the WORST
 *     failure: it silently moves a knob the user never set. Tracked explicitly as false positives.
 *   - MISS (a stated field the parser didn't extract) - a soft failure: the resolver infers it.
 *
 * Per field we compute precision (of what we emitted, how much was right) and recall (of what was
 * stated, how much we caught). A field is a TRUE POSITIVE only when present in BOTH and the VALUES
 * match (presence alone is not enough - emitting the wrong platform is a hallucination, not a hit).
 */

import type { RequestedKnobs } from './prompt-knob-parser';

export const KNOB_FIELDS = [
  'platform',
  'targetDurationSec',
  'aspectRatio',
  'count',
  'voiceLanguages',
  'captionLanguages',
  'deliverables',
] as const;

export type KnobField = (typeof KNOB_FIELDS)[number];

/** Order-independent value equality (arrays compared as sets; scalars strict). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sb = new Set(b.map((x) => JSON.stringify(x)));
    return a.every((x) => sb.has(JSON.stringify(x)));
  }
  return a === b;
}

export interface FieldTally {
  /** produced has the field with the correct value (present in both, values equal). */
  truePositive: boolean;
  /** produced has the field but expected does NOT (or value differs) - a HALLUCINATION. */
  falsePositive: boolean;
  /** expected has the field but produced does NOT (a miss). */
  falseNegative: boolean;
  /** neither has the field - correctly omitted. */
  trueNegative: boolean;
}

export type CaseTally = Record<KnobField, FieldTally>;

const has = (k: RequestedKnobs, f: KnobField): boolean => Object.prototype.hasOwnProperty.call(k, f);

/** Score one produced/expected pair, field by field. Pure. */
export function tallyCase(produced: RequestedKnobs, expected: RequestedKnobs): CaseTally {
  const tally = {} as CaseTally;
  for (const f of KNOB_FIELDS) {
    const p = has(produced, f);
    const e = has(expected, f);
    const same = p && e && valuesEqual(produced[f], expected[f]);
    tally[f] = {
      truePositive: same,
      falsePositive: p && !same, // present but wrong-or-unexpected
      falseNegative: e && !same, // expected but missing-or-wrong
      trueNegative: !p && !e,
    };
  }
  return tally;
}

export interface FieldScore {
  field: KnobField;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** tp / (tp + fp) - of what we emitted for this field, how much was right. 1 when we emitted nothing. */
  precision: number;
  /** tp / (tp + fn) - of what was stated, how much we caught. 1 when nothing was stated. */
  recall: number;
  /** how many cases stated this field (tp + fn). */
  support: number;
}

export interface KnobEvalReport {
  cases: number;
  perField: Record<KnobField, FieldScore>;
  /** false positives across ALL fields / cases - the headline "did we invent knobs" number. */
  totalHallucinations: number;
  /** cases with ZERO hallucinations across every field / total cases. The bar that matters most. */
  cleanCaseRate: number;
  /** unweighted mean of per-field precision and recall (fields with no support score 1). */
  meanPrecision: number;
  meanRecall: number;
}

const ratio = (num: number, den: number): number => (den === 0 ? 1 : num / den);
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Aggregate per-case tallies into a suite report. Pure. */
export function aggregateKnobEval(tallies: readonly CaseTally[]): KnobEvalReport {
  const perField = {} as Record<KnobField, FieldScore>;
  for (const f of KNOB_FIELDS) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const t of tallies) {
      if (t[f].truePositive) tp++;
      if (t[f].falsePositive) fp++;
      if (t[f].falseNegative) fn++;
    }
    perField[f] = {
      field: f,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      support: tp + fn,
    };
  }

  const totalHallucinations = KNOB_FIELDS.reduce((sum, f) => sum + perField[f].falsePositives, 0);
  const cleanCases = tallies.filter((t) => KNOB_FIELDS.every((f) => !t[f].falsePositive)).length;

  return {
    cases: tallies.length,
    perField,
    totalHallucinations,
    cleanCaseRate: tallies.length === 0 ? 1 : cleanCases / tallies.length,
    meanPrecision: mean(KNOB_FIELDS.map((f) => perField[f].precision)),
    meanRecall: mean(KNOB_FIELDS.map((f) => perField[f].recall)),
  };
}

/** Convenience: score produced/expected pairs end-to-end. Pure. */
export function scoreKnobCases(
  pairs: readonly { produced: RequestedKnobs; expected: RequestedKnobs }[],
): KnobEvalReport {
  return aggregateKnobEval(pairs.map((p) => tallyCase(p.produced, p.expected)));
}
