/**
 * Storage quota — per-owner storage limits tied to subscription plans.
 *
 * OWNER = the org if the user is in one (Clerk `orgId`), else the individual user.
 * Both have a quota; the solo/free default is deliberately tiny (upgrade pressure).
 *
 * DESIGN: this is the enforcement + usage-tracking INFRA. The per-plan limit NUMBERS ideally live
 * in the existing plan `serviceLimits` system (User.getServiceLimitUsage / plans.serviceLimits) —
 * that is the credits-session domain. So `getStorageLimitBytes` PREFERS `plan.serviceLimits.storage`
 * when present, and falls back to the placeholder table below until the credits session adds it.
 * Usage is tracked in a dedicated `storage_usage` counter (owner-keyed) so we don't have to sum
 * every asset across org members on each upload, and so we don't modify the credits/User schema.
 *
 * ⚠️ STORAGE_QUOTA_PLACEHOLDER_BYTES numbers are INVENTED placeholders — the credits session owns
 * the real per-plan GB values (finance sources in docs/agents/.../Credits-System-Resource-DoS-Handoff).
 */

import { getDatabase } from '@/lib/editron/db/mongodb';

const STORAGE_USAGE_COLLECTION = 'storage_usage';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/** Placeholder per-plan storage limits in BYTES. Keyed by lower-cased plan `type`. */
const STORAGE_QUOTA_PLACEHOLDER_BYTES: Record<string, number> = {
  free: 500 * MB, // solo / free — "as low as hell"
  plus: 10 * GB,
  pro: 50 * GB,
  premium: 200 * GB,
};
const DEFAULT_PLAN = 'free';

export interface StorageOwner {
  id: string;
  type: 'org' | 'user';
}

/** Org-first, user-fallback. All members of an org share the org's storage pool. */
export function resolveStorageOwner(userId: string, orgId?: string | null): StorageOwner {
  return orgId ? { id: orgId, type: 'org' } : { id: userId, type: 'user' };
}

/**
 * The owner's storage limit (bytes). Prefers an explicit `serviceLimits.storage` from the plan
 * (credits-session-owned); falls back to the placeholder table by plan type. Never throws.
 */
export async function getStorageLimitBytes(userId: string): Promise<number> {
  try {
    const { getUserPlanWithServiceLimits } = await import('@/lib/services/planService');
    const plan: any = await getUserPlanWithServiceLimits(userId);
    const fromLimits =
      plan?.serviceLimits?.storage?.bytes ??
      plan?.serviceLimits?.storage?.limitBytes ??
      plan?.serviceLimits?.storage?.limit;
    if (typeof fromLimits === 'number' && fromLimits > 0) return fromLimits;
    const type = String(plan?.type ?? plan?.planType ?? DEFAULT_PLAN).toLowerCase();
    return STORAGE_QUOTA_PLACEHOLDER_BYTES[type] ?? STORAGE_QUOTA_PLACEHOLDER_BYTES[DEFAULT_PLAN];
  } catch {
    // No plan / lookup failure -> the low free default (fail closed to the smallest quota).
    return STORAGE_QUOTA_PLACEHOLDER_BYTES[DEFAULT_PLAN];
  }
}

/** Current used bytes for an owner (0 if no counter yet). */
export async function getStorageUsedBytes(owner: StorageOwner): Promise<number> {
  const db = await getDatabase();
  const doc = await db.collection(STORAGE_USAGE_COLLECTION).findOne({ ownerId: owner.id });
  return typeof (doc as any)?.usedBytes === 'number' ? (doc as any).usedBytes : 0;
}

export interface StorageQuotaCheck {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  addBytes: number;
}

/**
 * Check whether `addBytes` more would fit under the owner's quota. Call this at the upload boundary
 * BEFORE accepting/storing the file. Returns the numbers so callers can build a clear 413 message.
 */
export async function checkStorageQuota(
  userId: string,
  orgId: string | null | undefined,
  addBytes: number,
): Promise<StorageQuotaCheck> {
  const owner = resolveStorageOwner(userId, orgId);
  const [usedBytes, limitBytes] = await Promise.all([
    getStorageUsedBytes(owner),
    getStorageLimitBytes(userId),
  ]);
  const add = Math.max(0, addBytes || 0);
  return {
    allowed: usedBytes + add <= limitBytes,
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    addBytes: add,
  };
}

/**
 * Adjust the owner's used-bytes counter. Positive delta on upload/store, negative on delete.
 * FAIL-SOFT: never throws — a counter miss must not break an upload/delete.
 */
export async function recordStorageUsage(owner: StorageOwner, deltaBytes: number): Promise<void> {
  if (!deltaBytes) return;
  try {
    const db = await getDatabase();
    await db.collection(STORAGE_USAGE_COLLECTION).updateOne(
      { ownerId: owner.id },
      {
        $inc: { usedBytes: deltaBytes },
        $set: { ownerType: owner.type, updatedAt: new Date() },
        $setOnInsert: { ownerId: owner.id },
      },
      { upsert: true },
    );
  } catch (err: any) {
    console.warn(`[StorageQuota] usage record failed (non-fatal): ${err?.message ?? err}`);
  }
}

export function formatStorageBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes % GB === 0 ? 0 : 1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
