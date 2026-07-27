import { describe, expect, it } from 'vitest';

import { computeMgMotionIntensity, MIN_MG_LIVENESS } from '@/lib/editron/motion-graphics/codegen/design/motion-intensity';

describe('MG motion intensity — brand × video × user, never a global constant', () => {
  it('deterministic: same inputs → same intensity', () => {
    const a = computeMgMotionIntensity({ brandMotionEnergy: 0.6, videoEnergy: 0.4, preference: { mode: 'prefer', intensity: 0.7 } });
    const b = computeMgMotionIntensity({ brandMotionEnergy: 0.6, videoEnergy: 0.4, preference: { mode: 'prefer', intensity: 0.7 } });
    expect(a.intensity).toBe(b.intensity);
    expect(a.rationale).toBe(b.rationale);
  });

  it('always alive: a fully-calm signal still sits at the liveness floor (never frozen)', () => {
    const calm = computeMgMotionIntensity({ brandMotionEnergy: 0, videoEnergy: 0, preference: { mode: 'prefer', intensity: 0 } });
    expect(calm.intensity).toBe(MIN_MG_LIVENESS);
  });

  it('fully-punchy signal reaches 1.0', () => {
    const hype = computeMgMotionIntensity({ brandMotionEnergy: 1, videoEnergy: 1, preference: { mode: 'prefer', intensity: 1 } });
    expect(hype.intensity).toBe(1);
  });

  it('brand, video, and user each move it — none is ignored', () => {
    const base = computeMgMotionIntensity({ brandMotionEnergy: 0, videoEnergy: 0, preference: { mode: 'prefer', intensity: 0 } }).intensity;
    expect(computeMgMotionIntensity({ brandMotionEnergy: 1, videoEnergy: 0, preference: { mode: 'prefer', intensity: 0 } }).intensity).toBeGreaterThan(base);
    expect(computeMgMotionIntensity({ brandMotionEnergy: 0, videoEnergy: 1, preference: { mode: 'prefer', intensity: 0 } }).intensity).toBeGreaterThan(base);
    expect(computeMgMotionIntensity({ brandMotionEnergy: 0, videoEnergy: 0, preference: { mode: 'prefer', intensity: 1 } }).intensity).toBeGreaterThan(base);
  });

  it('brand carries the most weight (primary identity signal)', () => {
    const brandOnly = computeMgMotionIntensity({ brandMotionEnergy: 1, videoEnergy: 0, preference: { mode: 'prefer', intensity: 0 } }).intensity;
    const userOnly = computeMgMotionIntensity({ brandMotionEnergy: 0, videoEnergy: 0, preference: { mode: 'prefer', intensity: 1 } }).intensity;
    expect(brandOnly).toBeGreaterThan(userOnly);
  });

  it('absent video energy / user dial = neutral prior (no push), not an error', () => {
    const r = computeMgMotionIntensity({ brandMotionEnergy: 0.5 });
    expect(r.intensity).toBeGreaterThanOrEqual(MIN_MG_LIVENESS);
    expect(r.intensity).toBeLessThanOrEqual(1);
    // brand 0.5, video 0.5 (neutral), user 0.5 (neutral) → mix 0.5 → 0.7 + 0.3*0.5 = 0.85
    expect(r.intensity).toBeCloseTo(0.85, 5);
  });

  it('stays within [floor, 1] and clamps out-of-range signals', () => {
    const r = computeMgMotionIntensity({ brandMotionEnergy: 5, videoEnergy: -3, preference: { mode: 'prefer', intensity: 9 } });
    expect(r.intensity).toBeGreaterThanOrEqual(MIN_MG_LIVENESS);
    expect(r.intensity).toBeLessThanOrEqual(1);
  });

  it('throws loud on a non-finite brand energy (R18N)', () => {
    expect(() => computeMgMotionIntensity({ brandMotionEnergy: NaN })).toThrow(/brandMotionEnergy/);
    expect(() => computeMgMotionIntensity({ brandMotionEnergy: 0.5, videoEnergy: Infinity })).toThrow(/videoEnergy/);
  });
});
