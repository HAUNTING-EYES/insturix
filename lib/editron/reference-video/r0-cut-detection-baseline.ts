/**
 * R0 baseline harness for the measured cut detector.
 *
 * R0 (REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN) requires: create reference
 * fixtures with human-annotated cuts and establish precision/recall/
 * timing-error baselines BEFORE selecting a production detector. This module
 * provides the deterministic scoring + a synthetic annotated corpus so the
 * harness is runnable and testable today, and the same scorer is used when a
 * real AdaptiveDetector output is plugged in later.
 *
 * Pure + deterministic: scoreCutDetection() takes no I/O.
 */

export const CUT_BASELINE_VERSION = 'editron-r0-cut-detection-baseline-v1' as const;

/** A human-annotated (or generator-known) ground-truth cut boundary. */
export interface GroundTruthCut {
  id: string;
  tMs: number;
  kind?: 'hard-cut' | 'dissolve' | 'motion-cut';
}

/** What the detector under test predicted. */
export interface PredictedCut {
  tMs: number;
  sceneScore?: number;
}

export interface CutDetectionBaselineOptions {
  /** Two cuts are a match if their timestamps are within this window. ⚠️ calibration knob — see docs. */
  toleranceMs?: number;
}

export const CUT_BASELINE_DEFAULTS: Required<CutDetectionBaselineOptions> = {
  toleranceMs: 250, // ⚠️ INVENTED default — calibrate against real annotated videos in R0
};

export interface CutDetectionScore {
  version: typeof CUT_BASELINE_VERSION;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Absolute timing error (ms) on matched pairs — matched is the nearest truth within tolerance. */
  timingErrorsMs: number[];
  meanTimingErrorMs: number | null;
  medianTimingErrorMs: number | null;
  p90TimingErrorMs: number | null;
  toleranceMs: number;
}

/**
 * Score a detector's predicted cuts against ground truth:
 * greedy 1:1 matching, each truth matches at most one predicted within tolerance;
 * precision/recall/F1 computed from matched/unmatched sets; timing error measured
 * on matched pairs only.
 */
export function scoreCutDetection(
  groundTruth: readonly GroundTruthCut[],
  predicted: readonly PredictedCut[],
  options: CutDetectionBaselineOptions = {},
): CutDetectionScore {
  const opts = { ...CUT_BASELINE_DEFAULTS, ...options };
  const tol = opts.toleranceMs;

  const used = new Set<number>();
  let tp = 0;
  const timingErrorsMs: number[] = [];
  for (const p of predicted) {
    // Nearest unused truth within tolerance.
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < groundTruth.length; i++) {
      if (used.has(i)) continue;
      const dist = Math.abs(p.tMs - groundTruth[i].tMs);
      if (dist <= tol && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      tp += 1;
      timingErrorsMs.push(bestDist);
    }
  }
  const fp = predicted.length - tp;
  const fn = groundTruth.length - tp;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const sorted = [...timingErrorsMs].sort((a, b) => a - b);
  const meanTimingErrorMs = sorted.length
    ? sorted.reduce((a, b) => a + b, 0) / sorted.length
    : null;
  const medianTimingErrorMs = sorted.length
    ? (sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
    : null;
  const p90TimingErrorMs = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]
    : null;

  return {
    version: CUT_BASELINE_VERSION,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    timingErrorsMs,
    meanTimingErrorMs,
    medianTimingErrorMs,
    p90TimingErrorMs,
    toleranceMs: tol,
  };
}

// ─── Synthetic annotated corpus (R0 starter) ─────────────────────────────────

export interface SyntheticCutFixture {
  videoId: string;
  durationMs: number;
  groundTruth: GroundTruthCut[];
  detectorOutput: PredictedCut[];
  /** What the detector output "should have been" once it becomes calibrated. */
  description: string;
}

/**
 * A deterministic annotated fixture: 8 real cuts + a detector that places each
 * cut with a small, known timing offset plus one false positive. Used to prove
 * the scorer's numbers and to snapshot the CURRENT baseline before any detector
 * change (the plan's R0 gate: new detector must beat this baseline).
 */
export function createSyntheticCutFixture(): SyntheticCutFixture {
  const groundTruth: GroundTruthCut[] = [
    { id: 'c1', tMs: 800, kind: 'hard-cut' },
    { id: 'c2', tMs: 2_400, kind: 'hard-cut' },
    { id: 'c3', tMs: 4_100, kind: 'dissolve' },
    { id: 'c4', tMs: 5_900, kind: 'hard-cut' },
    { id: 'c5', tMs: 7_600, kind: 'motion-cut' },
    { id: 'c6', tMs: 9_400, kind: 'hard-cut' },
    { id: 'c7', tMs: 11_600, kind: 'hard-cut' },
    { id: 'c8', tMs: 13_500, kind: 'dissolve' },
  ];
  const offsetsMs = [90, -60, 150, -20, 40, -120, 80, -200];
  const detectorOutput: PredictedCut[] = groundTruth.map((truth, i) => ({
    tMs: Math.max(0, truth.tMs + offsetsMs[i]),
    sceneScore: 0.4 + (i % 3) * 0.1,
  }));
  // One extra false positive on a fast-motion region.
  detectorOutput.push({ tMs: 10_200, sceneScore: 0.35 });
  return {
    videoId: 'synthetic-r0-001',
    durationMs: 15_000,
    groundTruth,
    detectorOutput,
    description: 'Deterministic synthetic corpus: 8 annotated cuts with a single false positive.',
  };
}

export function buildCutBaselineReport(fixture: SyntheticCutFixture): {
  score: CutDetectionScore;
  fixture: SyntheticCutFixture;
} {
  return {
    score: scoreCutDetection(fixture.groundTruth, fixture.detectorOutput),
    fixture,
  };
}
