import { MAX_CAMPAIGN_POSTS_PER_WEEK } from "./campaign-cadence";

/**
 * Shared cadence-rule normalizers, used by both the live CadenceEditor and the CalOS v3
 * cadence modal so the two edit UIs validate identically (single source of truth).
 */

/** Clamp posts-per-week to the campaign cadence bounds [0, MAX]. */
export function clampPerWeek(value: number): number {
  return Math.max(0, Math.min(MAX_CAMPAIGN_POSTS_PER_WEEK, Number.isFinite(value) ? Math.floor(value) : 0));
}

/** Dedupe + sort preferred weekdays (0=Sun..6=Sat), dropping out-of-range values. */
export function normalizePreferredDays(days: number[]): number[] {
  return [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}
