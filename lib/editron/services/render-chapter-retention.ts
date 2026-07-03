/**
 * Plan-based retention for render-chapter intermediates.
 *
 * A long render is split into "chapters" and each render produces a transient job doc in
 * `editron_render_chapters`. Those are disposable once the final concatenated video is in S3, so we
 * auto-expire them — but per PLAN, not a blanket rule: base 7 days / mid 30 / top 90.
 *
 * A plain MongoDB TTL index is a single fixed `expireAfterSeconds` for the whole collection, which
 * can't vary by plan. So we stamp a per-doc `expiresAt = createdAt + plan's days` and use a TTL index
 * on `expiresAt` with `expireAfterSeconds: 0` — MongoDB then deletes each doc at its own date.
 *
 * NOTE: the day values below are the founder's stated tiers; they should ultimately live in the plan
 * `serviceLimits` config (credits session), same as the storage GB numbers.
 */

const RETENTION_DAYS_BY_PLAN: Record<string, number> = {
  free: 7, base: 7,
  plus: 30, mid: 30,
  pro: 90, premium: 90, top: 90,
};

/** Smallest tier — used when the plan is unknown/missing (fail to the least generous retention). */
export const BASE_RENDER_CHAPTER_RETENTION_DAYS = 7;

/** Retention window in days for a given plan tier. Case-insensitive; unknown/missing → base (7d). */
export function renderChapterRetentionDays(planType?: string | null): number {
  const key = planType?.trim().toLowerCase();
  return (key && RETENTION_DAYS_BY_PLAN[key]) || BASE_RENDER_CHAPTER_RETENTION_DAYS;
}

/** The date a render-chapter job should auto-expire, given when it was created and the owner's plan. */
export function renderChapterExpiresAt(createdAt: Date, planType?: string | null): Date {
  return new Date(createdAt.getTime() + renderChapterRetentionDays(planType) * 24 * 60 * 60 * 1000);
}
