import { createHash } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { BrandVaultSourceKind, BrandVaultUploadedAssetRole } from './brand-website-refinery-types';

export interface BrandVaultUploadAssetStorageInput {
  userId: string;
  name: string;
  mimeType?: string;
  buffer: Buffer;
  kind: BrandVaultSourceKind;
  assetRole?: BrandVaultUploadedAssetRole;
}

export type BrandVaultUploadAssetStorageResult =
  | {
      ok: true;
      provider: 'cloudflare_r2';
      publicUrl: string;
      storageKey: string;
      contentType: string;
      sizeBytes: number;
      storedAt: string;
    }
  | {
      ok: false;
      reason: string;
    };

export interface BrandVaultUploadAssetStorageProvider {
  storeUpload(input: BrandVaultUploadAssetStorageInput): Promise<BrandVaultUploadAssetStorageResult>;
}

interface BrandVaultUploadAssetStorageOptions {
  env?: Record<string, string | undefined>;
  clock?: () => string;
  maxBytes?: number;
}

const DEFAULT_MAX_UPLOAD_ASSET_BYTES = 25 * 1024 * 1024;
const IMAGE_CONTENT_TYPE_RE = /^image\/(?:png|jpe?g|webp|gif|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;
const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif|avif|svg|ico)$/i;

export function createBrandVaultUploadAssetStorageFromEnvironment(
  options: BrandVaultUploadAssetStorageOptions = {},
): BrandVaultUploadAssetStorageProvider | null {
  const env = options.env ?? process.env;
  const accountId = readEnv(env, 'BRAND_VAULT_R2_ACCOUNT_ID') ?? readEnv(env, 'R2_ACCOUNT_ID');
  const accessKeyId = readEnv(env, 'BRAND_VAULT_R2_ACCESS_KEY_ID') ?? readEnv(env, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv(env, 'BRAND_VAULT_R2_SECRET_ACCESS_KEY') ?? readEnv(env, 'R2_SECRET_ACCESS_KEY');
  const bucketName = readEnv(env, 'BRAND_VAULT_R2_BUCKET_NAME') ?? readEnv(env, 'R2_BUCKET_NAME') ?? 'editron-cdn';
  const publicBaseUrl =
    readEnv(env, 'BRAND_VAULT_R2_PUBLIC_BASE_URL') ??
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

  return new BrandVaultR2UploadAssetStorageProvider({
    client,
    bucketName,
    publicBaseUrl,
    clock: options.clock,
    maxBytes: options.maxBytes,
  });
}

export function shouldStoreBrandVaultUploadAsset(input: {
  kind: BrandVaultSourceKind;
  assetRole?: BrandVaultUploadedAssetRole;
  name: string;
  mimeType?: string;
}): boolean {
  if (input.kind !== 'uploaded_asset') return false;
  return Boolean(normalizeBrandVaultUploadContentType(input.mimeType, input.name));
}

export function normalizeBrandVaultUploadContentType(mimeType: string | undefined, name: string): string | undefined {
  const clean = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (clean && IMAGE_CONTENT_TYPE_RE.test(clean)) return clean === 'image/x-icon' ? 'image/vnd.microsoft.icon' : clean;
  if (IMAGE_EXTENSION_RE.test(name.toLowerCase())) return contentTypeForExtension(name);
  return undefined;
}

class BrandVaultR2UploadAssetStorageProvider implements BrandVaultUploadAssetStorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly clock?: () => string;
  private readonly maxBytes: number;

  constructor(args: {
    client: S3Client;
    bucketName: string;
    publicBaseUrl: string;
    clock?: () => string;
    maxBytes?: number;
  }) {
    this.client = args.client;
    this.bucketName = args.bucketName;
    this.publicBaseUrl = args.publicBaseUrl.replace(/\/+$/, '');
    this.clock = args.clock;
    this.maxBytes = args.maxBytes ?? DEFAULT_MAX_UPLOAD_ASSET_BYTES;
  }

  async storeUpload(input: BrandVaultUploadAssetStorageInput): Promise<BrandVaultUploadAssetStorageResult> {
    const contentType = normalizeBrandVaultUploadContentType(input.mimeType, input.name);
    if (!contentType) return { ok: false, reason: 'upload is not a supported visual asset' };
    if (input.buffer.length === 0) return { ok: false, reason: 'upload was empty' };
    if (input.buffer.length > this.maxBytes) {
      return { ok: false, reason: `upload is larger than ${Math.round(this.maxBytes / 1024 / 1024)}MB` };
    }

    const storageKey = brandVaultUploadStorageKey(input, contentType);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: input.buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        brandVaultUserId: safeMetadataValue(input.userId),
        uploadName: safeMetadataValue(input.name),
        uploadKind: safeMetadataValue(input.kind),
        assetRole: safeMetadataValue(input.assetRole ?? 'other'),
        sourceHash: hashBuffer(input.buffer).slice(0, 24),
      },
    }));

    return {
      ok: true,
      provider: 'cloudflare_r2',
      storageKey,
      publicUrl: `${this.publicBaseUrl}/${storageKey}`,
      contentType,
      sizeBytes: input.buffer.length,
      storedAt: this.clock?.() ?? new Date().toISOString(),
    };
  }
}

function brandVaultUploadStorageKey(input: BrandVaultUploadAssetStorageInput, contentType: string): string {
  const owner = idPart(input.userId, 'user').slice(0, 32);
  const role = idPart(input.assetRole ?? input.kind, 'asset').slice(0, 24);
  const basename = idPart(stripExtension(input.name), 'upload').slice(0, 48);
  const digest = hashText(`${input.userId}:${input.name}:${hashBuffer(input.buffer)}`).slice(0, 18);
  return `brandvault-uploads/${owner}/${role}/${basename}_${digest}${extensionForContentType(contentType)}`;
}

function contentTypeForExtension(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.ico')) return 'image/vnd.microsoft.icon';
  return undefined;
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/svg+xml') return '.svg';
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  if (contentType === 'image/avif') return '.avif';
  if (contentType === 'image/vnd.microsoft.icon') return '.ico';
  return '.img';
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

function cdnAssetBaseUrl(value: string | undefined): string | undefined {
  return value ? `${value.replace(/\/+$/, '')}/asset` : undefined;
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return clean || fallback;
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeMetadataValue(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, 128);
}
