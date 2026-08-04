import { describe, expect, it } from 'vitest';

import {
  CUT_BASELINE_DEFAULTS,
  buildCutBaselineReport,
  createSyntheticCutFixture,
  scoreCutDetection,
} from '@/lib/editron/reference-video/r0-cut-detection-baseline';
import { parseSceneCuts, cutsToDecisionStream } from '@/lib/editron/reference-video/detect-cuts-ffmpeg';

describe('R0 cut detection baseline', () => {
  it('declares a deterministic tolerance contract', () => {
    expect(CUT_BASELINE_DEFAULTS.toleranceMs).toBe(250);
  });

  it('scores the synthetic corpus with the expected baseline numbers', () => {
    const fixture = createSyntheticCutFixture();
    const { score } = buildCutBaselineReport(fixture);

    expect(fixture.groundTruth).toHaveLength(8);
    expect(fixture.detectorOutput).toHaveLength(9); // 8 matched + 1 false positive

    // All 8 truths matched, 1 FP → precision 8/9, recall 1.0.
    expect(score.truePositives).toBe(8);
    expect(score.falsePositives).toBe(1);
    expect(score.falseNegatives).toBe(0);
    expect(score.precision).toBeCloseTo(8 / 9, 4);
    expect(score.recall).toBe(1);
    expect(score.f1).toBeCloseTo((2 * (8 / 9)) / (1 + 8 / 9), 4);
    expect(score.timingErrorsMs).toHaveLength(8);
    expect(score.meanTimingErrorMs).not.toBeNull();
  });

  it('reports perfect scores when every predicted cut matches exactly', () => {
    const truth = [{ id: 'a', tMs: 1_000 }];
    const predicted = [{ tMs: 1_000 }];
    const score = scoreCutDetection(truth, predicted);

    expect(score.f1).toBe(1);
    expect(score.falsePositives).toBe(0);
    expect(score.falseNegatives).toBe(0);
    expect(score.meanTimingErrorMs).toBe(0);
  });

  it('penalizes missed and spurious cuts with lower recall/precision', () => {
    const truth = [
      { id: 'a', tMs: 1_000 },
      { id: 'b', tMs: 5_000 },
    ];
    const score = scoreCutDetection(truth, [{ tMs: 1_000 }, { tMs: 20_000 }], { toleranceMs: 250 });

    expect(score.truePositives).toBe(1);
    expect(score.falsePositives).toBe(1);
    expect(score.falseNegatives).toBe(1);
    expect(score.recall).toBeCloseTo(0.5, 4);
    expect(score.precision).toBeCloseTo(0.5, 4);
  });

  it('scores the real ffmpeg cut-stream parser end-to-end', () => {
    // Simulate ffmpeg metadata output: cut at 1.833s with score, and one at 4.1s.
    const stdout = [
      'frame:0    pts:28160   pts_time:1.83333',
      'lavfi.scene_score=0.726533',
      'frame:1    pts:62976   pts_time:4.10000',
      'lavfi.scene_score=0.510000',
    ].join('\n');
    const cuts = parseSceneCuts(stdout);
    const decisionStream = cutsToDecisionStream(cuts);
    const score = scoreCutDetection(
      [
        { id: 'a', tMs: 1_833 },
        { id: 'b', tMs: 4_100 },
      ],
      cuts,
    );

    expect(cuts).toEqual([
      { tMs: 1_833, sceneScore: 0.726533 },
      { tMs: 4_100, sceneScore: 0.51 },
    ]);
    expect(decisionStream).toHaveLength(2);
    expect(decisionStream[0]).toMatchObject({ family: 'transition_hard_cut', confidence: 1 });
    expect(score.f1).toBe(1);
  });

  it('exposes the baseline as a candidate AdaptiveDetector comparison target', () => {
    const fixture = createSyntheticCutFixture();
    const { score } = buildCutBaselineReport(fixture);

    // This snapshot is the number a future AdaptiveDetector must beat (R0 gate).
    expect(score.f1).toBeCloseTo((2 * (8 / 9)) / (1 + 8 / 9), 4);
  });
});
