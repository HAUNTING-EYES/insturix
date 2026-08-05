import { describe, expect, it } from 'vitest';

import { verifyRenderedReference, RENDERED_VERIFICATION_VERSION } from '@/lib/editron/reference-video/verify-rendered-reference';
import type { AdaptiveReferencePlan } from '@/lib/editron/reference-video/adaptive-reference-plan';

function plan(): AdaptiveReferencePlan {
  return {
    version: 'editron-r5-adaptive-plan-v1',
    sourceFingerprintVersion: 1,
    fingerprintId: 'efp_1',
    referenceId: 'ref_1',
    alignmentFrame: 'beat-space',
    sourceDurationMs: 10_000,
    slots: [
      { id: 'a', role: 'hook', startMs: 0, endMs: 2000, source: 'section', confidence: 1 },
      { id: 'b', role: 'drop', startMs: 6500, endMs: 7500, source: 'drop', confidence: 1 },
      { id: 'c', role: 'protected-silence', startMs: 8500, endMs: 9000, source: 'silence', confidence: 0.9 },
    ],
    rhythm: {
      bpm: 120,
      beatsMs: [250, 750, 1250, 6750, 7250],
      dropsMs: [6500],
      avgCutsPerMinute: 12,
      cutMs: [2500, 7000],
    },
  };
}

describe('R6 rendered verification', () => {
  it('passes all dimensions when the render faithfully matches the plan', () => {
    // Cuts land on exact beat-grid positions that also fall within the slot
    // anchors' tolerance (250ms): a ~12 cuts/min density render of a 10s clip.
    const rendered = {
      cutMs: [250, 6750],
      silenceWindows: [{ startMs: 8520, endMs: 8980 }],
      durationMs: 10_000,
    };
    const report = verifyRenderedReference(plan(), rendered);

    expect(report.version).toBe(RENDERED_VERIFICATION_VERSION);
    expect(report.matchAchieved).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.overall.score).toBeGreaterThan(0.5);
  });

  it('fails visibly when rendered cuts miss the plan (structural mismatch)', () => {
    const rendered = {
      cutMs: [4200, 4700, 5200], // nowhere near slot anchors
      silenceWindows: [],
      durationMs: 10_000,
    };
    const report = verifyRenderedReference(plan(), rendered, { cutToleranceMs: 200 });

    expect(report.matchAchieved).toBe(false);
    expect(report.dimensions.find((d) => d.id === 'structural_alignment')?.passed).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
  });

  it('reports beat alignment from rendered cut proximity to the beat grid', () => {
    const good = verifyRenderedReference(plan(), {
      cutMs: [260, 1240, 6800],
      silenceWindows: [],
      durationMs: 10_000,
    });
    const bad = verifyRenderedReference(plan(), {
      cutMs: [333, 1977, 4100],
      silenceWindows: [],
      durationMs: 10_000,
    });
    const goodBeat = good.dimensions.find((d) => d.id === 'beat_alignment')!;
    const badBeat = bad.dimensions.find((d) => d.id === 'beat_alignment')!;
    expect(goodBeat.score).toBeGreaterThan(badBeat.score);
    expect(goodBeat.passed).toBe(true);
  });

  it('flags when protected silence was destroyed in the render', () => {
    const rendered = {
      cutMs: [300, 740, 2500, 6780],
      silenceWindows: [], // the protected silence is gone
      durationMs: 10_000,
    };
    const report = verifyRenderedReference(plan(), rendered);
    const sil = report.dimensions.find((d) => d.id === 'protected_silence')!;
    expect(sil.passed).toBe(false);
    expect(report.matchAchieved).toBe(false);
  });

  it('reports cut-density ratio and shot-duration variance', () => {
    const report = verifyRenderedReference(plan(), {
      cutMs: [300, 740, 1250, 6780, 9000, 0, 500, 1600, 2000], // dense render vs 12/min plan
      silenceWindows: [],
      durationMs: 10_000,
    });
    const density = report.dimensions.find((d) => d.id === 'cut_density')!;
    const variance = report.dimensions.find((d) => d.id === 'shot_duration_variance')!;
    expect(density.detail).toContain('cuts/min');
    expect(variance.detail).toContain('CV');
  });

  it('is deterministic for identical inputs', () => {
    const rendered = { cutMs: [300, 740, 2500, 6780], silenceWindows: [], durationMs: 10_000 };
    const a = verifyRenderedReference(plan(), rendered);
    const b = verifyRenderedReference(plan(), rendered);
    expect(a).toEqual(b);
  });
});
