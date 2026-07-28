import { createHash } from 'node:crypto';
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
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  FSD50K_PUBLICATION_GATE_VERSION,
  type Fsd50kGatedCurationSpec,
} from '@/lib/pipeline/sfx-fsd50k-publication-gate';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVIEW_ID_PATTERN = /^sfx_review_[a-f0-9]{20}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const GATE_RECEIPT_FILE = 'publication-gate-receipt.json';
const CURATION_SPEC_FILE = 'curation-spec.json';

export const FSD50K_PUBLICATION_AGGREGATE_VERSION =
  'editron-fsd50k-publication-aggregate-v3' as const;
export const FSD50K_CATALOG_MERGE_VERSION =
  'editron-fsd50k-catalog-merge-v1' as const;
export const FSD50K_CATALOG_PROMOTION_VERSION =
  'editron-fsd50k-catalog-promotion-v1' as const;

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
const provenanceSchema = z.object({
  provider: z.literal('fsd50k'),
  providerAssetId: z.string().min(1),
  licenseId: z.literal('cc0-1.0'),
  licenseUrl: z.string().url(),
  attributionRequired: z.literal(false),
}).strict();
const approvalSchema = z.object({
  status: z.literal('approved'),
  reviewerId: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
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
  trendTag: z.string().min(1).optional(),
  semanticEvidence: sfxCatalogSemanticEvidenceSchema,
  provenance: provenanceSchema,
  approval: approvalSchema,
}).strict();
const curationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();
const gateReceiptSchema = z.object({
  version: z.literal(FSD50K_PUBLICATION_GATE_VERSION),
  gatedAt: z.string().datetime(),
  source: z.object({
    batchId: z.string().min(1),
    reviewReportDigestSha256: sha256Schema,
    decisionReceiptDigestSha256: sha256Schema,
    candidatePoolSha256: sha256Schema,
    inspectionAnalysisDigestSha256: sha256Schema,
    embeddingAnalysisDigestSha256: sha256Schema,
    curationSpecDigestSha256: sha256Schema,
  }).strict(),
  policy: z.object({
    explicitPerAssetApprovalRequired: z.literal(true),
    representativeApprovalPropagatesToClusterMembers: z.literal(false),
    rightsValidationRequired: z.literal(true),
    acousticReinspectionRequired: z.literal(true),
    manifestMutationPerformed: z.literal(false),
  }).strict(),
  counts: z.object({
    candidates: z.number().int().positive(),
    approved: z.number().int().positive(),
    rejected: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    deferredCanonicalClusterMembers: z.number().int().nonnegative(),
    deferredSourceIds: z.number().int().nonnegative(),
  }).strict(),
  approved: z.array(z.object({
    reviewId: z.string().regex(REVIEW_ID_PATTERN),
    canonicalSourceId: z.string().min(1),
    candidateDigestSha256: sha256Schema,
    embeddingSourceHashSha256: sha256Schema,
    conditionedHashSha256: sha256Schema,
    selectedRole: eventRoleSchema,
    stagedAudioPath: z.string().min(1),
  }).strict()).min(1),
  receiptDigestSha256: sha256Schema,
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

const uploadPlanSchema = z.object({
  version: z.literal('sfx-catalog-upload-plan-v1'),
  generatedAt: z.string().datetime(),
  manifestVersion: z.literal('sfx-catalog-v1'),
  publicAssetBaseUrl: z.string().min(1),
  assets: z.array(z.object({
    assetId: z.string().regex(ASSET_ID_PATTERN),
    sourcePath: z.string().min(1),
    r2Key: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.enum(['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg']),
    byteLength: z.number().int().positive(),
    contentHashSha256: sha256Schema,
    provenance: provenanceSchema,
    approval: approvalSchema,
  }).strict()).min(1),
}).strict();
const publicationReceiptSchema = z.object({
  version: z.literal('sfx-catalog-publication-receipt-v1'),
  manifestVersion: z.literal('sfx-catalog-v1'),
  manifestGeneratedAt: z.string().datetime(),
  manifestHashSha256: sha256Schema,
  publishedAt: z.string().datetime(),
  bucketName: z.string().min(1),
  assets: z.array(z.object({
    assetId: z.string().regex(ASSET_ID_PATTERN),
    r2Key: z.string().min(1),
    status: z.enum(['uploaded', 'verified-existing']),
    byteLength: z.number().int().positive(),
    contentHashSha256: sha256Schema,
  }).strict()).min(1),
}).strict();
const mergeAssetSchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  canonicalSourceId: z.string().min(1),
  sourcePath: z.string().min(1),
  r2Key: z.string().min(1),
  byteLength: z.number().int().positive(),
  contentHashSha256: sha256Schema,
}).strict();
const mergeReceiptSchema = z.object({
  version: z.literal(FSD50K_CATALOG_MERGE_VERSION),
  mergedAt: z.string().datetime(),
  source: z.object({
    aggregateReceiptDigestSha256: sha256Schema,
    baseManifestDigestSha256: sha256Schema,
    deltaManifestDigestSha256: sha256Schema,
    deltaPublicationManifestHashSha256: sha256Schema,
    deltaUploadPlanDigestSha256: sha256Schema,
  }).strict(),
  policy: z.object({
    existingCatalogEntriesPreserved: z.literal(true),
    assetIdCollisionsRejected: z.literal(true),
    contentHashCollisionsRejected: z.literal(true),
    promotionRequiresExactPublicationReceipt: z.literal(true),
    liveManifestMutationPerformed: z.literal(false),
  }).strict(),
  counts: z.object({
    existingAssets: z.number().int().nonnegative(),
    deltaAssets: z.number().int().positive(),
    mergedAssets: z.number().int().positive(),
  }).strict(),
  delta: z.object({
    manifestVersion: z.literal('sfx-catalog-v1'),
    manifestGeneratedAt: z.string().datetime(),
    assets: z.array(mergeAssetSchema).min(1),
  }).strict(),
  mergedManifestCandidateDigestSha256: sha256Schema,
  receiptDigestSha256: sha256Schema,
}).strict();

type GateReceipt = z.infer<typeof gateReceiptSchema>;
type AggregateAsset = z.infer<typeof aggregateAssetSchema>;
type AggregateReceipt = z.infer<typeof aggregateReceiptSchema>;
type MergeReceipt = z.infer<typeof mergeReceiptSchema>;
type CurationSpec = z.infer<typeof curationSpecSchema>;

interface ValidatedAggregate {
  directory: string;
  curationSpec: CurationSpec;
  receipt: AggregateReceipt;
}

export interface AggregateFsd50kPublicationGatesOptions {
  gateDirectories: string[];
  outputDirectory: string;
  generatedAt?: Date;
}

export interface Fsd50kPublicationAggregate {
  curationSpec: Fsd50kGatedCurationSpec;
  receipt: AggregateReceipt;
  outputDirectory: string;
  curationSpecPath: string;
  receiptPath: string;
}

export interface PrepareFsd50kCatalogMergeOptions {
  aggregateDirectory: string;
  baseManifest: unknown;
  deltaManifest: unknown;
  deltaUploadPlan: unknown;
  outputDirectory: string;
  mergedAt?: Date;
}

export interface Fsd50kCatalogMergeCandidate {
  manifest: SfxCatalogManifest;
  receipt: MergeReceipt;
  outputDirectory: string;
  manifestPath: string;
  receiptPath: string;
}

export interface PromoteFsd50kMergedCatalogOptions {
  mergeDirectory: string;
  publicationReceipt: unknown;
  outputDirectory: string;
  promotedAt?: Date;
}

export interface Fsd50kCatalogPromotion {
  manifest: SfxCatalogManifest;
  receipt: {
    version: typeof FSD50K_CATALOG_PROMOTION_VERSION;
    promotedAt: string;
    source: {
      mergeReceiptDigestSha256: string;
      publicationReceiptDigestSha256: string;
    };
    policy: {
      allDeltaObjectsVerified: true;
      existingCatalogEntriesPreserved: true;
      liveManifestMutationPerformed: false;
    };
    counts: {
      existingAssets: number;
      deltaAssets: number;
      promotedAssets: number;
    };
    promotedManifestDigestSha256: string;
    receiptDigestSha256: string;
  };
  outputDirectory: string;
  manifestPath: string;
  receiptPath: string;
}

export class Fsd50kPublicationAggregateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kPublicationAggregateError';
  }
}

export async function aggregateFsd50kPublicationGates(
  options: AggregateFsd50kPublicationGatesOptions,
): Promise<Fsd50kPublicationAggregate> {
  if (options.gateDirectories.length === 0) {
    fail('NO_GATE_DIRECTORIES', 'At least one FSD50K publication gate is required');
  }
  const generatedAt = validDate(options.generatedAt ?? new Date(), 'INVALID_AGGREGATE_CLOCK');
  const outputDirectory = path.resolve(options.outputDirectory);
  await assertMissing(outputDirectory);
  const gateDirectories = [...new Set(options.gateDirectories.map(directory => path.resolve(directory)))]
    .sort((left, right) => left.localeCompare(right));
  if (gateDirectories.length !== options.gateDirectories.length) {
    fail('DUPLICATE_GATE_DIRECTORY', 'The same FSD50K gate directory was supplied more than once');
  }

  const seenBatchIds = new Set<string>();
  const seenReviewIds = new Set<string>();
  const seenCanonicalIds = new Set<string>();
  const seenContentHashes = new Set<string>();
  const sourceGates: AggregateReceipt['sourceGates'] = [];
  const staged: Array<{
    asset: AggregateAsset;
    curation: CurationSpec['assets'][number];
    buffer: Buffer;
  }> = [];

  for (const gateDirectory of gateDirectories) {
    const gate = await readGateDirectory(gateDirectory);
    if (seenBatchIds.has(gate.receipt.source.batchId)) {
      fail('DUPLICATE_GATE_BATCH', `Duplicate gate batch ${gate.receipt.source.batchId}`);
    }
    seenBatchIds.add(gate.receipt.source.batchId);
    sourceGates.push({
      batchId: gate.receipt.source.batchId,
      gateReceiptDigestSha256: gate.receipt.receiptDigestSha256,
      curationSpecDigestSha256: gate.receipt.source.curationSpecDigestSha256,
    });
    for (const approved of gate.receipt.approved) {
      assertUnique(seenReviewIds, approved.reviewId, 'DUPLICATE_REVIEW_ID');
      assertUnique(
        seenCanonicalIds,
        approved.canonicalSourceId,
        'DUPLICATE_CANONICAL_SOURCE_ID',
      );
      assertUnique(
        seenContentHashes,
        approved.conditionedHashSha256,
        'DUPLICATE_AUDIO_CONTENT',
      );
      const curation = gate.curationBySourcePath.get(approved.stagedAudioPath);
      if (!curation) {
        fail(
          'GATE_CURATION_ASSET_MISSING',
          `Gate curation is missing ${approved.stagedAudioPath}`,
        );
      }
      assertGateAssetBinding(approved, curation, gate.receipt);
      const buffer = await readBoundFile(gate.directory, approved.stagedAudioPath);
      if (hashBuffer(buffer) !== approved.conditionedHashSha256) {
        fail('GATE_AUDIO_HASH_MISMATCH', `Gate audio changed for ${approved.reviewId}`);
      }
      staged.push({
        curation,
        buffer,
        asset: {
          gateBatchId: gate.receipt.source.batchId,
          reviewId: approved.reviewId,
          canonicalSourceId: approved.canonicalSourceId,
          candidateDigestSha256: approved.candidateDigestSha256,
          embeddingSourceHashSha256: approved.embeddingSourceHashSha256,
          conditionedHashSha256: approved.conditionedHashSha256,
          selectedRole: approved.selectedRole,
          stagedAudioPath: approved.stagedAudioPath,
          byteLength: buffer.byteLength,
        },
      });
    }
  }
  staged.sort((left, right) => left.asset.reviewId.localeCompare(right.asset.reviewId));
  sourceGates.sort((left, right) => left.batchId.localeCompare(right.batchId));
  const curationSpec = curationSpecSchema.parse({
    version: 'sfx-catalog-curation-spec-v1',
    assets: staged.map(item => item.curation),
  });
  const receiptWithoutDigest = {
    version: FSD50K_PUBLICATION_AGGREGATE_VERSION,
    generatedAt: generatedAt.toISOString(),
    sourceGates,
    policy: {
      everyAssetBoundToExplicitGate: true as const,
      everyCurationSpecDigestVerified: true as const,
      duplicateReviewIdsRejected: true as const,
      duplicateCanonicalSourceIdsRejected: true as const,
      duplicateAudioContentRejected: true as const,
      manifestMutationPerformed: false as const,
    },
    counts: {
      sourceGates: sourceGates.length,
      approvedAssets: staged.length,
    },
    curationSpecDigestSha256: hashJson(curationSpec),
    assets: staged.map(item => item.asset),
  };
  const receipt = aggregateReceiptSchema.parse({
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  });
  await writeImmutableDirectory(outputDirectory, [
    { relativePath: CURATION_SPEC_FILE, content: stableJson(curationSpec) },
    {
      relativePath: 'publication-aggregate-receipt.json',
      content: stableJson(receipt),
    },
    ...staged.map(item => ({
      relativePath: item.asset.stagedAudioPath,
      content: item.buffer,
    })),
  ]);
  return {
    curationSpec: curationSpec as Fsd50kGatedCurationSpec,
    receipt,
    outputDirectory,
    curationSpecPath: path.join(outputDirectory, CURATION_SPEC_FILE),
    receiptPath: path.join(outputDirectory, 'publication-aggregate-receipt.json'),
  };
}

export async function prepareFsd50kCatalogMerge(
  options: PrepareFsd50kCatalogMergeOptions,
): Promise<Fsd50kCatalogMergeCandidate> {
  const aggregate = await readAggregateDirectory(options.aggregateDirectory);
  const baseManifest = parseManifest(options.baseManifest, 'INVALID_BASE_MANIFEST');
  const deltaManifest = parseManifest(options.deltaManifest, 'INVALID_DELTA_MANIFEST');
  const deltaUploadPlan = parseSchema(
    uploadPlanSchema,
    options.deltaUploadPlan,
    'INVALID_DELTA_UPLOAD_PLAN',
  );
  const mergedAt = validDate(options.mergedAt ?? new Date(), 'INVALID_MERGE_CLOCK');
  const outputDirectory = path.resolve(options.outputDirectory);
  await assertMissing(outputDirectory);

  if (
    hashJson(baseManifest.knowledgeGraphRefs) !== hashJson(deltaManifest.knowledgeGraphRefs)
    || hashJson(baseManifest.qualityPolicy) !== hashJson(deltaManifest.qualityPolicy)
  ) {
    fail(
      'CATALOG_POLICY_MISMATCH',
      'Delta catalog knowledge graph references or quality policy differ from the live catalog',
    );
  }
  if (
    deltaUploadPlan.generatedAt !== deltaManifest.generatedAt
    || deltaUploadPlan.manifestVersion !== deltaManifest.version
    || deltaUploadPlan.assets.length !== deltaManifest.entries.length
    || deltaManifest.entries.length !== aggregate.receipt.assets.length
  ) {
    fail('DELTA_CONTRACT_MISMATCH', 'Delta manifest, upload plan, and aggregate counts differ');
  }

  const deltaEntries = uniqueMap(
    deltaManifest.entries,
    entry => entry.assetId,
    'DUPLICATE_DELTA_ASSET_ID',
  );
  const deltaPlans = uniqueMap(
    deltaUploadPlan.assets,
    asset => asset.assetId,
    'DUPLICATE_DELTA_UPLOAD_ASSET_ID',
  );
  const curationByPath = uniqueMap(
    aggregate.curationSpec.assets,
    asset => asset.sourcePath,
    'DUPLICATE_AGGREGATE_CURATION_PATH',
  );
  const deltaAssets: MergeReceipt['delta']['assets'] = [];
  for (const aggregateAsset of aggregate.receipt.assets) {
    const assetId = `sfx_catalog_${aggregateAsset.conditionedHashSha256.slice(0, 24)}`;
    const entry = deltaEntries.get(assetId);
    const plan = deltaPlans.get(assetId);
    const curation = curationByPath.get(aggregateAsset.stagedAudioPath);
    if (!entry || !plan || !curation) {
      fail('DELTA_ASSET_MISSING', `Delta artifacts are missing ${assetId}`);
    }
    if (
      plan.sourcePath !== aggregateAsset.stagedAudioPath
      || plan.r2Key !== assetId
      || plan.contentHashSha256 !== aggregateAsset.conditionedHashSha256
      || plan.byteLength !== aggregateAsset.byteLength
      || entry.contentHashSha256 !== aggregateAsset.conditionedHashSha256
      || entry.storagePath !== assetId
      || entry.audioUrl !== `${deltaUploadPlan.publicAssetBaseUrl}/${assetId}`
      || hashJson(plan.provenance) !== hashJson(curation.provenance)
      || hashJson(plan.approval) !== hashJson(curation.approval)
      || hashJson(entry.provenance) !== hashJson(curation.provenance)
      || hashJson(entry.semanticEvidence) !== hashJson(curation.semanticEvidence)
    ) {
      fail('DELTA_ASSET_EVIDENCE_MISMATCH', `Delta evidence differs for ${assetId}`);
    }
    deltaAssets.push({
      assetId,
      canonicalSourceId: aggregateAsset.canonicalSourceId,
      sourcePath: plan.sourcePath,
      r2Key: plan.r2Key,
      byteLength: plan.byteLength,
      contentHashSha256: plan.contentHashSha256,
    });
  }
  if (deltaEntries.size !== deltaAssets.length || deltaPlans.size !== deltaAssets.length) {
    fail('UNBOUND_DELTA_ASSET', 'Delta artifacts contain assets not present in the aggregate');
  }

  const baseIds = new Set(baseManifest.entries.map(entry => entry.assetId));
  const baseHashes = new Set(baseManifest.entries.map(entry => entry.contentHashSha256));
  for (const entry of deltaManifest.entries) {
    if (baseIds.has(entry.assetId)) {
      fail('CATALOG_ASSET_ID_COLLISION', `Catalog asset ID already exists: ${entry.assetId}`);
    }
    if (baseHashes.has(entry.contentHashSha256)) {
      fail(
        'CATALOG_CONTENT_HASH_COLLISION',
        `Catalog audio content already exists: ${entry.contentHashSha256}`,
      );
    }
  }
  const manifest = parseManifest({
    ...baseManifest,
    generatedAt: deltaManifest.generatedAt,
    entries: [...baseManifest.entries, ...deltaManifest.entries]
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
  }, 'INVALID_MERGED_MANIFEST');
  deltaAssets.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const receiptWithoutDigest = {
    version: FSD50K_CATALOG_MERGE_VERSION,
    mergedAt: mergedAt.toISOString(),
    source: {
      aggregateReceiptDigestSha256: aggregate.receipt.receiptDigestSha256,
      baseManifestDigestSha256: hashJson(baseManifest),
      deltaManifestDigestSha256: hashJson(deltaManifest),
      deltaPublicationManifestHashSha256: hashStableJson(deltaManifest),
      deltaUploadPlanDigestSha256: hashJson(deltaUploadPlan),
    },
    policy: {
      existingCatalogEntriesPreserved: true as const,
      assetIdCollisionsRejected: true as const,
      contentHashCollisionsRejected: true as const,
      promotionRequiresExactPublicationReceipt: true as const,
      liveManifestMutationPerformed: false as const,
    },
    counts: {
      existingAssets: baseManifest.entries.length,
      deltaAssets: deltaManifest.entries.length,
      mergedAssets: manifest.entries.length,
    },
    delta: {
      manifestVersion: deltaManifest.version,
      manifestGeneratedAt: deltaManifest.generatedAt,
      assets: deltaAssets,
    },
    mergedManifestCandidateDigestSha256: hashJson(manifest),
  };
  const receipt = mergeReceiptSchema.parse({
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  });
  await writeImmutableDirectory(outputDirectory, [
    { relativePath: 'merged-manifest-candidate.json', content: stableJson(manifest) },
    { relativePath: 'catalog-merge-receipt.json', content: stableJson(receipt) },
  ]);
  return {
    manifest,
    receipt,
    outputDirectory,
    manifestPath: path.join(outputDirectory, 'merged-manifest-candidate.json'),
    receiptPath: path.join(outputDirectory, 'catalog-merge-receipt.json'),
  };
}

export async function promoteFsd50kMergedCatalog(
  options: PromoteFsd50kMergedCatalogOptions,
): Promise<Fsd50kCatalogPromotion> {
  const merge = await readMergeDirectory(options.mergeDirectory);
  const publication = parseSchema(
    publicationReceiptSchema,
    options.publicationReceipt,
    'INVALID_PUBLICATION_RECEIPT',
  );
  const promotedAt = validDate(options.promotedAt ?? new Date(), 'INVALID_PROMOTION_CLOCK');
  const outputDirectory = path.resolve(options.outputDirectory);
  await assertMissing(outputDirectory);
  if (
    publication.manifestVersion !== merge.receipt.delta.manifestVersion
    || publication.manifestGeneratedAt !== merge.receipt.delta.manifestGeneratedAt
    || publication.manifestHashSha256
      !== merge.receipt.source.deltaPublicationManifestHashSha256
    || publication.assets.length !== merge.receipt.delta.assets.length
  ) {
    fail(
      'PUBLICATION_RECEIPT_MISMATCH',
      'Publication receipt does not prove the complete delta manifest',
    );
  }
  const publicationAssets = uniqueMap(
    publication.assets,
    asset => asset.assetId,
    'DUPLICATE_PUBLICATION_ASSET_ID',
  );
  for (const expected of merge.receipt.delta.assets) {
    const published = publicationAssets.get(expected.assetId);
    if (
      !published
      || published.r2Key !== expected.r2Key
      || published.byteLength !== expected.byteLength
      || published.contentHashSha256 !== expected.contentHashSha256
    ) {
      fail(
        'PUBLICATION_ASSET_MISMATCH',
        `Publication receipt does not verify ${expected.assetId}`,
      );
    }
  }
  const receiptWithoutDigest = {
    version: FSD50K_CATALOG_PROMOTION_VERSION,
    promotedAt: promotedAt.toISOString(),
    source: {
      mergeReceiptDigestSha256: merge.receipt.receiptDigestSha256,
      publicationReceiptDigestSha256: hashJson(publication),
    },
    policy: {
      allDeltaObjectsVerified: true as const,
      existingCatalogEntriesPreserved: true as const,
      liveManifestMutationPerformed: false as const,
    },
    counts: {
      existingAssets: merge.receipt.counts.existingAssets,
      deltaAssets: merge.receipt.counts.deltaAssets,
      promotedAssets: merge.manifest.entries.length,
    },
    promotedManifestDigestSha256: hashJson(merge.manifest),
  };
  const receipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  await writeImmutableDirectory(outputDirectory, [
    { relativePath: 'manifest.json', content: stableJson(merge.manifest) },
    { relativePath: 'catalog-promotion-receipt.json', content: stableJson(receipt) },
  ]);
  return {
    manifest: merge.manifest,
    receipt,
    outputDirectory,
    manifestPath: path.join(outputDirectory, 'manifest.json'),
    receiptPath: path.join(outputDirectory, 'catalog-promotion-receipt.json'),
  };
}

async function readGateDirectory(gateDirectory: string): Promise<{
  directory: string;
  receipt: GateReceipt;
  curationBySourcePath: Map<string, CurationSpec['assets'][number]>;
}> {
  const directory = await resolveDirectory(gateDirectory, 'INVALID_GATE_DIRECTORY');
  const [rawReceipt, rawCuration] = await Promise.all([
    readJson(path.join(directory, GATE_RECEIPT_FILE), 'INVALID_GATE_RECEIPT_JSON'),
    readJson(path.join(directory, CURATION_SPEC_FILE), 'INVALID_GATE_CURATION_JSON'),
  ]);
  const receipt = parseSchema(
    gateReceiptSchema,
    rawReceipt,
    'INVALID_GATE_RECEIPT',
  );
  const curationSpec = parseSchema(
    curationSpecSchema,
    rawCuration,
    'INVALID_GATE_CURATION_SPEC',
  );
  const rawReceiptWithoutDigest = withoutDigest(rawReceipt);
  if (hashJson(rawReceiptWithoutDigest) !== receipt.receiptDigestSha256) {
    fail('GATE_RECEIPT_DIGEST_MISMATCH', `Gate receipt changed in ${directory}`);
  }
  if (hashJson(rawCuration) !== receipt.source.curationSpecDigestSha256) {
    fail('CURATION_SPEC_DIGEST_MISMATCH', `Gate curation changed in ${directory}`);
  }
  if (
    receipt.counts.approved !== receipt.approved.length
    || receipt.counts.approved !== curationSpec.assets.length
    || receipt.counts.candidates
      !== receipt.counts.approved + receipt.counts.rejected + receipt.counts.pending
  ) {
    fail('GATE_COUNT_MISMATCH', `Gate counts are inconsistent in ${directory}`);
  }
  const curationBySourcePath = uniqueMap(
    curationSpec.assets,
    asset => asset.sourcePath,
    'DUPLICATE_GATE_CURATION_PATH',
  );
  const approvedPaths = new Set(receipt.approved.map(asset => asset.stagedAudioPath));
  if (approvedPaths.size !== receipt.approved.length || approvedPaths.size !== curationBySourcePath.size) {
    fail('GATE_ASSET_SET_MISMATCH', `Gate approved and curation assets differ in ${directory}`);
  }
  return { directory, receipt, curationBySourcePath };
}

async function readAggregateDirectory(directoryValue: string): Promise<ValidatedAggregate> {
  const directory = await resolveDirectory(directoryValue, 'INVALID_AGGREGATE_DIRECTORY');
  const [rawReceipt, rawCuration] = await Promise.all([
    readJson(
      path.join(directory, 'publication-aggregate-receipt.json'),
      'INVALID_AGGREGATE_RECEIPT_JSON',
    ),
    readJson(path.join(directory, CURATION_SPEC_FILE), 'INVALID_AGGREGATE_CURATION_JSON'),
  ]);
  const receipt = parseSchema(
    aggregateReceiptSchema,
    rawReceipt,
    'INVALID_AGGREGATE_RECEIPT',
  );
  const curationSpec = parseSchema(
    curationSpecSchema,
    rawCuration,
    'INVALID_AGGREGATE_CURATION_SPEC',
  );
  const rawReceiptWithoutDigest = withoutDigest(rawReceipt);
  if (hashJson(rawReceiptWithoutDigest) !== receipt.receiptDigestSha256) {
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
    fail('AGGREGATE_COUNT_MISMATCH', 'Aggregate counts are inconsistent');
  }
  const curationByPath = uniqueMap(
    curationSpec.assets,
    asset => asset.sourcePath,
    'DUPLICATE_AGGREGATE_CURATION_PATH',
  );
  for (const asset of receipt.assets) {
    const curation = curationByPath.get(asset.stagedAudioPath);
    if (!curation) {
      fail('AGGREGATE_ASSET_MISSING', `Aggregate curation is missing ${asset.reviewId}`);
    }
    assertAggregateAssetBinding(asset, curation);
    const buffer = await readBoundFile(directory, asset.stagedAudioPath);
    if (
      buffer.byteLength !== asset.byteLength
      || hashBuffer(buffer) !== asset.conditionedHashSha256
    ) {
      fail('AGGREGATE_AUDIO_MISMATCH', `Aggregate audio changed for ${asset.reviewId}`);
    }
  }
  return { directory, curationSpec, receipt };
}

async function readMergeDirectory(directoryValue: string): Promise<{
  manifest: SfxCatalogManifest;
  receipt: MergeReceipt;
}> {
  const directory = await resolveDirectory(directoryValue, 'INVALID_MERGE_DIRECTORY');
  const [rawManifest, rawReceipt] = await Promise.all([
    readJson(
      path.join(directory, 'merged-manifest-candidate.json'),
      'INVALID_MERGED_MANIFEST_JSON',
    ),
    readJson(path.join(directory, 'catalog-merge-receipt.json'), 'INVALID_MERGE_RECEIPT_JSON'),
  ]);
  const manifest = parseManifest(rawManifest, 'INVALID_MERGED_MANIFEST');
  const receipt = parseSchema(mergeReceiptSchema, rawReceipt, 'INVALID_MERGE_RECEIPT');
  const rawReceiptWithoutDigest = withoutDigest(rawReceipt);
  if (hashJson(rawReceiptWithoutDigest) !== receipt.receiptDigestSha256) {
    fail('MERGE_RECEIPT_DIGEST_MISMATCH', 'Catalog merge receipt was modified');
  }
  if (
    hashJson(manifest) !== receipt.mergedManifestCandidateDigestSha256
    || manifest.entries.length !== receipt.counts.mergedAssets
    || receipt.counts.existingAssets + receipt.counts.deltaAssets
      !== receipt.counts.mergedAssets
  ) {
    fail('MERGED_MANIFEST_EVIDENCE_MISMATCH', 'Merged manifest differs from its receipt');
  }
  return { manifest, receipt };
}

function assertGateAssetBinding(
  approved: GateReceipt['approved'][number],
  curation: CurationSpec['assets'][number],
  receipt: GateReceipt,
): void {
  if (
    approved.stagedAudioPath !== `audio/${approved.reviewId}.wav`
    || curation.sourcePath !== approved.stagedAudioPath
    || curation.eventRoles[0] !== approved.selectedRole
    || curation.semanticEvidence.selectedRole !== approved.selectedRole
    || curation.semanticEvidence.candidateDigestSha256 !== approved.candidateDigestSha256
    || curation.semanticEvidence.embeddingSourceHashSha256
      !== approved.embeddingSourceHashSha256
    || curation.semanticEvidence.catalogContentHashSha256 !== approved.conditionedHashSha256
    || curation.semanticEvidence.embeddingAnalysisDigestSha256
      !== receipt.source.embeddingAnalysisDigestSha256
    || curation.provenance.providerAssetId !== approved.canonicalSourceId
    || curation.approval.reviewerId.trim().length === 0
    || Date.parse(curation.approval.reviewedAt) > Date.parse(receipt.gatedAt)
  ) {
    fail('GATE_ASSET_EVIDENCE_MISMATCH', `Gate evidence differs for ${approved.reviewId}`);
  }
}

function assertAggregateAssetBinding(
  aggregate: AggregateAsset,
  curation: CurationSpec['assets'][number],
): void {
  if (
    curation.sourcePath !== aggregate.stagedAudioPath
    || curation.eventRoles[0] !== aggregate.selectedRole
    || curation.semanticEvidence.selectedRole !== aggregate.selectedRole
    || curation.semanticEvidence.candidateDigestSha256 !== aggregate.candidateDigestSha256
    || curation.semanticEvidence.embeddingSourceHashSha256
      !== aggregate.embeddingSourceHashSha256
    || curation.semanticEvidence.catalogContentHashSha256 !== aggregate.conditionedHashSha256
    || curation.provenance.providerAssetId !== aggregate.canonicalSourceId
  ) {
    fail(
      'AGGREGATE_ASSET_EVIDENCE_MISMATCH',
      `Aggregate evidence differs for ${aggregate.reviewId}`,
    );
  }
}

function parseManifest(value: unknown, code: string): SfxCatalogManifest {
  try {
    return parseSfxCatalogManifest(value);
  } catch (error) {
    throw new Fsd50kPublicationAggregateError(
      code,
      `SFX catalog manifest is invalid: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function parseSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: string,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  fail(
    code,
    parsed.error.issues
      .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; '),
  );
}

async function resolveDirectory(directoryValue: string, code: string): Promise<string> {
  const resolved = path.resolve(directoryValue);
  let stat;
  try {
    stat = await lstat(resolved);
  } catch (error) {
    throw new Fsd50kPublicationAggregateError(
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

async function readBoundFile(root: string, relativePath: string): Promise<Buffer> {
  if (
    path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').some(segment => !segment || segment === '..' || segment === '.')
  ) {
    fail('UNSAFE_AUDIO_PATH', `Unsafe aggregate audio path: ${relativePath}`);
  }
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('UNSAFE_AUDIO_FILE', `Expected a real audio file: ${relativePath}`);
  }
  const canonicalPath = await realpath(absolutePath);
  if (!isInside(root, canonicalPath)) {
    fail('AUDIO_PATH_ESCAPE', `Audio path escapes its publication directory: ${relativePath}`);
  }
  return readFile(canonicalPath);
}

async function writeImmutableDirectory(
  outputDirectory: string,
  files: Array<{ relativePath: string; content: string | Buffer }>,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    for (const file of files) {
      const destination = path.join(staging, ...file.relativePath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, { flag: 'wx' });
    }
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function readJson(filePath: string, code: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Fsd50kPublicationAggregateError(
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
  fail('OUTPUT_EXISTS', `Publication output already exists: ${target}`);
}

function uniqueMap<T>(
  values: T[],
  keyOf: (value: T) => string,
  code: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) fail(code, `Duplicate publication key: ${key}`);
    result.set(key, value);
  }
  return result;
}

function assertUnique(seen: Set<string>, value: string, code: string): void {
  if (seen.has(value)) fail(code, `Duplicate publication evidence: ${value}`);
  seen.add(value);
}

function validDate(value: Date, code: string): Date {
  if (Number.isNaN(value.getTime())) fail(code, 'Publication timestamp is invalid');
  return value;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withoutDigest(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_RECEIPT_OBJECT', 'Publication receipt must be a JSON object');
  }
  const {
    receiptDigestSha256: _receiptDigestSha256,
    ...payload
  } = value as Record<string, unknown>;
  return payload;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashStableJson(value: unknown): string {
  return hashBuffer(Buffer.from(stableJson(value)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(code: string, message: string): never {
  throw new Fsd50kPublicationAggregateError(code, message);
}
