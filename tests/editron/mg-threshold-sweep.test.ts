import { describe, expect, it } from 'vitest';

import { runThresholdSweep, type LabeledJudgeItem } from '@/lib/editron/motion-graphics/codegen/mg-threshold-sweep';

const cleanHard = {
  fabrication: false,
  nonBrandColor: false,
  clippedOrOverflowing: false,
  subjectInterference: false,
  captionOrExistingTextInterference: false,
  unreadableContrast: false,
  opaqueFootageOcclusion: false,
  missingMotionDevelopment: false,
  templateLikeForm: false,
};
const dims = { hierarchy: 8, typography: 8, color: 8, composition: 8, motion: 8, form: 8 };

const GOOD: LabeledJudgeItem = {
  id: 'good-1',
  judge: { faithful: true, ...dims, hardFailures: { ...cleanHard }, score: 8.6, issues: [] },
  human: 'accept',
};
const HARD_REJECT: LabeledJudgeItem = {
  id: 'hard-1',
  judge: {
    faithful: true,
    ...dims,
    hardFailures: { ...cleanHard, subjectInterference: true },
    score: 9,
    issues: ['type crosses the speaker'],
  },
  human: 'reject',
};
// High coverage but the calibrated veto is DISABLED: Fix-2 downgrades, so it must NOT be false-rejected.
const NEAR_SUBJECT_ACCEPT: LabeledJudgeItem = {
  id: 'near-subject-accept-1',
  judge: {
    faithful: true,
    ...dims,
    hardFailures: { ...cleanHard, subjectInterference: true },
    score: 8.6,
    issues: ['type is near the face'],
  },
  geometry: {
    subject: { x: 0.5, y: 0.4, width: 0.4, height: 0.4 },
    coveredPct: 0.9,
    coverageByPhase: [0.9],
    alphaWeightedCoverage: 0.85,
    hardVetoEligible: false,
    hardVeto: false,
    captionRects: [],
    bboxPct: null,
  },
  human: 'accept',
};
const WATCHLIST: LabeledJudgeItem = {
  id: 'watch-1',
  judge: { faithful: true, hierarchy: 7, typography: 6, color: 7, composition: 7, motion: 7, form: 6, hardFailures: { ...cleanHard }, score: 6.8, issues: ['typography weight could pop'] },
  human: 'watchlist',
};

describe('runThresholdSweep (Fix-0 core, brief §18.5-§18.8)', () => {
  it('sweeps clean×floor and computes hard-failure F1 vs human labels', () => {
    const report = runThresholdSweep([GOOD, HARD_REJECT, NEAR_SUBJECT_ACCEPT, WATCHLIST], {
      cleanThresholds: [7.5, 7.0, 6.5],
      watchlistFloors: [6.5, 6.0],
    });
    expect(report.dataset.labeled).toBe(true);
    expect(report.dataset.count).toBe(4);
    // At the default clean=7.5 / floor=6.5 policy:
    const defaultCell = report.byClean.find((c) => c.cleanThreshold === 7.5)!.metrics.find((m) => m.watchlistFloor === 6.5)!;
    expect(defaultCell.acceptCount).toBe(2); // GOOD + NEAR_SUBJECT_ACCEPT (Fix-2 kept it)
    expect(defaultCell.watchlistCount).toBe(1); // WATCHLIST
    expect(defaultCell.rejectCount).toBe(1); // HARD_REJECT (legacy cap path)
    expect(defaultCell.falseRejectOnHumanAccept).toBe(0); // zero false rejection of human-accepted renders
    expect(defaultCell.falseAcceptOnHumanReject).toBe(0);
    expect(defaultCell.hardF1).toBeCloseTo(1, 5);
  });

  it('Fix-2 downgrade prevents false rejection of a human-accepted render the VLM flagged (veto disabled)', () => {
    const report = runThresholdSweep([GOOD, NEAR_SUBJECT_ACCEPT], {
      cleanThresholds: [7.5],
      watchlistFloors: [6.5],
    });
    const cell = report.byClean[0].metrics[0];
    // NEAR_SUBJECT_ACCEPT is downgraded → accept; no false reject.
    expect(cell.falseRejectOnHumanAccept).toBe(0);
    expect(cell.acceptCount).toBe(2);
  });

  it('reports cap-effect telemetry (raw vs production-capped score)', () => {
    const report = runThresholdSweep([GOOD, HARD_REJECT], { cleanThresholds: [7.5], watchlistFloors: [6.5] });
    expect(report.capEffect.shrunkToCapCount).toBeGreaterThanOrEqual(1); // HARD_REJECT's 9 was capped to 4
    expect(report.capEffect.maxNegativeShift).toBeLessThan(0);
  });

  it('warns loudly on an unlabeled/empty dataset (no fake metrics)', () => {
    const empty = runThresholdSweep([], { cleanThresholds: [7.5], watchlistFloors: [6.5] });
    expect(empty.warnings.some((w) => /UNLABELED|empty dataset/.test(w))).toBe(true);
    expect(empty.best).toBeNull();
  });
});
