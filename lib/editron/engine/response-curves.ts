import type { CurveType, CurveParams } from './utility-types';

function clamp01(v: number): number {
  if (!isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function linear(x: number, p: CurveParams): number {
  return p.slope * (x - p.xShift) + p.yShift;
}

function polynomial(x: number, p: CurveParams): number {
  return p.slope * Math.pow(Math.abs(x - p.xShift), p.exponent) * Math.sign(x - p.xShift) + p.yShift;
}

function logistic(x: number, p: CurveParams): number {
  return p.slope / (1 + Math.exp(-10 * p.exponent * (x - 0.5 - p.xShift))) + p.yShift;
}

function logit(x: number, p: CurveParams): number {
  const shifted = Math.max(0.001, Math.min(0.999, x - p.xShift));
  return p.slope * Math.log(shifted / (1 - shifted)) / 5 + 0.5 + p.yShift;
}

function normal(x: number, p: CurveParams): number {
  return p.slope * Math.exp(-30 * p.exponent * Math.pow(x - p.xShift - 0.5, 2)) + p.yShift;
}

function sine(x: number, p: CurveParams): number {
  return 0.5 * p.slope * Math.sin(2 * Math.PI * (x - p.xShift)) + 0.5 + p.yShift;
}

const CURVE_FN: Record<CurveType, (x: number, p: CurveParams) => number> = {
  linear,
  polynomial,
  logistic,
  logit,
  normal,
  sine,
};

export function evaluateCurve(curveType: CurveType, params: CurveParams, input: number): number {
  if (!isFinite(input)) {
    console.warn(`[ResponseCurve] NaN/Infinite input for ${curveType}, returning 0.5`);
    return 0.5;
  }
  const fn = CURVE_FN[curveType];
  if (!fn) {
    console.error(`[ResponseCurve] Unknown curve type: ${curveType}, returning 0.5`);
    return 0.5;
  }
  const raw = fn(input, params);
  return clamp01(raw);
}
