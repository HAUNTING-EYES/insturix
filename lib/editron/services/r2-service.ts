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
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// ─── Configuration ────────────────────────────────────────────────

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'editron-cdn';
const CDN_WORKER_URL = normalizeCdnWorkerUrl(process.env.CDN_WORKER_URL);
const R2_FILE_SINGLE_PUT_THRESHOLD_BYTES = 64 * 1024 * 1024;
const R2_MULTIPART_MIN_PART_BYTES = 64 * 1024 * 1024;
const R2_MULTIPART_MAX_PART_BYTES = 5 * 1024 ** 3;
const R2_MULTIPART_MAX_PARTS = 10_000;
const R2_MAX_OBJECT_BYTES = 5 * 1024 ** 4;

function normalizeCdnWorkerUrl(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/\\r|\\n/g, '')
    .replace(/[\r\n\t]/g, '')
    .replace(/\/+$/, '');

  return normalized || undefined;
}

/**
 * Check if R2 is configured. If not, callers should fall back to GCS.
 */
export function isR2Available(): boolean {
  return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID);
}

// Lazy-init S3 client (only created when first used)
let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_s3Client) {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
      throw new Error('R2 credentials not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID)');
    }
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      // Disable checksum calculation to prevent signed URLs from requiring X-Amz-Checksum-* headers
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      forcePathStyle: true,
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

type R2CommandClient = {
  send(command: unknown): Promise<any>;
};

interface R2FileUploadDeps {
  client?: R2CommandClient;
  statFile?: (filePath: string) => Promise<{ size: number; isFile(): boolean }>;
  createFileReadStream?: (
    filePath: string,
    options?: { start?: number; end?: number },
  ) => ReturnType<typeof createReadStream>;
  now?: () => Date;
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

  return {
    assetId,
    r2Key,
    publicUrl,
    size: file.length,
    contentType,
  };
}

/**
 * Upload a local file without materializing it as one Buffer. Small files use a
 * streaming PUT; larger files use sequential multipart ranges and abort on any
 * incomplete upload. The caller may supply a content-addressed asset ID.
 */
export async function uploadFileToR2(
  filePath: string,
  userId: string,
  filename: string,
  contentType: string,
  customAssetId?: string,
  deps: R2FileUploadDeps = {},
): Promise<R2UploadResult> {
  const file = await (deps.statFile ?? stat)(filePath);
  if (!file.isFile() || !Number.isSafeInteger(file.size) || file.size < 1) {
    throw new Error('R2_FILE_UPLOAD_SOURCE_INVALID');
  }
  if (file.size > R2_MAX_OBJECT_BYTES) throw new Error('R2_FILE_UPLOAD_OBJECT_TOO_LARGE');

  const client = deps.client ?? getS3Client();
  const openStream = deps.createFileReadStream ?? createReadStream;
  const assetId = customAssetId || `a_${nanoid(8)}`;
  const r2Key = assetId;
  const metadata = {
    userId,
    filename,
    uploadedAt: (deps.now ?? (() => new Date()))().toISOString(),
  };

  if (file.size <= R2_FILE_SINGLE_PUT_THRESHOLD_BYTES) {
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: openStream(filePath),
      ContentLength: file.size,
      ContentType: contentType,
      Metadata: metadata,
    }));
  } else {
    const minimumPartBytes = Math.ceil(file.size / R2_MULTIPART_MAX_PARTS);
    const partSize = Math.max(
      R2_MULTIPART_MIN_PART_BYTES,
      Math.ceil(minimumPartBytes / (1024 * 1024)) * 1024 * 1024,
    );
    if (partSize > R2_MULTIPART_MAX_PART_BYTES) {
      throw new Error('R2_FILE_UPLOAD_PART_SIZE_UNSUPPORTED');
    }

    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      ContentType: contentType,
      Metadata: metadata,
    }));
    const uploadId = typeof created?.UploadId === 'string' ? created.UploadId : '';
    if (!uploadId) throw new Error('R2_FILE_UPLOAD_ID_MISSING');

    try {
      const parts: MultipartPart[] = [];
      for (let start = 0, partNumber = 1; start < file.size; start += partSize, partNumber += 1) {
        const end = Math.min(file.size - 1, start + partSize - 1);
        const uploaded = await client.send(new UploadPartCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: openStream(filePath, { start, end }),
          ContentLength: end - start + 1,
        }));
        const ETag = typeof uploaded?.ETag === 'string' ? uploaded.ETag : '';
        if (!ETag) throw new Error(`R2_FILE_UPLOAD_ETAG_MISSING:${partNumber}`);
        parts.push({ ETag, PartNumber: partNumber });
      }
      await client.send(new CompleteMultipartUploadCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }));
    } catch (error) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          UploadId: uploadId,
        }));
      } catch (abortError) {
        throw new AggregateError(
          [error, abortError],
          'R2_FILE_UPLOAD_FAILED_AND_ABORT_FAILED',
        );
      }
      throw error;
    }
  }

  return {
    assetId,
    r2Key,
    publicUrl: getR2PublicUrl(assetId),
    size: file.size,
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
}

// ─── Check Existence ──────────────────────────────────────────────

/** Delete every object belonging to one MG sequence. Rejects broad/arbitrary prefixes. */
export async function deleteR2Prefix(
  r2Prefix: string,
  client: R2CommandClient = getS3Client(),
): Promise<number> {
  if (!/^mgseq_[A-Za-z0-9_-]+_$/.test(r2Prefix)) {
    throw new Error(`Refusing unsafe R2 sequence prefix: ${r2Prefix}`);
  }

  let continuationToken: string | undefined;
  let deletedCount = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: r2Prefix,
      ContinuationToken: continuationToken,
    }));
    const keys = (page.Contents ?? [])
      .map((entry: { Key?: string }) => entry.Key)
      .filter((key: string | undefined): key is string => Boolean(key));

    for (let offset = 0; offset < keys.length; offset += 1000) {
      const batch = keys.slice(offset, offset + 1000);
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: batch.map((Key: string) => ({ Key })), Quiet: false },
      }));
      if (Array.isArray(result.Errors) && result.Errors.length > 0) {
        const failed = result.Errors.map((error: { Key?: string; Code?: string }) => `${error.Key ?? 'unknown'}:${error.Code ?? 'unknown'}`);
        throw new Error(`R2 sequence prefix deletion failed: ${failed.join(', ')}`);
      }
      deletedCount += batch.length;
    }

    if (page.IsTruncated && !page.NextContinuationToken) {
      throw new Error(`R2 sequence prefix listing truncated without continuation token: ${r2Prefix}`);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deletedCount;
}
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
  } catch (err: unknown) { console.warn('[R2] r2FileExists check failed:', err instanceof Error ? err.message : err); return false; }
}

/**
 * Get the actual byte size of an R2 object via an authoritative HeadObject (direct to storage,
 * NOT the CDN Worker proxy which the register route notes is unreliable for HEAD).
 * Returns null if the object is missing or the size can't be read — callers fail open on null.
 */
export async function getR2ObjectSize(r2Key: string): Promise<number | null> {
  try {
    const client = getS3Client();
    const res = await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    }));
    return typeof res.ContentLength === 'number' ? res.ContentLength : null;
  } catch (err: unknown) {
    console.warn('[R2] getR2ObjectSize failed:', err instanceof Error ? err.message : err);
    return null;
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

/**
 * Generate a presigned GET URL for direct R2 access (bypasses Cloudflare Worker).
 *
 * Use this for SERVER-TO-SERVER downloads (Gemini, xAI, fal.ai, Deepgram).
 * The Worker URL is for BROWSER access only (CORS, edge caching).
 *
 * Why: The Worker proxies files through a JS invocation. Multiple concurrent
 * 91MB downloads saturate Worker concurrency → 429 rate limits. Presigned
 * GETs go direct to R2 storage — no Worker, no concurrency limit, no 429.
 *
 * @param r2Key The R2 object key (usually same as assetId)
 * @param expiresIn Seconds until URL expires (default 1 hour)
 */
export async function getR2PresignedReadUrl(r2Key: string, expiresIn = 3600): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
  });
  return getSignedUrl(client, command, { expiresIn });
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
  } catch (err: any) {
    // NoSuchUpload = already completed or aborted — safe to ignore
    if (err.name === 'NoSuchUpload') {
      return;
    }
    throw err;
  }
}
