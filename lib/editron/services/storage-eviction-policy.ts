/**
 * Pure eviction policy — no IO, no DB/GCS imports (so it's unit-testable and can't
 * trigger the module-load env checks in mongodb/gcs services). The destructive
 * engine (storage-eviction-service) imports these.
 */
import type { StorageOwner } from '@/lib/services/storage-quota-service';

/** Bytes that must be freed for `addBytes` to fit under `limitBytes`. 0 if it already fits. */
export function bytesToFree(usedBytes: number, limitBytes: number, addBytes: number): number {
  return Math.max(0, usedBytes + addBytes - limitBytes);
}

/** Mongo filter for an owner's user-uploaded assets (org-wide, or solo-user only). */
export function ownerAssetFilter(owner: StorageOwner): Record<string, unknown> {
  return owner.type === 'org'
    ? { orgId: owner.id }
    : { userId: owner.id, orgId: { $exists: false } };
}
