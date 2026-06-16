import { describe, it, expect } from 'vitest';
import { buildZoomKeyframes } from '@/lib/editron/services/zoom-keyframes';

// Regression guard for the 2026-06-04 pull-back inversion bug (mechanism 3).
// DECISION_REGISTRY convention: scaleFrom = START scale, scaleTo = END scale.
// A pull-back has scaleFrom > scaleTo (e.g. 1.06 -> 1.0) and MUST render as a zoom-OUT
// (scale decreases over time). The previous code swapped the two keyframe values in the
// pull-back branch, rendering pull-backs as zoom-INs — so the brief's ~17% zoom_pull_back
// decisions (measured via scripts/probe-brief-zoom-eval.ts) all silently looked like zoom-ins.

const SCENE_END = 300;
const LOCAL = 30;
const DURATION = 45;

describe('buildZoomKeyframes', () => {
  it('renders a pull-back as a zoom-OUT (scale decreases) — registry scaleFrom > scaleTo', () => {
    const kf = buildZoomKeyframes('pull-back', 1.06, 1.0, LOCAL, DURATION, SCENE_END);
    const first = kf[0].value;
    const last = kf[kf.length - 1].value;
    expect(first).toBeCloseTo(1.06); // starts zoomed in
    expect(last).toBeCloseTo(1.0);   // ends at normal
    expect(last).toBeLessThan(first); // OUT — the regression guard (old swapped code gave last > first = IN)
  });

  it('renders a slow-push as a zoom-IN (scale increases)', () => {
    const kf = buildZoomKeyframes('slow-push', 1.0, 1.1, LOCAL, DURATION, SCENE_END);
    expect(kf[kf.length - 1].value).toBeGreaterThan(kf[0].value);
  });

  it('renders a punch-in as a zoom-IN that holds at scaleTo', () => {
    const kf = buildZoomKeyframes('punch-in', 1.0, 1.15, LOCAL, DURATION, SCENE_END);
    expect(kf[0].value).toBeCloseTo(1.0);
    expect(kf[kf.length - 1].value).toBeCloseTo(1.15); // holds at target
    expect(kf[kf.length - 1].value).toBeGreaterThan(kf[0].value);
  });

  it('INVARIANT: any pull-back (scaleFrom > scaleTo) ends <= where it starts (never inverts to a zoom-in)', () => {
    for (const [from, to] of [[1.06, 1.0], [1.08, 1.0], [1.15, 1.05]] as const) {
      const kf = buildZoomKeyframes('pull-back', from, to, LOCAL, DURATION, SCENE_END);
      expect(kf[kf.length - 1].value).toBeLessThanOrEqual(kf[0].value);
    }
  });

  it('unknown zoomType falls back to slow-push (deterministic, fail-safe)', () => {
    const kf = buildZoomKeyframes('mystery', 1.0, 1.1, LOCAL, DURATION, SCENE_END);
    expect(kf[0].value).toBeCloseTo(1.0);
    expect(kf[kf.length - 1].value).toBeCloseTo(1.1);
  });
});
