import { createHash } from 'node:crypto';

import type { UploadResult } from '@/lib/editron/services/upload-service';
import type { ReferenceVideoSource } from './reference-video-source';

export type CanonicalReferenceStorageKindV1 =
  | 'asset'
  | 'materialized-asset'
  | 'materialized-remote';

export interface CanonicalReferenceStorageV1 {
  upload: Readonly<UploadResult>;
  filename: string;
  contentSha256: string;
  canonicalKind: CanonicalReferenceStorageKindV1;
}

export interface CanonicalReferenceFileIdentityV1 {
  filePath: string;
  byteLength: number;
  contentSha256: string;
}

export class ReferenceSourceStorageErrorV1 extends Error {}

/**
 * Resolves exact reference bytes to one immutable mediaAssets identity. Managed
 * asset sources reuse their existing R2/GCS object; unmanaged/remote sources
 * receive a private content-addressed upload. The original asset is untouched.
 */
export async function resolveCanonicalReferenceStorageV1(
  input: Readonly<{
    userId: string;
    source: Readonly<ReferenceVideoSource>;
    bytes: Buffer;
  }>,
  deps: Readonly<{
    uploadCanonicalBytes: (
      bytes: Buffer,
      userId: string,
      filename: string,
      contentType: string,
      canonicalAssetId: string,
    ) => Promise<UploadResult>;
  }>,
): Promise<Readonly<CanonicalReferenceStorageV1>> {
  if (!input.userId.trim()) fail('USER_ID_REQUIRED');
  if (!Buffer.isBuffer(input.bytes) || input.bytes.byteLength < 1) fail('BYTES_REQUIRED');

  const contentSha256 = createHash('sha256').update(input.bytes).digest('hex');
  return resolveCanonicalReferenceStorageIdentityV1({
    userId: input.userId,
    source: input.source,
    byteLength: input.bytes.byteLength,
    contentSha256,
  }, {
    uploadCanonical: (userId, filename, contentType, canonicalAssetId) =>
      deps.uploadCanonicalBytes(
        input.bytes, userId, filename, contentType, canonicalAssetId,
      ),
  });
}

/** File-backed storage decision used by long-form reference materialization. */
export async function resolveCanonicalReferenceFileStorageV1(
  input: Readonly<{
    userId: string;
    source: Readonly<ReferenceVideoSource>;
    file: Readonly<CanonicalReferenceFileIdentityV1>;
  }>,
  deps: Readonly<{
    uploadCanonicalFile: (
      filePath: string,
      userId: string,
      filename: string,
      contentType: string,
      canonicalAssetId: string,
    ) => Promise<UploadResult>;
  }>,
): Promise<Readonly<CanonicalReferenceStorageV1>> {
  if (typeof input.file.filePath !== 'string' || !input.file.filePath.trim()) {
    fail('FILE_PATH_REQUIRED');
  }
  return resolveCanonicalReferenceStorageIdentityV1({
    userId: input.userId,
    source: input.source,
    byteLength: input.file.byteLength,
    contentSha256: input.file.contentSha256,
  }, {
    uploadCanonical: (userId, filename, contentType, canonicalAssetId) =>
      deps.uploadCanonicalFile(
        input.file.filePath, userId, filename, contentType, canonicalAssetId,
      ),
  });
}

async function resolveCanonicalReferenceStorageIdentityV1(
  input: Readonly<{
    userId: string;
    source: Readonly<ReferenceVideoSource>;
    byteLength: number;
    contentSha256: string;
  }>,
  deps: Readonly<{
    uploadCanonical: (
      userId: string,
      filename: string,
      contentType: string,
      canonicalAssetId: string,
    ) => Promise<UploadResult>;
  }>,
): Promise<Readonly<CanonicalReferenceStorageV1>> {
  if (!input.userId.trim()) fail('USER_ID_REQUIRED');
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1) {
    fail('BYTE_LENGTH_INVALID');
  }
  if (!/^[a-f0-9]{64}$/.test(input.contentSha256)) fail('CONTENT_SHA256_INVALID');
  const canonicalAssetId = buildCanonicalReferenceSourceAssetIdV1(
    input.userId,
    input.source.referenceId,
    input.contentSha256,
  );
  const contentType = resolveReferenceVideoContentTypeV1(input.source);
  const filename = buildCanonicalReferenceFilenameV1(input.source, contentType);
  const existingStorage = buildExistingManagedStorageUpload(
    input.source, canonicalAssetId, input.byteLength, contentType,
  );
  if (existingStorage) {
    return {
      upload: existingStorage,
      filename,
      contentSha256: input.contentSha256,
      canonicalKind: 'asset',
    };
  }

  const upload = await deps.uploadCanonical(
    input.userId, filename, contentType, canonicalAssetId,
  );
  return {
    upload,
    filename,
    contentSha256: input.contentSha256,
    canonicalKind: input.source.kind === 'remote-url'
      ? 'materialized-remote'
      : 'materialized-asset',
  };
}

export function buildCanonicalReferenceSourceAssetIdV1(
  userId: string,
  sourceReferenceId: string,
  sourceContentSha256: string,
): string {
  const actor = identity(userId, 'USER_ID');
  const source = identity(sourceReferenceId, 'SOURCE_REFERENCE_ID');
  if (!/^[a-f0-9]{64}$/.test(sourceContentSha256)) fail('CONTENT_SHA256_INVALID');
  const material = `${actor}|${source}|${sourceContentSha256}`;
  return `ref_canon_${createHash('sha256').update(material).digest('hex').slice(0, 20)}`;
}

function buildExistingManagedStorageUpload(
  source: Readonly<ReferenceVideoSource>,
  canonicalAssetId: string,
  byteLength: number,
  contentType: string,
): UploadResult | null {
  if (source.kind !== 'asset' || !source.asset) return null;
  const r2Key = nonEmpty(source.asset.r2Key);
  const gcsPath = nonEmpty(source.asset.gcsPath);
  if (!r2Key && !gcsPath) return null;
  return {
    assetId: canonicalAssetId,
    signedUrl: httpUrl(source.videoUrl),
    gcsPath,
    r2Key,
    // R2 browser URLs are permanent in UploadResult. An importer may carry a
    // compatibility Date on MediaAsset, but that must not become a false
    // expiry on the canonical alias.
    urlExpiresAt: r2Key ? null : validDateOrNull(source.asset.urlExpiresAt),
    size: byteLength,
    contentType,
  };
}

function resolveReferenceVideoContentTypeV1(source: Readonly<ReferenceVideoSource>): string {
  const declared = source.asset
    ? nonEmpty((source.asset as unknown as { contentType?: unknown }).contentType)
    : null;
  if (declared?.toLowerCase().startsWith('video/')) return declared.toLowerCase();

  const candidates = [source.asset?.filename, source.sourceLabel, urlPath(source.videoUrl)]
    .filter((value): value is string => Boolean(value));
  if (candidates.some((value) => /\.webm$/i.test(value))) return 'video/webm';
  if (candidates.some((value) => /\.mov$/i.test(value))) return 'video/quicktime';
  if (candidates.some((value) => /\.m4v$/i.test(value))) return 'video/x-m4v';
  if (candidates.some((value) => /\.mp4$/i.test(value))) return 'video/mp4';
  fail('CONTENT_TYPE_UNRESOLVED');
}

function buildCanonicalReferenceFilenameV1(
  source: Readonly<ReferenceVideoSource>,
  contentType: string,
): string {
  const base = sanitizeAssetPart(source.asset?.filename || source.sourceLabel || 'reference-video');
  if (/\.(?:mp4|mov|webm|m4v)$/i.test(base)) return base;
  const extension = contentType === 'video/webm'
    ? '.webm'
    : contentType === 'video/quicktime'
      ? '.mov'
      : contentType === 'video/x-m4v'
        ? '.m4v'
        : '.mp4';
  return `${base || 'reference-video'}${extension}`;
}

function sanitizeAssetPart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function urlPath(value: string): string | null {
  try { return new URL(value).pathname; } catch { return null; }
}

function httpUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { fail('SOURCE_URL_INVALID'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') fail('SOURCE_URL_INVALID');
  return parsed.toString();
}

function validDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) fail('URL_EXPIRY_INVALID');
  return new Date(date.getTime());
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identity(value: string, label: string): string {
  const text = value.trim();
  if (!text || text.length > 240 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)) {
    fail(`${label}_INVALID`);
  }
  return text;
}

function fail(code: string): never {
  throw new ReferenceSourceStorageErrorV1(`EDITRON_REFERENCE_SOURCE_STORAGE_${code}`);
}
