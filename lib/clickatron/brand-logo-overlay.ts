import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { ClickatronAcceptedLogoOverlayEvidence } from '@/lib/clickatron/brand-reference-images';
import type { ClickatronApprovedLogoOverlay } from '@/lib/clickatron/brand-logo-overlay-contract';

const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_LOGO_PIXELS = 40_000_000;
const MIN_CANVAS_EDGE = 128;
const LOGO_SCALE_BY_USER_CHOICE = {
  small: 0.12,
  medium: 0.18,
  large: 0.24,
} as const;

export type ClickatronBrandLogoOverlayErrorCode =
  | 'BRAND_LOGO_OVERLAY_ASSET_UNAVAILABLE'
  | 'BRAND_LOGO_OVERLAY_ASSET_INVALID'
  | 'BRAND_LOGO_OVERLAY_STORAGE_UNAVAILABLE';

export class ClickatronBrandLogoOverlayError extends Error {
  constructor(
    readonly code: ClickatronBrandLogoOverlayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClickatronBrandLogoOverlayError';
  }
}

export interface BrandVaultLogoObjectStore {
  head(input: { bucket: string; key: string }): Promise<{
    contentType?: string;
    contentLength?: number;
  }>;
  get(input: { bucket: string; key: string }): Promise<{
    body: Buffer;
    contentType?: string;
    contentLength?: number;
  }>;
}

interface BrandVaultLogoOverlayStorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface VerifyAcceptedBrandVaultLogoOptions {
  store?: BrandVaultLogoObjectStore;
  env?: Record<string, string | undefined>;
}

export interface LoadedAcceptedBrandVaultLogo {
  buffer: Buffer;
  contentType: string;
  byteLength: number;
  sha256: string;
}

export interface ClickatronBrandLogoOverlayReceipt {
  version: 1;
  authority: 'user_review';
  treatment: 'approved_logo';
  placement: ClickatronApprovedLogoOverlay['placement'];
  scale: ClickatronApprovedLogoOverlay['scale'];
  asset: {
    assetId: string;
    source: 'brand-vault-logo';
    storageProvider: 'cloudflare_r2';
    contentType: string;
    byteLength: number;
    sha256: string;
  };
  geometry: {
    canvasWidth: number;
    canvasHeight: number;
    logoWidth: number;
    logoHeight: number;
    left: number;
    top: number;
    marginPx: number;
  };
}

export interface ClickatronBrandLogoOverlayCompositeResult {
  imageBuffer: Buffer;
  contentType: 'image/jpeg';
  receipt: ClickatronBrandLogoOverlayReceipt;
}

/**
 * Verify the exact stored logo before the Clickatron session bills a job. This
 * reads Brand Vault's R2 key directly rather than fetching a user-controlled
 * public URL, so accepted-logo delivery cannot become an SSRF path.
 */
export async function verifyAcceptedBrandVaultLogoAvailable(
  evidence: ClickatronAcceptedLogoOverlayEvidence,
  options: VerifyAcceptedBrandVaultLogoOptions = {},
): Promise<void> {
  assertOverlayEvidence(evidence);
  const store = options.store ?? createBrandVaultLogoObjectStore(options.env);
  try {
    const head = await store.head({
      bucket: brandVaultLogoOverlayStorageConfig(options.env).bucketName,
      key: evidence.storageKey,
    });
    validateStoredLogoHeaders(head, evidence);
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

/** Re-reads and validates the same R2 object immediately before Fal is called. */
export async function loadAcceptedBrandVaultLogo(
  evidence: ClickatronAcceptedLogoOverlayEvidence,
  options: VerifyAcceptedBrandVaultLogoOptions = {},
): Promise<LoadedAcceptedBrandVaultLogo> {
  assertOverlayEvidence(evidence);
  const store = options.store ?? createBrandVaultLogoObjectStore(options.env);
  try {
    const asset = await store.get({
      bucket: brandVaultLogoOverlayStorageConfig(options.env).bucketName,
      key: evidence.storageKey,
    });
    validateStoredLogoHeaders(asset, evidence);
    if (asset.body.length === 0) {
      throw new ClickatronBrandLogoOverlayError(
        'BRAND_LOGO_OVERLAY_ASSET_INVALID',
        'The accepted Brand Vault logo is empty. Replace or re-accept the logo before generating.',
      );
    }
    if (asset.body.length > MAX_LOGO_BYTES) {
      throw new ClickatronBrandLogoOverlayError(
        'BRAND_LOGO_OVERLAY_ASSET_INVALID',
        'The accepted Brand Vault logo is too large to apply safely. Replace it with a smaller image.',
      );
    }
    return {
      buffer: asset.body,
      contentType: normalizeImageContentType(asset.contentType ?? evidence.storageContentType),
      byteLength: asset.body.length,
      sha256: createHash('sha256').update(asset.body).digest('hex'),
    };
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

/**
 * Final-form owner for locked Brand Vault logos. User choice owns placement and
 * named scale; this renderer owns only pixel geometry and records it for audit.
 */
export async function compositeClickatronBrandLogoOverlay(input: {
  imageBuffer: Buffer;
  logo: LoadedAcceptedBrandVaultLogo;
  evidence: ClickatronAcceptedLogoOverlayEvidence;
  overlay: ClickatronApprovedLogoOverlay;
}): Promise<ClickatronBrandLogoOverlayCompositeResult> {
  let canvasMetadata: { width?: number; height?: number };
  try {
    canvasMetadata = await sharp(input.imageBuffer, { failOn: 'error', limitInputPixels: MAX_LOGO_PIXELS }).metadata();
  } catch {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The generated image could not be prepared for the approved logo overlay.',
    );
  }

  const canvasWidth = canvasMetadata.width;
  const canvasHeight = canvasMetadata.height;
  if (!canvasWidth || !canvasHeight || Math.min(canvasWidth, canvasHeight) < MIN_CANVAS_EDGE) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The generated image is too small for a safe approved-logo overlay.',
    );
  }

  const marginPx = Math.max(16, Math.round(Math.min(canvasWidth, canvasHeight) * 0.04));
  const availableEdge = Math.min(canvasWidth - (marginPx * 2), canvasHeight - (marginPx * 2));
  if (availableEdge <= 0) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The generated image has no usable safe area for the approved logo.',
    );
  }

  const logoMaxEdge = Math.max(
    1,
    Math.min(availableEdge, Math.round(Math.min(canvasWidth, canvasHeight) * LOGO_SCALE_BY_USER_CHOICE[input.overlay.scale])),
  );

  let resizedLogo: { data: Buffer; info: { width: number; height: number } };
  try {
    resizedLogo = await sharp(input.logo.buffer, { failOn: 'error', limitInputPixels: MAX_LOGO_PIXELS })
      .rotate()
      .resize({ width: logoMaxEdge, height: logoMaxEdge, fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The accepted Brand Vault logo cannot be rendered safely. Replace or re-accept the logo before generating.',
    );
  }

  const logoWidth = resizedLogo.info.width;
  const logoHeight = resizedLogo.info.height;
  if (!logoWidth || !logoHeight || logoWidth > availableEdge || logoHeight > availableEdge) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The accepted Brand Vault logo cannot fit within the selected safe area.',
    );
  }

  const left = input.overlay.placement.endsWith('right')
    ? canvasWidth - marginPx - logoWidth
    : marginPx;
  const top = input.overlay.placement.startsWith('bottom')
    ? canvasHeight - marginPx - logoHeight
    : marginPx;

  let imageBuffer: Buffer;
  try {
    // Fal workers request JPEG output. Retaining JPEG here avoids a content-type/key mismatch
    // in the existing Clickatron R2 manager while preserving a deterministic final raster.
    imageBuffer = await sharp(input.imageBuffer, { failOn: 'error', limitInputPixels: MAX_LOGO_PIXELS })
      .composite([{ input: resizedLogo.data, left, top }])
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The approved Brand Vault logo could not be composited onto the generated image.',
    );
  }

  return {
    imageBuffer,
    contentType: 'image/jpeg',
    receipt: {
      version: 1,
      authority: 'user_review',
      treatment: 'approved_logo',
      placement: input.overlay.placement,
      scale: input.overlay.scale,
      asset: {
        assetId: input.evidence.assetId,
        source: 'brand-vault-logo',
        storageProvider: 'cloudflare_r2',
        contentType: input.logo.contentType,
        byteLength: input.logo.byteLength,
        sha256: input.logo.sha256,
      },
      geometry: {
        canvasWidth,
        canvasHeight,
        logoWidth,
        logoHeight,
        left,
        top,
        marginPx,
      },
    },
  };
}

function assertOverlayEvidence(evidence: ClickatronAcceptedLogoOverlayEvidence): void {
  if (
    evidence.assetRole !== 'logo'
    || evidence.source !== 'brand-vault-logo'
    || evidence.isStoredAsset !== true
    || evidence.storageProvider !== 'cloudflare_r2'
    || !evidence.assetId
    || !evidence.storageKey
  ) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_UNAVAILABLE',
      'Choose an accepted stored Brand Vault logo before generating this creative.',
    );
  }
}

function validateStoredLogoHeaders(
  asset: { contentType?: string; contentLength?: number },
  evidence: ClickatronAcceptedLogoOverlayEvidence,
): void {
  normalizeImageContentType(asset.contentType ?? evidence.storageContentType);
  const contentLength = asset.contentLength;
  if (typeof contentLength === 'number' && (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_LOGO_BYTES)) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_INVALID',
      'The accepted Brand Vault logo is missing, empty, or too large to apply safely.',
    );
  }
}

function normalizeImageContentType(value: unknown): string {
  const contentType = typeof value === 'string' ? value.split(';')[0]?.trim().toLowerCase() : '';
  if (/^image\/(?:png|jpe?g|webp|avif|gif|svg\+xml)$/i.test(contentType)) return contentType;
  throw new ClickatronBrandLogoOverlayError(
    'BRAND_LOGO_OVERLAY_ASSET_INVALID',
    'The accepted Brand Vault logo is not a supported image asset.',
  );
}

function brandVaultLogoOverlayStorageConfig(
  env: Record<string, string | undefined> = process.env,
): BrandVaultLogoOverlayStorageConfig {
  const accountId = readEnv(env, 'BRAND_VAULT_R2_ACCOUNT_ID') ?? readEnv(env, 'R2_ACCOUNT_ID');
  const accessKeyId = readEnv(env, 'BRAND_VAULT_R2_ACCESS_KEY_ID') ?? readEnv(env, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv(env, 'BRAND_VAULT_R2_SECRET_ACCESS_KEY') ?? readEnv(env, 'R2_SECRET_ACCESS_KEY');
  const bucketName = readEnv(env, 'BRAND_VAULT_R2_BUCKET_NAME') ?? readEnv(env, 'R2_BUCKET_NAME') ?? 'editron-cdn';
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_STORAGE_UNAVAILABLE',
      'Approved-logo generation is temporarily unavailable because Brand Vault storage is not configured.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function createBrandVaultLogoObjectStore(
  env: Record<string, string | undefined> | undefined,
): BrandVaultLogoObjectStore {
  const config = brandVaultLogoOverlayStorageConfig(env);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    async head(input) {
      const result = await client.send(new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }));
      return { contentType: result.ContentType, contentLength: result.ContentLength };
    },
    async get(input) {
      const result = await client.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
      return {
        body: await readObjectBody(result.Body),
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    },
  };
}

async function readObjectBody(body: unknown): Promise<Buffer> {
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> } | null;
  if (transformable?.transformToByteArray) return Buffer.from(await transformable.transformToByteArray());

  if (body && typeof body === 'object' && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new ClickatronBrandLogoOverlayError(
    'BRAND_LOGO_OVERLAY_STORAGE_UNAVAILABLE',
    'Approved-logo generation is temporarily unavailable because Brand Vault storage returned no readable asset.',
  );
}

function normalizeStorageError(error: unknown): ClickatronBrandLogoOverlayError {
  if (error instanceof ClickatronBrandLogoOverlayError) return error;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode;
  if (status === 404) {
    return new ClickatronBrandLogoOverlayError(
      'BRAND_LOGO_OVERLAY_ASSET_UNAVAILABLE',
      'The accepted Brand Vault logo is no longer available. Choose or upload a current logo before generating.',
    );
  }
  return new ClickatronBrandLogoOverlayError(
    'BRAND_LOGO_OVERLAY_STORAGE_UNAVAILABLE',
    'Approved-logo generation is temporarily unavailable because Brand Vault storage could not be reached.',
  );
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}
