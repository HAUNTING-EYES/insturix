import { createHash } from 'node:crypto';

import type { ReferenceCanonicalEnvelope } from '@/lib/editron/services/asset-resolver';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { UploadResult } from '@/lib/editron/services/upload-service';

export const REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1 =
  'EDITRON_REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_V1_1' as const;
const LEGACY_REFERENCE_ENVELOPE_VERSION_V1 = 'editron-r1-reference-envelope-v1' as const;
const CURRENT_REFERENCE_ENVELOPE_VERSION_V2 = 'editron-r1-reference-envelope-v2' as const;
const CURRENT_DEMUX_RECEIPT_VERSION_V2 = 'editron-r1-demux-receipt-v2' as const;

export type ReferenceMaterializedMediaKindV1 = 'video' | 'audio' | 'image';
export type ReferenceMaterializedMediaOwnerV1 =
  | Readonly<{ type: 'USER'; userId: string }>
  | Readonly<{ type: 'ORG'; orgId: string }>;
export type ReferenceMaterializedMediaRoleV1 =
  | Readonly<{ kind: 'SOURCE'; referenceEnvelope: Readonly<ReferenceCanonicalEnvelope> }>
  | Readonly<{
      kind: 'DERIVED_FRAME'; sourceAssetId: string; frameId: string; timestampUs: string;
    }>
  | Readonly<{
      kind: 'DERIVED_STREAM';
      sourceAssetId: string;
      streamKind: 'VIDEO' | 'AUDIO';
      demuxReceiptSha256: string;
    }>;

export interface ReferenceMaterializationProvenanceV1 {
  version: typeof REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1;
  role: 'SOURCE' | 'DERIVED_FRAME' | 'DERIVED_STREAM';
  sourceAssetId?: string;
  frameId?: string;
  timestampUs?: string;
  streamKind?: 'VIDEO' | 'AUDIO';
  demuxReceiptSha256?: string;
  referenceEnvelopeSha256?: string;
}

export interface ReferenceMaterializedMediaAssetRowV1 {
  assetId: string;
  userId: string;
  orgId?: string;
  type: ReferenceMaterializedMediaKindV1;
  filename: string;
  contentType: string;
  source: 'user-upload';
  cachedUrl: string;
  gcsPath: string | null;
  r2Key?: string;
  urlExpiresAt: Date | null;
  size: number;
  contentHash: string;
  uploadedAt: Date;
  referenceEnvelope?: Readonly<ReferenceCanonicalEnvelope>;
  referenceMaterialization: Readonly<ReferenceMaterializationProvenanceV1>;
}

export interface ReferenceMaterializedMediaRegistrationInputV1 {
  bytes: Uint8Array;
  upload: Readonly<UploadResult>;
  actorUserId: string;
  mediaOwner: Readonly<ReferenceMaterializedMediaOwnerV1>;
  mediaKind: ReferenceMaterializedMediaKindV1;
  filename: string;
  role: ReferenceMaterializedMediaRoleV1;
  uploadedAt?: Date;
}

export type ReferenceMaterializedMediaIdentityRegistrationInputV1 = Readonly<
  Omit<ReferenceMaterializedMediaRegistrationInputV1, 'bytes'> & {
    byteLength: number;
    bytesSha256: string;
  }
>;

export class ReferenceMaterializedMediaRegistrationErrorV1 extends Error {}

export function normalizeReferenceMaterializedMediaRegistrationV1(
  input: Readonly<ReferenceMaterializedMediaRegistrationInputV1>,
) {
  const bytes = input.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) fail('BYTES_INVALID');
  return normalizeReferenceMaterializedMediaIdentityRegistrationV1({
    ...input,
    byteLength: bytes.byteLength,
    bytesSha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Owner-internal normalization for content identity measured from a stream.
 * Callers must not supply an unverified hash; the file registration owner
 * computes it while reading the local file and then enters through this seam.
 */
export function normalizeReferenceMaterializedMediaIdentityRegistrationV1(
  input: ReferenceMaterializedMediaIdentityRegistrationInputV1,
) {
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1) {
    fail('BYTE_LENGTH_INVALID');
  }
  const bytesSha256 = sha256(input.bytesSha256, 'BYTES_SHA256');
  const actorUserId = identity(input.actorUserId, 'ACTOR_USER_ID');
  const mediaOwner = normalizeOwner(input.mediaOwner, actorUserId);
  const assetId = identity(input.upload.assetId, 'ASSET_ID');
  const contentType = mediaContentType(input.upload.contentType, input.mediaKind);
  if (!Number.isSafeInteger(input.upload.size) || input.upload.size !== input.byteLength) {
    fail('BYTE_LENGTH_MISMATCH');
  }
  const storage = canonicalStorage(input.upload);
  const normalizedRole = normalizeRole(input.role, bytesSha256, input.mediaKind);
  const row: ReferenceMaterializedMediaAssetRowV1 = {
    assetId,
    userId: actorUserId,
    ...(mediaOwner.type === 'ORG' ? { orgId: mediaOwner.orgId } : {}),
    type: input.mediaKind,
    filename: boundedText(input.filename, 'FILENAME', 512),
    contentType,
    source: 'user-upload',
    cachedUrl: httpUrl(input.upload.signedUrl),
    gcsPath: nullableStorageKey(input.upload.gcsPath, 'GCS_PATH'),
    ...(input.upload.r2Key ? { r2Key: storageKey(input.upload.r2Key, 'R2_KEY') } : {}),
    urlExpiresAt: validDateOrNull(input.upload.urlExpiresAt, 'URL_EXPIRES_AT'),
    size: input.byteLength,
    contentHash: bytesSha256,
    uploadedAt: validDate(input.uploadedAt ?? new Date(), 'UPLOADED_AT'),
    ...(normalizedRole.referenceEnvelope
      ? { referenceEnvelope: normalizedRole.referenceEnvelope }
      : {}),
    referenceMaterialization: normalizedRole.provenance,
  };
  return {
    row,
    assetId,
    mediaOwner,
    contentType,
    storage,
    bytesSha256,
    provenance: normalizedRole.provenance,
  } as const;
}

export function assertReferenceMaterializedMediaStoredRowV1(
  value: unknown,
  expected: Readonly<ReferenceMaterializedMediaAssetRowV1>,
  mediaOwner: Readonly<ReferenceMaterializedMediaOwnerV1>,
  storage: Readonly<{ backend: 'R2' | 'GCS'; key: string }>,
): void {
  const stored = record(value, 'STORED_ROW');
  if (stored.assetId !== expected.assetId || stored.userId !== expected.userId
    || stored.type !== expected.type || stored.source !== 'user-upload'
    || stored.contentType !== expected.contentType || stored.size !== expected.size
    || stored.contentHash !== expected.contentHash) {
    fail('STORED_IDENTITY_MISMATCH');
  }
  if (mediaOwner.type === 'USER') {
    if (stored.orgId !== undefined) fail('STORED_OWNER_MISMATCH');
  } else if (stored.orgId !== mediaOwner.orgId) {
    fail('STORED_OWNER_MISMATCH');
  }
  const storedKey = storage.backend === 'R2' ? stored.r2Key : stored.gcsPath;
  if (storedKey !== storage.key) fail('STORED_STORAGE_MISMATCH');
  if (hashEditronCanonicalJsonV1(stored.referenceMaterialization)
    !== hashEditronCanonicalJsonV1(expected.referenceMaterialization)) {
    fail('STORED_PROVENANCE_MISMATCH');
  }
  if (expected.referenceEnvelope
    && hashEditronCanonicalJsonV1(stored.referenceEnvelope)
      !== hashEditronCanonicalJsonV1(expected.referenceEnvelope)) {
    fail('STORED_ENVELOPE_MISMATCH');
  }
}

function normalizeRole(
  role: ReferenceMaterializedMediaRoleV1,
  bytesSha256: string,
  mediaKind: ReferenceMaterializedMediaKindV1,
) {
  if (role.kind === 'SOURCE') {
    const referenceEnvelope = normalizeEnvelope(role.referenceEnvelope, bytesSha256);
    return {
      referenceEnvelope,
      provenance: {
        version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
        role: 'SOURCE' as const,
        referenceEnvelopeSha256: hashEditronCanonicalJsonV1(referenceEnvelope),
      },
    };
  }
  if (role.kind === 'DERIVED_FRAME') {
    return {
      provenance: {
        version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
        role: 'DERIVED_FRAME' as const,
        sourceAssetId: identity(role.sourceAssetId, 'SOURCE_ASSET_ID'),
        frameId: identity(role.frameId, 'FRAME_ID'),
        timestampUs: timestampUs(role.timestampUs),
      },
    };
  }
  if ((role.streamKind === 'VIDEO' && mediaKind !== 'video')
    || (role.streamKind === 'AUDIO' && mediaKind !== 'audio')) {
    fail('DERIVED_STREAM_KIND_MISMATCH');
  }
  return {
    provenance: {
      version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
      role: 'DERIVED_STREAM' as const,
      sourceAssetId: identity(role.sourceAssetId, 'SOURCE_ASSET_ID'),
      streamKind: role.streamKind,
      demuxReceiptSha256: sha256(role.demuxReceiptSha256, 'DEMUX_RECEIPT_SHA256'),
    },
  };
}

function normalizeEnvelope(
  value: Readonly<ReferenceCanonicalEnvelope>,
  bytesSha256: string,
): Readonly<ReferenceCanonicalEnvelope> {
  const candidate = record(value, 'REFERENCE_ENVELOPE');
  exactKeys(candidate, ['version', 'contentHash', 'audioUsageMode', 'demux'], 'REFERENCE_ENVELOPE');
  const version = identity(candidate.version, 'REFERENCE_ENVELOPE_VERSION');
  if (version !== LEGACY_REFERENCE_ENVELOPE_VERSION_V1
    && version !== CURRENT_REFERENCE_ENVELOPE_VERSION_V2) {
    fail('REFERENCE_ENVELOPE_VERSION_UNSUPPORTED');
  }
  const contentHash = sha256(candidate.contentHash, 'REFERENCE_ENVELOPE_CONTENT');
  if (contentHash !== bytesSha256) fail('REFERENCE_ENVELOPE_CONTENT_MISMATCH');
  const audioUsageMode = candidate.audioUsageMode;
  if (audioUsageMode !== 'preview-waveform-only' && audioUsageMode !== 'export-attested') {
    fail('REFERENCE_ENVELOPE_AUDIO_MODE_INVALID');
  }
  if (candidate.demux === null) {
    if (version === CURRENT_REFERENCE_ENVELOPE_VERSION_V2) {
      fail('REFERENCE_ENVELOPE_DEMUX_REQUIRED');
    }
    return {
      version: LEGACY_REFERENCE_ENVELOPE_VERSION_V1,
      contentHash,
      audioUsageMode,
      demux: null,
    };
  }

  const source = record(candidate.demux, 'REFERENCE_ENVELOPE_DEMUX');
  const commonKeys = [
    'version', 'demuxedAt', 'durationMs', 'videoSha256', 'audioSha256', 'audioPresent',
  ];
  exactKeys(source, version === LEGACY_REFERENCE_ENVELOPE_VERSION_V1
    ? commonKeys
    : [
        ...commonKeys,
        'receiptSha256',
        'coreReceiptSha256',
        'videoRegistrationReceiptSha256',
        'audioRegistrationReceiptSha256',
      ], 'REFERENCE_ENVELOPE_DEMUX');
  const durationMs = source.durationMs;
  if (durationMs !== null && (!Number.isSafeInteger(durationMs) || Number(durationMs) < 0)) {
    fail('REFERENCE_ENVELOPE_DURATION_INVALID');
  }
  if (typeof source.audioPresent !== 'boolean') fail('REFERENCE_ENVELOPE_AUDIO_PRESENT_INVALID');
  const demuxVersion = identity(source.version, 'REFERENCE_ENVELOPE_DEMUX_VERSION');
  const demuxedAt = validDate(new Date(String(source.demuxedAt)), 'REFERENCE_ENVELOPE_DEMUXED_AT')
    .toISOString();
  const videoSha256 = sha256(source.videoSha256, 'REFERENCE_ENVELOPE_VIDEO');
  const audioSha256 = source.audioSha256 === null
    ? null
    : sha256(source.audioSha256, 'REFERENCE_ENVELOPE_AUDIO');

  if (version === LEGACY_REFERENCE_ENVELOPE_VERSION_V1) {
    return {
      version: LEGACY_REFERENCE_ENVELOPE_VERSION_V1,
      contentHash,
      audioUsageMode,
      demux: {
        version: demuxVersion,
        demuxedAt,
        durationMs: durationMs === null ? null : Number(durationMs),
        videoSha256,
        audioSha256,
        audioPresent: source.audioPresent,
      },
    };
  }

  if (demuxVersion !== CURRENT_DEMUX_RECEIPT_VERSION_V2) {
    fail('REFERENCE_ENVELOPE_DEMUX_VERSION_UNSUPPORTED');
  }
  const audioRegistrationReceiptSha256 = source.audioRegistrationReceiptSha256 === null
    ? null
    : sha256(source.audioRegistrationReceiptSha256, 'REFERENCE_ENVELOPE_AUDIO_REGISTRATION');
  if (source.audioPresent !== (audioSha256 !== null && audioRegistrationReceiptSha256 !== null)) {
    fail('REFERENCE_ENVELOPE_AUDIO_BINDING_INCONSISTENT');
  }
  return {
    version: CURRENT_REFERENCE_ENVELOPE_VERSION_V2,
    contentHash,
    audioUsageMode,
    demux: {
      version: CURRENT_DEMUX_RECEIPT_VERSION_V2,
      demuxedAt,
      durationMs: durationMs === null ? null : Number(durationMs),
      videoSha256,
      audioSha256,
      audioPresent: source.audioPresent,
      receiptSha256: sha256(source.receiptSha256, 'REFERENCE_ENVELOPE_DEMUX_RECEIPT'),
      coreReceiptSha256: sha256(source.coreReceiptSha256, 'REFERENCE_ENVELOPE_DEMUX_CORE'),
      videoRegistrationReceiptSha256: sha256(
        source.videoRegistrationReceiptSha256,
        'REFERENCE_ENVELOPE_VIDEO_REGISTRATION',
      ),
      audioRegistrationReceiptSha256,
    },
  };
}

function normalizeOwner(
  value: Readonly<ReferenceMaterializedMediaOwnerV1>,
  actorUserId: string,
): Readonly<ReferenceMaterializedMediaOwnerV1> {
  if (value.type === 'USER') {
    const userId = identity(value.userId, 'MEDIA_OWNER_USER_ID');
    if (userId !== actorUserId) fail('MEDIA_OWNER_ACTOR_MISMATCH');
    return { type: 'USER', userId };
  }
  return { type: 'ORG', orgId: identity(value.orgId, 'MEDIA_OWNER_ORG_ID') };
}

function canonicalStorage(upload: Readonly<UploadResult>) {
  if (upload.r2Key) return { backend: 'R2' as const, key: storageKey(upload.r2Key, 'R2_KEY') };
  if (upload.gcsPath) return { backend: 'GCS' as const, key: storageKey(upload.gcsPath, 'GCS_PATH') };
  fail('STORAGE_IDENTITY_MISSING');
}

function mediaContentType(value: unknown, kind: ReferenceMaterializedMediaKindV1): string {
  const contentType = boundedText(value, 'CONTENT_TYPE', 160).toLowerCase();
  if (!contentType.startsWith(`${kind}/`)) fail('CONTENT_TYPE_KIND_MISMATCH');
  return contentType;
}

function httpUrl(value: unknown): string {
  const text = boundedText(value, 'CACHED_URL', 4_096);
  let parsed: URL;
  try { parsed = new URL(text); } catch { fail('CACHED_URL_INVALID'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') fail('CACHED_URL_INVALID');
  return parsed.toString();
}

function nullableStorageKey(value: unknown, label: string): string | null {
  return value === null ? null : storageKey(value, label);
}

function storageKey(value: unknown, label: string): string {
  const text = boundedText(value, label, 1_024);
  if (/[\u0000-\u001f\u007f]/.test(text)) fail(`${label}_INVALID`);
  return text;
}

function identity(value: unknown, label: string): string {
  const text = boundedText(value, label, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)) fail(`${label}_INVALID`);
  return text;
}

function timestampUs(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,17})$/.test(value)) {
    fail('TIMESTAMP_US_INVALID');
  }
  return value;
}

function boundedText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) fail(`${label}_INVALID`);
  return text;
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(`${label}_INVALID`);
  return new Date(value.getTime());
}

function validDateOrNull(value: Date | null, label: string): Date | null {
  return value === null ? null : validDate(value, label);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    fail(`${label}_FIELDS_INVALID`);
  }
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label}_INVALID`);
  return value;
}

function fail(code: string): never {
  throw new ReferenceMaterializedMediaRegistrationErrorV1(
    `EDITRON_REFERENCE_MATERIALIZED_MEDIA_${code}`,
  );
}
