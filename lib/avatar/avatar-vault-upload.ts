import { createHash, randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { AvatarReferenceRole } from '@/lib/avatar/avatar-profile';

const MAX_AVATAR_UPLOAD_BYTES = 12 * 1024 * 1024;
const IMAGE_CONTENT_TYPE_RE = /^image\/(?:png|jpe?g|webp|gif|avif)$/i;
const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif|avif)$/i;
const AVATAR_REFERENCE_ROLES = [
  'face_front',
  'face_side',
  'full_body_front',
  'full_body_side',
  'expression',
  'pose',
  'wardrobe',
  'product_context',
] as const satisfies AvatarReferenceRole[];

export type AvatarVaultUploadRole = (typeof AVATAR_REFERENCE_ROLES)[number];

export type AvatarVaultUploadErrorCode =
  | 'invalid_form_data'
  | 'missing_file'
  | 'invalid_role'
  | 'unsupported_file_type'
  | 'empty_file'
  | 'file_too_large'
  | 'storage_not_configured'
  | 'storage_failed';

type AvatarVaultUploadValidationResult =
  | { ok: true; role: AvatarVaultUploadRole; contentType: string }
  | { ok: false; status: number; code: AvatarVaultUploadErrorCode; message: string };

interface AvatarVaultUploadStorageInput {
  userId: string;
  name: string;
  contentType: string;
  buffer: Buffer;
  role: AvatarVaultUploadRole;
}

interface AvatarVaultUploadStorageResult {
  assetId: string;
  publicUrl: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  storedAt: string;
}

interface AvatarVaultUploadStorageProvider {
  storeUpload(input: AvatarVaultUploadStorageInput): Promise<AvatarVaultUploadStorageResult>;
}

export function validateAvatarVaultUploadInput(input: {
  name: string;
  mimeType?: string;
  sizeBytes: number;
  role?: string | null;
}): AvatarVaultUploadValidationResult {
  const role = parseAvatarVaultUploadRole(input.role);
  if (!role) return { ok: false, status: 400, code: 'invalid_role', message: 'Choose a supported avatar reference role.' };

  const contentType = normalizeAvatarVaultUploadContentType(input.mimeType, input.name);
  if (!contentType) {
    return { ok: false, status: 415, code: 'unsupported_file_type', message: 'Avatar uploads must be PNG, JPEG, WebP, GIF, or AVIF images.' };
  }
  if (input.sizeBytes <= 0) return { ok: false, status: 400, code: 'empty_file', message: 'Avatar upload was empty.' };
  if (input.sizeBytes > MAX_AVATAR_UPLOAD_BYTES) {
    return { ok: false, status: 413, code: 'file_too_large', message: 'Avatar images are limited to 12MB.' };
  }

  return { ok: true, role, contentType };
}

export function normalizeAvatarVaultUploadContentType(mimeType: string | undefined, name: string): string | undefined {
  const clean = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (clean && IMAGE_CONTENT_TYPE_RE.test(clean)) return clean === 'image/jpg' ? 'image/jpeg' : clean;
  if (IMAGE_EXTENSION_RE.test(name.toLowerCase())) return contentTypeForExtension(name);
  return undefined;
}

export function parseAvatarVaultUploadRole(value: string | null | undefined): AvatarVaultUploadRole | undefined {
  return AVATAR_REFERENCE_ROLES.find((role) => role === value);
}

export function createAvatarVaultUploadStorageFromEnvironment(
  options: { env?: Record<string, string | undefined>; clock?: () => string } = {},
): AvatarVaultUploadStorageProvider | null {
  const env = options.env ?? process.env;
  const accountId = readEnv(env, 'AVATAR_VAULT_R2_ACCOUNT_ID') ?? readEnv(env, 'R2_ACCOUNT_ID');
  const accessKeyId = readEnv(env, 'AVATAR_VAULT_R2_ACCESS_KEY_ID') ?? readEnv(env, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv(env, 'AVATAR_VAULT_R2_SECRET_ACCESS_KEY') ?? readEnv(env, 'R2_SECRET_ACCESS_KEY');
  const bucketName = readEnv(env, 'AVATAR_VAULT_R2_BUCKET_NAME') ?? readEnv(env, 'R2_BUCKET_NAME') ?? 'editron-cdn';
  const publicBaseUrl =
    readEnv(env, 'AVATAR_VAULT_R2_PUBLIC_BASE_URL') ??
    readEnv(env, 'R2_PUBLIC_BASE_URL') ??
    cdnAssetBaseUrl(readEnv(env, 'CDN_WORKER_URL'));

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async storeUpload(input) {
      const storedAt = options.clock?.() ?? new Date().toISOString();
      const assetId = createAvatarVaultUploadAssetId(input.role);
      const storageKey = buildAvatarVaultUploadStorageKey({
        userId: input.userId,
        role: input.role,
        assetId,
        contentType: input.contentType,
      });

      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        Body: input.buffer,
        ContentType: input.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          avatarVaultUserId: safeMetadataValue(input.userId),
          avatarReferenceRole: safeMetadataValue(input.role),
          uploadName: safeMetadataValue(input.name),
          uploadedAt: storedAt,
          sourceHash: hashBuffer(input.buffer).slice(0, 24),
        },
      }));

      return {
        assetId,
        storageKey,
        publicUrl: `${publicBaseUrl.replace(/\/+$/, '')}/${storageKey}`,
        contentType: input.contentType,
        sizeBytes: input.buffer.length,
        storedAt,
      };
    },
  };
}

export function buildAvatarVaultUploadStorageKey(input: {
  userId: string;
  role: AvatarVaultUploadRole;
  assetId: string;
  contentType: string;
}): string {
  const owner = idPart(input.userId, 'user').slice(0, 32);
  return `avatar-vault/${owner}/${input.role}/${idPart(input.assetId, 'avatar')}${extensionForContentType(input.contentType)}`;
}

function createAvatarVaultUploadAssetId(role: AvatarVaultUploadRole): string {
  return `avatar_${role}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function contentTypeForExtension(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  return undefined;
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  if (contentType === 'image/avif') return '.avif';
  return '.img';
}

function cdnAssetBaseUrl(value: string | undefined): string | undefined {
  return value ? `${value.replace(/\/+$/, '')}/asset` : undefined;
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96);
  return clean || fallback;
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeMetadataValue(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, 128);
}
