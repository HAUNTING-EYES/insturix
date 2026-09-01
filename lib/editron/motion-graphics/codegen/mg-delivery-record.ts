/**
 * Phase 8 (brief §6.8/§16.2): per-moment MG DELIVERY RECORD + stale-guard.
 *
 * For every approved/enqueued MG moment we keep a durable record so a lapsed/stale worker delivery can never
 * silently mutate a project (idempotency + stale plan/taste guard). The record consolidates WITH the existing
 * `intelligence.mgCodegenRun.outcomes/asyncOutcomes` ledger (no second job
 * system). The EDL producer returns records to ProjectService for atomic
 * persistence with the durable MG-design completion.
 */
import { z } from 'zod';

export const mgDeliveryStatusSchema = z.enum([
  'planned', 'declined', 'unavailable', 'enqueued', 'running', 'rendered', 'judged',
  'needs_revision', 'accepted_clean', 'accepted_watchlist', 'rejected', 'failed', 'timed_out',
  'delivered', 'missing_at_render',
]);
export type MGDeliveryStatus = z.infer<typeof mgDeliveryStatusSchema>;

export const mgDeliveryRecordSchema = z.object({
  videoId: z.string().min(1),
  momentId: z.string().min(1),
  jobId: z.string().optional(),
  designPlanId: z.string().optional(),
  tasteContractId: z.string().optional(),
  tasteContractHash: z.string().optional(),
  status: mgDeliveryStatusSchema,
  attempt: z.number().int().nonnegative(),
  expectedTimelineRange: z.unknown().optional(),
  renderedArtifactId: z.string().optional(),
  judgeResultId: z.string().optional(),
  enqueuedAt: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  idempotencyKey: z.string().min(1),
}).strict();
export type MGDeliveryRecord = z.infer<typeof mgDeliveryRecordSchema>;

export function computeDeliveryRecord(
  input: Pick<MGDeliveryRecord, 'videoId' | 'momentId' | 'status' | 'attempt' | 'idempotencyKey'> &
    Partial<Omit<MGDeliveryRecord, 'videoId' | 'momentId' | 'status' | 'attempt' | 'idempotencyKey'>>,
  opts: { now?: string } = {},
): MGDeliveryRecord {
  return { ...input, enqueuedAt: opts.now ?? new Date().toISOString() };
}

/**
 * §16.2 stale-guard: a worker delivery must not land if the PROJECT has since moved to a newer plan/taste
 * contract than the delivery was built for. Pure + testable; the worker applies it before writing the overlay.
 */
export function deliveryStaleGuard(
  record: Pick<MGDeliveryRecord, 'designPlanId' | 'tasteContractHash'> | null | undefined,
  current: { designPlanId?: string; tasteContractHash?: string },
): { ok: true } | { ok: false; reason: string } {
  if (!record) return { ok: false, reason: 'no delivery record for this job (cannot verify freshness)' };
  if (record.designPlanId && current.designPlanId && record.designPlanId !== current.designPlanId) {
    return { ok: false, reason: `stale delivery: built for plan ${record.designPlanId}, project now on ${current.designPlanId}` };
  }
  if (record.tasteContractHash && current.tasteContractHash && record.tasteContractHash !== current.tasteContractHash) {
    return { ok: false, reason: 'stale delivery: taste contract hash changed since enqueue' };
  }
  return { ok: true };
}
