import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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
  decodeFloat32Embedding,
  embedVerifiedConditionedSfxAudio,
  encodeFloat32Embedding,
  type DecodedAudio,
  type SfxClapEmbeddingRuntime,
  type SfxClapModelDescriptor,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogEventRole,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  FSD50K_CATALOG_PROMOTION_VERSION,
  FSD50K_PUBLICATION_AGGREGATE_VERSION,
} from '@/lib/pipeline/sfx-fsd50k-publication-aggregate';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const REVIEW_ID_PATTERN = /^sfx_review_[a-f0-9]{20}$/;
const CURATION_SPEC_FILE = 'curation-spec.json';
const AGGREGATE_RECEIPT_FILE = 'publication-aggregate-receipt.json';
const PROMOTED_MANIFEST_FILE = 'manifest.json';
const PROMOTION_RECEIPT_FILE = 'catalog-promotion-receipt.json';
const METADATA_FILE = 'metadata.json';
const VECTORS_FILE = 'vectors.f32';
const RELEASE_RECEIPT_FILE = 'semantic-release-receipt.json';

export const SFX_CATALOG_SEMANTIC_RELEASE_VERSION =
  'editron-sfx-catalog-semantic-release-v1' as const;
export const SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION =
  'editron-sfx-catalog-semantic-release-receipt-v1' as const;
export const SFX_CATALOG_SEMANTIC_CHECKPOINT_VERSION =
  'editron-sfx-catalog-semantic-checkpoint-v1' as const;

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
const curationAssetSchema = z.object({
  sourcePath: z.string().min(1),
  eventRoles: z.array(eventRoleSchema).length(1),
  semanticEvidence: sfxCatalogSemanticEvidenceSchema,
  provenance: z.object({
    provider: z.literal('fsd50k'),
    providerAssetId: z.string().min(1),
    licenseId: z.literal('cc0-1.0'),
    licenseUrl: z.string().url(),
    attributionRequired: z.literal(false),
  }).strict(),
  approval: z.object({
    status: z.literal('approved'),
    reviewerId: z.string().trim().min(1),
    reviewedAt: z.string().datetime(),
  }).strict(),
}).passthrough();
const curationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();
const aggregateAssetSchema = z.object({
  gateBatchId: z.string().min(1),
  reviewId: z.string().regex(REVIEW_ID_PATTERN),
  canonicalSourceId: z.string().min(1),
  candidateDigestSha256: sha256Schema,
  embeddingSourceHashSha256: sha256Schema,
  conditionedHashSha256: sha256Schema,
  selectedRole: eventRoleSchema,
  stagedAudioPath: z.string().min(1),
  byteLength: z.number().int().positive(),
}).strict();
const aggregateReceiptSchema = z.object({
  version: z.literal(FSD50K_PUBLICATION_AGGREGATE_VERSION),
  generatedAt: z.string().datetime(),
  sourceGates: z.array(z.object({
    batchId: z.string().min(1),
    gateReceiptDigestSha256: sha256Schema,
    curationSpecDigestSha256: sha256Schema,
  }).strict()).min(1),
  policy: z.object({
    everyAssetBoundToExplicitGate: z.literal(true),
    everyCurationSpecDigestVerified: z.literal(true),
    duplicateReviewIdsRejected: z.literal(true),
    duplicateCanonicalSourceIdsRejected: z.literal(true),
    duplicateAudioContentRejected: z.literal(true),
    manifestMutationPerformed: z.literal(false),
  }).strict(),
  counts: z.object({
    sourceGates: z.number().int().positive(),
    approvedAssets: z.number().int().positive(),
  }).strict(),
  curationSpecDigestSha256: sha256Schema,
  assets: z.array(aggregateAssetSchema).min(1),
  receiptDigestSha256: sha256Schema,
}).strict();
const promotionReceiptSchema = z.object({
  version: z.literal(FSD50K_CATALOG_PROMOTION_VERSION),
  promotedAt: z.string().datetime(),
  source: z.object({
    mergeReceiptDigestSha256: sha256Schema,
    publicationReceiptDigestSha256: sha256Schema,
  }).strict(),
  policy: z.object({
    allDeltaObjectsVerified: z.literal(true),
    existingCatalogEntriesPreserved: z.literal(true),
    liveManifestMutationPerformed: z.literal(false),
  }).strict(),
  counts: z.object({
    existingAssets: z.number().int().nonnegative(),
    deltaAssets: z.number().int().positive(),
    promotedAssets: z.number().int().positive(),
  }).strict(),
  promotedManifestDigestSha256: sha256Schema,
  receiptDigestSha256: sha256Schema,
}).strict();
const checkpointSchema = z.object({
  version: z.literal(SFX_CATALOG_SEMANTIC_CHECKPOINT_VERSION),
  assetId: z.string().regex(ASSET_ID_PATTERN),
  sourceBindingDigestSha256: sha256Schema,
  modelDescriptorDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
  embedding: z.object({
    encoding: z.literal('base64-f32le'),
    dimension: z.number().int().positive(),
    value: z.string().min(1),
  }).strict(),
  checkpointDigestSha256: sha256Schema,
}).strict();

type AggregateReceipt = z.infer<typeof aggregateReceiptSchema>;
type AggregateAsset = z.infer<typeof aggregateAssetSchema>;
type CurationSpec = z.infer<typeof curationSpecSchema>;
type CurationAsset = CurationSpec['assets'][number];
type PromotionReceipt = z.infer<typeof promotionReceiptSchema>;
type SemanticCheckpoint = z.infer<typeof checkpointSchema>;

export interface SfxSemanticReleaseEntry {
  rowIndex: number;
  vectorOffsetBytes: number;
  vectorByteLength: number;
  assetId: string;
  canonicalSourceId: string;
  reviewId: string;
  selectedRole: SfxCatalogEventRole;
  catalogContentHashSha256: string;
  embeddingSourceHashSha256: string;
  candidateDigestSha256: string;
  gateBatchId: string;
  gateReceiptDigestSha256: string;
  catalogEntryDigestSha256: string;
  semanticEvidenceDigestSha256: string;
  segmentCount: number;
}

export interface SfxCatalogSemanticReleaseMetadata {
  version: typeof SFX_CATALOG_SEMANTIC_RELEASE_VERSION;
  generatedAt: string;
  model: SfxClapModelDescriptor;
  source: {
    aggregateReceiptDigestSha256: string;
    aggregateCurationSpecDigestSha256: string;
    promotionReceiptDigestSha256: string;
    promotedManifestDigestSha256: string;
  };
  policy: {
    explicitPerAssetApprovalRequired: true;
    promotionReceiptRequired: true;
    conditionedCatalogBytesReembedded: true;
    approvedSourceBytesVerifiedEveryBuild: true;
    unreviewedCorpusIncluded: false;
    exactCosineSearchCompatible: true;
    runtimeSelectionPerformed: false;
    manifestMutationPerformed: false;
  };
  vectors: {
    filename: typeof VECTORS_FILE;
    encoding: 'f32le-row-major';
    dimension: number;
    count: number;
    byteLength: number;
    sha256: string;
  };
  entries: SfxSemanticReleaseEntry[];
}

export interface SfxCatalogSemanticReleaseReceipt {
  version: typeof SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION;
  generatedAt: string;
  source: SfxCatalogSemanticReleaseMetadata['source'];
  policy: SfxCatalogSemanticReleaseMetadata['policy'];
  counts: {
    approvedAssets: number;
    semanticVectors: number;
    sourceGates: number;
    reusedCheckpoints: number;
    newCheckpoints: number;
  };
  artifacts: {
    metadata: {
      filename: typeof METADATA_FILE;
      byteLength: number;
      sha256: string;
    };
    vectors: SfxCatalogSemanticReleaseMetadata['vectors'];
  };
  receiptDigestSha256: string;
}

export interface BuildSfxCatalogSemanticReleaseOptions {
  aggregateDirectory: string;
  promotionDirectory: string;
  outputDirectory: string;
  workingDirectory?: string;
  generatedAt?: Date;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completedAssets: number;
    totalAssets: number;
    assetId: string;
    reusedCheckpoint: boolean;
  }) => void | Promise<void>;
}

export interface BuildSfxCatalogSemanticReleaseDependencies {
  runtime: SfxClapEmbeddingRuntime;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
}

export interface BuiltSfxCatalogSemanticRelease {
  metadata: SfxCatalogSemanticReleaseMetadata;
  receipt: SfxCatalogSemanticReleaseReceipt;
  outputDirectory: string;
  workingDirectory: string;
  metadataPath: string;
  vectorsPath: string;
  receiptPath: string;
}

interface ValidatedAggregatePackage {
  directory: string;
  curationSpec: CurationSpec;
  receipt: AggregateReceipt;
}

interface ValidatedPromotionPackage {
  manifest: SfxCatalogManifest;
  receipt: PromotionReceipt;
}

interface BoundSemanticAsset {
  entry: SfxCatalogEntry & { semanticEvidence: NonNullable<SfxCatalogEntry['semanticEvidence']> };
  aggregateAsset: AggregateAsset;
  curation: CurationAsset;
  gateReceiptDigestSha256: string;
  sourceBindingDigestSha256: string;
}

export class SfxCatalogSemanticReleaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SfxCatalogSemanticReleaseError';
  }
}

export async function buildSfxCatalogSemanticRelease(
  options: BuildSfxCatalogSemanticReleaseOptions,
  dependencies: BuildSfxCatalogSemanticReleaseDependencies,
): Promise<BuiltSfxCatalogSemanticRelease> {
  const generatedAt = options.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    fail('INVALID_RELEASE_CLOCK', 'Semantic release timestamp is invalid');
  }
  validatePinnedRuntime(dependencies.runtime.descriptor);
  const outputDirectory = path.resolve(options.outputDirectory);
  const workingDirectory = path.resolve(
    options.workingDirectory ?? `${outputDirectory}.work`,
  );
  if (
    isSameOrInside(outputDirectory, workingDirectory)
    || isSameOrInside(workingDirectory, outputDirectory)
  ) {
    fail(
      'INVALID_WORKING_DIRECTORY',
      'Semantic release work and output directory trees must be disjoint',
    );
  }
  await assertMissing(outputDirectory);
  const aggregate = await readAggregatePackage(options.aggregateDirectory);
  const promotion = await readPromotionPackage(options.promotionDirectory);
  const boundAssets = bindApprovedSemanticAssets(aggregate, promotion);
  const canonicalWorkingDirectory = await ensureWorkingDirectory(workingDirectory);
  const modelDescriptorDigestSha256 = hashJson(dependencies.runtime.descriptor);
  const vectorRows: Array<{ asset: BoundSemanticAsset; checkpoint: SemanticCheckpoint }> = [];
  let reusedCheckpoints = 0;
  let newCheckpoints = 0;

  for (const [index, asset] of boundAssets.entries()) {
    throwIfAborted(options.signal);
    const encoded = await readBoundFile(
      aggregate.directory,
      asset.aggregateAsset.stagedAudioPath,
    );
    if (
      encoded.byteLength !== asset.aggregateAsset.byteLength
      || hashBuffer(encoded) !== asset.aggregateAsset.conditionedHashSha256
    ) {
      fail(
        'APPROVED_AUDIO_MISMATCH',
        `Approved catalog audio changed for ${asset.entry.assetId}`,
      );
    }
    const checkpointPath = semanticCheckpointPath(
      canonicalWorkingDirectory,
      asset.entry.assetId,
    );
    let checkpoint = await loadSemanticCheckpoint(
      checkpointPath,
      asset,
      modelDescriptorDigestSha256,
      dependencies.runtime.descriptor.embeddingDimension,
    );
    const reusedCheckpoint = Boolean(checkpoint);
    if (!checkpoint) {
      const embedded = await embedVerifiedConditionedSfxAudio({
        sourceId: asset.entry.assetId,
        encoded,
        expectedContentHashSha256: asset.aggregateAsset.conditionedHashSha256,
      }, {
        runtime: dependencies.runtime,
        decodeAudio: dependencies.decodeAudio,
      });
      checkpoint = buildSemanticCheckpoint(
        asset,
        modelDescriptorDigestSha256,
        embedded.segmentCount,
        embedded.embedding,
      );
      await writeSemanticCheckpoint(checkpointPath, checkpoint);
      newCheckpoints += 1;
    } else {
      reusedCheckpoints += 1;
    }
    vectorRows.push({ asset, checkpoint });
    await options.onProgress?.({
      completedAssets: index + 1,
      totalAssets: boundAssets.length,
      assetId: asset.entry.assetId,
      reusedCheckpoint,
    });
  }

  throwIfAborted(options.signal);
  const vectorBuffers = vectorRows.map(({ checkpoint }) => (
    Buffer.from(checkpoint.embedding.value, 'base64')
  ));
  const vectorsBuffer = Buffer.concat(vectorBuffers);
  const expectedVectorBytes = vectorRows.length
    * dependencies.runtime.descriptor.embeddingDimension
    * Float32Array.BYTES_PER_ELEMENT;
  if (vectorsBuffer.byteLength !== expectedVectorBytes) {
    fail(
      'VECTOR_ARTIFACT_LENGTH_MISMATCH',
      `Semantic vector artifact has ${vectorsBuffer.byteLength} bytes; expected ${expectedVectorBytes}`,
    );
  }
  const vectorsSha256 = hashBuffer(vectorsBuffer);
  const source = {
    aggregateReceiptDigestSha256: aggregate.receipt.receiptDigestSha256,
    aggregateCurationSpecDigestSha256: aggregate.receipt.curationSpecDigestSha256,
    promotionReceiptDigestSha256: promotion.receipt.receiptDigestSha256,
    promotedManifestDigestSha256: promotion.receipt.promotedManifestDigestSha256,
  };
  const policy = {
    explicitPerAssetApprovalRequired: true as const,
    promotionReceiptRequired: true as const,
    conditionedCatalogBytesReembedded: true as const,
    approvedSourceBytesVerifiedEveryBuild: true as const,
    unreviewedCorpusIncluded: false as const,
    exactCosineSearchCompatible: true as const,
    runtimeSelectionPerformed: false as const,
    manifestMutationPerformed: false as const,
  };
  const vectorByteLength = dependencies.runtime.descriptor.embeddingDimension
    * Float32Array.BYTES_PER_ELEMENT;
  const vectors: SfxCatalogSemanticReleaseMetadata['vectors'] = {
    filename: VECTORS_FILE,
    encoding: 'f32le-row-major' as const,
    dimension: dependencies.runtime.descriptor.embeddingDimension,
    count: vectorRows.length,
    byteLength: vectorsBuffer.byteLength,
    sha256: vectorsSha256,
  };
  const metadata: SfxCatalogSemanticReleaseMetadata = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
    generatedAt: generatedAt.toISOString(),
    model: dependencies.runtime.descriptor,
    source,
    policy,
    vectors,
    entries: vectorRows.map(({ asset, checkpoint }, rowIndex) => ({
      rowIndex,
      vectorOffsetBytes: rowIndex * vectorByteLength,
      vectorByteLength,
      assetId: asset.entry.assetId,
      canonicalSourceId: asset.aggregateAsset.canonicalSourceId,
      reviewId: asset.aggregateAsset.reviewId,
      selectedRole: asset.aggregateAsset.selectedRole,
      catalogContentHashSha256: asset.aggregateAsset.conditionedHashSha256,
      embeddingSourceHashSha256: asset.aggregateAsset.embeddingSourceHashSha256,
      candidateDigestSha256: asset.aggregateAsset.candidateDigestSha256,
      gateBatchId: asset.aggregateAsset.gateBatchId,
      gateReceiptDigestSha256: asset.gateReceiptDigestSha256,
      catalogEntryDigestSha256: hashJson(asset.entry),
      semanticEvidenceDigestSha256: hashJson(asset.entry.semanticEvidence),
      segmentCount: checkpoint.segmentCount,
    })),
  };
  const metadataBuffer = Buffer.from(stableJson(metadata));
  const receiptWithoutDigest: Omit<
    SfxCatalogSemanticReleaseReceipt,
    'receiptDigestSha256'
  > = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
    generatedAt: generatedAt.toISOString(),
    source,
    policy,
    counts: {
      approvedAssets: aggregate.receipt.assets.length,
      semanticVectors: vectorRows.length,
      sourceGates: aggregate.receipt.sourceGates.length,
      reusedCheckpoints,
      newCheckpoints,
    },
    artifacts: {
      metadata: {
        filename: METADATA_FILE,
        byteLength: metadataBuffer.byteLength,
        sha256: hashBuffer(metadataBuffer),
      },
      vectors,
    },
  };
  const receipt: SfxCatalogSemanticReleaseReceipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  await writeImmutableRelease(outputDirectory, metadataBuffer, vectorsBuffer, receipt);
  return {
    metadata,
    receipt,
    outputDirectory,
    workingDirectory: canonicalWorkingDirectory,
    metadataPath: path.join(outputDirectory, METADATA_FILE),
    vectorsPath: path.join(outputDirectory, VECTORS_FILE),
    receiptPath: path.join(outputDirectory, RELEASE_RECEIPT_FILE),
  };
}

async function readAggregatePackage(directoryValue: string): Promise<ValidatedAggregatePackage> {
  const directory = await resolveDirectory(directoryValue, 'INVALID_AGGREGATE_DIRECTORY');
  const [rawCuration, rawReceipt] = await Promise.all([
    readJson(path.join(directory, CURATION_SPEC_FILE), 'INVALID_AGGREGATE_CURATION_JSON'),
    readJson(path.join(directory, AGGREGATE_RECEIPT_FILE), 'INVALID_AGGREGATE_RECEIPT_JSON'),
  ]);
  const curationSpec = parseSchema(
    curationSpecSchema,
    rawCuration,
    'INVALID_AGGREGATE_CURATION',
  );
  const receipt = parseSchema(
    aggregateReceiptSchema,
    rawReceipt,
    'INVALID_AGGREGATE_RECEIPT',
  );
  if (hashJson(withoutDigest(rawReceipt)) !== receipt.receiptDigestSha256) {
    fail('AGGREGATE_RECEIPT_DIGEST_MISMATCH', 'Aggregate receipt was modified');
  }
  if (hashJson(rawCuration) !== receipt.curationSpecDigestSha256) {
    fail('AGGREGATE_CURATION_DIGEST_MISMATCH', 'Aggregate curation spec was modified');
  }
  if (
    receipt.counts.sourceGates !== receipt.sourceGates.length
    || receipt.counts.approvedAssets !== receipt.assets.length
    || receipt.counts.approvedAssets !== curationSpec.assets.length
  ) {
    fail('AGGREGATE_COUNT_MISMATCH', 'Aggregate receipt counts are inconsistent');
  }
  uniqueMap(receipt.sourceGates, gate => gate.batchId, 'DUPLICATE_SOURCE_GATE');
  uniqueMap(receipt.assets, asset => asset.reviewId, 'DUPLICATE_AGGREGATE_REVIEW_ID');
  uniqueMap(
    receipt.assets,
    asset => asset.conditionedHashSha256,
    'DUPLICATE_AGGREGATE_CONTENT_HASH',
  );
  uniqueMap(curationSpec.assets, asset => asset.sourcePath, 'DUPLICATE_CURATION_SOURCE_PATH');
  return { directory, curationSpec, receipt };
}

async function readPromotionPackage(directoryValue: string): Promise<ValidatedPromotionPackage> {
  const directory = await resolveDirectory(directoryValue, 'INVALID_PROMOTION_DIRECTORY');
  const [rawManifest, rawReceipt] = await Promise.all([
    readJson(path.join(directory, PROMOTED_MANIFEST_FILE), 'INVALID_PROMOTED_MANIFEST_JSON'),
    readJson(path.join(directory, PROMOTION_RECEIPT_FILE), 'INVALID_PROMOTION_RECEIPT_JSON'),
  ]);
  let manifest: SfxCatalogManifest;
  try {
    manifest = parseSfxCatalogManifest(rawManifest);
  } catch (error) {
    throw new SfxCatalogSemanticReleaseError(
      'INVALID_PROMOTED_MANIFEST',
      `Promoted SFX catalog is invalid: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  const receipt = parseSchema(
    promotionReceiptSchema,
    rawReceipt,
    'INVALID_PROMOTION_RECEIPT',
  );
  if (hashJson(withoutDigest(rawReceipt)) !== receipt.receiptDigestSha256) {
    fail('PROMOTION_RECEIPT_DIGEST_MISMATCH', 'Catalog promotion receipt was modified');
  }
  if (hashJson(rawManifest) !== receipt.promotedManifestDigestSha256) {
    fail('PROMOTED_MANIFEST_DIGEST_MISMATCH', 'Promoted catalog differs from its receipt');
  }
  if (
    receipt.counts.promotedAssets !== manifest.entries.length
    || receipt.counts.existingAssets + receipt.counts.deltaAssets
      !== receipt.counts.promotedAssets
  ) {
    fail('PROMOTION_COUNT_MISMATCH', 'Catalog promotion counts are inconsistent');
  }
  return { manifest, receipt };
}

function bindApprovedSemanticAssets(
  aggregate: ValidatedAggregatePackage,
  promotion: ValidatedPromotionPackage,
): BoundSemanticAsset[] {
  const semanticEntries = promotion.manifest.entries.filter(
    (entry): entry is SfxCatalogEntry & {
      semanticEvidence: NonNullable<SfxCatalogEntry['semanticEvidence']>;
    } => Boolean(entry.semanticEvidence),
  );
  if (semanticEntries.length === 0) {
    fail('NO_APPROVED_SEMANTIC_ASSETS', 'Promoted catalog has no semantic-evidence assets');
  }
  if (
    semanticEntries.length !== aggregate.receipt.assets.length
    || semanticEntries.length !== aggregate.curationSpec.assets.length
  ) {
    fail(
      'SEMANTIC_ASSET_SET_MISMATCH',
      'Promoted semantic assets must exactly match the complete approved aggregate',
    );
  }
  const aggregateByHash = uniqueMap(
    aggregate.receipt.assets,
    asset => asset.conditionedHashSha256,
    'DUPLICATE_AGGREGATE_CONTENT_HASH',
  );
  const curationByPath = uniqueMap(
    aggregate.curationSpec.assets,
    asset => asset.sourcePath,
    'DUPLICATE_CURATION_SOURCE_PATH',
  );
  const gateByBatch = uniqueMap(
    aggregate.receipt.sourceGates,
    gate => gate.batchId,
    'DUPLICATE_SOURCE_GATE',
  );
  const matchedReviews = new Set<string>();
  const bound = semanticEntries
    .sort((left, right) => left.assetId.localeCompare(right.assetId))
    .map(entry => {
      const evidence = entry.semanticEvidence;
      const aggregateAsset = aggregateByHash.get(entry.contentHashSha256);
      if (!aggregateAsset) {
        fail('UNAPPROVED_SEMANTIC_ASSET', `Catalog asset lacks approval evidence: ${entry.assetId}`);
      }
      const curation = curationByPath.get(aggregateAsset.stagedAudioPath);
      const gate = gateByBatch.get(aggregateAsset.gateBatchId);
      if (!curation || !gate) {
        fail(
          'INCOMPLETE_APPROVAL_BINDING',
          `Catalog asset has incomplete gate evidence: ${entry.assetId}`,
        );
      }
      if (
        matchedReviews.has(aggregateAsset.reviewId)
        || entry.provenance.provider !== 'fsd50k'
        || entry.provenance.providerAssetId !== aggregateAsset.canonicalSourceId
        || !entry.audioRights.licensed
        || entry.audioRights.evidence.licenseId !== 'cc0-1.0'
        || entry.contentHashSha256 !== aggregateAsset.conditionedHashSha256
        || evidence.catalogContentHashSha256 !== aggregateAsset.conditionedHashSha256
        || evidence.embeddingSourceHashSha256 !== aggregateAsset.embeddingSourceHashSha256
        || evidence.candidateDigestSha256 !== aggregateAsset.candidateDigestSha256
        || evidence.selectedRole !== aggregateAsset.selectedRole
        || curation.sourcePath !== aggregateAsset.stagedAudioPath
        || curation.provenance.providerAssetId !== aggregateAsset.canonicalSourceId
        || curation.eventRoles[0] !== aggregateAsset.selectedRole
        || hashJson(curation.semanticEvidence) !== hashJson(evidence)
      ) {
        fail(
          'SEMANTIC_APPROVAL_EVIDENCE_MISMATCH',
          `Catalog and approval evidence differ for ${entry.assetId}`,
        );
      }
      matchedReviews.add(aggregateAsset.reviewId);
      const sourceBindingDigestSha256 = hashJson({
        aggregateReceiptDigestSha256: aggregate.receipt.receiptDigestSha256,
        promotionReceiptDigestSha256: promotion.receipt.receiptDigestSha256,
        aggregateAsset,
        catalogEntryDigestSha256: hashJson(entry),
        semanticEvidenceDigestSha256: hashJson(evidence),
        gateReceiptDigestSha256: gate.gateReceiptDigestSha256,
      });
      return {
        entry,
        aggregateAsset,
        curation,
        gateReceiptDigestSha256: gate.gateReceiptDigestSha256,
        sourceBindingDigestSha256,
      };
    });
  if (matchedReviews.size !== aggregate.receipt.assets.length) {
    fail('SEMANTIC_ASSET_SET_MISMATCH', 'Approved aggregate contains unindexed assets');
  }
  return bound;
}

function validatePinnedRuntime(descriptor: SfxClapModelDescriptor): void {
  const expected: SfxClapModelDescriptor = {
    provider: 'huggingface-transformers-js',
    packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
    modelId: SFX_CLAP_MODEL_ID,
    revision: SFX_CLAP_MODEL_REVISION,
    dtype: 'q8',
    sampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
    embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    windowing: 'non-overlapping-10s-duration-weighted-mean',
  };
  if (hashJson(descriptor) !== hashJson(expected)) {
    fail(
      'UNPINNED_SEMANTIC_MODEL',
      `Semantic release requires ${SFX_CLAP_MODEL_ID}@${SFX_CLAP_MODEL_REVISION}`,
    );
  }
}

function buildSemanticCheckpoint(
  asset: BoundSemanticAsset,
  modelDescriptorDigestSha256: string,
  segmentCount: number,
  embedding: Float32Array,
): SemanticCheckpoint {
  assertNormalizedEmbedding(embedding, SFX_CLAP_EMBEDDING_DIMENSION);
  const checkpointWithoutDigest = {
    version: SFX_CATALOG_SEMANTIC_CHECKPOINT_VERSION,
    assetId: asset.entry.assetId,
    sourceBindingDigestSha256: asset.sourceBindingDigestSha256,
    modelDescriptorDigestSha256,
    segmentCount,
    embedding: {
      encoding: 'base64-f32le' as const,
      dimension: embedding.length,
      value: encodeFloat32Embedding(embedding),
    },
  };
  return checkpointSchema.parse({
    ...checkpointWithoutDigest,
    checkpointDigestSha256: hashJson(checkpointWithoutDigest),
  });
}

async function loadSemanticCheckpoint(
  checkpointPath: string,
  asset: BoundSemanticAsset,
  modelDescriptorDigestSha256: string,
  embeddingDimension: number,
): Promise<SemanticCheckpoint | undefined> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(checkpointPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new SfxCatalogSemanticReleaseError(
      'INVALID_RELEASE_CHECKPOINT',
      `Could not read semantic checkpoint for ${asset.entry.assetId}`,
      { cause: error },
    );
  }
  const checkpoint = parseSchema(
    checkpointSchema,
    raw,
    'INVALID_RELEASE_CHECKPOINT',
  );
  if (
    checkpoint.assetId !== asset.entry.assetId
    || checkpoint.sourceBindingDigestSha256 !== asset.sourceBindingDigestSha256
    || checkpoint.modelDescriptorDigestSha256 !== modelDescriptorDigestSha256
    || checkpoint.embedding.dimension !== embeddingDimension
    || hashJson(withoutCheckpointDigest(raw)) !== checkpoint.checkpointDigestSha256
  ) {
    fail(
      'STALE_RELEASE_CHECKPOINT',
      `Semantic checkpoint belongs to different evidence: ${asset.entry.assetId}`,
    );
  }
  const embedding = decodeFloat32Embedding(
    checkpoint.embedding.value,
    checkpoint.embedding.dimension,
  );
  assertNormalizedEmbedding(embedding, embeddingDimension);
  return checkpoint;
}

async function writeSemanticCheckpoint(
  checkpointPath: string,
  checkpoint: SemanticCheckpoint,
): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = `${checkpointPath}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, stableJson(checkpoint), { flag: 'wx' });
    await rename(temporaryPath, checkpointPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function semanticCheckpointPath(workingDirectory: string, assetId: string): string {
  if (!ASSET_ID_PATTERN.test(assetId)) {
    fail('UNSAFE_CHECKPOINT_ASSET_ID', `Unsafe semantic checkpoint asset ID: ${assetId}`);
  }
  const shard = createHash('sha256').update(assetId).digest('hex').slice(0, 2);
  return path.join(workingDirectory, 'checkpoints', shard, `${assetId}.json`);
}

async function writeImmutableRelease(
  outputDirectory: string,
  metadataBuffer: Buffer,
  vectorsBuffer: Buffer,
  receipt: SfxCatalogSemanticReleaseReceipt,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    await Promise.all([
      writeFile(path.join(staging, METADATA_FILE), metadataBuffer, { flag: 'wx' }),
      writeFile(path.join(staging, VECTORS_FILE), vectorsBuffer, { flag: 'wx' }),
      writeFile(path.join(staging, RELEASE_RECEIPT_FILE), stableJson(receipt), { flag: 'wx' }),
    ]);
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function readBoundFile(root: string, relativePath: string): Promise<Buffer> {
  if (
    path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').some(segment => !segment || segment === '..' || segment === '.')
  ) {
    fail('UNSAFE_APPROVED_AUDIO_PATH', `Unsafe approved audio path: ${relativePath}`);
  }
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('UNSAFE_APPROVED_AUDIO_FILE', `Expected a real approved audio file: ${relativePath}`);
  }
  const canonicalPath = await realpath(absolutePath);
  if (!isInside(root, canonicalPath)) {
    fail('APPROVED_AUDIO_PATH_ESCAPE', `Approved audio escapes its aggregate: ${relativePath}`);
  }
  return readFile(canonicalPath);
}

async function ensureWorkingDirectory(directoryValue: string): Promise<string> {
  await mkdir(directoryValue, { recursive: true });
  const stat = await lstat(directoryValue);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('INVALID_WORKING_DIRECTORY', `Expected a real working directory: ${directoryValue}`);
  }
  return realpath(directoryValue);
}

async function resolveDirectory(directoryValue: string, code: string): Promise<string> {
  const resolved = path.resolve(directoryValue);
  let stat;
  try {
    stat = await lstat(resolved);
  } catch (error) {
    throw new SfxCatalogSemanticReleaseError(
      code,
      `Directory is unavailable: ${resolved}`,
      { cause: error },
    );
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(code, `Expected a real directory: ${resolved}`);
  }
  return realpath(resolved);
}

async function readJson(filePath: string, code: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new SfxCatalogSemanticReleaseError(
      code,
      `Could not read JSON ${filePath}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS', `Semantic release output already exists: ${target}`);
}

function assertNormalizedEmbedding(embedding: Float32Array, dimension: number): void {
  if (embedding.length !== dimension) {
    fail('INVALID_RELEASE_VECTOR', `Semantic vector dimension must be ${dimension}`);
  }
  let norm = 0;
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      fail('INVALID_RELEASE_VECTOR', 'Semantic vector contains a non-finite value');
    }
    norm += value * value;
  }
  if (Math.abs(Math.sqrt(norm) - 1) > 0.000_01) {
    fail('INVALID_RELEASE_VECTOR', 'Semantic vector is not L2-normalized');
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

function uniqueMap<T>(
  values: T[],
  keyOf: (value: T) => string,
  code: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) fail(code, `Duplicate semantic release key: ${key}`);
    result.set(key, value);
  }
  return result;
}

function withoutDigest(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_RECEIPT_OBJECT', 'Semantic release source receipt must be an object');
  }
  const {
    receiptDigestSha256: _receiptDigestSha256,
    ...payload
  } = value as Record<string, unknown>;
  return payload;
}

function withoutCheckpointDigest(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_CHECKPOINT_OBJECT', 'Semantic release checkpoint must be an object');
  }
  const {
    checkpointDigestSha256: _checkpointDigestSha256,
    ...payload
  } = value as Record<string, unknown>;
  return payload;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new SfxCatalogSemanticReleaseError(
      'RELEASE_ABORTED',
      'Semantic release build was aborted',
      { cause: signal.reason },
    );
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isSameOrInside(root: string, candidate: string): boolean {
  return path.relative(root, candidate) === '' || isInside(root, candidate);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(code: string, message: string): never {
  throw new SfxCatalogSemanticReleaseError(code, message);
}
