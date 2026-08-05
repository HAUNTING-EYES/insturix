/**
 * R6: Rendered Verification.
 *
 * Analyzes the RENDERED result — not just the plan — against the R5 adaptive
 * reference plan, and FAILS VISIBLY when the requested reference match cannot
 * be achieved with the available material.
 *
 * Dimensions compared (R6 spec):
 *   - structural alignment  (plan slots present in the rendered cut sequence)
 *   - beat/section alignment (rendered cut times vs the plan's beat grid)
 *   - energy trajectory      (rendered beat density vs plan cut density) — proxy
 *   - cut-density curve      (cuts/min vs plan)
 *   - shot-duration variance (consistency of rendered shot lengths)
 *   - protected-silence      (silence windows survive undamaged in the render)
 *
 * The rendered measurement is INJECTED: the caller re-runs the R2 measure
 * pipeline on the rendered artifact and passes primitives here. This module is
 * pure + deterministic; it measures and gates, it never alters the edit.
 */

import type { AdaptiveReferencePlan } from './adaptive-reference-plan';

export const RENDERED_VERIFICATION_VERSION = 'editron-r6-rendered-verification-v1' as const;

export interface RenderedCut {
  tMs: number;
}

export interface RenderedMeasurement {
  /** Re-measured cut times from the RENDERED artifact (ms). */
  cutMs: number[];
  /** Protected-silence windows that survived in the render (ms). */
  silenceWindows: Array<{ startMs: number; endMs: number }>;
  /** Rendering duration (ms). Must be > 0 for density math. */
  durationMs: number;
}

export interface DimensionReport {
  id:
    | 'structural_alignment'
    | 'beat_alignment'
    | 'cut_density'
    | 'shot_duration_variance'
    | 'protected_silence'
    | 'energy_trajectory';
  score: number; // 0..1
  passed: boolean;
  detail: string;
}

export interface RenderedVerificationReport {
  version: typeof RENDERED_VERIFICATION_VERSION;
  referenceId: string;
  plan: AdaptiveReferencePlan;
  dimensions: DimensionReport[];
  overall: {
    score: number; // 0..1
    passed: boolean;
  };
  /** Fail-visible gate: when false, the requested reference match was NOT achieved. */
  matchAchieved: boolean;
  failures: string[];
}

export interface VerifyRenderedOptions {
  /** Cut-tolerance for alignment (ms). Reuses the R0 250ms cut tolerance. */
  cutToleranceMs?: number;
  /** Beat-timing tolerance (ms) for beat alignment. ⚠️ INVENTED — half an 8th at 120bpm. */
  beatToleranceMs?: number;
  /** Minimum score per dimension to pass. ⚠️ INVENTED — gate calibration pending real renders. */
  dimensionPassThreshold?: number;
  /** Verify protected-silence at all; default true. */
  checkProtectedSilence?: boolean;
}

export function verifyRenderedReference(
  plan: AdaptiveReferencePlan,
  rendered: RenderedMeasurement,
  options: VerifyRenderedOptions = {},
): RenderedVerificationReport {
  const cutToleranceMs = options.cutToleranceMs ?? 250;
  const beatToleranceMs = options.beatToleranceMs ?? 125;
  const pass = options.dimensionPassThreshold ?? 0.5;
  const checkProtectedSilence = options.checkProtectedSilence ?? true;

  const failures: string[] = [];
  const dimensions: DimensionReport[] = [];
  const add = (report: DimensionReport) => {
    dimensions.push(report);
    if (!report.passed) failures.push(report.detail);
  };

  // ── Structural alignment: are the plan's slot anchor times near a rendered cut? ──
  const planCutTimes = plan.slots
    .filter((s) => s.role !== 'protected-silence' && s.startMs >= 0)
    .map((s) => s.startMs);
  if (planCutTimes.length === 0) {
    add({
      id: 'structural_alignment',
      score: 1,
      passed: true,
      detail: 'no slotted anchors to verify',
    });
  } else {
    const matched = planCutTimes.filter((t) =>
      rendered.cutMs.some((c) => Math.abs(c - t) <= cutToleranceMs),
    ).length;
    const score = matched / planCutTimes.length;
    add({
      id: 'structural_alignment',
      score: round(score),
      passed: score >= pass,
      detail: `plan slots matched: ${matched}/${planCutTimes.length} within ${cutToleranceMs}ms`,
    });
  }

  // ── Beat alignment: rendered cuts near the plan's beat grid. ──
  const beatGrid = plan.rhythm.beatsMs;
  if (beatGrid.length === 0 || rendered.cutMs.length === 0) {
    add({ id: 'beat_alignment', score: 0.5, passed: true, detail: 'no beat grid or no cuts to compare (skip)' });
  } else {
    const onBeat = rendered.cutMs.filter((c) => beatGrid.some((b) => Math.abs(c - b) <= beatToleranceMs)).length;
    const score = onBeat / rendered.cutMs.length;
    add({
      id: 'beat_alignment',
      score: round(score),
      passed: score >= pass,
      detail: `rendered cuts on beat: ${onBeat}/${rendered.cutMs.length} within ${beatToleranceMs}ms`,
    });
  }

  // ── Cut-density curve: rendered cuts/min vs plan. ──
  const planDensity = plan.rhythm.avgCutsPerMinute;
  const renderMin = rendered.durationMs > 0 ? rendered.durationMs / 60_000 : 0;
  const renderDensity = renderMin > 0 ? rendered.cutMs.length / renderMin : 0;
  if (planDensity <= 0 || renderDensity <= 0) {
    add({
      id: 'cut_density',
      score: 0.5,
      passed: true,
      detail: `no density to compare (plan=${planDensity}, rendered=${renderDensity})`,
    });
  } else {
    const ratio = Math.min(renderDensity, planDensity) / Math.max(renderDensity, planDensity);
    add({
      id: 'cut_density',
      score: round(ratio),
      passed: ratio >= pass,
      detail: `cuts/min plan=${round(planDensity, 2)} rendered=${round(renderDensity, 2)} ratio=${round(ratio, 2)}`,
    });
  }

  // ── Shot-duration variance: consistency of inter-cut gaps. ──
  const inter = sorted(rendered.cutMs).slice(1).map((t, i) => t - sorted(rendered.cutMs)[i]);
  if (inter.length < 2) {
    add({ id: 'shot_duration_variance', score: 1, passed: true, detail: 'too few shots to score variance' });
  } else {
    const mean = inter.reduce((a, b) => a + b, 0) / inter.length;
    const variance = inter.reduce((a, b) => a + (b - mean) ** 2, 0) / inter.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    // cv <= 1 is broadly regular editing; higher = erratic. ⚠️ INVENTED bound.
    const score = cv <= 1 ? clamp(1 - (cv - 0.2), 0, 1) : 0;
    add({
      id: 'shot_duration_variance',
      score: round(score),
      passed: score >= pass,
      detail: `shot-interval CV=${round(cv, 2)}`,
    });
  }

  // ── Protected silence: plan silence vs rendered silence. ──
  const planSilences = plan.slots.filter((s) => s.role === 'protected-silence');
  if (!checkProtectedSilence || planSilences.length === 0) {
    add({ id: 'protected_silence', score: 1, passed: true, detail: 'no protected silence in plan (skip)' });
  } else {
    const preserved = planSilences.filter((s) =>
      rendered.silenceWindows.some((w) => w.startMs - cutToleranceMs <= s.startMs && s.endMs <= w.endMs + cutToleranceMs),
    ).length;
    const score = preserved / planSilences.length;
    add({
      id: 'protected_silence',
      score: round(score),
      passed: score >= pass,
      detail: `protected silences preserved: ${preserved}/${planSilences.length}`,
    });
  }

  // ── Energy trajectory proxy: rendered cut pacing vs plan beat pacing spread. ──
  const planSpan = plan.rhythm.beatsMs.length > 1
    ? plan.rhythm.beatsMs[plan.rhythm.beatsMs.length - 1] - plan.rhythm.beatsMs[0]
    : plan.sourceDurationMs;
  const renderLast = rendered.cutMs.length > 1 ? sorted(rendered.cutMs)[rendered.cutMs.length - 1] : 0;
  const renderFirst = rendered.cutMs.length > 1 ? sorted(rendered.cutMs)[0] : 0;
  if (planSpan <= 0 || renderLast < renderFirst) {
    add({ id: 'energy_trajectory', score: 0.5, passed: true, detail: 'insufficient data to compare trajectory' });
  } else {
    const renderSpan = renderLast - renderFirst;
    const ratio = Math.min(renderSpan, planSpan) / Math.max(renderSpan, planSpan);
    add({
      id: 'energy_trajectory',
      score: round(ratio),
      passed: ratio >= pass,
      detail: `pacing spread plan=${round(planSpan, 0)}ms rendered=${round(renderSpan, 0)}ms ratio=${round(ratio, 2)}`,
    });
  }

  const overallScore = dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length;
  const matchAchieved = failures.length === 0;
  return {
    version: RENDERED_VERIFICATION_VERSION,
    referenceId: plan.referenceId,
    plan,
    dimensions,
    overall: { score: round(overallScore), passed: matchAchieved },
    matchAchieved,
    failures,
  };
}

function sorted(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
