/**
 * Unified Upload Service
 *
 * Routes uploads to the correct storage backend:
 *   - R2 (primary) — for all browser-facing assets
 *   - GCS (secondary) — ONLY for assets that need Gemini Vision analysis
 *
 * All callers use this instead of importing gcs-service or r2-service directly.
 * This ensures consistent behavior across the entire pipeline.
 *
 * Migration note: This file replaces direct `uploadToGCS()` calls.
 * The interface returns the same fields so callers need minimal changes.
 */

import { uploadToR2, isR2Available, getR2PublicUrl, type R2UploadResult } from './r2-service';
import { uploadToGCS, type UploadResult as GCSUploadResult } from './gcs-service';

// ─── Types ────────────────────────────────────────────────────────

export interface UploadResult {
  /** Unique asset identifier (a_xxxxxxxx) */
  assetId: string;
  /**
   * Primary URL for browser playback.
   * - If R2: permanent CDN URL (never expires, has CORS)
   * - If GCS fallback: signed URL (expires in 7 days)
   */
  signedUrl: string;
  /**
   * GCS path — ONLY set when asset was also uploaded to GCS.
   * Used for: Gemini Files API (gs:// URIs), URL refresh fallback.
   * null when R2 is primary and no Gemini analysis needed.
   */
  gcsPath: string | null;
  /**
   * R2 object key — set when R2 is the primary storage.
   * Used for: deletion, existence check.
   */
  r2Key: string | null;
  /** URL expiration date. null for R2 (never expires). */
  urlExpiresAt: Date | null;
  /** File size in bytes */
  size: number;
  /** MIME type */
  contentType: string;
}

// ─── Options ──────────────────────────────────────────────────────

export interface UploadOptions {
  /**
   * If true, ALSO upload to GCS for Gemini Vision analysis.
   * Only needed for video assets that will go through 5-Track analysis.
   * Default: false
   */
  alsoUploadToGCS?: boolean;
  /**
   * Custom assetId to use as the R2 key and returned assetId.
   * If provided, the R2 service uses this instead of generating a_xxxxxxxx.
   * Callers like storyboard/video/TTS services have their own meaningful IDs.
   */
  customAssetId?: string;
}

// ─── Main Upload Function ─────────────────────────────────────────

/**
 * Upload a file to the appropriate storage backend.
 *
 * Priority:
 * 1. R2 (if configured) — permanent URL, CORS built-in, edge-cached
 * 2. GCS (fallback) — signed URL, needs CORS config, 7-day expiry
 *
 * For video assets that need Gemini analysis, pass { alsoUploadToGCS: true }
 * to dual-upload to both R2 (for browser) and GCS (for Gemini gs:// URI).
 */
export async function uploadMedia(
  file: Buffer,
  userId: string,
  filename: string,
  contentType: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const { alsoUploadToGCS = false, customAssetId } = options;

  // ─── R2 Primary Path ─────────────────────────────────────
  if (isR2Available()) {
    let r2Result: R2UploadResult;
    try {
      r2Result = await uploadToR2(file, userId, filename, contentType, customAssetId);
    } catch (r2Err: any) {
      // R2 failed — fall back to GCS
      console.error(`[UploadService] R2 upload failed, falling back to GCS: ${r2Err.message}`);
      return uploadViaGCS(file, userId, filename, contentType);
    }

    let gcsPath: string | null = null;

    // Also upload to GCS if Gemini analysis is needed
    if (alsoUploadToGCS) {
      try {
        const gcsResult = await uploadToGCS(file, userId, filename, contentType);
        gcsPath = gcsResult.gcsPath;
        console.log(`[UploadService] Dual upload: R2 ✓ (${r2Result.assetId}) + GCS ✓ (${gcsPath})`);
      } catch (gcsErr: any) {
        // GCS failed but R2 succeeded — asset is still playable, just can't do Gemini analysis
        console.warn(`[UploadService] GCS mirror failed (Gemini analysis unavailable): ${gcsErr.message}`);
      }
    }

    return {
      assetId: r2Result.assetId,
      signedUrl: r2Result.publicUrl,
      gcsPath,
      r2Key: r2Result.r2Key,
      urlExpiresAt: null, // R2 URLs never expire
      size: r2Result.size,
      contentType: r2Result.contentType,
    };
  }

  // ─── GCS Fallback Path ───────────────────────────────────
  console.log('[UploadService] R2 not configured, using GCS only');
  return uploadViaGCS(file, userId, filename, contentType);
}

/**
 * GCS-only upload (fallback when R2 is not configured).
 */
async function uploadViaGCS(
  file: Buffer,
  userId: string,
  filename: string,
  contentType: string,
): Promise<UploadResult> {
  const gcsResult = await uploadToGCS(file, userId, filename, contentType);
  return {
    assetId: gcsResult.assetId,
    signedUrl: gcsResult.signedUrl,
    gcsPath: gcsResult.gcsPath,
    r2Key: null,
    urlExpiresAt: gcsResult.urlExpiresAt,
    size: gcsResult.size,
    contentType: gcsResult.contentType,
  };
}

// ─── Re-exports for convenience ───────────────────────────────────

export { isR2Available } from './r2-service';
export { getR2PublicUrl } from './r2-service';
export { refreshSignedUrl, deleteFromGCS, fileExists } from './gcs-service';
