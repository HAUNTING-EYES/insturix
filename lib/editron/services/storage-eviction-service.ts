/**
 * Storage eviction — LRU overwrite for a full per-plan storage pool.
 *
 * When an owner's storage is full and the "extra storage" (paid overage) toggle is
 * OFF, we make room by deleting least-recently-used, NON-PROTECTED assets until the
 * new upload fits under the plan cap. This is the "fixed storage, overwritten"
 * behavior. Protected assets are never evicted:
 *   - pinned = true (brand-vault reference / user-pinned), or
 *   - referenced by any saved project's overlays (in active use).
 * If only protected assets remain and it still won't fit -> `blockedByProtected`
 * (the caller blocks the upload, or the user opts into paid overage).
 *
 * DESTRUCTIVE: deletes the GCS/R2 object + the mediaAssets doc + decrements the
 * storage_usage counter. Ordering is bytes-first-then-doc so a failed byte delete
 * never drifts the counter (skip + keep the doc, reconcile later).
 *
 * NOT wired to the live upload paths yet — introduced with tests first.
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { deleteFromGCS } from './gcs-service';
import { deleteFromR2 } from './r2-service';
import { recordStorageUsage, type StorageOwner } from '@/lib/services/storage-quota-service';
import { bytesToFree, ownerAssetFilter } from './storage-eviction-policy';
import type { MediaAsset } from './asset-resolver';

export interface MakeRoomResult {
  /** Bytes actually reclaimed. */
  freedBytes: number;
  /** assetIds that were deleted. */
  evictedAssetIds: string[];
  /** True when enough was freed for the upload to fit under the cap. */
  fits: boolean;
  /** True when it could NOT fit because every remaining asset is protected/in-use. */
  blockedByProtected: boolean;
}

/** assetIds (from the candidate set) referenced by ANY saved project — never evict these. */
async function projectReferencedAssetIds(db: any, candidateIds: string[]): Promise<Set<string>> {
  if (!candidateIds.length) return new Set();
  const refs: string[] = await db
    .collection(COLLECTIONS.PROJECTS)
    .distinct('overlays.assetId', { 'overlays.assetId': { $in: candidateIds } });
  return new Set(refs.filter(Boolean));
}

/** Delete the underlying bytes (GCS or R2). Throws on failure so the caller can skip the doc. */
async function deleteAssetBytes(a: MediaAsset): Promise<void> {
  if (a.gcsPath) {
    await deleteFromGCS(a.gcsPath);
  } else if (a.r2Key) {
    await deleteFromR2(a.r2Key);
  } else {
    // R2 assets default their key to the assetId (see upload route).
    await deleteFromR2(a.assetId);
  }
}

/**
 * Evict LRU non-protected assets for `owner` until `addBytes` fits under `limitBytes`.
 * Returns what was freed and whether it now fits (or was blocked by protected assets).
 */
export async function makeRoomForUpload(
  owner: StorageOwner,
  usedBytes: number,
  limitBytes: number,
  addBytes: number,
): Promise<MakeRoomResult> {
  const need = bytesToFree(usedBytes, limitBytes, addBytes);
  if (need <= 0) {
    return { freedBytes: 0, evictedAssetIds: [], fits: true, blockedByProtected: false };
  }

  const db = await getDatabase();
  // LRU candidates: this owner's user-uploads, not pinned, least-recently-used first
  // (tiebreak: oldest upload). Public/stock assets and pinned assets are excluded.
  const candidates = (await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .find({ ...ownerAssetFilter(owner), source: 'user-upload', pinned: { $ne: true } })
    .sort({ lastUsedAt: 1, uploadedAt: 1 })
    .toArray()) as unknown as MediaAsset[];

  const protectedIds = await projectReferencedAssetIds(db, candidates.map((c) => c.assetId));

  let freed = 0;
  const evicted: string[] = [];
  for (const a of candidates) {
    if (freed >= need) break;
    if (protectedIds.has(a.assetId)) continue; // referenced by a project — in use, never evict
    const size = a.size || 0;
    try {
      await deleteAssetBytes(a); // bytes FIRST
    } catch (err: any) {
      console.warn(`[StorageEviction] byte delete failed for ${a.assetId} (skipped): ${err?.message ?? err}`);
      continue; // don't delete the doc or count it — avoids counter drift + orphaned doc pointing at live bytes
    }
    await db.collection(COLLECTIONS.MEDIA_ASSETS).deleteOne({ _id: (a as any)._id });
    freed += size;
    evicted.push(a.assetId);
  }

  if (freed > 0) await recordStorageUsage(owner, -freed);

  const fits = freed >= need;
  return { freedBytes: freed, evictedAssetIds: evicted, fits, blockedByProtected: !fits };
}
