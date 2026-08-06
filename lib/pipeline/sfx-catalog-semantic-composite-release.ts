import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapModelDescriptor,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const METADATA_FILE = 'metadata.json';
const VECTORS_FILE = 'vectors.f32';
const RELEASE_RECEIPT_FILE = 'semantic-release-receipt.json';
const MANIFEST_FILE = 'manifest.json';

export const SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_VERSION =
  'editron-sfx-catalog-composite-semantic-release-v1' as const;
export const SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_RECEIPT_VERSION =
  'editron-sfx-catalog-composite-semantic-release-receipt-v1' as const;

const sha256Schema = z.string().regex(SHA256_PATTERN);
const eventRoleSchema = z.enum([
  'whoosh',
  'impact',
  'tick',
  'pop',
  'riser',
  'logo-sting',
  'ambience',
  'foley',
  'shimmer',
]);
const modelDescriptorSchema = z.object({
  provider: z.literal('huggingface-transformers-js'),
  packageVersion: z.literal(SFX_CLAP_TRANSFORMERS_VERSION),
  modelId: z.literal(SFX_CLAP_MODEL_ID),
  revision: z.literal(SFX_CLAP_MODEL_REVISION),
  dtype: z.literal('q8'),
  sampleRateHz: z.literal(SFX_CLAP_SAMPLE_RATE_HZ),
  embeddingDimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
  windowing: z.literal('non-overlapping-10s-duration-weighted-mean'),
}).strict();
const vectorArtifactSchema = z.object({
  filename: z.literal(VECTORS_FILE),
  encoding: z.literal('f32le-row-major'),
  dimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
  count: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  sha256: sha256Schema,
}).strict();
const sourceSchema = z.object({
  baseReleaseReceiptDigestSha256: sha256Schema,
  deltaReleaseReceiptDigestSha256: sha256Schema,
  baseManifestDigestSha256: sha256Schema,
  deltaManifestDigestSha256: sha256Schema,
  runtimeManifestDigestSha256: sha256Schema,
  runtimeManifestFileSha256: sha256Schema,
}).strict();
const policySchema = z.object({
  constituentReleasesVerified: z.literal(true),
  disjointAssetSetsRequired: z.literal(true),
  exactRuntimeManifestRequired: z.literal(true),
  vectorsReusedWithoutReembedding: z.literal(true),
  unreviewedCorpusIncluded: z.literal(false),
  exactCosineSearchCompatible: z.literal(true),
  runtimeSelectionPerformed: z.literal(false),
  manifestMutationPerformed: z.literal(false),
}).strict();

export const compositeSfxSemanticReleaseEntrySchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  vectorOffsetBytes: z.number().int().nonnegative(),
  vectorByteLength: z.number().int().positive(),
  assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
  selectedRole: eventRoleSchema,
  catalogContentHashSha256: sha256Schema,
  catalogEntryDigestSha256: sha256Schema,
  semanticEvidenceDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
  sourceRelease: z.enum(['reviewed-base', 'gate-delta']),
  sourceReleaseReceiptDigestSha256: sha256Schema,
}).strict();

export const compositeSfxSemanticReleaseMetadataSchema = z.object({
  version: z.literal(SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_VERSION),
  generatedAt: z.string().datetime(),
  model: modelDescriptorSchema,
  source: sourceSchema,
  policy: policySchema,
  vectors: vectorArtifactSchema,
  entries: z.array(compositeSfxSemanticReleaseEntrySchema).min(1),
}).strict();

export const compositeSfxSemanticReleaseReceiptSchema = z.object({
  version: z.literal(SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_RECEIPT_VERSION),
  generatedAt: z.string().datetime(),
  source: sourceSchema,
  policy: policySchema,
  counts: z.object({
    approvedAssets: z.number().int().positive(),
    semanticVectors: z.number().int().positive(),
    baseAssets: z.number().int().positive(),
    deltaAssets: z.number().int().positive(),
    reusedCheckpoints: z.number().int().positive(),
    newCheckpoints: z.literal(0),
  }).strict(),
  artifacts: z.object({
    manifest: z.object({
      filename: z.literal(MANIFEST_FILE),
      byteLength: z.number().int().positive(),
      sha256: sha256Schema,
    }).strict(),
    metadata: z.object({
      filename: z.literal(METADATA_FILE),
      byteLength: z.number().int().positive(),
      sha256: sha256Schema,
    }).strict(),
    vectors: vectorArtifactSchema,
  }).strict(),
  receiptDigestSha256: sha256Schema,
}).strict();

const constituentEntrySchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  vectorOffsetBytes: z.number().int().nonnegative(),
  vectorByteLength: z.number().int().positive(),
  assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
  selectedRole: eventRoleSchema,
  catalogContentHashSha256: sha256Schema,
  catalogEntryDigestSha256: sha256Schema,
  semanticEvidenceDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
}).passthrough();
const constituentMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  model: modelDescriptorSchema,
  vectors: vectorArtifactSchema,
  entries: z.array(constituentEntrySchema).min(1),
}).passthrough();

export type CompositeSfxSemanticReleaseEntry =
  z.infer<typeof compositeSfxSemanticReleaseEntrySchema>;
export type CompositeSfxSemanticReleaseMetadata =
  z.infer<typeof compositeSfxSemanticReleaseMetadataSchema>;
export type CompositeSfxSemanticReleaseReceipt =
  z.infer<typeof compositeSfxSemanticReleaseReceiptSchema>;

export interface BuildCompositeSfxSemanticReleaseOptions {
  baseReleaseDirectory: string;
  baseManifestPath: string;
  deltaReleaseDirectory: string;
  deltaManifestPath: string;
  runtimeManifestPath: string;
  outputDirectory: string;
  generatedAt?: Date;
}

export interface BuiltCompositeSfxSemanticRelease {
  metadata: CompositeSfxSemanticReleaseMetadata;
  receipt: CompositeSfxSemanticReleaseReceipt;
  outputDirectory: string;
  metadataPath: string;
  vectorsPath: string;
  receiptPath: string;
}

interface ConstituentRow {
  entry: z.infer<typeof constituentEntrySchema>;
  vector: Buffer;
}

interface ConstituentRelease {
  manifest: SfxCatalogManifest;
  manifestDigestSha256: string;
  releaseReceiptDigestSha256: string;
  model: SfxClapModelDescriptor;
  rows: ConstituentRow[];
}

export class CompositeSfxSemanticReleaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompositeSfxSemanticReleaseError';
  }
}

export async function buildCompositeSfxSemanticRelease(
  options: BuildCompositeSfxSemanticReleaseOptions,
): Promise<BuiltCompositeSfxSemanticRelease> {
  const generatedAt = options.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    fail('INVALID_COMPOSITE_RELEASE_CLOCK', 'Composite release timestamp is invalid');
  }
  const outputDirectory = path.resolve(options.outputDirectory);
  await assertMissing(outputDirectory);
  const [base, delta, runtimeManifestBytes] = await Promise.all([
    readConstituent(options.baseReleaseDirectory, options.baseManifestPath),
    readConstituent(options.deltaReleaseDirectory, options.deltaManifestPath),
    readFile(path.resolve(options.runtimeManifestPath)),
  ]);
  if (hashJson(base.model) !== hashJson(delta.model)) {
    fail('COMPOSITE_MODEL_MISMATCH', 'Constituent releases use different CLAP models');
  }

  const runtimeManifest = parseManifest(runtimeManifestBytes, 'INVALID_RUNTIME_MANIFEST');
  const runtimeEntries = new Map(runtimeManifest.entries.map(entry => [entry.assetId, entry]));
  if (runtimeEntries.size !== runtimeManifest.entries.length) {
    fail('DUPLICATE_RUNTIME_ASSET_ID', 'Runtime manifest contains duplicate asset IDs');
  }
  const seenAssetIds = new Set<string>();
  const seenContentHashes = new Set<string>();
  const rows = [
    ...tagRows(base, 'reviewed-base'),
    ...tagRows(delta, 'gate-delta'),
  ].sort((left, right) => left.entry.assetId.localeCompare(right.entry.assetId));

  for (const row of rows) {
    const runtimeEntry = runtimeEntries.get(row.entry.assetId);
    if (
      seenAssetIds.has(row.entry.assetId)
      || seenContentHashes.has(row.entry.catalogContentHashSha256)
    ) {
      fail('COMPOSITE_ASSET_OVERLAP', `Constituent releases overlap: ${row.entry.assetId}`);
    }
    if (
      !runtimeEntry?.semanticEvidence
      || runtimeEntry.contentHashSha256 !== row.entry.catalogContentHashSha256
      || hashJson(runtimeEntry) !== row.entry.catalogEntryDigestSha256
      || hashJson(runtimeEntry.semanticEvidence) !== row.entry.semanticEvidenceDigestSha256
      || runtimeEntry.semanticEvidence.selectedRole !== row.entry.selectedRole
    ) {
      fail(
        'COMPOSITE_RUNTIME_ENTRY_MISMATCH',
        `Runtime manifest differs from constituent evidence: ${row.entry.assetId}`,
      );
    }
    seenAssetIds.add(row.entry.assetId);
    seenContentHashes.add(row.entry.catalogContentHashSha256);
  }
  if (
    rows.length !== runtimeManifest.entries.length
    || runtimeManifest.entries.some(entry => !seenAssetIds.has(entry.assetId))
  ) {
    fail(
      'COMPOSITE_RUNTIME_ASSET_SET_MISMATCH',
      'Constituent releases do not exactly cover the runtime manifest',
    );
  }

  const vectorByteLength = SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT;
  const vectorsBuffer = Buffer.concat(rows.map(row => row.vector));
  const vectors = {
    filename: VECTORS_FILE,
    encoding: 'f32le-row-major' as const,
    dimension: SFX_CLAP_EMBEDDING_DIMENSION,
    count: rows.length,
    byteLength: vectorsBuffer.byteLength,
    sha256: hashBuffer(vectorsBuffer),
  };
  const source = {
    baseReleaseReceiptDigestSha256: base.releaseReceiptDigestSha256,
    deltaReleaseReceiptDigestSha256: delta.releaseReceiptDigestSha256,
    baseManifestDigestSha256: base.manifestDigestSha256,
    deltaManifestDigestSha256: delta.manifestDigestSha256,
    runtimeManifestDigestSha256: hashJson(runtimeManifest),
    runtimeManifestFileSha256: hashBuffer(runtimeManifestBytes),
  };
  const policy = {
    constituentReleasesVerified: true as const,
    disjointAssetSetsRequired: true as const,
    exactRuntimeManifestRequired: true as const,
    vectorsReusedWithoutReembedding: true as const,
    unreviewedCorpusIncluded: false as const,
    exactCosineSearchCompatible: true as const,
    runtimeSelectionPerformed: false as const,
    manifestMutationPerformed: false as const,
  };
  const metadata = compositeSfxSemanticReleaseMetadataSchema.parse({
    version: SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_VERSION,
    generatedAt: generatedAt.toISOString(),
    model: base.model,
    source,
    policy,
    vectors,
    entries: rows.map((row, rowIndex) => ({
      rowIndex,
      vectorOffsetBytes: rowIndex * vectorByteLength,
      vectorByteLength,
      assetId: row.entry.assetId,
      selectedRole: row.entry.selectedRole,
      catalogContentHashSha256: row.entry.catalogContentHashSha256,
      catalogEntryDigestSha256: row.entry.catalogEntryDigestSha256,
      semanticEvidenceDigestSha256: row.entry.semanticEvidenceDigestSha256,
      segmentCount: row.entry.segmentCount,
      sourceRelease: row.sourceRelease,
      sourceReleaseReceiptDigestSha256: row.sourceReleaseReceiptDigestSha256,
    })),
  });
  const metadataBuffer = Buffer.from(stableJson(metadata));
  const receiptWithoutDigest = {
    version: SFX_CATALOG_COMPOSITE_SEMANTIC_RELEASE_RECEIPT_VERSION,
    generatedAt: generatedAt.toISOString(),
    source,
    policy,
    counts: {
      approvedAssets: rows.length,
      semanticVectors: rows.length,
      baseAssets: base.rows.length,
      deltaAssets: delta.rows.length,
      reusedCheckpoints: rows.length,
      newCheckpoints: 0 as const,
    },
    artifacts: {
      manifest: {
        filename: MANIFEST_FILE,
        byteLength: runtimeManifestBytes.byteLength,
        sha256: hashBuffer(runtimeManifestBytes),
      },
      metadata: {
        filename: METADATA_FILE,
        byteLength: metadataBuffer.byteLength,
        sha256: hashBuffer(metadataBuffer),
      },
      vectors,
    },
  };
  const receipt = compositeSfxSemanticReleaseReceiptSchema.parse({
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  });
  await writeImmutableRelease(outputDirectory, metadataBuffer, vectorsBuffer, receipt);
  return {
    metadata,
    receipt,
    outputDirectory,
    metadataPath: path.join(outputDirectory, METADATA_FILE),
    vectorsPath: path.join(outputDirectory, VECTORS_FILE),
    receiptPath: path.join(outputDirectory, RELEASE_RECEIPT_FILE),
  };
}

async function readConstituent(
  releaseDirectoryValue: string,
  manifestPathValue: string,
): Promise<ConstituentRelease> {
  const releaseDirectory = path.resolve(releaseDirectoryValue);
  const [metadataBuffer, vectorsBuffer, receiptBuffer, manifestBuffer] = await Promise.all([
    readFile(path.join(releaseDirectory, METADATA_FILE)),
    readFile(path.join(releaseDirectory, VECTORS_FILE)),
    readFile(path.join(releaseDirectory, RELEASE_RECEIPT_FILE)),
    readFile(path.resolve(manifestPathValue)),
  ]);
  const { loadSfxCatalogSemanticIndex } = await import(
    '@/lib/pipeline/sfx-catalog-semantic-index'
  );
  const index = loadSfxCatalogSemanticIndex({
    metadataBuffer,
    vectorsBuffer,
    receiptBuffer,
  });
  const manifest = index.assertCompatibleManifest(parseManifest(
    manifestBuffer,
    'INVALID_CONSTITUENT_MANIFEST',
  ));
  const metadata = parseSchema(
    constituentMetadataSchema,
    parseJson(metadataBuffer, 'INVALID_CONSTITUENT_METADATA_JSON'),
    'INVALID_CONSTITUENT_METADATA',
  );
  const rows = metadata.entries.map(entry => ({
    entry,
    vector: vectorsBuffer.subarray(
      entry.vectorOffsetBytes,
      entry.vectorOffsetBytes + entry.vectorByteLength,
    ),
  }));
  return {
    manifest,
    manifestDigestSha256: hashJson(manifest),
    releaseReceiptDigestSha256: index.releaseReceiptDigestSha256,
    model: index.model,
    rows,
  };
}

function tagRows(
  release: ConstituentRelease,
  sourceRelease: CompositeSfxSemanticReleaseEntry['sourceRelease'],
): Array<ConstituentRow & {
  sourceRelease: CompositeSfxSemanticReleaseEntry['sourceRelease'];
  sourceReleaseReceiptDigestSha256: string;
}> {
  return release.rows.map(row => ({
    ...row,
    sourceRelease,
    sourceReleaseReceiptDigestSha256: release.releaseReceiptDigestSha256,
  }));
}

function parseManifest(buffer: Buffer, code: string): SfxCatalogManifest {
  try {
    return parseSfxCatalogManifest(parseJson(buffer, code));
  } catch (error) {
    throw new CompositeSfxSemanticReleaseError(
      code,
      'SFX catalog manifest is invalid',
      { cause: error },
    );
  }
}

function parseJson(buffer: Buffer, code: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new CompositeSfxSemanticReleaseError(code, 'Release JSON is invalid', {
      cause: error,
    });
  }
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  fail(
    code,
    parsed.error.issues
      .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; '),
  );
}

async function writeImmutableRelease(
  outputDirectory: string,
  metadataBuffer: Buffer,
  vectorsBuffer: Buffer,
  receipt: CompositeSfxSemanticReleaseReceipt,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    await Promise.all([
      writeFile(path.join(staging, METADATA_FILE), metadataBuffer, { flag: 'wx' }),
      writeFile(path.join(staging, VECTORS_FILE), vectorsBuffer, { flag: 'wx' }),
      writeFile(
        path.join(staging, RELEASE_RECEIPT_FILE),
        stableJson(receipt),
        { flag: 'wx' },
      ),
    ]);
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('COMPOSITE_OUTPUT_EXISTS', `Composite release output already exists: ${target}`);
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code: string, message: string): never {
  throw new CompositeSfxSemanticReleaseError(code, message);
}
