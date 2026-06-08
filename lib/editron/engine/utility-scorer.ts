import type {
  OverlayDefinition,
  SignalSnapshot,
  ScoringResult,
  ConsiderationScore,
  GridPointDecision,
  OverlayCategory,
  ScoringMethod,
  ScoringContext,
  PlacementAdjustment,
  PlacementHints,
  PlacementRegion,
} from './utility-types';
import { CATEGORY_CONSTRAINTS } from './utility-types';
import { evaluateCurve } from './response-curves';
import { buildAtomicPlacementHints, deriveAtomicVisualContext } from './atomic-overlay-core';

function resolveOutputValues(
  def: OverlayDefinition,
  totalScore: number,
): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of def.outputParams) {
    if (p.mode === 'fixed') {
      out[p.name] = p.fixedValue ?? 0;
    } else {
      const min = p.minValue ?? 0;
      const max = p.maxValue ?? 1;
      out[p.name] = min + totalScore * (max - min);
    }
  }
  return out;
}

export function scoreOverlay(
  def: OverlayDefinition,
  signals: SignalSnapshot,
  method: ScoringMethod = 'multiplicative',
  context: ScoringContext = {},
): ScoringResult {
  const validConsiderations: ConsiderationScore[] = [];

  for (const c of def.considerations) {
    const raw = signals[c.signalId];
    if (raw === undefined || raw === null || !isFinite(raw)) continue;

    let curveOut = evaluateCurve(c.curveType, c.params, raw);
    if (c.invert) curveOut = 1 - curveOut;

    validConsiderations.push({
      signalId: c.signalId,
      rawInput: raw,
      curveOutput: curveOut,
      compensated: curveOut,
      description: c.description,
    });
  }

  if (validConsiderations.length === 0) {
    return {
      overlayId: def.id,
      category: def.category,
      rank: def.rank,
      totalScore: 0,
      considerationScores: [],
      outputValues: {},
    };
  }

  let totalScore: number;

  if (method === 'multiplicative') {
    const compFactor = 1 - 1 / validConsiderations.length;
    totalScore = def.weight;
    for (const cs of validConsiderations) {
      const mod = (1 - cs.curveOutput) * compFactor;
      cs.compensated = cs.curveOutput + mod * cs.curveOutput;
      totalScore *= cs.compensated;
    }
  } else {
    let sum = 0;
    for (const cs of validConsiderations) {
      cs.compensated = cs.curveOutput;
      sum += cs.curveOutput;
    }
    totalScore = def.weight * (sum / validConsiderations.length);
  }

  const outputValues = resolveOutputValues(def, totalScore);
  const placementAdjustment = computePlacementAdjustment(
    def,
    outputValues,
    signals,
    context,
  );
  totalScore *= placementAdjustment.multiplier;

  return {
    overlayId: def.id,
    category: def.category,
    rank: def.rank,
    totalScore,
    considerationScores: validConsiderations,
    outputValues,
    placementAdjustment: shouldExposePlacementAdjustment(placementAdjustment) ? placementAdjustment : undefined,
  };
}

export function scoreAllOverlays(
  definitions: OverlayDefinition[],
  signals: SignalSnapshot,
  method: ScoringMethod = 'multiplicative',
  context: ScoringContext = {},
): ScoringResult[] {
  const results: ScoringResult[] = [];
  for (const def of definitions) {
    const result = scoreOverlay(def, signals, method, context);
    if (result.totalScore >= def.minScore) {
      results.push(result);
    }
  }
  results.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    return b.totalScore - a.totalScore;
  });
  return results;
}

export function selectWinners(
  results: ScoringResult[],
  recentDecisions: Map<OverlayCategory, number>,
  currentFrame: number,
): Record<OverlayCategory, ScoringResult | null> {
  const winners: Record<OverlayCategory, ScoringResult | null> = {
    zoom: null, transition: null, sfx: null, graphic: null,
    filter: null, caption: null, cut: null, camera: null,
    'mg-property': null,
  };
  const categoryCount: Record<string, number> = {};

  for (const result of results) {
    const cat = result.category;
    const constraint = CATEGORY_CONSTRAINTS[cat];

    if (constraint.global) {
      if (!winners[cat] || result.totalScore > winners[cat]!.totalScore) {
        winners[cat] = result;
      }
      continue;
    }

    const lastFrame = recentDecisions.get(cat) ?? -Infinity;
    if (currentFrame - lastFrame < constraint.minGapFrames) continue;

    const placed = categoryCount[cat] ?? 0;
    if (placed >= constraint.maxPerGridPoint) continue;

    if (!winners[cat]) {
      winners[cat] = result;
    }
    categoryCount[cat] = placed + 1;
  }

  return winners;
}

export function scoreGridPoint(
  definitions: OverlayDefinition[],
  signals: SignalSnapshot,
  frame: number,
  timestampMs: number,
  recentDecisions: Map<OverlayCategory, number>,
  method: ScoringMethod = 'multiplicative',
  context: ScoringContext = {},
): GridPointDecision {
  const allScores = scoreAllOverlays(definitions, signals, method, context);
  const winners = selectWinners(allScores, recentDecisions, frame);
  return { frame, timestampMs, winners, allScores };
}

function computePlacementAdjustment(
  def: OverlayDefinition,
  outputValues: Record<string, number | string | boolean>,
  signals: SignalSnapshot,
  context: ScoringContext,
): PlacementAdjustment {
  const placementHints = context.placementHints ?? derivePlacementHints(signals);
  const candidateRegion = context.candidateRegion ?? resolveCandidateRegion(outputValues);
  const pressurePenalty = visualPressurePenalty(def.category, placementHints);
  if (!candidateRegion) {
    return emptyPlacementAdjustment(placementHints, undefined, pressurePenalty);
  }

  const avoidHits = placementHints.avoid.filter((box) => regionConflictsWithBox(candidateRegion, box));
  const preferHits = placementHints.prefer.filter((box) => regionConflictsWithBox(candidateRegion, box, 0.08));
  const avoidStrength = Math.max(0, ...avoidHits.map((box) => box.strength));
  const preferStrength = Math.max(0, ...preferHits.map((box) => box.strength));
  const densityPenalty = def.category === 'graphic' && placementHints.density === 'restrained' ? 0.08 : 0;
  const penalty = clamp01(avoidStrength * 0.55 + densityPenalty + pressurePenalty);
  const bonus = clamp01(preferStrength * 0.25);
  const multiplier = clampRange(1 + bonus - penalty, 0.25, 1.25);

  return {
    candidateRegion,
    multiplier,
    penalty,
    bonus,
    avoidHits: avoidHits.map((box) => box.reason),
    preferHits: preferHits.map((box) => box.reason),
    constraints: placementHints.constraints,
  };
}

function derivePlacementHints(signals: SignalSnapshot): PlacementHints {
  return buildAtomicPlacementHints(deriveAtomicVisualContext(signals as Record<string, unknown>));
}

function emptyPlacementAdjustment(
  placementHints: PlacementHints,
  candidateRegion: PlacementRegion | undefined,
  penalty = 0,
): PlacementAdjustment {
  return {
    candidateRegion,
    multiplier: clampRange(1 - penalty, 0.25, 1),
    penalty,
    bonus: 0,
    avoidHits: [],
    preferHits: [],
    constraints: placementHints.constraints,
  };
}

function visualPressurePenalty(category: OverlayCategory, placementHints: PlacementHints): number {
  let penalty = 0;
  const constraints = new Set(placementHints.constraints);

  if (category === 'graphic') {
    if (placementHints.density === 'restrained') penalty += 0.1;
    else if (placementHints.density === 'balanced') penalty += 0.04;
    if (constraints.has('protect-existing-text')) penalty += 0.08;
    if (constraints.has('protect-human-attention')) penalty += 0.04;
  }

  if (category === 'caption' && constraints.has('protect-existing-text')) {
    penalty += 0.18;
  }

  if ((category === 'zoom' || category === 'camera') && constraints.has('avoid-large-kinetic-overlays')) {
    penalty += 0.18;
  }

  if ((category === 'zoom' || category === 'camera') && constraints.has('protect-human-attention')) {
    penalty += 0.06;
  }

  if (category === 'transition' && constraints.has('prefer-negative-space')) {
    penalty += 0.06;
  }

  return clamp01(penalty);
}

function shouldExposePlacementAdjustment(adjustment: PlacementAdjustment): boolean {
  return Boolean(adjustment.candidateRegion)
    || adjustment.multiplier !== 1
    || adjustment.penalty > 0
    || adjustment.bonus > 0
    || adjustment.constraints.length > 0;
}

function resolveCandidateRegion(outputValues: Record<string, number | string | boolean>): PlacementRegion | undefined {
  const raw = outputValues.position
    ?? outputValues.region
    ?? outputValues.safeZone
    ?? outputValues.safe_zone
    ?? outputValues.screenRegion
    ?? outputValues.screen_region
    ?? outputValues.layoutPosition;
  if (typeof raw !== 'string') return undefined;
  return normalizeRegion(raw);
}

function normalizeRegion(raw: string): PlacementRegion | undefined {
  const normalized = raw.toLowerCase().trim().replace(/_/g, '-');
  const aliases: Record<string, PlacementRegion> = {
    center: 'middle-center',
    middle: 'middle-center',
    'center-center': 'middle-center',
    'left': 'middle-left',
    'right': 'middle-right',
    'top': 'top-center',
    'bottom': 'bottom-center',
    'lower-third': 'bottom-center',
    'upper-third': 'top-center',
    'right-third': 'middle-right',
    'left-third': 'middle-left',
  };
  const candidate = aliases[normalized] ?? normalized;
  return isPlacementRegion(candidate) ? candidate : undefined;
}

function regionConflictsWithBox(
  candidate: PlacementRegion,
  box: PlacementHints['avoid'][number],
  overlapThreshold = 0.18,
): boolean {
  if (candidate === 'full-frame' || box.region === 'full-frame') return true;
  const candidateRect = regionRect(candidate);
  const boxRect = typeof box.x === 'number'
    && typeof box.y === 'number'
    && typeof box.width === 'number'
    && typeof box.height === 'number'
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : regionRect(box.region);
  const overlap = intersectionArea(candidateRect, boxRect);
  if (overlap <= 0) return false;
  const candidateArea = Math.max(0.0001, candidateRect.width * candidateRect.height);
  const boxArea = Math.max(0.0001, boxRect.width * boxRect.height);
  const overlapPressure = Math.max(overlap / candidateArea, overlap / boxArea);
  return overlapPressure >= overlapThreshold;
}

function regionRect(region: PlacementRegion): { x: number; y: number; width: number; height: number } {
  if (region === 'full-frame') return { x: 0, y: 0, width: 1, height: 1 };
  const [vertical, horizontal] = region.split('-');
  const x = horizontal === 'left' ? 0.06 : horizontal === 'right' ? 0.66 : 0.28;
  const width = horizontal === 'center' ? 0.44 : 0.28;
  const y = vertical === 'top' ? 0.06 : vertical === 'bottom' ? 0.68 : 0.28;
  const height = vertical === 'middle' ? 0.44 : 0.26;
  return { x, y, width, height };
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function isPlacementRegion(value: string): value is PlacementRegion {
  return [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'full-frame',
  ].includes(value);
}

function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

function clampRange(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
