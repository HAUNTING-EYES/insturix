import { describe, expect, it } from 'vitest';

import {
  datasetHashOf,
  isCalibrationReady,
  parseLabeledDataset,
  MIN_CALIBRATION_LABELS,
  type EvalItem,
} from '@/lib/editron/motion-graphics/eval/eval-dataset';
import { runCalibration, toSweepItems } from '@/lib/editron/motion-graphics/eval/calibration';

const ALL_DIMS = { hierarchy: 7, typography: 7, color: 7, composition: 7, motion: 7, form: 7 };
const NO_HARD = {
  fabrication: false, nonBrandColor: false, clippedOrOverflowing: false, subjectInterference: false,
  captionOrExistingTextInterference: false, unreadableContrast: false, opaqueFootageOcclusion: false,
  missingMotionDevelopment: false, templateLikeForm: false,
};
const judge = (score: number, issues: string[] = [], dims: Partial<typeof ALL_DIMS> = {}) => ({
  faithful: true, score, issues, hardFailures: { ...NO_HARD }, ...ALL_DIMS, ...dims,
});
const mk = (id: string, score: number, human?: EvalItem['human']): EvalItem => ({
  id, source: `src-${id}`, judge: judge(score), ...(human ? { human } : {}),
});

describe('eval dataset (brief §18.2/§13.4)', () => {
  it('parses labeled JSONL + a deterministic dataset hash', () => {
    const text = `${JSON.stringify(mk('a', 8, { accept: 'accept' }))}\n${JSON.stringify(mk('b', 3, { accept: 'reject' }))}`;
    const { items, datasetHash } = parseLabeledDataset(text);
    expect(items).toHaveLength(2);
    expect(datasetHash).toBe(datasetHashOf(text));
  });

  it('calibration is NOT ready below the label floor (never derive thresholds from vibes)', () => {
    expect(isCalibrationReady([mk('a', 8, { accept: 'accept' })]).ok).toBe(false);
  });

  it('is ready at the floor', () => {
    const items = Array.from({ length: MIN_CALIBRATION_LABELS }, (_, i) => mk(String(i), i % 2 ? 6.8 : 8.4, { accept: 'accept' }));
    expect(isCalibrationReady(items).ok).toBe(true);
  });
});

describe('runCalibration (brief §13.4/§18.7)', () => {
  it('refuses to produce an artifact without real labels', () => {
    const text = JSON.stringify(mk('a', 3, { accept: 'reject' }));
    const { items, datasetHash } = parseLabeledDataset(text);
    const r = runCalibration(items, { datasetHash, runId: 'r1' });
    expect(r.artifact).toBeNull();
    expect(r.reasons.join(' ')).toMatch(/human labels/i);
  });

  it('produces a versioned artifact from a ready labeled set with zero false-rejects', () => {
    const items: EvalItem[] = [];
    for (let i = 0; i < MIN_CALIBRATION_LABELS; i += 1) {
      const accept = i % 3 !== 0;
      items.push(mk(`m${i}`, accept ? 8.6 : 2.0, { accept: accept ? 'accept' : 'reject' }));
    }
    const r = runCalibration(items, { datasetHash: 'ab12cd34', runId: 'run-abc123' });
    expect(r.artifact).not.toBeNull();
    expect(r.artifact!.datasetHash).toBe('ab12cd34');
    expect(r.artifact!.sourceEvalRunId).toBe('run-abc123');
    expect(r.artifact!.version).toBe('cal-run-abc1');
    expect(r.chosen).not.toBeNull();
    // Perfectly separable labels → a config with zero false-rejects exists and was chosen.
    expect(r.reasons.join(' ')).toContain('zero false-reject');
  });

  it('maps EvalItems into sweep items incl. Fix-2 geometry', () => {
    const item = { ...mk('g', 8.4, { accept: 'accept' }), geometry: { coveredPct: 0.11, coverageByPhase: [0, 0.11], hardVeto: false, hardVetoEligible: false } };
    const [sweepItem] = toSweepItems([item]);
    expect(sweepItem.geometry?.coveredPct).toBe(0.11);
    expect(sweepItem.human).toBe('accept');
  });
});