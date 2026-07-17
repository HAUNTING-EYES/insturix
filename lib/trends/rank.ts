/**
 * Insturix Trends — ranking engine (Master v1.1 §7.4).
 *
 *   rankScore = trackerScore × demandBoost × recencyDecay
 *
 *     trackerScore ∈ [0,1]  — provider popularity, normalized by the caller (views/rank/score).
 *     demandBoost  = 1 + demandCount / demandThreshold
 *                    (FLOOR of 1: a brand-new viral trend with 0 user requests must NOT be zeroed —
 *                     tracker + recency still carry it. Demand is a BOOST, not a kill-switch.)
 *     recencyDecay = 0.5 ^ (ageDays / halfLifeDays)   — half-life form; ageDays=halfLife ⇒ ×0.5.
 *
 * Trends age out as rank decays: rankTrends() drops anything older than maxAgeDays.
 *
 * Pure + deterministic: `now` is injected (no Date here), so results are reproducible and testable.
 * This is distinct from lib/calos/trends (which surfaces trend TOPICS for the planner) — this ranks
 * exemplar-bearing trend candidates for the Insturix Trends / TrendSpec pipeline.
 */

export interface TrendRankInput {
  /** Provider popularity normalized to [0,1]. */
  trackerScore: number;
  /** Count of user requests for this trend (the demand signal). */
  demandCount: number;
  /** Age of the trend in days (>= 0; clamped defensively). */
  ageDays: number;
}

export interface RankOptions {
  /** Requests at which demand doubles the rank. 100 ← doc §7.4 ("≥100 user requests"). Dynamic. */
  demandThreshold?: number;
  /** Days for rank to halve. ⚠️ INVENTED default — calibration knob (cron cadence is 3-4 days). */
  halfLifeDays?: number;
  /** Trends older than this are aged out by rankTrends(). ⚠️ INVENTED default — calibration knob. */
  maxAgeDays?: number;
}

const DEFAULTS: Required<RankOptions> = {
  demandThreshold: 100, // doc §7.4
  halfLifeDays: 7, // ⚠️ INVENTED — calibrate
  maxAgeDays: 30, // ⚠️ INVENTED — calibrate
};

const MS_PER_DAY = 86_400_000;

/** rankScore = trackerScore × (1 + demand/threshold) × 0.5^(age/halfLife). Throws on invalid config. */
export function computeTrendRank(input: TrendRankInput, options: RankOptions = {}): number {
  const demandThreshold = options.demandThreshold ?? DEFAULTS.demandThreshold;
  const halfLifeDays = options.halfLifeDays ?? DEFAULTS.halfLifeDays;
  if (demandThreshold <= 0) throw new Error('[trends/rank] demandThreshold must be > 0');
  if (halfLifeDays <= 0) throw new Error('[trends/rank] halfLifeDays must be > 0');

  const demandCount = Math.max(0, input.demandCount);
  const ageDays = Math.max(0, input.ageDays); // clamp clock skew / future timestamps

  const demandBoost = 1 + demandCount / demandThreshold;
  const recencyDecay = Math.pow(0.5, ageDays / halfLifeDays);
  return input.trackerScore * demandBoost * recencyDecay;
}

export interface RankableTrend {
  trackerScore: number;
  demandCount: number;
  /** Epoch ms when the trend was fetched. */
  fetchedAtMs: number;
}

export type RankedTrend<T> = T & { rankScore: number; ageDays: number };

/**
 * Rank a set of trends at a given moment: compute ageDays from `nowMs`, drop aged-out trends
 * (ageDays > maxAgeDays), and sort by rankScore descending.
 */
export function rankTrends<T extends RankableTrend>(
  trends: T[],
  nowMs: number,
  options: RankOptions = {},
): RankedTrend<T>[] {
  const maxAgeDays = options.maxAgeDays ?? DEFAULTS.maxAgeDays;
  return trends
    .map((trend) => {
      const ageDays = Math.max(0, (nowMs - trend.fetchedAtMs) / MS_PER_DAY);
      const rankScore = computeTrendRank(
        { trackerScore: trend.trackerScore, demandCount: trend.demandCount, ageDays },
        options,
      );
      return { ...trend, rankScore, ageDays };
    })
    .filter((trend) => trend.ageDays <= maxAgeDays)
    .sort((a, b) => b.rankScore - a.rankScore);
}
