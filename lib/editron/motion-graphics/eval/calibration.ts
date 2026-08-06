/**
 * Phase 9 (brief §13.4/§18.5-§18.8): the CALIBRATION RUNNER.
 *
 * Replays the labeled dataset through the real production parser (threshold sweep), then — ONLY if the set is
 * calibration-ready — produces a versioned MgJudgeCalibration (cleanThreshold, watchlistFloor) tied to an eval
 * run id + dataset hash. Never derives thresholds from an unlabeled/vibes set.
 */
import {
  mgJudgeCalibrationSchema,
  type MgJudgeCalibration,
} from '../codegen/acceptance';
import {
  runThresholdSweep,
  type LabeledJudgeItem,
  type SweepReport,
} from '../codegen/mg-threshold-sweep';
import { isCalibrationReady, type EvalItem } from './eval-dataset';

export interface CalibrationRun {
  sweep: SweepReport;
  artifact: MgJudgeCalibration | null;
  reasons: string[];
  chosen: { cleanThreshold: number; watchlistFloor: number } | null;
}

/** EvalItem → the sweep's labeled judge item (real parser replay incl. Fix-2 geometry when present). */
export function toSweepItems(items: EvalItem[]): LabeledJudgeItem[] {
  return items.map((item) => ({
    id: item.id,
    judge: item.judge,
    geometry: item.geometry
      ? {
          subject: item.subjectBox ?? null,
          coveredPct: item.geometry.coveredPct ?? 0,
          coverageByPhase: item.geometry.coverageByPhase ?? [],
          alphaWeightedCoverage: 0,
          hardVetoEligible: item.geometry.hardVetoEligible ?? false,
          hardVeto: item.geometry.hardVeto ?? false,
          captionRects: [],
          bboxPct: null,
        }
      : null,
    human: item.human?.accept ?? 'reject',
  }));
}

/**
 * Run calibration. Produces an artifact only when the set is ready; otherwise returns `artifact: null` + why.
 * Threshold choice: among candidate (clean, floor) configs, prefer the ones with ZERO false-rejects of
 * human-accepted renders, then highest hard-F1, then the stricter clean threshold.
 */
export function runCalibration(
  items: EvalItem[],
  opts: { datasetHash: string; runId: string; now?: string },
): CalibrationRun {
  const ready = isCalibrationReady(items);
  const sweep = runThresholdSweep(toSweepItems(items));
  if (!ready.ok) {
    return { sweep, artifact: null, reasons: [ready.reason ?? 'dataset not ready'], chosen: null };
  }

  const candidates: Array<{ cleanThreshold: number; watchlistFloor: number; hardF1: number; falseReject: number }> = [];
  for (const c of sweep.byClean) {
    for (const m of c.metrics) {
      candidates.push({ cleanThreshold: c.cleanThreshold, watchlistFloor: m.watchlistFloor, hardF1: m.hardF1, falseReject: m.falseRejectOnHumanAccept });
    }
  }
  const zeroReject = candidates.filter((c) => c.falseReject === 0);
  const pool = zeroReject.length > 0 ? zeroReject : candidates;
  const best = pool
    .slice()
    .sort((a, b) => b.hardF1 - a.hardF1 || b.cleanThreshold - a.cleanThreshold)[0];

  const artifact = mgJudgeCalibrationSchema.parse({
    version: `cal-${opts.runId.slice(0, 8)}`,
    cleanThreshold: best.cleanThreshold,
    watchlistFloor: best.watchlistFloor,
    sourceEvalRunId: opts.runId,
    datasetHash: opts.datasetHash,
    createdAt: opts.now ?? new Date().toISOString(),
  });

  return {
    sweep,
    artifact,
    reasons: [
      `calibrated from ${ready.labeled} labeled items (dataset ${opts.datasetHash.slice(0, 12)})`,
      zeroReject.length === 0 ? '⚠ no config had zero false-rejects — choose with care' : 'zero false-reject of human-accepted renders achieved',
    ],
    chosen: { cleanThreshold: best.cleanThreshold, watchlistFloor: best.watchlistFloor },
  };
}
