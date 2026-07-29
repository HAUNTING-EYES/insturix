import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEventRole,
  type SfxCatalogSemanticEvidence,
} from '@/lib/pipeline/sfx-catalog';
import {
  finalizeApprovedSfxSemanticReview,
  type ApprovedSfxSemanticReviewDecisions,
  type ApprovedSfxSemanticReviewReport,
} from '@/lib/pipeline/sfx-catalog-semantic-review';
import {
  FSD50K_REVIEW_ROLE_PROFILES,
} from '@/lib/pipeline/sfx-fsd50k-review-batches';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const APPROVED_SFX_SEMANTIC_REVIEW_APPLICATION_VERSION =
  'approved-sfx-semantic-review-application-v1' as const;

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
}).passthrough();
const curationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();
const migrationReceiptSchema = z.object({
  enrichedCurationSpecDigestSha256: z.string().regex(SHA256_PATTERN),
  receiptDigestSha256: z.string().regex(SHA256_PATTERN),
}).passthrough();
const reviewReportInputSchema = z.object({
  migration: z.object({
    receiptDigestSha256: z.string().regex(SHA256_PATTERN),
    enrichedCurationSpecDigestSha256: z.string().regex(SHA256_PATTERN),
  }).passthrough(),
  counts: z.object({
    migrationAssets: z.number().int().positive(),
    directRoleAgreement: z.number().int().nonnegative(),
    reviewCandidates: z.number().int().positive(),
  }).strict(),
  candidates: z.array(z.object({
    assetId: z.string().min(1),
    semanticEvidenceDigestSha256: z.string().regex(SHA256_PATTERN),
    contentHashSha256: z.string().regex(SHA256_PATTERN),
    currentRole: eventRoleSchema,
    suggestedRole: eventRoleSchema,
    suggestedRoleScore: z.number().min(-1).max(1),
  }).passthrough()).min(1),
}).passthrough();

type CurationSpec = z.infer<typeof curationSpecSchema>;
type CurationAsset = CurationSpec['assets'][number];

export type ApprovedSfxSemanticReviewApplicationErrorCode =
  | 'INVALID_INPUT'
  | 'MIGRATION_RECEIPT_MISMATCH'
  | 'CURATION_DIGEST_MISMATCH'
  | 'REVIEW_SOURCE_MISMATCH'
  | 'REVIEW_ASSET_SET_MISMATCH'
  | 'SEMANTIC_EVIDENCE_MISMATCH'
  | 'INVALID_RESOLVED_ROLE'
  | 'INVALID_RESOLVED_CURATION';

export class ApprovedSfxSemanticReviewApplicationError extends Error {
  constructor(
    public readonly code: ApprovedSfxSemanticReviewApplicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApprovedSfxSemanticReviewApplicationError';
  }
}

export interface ApplyApprovedSfxSemanticReviewInput {
  enrichedCurationSpec: unknown;
  migrationReceipt: unknown;
  reviewReport: unknown;
  reviewDecisions: unknown;
  appliedAt?: Date;
}

export interface ApprovedSfxSemanticReviewApplicationReceiptEntry {
  assetId: string;
  contentHashSha256: string;
  decision: 'keep-current' | 'use-model-suggestion' | 'reject';
  previousRole: SfxCatalogEventRole;
  resolvedRole: SfxCatalogEventRole | null;
  previousSemanticEvidenceDigestSha256: string;
  resolvedSemanticEvidenceDigestSha256: string | null;
  note: string;
}

export interface ApprovedSfxSemanticReviewApplicationReceipt {
  version: typeof APPROVED_SFX_SEMANTIC_REVIEW_APPLICATION_VERSION;
  appliedAt: string;
  source: {
    migrationReceiptDigestSha256: string;
    reviewReportDigestSha256: string;
    reviewResolutionDigestSha256: string;
    enrichedCurationSpecDigestSha256: string;
  };
  policy: {
    exactDecisionSetApplied: true;
    relabelsUseCanonicalRoleProfiles: true;
    rejectedAssetsQuarantinedNotDeleted: true;
    originalHumanApprovalRetained: true;
    productionCatalogMutationPerformed: false;
  };
  counts: {
    sourceAssets: number;
    directRoleAgreement: number;
    keptHumanOverrides: number;
    relabelled: number;
    quarantined: number;
    resolvedAssets: number;
  };
  resolvedCurationSpecDigestSha256: string;
  entries: ApprovedSfxSemanticReviewApplicationReceiptEntry[];
  receiptDigestSha256: string;
}

export interface ApprovedSfxSemanticReviewApplicationResult {
  resolvedCurationSpec: CurationSpec;
  reviewResolution: ReturnType<typeof finalizeApprovedSfxSemanticReview>;
  applicationReceipt: ApprovedSfxSemanticReviewApplicationReceipt;
}

export function applyApprovedSfxSemanticReview(
  input: ApplyApprovedSfxSemanticReviewInput,
): ApprovedSfxSemanticReviewApplicationResult {
  const sourceCurationDigestSha256 = hashJson(input.enrichedCurationSpec);
  const curation = parseInput(
    curationSpecSchema,
    input.enrichedCurationSpec,
    'enriched curation spec',
  );
  const migration = parseAndVerifyReceipt(input.migrationReceipt);
  const report = parseInput(
    reviewReportInputSchema,
    input.reviewReport,
    'semantic review report',
  );
  const reviewResolution = finalizeApprovedSfxSemanticReview(
    input.reviewReport,
    input.reviewDecisions,
  );
  if (
    migration.enrichedCurationSpecDigestSha256 !== sourceCurationDigestSha256
    || report.migration.enrichedCurationSpecDigestSha256 !== sourceCurationDigestSha256
  ) {
    fail('CURATION_DIGEST_MISMATCH', 'Reviewed curation does not match its source receipt');
  }
  if (
    report.migration.receiptDigestSha256 !== migration.receiptDigestSha256
    || reviewResolution.migrationReceiptDigestSha256 !== migration.receiptDigestSha256
  ) {
    fail('REVIEW_SOURCE_MISMATCH', 'Review does not belong to this migration receipt');
  }
  if (
    report.counts.migrationAssets !== curation.assets.length
    || report.counts.reviewCandidates !== reviewResolution.entries.length
  ) {
    fail('REVIEW_ASSET_SET_MISMATCH', 'Review counts do not match the curation asset set');
  }

  const curationByHash = uniqueCurationByHash(curation);
  const reportByAssetId = new Map(
    report.candidates.map(candidate => [candidate.assetId, candidate] as const),
  );
  const resolutionByAssetId = new Map(
    reviewResolution.entries.map(entry => [entry.assetId, entry] as const),
  );
  if (
    reportByAssetId.size !== report.candidates.length
    || resolutionByAssetId.size !== reviewResolution.entries.length
    || reportByAssetId.size !== resolutionByAssetId.size
  ) {
    fail('REVIEW_ASSET_SET_MISMATCH', 'Review contains duplicate or missing assets');
  }

  const reviewAssetByHash = new Map<string, {
    report: (typeof report.candidates)[number];
    resolution: (typeof reviewResolution.entries)[number];
  }>();
  for (const [assetId, candidate] of reportByAssetId) {
    const resolution = resolutionByAssetId.get(assetId);
    if (!resolution) {
      fail('REVIEW_ASSET_SET_MISMATCH', `Missing resolution for ${assetId}`);
    }
    const asset = curationByHash.get(candidate.contentHashSha256);
    if (!asset) {
      fail('REVIEW_ASSET_SET_MISMATCH', `Missing curation asset for ${assetId}`);
    }
    if (
      hashJson(asset.semanticEvidence) !== candidate.semanticEvidenceDigestSha256
      || asset.semanticEvidence.selectedRole !== candidate.currentRole
    ) {
      fail('SEMANTIC_EVIDENCE_MISMATCH', `Semantic evidence differs for ${assetId}`);
    }
    reviewAssetByHash.set(candidate.contentHashSha256, { report: candidate, resolution });
  }
  if (reviewAssetByHash.size !== report.candidates.length) {
    fail('REVIEW_ASSET_SET_MISMATCH', 'Multiple review candidates refer to the same audio');
  }

  const resolvedAssets: CurationAsset[] = [];
  const receiptEntries: ApprovedSfxSemanticReviewApplicationReceiptEntry[] = [];
  for (const asset of curation.assets) {
    const contentHash = asset.semanticEvidence.catalogContentHashSha256;
    const reviewed = reviewAssetByHash.get(contentHash);
    if (!reviewed) {
      resolvedAssets.push(asset);
      continue;
    }
    const { report: candidate, resolution } = reviewed;
    if (resolution.decision === 'reject') {
      receiptEntries.push(buildReceiptEntry(
        candidate.assetId,
        contentHash,
        resolution.decision,
        asset.semanticEvidence,
        null,
        resolution.note,
      ));
      continue;
    }
    if (!resolution.resolvedRole) {
      fail('INVALID_RESOLVED_ROLE', `Accepted asset ${candidate.assetId} has no resolved role`);
    }
    if (resolution.decision === 'keep-current') {
      if (resolution.resolvedRole !== asset.semanticEvidence.selectedRole) {
        fail('INVALID_RESOLVED_ROLE', `Human role changed unexpectedly for ${candidate.assetId}`);
      }
      resolvedAssets.push(asset);
      receiptEntries.push(buildReceiptEntry(
        candidate.assetId,
        contentHash,
        resolution.decision,
        asset.semanticEvidence,
        asset.semanticEvidence,
        resolution.note,
      ));
      continue;
    }
    if (
      resolution.resolvedRole !== candidate.suggestedRole
      || candidate.suggestedRole !== asset.semanticEvidence.topRole
    ) {
      fail('INVALID_RESOLVED_ROLE', `Model relabel differs from evidence for ${candidate.assetId}`);
    }
    const relabelled = relabelCurationAsset(asset, resolution.resolvedRole);
    resolvedAssets.push(relabelled);
    receiptEntries.push(buildReceiptEntry(
      candidate.assetId,
      contentHash,
      resolution.decision,
      asset.semanticEvidence,
      relabelled.semanticEvidence,
      resolution.note,
    ));
  }
  if (receiptEntries.length !== report.candidates.length) {
    fail('REVIEW_ASSET_SET_MISMATCH', 'Not every review decision was applied');
  }

  const resolvedCurationSpec = parseInput(curationSpecSchema, {
    ...curation,
    assets: resolvedAssets,
  }, 'resolved curation spec');
  const receiptWithoutDigest = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_APPLICATION_VERSION,
    appliedAt: (input.appliedAt ?? new Date()).toISOString(),
    source: {
      migrationReceiptDigestSha256: migration.receiptDigestSha256,
      reviewReportDigestSha256: reviewResolution.reviewReportDigestSha256,
      reviewResolutionDigestSha256: reviewResolution.resolutionDigestSha256,
      enrichedCurationSpecDigestSha256: sourceCurationDigestSha256,
    },
    policy: {
      exactDecisionSetApplied: true,
      relabelsUseCanonicalRoleProfiles: true,
      rejectedAssetsQuarantinedNotDeleted: true,
      originalHumanApprovalRetained: true,
      productionCatalogMutationPerformed: false,
    },
    counts: {
      sourceAssets: curation.assets.length,
      directRoleAgreement: report.counts.directRoleAgreement,
      keptHumanOverrides: reviewResolution.counts.keepCurrent,
      relabelled: reviewResolution.counts.useModelSuggestion,
      quarantined: reviewResolution.counts.rejected,
      resolvedAssets: resolvedAssets.length,
    },
    resolvedCurationSpecDigestSha256: hashJson(resolvedCurationSpec),
    entries: receiptEntries.sort((left, right) => left.assetId.localeCompare(right.assetId)),
  } satisfies Omit<ApprovedSfxSemanticReviewApplicationReceipt, 'receiptDigestSha256'>;
  return {
    resolvedCurationSpec,
    reviewResolution,
    applicationReceipt: {
      ...receiptWithoutDigest,
      receiptDigestSha256: hashJson(receiptWithoutDigest),
    },
  };
}

function relabelCurationAsset(
  asset: CurationAsset,
  resolvedRole: SfxCatalogEventRole,
): CurationAsset {
  const profile = FSD50K_REVIEW_ROLE_PROFILES[resolvedRole];
  if (!profile) {
    fail('INVALID_RESOLVED_ROLE', `No canonical role profile exists for ${resolvedRole}`);
  }
  const evidence = sfxCatalogSemanticEvidenceSchema.safeParse({
    ...asset.semanticEvidence,
    selectedRole: resolvedRole,
    selectedRoleCosineSimilarity: asset.semanticEvidence.topRoleCosineSimilarity,
    selectedRoleRank: 1,
    roleAgreement: true,
  });
  if (!evidence.success) {
    fail(
      'INVALID_RESOLVED_CURATION',
      `Resolved semantic evidence is invalid: ${evidence.error.message}`,
    );
  }
  return {
    ...asset,
    eventRoles: [resolvedRole],
    tags: uniqueStrings([resolvedRole, ...asset.tags]),
    surfaces: profile.surfaces,
    layerRole: profile.layerRole,
    energy: profile.energy,
    brightness: profile.brightness,
    weight: profile.weight,
    transientSharpness: profile.transientSharpness,
    material: profile.material,
    tailMs: profile.tailMs,
    loopable: profile.loopable,
    direction: profile.direction,
    motionSpeed: profile.motionSpeed,
    semanticEvidence: evidence.data,
  };
}

function buildReceiptEntry(
  assetId: string,
  contentHashSha256: string,
  decision: ApprovedSfxSemanticReviewApplicationReceiptEntry['decision'],
  previousEvidence: SfxCatalogSemanticEvidence,
  resolvedEvidence: SfxCatalogSemanticEvidence | null,
  note: string,
): ApprovedSfxSemanticReviewApplicationReceiptEntry {
  return {
    assetId,
    contentHashSha256,
    decision,
    previousRole: previousEvidence.selectedRole,
    resolvedRole: resolvedEvidence?.selectedRole ?? null,
    previousSemanticEvidenceDigestSha256: hashJson(previousEvidence),
    resolvedSemanticEvidenceDigestSha256: resolvedEvidence ? hashJson(resolvedEvidence) : null,
    note,
  };
}

function parseAndVerifyReceipt(value: unknown): z.infer<typeof migrationReceiptSchema> {
  if (!isRecord(value) || typeof value.receiptDigestSha256 !== 'string') {
    fail('INVALID_INPUT', 'Migration receipt is malformed');
  }
  const { receiptDigestSha256, ...body } = value;
  if (hashJson(body) !== receiptDigestSha256) {
    fail('MIGRATION_RECEIPT_MISMATCH', 'Migration receipt digest does not match its contents');
  }
  return parseInput(migrationReceiptSchema, value, 'semantic migration receipt');
}

function uniqueCurationByHash(curation: CurationSpec): Map<string, CurationAsset> {
  const result = new Map<string, CurationAsset>();
  for (const asset of curation.assets) {
    const hash = asset.semanticEvidence.catalogContentHashSha256;
    if (result.has(hash)) {
      fail('REVIEW_ASSET_SET_MISMATCH', 'Curation contains duplicate audio content');
    }
    result.set(hash, asset);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
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

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(
  code: ApprovedSfxSemanticReviewApplicationErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new ApprovedSfxSemanticReviewApplicationError(
    code,
    message,
    cause ? { cause } : undefined,
  );
}
