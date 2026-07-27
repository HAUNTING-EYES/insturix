import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';

import {
  getS3Client,
} from '../lib/editron/services/r2-service';
import {
  parseSfxCatalogManifest,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../lib/pipeline/sfx-catalog';
import {
  parseSfxCatalogUploadPlan,
  resolveLicensedSourcePath,
  type SfxCatalogUploadPlan,
} from './curate-sfx-catalog';

export interface SfxCatalogObjectWrite {
  key: string;
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

export interface SfxCatalogStoredObject {
  body: Buffer;
  contentType?: string;
  metadata: Record<string, string>;
}

export interface SfxCatalogObjectStore {
  putIfAbsent(input: SfxCatalogObjectWrite): Promise<'uploaded' | 'exists'>;
  readObject(key: string, maximumBytes: number): Promise<SfxCatalogStoredObject>;
}

export interface PublishSfxCatalogOptions {
  sourceRoot: string;
  bucketName: string;
  now?: Date;
  objectStore?: SfxCatalogObjectStore;
  readBuffer?: (filePath: string) => Promise<Buffer>;
  resolveRealPath?: (filePath: string) => Promise<string>;
}

const publicationReceiptSchema = z.object({
  version: z.literal('sfx-catalog-publication-receipt-v1'),
  manifestVersion: z.literal('sfx-catalog-v1'),
  manifestGeneratedAt: z.string().datetime(),
  manifestHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  bucketName: z.string().min(1),
  assets: z.array(z.object({
    assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
    r2Key: z.string().min(1),
    status: z.enum(['uploaded', 'verified-existing']),
    byteLength: z.number().int().positive(),
    contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()),
}).strict();

export type SfxCatalogPublicationReceipt = z.infer<typeof publicationReceiptSchema>;

export class SfxCatalogPublicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SfxCatalogPublicationError';
  }
}

interface PreflightAsset {
  entry: SfxCatalogEntry;
  plan: SfxCatalogUploadPlan['assets'][number];
  absolutePath: string;
}

export async function publishSfxCatalog(
  manifestValue: unknown,
  uploadPlanValue: unknown,
  options: PublishSfxCatalogOptions,
): Promise<SfxCatalogPublicationReceipt> {
  const manifest = parseSfxCatalogManifest(manifestValue);
  const uploadPlan = parseSfxCatalogUploadPlan(uploadPlanValue);
  const bucketName = options.bucketName.trim();
  if (!bucketName) {
    throw new SfxCatalogPublicationError(
      'INVALID_SFX_CATALOG_BUCKET',
      'SFX catalog publication requires an R2 bucket name',
    );
  }
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new SfxCatalogPublicationError(
      'INVALID_SFX_PUBLICATION_CLOCK',
      'SFX catalog publication requires a valid timestamp',
    );
  }

  const plansByAssetId = assertManifestMatchesUploadPlan(manifest, uploadPlan);
  const readBuffer = options.readBuffer ?? (filePath => readFile(filePath));
  const resolveRealPath = options.resolveRealPath ?? (filePath => realpath(filePath));
  const sourceRoot = await resolveRealPath(path.resolve(options.sourceRoot));
  const preflightAssets: PreflightAsset[] = [];

  for (const entry of manifest.entries) {
    const plan = plansByAssetId.get(entry.assetId);
    if (!plan) {
      throw contractError(`manifest asset ${entry.assetId} has no upload-plan asset`);
    }
    const source = await resolveLicensedSourcePath(
      sourceRoot,
      plan.sourcePath,
      resolveRealPath,
    );
    const buffer = await readBuffer(source.absolutePath);
    assertSourceBytesMatchPlan(plan, buffer);
    preflightAssets.push({
      entry,
      plan,
      absolutePath: source.absolutePath,
    });
  }

  const objectStore = options.objectStore ?? createR2CatalogObjectStore(bucketName);
  const publishedAssets: SfxCatalogPublicationReceipt['assets'] = [];
  for (const asset of preflightAssets) {
    const buffer = await readBuffer(asset.absolutePath);
    assertSourceBytesMatchPlan(asset.plan, buffer);
    const metadata = {
      contenthashsha256: asset.plan.contentHashSha256,
      catalogassetid: asset.plan.assetId,
      cataloggeneratedat: uploadPlan.generatedAt,
      licenseid: asset.plan.provenance.licenseId,
    };
    const writeStatus = await objectStore.putIfAbsent({
      key: asset.plan.r2Key,
      body: buffer,
      contentType: asset.plan.mimeType,
      metadata,
    });
    const stored = await objectStore.readObject(
      asset.plan.r2Key,
      asset.plan.byteLength,
    );
    assertStoredObjectMatchesPlan(asset.plan, stored, metadata);
    publishedAssets.push({
      assetId: asset.plan.assetId,
      r2Key: asset.plan.r2Key,
      status: writeStatus === 'uploaded' ? 'uploaded' : 'verified-existing',
      byteLength: asset.plan.byteLength,
      contentHashSha256: asset.plan.contentHashSha256,
    });
  }

  publishedAssets.sort((left, right) => left.assetId.localeCompare(right.assetId));
  return publicationReceiptSchema.parse({
    version: 'sfx-catalog-publication-receipt-v1',
    manifestVersion: manifest.version,
    manifestGeneratedAt: manifest.generatedAt,
    manifestHashSha256: sha256(Buffer.from(stableJson(manifest))),
    publishedAt: now.toISOString(),
    bucketName,
    assets: publishedAssets,
  });
}

function assertManifestMatchesUploadPlan(
  manifest: SfxCatalogManifest,
  uploadPlan: SfxCatalogUploadPlan,
): Map<string, SfxCatalogUploadPlan['assets'][number]> {
  if (manifest.generatedAt !== uploadPlan.generatedAt) {
    throw contractError('manifest and upload plan generatedAt values differ');
  }
  if (manifest.version !== uploadPlan.manifestVersion) {
    throw contractError('manifest and upload plan versions differ');
  }
  if (manifest.entries.length !== uploadPlan.assets.length) {
    throw contractError('manifest and upload plan asset counts differ');
  }

  const plansByAssetId = new Map(
    uploadPlan.assets.map(asset => [asset.assetId, asset]),
  );
  if (plansByAssetId.size !== uploadPlan.assets.length) {
    throw contractError('upload plan contains duplicate asset IDs');
  }

  for (const entry of manifest.entries) {
    const plan = plansByAssetId.get(entry.assetId);
    if (!plan) {
      throw contractError(`manifest asset ${entry.assetId} is missing from upload plan`);
    }
    if (
      entry.storagePath !== plan.r2Key
      || plan.r2Key !== entry.assetId
      || entry.audioUrl !== `${uploadPlan.publicAssetBaseUrl}/${entry.assetId}`
    ) {
      throw contractError(`manifest and upload plan storage location differ for ${entry.assetId}`);
    }
    if (entry.mimeType !== plan.mimeType) {
      throw contractError(`manifest and upload plan MIME values differ for ${entry.assetId}`);
    }
    if (entry.contentHashSha256 !== plan.contentHashSha256) {
      throw contractError(`manifest and upload plan content hashes differ for ${entry.assetId}`);
    }
    if (
      entry.provenance.provider !== plan.provenance.provider
      || entry.provenance.providerAssetId !== plan.provenance.providerAssetId
      || entry.provenance.licenseId !== plan.provenance.licenseId
    ) {
      throw contractError(`manifest and upload plan provenance differ for ${entry.assetId}`);
    }
  }
  return plansByAssetId;
}

function assertSourceBytesMatchPlan(
  plan: SfxCatalogUploadPlan['assets'][number],
  buffer: Buffer,
): void {
  if (
    buffer.byteLength !== plan.byteLength
    || sha256(buffer) !== plan.contentHashSha256
  ) {
    throw new SfxCatalogPublicationError(
      'SFX_CATALOG_SOURCE_CHANGED',
      `Source bytes for ${plan.assetId} no longer match the curation hash or length`,
    );
  }
}

function assertStoredObjectMatchesPlan(
  plan: SfxCatalogUploadPlan['assets'][number],
  stored: SfxCatalogStoredObject,
  expectedMetadata: Record<string, string>,
): void {
  if (
    stored.body.byteLength !== plan.byteLength
    || sha256(stored.body) !== plan.contentHashSha256
  ) {
    throw new SfxCatalogPublicationError(
      'SFX_CATALOG_STORED_OBJECT_MISMATCH',
      `Stored object bytes are corrupt or do not match ${plan.assetId}`,
    );
  }
  if (stored.contentType !== plan.mimeType) {
    throw new SfxCatalogPublicationError(
      'SFX_CATALOG_STORED_OBJECT_MISMATCH',
      `Stored object MIME does not match ${plan.assetId}`,
    );
  }
  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (stored.metadata[key.toLowerCase()] !== value) {
      throw new SfxCatalogPublicationError(
        'SFX_CATALOG_STORED_OBJECT_MISMATCH',
        `Stored object metadata "${key}" does not match ${plan.assetId}`,
      );
    }
  }
}

function contractError(message: string): SfxCatalogPublicationError {
  return new SfxCatalogPublicationError(
    'SFX_CATALOG_PUBLICATION_CONTRACT_MISMATCH',
    `SFX catalog manifest and upload plan mismatch: ${message}`,
  );
}

function createR2CatalogObjectStore(bucketName: string): SfxCatalogObjectStore {
  const client = getS3Client();
  return {
    async putIfAbsent(input) {
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
          ContentDisposition: `inline; filename="${input.key}"`,
          Metadata: input.metadata,
          IfNoneMatch: '*',
        }));
        return 'uploaded';
      } catch (error) {
        if (isPreconditionFailure(error)) return 'exists';
        throw new SfxCatalogPublicationError(
          'SFX_CATALOG_R2_WRITE_FAILED',
          `R2 rejected catalog object ${input.key}: ${errorMessage(error)}`,
        );
      }
    },
    async readObject(key, maximumBytes) {
      let response;
      try {
        response = await client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }));
      } catch (error) {
        throw new SfxCatalogPublicationError(
          'SFX_CATALOG_R2_READ_FAILED',
          `R2 could not verify catalog object ${key}: ${errorMessage(error)}`,
        );
      }
      if (
        typeof response.ContentLength === 'number'
        && response.ContentLength > maximumBytes
      ) {
        throw new SfxCatalogPublicationError(
          'SFX_CATALOG_R2_OBJECT_TOO_LARGE',
          `R2 object ${key} exceeds its curated byte length`,
        );
      }
      const body = response.Body as {
        transformToByteArray?: () => Promise<Uint8Array>;
      } | undefined;
      if (!body?.transformToByteArray) {
        throw new SfxCatalogPublicationError(
          'SFX_CATALOG_R2_READ_FAILED',
          `R2 returned an unreadable body for catalog object ${key}`,
        );
      }
      const bytes = Buffer.from(await body.transformToByteArray());
      if (bytes.byteLength > maximumBytes) {
        throw new SfxCatalogPublicationError(
          'SFX_CATALOG_R2_OBJECT_TOO_LARGE',
          `R2 object ${key} exceeds its curated byte length`,
        );
      }
      return {
        body: bytes,
        contentType: response.ContentType,
        metadata: normalizeMetadata(response.Metadata),
      };
    },
  };
}

function normalizeMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === 'PreconditionFailed'
    || candidate.Code === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface PublicationCliArguments {
  manifestPath: string;
  uploadPlanPath: string;
  sourceRoot: string;
  outReceiptPath: string;
  bucketName: string;
}

function parseCliArguments(argv: string[]): PublicationCliArguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    'manifest',
    'upload-plan',
    'source-root',
    'out-receipt',
    'bucket',
  ]);
  for (const argument of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) {
      throw cliUsageError();
    }
    values.set(match[1], match[2]);
  }

  const manifestPath = values.get('manifest');
  const uploadPlanPath = values.get('upload-plan');
  const sourceRoot = values.get('source-root');
  const outReceiptPath = values.get('out-receipt');
  const bucketName = values.get('bucket') ?? process.env.R2_BUCKET_NAME;
  if (!manifestPath || !uploadPlanPath || !sourceRoot || !outReceiptPath || !bucketName) {
    throw cliUsageError();
  }
  return {
    manifestPath: path.resolve(manifestPath),
    uploadPlanPath: path.resolve(uploadPlanPath),
    sourceRoot: path.resolve(sourceRoot),
    outReceiptPath: path.resolve(outReceiptPath),
    bucketName,
  };
}

function cliUsageError(): SfxCatalogPublicationError {
  return new SfxCatalogPublicationError(
    'INVALID_SFX_CATALOG_PUBLICATION_ARGUMENTS',
    'Usage: pnpm publish:sfx -- --manifest=<json> --upload-plan=<json> '
      + '--source-root=<directory> --out-receipt=<json> [--bucket=<r2-bucket>]',
  );
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new SfxCatalogPublicationError(
      'INVALID_SFX_CATALOG_PUBLICATION_JSON',
      `Could not parse ${filePath}: ${errorMessage(error)}`,
    );
  }
}

async function writeReceipt(
  receipt: SfxCatalogPublicationReceipt,
  outReceiptPath: string,
): Promise<void> {
  const temporaryPath = `${outReceiptPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outReceiptPath), { recursive: true });
  try {
    await writeFile(temporaryPath, stableJson(receipt), { flag: 'wx' });
    await rename(temporaryPath, outReceiptPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  const [manifest, uploadPlan] = await Promise.all([
    readJson(cli.manifestPath),
    readJson(cli.uploadPlanPath),
  ]);
  const receipt = await publishSfxCatalog(manifest, uploadPlan, {
    sourceRoot: cli.sourceRoot,
    bucketName: cli.bucketName,
  });
  await writeReceipt(receipt, cli.outReceiptPath);
  console.log(
    `[SFXCatalog] Published and verified ${receipt.assets.length} R2 objects. `
      + `Receipt: ${cli.outReceiptPath}.`,
  );
}

const isMain = Boolean(
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isMain) {
  main().catch(error => {
    console.error(`[SFXCatalog] ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
