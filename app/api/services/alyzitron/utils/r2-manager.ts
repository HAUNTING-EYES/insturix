/**
 * Alyzitron R2 Manager
 *
 * Thin wrapper over Editron's shared R2 service that adds Alyzitron-specific
 * logic: presigned upload/read URLs, CORS configuration.
 *
 * Shared functions (delete, exists, publicUrl) delegate to Editron's service.
 * Both services share the same bucket by default (editron-cdn). Set
 * ALYZITRON_R2_BUCKET_NAME env var to use a separate bucket.
 */

import { PutObjectCommand, GetObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  isR2Available as _isR2Available,
  getS3Client,
  deleteFromR2 as _deleteFromR2,
  r2FileExists as _r2FileExists,
  getR2PublicUrl,
} from '@/lib/editron/services/r2-service';

// ─── Bucket ──────────────────────────────────────────────────────

function getAlyzitronBucket(): string {
  return process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || 'editron-cdn';
}

// ─── CORS ────────────────────────────────────────────────────────

let corsConfigured = false;
let corsConfiguring: Promise<void> | null = null;

function normalizeOrigin(origin?: string): string | null {
  if (!origin) return null;
  try {
    return new URL(origin.startsWith('http') ? origin : `https://${origin}`).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): string[] {
  const origins = new Set<string>([
    'https://www.insturix.com',
    'https://insturix.com',
  ]);

  for (let port = 3000; port <= 3010; port++) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }

  [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ].forEach((value) => {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  });

  const extraOrigins = process.env.R2_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin));

  extraOrigins?.forEach((origin) => origins.add(origin));

  return Array.from(origins);
}

// ─── Manager ─────────────────────────────────────────────────────

export class AlyzitronR2Manager {
  /** Check if R2 is configured and available */
  static isR2Available(): boolean {
    return _isR2Available();
  }

  /** Ensure CORS is configured for browser uploads (non-fatal if permission denied) */
  static async ensureCorsConfigured(): Promise<void> {
    if (corsConfigured) return;
    if (corsConfiguring) return corsConfiguring;

    corsConfiguring = (async () => {
      try {
        const client = getS3Client();
        const bucketName = getAlyzitronBucket();

        await client.send(
          new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedOrigins: getAllowedOrigins(),
                  AllowedMethods: ['GET', 'PUT', 'HEAD'],
                  AllowedHeaders: ['*'],
                  ExposeHeaders: ['ETag'],
                  MaxAgeSeconds: 3600,
                },
              ],
            },
          })
        );

        corsConfigured = true;
      } catch (err) {
        // PutBucketCorsCommand requires elevated permissions that the API token
        // may not have. This is non-fatal — CORS is usually already configured
        // from the Cloudflare dashboard or a previous run.
        console.warn('[AlyzitronR2] CORS configuration skipped (likely permission issue):', err instanceof Error ? err.message : err);
        corsConfigured = true; // Don't retry on every request
      }
    })();

    try {
      await corsConfiguring;
    } finally {
      corsConfiguring = null;
    }
  }

  /** Generate a presigned upload URL for browser → R2 */
  static async getSignedUploadUrl(
    userId: string,
    filename: string,
    contentType: string
  ): Promise<{ url: string; r2Key: string; publicUrl: string }> {
    const client = getS3Client();
    const bucketName = getAlyzitronBucket();

    const cleanFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
    const normalizedUserId = userId.replace('user_', '');
    const timestamp = Date.now();
    const r2Key = `user_${normalizedUserId}/alyzitron-uploads/${timestamp}_${cleanFilename}`;

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        ContentType: contentType,
        Metadata: {
          userId: normalizedUserId,
          filename: cleanFilename,
          uploadedAt: new Date().toISOString(),
        },
      }),
      { expiresIn: 15 * 60 }
    );

    const publicUrl = AlyzitronR2Manager.getPublicUrl(r2Key);

    return { url, r2Key, publicUrl };
  }

  /** Delete a file from R2 */
  static async deleteFromR2(r2KeyOrUrl: string): Promise<void> {
    const key = this.extractObjectKey(r2KeyOrUrl);
    await _deleteFromR2(key);
  }

  /** Check if a file exists in R2 */
  static async fileExists(r2Key: string): Promise<boolean> {
    return _r2FileExists(r2Key);
  }

  /** Generate a presigned read URL (15 min) for R2 object keys or full URLs */
  static async getSignedReadUrl(r2KeyOrUrl: string): Promise<string> {
    const client = getS3Client();
    const bucketName = getAlyzitronBucket();
    const key = this.extractObjectKey(r2KeyOrUrl);

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
      { expiresIn: 15 * 60 }
    );

    return url;
  }

  static getPublicUrl(r2Key: string): string {
    const bucketName = getAlyzitronBucket();
    const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
    return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}/${r2Key}`;
  }

  /**
   * Extract the bare object key from a full public URL or raw key.
   * Handles CDN Worker URLs, R2 direct URLs, and raw keys.
   */
  private static extractObjectKey(r2KeyOrUrl: string): string {
    if (!r2KeyOrUrl.startsWith('http')) {
      return r2KeyOrUrl;
    }

    try {
      const url = new URL(r2KeyOrUrl);
      const pathname = url.pathname.replace(/^\/+/, '');

      // CDN Worker URL: https://worker.dev/asset/{key} → strip "asset/" prefix
      if (pathname.startsWith('asset/')) {
        return pathname.slice('asset/'.length);
      }

      const bucketName = getAlyzitronBucket();
      if (pathname.startsWith(`${bucketName}/`)) {
        return pathname.slice(bucketName.length + 1);
      }

      // Assume the entire path is the key
      return pathname;
    } catch {
      throw new Error('Invalid R2 URL for signed read URL generation');
    }
  }
}
