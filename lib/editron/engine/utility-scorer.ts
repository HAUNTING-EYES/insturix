import type {
  OverlayDefinition,
  SignalSnapshot,
  ScoringResult,
  ConsiderationScore,
  GridPointDecision,
  OverlayCategory,
  ScoringMethod,
} from './utility-types';
import { CATEGORY_CONSTRAINTS } from './utility-types';
import { evaluateCurve } from './response-curves';

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

  return {
    overlayId: def.id,
    category: def.category,
    rank: def.rank,
    totalScore,
    considerationScores: validConsiderations,
    outputValues: resolveOutputValues(def, totalScore),
  };
}

export function scoreAllOverlays(
  definitions: OverlayDefinition[],
  signals: SignalSnapshot,
  method: ScoringMethod = 'multiplicative',
): ScoringResult[] {
  const results: ScoringResult[] = [];
  for (const def of definitions) {
    const result = scoreOverlay(def, signals, method);
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
): GridPointDecision {
  const allScores = scoreAllOverlays(definitions, signals, method);
  const winners = selectWinners(allScores, recentDecisions, frame);
  return { frame, timestampMs, winners, allScores };
}
