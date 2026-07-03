/**
 * Per-plan resource limits — the single source of truth for non-credit plan
 * entitlements (storage capacity + render-chapter retention).
 *
 * WHY THIS EXISTS: storage-quota-service and render-chapter-retention each had
 * their OWN per-plan map keyed on legacy names (free/plus/pro/premium), so the
 * live agency plans silently fell through to the base tier. Centralizing here —
 * with the same normalizer credits use — means one place to change, and adding a
 * new plan updates every entitlement at once.
 *
 * Credit/media allocations live in creditCosts.ts (that is the billing domain);
 * this file is the non-credit resource caps.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;
const TB = 1024 * GB;

export interface PlanLimits {
  /** Included storage capacity in BYTES (before any purchased add-on). */
  storageBytes: number;
  /** Render-chapter intermediate retention window, in days. */
  retentionDays: number;
}

/** Founder-set tiers (2026-07-03): storage 1GB/10GB/1TB · retention 7/30/90d. */
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { storageBytes: 500 * MB, retentionDays: 7 },
  agency_starter: { storageBytes: 1 * GB, retentionDays: 7 },
  agency_growth: { storageBytes: 10 * GB, retentionDays: 30 },
  agency_scale: { storageBytes: 1 * TB, retentionDays: 90 },
  // Legacy plan aliases (retired public plans) mapped onto the closest tier.
  plus: { storageBytes: 1 * GB, retentionDays: 30 },
  pro: { storageBytes: 10 * GB, retentionDays: 90 },
  premium: { storageBytes: 1 * TB, retentionDays: 90 },
  // Generic tier aliases (some callers pass base/mid/top).
  base: { storageBytes: 1 * GB, retentionDays: 7 },
  mid: { storageBytes: 10 * GB, retentionDays: 30 },
  top: { storageBytes: 1 * TB, retentionDays: 90 },
};

/** Smallest tier — used when a plan is unknown/missing (fail to least generous). */
export const DEFAULT_PLAN_LIMITS: PlanLimits = PLAN_LIMITS.free;

/**
 * Normalize a plan identifier to a PLAN_LIMITS key. Accepts a plan `type`
 * ("agency_scale") OR a display `name` ("Agency Scale Plan") — same normalizer
 * the credit allocations use (lower-case, strip trailing " plan", spaces → "_").
 */
export function normalizePlanKey(plan?: string | null): string {
  return (plan ?? '')
    .toLowerCase()
    .replace(/\s+plan$/, '')
    .trim()
    .replace(/\s+/g, '_');
}

/** Full limits for a plan. Unknown/missing → the free (smallest) tier. */
export function getPlanLimitsFor(plan?: string | null): PlanLimits {
  return PLAN_LIMITS[normalizePlanKey(plan)] ?? DEFAULT_PLAN_LIMITS;
}

/** Included storage capacity (bytes) for a plan. Unknown/missing → free tier. */
export function getPlanStorageBytes(plan?: string | null): number {
  return getPlanLimitsFor(plan).storageBytes;
}

/** Render-chapter retention window (days) for a plan. Unknown/missing → free tier. */
export function getPlanRetentionDays(plan?: string | null): number {
  return getPlanLimitsFor(plan).retentionDays;
}
