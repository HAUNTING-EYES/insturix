/**
 * Phase 6 (brief §13): ACCEPTANCE POLICY — explicit states + watchlist + calibration gating.
 *
 * Legacy behavior is one gate (score ≥ 7.5 → generate, else revise → fallback). Phase 6 adds:
 *   - classifyAcceptance: clean | watchlist | reject from {cleanThreshold, watchlistFloor}
 *   - resolveWatchlistPolicy: watchlist SHIPPING is hard-gated on a calibration version (§13.4/§20) — turning on
 *     MG_WATCHLIST_SHIP_ENABLED without MG_JUDGE_CALIBRATION_VERSION is an unsafe combo that FAILS CLOSED.
 *   - The 6.5 watchlist floor is ⚠ INVENTED staging only (brief §13.4: allow it only as an explicitly
 *     uncalibrated staging config; production values come from a labeled threshold sweep — Phase 9).
 *
 * Hard-failure safety is inherent: any hard failure caps score ≤4 (parseJudgeResponse), below the watchlist floor —
 * so the watchlist band can never admit a fabrication/hard-failure render.
 */
import { z } from 'zod';

/** Versioned calibration record (§13.4) — every threshold version must point at an eval run + dataset hash. */
export const mgJudgeCalibrationSchema = z.object({
  version: z.string().min(1),
  cleanThreshold: z.number().min(0).max(10),
  watchlistFloor: z.number().min(0).max(10),
  dimensionRules: z.record(z.string(), z.unknown()).default({}),
  sourceEvalRunId: z.string().min(1),
  datasetHash: z.string().min(1),
  createdAt: z.string().datetime(),
}).strict();
export type MgJudgeCalibration = z.infer<typeof mgJudgeCalibrationSchema>;

export type AcceptanceDecision = 'clean' | 'watchlist' | 'reject';

/** Legacy clean bar — retained as the default until a calibration record replaces it (§13.4). */
export const DEFAULT_CLEAN_THRESHOLD = 7.5;
/** ⚠ INVENTED staging watchlist floor — NOT a production value (brief §13.4; Phase 9 sweeps it). */
export const STAGING_WATCHLIST_FLOOR = 6.5;

export function classifyAcceptance(
  score: number,
  cleanThreshold: number = DEFAULT_CLEAN_THRESHOLD,
  watchlistFloor: number = STAGING_WATCHLIST_FLOOR,
): AcceptanceDecision {
  if (score >= cleanThreshold) return 'clean';
  if (score >= watchlistFloor) return 'watchlist';
  return 'reject';
}

export interface WatchlistPolicy {
  floor: number;
  shipEnabled: boolean;
  reason: string;
}

/** §13.4/§20 unsafe-combination guard: watchlist SHIPPING requires a calibration version. Fails closed. */
export function resolveWatchlistPolicy(env: NodeJS.ProcessEnv = process.env): WatchlistPolicy {
  const ship = ['1', 'true', 'yes'].includes((env.MG_WATCHLIST_SHIP_ENABLED ?? '').trim().toLowerCase());
  const calVersion = (env.MG_JUDGE_CALIBRATION_VERSION ?? '').trim();
  if (ship && !calVersion) {
    return {
      floor: STAGING_WATCHLIST_FLOOR,
      shipEnabled: false,
      reason: 'watchlist shipping requires MG_JUDGE_CALIBRATION_VERSION (unsafe combination rejected — §13.4/§20)',
    };
  }
  const raw = Number(env.MG_WATCHLIST_FLOOR ?? Number.NaN);
  const floor = Number.isFinite(raw) && raw > 0 && raw < 10 ? raw : STAGING_WATCHLIST_FLOOR;
  return {
    floor,
    shipEnabled: ship,
    reason: ship ? `watchlist shipping enabled under calibration ${calVersion}` : 'watchlist shipping disabled (no calibration)',
  };
}
