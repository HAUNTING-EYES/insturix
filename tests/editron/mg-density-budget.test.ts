import { describe, expect, it } from 'vitest';
import { computeMgDensityBudget } from '../../lib/editron/motion-graphics/codegen/design/density-budget';

const base = { durationSec: 60, beatCount: 12, numericEvidenceCount: 0, brandMotionEnergy: 0.5 };

describe('computeMgDensityBudget', () => {
  it('is deterministic — same inputs, same budget and rationale', () => {
    const a = computeMgDensityBudget({ ...base });
    const b = computeMgDensityBudget({ ...base });
    expect(a).toEqual(b);
  });

  it("mode 'off' is a hard zero regardless of evidence", () => {
    const out = computeMgDensityBudget({ ...base, numericEvidenceCount: 20, preference: { mode: 'off' } });
    expect(out.maxMoments).toBe(0);
    expect(out.rationale).toContain('veto');
  });

  it('zero beats licenses nothing', () => {
    expect(computeMgDensityBudget({ ...base, beatCount: 0 }).maxMoments).toBe(0);
  });

  it('auto restraint default: 60s neutral brand → 2 (2/min)', () => {
    expect(computeMgDensityBudget({ ...base }).maxMoments).toBe(2);
  });

  it('auto: a 35s clip still licenses at least one moment (ceil law)', () => {
    const out = computeMgDensityBudget({ ...base, durationSec: 35 });
    expect(out.maxMoments).toBeGreaterThanOrEqual(1);
  });

  it('auto evidence lift raises toward the 4/min ceiling but never past it', () => {
    const dense = computeMgDensityBudget({ ...base, numericEvidenceCount: 8 }); // 8/min evidence
    expect(dense.maxMoments).toBe(4); // capped at evidence ceiling 4/min × 1min
    const sparse = computeMgDensityBudget({ ...base });
    expect(dense.maxMoments).toBeGreaterThan(sparse.maxMoments);
  });

  it('narrative/abstract beats lift the auto rate like numeric facts (founder: MG need not be numbers)', () => {
    const dense = computeMgDensityBudget({ ...base, narrativeEvidenceCount: 12 }); // 12/min narrative evidence
    expect(dense.maxMoments).toBe(4); // capped at evidence ceiling 4/min × 1min
    const sparse = computeMgDensityBudget({ ...base }); // no narrative offered
    expect(dense.maxMoments).toBeGreaterThan(sparse.maxMoments);
    expect(dense.rationale).toContain('narrative 12');
  });

  it('narrativeEvidenceCount defaults to 0 when omitted — existing restraint preserved', () => {
    expect(computeMgDensityBudget({ ...base }).maxMoments).toBe(2);
  });

  it("prefer: the user's frequency dial rules (0 → restraint, 1 → ceiling)", () => {
    const low = computeMgDensityBudget({ ...base, preference: { mode: 'prefer', frequency: 0 } });
    const high = computeMgDensityBudget({ ...base, preference: { mode: 'prefer', frequency: 1 } });
    expect(low.maxMoments).toBe(2); // 2/min
    expect(high.maxMoments).toBe(4); // 4/min
  });

  it('brand energy nudges the rate in the CKG formality direction', () => {
    const calm = computeMgDensityBudget({ ...base, durationSec: 120, brandMotionEnergy: 0 });
    const punchy = computeMgDensityBudget({ ...base, durationSec: 120, brandMotionEnergy: 1 });
    expect(punchy.maxMoments).toBeGreaterThan(calm.maxMoments); // 2min: 1.5/min→3 vs 2.5/min→5
  });

  it('the budget never exceeds the beat count', () => {
    const out = computeMgDensityBudget({ ...base, beatCount: 1, numericEvidenceCount: 8 });
    expect(out.maxMoments).toBe(1);
  });

  it('passes the user intensity dial through untouched', () => {
    const out = computeMgDensityBudget({ ...base, preference: { mode: 'prefer', intensity: 0.8 } });
    expect(out.expressiveIntensity).toBe(0.8);
  });

  it('exposes the CKG spacing floor', () => {
    expect(computeMgDensityBudget({ ...base }).minSpacingSec).toBe(3.0);
  });

  it('fails loud on malformed input', () => {
    expect(() => computeMgDensityBudget({ ...base, durationSec: 0 })).toThrow();
    expect(() => computeMgDensityBudget({ ...base, durationSec: Number.NaN })).toThrow();
    expect(() => computeMgDensityBudget({ ...base, beatCount: 2.5 })).toThrow();
    expect(() => computeMgDensityBudget({ ...base, brandMotionEnergy: Number.POSITIVE_INFINITY })).toThrow();
  });
});
