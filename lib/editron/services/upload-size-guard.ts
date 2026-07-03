/**
 * Upload size policy for the presigned / direct-to-storage upload paths.
 *
 * The presigned upload URL (POST /media/upload/url) carries NO size limit — a client can PUT any
 * size straight to R2/GCS, bypassing the server. So the real cap is enforced server-side on
 * registration, against the ACTUAL object size read back from storage (HeadObject / getMetadata).
 * This module holds that policy — the cap plus the fail-open decision — so the register route and
 * (later) multipart-complete share one source of truth instead of duplicating a magic number.
 */

/** Hard cap for presigned/multipart uploads, in bytes. Matches the multipart-init limit (3GB). */
export const MAX_PRESIGNED_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;

/**
 * True when a KNOWN object size exceeds the cap. Fails OPEN when the size is unknown
 * (null/undefined) — a transient storage read error must never block a legitimate upload,
 * matching the register route's existing fail-open posture on the existence check.
 */
export function exceedsPresignedUploadCap(actualSizeBytes: number | null | undefined): boolean {
  return typeof actualSizeBytes === 'number' && actualSizeBytes > MAX_PRESIGNED_UPLOAD_BYTES;
}
