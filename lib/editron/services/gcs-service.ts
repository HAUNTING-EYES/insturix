/**
 * Google Cloud Storage Service
 * 
 * Handles file uploads and signed URL generation
 */

import { Storage } from '@google-cloud/storage';
import { nanoid } from 'nanoid';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
  throw new Error('Please define the GOOGLE_CLOUD_CREDENTIALS environment variable');
}

if (!process.env.GCS_BUCKET_NAME) {
  throw new Error('Please define the GCS_BUCKET_NAME environment variable');
}

// Decode service account from base64
const serviceAccountJson = Buffer.from(
  process.env.GOOGLE_CLOUD_CREDENTIALS,
  'base64'
).toString('utf-8');

const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize GCS client
const storage = new Storage({
  credentials: serviceAccount,
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

export interface UploadResult {
  assetId: string;
  gcsPath: string;
  signedUrl: string;
  urlExpiresAt: Date;
  size: number;
  contentType: string;
}

/**
 * Upload file to GCS and return asset metadata
 */
export async function uploadToGCS(
  file: Buffer,
  userId: string,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  // Generate unique asset ID
  const assetId = `a_${nanoid(8)}`;
  
  // Create GCS path: editron/{userId}/media/{timestamp}_{filename}
  const gcsPath = `editron/${userId}/media/${Date.now()}_${filename}`;
  
  // Upload to GCS
  const blob = bucket.file(gcsPath);
  await blob.save(file, {
    metadata: {
      contentType,
    },
  });

  // Generate signed URL (7 days expiration - GCS maximum)
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 7);

  const [signedUrl] = await blob.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expirationDate,
  });

  return {
    assetId,
    gcsPath,
    signedUrl,
    urlExpiresAt: expirationDate,
    size: file.length,
    contentType,
  };
}

/** Upload a local file through GCS's resumable write stream. */
export async function uploadFileToGCS(
  filePath: string,
  userId: string,
  filename: string,
  contentType: string,
  customAssetId?: string,
): Promise<UploadResult> {
  const file = await stat(filePath);
  if (!file.isFile() || !Number.isSafeInteger(file.size) || file.size < 1) {
    throw new Error('GCS_FILE_UPLOAD_SOURCE_INVALID');
  }

  const assetId = customAssetId || `a_${nanoid(8)}`;
  const objectPrefix = customAssetId || String(Date.now());
  const gcsPath = `editron/${userId}/media/${objectPrefix}_${filename}`;
  const blob = bucket.file(gcsPath);
  const source = createReadStream(filePath);
  const target = blob.createWriteStream({
    resumable: true,
    validation: 'crc32c',
    metadata: { contentType },
  });

  await new Promise<void>((resolve, reject) => {
    source.once('error', (error) => {
      target.destroy(error);
      reject(error);
    });
    target.once('error', (error) => {
      source.destroy(error);
      reject(error);
    });
    target.once('finish', resolve);
    source.pipe(target);
  });

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 7);
  const [signedUrl] = await blob.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expirationDate,
  });

  return {
    assetId,
    gcsPath,
    signedUrl,
    urlExpiresAt: expirationDate,
    size: file.size,
    contentType,
  };
}

/**
 * Generate fresh signed URL for existing GCS file
 */
export async function refreshSignedUrl(gcsPath: string): Promise<{ url: string; expiresAt: Date }> {
  const blob = bucket.file(gcsPath);
  
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 7);
  
  const [url] = await blob.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expirationDate,
  });

  return {
    url,
    expiresAt: expirationDate,
  };
}

/**
 * Delete file from GCS
 */
export async function deleteFromGCS(gcsPath: string): Promise<void> {
  const blob = bucket.file(gcsPath);
  await blob.delete();
}

/**
 * Generate a signed URL for direct client-side upload to GCS.
 * Returns the upload URL, asset metadata, and a read URL for display after upload.
 */
export async function generateUploadUrl(
  userId: string,
  filename: string,
  contentType: string
): Promise<{
  uploadUrl: string;
  assetId: string;
  gcsPath: string;
  readUrl: string;
  readUrlExpiresAt: Date;
}> {
  const assetId = `a_${nanoid(8)}`;
  const gcsPath = `editron/${userId}/media/${Date.now()}_${filename}`;
  const blob = bucket.file(gcsPath);

  // Write-signed URL (15 min window for client to upload)
  const [uploadUrl] = await blob.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  // Read-signed URL (7 days) for immediate display after upload
  const readUrlExpiresAt = new Date();
  readUrlExpiresAt.setDate(readUrlExpiresAt.getDate() + 7);

  const [readUrl] = await blob.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: readUrlExpiresAt,
  });

  return { uploadUrl, assetId, gcsPath, readUrl, readUrlExpiresAt };
}

/**
 * Check if file exists in GCS
 */
export async function fileExists(gcsPath: string): Promise<boolean> {
  const blob = bucket.file(gcsPath);
  const [exists] = await blob.exists();
  return exists;
}

/**
 * Get the actual byte size of a GCS object. Returns null if missing or unreadable —
 * callers fail open on null. GCS reports `size` as a string, so it is parsed here.
 */
export async function getGcsObjectSize(gcsPath: string): Promise<number | null> {
  return (await readGcsObjectVersionObservationV1(gcsPath))?.byteLength ?? null;
}

/**
 * Reads GCS's immutable object generation with its actual byte length. The
 * generation is provider metadata, not an Editron byte digest or canonical
 * media identity. Null remains an explicit unavailable result.
 */
export async function readGcsObjectVersionObservationV1(
  gcsPath: string,
): Promise<{ byteLength: number; generation: string } | null> {
  try {
    const blob = bucket.file(gcsPath);
    const [metadata] = await blob.getMetadata();
    const raw = metadata.size;
    const byteLength = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    const generation = typeof metadata.generation === 'string'
      ? metadata.generation.trim()
      : '';
    if (
      typeof byteLength !== 'number'
      || !Number.isSafeInteger(byteLength)
      || byteLength <= 0
      || !generation
    ) return null;
    return { byteLength, generation };
  } catch (err: unknown) {
    console.warn('[GCS] object-version observation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
