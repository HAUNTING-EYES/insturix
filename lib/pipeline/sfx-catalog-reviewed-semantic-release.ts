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

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const MIGRATION_RECEIPT_FILE = 'semantic-migration-receipt.json';
const REVIEW_REPORT_FILE = 'review-report.json';
const REVIEW_RESOLUTION_FILE = 'semantic-review-resolution.json';
const APPLICATION_RECEIPT_FILE = 'semantic-review-application-receipt.json';
const RESOLVED_CURATION_FILE = 'resolved-curation-spec.json';
const MANIFEST_FILE = 'manifest.json';
const RELEASE_DIRECTORY = 'semantic-release';
const METADATA_FILE = 'metadata.json';
const VECTORS_FILE = 'vectors.f32';
const RELEASE_RECEIPT_FILE = 'semantic-release-receipt.json';

export const REVIEWED_SFX_SEMANTIC_RELEASE_VERSION =
  'editron-sfx-catalog-reviewed-semantic-release-v2' as const;
export const REVIEWED_SFX_SEMANTIC_RELEASE_RECEIPT_VERSION =
  'editron-sfx-catalog-reviewed-semantic-release-receipt-v2' as const;
export const REVIEWED_SFX_SEMANTIC_CHECKPOINT_VERSION =
  'editron-sfx-catalog-reviewed-semantic-checkpoint-v2' as const;

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
const reviewedReleaseSourceSchema = z.object({
  migrationReceiptDigestSha256: sha256Schema,
  reviewReportDigestSha256: sha256Schema,
  reviewResolutionDigestSha256: sha256Schema,
  applicationReceiptDigestSha256: sha256Schema,
  resolvedCurationSpecDigestSha256: sha256Schema,
  sourceManifestDigestSha256: sha256Schema,
  runtimeManifestDigestSha256: sha256Schema,
}).strict();
const reviewedReleasePolicySchema = z.object({
  exactHumanReviewResolutionRequired: z.literal(true),
  quarantinedAssetsExcluded: z.literal(true),
  sourceAudioBytesReembedded: z.literal(true),
  approvedSourceBytesVerifiedEveryBuild: z.literal(true),
  unreviewedCorpusIncluded: z.literal(false),
  exactCosineSearchCompatible: z.literal(true),
  runtimeSelectionPerformed: z.literal(false),
  productionCatalogMutationPerformed: z.literal(false),
}).strict();
const vectorArtifactSchema = z.object({
  filename: z.literal(VECTORS_FILE),
  encoding: z.literal('f32le-row-major'),
  dimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
  count: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  sha256: sha256Schema,
}).strict();
export const reviewedSfxSemanticReleaseEntrySchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  vectorOffsetBytes: z.number().int().nonnegative(),
  vectorByteLength: z.number().int().positive(),
  assetId: z.string().regex(ASSET_ID_PATTERN),
  provider: z.string().min(1),
  providerAssetId: z.string().min(1),
  selectedRole: eventRoleSchema,
  reviewDisposition: z.enum([
    'direct-agreement',
    'keep-current',
    'use-model-suggestion',
  ]),
  approvalReviewerId: z.string().trim().min(1),
  approvalReviewedAt: z.string().datetime(),
  catalogContentHashSha256: sha256Schema,
  embeddingSourceHashSha256: sha256Schema,
  candidateDigestSha256: sha256Schema,
  catalogEntryDigestSha256: sha256Schema,
  semanticEvidenceDigestSha256: sha256Schema,
  sourceBindingDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
}).strict();
export const reviewedSfxSemanticReleaseMetadataSchema = z.object({
  version: z.literal(REVIEWED_SFX_SEMANTIC_RELEASE_VERSION),
  generatedAt: z.string().datetime(),
  model: modelDescriptorSchema,
  source: reviewedReleaseSourceSchema,
  policy: reviewedReleasePolicySchema,
  vectors: vectorArtifactSchema,
  entries: z.array(reviewedSfxSemanticReleaseEntrySchema).min(1),
}).strict();
export const reviewedSfxSemanticReleaseReceiptSchema = z.object({
  version: z.literal(REVIEWED_SFX_SEMANTIC_RELEASE_RECEIPT_VERSION),
  generatedAt: z.string().datetime(),
  source: reviewedReleaseSourceSchema,
  policy: reviewedReleasePolicySchema,
  counts: z.object({
    sourceAssets: z.number().int().positive(),
    approvedAssets: z.number().int().positive(),
    quarantinedAssets: z.number().int().nonnegative(),
    semanticVectors: z.number().int().positive(),
    reusedCheckpoints: z.number().int().nonnegative(),
    newCheckpoints: z.number().int().nonnegative(),
  }).strict(),
  artifacts: z.object({
    manifest: z.object({
      filename: z.literal(MANIFEST_FILE),
      byteLength: z.number().int().positive(),
      sha256: sha256Schema,
    }).strict(),
    metadata: z.object({
      filename: z.literal(`${RELEASE_DIRECTORY}/${METADATA_FILE}`),
      byteLength: z.number().int().positive(),
      sha256: sha256Schema,
    }).strict(),
    vectors: vectorArtifactSchema,
  }).strict(),
  receiptDigestSha256: sha256Schema,
}).strict();

const curationAssetSchema = z.object({
  sourcePath: z.string().min(1),
  title: z.string().min(1),
  eventRoles: z.array(eventRoleSchema).length(1),
  surfaces: z.array(z.enum([
    'transition',
    'motion-graphic',
    'ui',
    'scene',
    'logo',
    'caption',
    'chapter',
  ])).min(1),
  layerRole: z.enum(['oneshot', 'riser', 'impact', 'loop', 'bed', 'sting']),
  tags: z.array(z.string().min(1)).min(1),
  negativeTags: z.array(z.string().min(1)),
  energy: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  transientSharpness: z.number().min(0).max(1),
  material: z.string().min(1),
  tailMs: z.number().int().nonnegative(),
  loopable: z.boolean(),
  direction: z.enum(['neutral', 'left', 'right', 'up', 'down', 'in', 'out']),
  motionSpeed: z.enum(['still', 'slow', 'medium', 'fast']),
  semanticEvidence: sfxCatalogSemanticEvidenceSchema,
  provenance: z.object({
    provider: z.string().min(1),
    providerAssetId: z.string().min(1),
    licenseId: z.string().min(1),
    licenseUrl: z.string().url().optional(),
    attributionRequired: z.boolean(),
    attributionText: z.string().min(1).optional(),
  }).strict(),
  approval: z.object({
    status: z.literal('approved'),
    reviewerId: z.string().trim().min(1),
    reviewedAt: z.string().datetime(),
  }).strict(),
}).passthrough();
const resolvedCurationSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();
const migrationEntrySchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  sourcePath: z.string().min(1),
  contentHashSha256: sha256Schema,
  candidateDigestSha256: sha256Schema,
  selectedRole: eventRoleSchema,
  roleAgreement: z.boolean(),
  semanticEvidenceDigestSha256: sha256Schema,
}).passthrough();
const migrationReceiptSchema = z.object({
  version: z.literal('approved-sfx-semantic-migration-receipt-v1'),
  source: z.object({
    liveManifestDigestSha256: sha256Schema,
  }).passthrough(),
  counts: z.object({
    approvedAssets: z.number().int().positive(),
    embeddedAssets: z.number().int().positive(),
    roleAgreement: z.number().int().nonnegative(),
    semanticDisagreements: z.number().int().nonnegative(),
  }).passthrough(),
  enrichedCurationSpecDigestSha256: sha256Schema,
  entries: z.array(migrationEntrySchema).min(1),
  receiptDigestSha256: sha256Schema,
}).passthrough();
const reviewCandidateSchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  candidateDigestSha256: sha256Schema,
  semanticEvidenceDigestSha256: sha256Schema,
  contentHashSha256: sha256Schema,
  currentRole: eventRoleSchema,
  suggestedRole: eventRoleSchema,
}).passthrough();
const reviewReportSchema = z.object({
  version: z.literal('approved-sfx-semantic-review-v1'),
  migration: z.object({
    receiptDigestSha256: sha256Schema,
    enrichedCurationSpecDigestSha256: sha256Schema,
  }).passthrough(),
  counts: z.object({
    migrationAssets: z.number().int().positive(),
    directRoleAgreement: z.number().int().nonnegative(),
    reviewCandidates: z.number().int().positive(),
  }).strict(),
  candidates: z.array(reviewCandidateSchema).min(1),
  reportDigestSha256: sha256Schema,
}).passthrough();
const resolutionEntrySchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  candidateDigestSha256: sha256Schema,
  decision: z.enum(['keep-current', 'use-model-suggestion', 'reject']),
  resolvedRole: eventRoleSchema.nullable(),
  note: z.string(),
}).strict();
const reviewResolutionSchema = z.object({
  version: z.literal('approved-sfx-semantic-review-resolution-v1'),
  reviewedAt: z.string().datetime(),
  reviewerId: z.string().trim().min(1),
  reviewReportDigestSha256: sha256Schema,
  migrationReceiptDigestSha256: sha256Schema,
  counts: z.object({
    keepCurrent: z.number().int().nonnegative(),
    useModelSuggestion: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }).strict(),
  entries: z.array(resolutionEntrySchema).min(1),
  resolutionDigestSha256: sha256Schema,
}).passthrough();
const applicationEntrySchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  contentHashSha256: sha256Schema,
  decision: z.enum(['keep-current', 'use-model-suggestion', 'reject']),
  previousRole: eventRoleSchema,
  resolvedRole: eventRoleSchema.nullable(),
  previousSemanticEvidenceDigestSha256: sha256Schema,
  resolvedSemanticEvidenceDigestSha256: sha256Schema.nullable(),
  note: z.string(),
}).strict();
const applicationReceiptSchema = z.object({
  version: z.literal('approved-sfx-semantic-review-application-v1'),
  source: z.object({
    migrationReceiptDigestSha256: sha256Schema,
    reviewReportDigestSha256: sha256Schema,
    reviewResolutionDigestSha256: sha256Schema,
    enrichedCurationSpecDigestSha256: sha256Schema,
  }).strict(),
  counts: z.object({
    sourceAssets: z.number().int().positive(),
    directRoleAgreement: z.number().int().nonnegative(),
    keptHumanOverrides: z.number().int().nonnegative(),
    relabelled: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    resolvedAssets: z.number().int().positive(),
  }).strict(),
  resolvedCurationSpecDigestSha256: sha256Schema,
  entries: z.array(applicationEntrySchema).min(1),
  receiptDigestSha256: sha256Schema,
}).passthrough();
const checkpointSchema = z.object({
  version: z.literal(REVIEWED_SFX_SEMANTIC_CHECKPOINT_VERSION),
  assetId: z.string().regex(ASSET_ID_PATTERN),
  sourceBindingDigestSha256: sha256Schema,
  modelDescriptorDigestSha256: sha256Schema,
  segmentCount: z.number().int().positive(),
  embedding: z.object({
    encoding: z.literal('base64-f32le'),
    dimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
    value: z.string().min(1),
  }).strict(),
  checkpointDigestSha256: sha256Schema,
}).strict();

type ResolvedCuration = z.infer<typeof resolvedCurationSchema>;
type CurationAsset = ResolvedCuration['assets'][number];
type MigrationReceipt = z.infer<typeof migrationReceiptSchema>;
type ReviewReport = z.infer<typeof reviewReportSchema>;
type ReviewResolution = z.infer<typeof reviewResolutionSchema>;
type ApplicationReceipt = z.infer<typeof applicationReceiptSchema>;
type SemanticCheckpoint = z.infer<typeof checkpointSchema>;

export type ReviewedSfxSemanticReleaseEntry =
  z.infer<typeof reviewedSfxSemanticReleaseEntrySchema>;
export type ReviewedSfxSemanticReleaseMetadata =
  z.infer<typeof reviewedSfxSemanticReleaseMetadataSchema>;
export type ReviewedSfxSemanticReleaseReceipt =
  z.infer<typeof reviewedSfxSemanticReleaseReceiptSchema>;

export interface BuildReviewedSfxSemanticReleaseOptions {
  migrationDirectory: string;
  reviewDirectory: string;
  resolutionDirectory: string;
  sourceManifestPath: string;
  sourceAudioDirectory: string;
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

export interface BuildReviewedSfxSemanticReleaseDependencies {
  runtime: SfxClapEmbeddingRuntime;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
}

export interface BuiltReviewedSfxSemanticRelease {
  manifest: SfxCatalogManifest;
  metadata: ReviewedSfxSemanticReleaseMetadata;
  receipt: ReviewedSfxSemanticReleaseReceipt;
  outputDirectory: string;
  workingDirectory: string;
  manifestPath: string;
  releaseDirectory: string;
  metadataPath: string;
  vectorsPath: string;
  receiptPath: string;
}

interface ReviewedEvidencePackage {
  migration: MigrationReceipt;
  reviewReport: ReviewReport;
  reviewResolution: ReviewResolution;
  applicationReceipt: ApplicationReceipt;
  resolvedCuration: ResolvedCuration;
  sourceManifest: SfxCatalogManifest;
  source: ReviewedSfxSemanticReleaseMetadata['source'];
}

interface BoundReviewedAsset {
  entry: SfxCatalogEntry & {
    semanticEvidence: NonNullable<SfxCatalogEntry['semanticEvidence']>;
  };
  curation: CurationAsset;
  migrationEntry: MigrationReceipt['entries'][number];
  reviewDisposition: ReviewedSfxSemanticReleaseEntry['reviewDisposition'];
  sourceBindingDigestSha256: string;
}

export class ReviewedSfxSemanticReleaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReviewedSfxSemanticReleaseError';
  }
}

export async function buildReviewedSfxSemanticRelease(
  options: BuildReviewedSfxSemanticReleaseOptions,
  dependencies: BuildReviewedSfxSemanticReleaseDependencies,
): Promise<BuiltReviewedSfxSemanticRelease> {
  const generatedAt = options.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    fail('INVALID_RELEASE_CLOCK', 'Reviewed semantic release timestamp is invalid');
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
      'Reviewed semantic release work and output trees must be disjoint',
    );
  }
  await assertMissing(outputDirectory);
  const evidence = await readAndVerifyEvidence(options, generatedAt);
  const manifest = buildRuntimeManifest(evidence, generatedAt);
  const runtimeManifestDigestSha256 = hashJson(manifest);
  if (runtimeManifestDigestSha256 !== evidence.source.runtimeManifestDigestSha256) {
    fail('RUNTIME_MANIFEST_DIGEST_MISMATCH', 'Runtime manifest changed after evidence binding');
  }
  const boundAssets = bindReviewedAssets(evidence, manifest);
  const canonicalAudioDirectory = await resolveDirectory(
    options.sourceAudioDirectory,
    'SOURCE_AUDIO_DIRECTORY_UNAVAILABLE',
  );
  const canonicalWorkingDirectory = await ensureWorkingDirectory(workingDirectory);
  const modelDescriptorDigestSha256 = hashJson(dependencies.runtime.descriptor);
  const vectorRows: Array<{
    asset: BoundReviewedAsset;
    checkpoint: SemanticCheckpoint;
  }> = [];
  let reusedCheckpoints = 0;
  let newCheckpoints = 0;

  for (const [index, asset] of boundAssets.entries()) {
    throwIfAborted(options.signal);
    const encoded = await readBoundFile(
      canonicalAudioDirectory,
      asset.curation.sourcePath,
    );
    const contentHashSha256 = hashBuffer(encoded);
    if (
      contentHashSha256 !== asset.entry.contentHashSha256
      || contentHashSha256 !== asset.entry.semanticEvidence.embeddingSourceHashSha256
    ) {
      fail(
        'APPROVED_AUDIO_MISMATCH',
        `Reviewed source audio changed for ${asset.entry.assetId}`,
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
    );
    const reusedCheckpoint = Boolean(checkpoint);
    if (!checkpoint) {
      const embedded = await embedVerifiedConditionedSfxAudio({
        sourceId: asset.entry.assetId,
        encoded,
        expectedContentHashSha256: asset.entry.contentHashSha256,
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
  const vectorsBuffer = Buffer.concat(vectorRows.map(({ checkpoint }) => (
    Buffer.from(checkpoint.embedding.value, 'base64')
  )));
  const vectorByteLength = dependencies.runtime.descriptor.embeddingDimension
    * Float32Array.BYTES_PER_ELEMENT;
  if (vectorsBuffer.byteLength !== vectorRows.length * vectorByteLength) {
    fail('VECTOR_ARTIFACT_LENGTH_MISMATCH', 'Reviewed semantic vector length is inconsistent');
  }
  const vectors = {
    filename: VECTORS_FILE,
    encoding: 'f32le-row-major' as const,
    dimension: SFX_CLAP_EMBEDDING_DIMENSION,
    count: vectorRows.length,
    byteLength: vectorsBuffer.byteLength,
    sha256: hashBuffer(vectorsBuffer),
  };
  const policy = {
    exactHumanReviewResolutionRequired: true as const,
    quarantinedAssetsExcluded: true as const,
    sourceAudioBytesReembedded: true as const,
    approvedSourceBytesVerifiedEveryBuild: true as const,
    unreviewedCorpusIncluded: false as const,
    exactCosineSearchCompatible: true as const,
    runtimeSelectionPerformed: false as const,
    productionCatalogMutationPerformed: false as const,
  };
  const metadata = reviewedSfxSemanticReleaseMetadataSchema.parse({
    version: REVIEWED_SFX_SEMANTIC_RELEASE_VERSION,
    generatedAt: generatedAt.toISOString(),
    model: dependencies.runtime.descriptor,
    source: evidence.source,
    policy,
    vectors,
    entries: vectorRows.map(({ asset, checkpoint }, rowIndex) => ({
      rowIndex,
      vectorOffsetBytes: rowIndex * vectorByteLength,
      vectorByteLength,
      assetId: asset.entry.assetId,
      provider: asset.entry.provenance.provider,
      providerAssetId: asset.entry.provenance.providerAssetId,
      selectedRole: asset.entry.semanticEvidence.selectedRole,
      reviewDisposition: asset.reviewDisposition,
      approvalReviewerId: asset.curation.approval.reviewerId,
      approvalReviewedAt: asset.curation.approval.reviewedAt,
      catalogContentHashSha256: asset.entry.contentHashSha256,
      embeddingSourceHashSha256: asset.entry.semanticEvidence.embeddingSourceHashSha256,
      candidateDigestSha256: asset.entry.semanticEvidence.candidateDigestSha256,
      catalogEntryDigestSha256: hashJson(asset.entry),
      semanticEvidenceDigestSha256: hashJson(asset.entry.semanticEvidence),
      sourceBindingDigestSha256: asset.sourceBindingDigestSha256,
      segmentCount: checkpoint.segmentCount,
    })),
  });
  const manifestBuffer = Buffer.from(stableJson(manifest));
  const metadataBuffer = Buffer.from(stableJson(metadata));
  const receiptWithoutDigest = {
    version: REVIEWED_SFX_SEMANTIC_RELEASE_RECEIPT_VERSION,
    generatedAt: generatedAt.toISOString(),
    source: evidence.source,
    policy,
    counts: {
      sourceAssets: evidence.applicationReceipt.counts.sourceAssets,
      approvedAssets: boundAssets.length,
      quarantinedAssets: evidence.applicationReceipt.counts.quarantined,
      semanticVectors: vectorRows.length,
      reusedCheckpoints,
      newCheckpoints,
    },
    artifacts: {
      manifest: {
        filename: MANIFEST_FILE,
        byteLength: manifestBuffer.byteLength,
        sha256: hashBuffer(manifestBuffer),
      },
      metadata: {
        filename: `${RELEASE_DIRECTORY}/${METADATA_FILE}` as const,
        byteLength: metadataBuffer.byteLength,
        sha256: hashBuffer(metadataBuffer),
      },
      vectors,
    },
  };
  const receipt = reviewedSfxSemanticReleaseReceiptSchema.parse({
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  });
  await writeImmutableRelease(
    outputDirectory,
    manifestBuffer,
    metadataBuffer,
    vectorsBuffer,
    receipt,
  );
  const releaseDirectory = path.join(outputDirectory, RELEASE_DIRECTORY);
  return {
    manifest,
    metadata,
    receipt,
    outputDirectory,
    workingDirectory: canonicalWorkingDirectory,
    manifestPath: path.join(outputDirectory, MANIFEST_FILE),
    releaseDirectory,
    metadataPath: path.join(releaseDirectory, METADATA_FILE),
    vectorsPath: path.join(releaseDirectory, VECTORS_FILE),
    receiptPath: path.join(releaseDirectory, RELEASE_RECEIPT_FILE),
  };
}

async function readAndVerifyEvidence(
  options: BuildReviewedSfxSemanticReleaseOptions,
  generatedAt: Date,
): Promise<ReviewedEvidencePackage> {
  const [migrationRaw, reviewRaw, resolutionRaw, applicationRaw, curationRaw, manifestRaw] =
    await Promise.all([
      readJson(path.join(options.migrationDirectory, MIGRATION_RECEIPT_FILE)),
      readJson(path.join(options.reviewDirectory, REVIEW_REPORT_FILE)),
      readJson(path.join(options.resolutionDirectory, REVIEW_RESOLUTION_FILE)),
      readJson(path.join(options.resolutionDirectory, APPLICATION_RECEIPT_FILE)),
      readJson(path.join(options.resolutionDirectory, RESOLVED_CURATION_FILE)),
      readJson(options.sourceManifestPath),
    ]);
  const migration = parseSchema(migrationReceiptSchema, migrationRaw, 'migration receipt');
  const reviewReport = parseSchema(reviewReportSchema, reviewRaw, 'review report');
  const reviewResolution = parseSchema(
    reviewResolutionSchema,
    resolutionRaw,
    'review resolution',
  );
  const applicationReceipt = parseSchema(
    applicationReceiptSchema,
    applicationRaw,
    'review application receipt',
  );
  const resolvedCuration = parseSchema(
    resolvedCurationSchema,
    curationRaw,
    'resolved curation',
  );
  let sourceManifest: SfxCatalogManifest;
  try {
    sourceManifest = parseSfxCatalogManifest(manifestRaw);
  } catch (error) {
    fail('INVALID_SOURCE_MANIFEST', `Source SFX manifest is invalid: ${errorMessage(error)}`);
  }
  const migrationDigest = verifyObjectDigest(
    migrationRaw,
    'receiptDigestSha256',
    migration.receiptDigestSha256,
    'MIGRATION_RECEIPT_DIGEST_MISMATCH',
  );
  const reviewReportDigest = verifyObjectDigest(
    reviewRaw,
    'reportDigestSha256',
    reviewReport.reportDigestSha256,
    'REVIEW_REPORT_DIGEST_MISMATCH',
  );
  const reviewResolutionDigest = verifyObjectDigest(
    resolutionRaw,
    'resolutionDigestSha256',
    reviewResolution.resolutionDigestSha256,
    'REVIEW_RESOLUTION_DIGEST_MISMATCH',
  );
  const applicationDigest = verifyObjectDigest(
    applicationRaw,
    'receiptDigestSha256',
    applicationReceipt.receiptDigestSha256,
    'APPLICATION_RECEIPT_DIGEST_MISMATCH',
  );
  const resolvedCurationDigest = hashJson(curationRaw);
  const sourceManifestDigest = hashJson(manifestRaw);
  if (
    reviewReport.migration.receiptDigestSha256 !== migrationDigest
    || reviewReport.migration.enrichedCurationSpecDigestSha256
      !== migration.enrichedCurationSpecDigestSha256
    || reviewResolution.migrationReceiptDigestSha256 !== migrationDigest
    || reviewResolution.reviewReportDigestSha256 !== reviewReportDigest
    || applicationReceipt.source.migrationReceiptDigestSha256 !== migrationDigest
    || applicationReceipt.source.reviewReportDigestSha256 !== reviewReportDigest
    || applicationReceipt.source.reviewResolutionDigestSha256 !== reviewResolutionDigest
    || applicationReceipt.source.enrichedCurationSpecDigestSha256
      !== migration.enrichedCurationSpecDigestSha256
    || applicationReceipt.resolvedCurationSpecDigestSha256 !== resolvedCurationDigest
    || migration.source.liveManifestDigestSha256 !== sourceManifestDigest
  ) {
    fail('REVIEW_EVIDENCE_CHAIN_MISMATCH', 'Reviewed SFX evidence does not form one chain');
  }
  verifyReviewSets(
    migration,
    reviewReport,
    reviewResolution,
    applicationReceipt,
    resolvedCuration,
    sourceManifest,
  );
  const provisionalManifest = buildRuntimeManifestFromInputs(
    migration,
    applicationReceipt,
    resolvedCuration,
    sourceManifest,
    generatedAt,
  );
  return {
    migration,
    reviewReport,
    reviewResolution,
    applicationReceipt,
    resolvedCuration,
    sourceManifest,
    source: {
      migrationReceiptDigestSha256: migrationDigest,
      reviewReportDigestSha256: reviewReportDigest,
      reviewResolutionDigestSha256: reviewResolutionDigest,
      applicationReceiptDigestSha256: applicationDigest,
      resolvedCurationSpecDigestSha256: resolvedCurationDigest,
      sourceManifestDigestSha256: sourceManifestDigest,
      runtimeManifestDigestSha256: hashJson(provisionalManifest),
    },
  };
}

function verifyReviewSets(
  migration: MigrationReceipt,
  reviewReport: ReviewReport,
  resolution: ReviewResolution,
  application: ApplicationReceipt,
  curation: ResolvedCuration,
  manifest: SfxCatalogManifest,
): void {
  const migrationById = uniqueMap(migration.entries, entry => entry.assetId);
  const reviewById = uniqueMap(reviewReport.candidates, entry => entry.assetId);
  const resolutionById = uniqueMap(resolution.entries, entry => entry.assetId);
  const applicationById = uniqueMap(application.entries, entry => entry.assetId);
  const manifestById = uniqueMap(manifest.entries, entry => entry.assetId);
  const curationHashes = new Set(
    curation.assets.map(asset => asset.semanticEvidence.catalogContentHashSha256),
  );
  const rejectedIds = new Set(
    application.entries
      .filter(entry => entry.decision === 'reject')
      .map(entry => entry.assetId),
  );
  if (
    migrationById.size !== migration.counts.approvedAssets
    || migrationById.size !== migration.counts.embeddedAssets
    || migrationById.size !== manifestById.size
    || reviewById.size !== reviewReport.counts.reviewCandidates
    || reviewById.size !== resolutionById.size
    || reviewById.size !== applicationById.size
    || curation.assets.length !== application.counts.resolvedAssets
    || rejectedIds.size !== application.counts.quarantined
    || curation.assets.length + rejectedIds.size !== migrationById.size
    || reviewReport.counts.directRoleAgreement !== migration.counts.roleAgreement
    || application.counts.directRoleAgreement !== migration.counts.roleAgreement
  ) {
    fail('REVIEW_ASSET_SET_MISMATCH', 'Reviewed SFX counts or asset sets are inconsistent');
  }
  for (const [assetId, migrationEntry] of migrationById) {
    const manifestEntry = manifestById.get(assetId);
    if (
      !manifestEntry
      || manifestEntry.contentHashSha256 !== migrationEntry.contentHashSha256
    ) {
      fail('SOURCE_MANIFEST_ASSET_MISMATCH', `Source manifest differs for ${assetId}`);
    }
    const reviewed = reviewById.get(assetId);
    if (!reviewed) {
      if (!migrationEntry.roleAgreement || rejectedIds.has(assetId)) {
        fail('REVIEW_ASSET_SET_MISMATCH', `Unreviewed disagreement found for ${assetId}`);
      }
      continue;
    }
    const resolved = resolutionById.get(assetId);
    const applied = applicationById.get(assetId);
    if (
      !resolved
      || !applied
      || resolved.candidateDigestSha256 !== reviewed.candidateDigestSha256
      || resolved.decision !== applied.decision
      || resolved.resolvedRole !== applied.resolvedRole
      || reviewed.contentHashSha256 !== migrationEntry.contentHashSha256
      || applied.contentHashSha256 !== migrationEntry.contentHashSha256
      || reviewed.semanticEvidenceDigestSha256
        !== migrationEntry.semanticEvidenceDigestSha256
    ) {
      fail('REVIEW_DECISION_MISMATCH', `Review decision differs for ${assetId}`);
    }
    const retained = curationHashes.has(migrationEntry.contentHashSha256);
    if ((applied.decision === 'reject') === retained) {
      fail('QUARANTINE_MISMATCH', `Quarantine decision differs for ${assetId}`);
    }
  }
}

function buildRuntimeManifest(
  evidence: ReviewedEvidencePackage,
  generatedAt: Date,
): SfxCatalogManifest {
  return buildRuntimeManifestFromInputs(
    evidence.migration,
    evidence.applicationReceipt,
    evidence.resolvedCuration,
    evidence.sourceManifest,
    generatedAt,
  );
}

function buildRuntimeManifestFromInputs(
  migration: MigrationReceipt,
  application: ApplicationReceipt,
  curation: ResolvedCuration,
  sourceManifest: SfxCatalogManifest,
  generatedAt: Date,
): SfxCatalogManifest {
  const migrationByHash = uniqueMap(migration.entries, entry => entry.contentHashSha256);
  const sourceById = uniqueMap(sourceManifest.entries, entry => entry.assetId);
  const applicationById = uniqueMap(application.entries, entry => entry.assetId);
  const entries = curation.assets.map(asset => {
    const contentHash = asset.semanticEvidence.catalogContentHashSha256;
    const migrationEntry = migrationByHash.get(contentHash);
    const sourceEntry = migrationEntry ? sourceById.get(migrationEntry.assetId) : undefined;
    if (
      !migrationEntry
      || !sourceEntry
      || migrationEntry.sourcePath !== asset.sourcePath
      || asset.semanticEvidence.embeddingSourceHashSha256 !== contentHash
      || asset.semanticEvidence.candidateDigestSha256
        !== migrationEntry.candidateDigestSha256
      || hashJson(asset.provenance) !== hashJson(sourceEntry.provenance)
      || sourceEntry.contentHashSha256 !== contentHash
    ) {
      fail(
        'RESOLVED_CURATION_ASSET_MISMATCH',
        `Resolved curation differs from source evidence: ${asset.title}`,
      );
    }
    const applicationEntry = applicationById.get(sourceEntry.assetId);
    if (
      applicationEntry?.decision === 'reject'
      || (
        applicationEntry
        && (
          applicationEntry.resolvedRole !== asset.semanticEvidence.selectedRole
          || applicationEntry.resolvedSemanticEvidenceDigestSha256
            !== hashJson(asset.semanticEvidence)
        )
      )
    ) {
      fail('RESOLVED_CURATION_ASSET_MISMATCH', `Resolved role differs for ${sourceEntry.assetId}`);
    }
    return {
      ...sourceEntry,
      title: asset.title,
      eventRoles: asset.eventRoles,
      surfaces: asset.surfaces,
      layerRole: asset.layerRole,
      tags: asset.tags,
      negativeTags: asset.negativeTags,
      energy: asset.energy,
      brightness: asset.brightness,
      weight: asset.weight,
      transientSharpness: asset.transientSharpness,
      material: asset.material,
      tailMs: asset.tailMs,
      loopable: asset.loopable,
      direction: asset.direction,
      motionSpeed: asset.motionSpeed,
      semanticEvidence: asset.semanticEvidence,
    };
  });
  try {
    return parseSfxCatalogManifest({
      ...sourceManifest,
      generatedAt: generatedAt.toISOString(),
      entries,
    });
  } catch (error) {
    fail('INVALID_RUNTIME_MANIFEST', `Reviewed runtime manifest is invalid: ${errorMessage(error)}`);
  }
}

function bindReviewedAssets(
  evidence: ReviewedEvidencePackage,
  manifest: SfxCatalogManifest,
): BoundReviewedAsset[] {
  const curationByHash = uniqueMap(
    evidence.resolvedCuration.assets,
    asset => asset.semanticEvidence.catalogContentHashSha256,
  );
  const migrationByHash = uniqueMap(
    evidence.migration.entries,
    entry => entry.contentHashSha256,
  );
  const applicationById = uniqueMap(
    evidence.applicationReceipt.entries,
    entry => entry.assetId,
  );
  return [...manifest.entries]
    .sort((left, right) => left.assetId.localeCompare(right.assetId))
    .map(entry => {
      if (!entry.semanticEvidence) {
        fail('MISSING_SEMANTIC_EVIDENCE', `Runtime asset lacks semantics: ${entry.assetId}`);
      }
      const semanticEntry = entry as SfxCatalogEntry & {
        semanticEvidence: NonNullable<SfxCatalogEntry['semanticEvidence']>;
      };
      const curation = curationByHash.get(entry.contentHashSha256);
      const migrationEntry = migrationByHash.get(entry.contentHashSha256);
      if (!curation || !migrationEntry || migrationEntry.assetId !== entry.assetId) {
        fail('REVIEW_ASSET_SET_MISMATCH', `Runtime asset lacks review evidence: ${entry.assetId}`);
      }
      const decision = applicationById.get(entry.assetId)?.decision;
      if (decision === 'reject') {
        fail('QUARANTINED_ASSET_INCLUDED', `Rejected SFX reached runtime: ${entry.assetId}`);
      }
      const reviewDisposition = decision ?? 'direct-agreement';
      const sourceBindingDigestSha256 = hashJson({
        applicationReceiptDigestSha256: evidence.source.applicationReceiptDigestSha256,
        assetId: entry.assetId,
        catalogEntryDigestSha256: hashJson(entry),
        semanticEvidenceDigestSha256: hashJson(semanticEntry.semanticEvidence),
        sourceAudioHashSha256: entry.contentHashSha256,
        reviewDisposition,
      });
      return {
        entry: semanticEntry,
        curation,
        migrationEntry,
        reviewDisposition,
        sourceBindingDigestSha256,
      };
    });
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
      `Reviewed semantic release requires ${SFX_CLAP_MODEL_ID}@${SFX_CLAP_MODEL_REVISION}`,
    );
  }
}

function buildSemanticCheckpoint(
  asset: BoundReviewedAsset,
  modelDescriptorDigestSha256: string,
  segmentCount: number,
  embedding: Float32Array,
): SemanticCheckpoint {
  assertNormalizedEmbedding(embedding);
  const body = {
    version: REVIEWED_SFX_SEMANTIC_CHECKPOINT_VERSION,
    assetId: asset.entry.assetId,
    sourceBindingDigestSha256: asset.sourceBindingDigestSha256,
    modelDescriptorDigestSha256,
    segmentCount,
    embedding: {
      encoding: 'base64-f32le' as const,
      dimension: SFX_CLAP_EMBEDDING_DIMENSION,
      value: encodeFloat32Embedding(embedding),
    },
  };
  return checkpointSchema.parse({
    ...body,
    checkpointDigestSha256: hashJson(body),
  });
}

async function loadSemanticCheckpoint(
  checkpointPath: string,
  asset: BoundReviewedAsset,
  modelDescriptorDigestSha256: string,
): Promise<SemanticCheckpoint | undefined> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(checkpointPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new ReviewedSfxSemanticReleaseError(
      'INVALID_RELEASE_CHECKPOINT',
      `Could not read semantic checkpoint for ${asset.entry.assetId}`,
      { cause: error },
    );
  }
  const checkpoint = parseSchema(checkpointSchema, raw, 'semantic checkpoint');
  if (
    checkpoint.assetId !== asset.entry.assetId
    || checkpoint.sourceBindingDigestSha256 !== asset.sourceBindingDigestSha256
    || checkpoint.modelDescriptorDigestSha256 !== modelDescriptorDigestSha256
    || verifyObjectDigest(
      raw,
      'checkpointDigestSha256',
      checkpoint.checkpointDigestSha256,
      'STALE_RELEASE_CHECKPOINT',
    ) !== checkpoint.checkpointDigestSha256
  ) {
    fail('STALE_RELEASE_CHECKPOINT', `Semantic checkpoint is stale: ${asset.entry.assetId}`);
  }
  assertNormalizedEmbedding(decodeFloat32Embedding(
    checkpoint.embedding.value,
    checkpoint.embedding.dimension,
  ));
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
  manifestBuffer: Buffer,
  metadataBuffer: Buffer,
  vectorsBuffer: Buffer,
  receipt: ReviewedSfxSemanticReleaseReceipt,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    const releaseDirectory = path.join(staging, RELEASE_DIRECTORY);
    await mkdir(releaseDirectory);
    await Promise.all([
      writeFile(path.join(staging, MANIFEST_FILE), manifestBuffer, { flag: 'wx' }),
      writeFile(path.join(releaseDirectory, METADATA_FILE), metadataBuffer, { flag: 'wx' }),
      writeFile(path.join(releaseDirectory, VECTORS_FILE), vectorsBuffer, { flag: 'wx' }),
      writeFile(
        path.join(releaseDirectory, RELEASE_RECEIPT_FILE),
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

async function readBoundFile(root: string, relativePath: string): Promise<Buffer> {
  if (
    path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').some(segment => !segment || segment === '..' || segment === '.')
  ) {
    fail('UNSAFE_APPROVED_AUDIO_PATH', `Unsafe reviewed audio path: ${relativePath}`);
  }
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('UNSAFE_APPROVED_AUDIO_FILE', `Expected a real reviewed audio file: ${relativePath}`);
  }
  const canonicalPath = await realpath(absolutePath);
  if (!isInside(root, canonicalPath)) {
    fail('APPROVED_AUDIO_PATH_ESCAPE', `Reviewed audio escapes its source root: ${relativePath}`);
  }
  return readFile(canonicalPath);
}

async function ensureWorkingDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  return resolveDirectory(directory, 'INVALID_WORKING_DIRECTORY');
}

async function resolveDirectory(directory: string, code: string): Promise<string> {
  const resolved = path.resolve(directory);
  let stat;
  try {
    stat = await lstat(resolved);
  } catch (error) {
    throw new ReviewedSfxSemanticReleaseError(
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

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new ReviewedSfxSemanticReleaseError(
      'INVALID_EVIDENCE_JSON',
      `Could not read reviewed evidence ${path.resolve(filePath)}: ${errorMessage(error)}`,
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
  fail('OUTPUT_EXISTS', `Reviewed semantic release output already exists: ${target}`);
}

function verifyObjectDigest(
  value: unknown,
  digestKey: string,
  expectedDigest: string,
  code: string,
): string {
  if (!isRecord(value)) fail(code, 'Digest-bound evidence must be an object');
  const body = { ...value };
  delete body[digestKey];
  if (hashJson(body) !== expectedDigest) {
    fail(code, `Reviewed evidence digest does not match ${digestKey}`);
  }
  return expectedDigest;
}

function assertNormalizedEmbedding(embedding: Float32Array): void {
  if (embedding.length !== SFX_CLAP_EMBEDDING_DIMENSION) {
    fail(
      'INVALID_RELEASE_VECTOR',
      `Semantic vector dimension must be ${SFX_CLAP_EMBEDDING_DIMENSION}`,
    );
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

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  fail(
    'INVALID_REVIEWED_EVIDENCE',
    `Invalid ${label}: ${parsed.error.issues
      .map(issue => `${issue.path.join('.') || label}: ${issue.message}`)
      .join('; ')}`,
  );
}

function uniqueMap<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) fail('DUPLICATE_REVIEW_KEY', `Duplicate reviewed SFX key: ${key}`);
    result.set(key, value);
  }
  return result;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ReviewedSfxSemanticReleaseError(
      'RELEASE_ABORTED',
      'Reviewed semantic release build was aborted',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(code: string, message: string): never {
  throw new ReviewedSfxSemanticReleaseError(code, message);
}
