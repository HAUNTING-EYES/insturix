import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MERGE_WINDOW_MS,
  DEFAULT_STRONG_CUT_FLOOR,
  mergeCloseCuts,
  postProcessCuts,
} from '@/lib/editron/reference-video/adaptive-cut-postprocess';
import {
  buildCutBaselineReport,
  createSyntheticCutFixture,
} from '@/lib/editron/reference-video/r0-cut-detection-baseline';

describe('adaptive cut post-process (R0)', () => {
  it('declares the calibration knobs', () => {
    expect(DEFAULT_MERGE_WINDOW_MS).toBe(200);
    expect(DEFAULT_STRONG_CUT_FLOOR).toBe(0.5);
  });

  it('collapses the KOLD 212s whip-pan cluster 3 -> 1 (all members weak)', () => {
    // Confirmed by frame review: drum -> blade happened once; 212.212/.295 were
    // whip-pan blur phantoms and 212.421 sits in the same weak burst (max 0.44).
    const cluster = [
      { tMs: 212_212, sceneScore: 0.43847 },
      { tMs: 212_295, sceneScore: 0.373835 },
      { tMs: 212_421, sceneScore: 0.371943 },
    ];
    const result = mergeCloseCuts(cluster);

    expect(result.before).toBe(3);
    expect(result.after).toBe(1);
    expect(result.merges).toBe(1);
    expect(result.keptStrong).toBe(0);
    expect(result.cuts).toHaveLength(1);
    expect(result.cuts[0]).toMatchObject({ tMs: 212_212, sceneScore: 0.43847 });
  });

  it('keeps EVERY member of a real rapid montage cluster that has a strong cut', () => {
    // The Egg 355-360s montage: 29 cuts, span 2840ms, max 0.861 -> all real.
    const montage = Array.from({ length: 29 }, (_, i) => ({
      tMs: 355_000 + i * 140,
      sceneScore: i % 4 === 0 ? 0.85 : 0.4,
    }));
    const result = mergeCloseCuts(montage);

    expect(result.merges).toBe(0);
    expect(result.keptStrong).toBe(1);
    expect(result.after).toBe(29);
    expect(result.before).toBe(29);
  });

  it('keeps strong real cuts even inside a cluster with a weak straggler', () => {
    const cluster = [
      { tMs: 1_000, sceneScore: 0.9 },
      { tMs: 1_120, sceneScore: 0.3 },
    ];
    const result = mergeCloseCuts(cluster);

    expect(result.merges).toBe(0);
    expect(result.after).toBe(2);
  });

  it('leaves real cuts spaced beyond the merge window untouched', () => {
    const cuts = [
      { tMs: 800, sceneScore: 0.6 },
      { tMs: 2_400, sceneScore: 0.7 },
      { tMs: 4_100, sceneScore: 0.5 },
    ];
    const result = mergeCloseCuts(cuts);

    expect(result.merges).toBe(0);
    expect(result.after).toBe(3);
    expect(result.cuts.map(c => c.tMs)).toEqual([800, 2_400, 4_100]);
  });

  it('does not regress the synthetic baseline F1', () => {
    const fixture = createSyntheticCutFixture();
    const base = buildCutBaselineReport(fixture).score;
    const merged = mergeCloseCuts(fixture.detectorOutput);
    const after = buildCutBaselineReport({ ...fixture, detectorOutput: merged.cuts }).score;

    expect(merged.merges).toBe(0); // synthetic FP is isolated, does not merge
    expect(after.f1).toBeCloseTo(base.f1, 6);
    expect(base.f1).toBeGreaterThan(0.9);
  });

  it('returns the input unchanged for empty or single-cut lists', () => {
    expect(mergeCloseCuts([]).after).toBe(0);
    expect(mergeCloseCuts([{ tMs: 500 }]).after).toBe(1);
    expect(mergeCloseCuts([{ tMs: 500 }]).merges).toBe(0);
    expect(postProcessCuts([{ tMs: 500 }])).toEqual([{ tMs: 500 }]);
  });

  it('sorts unsorted input before clustering', () => {
    const result = mergeCloseCuts([
      { tMs: 2_000, sceneScore: 0.84 },
      { tMs: 1_000, sceneScore: 0.9 },
      { tMs: 1_100, sceneScore: 0.4 },
    ]);
    expect(result.cuts).toEqual([
      { tMs: 1_000, sceneScore: 0.9 },
      { tMs: 1_100, sceneScore: 0.4 },
      { tMs: 2_000, sceneScore: 0.84 },
    ]);
    expect(result.merges).toBe(0);
    expect(result.keptStrong).toBe(1);
  });
});
