/**
 * Storage reservation — the single decision point for "can this upload be stored?".
 *
 * Ties together the quota (storage-quota-service), the LRU eviction engine
 * (storage-eviction-service), and the per-owner "extra storage" overage toggle.
 * Upload paths call this instead of a bare quota check.
 *
 * Decision tree for an upload of `addBytes`:
 *   1. Fits under the plan cap            -> allow.
 *   2. Over cap AND overage toggle ON     -> allow as PAID overage (billed monthly in credits).
 *   3. Over cap, toggle OFF               -> LRU-evict non-protected assets to make room.
 *        3a. freed enough                 -> allow (report evicted assetIds).
 *        3b. only protected assets remain -> block (reason: 'storage_full').
 *
 * Lives separately from storage-quota-service to avoid a circular import (the
 * eviction engine already depends on the quota service).
 */

import {
  resolveStorageOwner,
  getStorageUsedBytes,
  getStorageLimitBytes,
  getExtraStorageEnabled,
  type StorageOwner,
} from '@/lib/services/storage-quota-service';
import { makeRoomForUpload } from '@/lib/editron/services/storage-eviction-service';

export interface StorageReservation {
  allowed: boolean;
  /** Set when blocked. 'storage_full' = capped, nothing evictable, no overage opt-in. */
  reason?: 'storage_full';
  owner: StorageOwner;
  usedBytes: number;
  limitBytes: number;
  addBytes: number;
  /** Assets evicted to make room (empty unless LRU eviction ran). */
  evictedAssetIds: string[];
  /** True when allowed as PAID overage (over cap, toggle on). */
  overage: boolean;
}

export async function reserveStorageForUpload(
  userId: string,
  orgId: string | null | undefined,
  addBytes: number,
): Promise<StorageReservation> {
  const owner = resolveStorageOwner(userId, orgId);
  const add = Math.max(0, addBytes || 0);
  const [usedBytes, limitBytes] = await Promise.all([
    getStorageUsedBytes(owner),
    getStorageLimitBytes(userId),
  ]);

  const base = {
    owner,
    usedBytes,
    limitBytes,
    addBytes: add,
    evictedAssetIds: [] as string[],
    overage: false,
  };

  // 1. Fits under the cap.
  if (usedBytes + add <= limitBytes) {
    return { ...base, allowed: true };
  }

  // 2. Over cap, but the owner opted into paid overage -> allow (billed monthly).
  if (await getExtraStorageEnabled(owner)) {
    return { ...base, allowed: true, overage: true };
  }

  // 3. Capped: evict LRU non-protected assets to make room.
  const room = await makeRoomForUpload(owner, usedBytes, limitBytes, add);
  if (room.fits) {
    return { ...base, allowed: true, evictedAssetIds: room.evictedAssetIds };
  }

  // 3b. Only protected assets remain and no overage opt-in -> block.
  return {
    ...base,
    allowed: false,
    reason: 'storage_full',
    evictedAssetIds: room.evictedAssetIds,
  };
}
