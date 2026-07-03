/**
 * Storage quota — per-owner storage limits tied to subscription plans.
 *
 * OWNER = the org if the user is in one (Clerk `orgId`), else the individual user.
 * Both have a quota; the solo/free default is deliberately tiny (upgrade pressure).
 *
 * DESIGN: this is the enforcement + usage-tracking INFRA. `getStorageLimitBytes` PREFERS an explicit
 * `plan.serviceLimits.storage` override, and otherwise reads the central per-plan tiers from
 * lib/config/plan-limits (base 1GB / mid 10GB / top 1TB — single source shared with retention).
 * Usage is tracked in a dedicated `storage_usage` counter (owner-keyed) so we don't have to sum
 * every asset across org members on each upload, and so we don't modify the credits/User schema.
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import { getPlanStorageBytes } from '@/lib/config/plan-limits';

const STORAGE_USAGE_COLLECTION = 'storage_usage';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export interface StorageOwner {
  id: string;
  type: 'org' | 'user';
}

/** Org-first, user-fallback. All members of an org share the org's storage pool. */
export function resolveStorageOwner(userId: string, orgId?: string | null): StorageOwner {
  return orgId ? { id: orgId, type: 'org' } : { id: userId, type: 'user' };
}

/**
 * The owner's storage limit (bytes). Prefers an explicit `serviceLimits.storage`
 * override on the plan; otherwise reads the central per-plan tier
 * (lib/config/plan-limits). Never throws — fails closed to the free tier.
 *
 * NOTE (Phase 3): a purchased storage add-on will be summed on top of this base.
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
    // The plan identifier lives in currentPlan.name (UserType enum, e.g. "agency_scale");
    // there is NO `type` field on currentPlan. Fall back to name (the normalizer
    // handles both the type value and a display name).
    return getPlanStorageBytes(plan?.type ?? plan?.planType ?? plan?.name);
  } catch {
    // No plan / lookup failure -> the smallest (free) tier via the central config.
    return getPlanStorageBytes(undefined);
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

/**
 * Whether the owner opted into paid storage overage ("use extra storage"). When
 * true, uploads may exceed the plan cap and the overage is billed monthly in
 * credits; when false, a full pool evicts LRU assets and then blocks.
 */
export async function getExtraStorageEnabled(owner: StorageOwner): Promise<boolean> {
  try {
    const db = await getDatabase();
    const doc = await db.collection(STORAGE_USAGE_COLLECTION).findOne({ ownerId: owner.id });
    return (doc as any)?.extraStorageEnabled === true;
  } catch {
    return false; // fail closed to the capped (non-overage) behavior
  }
}

/**
 * Set the owner's paid-overage opt-in. `billingUserId` = the user whose main
 * credit wallet the monthly overage is charged to (the one who enabled it, and
 * whose plan defines the org's cap). Stored so the billing cron needn't resolve
 * org membership.
 */
export async function setExtraStorageEnabled(
  owner: StorageOwner,
  enabled: boolean,
  billingUserId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.collection(STORAGE_USAGE_COLLECTION).updateOne(
    { ownerId: owner.id },
    {
      $set: {
        extraStorageEnabled: enabled,
        ownerType: owner.type,
        updatedAt: new Date(),
        ...(enabled ? { overageBillingUserId: billingUserId } : {}),
      },
      $setOnInsert: { ownerId: owner.id },
    },
    { upsert: true },
  );
}

export interface OverageOwnerRecord {
  ownerId: string;
  ownerType: 'org' | 'user';
  usedBytes: number;
  overageBillingUserId?: string;
  lastOverageBilledMonth?: string; // 'YYYY-MM' — idempotency for the monthly cron
}

/** Owners who opted into paid overage — the monthly billing cron iterates these. */
export async function listOverageOwners(): Promise<OverageOwnerRecord[]> {
  const db = await getDatabase();
  return (await db
    .collection(STORAGE_USAGE_COLLECTION)
    .find({ extraStorageEnabled: true })
    .toArray()) as unknown as OverageOwnerRecord[];
}

/** Stamp the month an owner's overage was charged (idempotency for the monthly cron). */
export async function markOverageBilled(ownerId: string, month: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(STORAGE_USAGE_COLLECTION).updateOne(
    { ownerId },
    { $set: { lastOverageBilledMonth: month } },
  );
}

export function formatStorageBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes % GB === 0 ? 0 : 1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
