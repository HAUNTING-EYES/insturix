import { describe, expect, it } from 'vitest';

import { applyUserOutput, clampDuration } from '@/lib/editron/production-brief/production-brief';
import {
  type IntakeSignals,
  lowConfidenceFields,
  resolveProductionBrief,
} from '@/lib/editron/production-brief/intake-resolver';
import { fitToDuration, type SceneScore } from '@/lib/editron/storyline/compose';
import { makeScene } from '@/lib/editron/storyline/scene';

function signals(over: Partial<IntakeSignals> = {}): IntakeSignals {
  return {
    entryPoint: 'upload', assetCount: 1, totalDurationSec: 3600,
    contentType: null, speechCoverage: null, hasBrand: false, ...over,
  };
}

describe('clampDuration - rejects negative/NaN/over-source', () => {
  it('null / undefined / NaN / <= 0 -> null (follow content)', () => {
    expect(clampDuration(null, 3600)).toBeNull();
    expect(clampDuration(undefined, 3600)).toBeNull();
    expect(clampDuration(NaN, 3600)).toBeNull();
    expect(clampDuration(-100, 3600)).toBeNull();
    expect(clampDuration(0, 3600)).toBeNull();
  });
  it('caps to the source length; no cap when source is unknown', () => {
    expect(clampDuration(999999, 3600)).toBe(3600);
    expect(clampDuration(30, 3600)).toBe(30);
    expect(clampDuration(30, null)).toBe(30);
  });
});

describe('applyUserOutput - enforces clamp + cascade on the edit path', () => {
  it('clamps an over-source duration edit down to the source length', () => {
    const b = resolveProductionBrief(signals({ totalDurationSec: 40 }));
    expect(applyUserOutput(b, { targetDurationSec: 300 }).output.targetDurationSec).toBe(40);
  });

  it('a negative duration edit becomes null (never negative)', () => {
    const b = resolveProductionBrief(signals());
    expect(applyUserOutput(b, { targetDurationSec: -5 }).output.targetDurationSec).toBeNull();
  });

  it('changing platform cascades aspect + duration from the new platform, then re-derives format', () => {
    const b = resolveProductionBrief(signals({ contentType: 'podcast', totalDurationSec: 5400 })); // youtube 16:9 full
    expect(b.output.aspectRatio).toBe('16:9');
    const next = applyUserOutput(b, { platform: 'tiktok' });
    expect(next.output.platform).toBe('tiktok');
    expect(next.output.aspectRatio).toBe('9:16'); // cascaded
    expect(next.output.targetDurationSec).toBe(30); // cascaded + clamped
    expect(next.output.format).toBe('reel'); // re-derived (30 of 5400)
  });

  it('an explicit aspect in the same edit overrides the platform cascade', () => {
    const b = resolveProductionBrief(signals());
    const next = applyUserOutput(b, { platform: 'tiktok', aspectRatio: '1:1' });
    expect(next.output.aspectRatio).toBe('1:1'); // user override wins
    expect(next.output.targetDurationSec).toBe(30); // still cascaded
    expect(next.resolution.confirmed).toEqual(expect.arrayContaining(['platform', 'aspectRatio']));
  });
});

describe('resolveProductionBrief - validates numeric inputs', () => {
  it('a negative requested duration resolves to null, not a negative value', () => {
    expect(resolveProductionBrief(signals({ requested: { targetDurationSec: -100 } })).output.targetDurationSec).toBeNull();
  });
  it('a NaN requested duration resolves to null', () => {
    expect(resolveProductionBrief(signals({ requested: { targetDurationSec: NaN } })).output.targetDurationSec).toBeNull();
  });
  it('a NaN count floors to 1; a fractional count floors to an integer', () => {
    expect(resolveProductionBrief(signals({ requested: { count: NaN } })).output.count).toBe(1);
    expect(resolveProductionBrief(signals({ requested: { count: 2.9 } })).output.count).toBe(2);
  });
  it('multiple connected platforms are ambiguous -> flagged for a glance, not silently picked', () => {
    const b = resolveProductionBrief(signals({ connectedPlatforms: ['tiktok', 'youtube'] }));
    expect(b.output.platform).toBe('tiktok'); // first...
    expect(lowConfidenceFields(b)).toContain('platform'); // ...but flagged because ambiguous
  });
  it('a single connected platform is confident (not flagged)', () => {
    const b = resolveProductionBrief(signals({ connectedPlatforms: ['tiktok'] }));
    expect(lowConfidenceFields(b)).not.toContain('platform');
  });
});

describe('fitToDuration - NaN + sub-minClip budgets', () => {
  function sc(startTime: number, endTime: number, score: number, srcIndex: number): SceneScore {
    return {
      scene: makeScene({ source: 'a', startTime, endTime, objects: [], faces: [], detectedText: [], transcription: '' }),
      score,
      srcIndex,
    };
  }
  it('a NaN target keeps all scenes (no NaN output)', () => {
    const picked = fitToDuration([sc(0, 5, 0.5, 0), sc(0, 6, 0.6, 1)], NaN);
    expect(picked).toHaveLength(2);
    expect(picked.every((p) => p.outOverride === undefined)).toBe(true);
  });
  it('a budget smaller than minClip yields NO clip (never an over-budget one)', () => {
    expect(fitToDuration([sc(0, 60, 0.9, 0)], 0.2)).toHaveLength(0); // 0.2 < minClip 0.4
  });
});
