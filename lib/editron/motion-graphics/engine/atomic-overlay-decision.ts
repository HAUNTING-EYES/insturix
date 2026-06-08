import type {
  AtomicMotionProperty,
  AtomicOverlayPlan,
} from './atomic-overlay-plan';

export type AtomicIntensityBand = 'silent' | 'subtle' | 'standard' | 'expressive' | 'hero';

export interface AtomicDecisionCurves {
  signal: number;
  motion: number;
  structure: number;
  typography: number;
  overlay: number;
  density: number;
}

export interface AtomicDecisionLicenses {
  allowOverlay: boolean;
  allowKineticEntrance: boolean;
  allowHoldMotion: boolean;
  allowDepthMotion: boolean;
  allowDenseStructure: boolean;
  allowDataViz: boolean;
  maxMotionChannels: number;
  maxElementCount: number;
}

export interface AtomicDecisionMultipliers {
  motionAmplitude: number;
  typographyScale: number;
  structureDensity: number;
  opacityRange: number;
  depthParallax: number;
}

export interface AtomicOverlayDecision {
  version: 'atomic-decision-v1';
  score: number;
  band: AtomicIntensityBand;
  curves: AtomicDecisionCurves;
  licenses: AtomicDecisionLicenses;
  multipliers: AtomicDecisionMultipliers;
  dominantMotionProperties: AtomicMotionProperty[];
  dominantPrimitives: string[];
  rationale: string[];
}

const CURVE_WEIGHTS: Record<keyof AtomicDecisionCurves, number> = {
  signal: 0.24,
  motion: 0.18,
  structure: 0.16,
  typography: 0.14,
  overlay: 0.16,
  density: 0.12,
};

export function decideAtomicOverlay(plan: AtomicOverlayPlan): AtomicOverlayDecision {
  const curves = deriveCurves(plan);
  const score = weightedSum(curves);
  const band = bandForScore(score);
  const dominantMotionProperties = topKeys(countMotionProperties(plan), 4) as AtomicMotionProperty[];
  const dominantPrimitives = topKeys(countPrimitives(plan), 4);
  const hasHoldMotion = plan.elements.some((element) =>
    element.motion.tracks.some((track) => track.phase === 'hold' && trackDelta(track) > 0),
  );
  const hasDepthMotion = plan.elements.some((element) =>
    element.motion.tracks.some((track) => track.property === 'z' && trackDelta(track) > 0),
  );
  const hasDataViz = plan.elements.some((element) => element.primitive === 'data-viz');
  const visualRisk = plan.visualContext?.legibilityRisk ?? 0;
  const baseMotionChannels = motionChannelBudget(score, dominantMotionProperties.length);
  const baseElementCount = elementBudget(score, plan.elements.length);
  const baseDenseStructure = curves.structure >= 0.55 || (hasDataViz && score >= 0.28);
  const baseMotionAmplitude = lerp(0.65, 1.35, score);
  const baseStructureDensity = lerp(0.7, 1.3, Math.max(curves.structure, curves.density));
  const baseDepthParallax = hasDepthMotion ? lerp(0.2, 1, score) : 0;

  return {
    version: 'atomic-decision-v1',
    score,
    band,
    curves,
    licenses: {
      allowOverlay: plan.elements.length > 0 && score >= 0.12,
      allowKineticEntrance: score >= 0.36 && curves.motion >= 0.2 && visualRisk < 0.85,
      allowHoldMotion: hasHoldMotion && score >= 0.3 && visualRisk < 0.78,
      allowDepthMotion: hasDepthMotion && score >= 0.45 && visualRisk < 0.72,
      allowDenseStructure: baseDenseStructure && visualRisk < 0.68,
      allowDataViz: hasDataViz && score >= 0.18,
      maxMotionChannels: visualBudget(baseMotionChannels, visualRisk, 2, 3),
      maxElementCount: visualBudget(baseElementCount, visualRisk, 2, 3),
    },
    multipliers: {
      motionAmplitude: round2(baseMotionAmplitude * lerp(1, 0.55, visualRisk)),
      typographyScale: round2(lerp(0.9, 1.2, Math.max(curves.typography, curves.signal * 0.8))),
      structureDensity: round2(baseStructureDensity * lerp(1, 0.6, visualRisk)),
      opacityRange: round2(lerp(0.82, 1, Math.max(curves.signal, curves.overlay))),
      depthParallax: round2(baseDepthParallax * lerp(1, 0.25, visualRisk)),
    },
    dominantMotionProperties,
    dominantPrimitives,
    rationale: buildRationale(plan, curves, band),
  };
}

function deriveCurves(plan: AtomicOverlayPlan): AtomicDecisionCurves {
  const i = plan.intensity;
  const elementCount = plan.elements.length;
  const motionChannelCount = Object.keys(countMotionProperties(plan)).length;

  return {
    signal: smooth(i.signal, 0.15, 0.85),
    motion: smooth(Math.max(i.motion, i.scale, i.blur), 0.08, 0.75),
    structure: smooth(i.structure, 0.08, 0.7),
    typography: smooth(i.typography, 0.2, 0.9),
    overlay: smooth(i.overlayScore, 0.1, 0.8),
    density: smooth((elementCount + motionChannelCount) / 14, 0.12, 0.85),
  };
}

function weightedSum(curves: AtomicDecisionCurves): number {
  let sum = 0;
  for (const key of Object.keys(CURVE_WEIGHTS) as Array<keyof AtomicDecisionCurves>) {
    sum += curves[key] * CURVE_WEIGHTS[key];
  }
  return round3(clamp01(sum));
}

function bandForScore(score: number): AtomicIntensityBand {
  if (score < 0.12) return 'silent';
  if (score < 0.32) return 'subtle';
  if (score < 0.55) return 'standard';
  if (score < 0.78) return 'expressive';
  return 'hero';
}

function motionChannelBudget(score: number, available: number): number {
  const budget = score >= 0.78 ? 5
    : score >= 0.55 ? 4
    : score >= 0.32 ? 3
    : score >= 0.12 ? 2
    : 0;
  return Math.min(Math.max(available, 1), budget);
}

function elementBudget(score: number, available: number): number {
  const budget = score >= 0.78 ? 7
    : score >= 0.55 ? 5
    : score >= 0.32 ? 4
    : score >= 0.12 ? 2
    : 0;
  return Math.min(available, budget);
}

function visualBudget(base: number, visualRisk: number, highRiskBudget: number, mediumRiskBudget: number): number {
  if (base <= 0) return 0;
  if (visualRisk >= 0.72) return Math.min(base, highRiskBudget);
  if (visualRisk >= 0.42) return Math.min(base, mediumRiskBudget);
  return base;
}

function countMotionProperties(plan: AtomicOverlayPlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const element of plan.elements) {
    for (const track of element.motion.tracks) {
      counts[track.property] = (counts[track.property] ?? 0) + 1;
    }
  }
  return counts;
}

function countPrimitives(plan: AtomicOverlayPlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const element of plan.elements) {
    counts[element.primitive] = (counts[element.primitive] ?? 0) + 1;
  }
  return counts;
}

function topKeys(counts: Record<string, number>, limit: number): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function buildRationale(
  plan: AtomicOverlayPlan,
  curves: AtomicDecisionCurves,
  band: AtomicIntensityBand,
): string[] {
  const reasons = [`band:${band}`, `recipe:${plan.recipeId}`];
  const sorted = Object.entries(curves)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [key, value] of sorted) {
    reasons.push(`${key}:${value.toFixed(2)}`);
  }
  if (plan.visualContext && plan.visualContext.legibilityRisk > 0) {
    reasons.push(`visual-risk:${plan.visualContext.legibilityRisk.toFixed(2)}`);
    reasons.push(`visual-density:${plan.visualContext.recommendedDensity}`);
  }
  return reasons;
}

function trackDelta(track: AtomicOverlayPlan['elements'][number]['motion']['tracks'][number]): number {
  const values = track.keyframes.map((keyframe) => keyframe.value);
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

function smooth(value: number, low: number, high: number): number {
  const t = clamp01((value - low) / Math.max(0.0001, high - low));
  return round3(t * t * (3 - 2 * t));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
