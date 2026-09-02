/**
 * R2 multipart upload limits — single source of truth, pure (no SDK imports).
 *
 * Cloudflare R2 S3-API multipart caps (official docs, 2026-07):
 *  - max object size: 5 TiB minus 5 GiB (up to 10,000 parts)
 *  - part size: 5 MiB – (5 GiB minus 5 MiB) per part
 *  - all parts except the last must be the same size
 * Server routes AND the browser client import this so both enforce identical math.
 */
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const TiB = 1024 * GiB;

export const R2_MAX_OBJECT_BYTES = 5 * TiB - 5 * GiB;
export const R2_MIN_PART_BYTES = 5 * MiB;
export const R2_MAX_PART_BYTES = 5 * GiB - 5 * MiB;
export const R2_MAX_PARTS = 10_000;

export interface MultipartPlan {
  /** Bytes per part (all-but-last are exactly this size; the final part may be smaller). */
  partSize: number;
  /** Number of parts. */
  totalParts: number;
}

/**
 * Resolve a deterministic multipart plan for a file of `totalBytes`.
 * Part size grows with file size so the part count never exceeds R2's 10,000 cap
 * while staying inside the exact provider range. Throws above 4.995 TiB.
 */
export function resolveMultipartPlan(totalBytes: number): MultipartPlan {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new Error('invalid-total-size');
  }
  if (totalBytes > R2_MAX_OBJECT_BYTES) {
    throw new Error('file-exceeds-r2-max-object');
  }
  if (totalBytes === 0) {
    return { partSize: R2_MIN_PART_BYTES, totalParts: 1 };
  }

  // Target at most R2_MAX_PARTS parts; with the minimum 5 MiB part that caps ~50 GiB,
  // so above that we raise the part size instead of the part count.
  let partSize = Math.max(
    R2_MIN_PART_BYTES,
    Math.ceil(totalBytes / R2_MAX_PARTS),
  );
  partSize = Math.min(partSize, R2_MAX_PART_BYTES);
  // Align up to a whole MiB so every part is an identical byte-aligned slice.
  partSize = Math.ceil(partSize / MiB) * MiB;
  partSize = Math.min(partSize, R2_MAX_PART_BYTES);

  const totalParts = Math.ceil(totalBytes / partSize);
  if (totalParts > R2_MAX_PARTS) {
    // Only reachable if clamping partSize to 5 GiB overflows the 10,000-part cap:
    // The provider part ceiling times 10,000 exceeds its object ceiling.
    throw new Error('file-needs-more-parts-than-r2-max');
  }
  return { partSize, totalParts };
}

/** Validate a client-declared part size is within R2's legal range. */
export function isValidPartSize(partSize: number): boolean {
  return Number.isInteger(partSize)
    && partSize >= R2_MIN_PART_BYTES
    && partSize <= R2_MAX_PART_BYTES;
}
