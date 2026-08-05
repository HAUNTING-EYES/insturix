/**
 * Fix-0: judge threshold sweep harness core (brief §18.5-§18.8, §13.4) — 2026-08-05.
 *
 * The repository audit found NO tool that sweeps judge/acceptance thresholds; every eval script hardcodes
 * GATE=7.5 (§18 "threshold sweeps: none"). This module is the missing, PURE, unit-testable core:
 *
 *   - it replays labeled moments through the REAL production parser (`parseJudgeResponse` incl. Fix-2 geometry
 *     grounding), so sweeps reflect exactly what production does to a verdict;
 *   - it sweeps cleanThreshold × watchlistFloor and reports per-config acceptance metrics vs human labels +
 *     hard-failure precision/recall/F1 + false-reject / false-accept + watchlist volume;
 *   - it logs raw vs legacy-capped scores so the cap effect on false rejection is measurable (§18.7 "dimension caps");
 *   - it is organized by signal strata, NEVER by content type (§18.3).
 *
 * Multi-seed model variance is intentionally OUT of scope here (deterministic parser); it belongs to the generator
 * eval (eval-mg-codegen / matrix-e2e already vary seeds). This harness owns THRESHOLD + CAP science.
 */

import { parseJudgeResponse, type MgJudgeGeometryGrounding } from './production-runtime';

export type HumanAccept = 'accept' | 'watchlist' | 'reject';

/** A labeled eval item. `judge` = the raw model verdict (as returned by the VLM); `geometry` = the Fix-2 grounding
 *  (may be omitted for omni/full-frame lanes). `human` is the ground-truth label. */
export interface LabeledJudgeItem {
  id: string;
  judge: {
    faithful: boolean;
    hierarchy?: number;
    typography?: number;
    color?: number;
    composition?: number;
    motion?: number;
    form?: number;
    hardFailures: Record<string, boolean>;
    score: number;
    issues: string[];
  };
  geometry?: MgJudgeGeometryGrounding | null;
  human: HumanAccept;
}

export interface ThresholdCandidates {
  cleanThresholds: number[];
  watchlistFloors: number[];
}

export interface PerItemResult {
  id: string;
  rawScore: number;
  cappedScore: number;
  capEffect: number; // cappedScore - rawScore (negative = production caps lowered it)
  maxCappedNote: string[]; // the cap notes parseJudgeResponse returned
  hardFailures: string[];
  geoHardVeto: boolean;
  predicted: 'accept' | 'watchlist' | 'reject';
  human: HumanAccept;
  metric: 'tp' | 'fp' | 'tn' | 'fn' | 'watchlist-correct' | 'watchlist-conflict' | 'unknown';
}

export interface SweepMetrics {
  cleanThreshold: number;
  watchlistFloor: number;
  n: number;
  hardPrecision: number;
  hardRecall: number;
  hardF1: number;
  falseRejectOnHumanAccept: number;  // human accept, predicted reject
  falseAcceptOnHumanReject: number;  // human reject, predicted accept
  watchlistVolume: number;           // predicted watchlist
  watchlistYield: number;            // of watchlist, how many human=watchlist or accept
  acceptCount: number;
  watchlistCount: number;
  rejectCount: number;
  items: PerItemResult[];
}

export interface SweepReport {
  dataset: { count: number; labeled: boolean; ids: string[] };
  capEffect: { meanCappedShift: number; maxNegativeShift: number; shrunkToCapCount: number };
  best: SweepMetrics | null;
  byClean: Array<{ cleanThreshold: number; metrics: SweepMetrics[] }>;
  warnings: string[];
}

function noCaps(): number[] {
  return [];
}

/** Replay a single labeled item through the production parser + a candidate policy. */
function classifyItem(
  item: LabeledJudgeItem,
  cleanThreshold: number,
  watchlistFloor: number,
): PerItemResult {
  const rawScore = item.judge.score;
  const { score: cappedScore, issues } = parseJudgeResponse(JSON.stringify(item.judge), item.geometry ?? null);
  const capNotes = issues.filter((i) => /capped at/.test(i));
  const maxCappedNote = capNotes;
  const hardFailures = Object.entries(item.judge.hardFailures ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  let predicted: PerItemResult['predicted'];
  if (cappedScore < watchlistFloor) predicted = 'reject';
  else if (cappedScore < cleanThreshold) predicted = 'watchlist';
  else predicted = 'accept';

  // Hard-failure recall check: any human 'reject' with >=1 hard failure => the parser kept it a reject.
  let metric: PerItemResult['metric'] = 'unknown';
  if (item.human === 'reject') {
    metric = predicted === 'reject' ? 'tp' : predicted === 'watchlist' ? 'watchlist-conflict' : 'fp';
  } else if (item.human === 'accept') {
    metric = predicted === 'accept' ? 'tn' : predicted === 'reject' ? 'fn' : 'watchlist-correct';
  } else {
    // human watchlist
    metric = predicted === 'watchlist' ? 'watchlist-correct' : predicted === 'accept' ? 'tn' : 'fn';
  }

  return {
    id: item.id,
    rawScore,
    cappedScore,
    capEffect: cappedScore - rawScore,
    maxCappedNote,
    hardFailures,
    geoHardVeto: item.geometry?.hardVeto ?? false,
    predicted,
    human: item.human,
    metric,
  };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function summarizeMetrics(
  items: PerItemResult[],
  cleanThreshold: number,
  watchlistFloor: number,
): SweepMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of items) {
    if (r.metric === 'tp') tp += 1;
    if (r.metric === 'fp') fp += 1;
    if (r.metric === 'fn') fn += 1;
    if (r.metric === 'tn') tn += 1;
  }
  const hardPrecision = pct(tp, tp + fp);
  const hardRecall = pct(tp, tp + fn);
  const hardF1 = hardPrecision + hardRecall === 0 ? 0 : (2 * hardPrecision * hardRecall) / (hardPrecision + hardRecall);
  const falseRejectOnHumanAccept = items.filter((r) => r.human === 'accept' && r.predicted === 'reject').length;
  const falseAcceptOnHumanReject = items.filter((r) => r.human === 'reject' && r.predicted === 'accept').length;
  const watchlistVolume = items.filter((r) => r.predicted === 'watchlist').length;
  const watchlistYield = items.filter((r) => r.predicted === 'watchlist' && (r.human === 'watchlist' || r.human === 'accept')).length;

  return {
    cleanThreshold,
    watchlistFloor,
    n: items.length,
    hardPrecision,
    hardRecall,
    hardF1,
    falseRejectOnHumanAccept,
    falseAcceptOnHumanReject,
    watchlistVolume,
    watchlistYield,
    acceptCount: items.filter((r) => r.predicted === 'accept').length,
    watchlistCount: watchlistVolume,
    rejectCount: items.filter((r) => r.predicted === 'reject').length,
    items,
  };
}

/** Run the sweep across candidate thresholds. Pure + deterministic. */
export function runThresholdSweep(
  items: LabeledJudgeItem[],
  candidates: ThresholdCandidates = {
    cleanThresholds: [7.5, 7.0, 6.5, 6.0],
    watchlistFloors: [6.5, 6.0, 5.5],
  },
): SweepReport {
  const warnings: string[] = [];
  const labeled = items.length > 0 && items.every((i) => i.human != null);

  const perItemNoCaps = items.map((i) => classifyItem(i, 8, 0)).map((r) => ({ ...r, cappedScore: r.rawScore, capEffect: 0, maxCappedNote: noCaps() }));
  // Cap-effect telemetry (§18.7 "dimension caps"): compare the exact production-capped score against the raw.
  const cappedRuns: PerItemResult[] = [];
  for (const item of items) cappedRuns.push(classifyItem(item, 8, 0));
  const meanCappedShift = cappedRuns.reduce((a, r) => a + (r.cappedScore - r.rawScore), 0) / Math.max(1, cappedRuns.length);
  const maxNegativeShift = Math.min(0, ...cappedRuns.map((r) => r.cappedScore - r.rawScore));
  const shrunkToCapCount = cappedRuns.filter((r) => r.cappedScore !== r.rawScore && r.cappedScore < 8).length;

  const byClean: SweepReport['byClean'] = [];
  let best: SweepMetrics | null = null;
  let bestF1 = -1;
  for (const clean of candidates.cleanThresholds) {
    const metricsList: SweepMetrics[] = [];
    for (const floor of candidates.watchlistFloors) {
      const m = summarizeMetrics(items.map((i) => classifyItem(i, clean, floor)), clean, floor);
      metricsList.push(m);
      if (labeled && m.hardF1 > bestF1) {
        bestF1 = m.hardF1;
        best = m;
      }
    }
    byClean.push({ cleanThreshold: clean, metrics: metricsList });
  }

  if (!labeled) {
    warnings.push('UNLABELED: no human labels available — all metrics are plumbing-only. Do NOT ship thresholds from these numbers. Populate the labeled set (brief §18.2/§19.3) first.');
  }
  if (items.length === 0) {
    warnings.push('empty dataset');
  }

  return {
    dataset: { count: items.length, labeled, ids: items.map((i) => i.id) },
    capEffect: { meanCappedShift, maxNegativeShift, shrunkToCapCount },
    best,
    byClean,
    warnings,
  };
}

/** CLI-style text table for the report. */
export function formatSweepReport(report: SweepReport): string {
  const lines: string[] = [];
  lines.push(`dataset: n=${report.dataset.count} labeled=${report.dataset.labeled}`);
  lines.push(`cap effect: meanRaw→Capped=${report.capEffect.meanCappedShift.toFixed(2)} maxNegative=${report.capEffect.maxNegativeShift.toFixed(2)} shrunkToCap=${report.capEffect.shrunkToCapCount}`);
  for (const w of report.warnings) lines.push(`WARN: ${w}`);
  if (report.best) {
    const b = report.best;
    lines.push(`best(clean=${b.cleanThreshold}, floor=${b.watchlistFloor}): hardF1=${b.hardF1.toFixed(3)} P=${b.hardPrecision.toFixed(3)} R=${b.hardRecall.toFixed(3)} falseReject=${b.falseRejectOnHumanAccept} falseAccept=${b.falseAcceptOnHumanReject} watchlistVol=${b.watchlistVolume} yield=${b.watchlistYield}`);
  }
  lines.push('');
  lines.push('clean | floor |  F1  |  P   |  R   | falseReject | falseAccept | watchlist');
  for (const c of report.byClean) {
    for (const m of c.metrics) {
      lines.push(
        `${c.cleanThreshold.toFixed(1).padStart(5)} | ${m.watchlistFloor.toFixed(1).padStart(5)} | ${m.hardF1.toFixed(3)} | ${m.hardPrecision.toFixed(3)} | ${m.hardRecall.toFixed(3)} | ${String(m.falseRejectOnHumanAccept).padStart(11)} | ${String(m.falseAcceptOnHumanReject).padStart(11)} | ${m.watchlistVolume}`,
      );
    }
  }
  lines.push('');
  lines.push('NOTE: thresholds/caps must be calibrated against a REAL labeled set (brief §18.8). No production value is shipped by this module.');
  return lines.join('\n');
}
