/**
 * Cloudflare R2 Storage Service
 *
 * Primary storage for all browser-facing media assets.
 * Uses S3-compatible API to upload to Cloudflare R2.
 *
 * Assets are served via the Cloudflare Worker (editron-asset-proxy)
 * which provides:
 *   - Edge caching (nearest POP)
 *   - CORS headers (Access-Control-Allow-Origin: *)
 *   - Permanent URLs (never expire, no signed URL refresh needed)
 *   - Cache-Control: immutable (1 year browser cache)
 *
 * GCS is kept ONLY for Gemini Vision integration (requires gs:// URIs).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

// ─── Configuration ────────────────────────────────────────────────

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'editron-cdn';
const CDN_WORKER_URL = process.env.CDN_WORKER_URL;

/**
 * Check if R2 is configured. If not, callers should fall back to GCS.
 */
export function isR2Available(): boolean {
  return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID);
}

// Lazy-init S3 client (only created when first used)
let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
      throw new Error('R2 credentials not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID)');
    }
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3Client;
}

// ─── Types ────────────────────────────────────────────────────────

export interface R2UploadResult {
  assetId: string;
  /** R2 object key (same format as gcsPath for compatibility) */
  r2Key: string;
  /** Public URL via Cloudflare Worker — never expires, has CORS */
  publicUrl: string;
  /** Size in bytes */
  size: number;
  /** MIME type */
  contentType: string;
}

// ─── Upload ───────────────────────────────────────────────────────

/**
 * Upload file to R2 and return asset metadata with permanent public URL.
 *
 * The public URL is served via the Cloudflare Worker:
 *   https://editron-asset-proxy.aged-shape-8752.workers.dev/asset/{assetId}
 *
 * This URL:
 *   - Never expires (unlike GCS 7-day signed URLs)
 *   - Has CORS headers (Access-Control-Allow-Origin: *)
 *   - Is edge-cached globally (Cloudflare network)
 *   - Returns Cache-Control: immutable (browser caches for 1 year)
 */
export async function uploadToR2(
  file: Buffer,
  userId: string,
  filename: string,
  contentType: string,
  customAssetId?: string,
): Promise<R2UploadResult> {
  const client = getS3Client();
  // Use caller-provided assetId if given (storyboard, video, voiceover services
  // generate their own meaningful IDs). Otherwise generate a generic one.
  const assetId = customAssetId || `a_${nanoid(8)}`;

  // Use assetId as the R2 key — the Worker routes /asset/{assetId} to this key
  const r2Key = assetId;

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    Body: file,
    ContentType: contentType,
    // Store metadata for debugging
    Metadata: {
      userId,
      filename,
      uploadedAt: new Date().toISOString(),
    },
  }));

  // Public URL via Cloudflare Worker
  const publicUrl = CDN_WORKER_URL
    ? `${CDN_WORKER_URL}/asset/${assetId}`
    : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${r2Key}`;

  console.log(`[R2] Uploaded ${assetId} (${Math.round(file.length / 1024)}KB ${contentType}) → ${publicUrl}`);

  return {
    assetId,
    r2Key,
    publicUrl,
    size: file.length,
    contentType,
  };
}

// ─── Delete ───────────────────────────────────────────────────────

/**
 * Delete file from R2.
 */
export async function deleteFromR2(r2Key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
  }));
  console.log(`[R2] Deleted ${r2Key}`);
}

// ─── Check Existence ──────────────────────────────────────────────

/**
 * Check if file exists in R2.
 */
export async function r2FileExists(r2Key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    }));
    return true;
  } catch {
    return false;
  }
}

// ─── URL Helpers ──────────────────────────────────────────────────

/**
 * Generate a presigned PUT URL for direct client-side upload to R2.
 * Used by Mode 2 "Edit My Video" when GCS is unavailable (Preview env).
 * Returns the upload URL + assetId + public read URL (via CDN Worker).
 * Client PUTs the file directly to this URL — no server proxy needed.
 */
export async function generateR2UploadUrl(
  userId: string,
  filename: string,
  contentType: string,
): Promise<{
  uploadUrl: string;
  assetId: string;
  r2Key: string;
  readUrl: string;
  readUrlExpiresAt: Date;
}> {
  const client = getS3Client();
  const assetId = `upload_${nanoid(12)}`;
  const r2Key = assetId;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    ContentType: contentType,
    Metadata: {
      userId,
      filename,
      uploadedAt: new Date().toISOString(),
    },
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 }); // 15 min
  const readUrl = getR2PublicUrl(assetId);
  const readUrlExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // R2 CDN URLs never expire

  console.log(`[R2] Presigned upload URL for ${assetId} (${contentType}, user=${userId.slice(0, 12)})`);

  return { uploadUrl, assetId, r2Key, readUrl, readUrlExpiresAt };
}

/**
 * Get the public CDN URL for an asset.
 * Unlike GCS, this never expires and doesn't need refresh.
 */
export function getR2PublicUrl(assetId: string): string {
  if (CDN_WORKER_URL) {
    return `${CDN_WORKER_URL}/asset/${assetId}`;
  }
  // Fallback: direct R2 URL (no CORS, not ideal)
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${assetId}`;
}

// ─── Multipart Upload ────────────────────────────────────────────

export interface MultipartInitResult {
  uploadId: string;
  r2Key: string;
  assetId: string;
}

export interface MultipartPart {
  ETag: string;
  PartNumber: number;
}

/**
 * Initiate an S3 multipart upload on R2.
 * Returns the uploadId needed for subsequent part uploads and completion.
 */
export async function initiateMultipartUpload(
  userId: string,
  filename: string,
  contentType: string,
): Promise<MultipartInitResult> {
  const client = getS3Client();
  const assetId = `upload_${nanoid(12)}`;
  const r2Key = assetId;

  const { UploadId } = await client.send(new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    ContentType: contentType,
    Metadata: {
      userId,
      filename,
      uploadedAt: new Date().toISOString(),
    },
  }));

  if (!UploadId) {
    throw new Error('R2 CreateMultipartUpload returned no UploadId');
  }

  console.log(`[R2] Initiated multipart upload ${UploadId} for ${assetId} (${contentType})`);

  return { uploadId: UploadId, r2Key, assetId };
}

/**
 * Generate a presigned PUT URL for uploading a single part.
 * Client PUTs the chunk directly to this URL, then sends back the ETag.
 */
export async function generatePartUploadUrl(
  r2Key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  const client = getS3Client();

  const command = new UploadPartCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  // 30 min expiry — large parts on slow connections need time
  const url = await getSignedUrl(client, command, { expiresIn: 1800 });
  return url;
}

/**
 * Complete a multipart upload by assembling all parts.
 * Returns the public CDN URL for the assembled object.
 */
export async function completeMultipartUpload(
  r2Key: string,
  uploadId: string,
  parts: MultipartPart[],
): Promise<string> {
  const client = getS3Client();

  await client.send(new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map(p => ({
        ETag: p.ETag,
        PartNumber: p.PartNumber,
      })),
    },
  }));

  const publicUrl = getR2PublicUrl(r2Key);
  console.log(`[R2] Completed multipart upload ${uploadId} → ${publicUrl}`);
  return publicUrl;
}

/**
 * Abort a multipart upload, cleaning up any uploaded parts.
 * Safe to call multiple times (idempotent).
 */
export async function abortMultipartUpload(
  r2Key: string,
  uploadId: string,
): Promise<void> {
  const client = getS3Client();

  try {
    await client.send(new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      UploadId: uploadId,
    }));
    console.log(`[R2] Aborted multipart upload ${uploadId}`);
  } catch (err: any) {
    // NoSuchUpload = already completed or aborted — safe to ignore
    if (err.name === 'NoSuchUpload') {
      console.log(`[R2] Multipart ${uploadId} already completed/aborted`);
      return;
    }
    throw err;
  }
}
