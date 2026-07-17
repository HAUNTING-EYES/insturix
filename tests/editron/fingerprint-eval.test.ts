import { describe, expect, it } from 'vitest';
import {
  scoreVisualExtraction,
  runFingerprintEval,
  type VisualExtractionTarget,
  type FingerprintEvalCase,
} from '@/lib/editron/reference-video/fingerprint-eval';

const near = (v: number, t: number) => Math.abs(v - t) < 1e-9;

describe('scoreVisualExtraction — decisionStream F1', () => {
  const expected: VisualExtractionTarget = {
    decisionStream: [
      { family: 'zoom_punch', anchor: { kind: 'beat', tMs: 1000 }, params: {}, confidence: 1 },
      { family: 'sfx_impact', anchor: { kind: 'beat', tMs: 2000 }, params: {}, confidence: 1 },
    ],
  };

  it('matches within the time tolerance', () => {
    const predicted: VisualExtractionTarget = {
      decisionStream: [
        { family: 'zoom_punch', anchor: { kind: 'beat', tMs: 1100 }, params: {}, confidence: 0.9 }, // 100ms ≤ 200
        { family: 'sfx_impact', anchor: { kind: 'beat', tMs: 2000 }, params: {}, confidence: 0.9 },
      ],
    };
    expect(scoreVisualExtraction(predicted, expected).perLayer.decisionStream).toBe(1);
  });

  it('misses when out of tolerance or wrong family (F1 = 0.5 for one of two)', () => {
    const predicted: VisualExtractionTarget = {
      decisionStream: [
        { family: 'zoom_punch', anchor: { kind: 'beat', tMs: 1300 }, params: {}, confidence: 0.9 }, // 300ms > 200 → miss
        { family: 'sfx_impact', anchor: { kind: 'beat', tMs: 2000 }, params: {}, confidence: 0.9 }, // hit
      ],
    };
    // tp=1, fp=1, fn=1 → precision 0.5, recall 0.5, f1 0.5
    expect(near(scoreVisualExtraction(predicted, expected).perLayer.decisionStream!, 0.5)).toBe(true);
  });

  it('scores empty-expected + empty-predicted as a perfect 1 (not a fake pass)', () => {
    const s = scoreVisualExtraction({ decisionStream: [] }, { decisionStream: [] });
    expect(s.perLayer.decisionStream).toBe(1);
    expect(s.overall).toBe(1);
  });
});

describe('scoreVisualExtraction — other layers', () => {
  it('typography: fraction of specified categorical fields that match', () => {
    const s = scoreVisualExtraction(
      { typography: { textCase: 'upper', position: 'top' } },
      { typography: { textCase: 'upper', position: 'center' } },
    );
    expect(near(s.perLayer.typography!, 0.5)).toBe(true);
  });

  it('treatment: numeric fields within the absolute tolerance', () => {
    expect(scoreVisualExtraction({ treatment: { saturate: 1.25 } }, { treatment: { saturate: 1.2 } }).perLayer.treatment).toBe(1);
    expect(scoreVisualExtraction({ treatment: { saturate: 1.4 } }, { treatment: { saturate: 1.2 } }).perLayer.treatment).toBe(0);
  });

  it('graphics: averages class-set F1 with density match', () => {
    const s = scoreVisualExtraction(
      { graphics: { classes: ['kinetic-type'], density: 'heavy' } },
      { graphics: { classes: ['kinetic-type', 'callout'], density: 'heavy' } },
    );
    // classes: tp1 fp0 fn1 → f1 0.6667; density 1 → mean 0.8333
    expect(near(s.perLayer.graphics!, (2 / 3 + 1) / 2)).toBe(true);
  });

  it('structure: slots match on role + start within tolerance', () => {
    const s = scoreVisualExtraction(
      { structure: { slots: [{ role: 'hook', startMs: 300, endMs: 2000 }] } },
      { structure: { slots: [{ role: 'hook', startMs: 0, endMs: 2000 }] } },
    );
    expect(s.perLayer.structure).toBe(1);
  });

  it('overall is the mean of only the layers ground truth specified', () => {
    const s = scoreVisualExtraction(
      { typography: { textCase: 'upper' }, treatment: { saturate: 5 } },
      { typography: { textCase: 'lower' }, treatment: { saturate: 1.2 } }, // both wrong
    );
    expect(s.overall).toBe(0);
    expect(Object.keys(s.perLayer).sort()).toEqual(['treatment', 'typography']);
  });
});

describe('runFingerprintEval — multi-seed min gate (Rule 35)', () => {
  const cases: FingerprintEvalCase[] = [{ id: 'c1', videoUrl: 'v1', expected: { typography: { textCase: 'upper' } } }];

  it('passes when every seed extracts correctly', async () => {
    const extract = async (): Promise<VisualExtractionTarget> => ({ typography: { textCase: 'upper' } });
    const report = await runFingerprintEval(cases, extract, {}, [1, 2, 3]);
    expect(report.pass).toBe(true);
    expect(report.minOverall).toBe(1);
    expect(report.seeds).toHaveLength(3);
  });

  it('fails when a single seed is wrong (min across seeds, not mean)', async () => {
    const flaky = async (_url: string, seed: number): Promise<VisualExtractionTarget> => ({
      typography: { textCase: seed === 2 ? 'lower' : 'upper' },
    });
    const report = await runFingerprintEval(cases, flaky, {}, [1, 2, 3]);
    expect(report.pass).toBe(false);
    expect(report.minOverall).toBe(0); // seed 2 tanks it even though mean is high
    expect(report.maxOverall).toBe(1);
  });
});
