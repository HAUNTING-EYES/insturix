import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  createPinnedSfxClapRuntime,
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapEmbeddingRuntime,
  type SfxClapModelDescriptor,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
  SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
  type SfxCatalogSemanticReleaseMetadata,
  type SfxCatalogSemanticReleaseReceipt,
  type SfxSemanticReleaseEntry,
} from '@/lib/pipeline/sfx-catalog-semantic-release';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const METADATA_FILE = 'metadata.json';
const VECTORS_FILE = 'vectors.f32';
const RELEASE_RECEIPT_FILE = 'semantic-release-receipt.json';
const QUERY_RESULT_LIMIT = 12;

export const SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION =
  'editron-sfx-catalog-semantic-retrieval-v1' as const;
export const SFX_CATALOG_SEMANTIC_RELEASE_DIR_ENV =
  'SFX_CATALOG_SEMANTIC_RELEASE_DIR' as const;
export const SFX_CLAP_MODEL_CACHE_DIR_ENV =
  'SFX_CLAP_MODEL_CACHE_DIR' as const;

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
const releaseSourceSchema = z.object({
  aggregateReceiptDigestSha256: sha256Schema,
  aggregateCurationSpecDigestSha256: sha256Schema,
  promotionReceiptDigestSha256: sha256Schema,
  promotedManifestDigestSha256: sha256Schema,
}).strict();
const releasePolicySchema = z.object({
  explicitPerAssetApprovalRequired: z.literal(true),
  promotionReceiptRequired: z.literal(true),
  conditionedCatalogBytesReembedded: z.literal(true),
  approvedSourceBytesVerifiedEveryBuild: z.literal(true),
  unreviewedCorpusIncluded: z.literal(false),
  exactCosineSearchCompatible: z.literal(true),
  runtimeSelectionPerformed: z.literal(false),
  manifestMutationPerformed: z.literal(false),
}).strict();
const vectorArtifactSchema = z.object({
  filename: z.literal(VECTORS_FILE),
  encoding: z.literal('f32le-row-major'),
  dimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
  count: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  sha256: sha256Schema,
}).strict();
const releaseEntrySchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  vectorOffsetBytes: z.number().int().nonnegative(),
  vectorByteLength: z.number().int().positive(),
  assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
  canonicalSourceId: z.string().min(1),
  reviewId: z.string().regex(/^sfx_review_[a-f0-9]{20}$/),
  selectedRole: eventRoleSchema,
  catalogContentHashSha256: sha256Schema,
  embeddingSourceHashSha256: sha256Schema,
  candidateDigestSha256: sha256Schema,
  gateBatchId: z.string().min(1),
  gateReceiptDigestSha256: sha256Schema,
  catalogEntryDigestSha256: sha256Schema,
  semanticEvidenceDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
}).strict();
const metadataSchema = z.object({
  version: z.literal(SFX_CATALOG_SEMANTIC_RELEASE_VERSION),
  generatedAt: z.string().datetime(),
  model: modelDescriptorSchema,
  source: releaseSourceSchema,
  policy: releasePolicySchema,
  vectors: vectorArtifactSchema,
  entries: z.array(releaseEntrySchema).min(1),
}).strict();
const receiptSchema = z.object({
  version: z.literal(SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION),
  generatedAt: z.string().datetime(),
  source: releaseSourceSchema,
  policy: releasePolicySchema,
  counts: z.object({
    approvedAssets: z.number().int().positive(),
    semanticVectors: z.number().int().positive(),
    sourceGates: z.number().int().positive(),
    reusedCheckpoints: z.number().int().nonnegative(),
    newCheckpoints: z.number().int().nonnegative(),
  }).strict(),
  artifacts: z.object({
    metadata: z.object({
      filename: z.literal(METADATA_FILE),
      byteLength: z.number().int().positive(),
      sha256: sha256Schema,
    }).strict(),
    vectors: vectorArtifactSchema,
  }).strict(),
  receiptDigestSha256: sha256Schema,
}).strict();

interface IndexedVectorRow {
  entry: SfxSemanticReleaseEntry;
  offset: number;
}

export interface LoadSfxCatalogSemanticIndexInput {
  metadataBuffer: Buffer;
  vectorsBuffer: Buffer;
  receiptBuffer: Buffer;
}

export interface SfxCatalogSemanticMatch {
  assetId: string;
  cosineSimilarity: number;
}

export interface SfxCatalogSemanticRetrievalReport {
  version: typeof SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION;
  releaseReceiptDigestSha256: string;
  promotedManifestDigestSha256: string;
  queryDigestSha256: string;
  model: SfxClapModelDescriptor;
  indexedAssetCount: number;
  candidates: SfxCatalogSemanticMatch[];
}

export interface SfxCatalogSemanticRetrieval {
  similarityByAssetId: ReadonlyMap<string, number>;
  report: SfxCatalogSemanticRetrievalReport;
}

export interface SfxCatalogSemanticRetriever {
  retrieve(
    query: string,
    manifest: SfxCatalogManifest,
  ): Promise<SfxCatalogSemanticRetrieval>;
  dispose?(): Promise<void>;
}

export interface CreateFilesystemSfxCatalogSemanticRetrieverOptions {
  releaseDirectory: string;
  modelCacheDirectory: string;
}

export class SfxCatalogSemanticIndexError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SfxCatalogSemanticIndexError';
  }
}

export class SfxCatalogSemanticIndex {
  readonly model: SfxClapModelDescriptor;
  readonly releaseReceiptDigestSha256: string;
  readonly promotedManifestDigestSha256: string;
  readonly indexedAssetCount: number;

  private constructor(
    metadata: SfxCatalogSemanticReleaseMetadata,
    receipt: SfxCatalogSemanticReleaseReceipt,
    private readonly vectors: Float32Array,
    private readonly rows: readonly IndexedVectorRow[],
  ) {
    this.model = { ...metadata.model };
    this.releaseReceiptDigestSha256 = receipt.receiptDigestSha256;
    this.promotedManifestDigestSha256 = metadata.source.promotedManifestDigestSha256;
    this.indexedAssetCount = rows.length;
  }

  static load(input: LoadSfxCatalogSemanticIndexInput): SfxCatalogSemanticIndex {
    const rawMetadata = parseJsonBuffer(input.metadataBuffer, 'INVALID_RELEASE_METADATA_JSON');
    const rawReceipt = parseJsonBuffer(input.receiptBuffer, 'INVALID_RELEASE_RECEIPT_JSON');
    const metadata = parseSchema(
      metadataSchema,
      rawMetadata,
      'INVALID_RELEASE_METADATA',
    ) as SfxCatalogSemanticReleaseMetadata;
    const receipt = parseSchema(
      receiptSchema,
      rawReceipt,
      'INVALID_RELEASE_RECEIPT',
    ) as SfxCatalogSemanticReleaseReceipt;
    verifyReleaseEnvelope(metadata, receipt, rawReceipt, input);
    const { vectors, rows } = decodeAndVerifyRows(metadata, input.vectorsBuffer);
    return new SfxCatalogSemanticIndex(metadata, receipt, vectors, rows);
  }

  assertCompatibleManifest(manifestValue: unknown): SfxCatalogManifest {
    const manifest = parseSfxCatalogManifest(manifestValue);
    if (hashJson(manifest) !== this.promotedManifestDigestSha256) {
      fail(
        'SEMANTIC_MANIFEST_DIGEST_MISMATCH',
        'Configured semantic release does not belong to the active SFX manifest',
      );
    }
    const entriesById = new Map(manifest.entries.map(entry => [entry.assetId, entry]));
    const indexedAssetIds = new Set<string>();
    for (const row of this.rows) {
      const catalogEntry = entriesById.get(row.entry.assetId);
      if (
        !catalogEntry?.semanticEvidence
        || catalogEntry.contentHashSha256 !== row.entry.catalogContentHashSha256
        || hashJson(catalogEntry) !== row.entry.catalogEntryDigestSha256
        || hashJson(catalogEntry.semanticEvidence) !== row.entry.semanticEvidenceDigestSha256
      ) {
        fail(
          'SEMANTIC_MANIFEST_ENTRY_MISMATCH',
          `Indexed SFX evidence differs from the active catalog: ${row.entry.assetId}`,
        );
      }
      indexedAssetIds.add(row.entry.assetId);
    }
    const manifestSemanticIds = manifest.entries
      .filter(entry => Boolean(entry.semanticEvidence))
      .map(entry => entry.assetId);
    if (
      manifestSemanticIds.length !== indexedAssetIds.size
      || manifestSemanticIds.some(assetId => !indexedAssetIds.has(assetId))
    ) {
      fail(
        'SEMANTIC_MANIFEST_ASSET_SET_MISMATCH',
        'Active catalog semantic assets differ from the configured release',
      );
    }
    return manifest;
  }

  searchEmbedding(queryEmbedding: Float32Array): SfxCatalogSemanticMatch[] {
    const query = normalizedEmbedding(queryEmbedding, this.model.embeddingDimension, 'query');
    return this.rows
      .map(row => ({
        assetId: row.entry.assetId,
        cosineSimilarity: dotProductRow(
          query,
          this.vectors,
          row.offset,
          this.model.embeddingDimension,
        ),
      }))
      .sort((left, right) => (
        right.cosineSimilarity - left.cosineSimilarity
        || left.assetId.localeCompare(right.assetId)
      ));
  }
}

export function loadSfxCatalogSemanticIndex(
  input: LoadSfxCatalogSemanticIndexInput,
): SfxCatalogSemanticIndex {
  return SfxCatalogSemanticIndex.load(input);
}

export function createSfxCatalogSemanticRetriever(
  index: SfxCatalogSemanticIndex,
  runtime: SfxClapEmbeddingRuntime,
): SfxCatalogSemanticRetriever {
  if (hashJson(runtime.descriptor) !== hashJson(index.model)) {
    fail(
      'SEMANTIC_QUERY_MODEL_MISMATCH',
      'Semantic query runtime does not match the release model descriptor',
    );
  }
  return {
    async retrieve(query, manifest) {
      const normalizedQuery = query.trim().replace(/\s+/g, ' ');
      if (!normalizedQuery) {
        fail('EMPTY_SEMANTIC_QUERY', 'Semantic SFX retrieval requires a non-empty query');
      }
      index.assertCompatibleManifest(manifest);
      const embedded = await runtime.embedTexts([normalizedQuery]);
      if (embedded.length !== 1) {
        fail(
          'INVALID_SEMANTIC_QUERY_EMBEDDING',
          `Semantic query runtime returned ${embedded.length} vectors; expected one`,
        );
      }
      const matches = index.searchEmbedding(embedded[0]);
      return {
        similarityByAssetId: new Map(
          matches.map(match => [match.assetId, match.cosineSimilarity]),
        ),
        report: {
          version: SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
          releaseReceiptDigestSha256: index.releaseReceiptDigestSha256,
          promotedManifestDigestSha256: index.promotedManifestDigestSha256,
          queryDigestSha256: hashBuffer(Buffer.from(normalizedQuery)),
          model: { ...index.model },
          indexedAssetCount: index.indexedAssetCount,
          candidates: matches.slice(0, QUERY_RESULT_LIMIT).map(match => ({
            assetId: match.assetId,
            cosineSimilarity: round6(match.cosineSimilarity),
          })),
        },
      };
    },
  };
}

export async function createFilesystemSfxCatalogSemanticRetriever(
  options: CreateFilesystemSfxCatalogSemanticRetrieverOptions,
): Promise<SfxCatalogSemanticRetriever> {
  const releaseDirectory = path.resolve(options.releaseDirectory);
  const [metadataBuffer, vectorsBuffer, receiptBuffer] = await Promise.all([
    readReleaseFile(releaseDirectory, METADATA_FILE),
    readReleaseFile(releaseDirectory, VECTORS_FILE),
    readReleaseFile(releaseDirectory, RELEASE_RECEIPT_FILE),
  ]);
  const index = loadSfxCatalogSemanticIndex({
    metadataBuffer,
    vectorsBuffer,
    receiptBuffer,
  });
  const runtime = await createPinnedSfxClapRuntime({
    cacheDirectory: path.resolve(options.modelCacheDirectory),
    localFilesOnly: true,
  });
  try {
    const retriever = createSfxCatalogSemanticRetriever(index, runtime);
    return {
      retrieve: retriever.retrieve,
      async dispose() {
        await runtime.dispose?.();
      },
    };
  } catch (error) {
    await runtime.dispose?.();
    throw error;
  }
}

let configuredRetriever: {
  key: string;
  value: Promise<SfxCatalogSemanticRetriever>;
} | undefined;

export async function retrieveConfiguredSfxCatalogSemantics(
  query: string,
  manifest: SfxCatalogManifest,
): Promise<SfxCatalogSemanticRetrieval | undefined> {
  const releaseDirectory = process.env[SFX_CATALOG_SEMANTIC_RELEASE_DIR_ENV]?.trim();
  if (!releaseDirectory) return undefined;
  const modelCacheDirectory = process.env[SFX_CLAP_MODEL_CACHE_DIR_ENV]?.trim();
  if (!modelCacheDirectory) {
    fail(
      'SEMANTIC_MODEL_CACHE_NOT_CONFIGURED',
      `${SFX_CLAP_MODEL_CACHE_DIR_ENV} is required when semantic retrieval is enabled`,
    );
  }
  const key = `${path.resolve(releaseDirectory)}\n${path.resolve(modelCacheDirectory)}`;
  if (configuredRetriever && configuredRetriever.key !== key) {
    fail(
      'SEMANTIC_CONFIGURATION_CHANGED',
      'SFX semantic release configuration changed after runtime initialization',
    );
  }
  configuredRetriever ??= {
    key,
    value: createFilesystemSfxCatalogSemanticRetriever({
      releaseDirectory,
      modelCacheDirectory,
    }),
  };
  return (await configuredRetriever.value).retrieve(query, manifest);
}

function verifyReleaseEnvelope(
  metadata: SfxCatalogSemanticReleaseMetadata,
  receipt: SfxCatalogSemanticReleaseReceipt,
  rawReceipt: unknown,
  input: LoadSfxCatalogSemanticIndexInput,
): void {
  if (hashJson(withoutReceiptDigest(rawReceipt)) !== receipt.receiptDigestSha256) {
    fail('RELEASE_RECEIPT_DIGEST_MISMATCH', 'Semantic release receipt was modified');
  }
  if (
    receipt.artifacts.metadata.byteLength !== input.metadataBuffer.byteLength
    || receipt.artifacts.metadata.sha256 !== hashBuffer(input.metadataBuffer)
  ) {
    fail('RELEASE_METADATA_DIGEST_MISMATCH', 'Semantic release metadata was modified');
  }
  if (
    receipt.artifacts.vectors.byteLength !== input.vectorsBuffer.byteLength
    || receipt.artifacts.vectors.sha256 !== hashBuffer(input.vectorsBuffer)
  ) {
    fail('RELEASE_VECTOR_DIGEST_MISMATCH', 'Semantic release vectors were modified');
  }
  if (
    metadata.generatedAt !== receipt.generatedAt
    || hashJson(metadata.source) !== hashJson(receipt.source)
    || hashJson(metadata.policy) !== hashJson(receipt.policy)
    || hashJson(metadata.vectors) !== hashJson(receipt.artifacts.vectors)
    || metadata.entries.length !== metadata.vectors.count
    || receipt.counts.approvedAssets !== metadata.entries.length
    || receipt.counts.semanticVectors !== metadata.entries.length
    || receipt.counts.reusedCheckpoints + receipt.counts.newCheckpoints
      !== metadata.entries.length
  ) {
    fail(
      'RELEASE_ENVELOPE_MISMATCH',
      'Semantic release metadata and receipt describe different artifacts',
    );
  }
  const expectedVectorBytes = metadata.vectors.count
    * metadata.vectors.dimension
    * Float32Array.BYTES_PER_ELEMENT;
  if (
    !Number.isSafeInteger(expectedVectorBytes)
    || expectedVectorBytes !== metadata.vectors.byteLength
  ) {
    fail('RELEASE_VECTOR_LENGTH_MISMATCH', 'Semantic release vector dimensions are inconsistent');
  }
}

function decodeAndVerifyRows(
  metadata: SfxCatalogSemanticReleaseMetadata,
  vectorBuffer: Buffer,
): { vectors: Float32Array; rows: IndexedVectorRow[] } {
  const dimension = metadata.vectors.dimension;
  const rowByteLength = dimension * Float32Array.BYTES_PER_ELEMENT;
  const vectors = new Float32Array(metadata.vectors.count * dimension);
  const seenAssetIds = new Set<string>();
  const seenContentHashes = new Set<string>();
  const rows = metadata.entries.map((entry, rowIndex) => {
    if (
      entry.rowIndex !== rowIndex
      || entry.vectorOffsetBytes !== rowIndex * rowByteLength
      || entry.vectorByteLength !== rowByteLength
    ) {
      fail(
        'RELEASE_VECTOR_ROW_MISMATCH',
        `Semantic release row ${rowIndex} has invalid offset metadata`,
      );
    }
    if (
      seenAssetIds.has(entry.assetId)
      || seenContentHashes.has(entry.catalogContentHashSha256)
    ) {
      fail('DUPLICATE_RELEASE_VECTOR', `Duplicate semantic release row: ${entry.assetId}`);
    }
    seenAssetIds.add(entry.assetId);
    seenContentHashes.add(entry.catalogContentHashSha256);
    let norm = 0;
    const vectorOffset = rowIndex * dimension;
    for (let column = 0; column < dimension; column += 1) {
      const value = vectorBuffer.readFloatLE(entry.vectorOffsetBytes + column * 4);
      if (!Number.isFinite(value)) {
        fail('INVALID_RELEASE_VECTOR', `Semantic release vector is non-finite: ${entry.assetId}`);
      }
      vectors[vectorOffset + column] = value;
      norm += value * value;
    }
    if (Math.abs(Math.sqrt(norm) - 1) > 0.000_01) {
      fail('INVALID_RELEASE_VECTOR', `Semantic release vector is not normalized: ${entry.assetId}`);
    }
    return { entry, offset: vectorOffset };
  });
  return { vectors, rows };
}

function normalizedEmbedding(
  input: Float32Array,
  dimension: number,
  label: string,
): Float32Array {
  if (input.length !== dimension) {
    fail(
      'INVALID_SEMANTIC_QUERY_EMBEDDING',
      `Semantic ${label} vector dimension must be ${dimension}`,
    );
  }
  let norm = 0;
  for (const value of input) {
    if (!Number.isFinite(value)) {
      fail('INVALID_SEMANTIC_QUERY_EMBEDDING', `Semantic ${label} vector is non-finite`);
    }
    norm += value * value;
  }
  const magnitude = Math.sqrt(norm);
  if (magnitude <= Number.EPSILON) {
    fail('INVALID_SEMANTIC_QUERY_EMBEDDING', `Semantic ${label} vector has zero magnitude`);
  }
  const output = new Float32Array(dimension);
  for (let index = 0; index < dimension; index += 1) {
    output[index] = input[index] / magnitude;
  }
  return output;
}

function dotProductRow(
  query: Float32Array,
  vectors: Float32Array,
  offset: number,
  dimension: number,
): number {
  let dot = 0;
  for (let index = 0; index < dimension; index += 1) {
    dot += query[index] * vectors[offset + index];
  }
  return Math.max(-1, Math.min(1, dot));
}

async function readReleaseFile(directory: string, filename: string): Promise<Buffer> {
  try {
    return await readFile(path.join(directory, filename));
  } catch (error) {
    throw new SfxCatalogSemanticIndexError(
      'SEMANTIC_RELEASE_FILE_UNAVAILABLE',
      `Could not read semantic release artifact ${filename}`,
      { cause: error },
    );
  }
}

function parseJsonBuffer(buffer: Buffer, code: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new SfxCatalogSemanticIndexError(
      code,
      'Semantic release artifact is not valid JSON',
      { cause: error },
    );
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

function withoutReceiptDigest(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_RELEASE_RECEIPT', 'Semantic release receipt must be an object');
  }
  const {
    receiptDigestSha256: _receiptDigestSha256,
    ...payload
  } = value as Record<string, unknown>;
  return payload;
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function fail(code: string, message: string): never {
  throw new SfxCatalogSemanticIndexError(code, message);
}
