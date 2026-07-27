/**
 * EditFingerprint — visual-extraction eval harness (Rule 35: eval harness BEFORE the prompt).
 *
 * Scores a predicted visual fingerprint against hand-labelled ground truth and aggregates
 * across seeds 1-10 (min-F1 gate). This is the scaffold the visual-perception PROMPT will be
 * developed against — no prompt ships until this reports min(F1) >= passThreshold.
 *
 * Pure + deterministic: scoreVisualExtraction() and the aggregation take no I/O.
 * runFingerprintEval() takes the extractor as an INJECTED function, so the harness logic is
 * testable today with a mock; the real Gemini-vision extractor plugs in when it exists.
 *
 * Ground truth is PARTIAL by design: label only the fields you can label objectively; the
 * scorer measures only the layers/fields `expected` specifies.
 */

import type {
  FingerprintTreatmentLayer,
  FingerprintTypographyLayer,
  FingerprintStructure,
  FingerprintGraphicsLayer,
  FingerprintPerformanceLayer,
  FingerprintDecision,
} from '@/lib/editron/types/edit-fingerprint';

/** What the vision prompt produces / what ground truth labels. All optional → partial labelling. */
export interface VisualExtractionTarget {
  treatment?: FingerprintTreatmentLayer;
  typography?: FingerprintTypographyLayer;
  structure?: FingerprintStructure;
  graphics?: FingerprintGraphicsLayer;
  performance?: FingerprintPerformanceLayer;
  decisionStream?: FingerprintDecision[];
}

export interface FingerprintEvalCase {
  id: string;
  videoUrl: string;
  expected: VisualExtractionTarget;
}

export interface EvalOptions {
  /** F1 pass bar. 0.85 ← Rule 35 prompt-engineering methodology. */
  passThreshold?: number;
  /** decisionStream events match on same family AND |Δt| <= this. ⚠️ INVENTED default — a calibration knob. */
  decisionToleranceMs?: number;
  /** structure slots match on same role AND |Δstart| <= this. ⚠️ INVENTED default — a calibration knob. */
  structureToleranceMs?: number;
  /** treatment numeric fields match within this absolute delta. ⚠️ INVENTED default — a calibration knob. */
  treatmentTolerance?: number;
}

const DEFAULTS: Required<EvalOptions> = {
  passThreshold: 0.85, // Rule 35
  decisionToleranceMs: 200, // ⚠️ INVENTED — calibrate once ground-truth videos exist
  structureToleranceMs: 500, // ⚠️ INVENTED — calibrate
  treatmentTolerance: 0.1, // ⚠️ INVENTED — calibrate
};

/** Per-layer 0..1 scores (only layers the ground truth specified) + their mean. */
export interface EvalScore {
  overall: number;
  perLayer: Partial<Record<keyof VisualExtractionTarget, number>>;
}

// ─── Scoring primitives ──────────────────────────────────────────────────────

function f1FromCounts(tp: number, fp: number, fn: number): number {
  if (tp === 0 && fp === 0 && fn === 0) return 1; // nothing expected, nothing predicted ⇒ correct
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/** Greedy F1 over two lists, matched by a predicate (each expected item matches at most once). */
function matchF1<T>(pred: T[], exp: T[], isMatch: (a: T, b: T) => boolean): number {
  const used = new Set<number>();
  let tp = 0;
  for (const p of pred) {
    const idx = exp.findIndex((e, i) => !used.has(i) && isMatch(p, e));
    if (idx >= 0) {
      used.add(idx);
      tp += 1;
    }
  }
  return f1FromCounts(tp, pred.length - tp, exp.length - tp);
}

/** Mean exact-match over the categorical fields the expected object specifies; null if none. */
function categoricalScore<T extends object>(pred: Partial<T> | undefined, exp: T, fields: Array<keyof T>): number | null {
  const specified = fields.filter((f) => exp[f] !== undefined);
  if (specified.length === 0) return null;
  const matched = specified.filter((f) => pred?.[f] === exp[f]).length;
  return matched / specified.length;
}

/** Mean within-tolerance over the numeric fields the expected object specifies; null if none. */
function numericScore<T extends object>(
  pred: Partial<T> | undefined,
  exp: T,
  fields: Array<keyof T>,
  tolerance: number,
): number | null {
  const specified = fields.filter((f) => typeof exp[f] === 'number');
  if (specified.length === 0) return null;
  const matched = specified.filter((f) => {
    const p = pred?.[f];
    return typeof p === 'number' && Math.abs((p as number) - (exp[f] as unknown as number)) <= tolerance;
  }).length;
  return matched / specified.length;
}

// ─── Per-layer + overall scoring ─────────────────────────────────────────────

/** Score a predicted visual extraction against (partial) ground truth. */
export function scoreVisualExtraction(
  predicted: VisualExtractionTarget,
  expected: VisualExtractionTarget,
  options: EvalOptions = {},
): EvalScore {
  const opts = { ...DEFAULTS, ...options };
  const perLayer: Partial<Record<keyof VisualExtractionTarget, number>> = {};

  if (expected.decisionStream) {
    perLayer.decisionStream = matchF1(
      predicted.decisionStream ?? [],
      expected.decisionStream,
      (a, b) => a.family === b.family && Math.abs(a.anchor.tMs - b.anchor.tMs) <= opts.decisionToleranceMs,
    );
  }
  if (expected.structure) {
    perLayer.structure = matchF1(
      predicted.structure?.slots ?? [],
      expected.structure.slots,
      (a, b) => a.role === b.role && Math.abs(a.startMs - b.startMs) <= opts.structureToleranceMs,
    );
  }
  if (expected.typography) {
    const s = categoricalScore(predicted.typography, expected.typography, ['textCase', 'position', 'reveal']);
    if (s !== null) perLayer.typography = s;
  }
  if (expected.performance) {
    const s = categoricalScore(predicted.performance, expected.performance, ['subjectPosition', 'cameraMotion']);
    if (s !== null) perLayer.performance = s;
  }
  if (expected.treatment) {
    const s = numericScore(
      predicted.treatment,
      expected.treatment,
      ['saturate', 'contrast', 'brightness', 'sepia', 'hueRotateDeg', 'grain'],
      opts.treatmentTolerance,
    );
    if (s !== null) perLayer.treatment = s;
  }
  if (expected.graphics) {
    const parts: number[] = [];
    if (expected.graphics.classes) parts.push(matchF1(predicted.graphics?.classes ?? [], expected.graphics.classes, (a, b) => a === b));
    if (expected.graphics.density !== undefined) parts.push(predicted.graphics?.density === expected.graphics.density ? 1 : 0);
    if (parts.length) perLayer.graphics = parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  const scores = Object.values(perLayer);
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return { overall, perLayer };
}

// ─── Multi-seed harness ──────────────────────────────────────────────────────

/** The injected visual extractor under test. `seed` threads through to the model config. */
export type ExtractVisual = (videoUrl: string, seed: number) => Promise<VisualExtractionTarget>;

export interface SeedResult {
  seed: number;
  caseScores: Array<{ caseId: string; overall: number }>;
  meanOverall: number;
}

export interface EvalReport {
  seeds: SeedResult[];
  minOverall: number;
  meanOverall: number;
  maxOverall: number;
  passThreshold: number;
  pass: boolean;
}

const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Run the eval across seeds (Rule 35). For each seed, extract + score every case; the seed's
 * score is the mean over cases. pass = min-over-seeds >= passThreshold — a single unlucky seed
 * failing means the prompt is not seed-robust yet.
 */
export async function runFingerprintEval(
  cases: FingerprintEvalCase[],
  extract: ExtractVisual,
  options: EvalOptions = {},
  seeds: number[] = DEFAULT_SEEDS,
): Promise<EvalReport> {
  const passThreshold = options.passThreshold ?? DEFAULTS.passThreshold;
  const seedResults: SeedResult[] = [];
  for (const seed of seeds) {
    const caseScores: Array<{ caseId: string; overall: number }> = [];
    for (const c of cases) {
      const predicted = await extract(c.videoUrl, seed);
      caseScores.push({ caseId: c.id, overall: scoreVisualExtraction(predicted, c.expected, options).overall });
    }
    seedResults.push({ seed, caseScores, meanOverall: mean(caseScores.map((s) => s.overall)) });
  }

  const seedMeans = seedResults.map((s) => s.meanOverall);
  const minOverall = seedMeans.length ? Math.min(...seedMeans) : 0;
  return {
    seeds: seedResults,
    minOverall,
    meanOverall: mean(seedMeans),
    maxOverall: seedMeans.length ? Math.max(...seedMeans) : 0,
    passThreshold,
    pass: minOverall >= passThreshold,
  };
}
