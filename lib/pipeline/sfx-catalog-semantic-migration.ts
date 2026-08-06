import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  cosineSimilarity,
  embedVerifiedConditionedSfxAudio,
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_SEMANTIC_ROLE_PROMPTS,
  type DecodedAudio,
  type SfxClapEmbeddingRuntime,
  type SfxSemanticRoleScore,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogEventRole,
  type SfxCatalogManifest,
  type SfxCatalogSemanticEvidence,
} from '@/lib/pipeline/sfx-catalog';
import {
  FSD50K_SEMANTIC_RISK_PROMPTS,
  type Fsd50kSemanticRiskScore,
} from '@/lib/pipeline/sfx-fsd50k-embedding-index';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;

export const APPROVED_SFX_SEMANTIC_MIGRATION_VERSION =
  'approved-sfx-semantic-migration-v1' as const;
export const APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION =
  'approved-sfx-semantic-migration-receipt-v1' as const;

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
const surfaceSchema = z.enum([
  'transition',
  'motion-graphic',
  'ui',
  'scene',
  'logo',
  'caption',
  'chapter',
]);
const provenanceSchema = z.object({
  provider: z.string().trim().min(1),
  providerAssetId: z.string().trim().min(1),
  licenseId: z.string().trim().min(1),
  licenseUrl: z.string().url().optional(),
  attributionRequired: z.boolean(),
  attributionText: z.string().trim().min(1).optional(),
}).strict();
const approvalSchema = z.object({
  status: z.literal('approved'),
  reviewerId: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
}).strict();
const curationAssetSchema = z.object({
  sourcePath: z.string().trim().min(1),
  title: z.string().trim().min(1),
  eventRoles: z.array(eventRoleSchema).length(1),
  surfaces: z.array(surfaceSchema).min(1),
  layerRole: z.enum(['oneshot', 'riser', 'impact', 'loop', 'bed', 'sting']),
  tags: z.array(z.string().trim().min(1)).min(1),
  negativeTags: z.array(z.string().trim().min(1)),
  energy: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  transientSharpness: z.number().min(0).max(1),
  material: z.string().trim().min(1),
  tailMs: z.number().int().nonnegative(),
  loopable: z.boolean(),
  direction: z.enum(['neutral', 'left', 'right', 'up', 'down', 'in', 'out']),
  motionSpeed: z.enum(['still', 'slow', 'medium', 'fast']),
  trendTag: z.string().trim().min(1).optional(),
  semanticEvidence: z.unknown().optional(),
  provenance: provenanceSchema,
  approval: approvalSchema,
}).strict();
const curationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();
const publicationReceiptSchema = z.object({
  version: z.literal('sfx-catalog-publication-receipt-v1'),
  manifestVersion: z.literal('sfx-catalog-v1'),
  manifestHashSha256: z.string().regex(SHA256_PATTERN),
  assets: z.array(z.object({
    assetId: z.string().regex(ASSET_ID_PATTERN),
    contentHashSha256: z.string().regex(SHA256_PATTERN),
    status: z.string().min(1),
  }).passthrough()).min(1),
}).passthrough();
const uploadPlanSchema = z.object({
  version: z.literal('sfx-catalog-upload-plan-v1'),
  manifestVersion: z.literal('sfx-catalog-v1'),
  assets: z.array(z.object({
    assetId: z.string().regex(ASSET_ID_PATTERN),
    contentHashSha256: z.string().regex(SHA256_PATTERN),
    byteLength: z.number().int().positive(),
    provenance: provenanceSchema,
    approval: approvalSchema,
  }).passthrough()).min(1),
}).passthrough();

type CurationSpec = z.infer<typeof curationSpecSchema>;
type CurationAsset = CurationSpec['assets'][number];
type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;
type UploadPlan = z.infer<typeof uploadPlanSchema>;

export type ApprovedSfxSemanticMigrationErrorCode =
  | 'INVALID_INPUT'
  | 'ALREADY_MIGRATED'
  | 'UNSAFE_SOURCE_PATH'
  | 'ASSET_SET_MISMATCH'
  | 'SOURCE_HASH_MISMATCH'
  | 'RECEIPT_MISMATCH'
  | 'EDITORIAL_MISMATCH'
  | 'MODEL_MISMATCH'
  | 'INVALID_MODEL_OUTPUT';

export class ApprovedSfxSemanticMigrationError extends Error {
  constructor(
    public readonly code: ApprovedSfxSemanticMigrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApprovedSfxSemanticMigrationError';
  }
}

export interface ApprovedSfxSemanticMigrationInput {
  sourceRoot: string;
  curationSpec: unknown;
  liveManifest: unknown;
  publicationReceipt: unknown;
  uploadPlan: unknown;
  generatedAt?: Date;
}

export interface ApprovedSfxSemanticMigrationDependencies {
  runtime: SfxClapEmbeddingRuntime;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
  readAudioFile?: (filePath: string) => Promise<Buffer>;
  resolveRealPath?: (filePath: string) => Promise<string>;
}

export interface ApprovedSfxSemanticMigrationReceiptEntry {
  assetId: string;
  sourcePath: string;
  contentHashSha256: string;
  candidateDigestSha256: string;
  selectedRole: SfxCatalogEventRole;
  selectedRoleCosineSimilarity: number;
  selectedRoleRank: number;
  topRole: SfxCatalogEventRole;
  topRoleCosineSimilarity: number;
  roleAgreement: boolean;
  semanticEvidenceDigestSha256: string;
}

export interface ApprovedSfxSemanticMigrationReceipt {
  version: typeof APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION;
  generatedAt: string;
  source: {
    curationSpecDigestSha256: string;
    liveManifestDigestSha256: string;
    publicationManifestDigestSha256: string;
    publicationReceiptDigestSha256: string;
    uploadPlanDigestSha256: string;
  };
  model: {
    modelId: typeof SFX_CLAP_MODEL_ID;
    modelRevision: typeof SFX_CLAP_MODEL_REVISION;
    embeddingDimension: typeof SFX_CLAP_EMBEDDING_DIMENSION;
  };
  policy: {
    exactPublishedAssetSetRequired: true;
    exactPublishedBytesRequired: true;
    existingHumanApprovalRetained: true;
    providerApiCallsPerformed: false;
    productionCatalogMutationPerformed: false;
    semanticDisagreementsRequireReviewBeforePromotion: true;
  };
  counts: {
    approvedAssets: number;
    embeddedAssets: number;
    roleAgreement: number;
    semanticDisagreements: number;
  };
  promotionEligible: boolean;
  embeddingAnalysisDigestSha256: string;
  enrichedCurationSpecDigestSha256: string;
  entries: ApprovedSfxSemanticMigrationReceiptEntry[];
  receiptDigestSha256: string;
}

export interface ApprovedSfxSemanticMigrationResult {
  enrichedCurationSpec: CurationSpec;
  receipt: ApprovedSfxSemanticMigrationReceipt;
}

interface VerifiedMigrationAsset {
  curation: CurationAsset;
  manifest: SfxCatalogEntry;
  encoded: Buffer;
  contentHashSha256: string;
}

interface AnalyzedMigrationAsset extends VerifiedMigrationAsset {
  segmentCount: number;
  candidateDigestSha256: string;
  semanticRoles: SfxSemanticRoleScore[];
  semanticRisks: Fsd50kSemanticRiskScore[];
}

export async function migrateApprovedSfxCatalogSemantics(
  input: ApprovedSfxSemanticMigrationInput,
  dependencies: ApprovedSfxSemanticMigrationDependencies,
): Promise<ApprovedSfxSemanticMigrationResult> {
  const curationSpec = parseInput(curationSpecSchema, input.curationSpec, 'curation spec');
  const liveManifest = parseLiveManifest(input.liveManifest);
  const publicationReceipt = parseInput(
    publicationReceiptSchema,
    input.publicationReceipt,
    'publication receipt',
  );
  const uploadPlan = parseInput(uploadPlanSchema, input.uploadPlan, 'upload plan');
  assertPinnedRuntime(dependencies.runtime);
  assertNoExistingSemanticEvidence(curationSpec);
  assertPublishedAssetSets(liveManifest, publicationReceipt, uploadPlan, curationSpec);

  const readAudioFile = dependencies.readAudioFile ?? (async filePath => readFile(filePath));
  const resolveRealPath = dependencies.resolveRealPath ?? (async filePath => realpath(filePath));
  const sourceRoot = await resolveRealPath(path.resolve(input.sourceRoot));
  const manifestByHash = uniqueByHash(liveManifest.entries, 'live manifest');
  const receiptByHash = uniqueByHash(publicationReceipt.assets, 'publication receipt');
  const uploadByHash = uniqueByHash(uploadPlan.assets, 'upload plan');
  const verifiedAssets: VerifiedMigrationAsset[] = [];

  for (const curation of curationSpec.assets) {
    const sourcePath = await resolveSafeSourcePath(
      sourceRoot,
      curation.sourcePath,
      resolveRealPath,
    );
    const encoded = await readAudioFile(sourcePath);
    const contentHashSha256 = hashBuffer(encoded);
    const manifest = manifestByHash.get(contentHashSha256);
    const publication = receiptByHash.get(contentHashSha256);
    const upload = uploadByHash.get(contentHashSha256);
    if (!manifest || !publication || !upload) {
      fail(
        'SOURCE_HASH_MISMATCH',
        `Approved source ${curation.sourcePath} is not the exact published catalog audio`,
      );
    }
    if (
      manifest.assetId !== publication.assetId
      || manifest.assetId !== upload.assetId
      || encoded.byteLength !== upload.byteLength
    ) {
      fail('RECEIPT_MISMATCH', `Published receipts disagree for ${manifest.assetId}`);
    }
    if (
      hashJson(editorialFields(curation)) !== hashJson(editorialFields(manifest))
      || hashJson(curation.provenance) !== hashJson(manifest.provenance)
      || hashJson(curation.provenance) !== hashJson(upload.provenance)
      || hashJson(curation.approval) !== hashJson(upload.approval)
    ) {
      fail('EDITORIAL_MISMATCH', `Approved metadata differs from publication for ${manifest.assetId}`);
    }
    verifiedAssets.push({ curation, manifest, encoded, contentHashSha256 });
  }

  const promptEmbeddings = await loadPromptEmbeddings(dependencies.runtime);
  const analyzedAssets: AnalyzedMigrationAsset[] = [];
  for (const asset of verifiedAssets.sort((left, right) =>
    left.manifest.assetId.localeCompare(right.manifest.assetId))) {
    const embedded = await embedVerifiedConditionedSfxAudio({
      sourceId: asset.manifest.assetId,
      encoded: asset.encoded,
      expectedContentHashSha256: asset.contentHashSha256,
    }, {
      runtime: dependencies.runtime,
      ...(dependencies.decodeAudio ? { decodeAudio: dependencies.decodeAudio } : {}),
    });
    const semanticRoles = SFX_SEMANTIC_ROLE_PROMPTS
      .map((item, index) => ({
        role: item.role,
        prompt: item.prompt,
        cosineSimilarity: cosineSimilarity(embedded.embedding, promptEmbeddings.roles[index]),
      }))
      .sort((left, right) =>
        right.cosineSimilarity - left.cosineSimilarity
        || left.role.localeCompare(right.role));
    const semanticRisks = FSD50K_SEMANTIC_RISK_PROMPTS.map((item, index) => ({
      risk: item.risk,
      prompt: item.prompt,
      cosineSimilarity: cosineSimilarity(embedded.embedding, promptEmbeddings.risks[index]),
    }));
    const selectedRole = asset.curation.eventRoles[0];
    const selectedRoleRank = semanticRoles.findIndex(score => score.role === selectedRole) + 1;
    if (selectedRoleRank === 0) {
      fail(
        'INVALID_MODEL_OUTPUT',
        `Pinned CLAP did not score approved role ${selectedRole} for ${asset.manifest.assetId}`,
      );
    }
    analyzedAssets.push({
      ...asset,
      segmentCount: embedded.segmentCount,
      semanticRoles,
      semanticRisks,
      candidateDigestSha256: hashJson({
        version: APPROVED_SFX_SEMANTIC_MIGRATION_VERSION,
        assetId: asset.manifest.assetId,
        sourcePath: asset.curation.sourcePath,
        contentHashSha256: asset.contentHashSha256,
        editorial: editorialFields(asset.curation),
        provenance: asset.curation.provenance,
        approval: asset.curation.approval,
      }),
    });
  }

  const sourceDigests = {
    curationSpecDigestSha256: hashJson(curationSpec),
    liveManifestDigestSha256: hashJson(liveManifest),
    publicationManifestDigestSha256: publicationReceipt.manifestHashSha256,
    publicationReceiptDigestSha256: hashJson(publicationReceipt),
    uploadPlanDigestSha256: hashJson(uploadPlan),
  };
  const embeddingAnalysisDigestSha256 = hashJson({
    version: APPROVED_SFX_SEMANTIC_MIGRATION_VERSION,
    source: sourceDigests,
    model: pinnedModelReceipt(),
    rolePrompts: SFX_SEMANTIC_ROLE_PROMPTS,
    riskPrompts: FSD50K_SEMANTIC_RISK_PROMPTS,
    entries: analyzedAssets.map(asset => ({
      assetId: asset.manifest.assetId,
      contentHashSha256: asset.contentHashSha256,
      candidateDigestSha256: asset.candidateDigestSha256,
      segmentCount: asset.segmentCount,
      semanticRoles: asset.semanticRoles,
      semanticRisks: asset.semanticRisks,
    })),
  });
  const evidenceByAssetId = new Map<string, SfxCatalogSemanticEvidence>();
  for (const asset of analyzedAssets) {
    const selectedRole = asset.curation.eventRoles[0];
    const selectedRoleIndex = asset.semanticRoles.findIndex(score => score.role === selectedRole);
    const selected = asset.semanticRoles[selectedRoleIndex];
    const top = asset.semanticRoles[0];
    const parsed = sfxCatalogSemanticEvidenceSchema.safeParse({
      version: SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
      provider: 'clap-audio-classifier',
      model: pinnedModelReceipt(),
      embeddingAnalysisDigestSha256,
      candidateDigestSha256: asset.candidateDigestSha256,
      embeddingSourceHashSha256: asset.contentHashSha256,
      catalogContentHashSha256: asset.contentHashSha256,
      selectedRole,
      selectedRoleCosineSimilarity: selected.cosineSimilarity,
      selectedRoleRank: selectedRoleIndex + 1,
      topRole: top.role,
      topRoleCosineSimilarity: top.cosineSimilarity,
      roleAgreement: selectedRole === top.role,
      riskScores: asset.semanticRisks.map(score => ({
        risk: score.risk,
        cosineSimilarity: score.cosineSimilarity,
      })),
    });
    if (!parsed.success) {
      fail(
        'INVALID_MODEL_OUTPUT',
        `Semantic evidence is invalid for ${asset.manifest.assetId}: ${parsed.error.message}`,
      );
    }
    evidenceByAssetId.set(asset.manifest.assetId, parsed.data);
  }

  const enrichedCurationSpec: CurationSpec = {
    ...curationSpec,
    assets: curationSpec.assets.map(asset => {
      const verified = verifiedAssets.find(item => item.curation.sourcePath === asset.sourcePath);
      const evidence = verified ? evidenceByAssetId.get(verified.manifest.assetId) : undefined;
      if (!evidence) {
        fail('ASSET_SET_MISMATCH', `No semantic evidence was produced for ${asset.sourcePath}`);
      }
      return { ...asset, semanticEvidence: evidence };
    }),
  };
  const receiptEntries = analyzedAssets.map<ApprovedSfxSemanticMigrationReceiptEntry>(asset => {
    const evidence = evidenceByAssetId.get(asset.manifest.assetId);
    if (!evidence) {
      fail('ASSET_SET_MISMATCH', `No semantic evidence was retained for ${asset.manifest.assetId}`);
    }
    return {
      assetId: asset.manifest.assetId,
      sourcePath: asset.curation.sourcePath,
      contentHashSha256: asset.contentHashSha256,
      candidateDigestSha256: asset.candidateDigestSha256,
      selectedRole: evidence.selectedRole,
      selectedRoleCosineSimilarity: evidence.selectedRoleCosineSimilarity,
      selectedRoleRank: evidence.selectedRoleRank,
      topRole: evidence.topRole,
      topRoleCosineSimilarity: evidence.topRoleCosineSimilarity,
      roleAgreement: evidence.roleAgreement,
      semanticEvidenceDigestSha256: hashJson(evidence),
    };
  });
  const receiptWithoutDigest = {
    version: APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    source: sourceDigests,
    model: pinnedModelReceipt(),
    policy: {
      exactPublishedAssetSetRequired: true,
      exactPublishedBytesRequired: true,
      existingHumanApprovalRetained: true,
      providerApiCallsPerformed: false,
      productionCatalogMutationPerformed: false,
      semanticDisagreementsRequireReviewBeforePromotion: true,
    },
    counts: {
      approvedAssets: curationSpec.assets.length,
      embeddedAssets: analyzedAssets.length,
      roleAgreement: receiptEntries.filter(entry => entry.roleAgreement).length,
      semanticDisagreements: receiptEntries.filter(entry => !entry.roleAgreement).length,
    },
    promotionEligible: receiptEntries.every(entry => entry.roleAgreement),
    embeddingAnalysisDigestSha256,
    enrichedCurationSpecDigestSha256: hashJson(enrichedCurationSpec),
    entries: receiptEntries,
  } satisfies Omit<ApprovedSfxSemanticMigrationReceipt, 'receiptDigestSha256'>;
  return {
    enrichedCurationSpec,
    receipt: {
      ...receiptWithoutDigest,
      receiptDigestSha256: hashJson(receiptWithoutDigest),
    },
  };
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  fail(
    'INVALID_INPUT',
    `Invalid ${label}: ${parsed.error.issues
      .map(issue => `${issue.path.join('.') || label}: ${issue.message}`)
      .join('; ')}`,
  );
}

function parseLiveManifest(value: unknown): SfxCatalogManifest {
  try {
    return parseSfxCatalogManifest(value);
  } catch (error) {
    fail('INVALID_INPUT', 'Invalid live SFX manifest', error);
  }
}

function assertPinnedRuntime(runtime: SfxClapEmbeddingRuntime): void {
  if (
    runtime.descriptor.modelId !== SFX_CLAP_MODEL_ID
    || runtime.descriptor.revision !== SFX_CLAP_MODEL_REVISION
    || runtime.descriptor.embeddingDimension !== SFX_CLAP_EMBEDDING_DIMENSION
  ) {
    fail('MODEL_MISMATCH', 'Semantic migration requires the pinned production CLAP model');
  }
}

function assertNoExistingSemanticEvidence(curationSpec: CurationSpec): void {
  const alreadyMigrated = curationSpec.assets.find(asset => asset.semanticEvidence !== undefined);
  if (alreadyMigrated) {
    fail('ALREADY_MIGRATED', `Semantic evidence already exists for ${alreadyMigrated.sourcePath}`);
  }
}

function assertPublishedAssetSets(
  liveManifest: SfxCatalogManifest,
  publicationReceipt: PublicationReceipt,
  uploadPlan: UploadPlan,
  curationSpec: CurationSpec,
): void {
  const expected = new Set(liveManifest.entries.map(entry => entry.contentHashSha256));
  const receipt = new Set(publicationReceipt.assets.map(entry => entry.contentHashSha256));
  const upload = new Set(uploadPlan.assets.map(entry => entry.contentHashSha256));
  if (
    expected.size !== liveManifest.entries.length
    || receipt.size !== publicationReceipt.assets.length
    || upload.size !== uploadPlan.assets.length
    || expected.size !== curationSpec.assets.length
    || !sameSet(expected, receipt)
    || !sameSet(expected, upload)
  ) {
    fail(
      'ASSET_SET_MISMATCH',
      'Curation, live manifest, publication receipt, and upload plan must describe one exact asset set',
    );
  }
}

async function resolveSafeSourcePath(
  sourceRoot: string,
  sourcePath: string,
  resolveRealPath: (filePath: string) => Promise<string>,
): Promise<string> {
  const candidate = path.resolve(sourceRoot, sourcePath);
  if (!isPathInside(sourceRoot, candidate)) {
    fail('UNSAFE_SOURCE_PATH', `Approved source escapes its root: ${sourcePath}`);
  }
  let resolved: string;
  try {
    resolved = await resolveRealPath(candidate);
  } catch (error) {
    fail('UNSAFE_SOURCE_PATH', `Approved source cannot be resolved: ${sourcePath}`, error);
  }
  if (!isPathInside(sourceRoot, resolved)) {
    fail('UNSAFE_SOURCE_PATH', `Approved source resolves outside its root: ${sourcePath}`);
  }
  return resolved;
}

async function loadPromptEmbeddings(runtime: SfxClapEmbeddingRuntime): Promise<{
  roles: readonly Float32Array[];
  risks: readonly Float32Array[];
}> {
  const roleCount = SFX_SEMANTIC_ROLE_PROMPTS.length;
  const prompts = [
    ...SFX_SEMANTIC_ROLE_PROMPTS.map(item => item.prompt),
    ...FSD50K_SEMANTIC_RISK_PROMPTS.map(item => item.prompt),
  ];
  const embeddings = await runtime.embedTexts(prompts);
  if (
    embeddings.length !== prompts.length
    || embeddings.some(embedding => embedding.length !== SFX_CLAP_EMBEDDING_DIMENSION)
  ) {
    fail('INVALID_MODEL_OUTPUT', 'Pinned CLAP returned an invalid prompt embedding batch');
  }
  return {
    roles: embeddings.slice(0, roleCount),
    risks: embeddings.slice(roleCount),
  };
}

function editorialFields(asset: CurationAsset | SfxCatalogEntry): object {
  return {
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
    trendTag: asset.trendTag ?? null,
  };
}

function uniqueByHash<T extends { contentHashSha256: string }>(
  entries: readonly T[],
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) {
    if (result.has(entry.contentHashSha256)) {
      fail('ASSET_SET_MISMATCH', `${label} contains duplicate audio content`);
    }
    result.set(entry.contentHashSha256, entry);
  }
  return result;
}

function pinnedModelReceipt() {
  return {
    modelId: SFX_CLAP_MODEL_ID,
    modelRevision: SFX_CLAP_MODEL_REVISION,
    embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
  } as const;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(
  code: ApprovedSfxSemanticMigrationErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new ApprovedSfxSemanticMigrationError(code, message, cause ? { cause } : undefined);
}
