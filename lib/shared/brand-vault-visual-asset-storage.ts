import { createHash } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type {
  BrandVaultStoredVisualAssetState,
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
} from './brand-vault-visual-identity';
import type { BrandRefineryJob } from './brand-website-refinery-types';

export interface BrandVaultVisualAssetMirrorInput {
  assetId: string;
  url: string;
  kind: BrandVaultVisualAssetPreview['kind'];
  label: string;
  jobId: string;
  userId: string;
  brandId?: string;
  sourceUrl?: string;
  signalPath?: string;
}

export type BrandVaultVisualAssetMirrorResult =
  | {
      ok: true;
      provider: string;
      publicUrl: string;
      storageKey: string;
      contentType: string;
      sizeBytes: number;
      storedAt?: string;
    }
  | {
      ok: false;
      reason: string;
    };

/** Raw image bytes to persist directly (e.g. a base64 screenshot returned by a render endpoint). */
export interface BrandVaultVisualAssetBytesInput {
  assetId: string;
  base64: string;
  contentType: string;
  kind: BrandVaultVisualAssetPreview['kind'];
  label: string;
  jobId: string;
  userId: string;
  brandId?: string;
  sourceUrl?: string;
  signalPath?: string;
}

export interface BrandVaultVisualAssetStorageProvider {
  mirrorAsset(input: BrandVaultVisualAssetMirrorInput): Promise<BrandVaultVisualAssetMirrorResult>;
  /** Persist raw image bytes (optional — providers that only mirror URLs may omit it). */
  storeImageBytes?(input: BrandVaultVisualAssetBytesInput): Promise<BrandVaultVisualAssetMirrorResult>;
}

export interface BrandVaultVisualIdentityStorageResult {
  visualIdentity: BrandVaultVisualIdentitySummary;
  warnings: string[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface BrandVaultR2VisualAssetStorageOptions {
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  clock?: () => string;
  maxBytes?: number;
}

const DEFAULT_MAX_VISUAL_ASSET_BYTES = 8 * 1024 * 1024;
const VISUAL_ASSET_FETCH_TIMEOUT_MS = 12_000;
const IMAGE_CONTENT_TYPE_RE = /^image\/(?:png|jpe?g|webp|gif|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;
const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif|avif|svg|ico)(?:[?#].*)?$/i;

export async function mirrorBrandVaultVisualIdentityAssets(args: {
  visualIdentity: BrandVaultVisualIdentitySummary;
  job: BrandRefineryJob;
  provider?: BrandVaultVisualAssetStorageProvider | null;
}): Promise<BrandVaultVisualIdentityStorageResult> {
  if (!args.provider) return { visualIdentity: args.visualIdentity, warnings: [] };

  const warnings: string[] = [];
  const cache = new Map<string, Promise<BrandVaultVisualAssetMirrorResult>>();
  const mirror = async (asset: BrandVaultVisualAssetPreview): Promise<BrandVaultVisualAssetPreview> => {
    if (asset.storage?.status === 'stored') return asset;
    const targetUrl = asset.mediaType === 'video'
      ? asset.thumbnailUrl ?? asset.sampledFrameUrls?.[0]
      : asset.thumbnailUrl ?? asset.url;
    if (!targetUrl) {
      return {
        ...asset,
        storage: {
          status: 'skipped',
          reason: 'video asset has no poster frame to mirror',
        },
      };
    }
    const cacheKey = `${asset.kind}:${targetUrl}`;
    const resultPromise = cache.get(cacheKey) ?? args.provider!.mirrorAsset({
      assetId: asset.id,
      url: targetUrl,
      kind: asset.kind,
      label: asset.label,
      jobId: args.job.id,
      userId: args.job.userId,
      brandId: args.job.brandId,
      sourceUrl: asset.sourceUrl,
      signalPath: asset.signalPath,
    });
    cache.set(cacheKey, resultPromise);

    try {
      const result = await resultPromise;
      if (!result.ok) {
        warnings.push(`Brand Vault visual asset storage skipped for ${asset.label}: ${result.reason}`);
        return {
          ...asset,
          storage: {
            status: 'skipped',
            originalUrl: targetUrl,
            reason: result.reason,
          },
        };
      }

      const stored: BrandVaultStoredVisualAssetState = {
        status: 'stored',
        provider: result.provider,
        storageKey: result.storageKey,
        publicUrl: result.publicUrl,
        originalUrl: targetUrl,
        contentType: result.contentType,
        sizeBytes: result.sizeBytes,
        storedAt: result.storedAt,
      };
      return {
        ...asset,
        originalUrl: asset.originalUrl ?? asset.url,
        url: asset.mediaType === 'video' ? asset.url : result.publicUrl,
        thumbnailUrl: asset.mediaType === 'video' || asset.thumbnailUrl ? result.publicUrl : undefined,
        sampledFrameUrls: replaceMirroredFrameUrl(asset.sampledFrameUrls, targetUrl, result.publicUrl),
        storage: stored,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`Brand Vault visual asset storage failed for ${asset.label}: ${reason}`);
      return {
        ...asset,
        storage: {
          status: 'failed',
          originalUrl: targetUrl,
          reason,
        },
      };
    }
  };

  const [logos, images] = await Promise.all([
    Promise.all(args.visualIdentity.logos.map(mirror)),
    Promise.all(args.visualIdentity.images.map(mirror)),
  ]);

  return {
    visualIdentity: {
      ...args.visualIdentity,
      logos,
      images,
    },
    warnings: uniqueStrings(warnings),
  };
}

function replaceMirroredFrameUrl(values: string[] | undefined, originalUrl: string, storedUrl: string): string[] | undefined {
  if (!values?.length) return values;
  return values.map((value) => value === originalUrl ? storedUrl : value);
}

export function createBrandVaultVisualAssetStorageFromEnvironment(
  options: BrandVaultR2VisualAssetStorageOptions = {},
): BrandVaultVisualAssetStorageProvider | null {
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

  return new BrandVaultR2VisualAssetStorageProvider({
    client,
    bucketName,
    publicBaseUrl,
    fetchFn: options.fetchFn ?? fetch,
    clock: options.clock,
    maxBytes: options.maxBytes,
  });
}

class BrandVaultR2VisualAssetStorageProvider implements BrandVaultVisualAssetStorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly clock?: () => string;
  private readonly maxBytes: number;

  constructor(args: {
    client: S3Client;
    bucketName: string;
    publicBaseUrl: string;
    fetchFn: FetchLike;
    clock?: () => string;
    maxBytes?: number;
  }) {
    this.client = args.client;
    this.bucketName = args.bucketName;
    this.publicBaseUrl = args.publicBaseUrl.replace(/\/+$/, '');
    this.fetchFn = args.fetchFn;
    this.clock = args.clock;
    this.maxBytes = args.maxBytes ?? DEFAULT_MAX_VISUAL_ASSET_BYTES;
  }

  async mirrorAsset(input: BrandVaultVisualAssetMirrorInput): Promise<BrandVaultVisualAssetMirrorResult> {
    const fetched = await fetchVisualAsset(input.url, {
      fetchFn: this.fetchFn,
      maxBytes: this.maxBytes,
    });
    if (!fetched.ok) return { ok: false, reason: fetched.reason };

    const storageKey = brandVaultVisualAssetStorageKey(input, fetched.contentType);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: fetched.body,
      ContentType: fetched.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        brandVaultJobId: safeMetadataValue(input.jobId),
        brandVaultAssetId: safeMetadataValue(input.assetId),
        visualKind: safeMetadataValue(input.kind),
        sourceHash: hashText(input.url).slice(0, 24),
      },
    }));

    return {
      ok: true,
      provider: 'cloudflare_r2',
      storageKey,
      publicUrl: `${this.publicBaseUrl}/${storageKey}`,
      contentType: fetched.contentType,
      sizeBytes: fetched.body.length,
      storedAt: this.clock?.() ?? new Date().toISOString(),
    };
  }

  async storeImageBytes(input: BrandVaultVisualAssetBytesInput): Promise<BrandVaultVisualAssetMirrorResult> {
    const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_CONTENT_TYPE_RE.test(contentType)) {
      return { ok: false, reason: 'unsupported screenshot content type' };
    }

    let body: Buffer;
    try {
      body = Buffer.from(input.base64.replace(/\s+/g, ''), 'base64');
    } catch {
      return { ok: false, reason: 'screenshot bytes were not valid base64' };
    }
    if (body.length === 0) return { ok: false, reason: 'screenshot bytes were empty' };
    if (body.length > this.maxBytes) {
      return { ok: false, reason: `screenshot is larger than ${Math.round(this.maxBytes / 1024 / 1024)}MB` };
    }

    const storageKey = brandVaultVisualAssetStorageKey(
      {
        assetId: input.assetId,
        url: `bytes:${input.assetId}`,
        kind: input.kind,
        label: input.label,
        jobId: input.jobId,
        userId: input.userId,
        brandId: input.brandId,
        sourceUrl: input.sourceUrl,
        signalPath: input.signalPath,
      },
      contentType,
    );
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        brandVaultJobId: safeMetadataValue(input.jobId),
        brandVaultAssetId: safeMetadataValue(input.assetId),
        visualKind: safeMetadataValue(input.kind),
        sourceHash: hashText(input.sourceUrl ?? input.assetId).slice(0, 24),
      },
    }));

    return {
      ok: true,
      provider: 'cloudflare_r2',
      storageKey,
      publicUrl: `${this.publicBaseUrl}/${storageKey}`,
      contentType,
      sizeBytes: body.length,
      storedAt: this.clock?.() ?? new Date().toISOString(),
    };
  }
}

async function fetchVisualAsset(
  url: string,
  args: { fetchFn: FetchLike; maxBytes: number },
): Promise<{ ok: true; body: Buffer; contentType: string } | { ok: false; reason: string }> {
  const parsed = parseHttpUrl(url);
  if (!parsed) return { ok: false, reason: 'unsupported asset URL' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISUAL_ASSET_FETCH_TIMEOUT_MS);
  try {
    const response = await args.fetchFn(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.1',
        'user-agent': 'Insturix-BrandVault/1.0 (+https://www.insturix.com)',
      },
    });
    if (!response.ok) return { ok: false, reason: `source returned HTTP ${response.status}` };

    const contentType = normalizeContentType(response.headers.get('content-type'), parsed);
    if (!contentType) return { ok: false, reason: 'source is not a supported image asset' };

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > args.maxBytes) {
      return { ok: false, reason: `source image is larger than ${Math.round(args.maxBytes / 1024 / 1024)}MB` };
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) return { ok: false, reason: 'source image was empty' };
    if (body.length > args.maxBytes) {
      return { ok: false, reason: `source image is larger than ${Math.round(args.maxBytes / 1024 / 1024)}MB` };
    }

    return { ok: true, body, contentType };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function brandVaultVisualAssetStorageKey(input: BrandVaultVisualAssetMirrorInput, contentType: string): string {
  const owner = idPart(input.brandId ?? input.userId, 'brand').slice(0, 28);
  const job = idPart(input.jobId, 'job').slice(0, 42);
  const kind = idPart(input.kind, 'asset').slice(0, 24);
  const assetHash = hashText(`${input.jobId}:${input.assetId}:${input.url}`).slice(0, 16);
  return `brandvault_${owner}_${job}_${kind}_${assetHash}${extensionForContentType(contentType)}`;
}

function normalizeContentType(contentType: string | null, url: URL): string | undefined {
  const clean = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (clean && IMAGE_CONTENT_TYPE_RE.test(clean)) return clean === 'image/x-icon' ? 'image/vnd.microsoft.icon' : clean;
  if (IMAGE_EXTENSION_RE.test(url.pathname)) return contentTypeForExtension(url.pathname);
  return undefined;
}

function contentTypeForExtension(pathname: string): string | undefined {
  const lower = pathname.toLowerCase();
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

function cdnAssetBaseUrl(value: string | undefined): string | undefined {
  return value ? `${value.replace(/\/+$/, '')}/asset` : undefined;
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function parseHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return clean || fallback;
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeMetadataValue(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, 128);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
