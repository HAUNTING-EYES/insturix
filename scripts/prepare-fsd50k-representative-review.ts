import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_SEMANTIC_ROLE_PROMPTS,
  SFX_CLAP_TRANSFORMERS_VERSION,
} from '../lib/pipeline/sfx-audio-embedding';
import { FSD50K_CC0_LICENSE_URL } from '../lib/pipeline/sfx-fsd50k-harvest';
import { FSD50K_SAMPLEABLE_ROLES } from '../lib/pipeline/sfx-fsd50k-sampling';
import {
  prepareSfxCatalogReview,
  type PreparedSfxCatalogReview,
} from './prepare-sfx-catalog-review';
import type {
  SfxCatalogReviewMetadata,
  SfxCatalogReviewSeed,
  SfxCatalogReviewSourceEvidence,
} from './sfx-catalog-review-seed';

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^[0-9]+$/;
const COLLECTION_ID = 'fsd50k-freesound-cc0';
const SAMPLE_PLAN_FILENAME = 'sample-plan.json';
const SAMPLE_REPORT_FILENAME = 'sample-report.json';
const DEFAULT_SCREENING_FILENAME = 'clap-screening-report-v1.json';

const roleSchema = z.enum(FSD50K_SAMPLEABLE_ROLES);
const sha256Schema = z.string().regex(SHA256);
const scoreSchema = z.number().finite().min(-1).max(1);

const planSchema = z
  .object({
    version: z.literal('editron-fsd50k-sample-plan-v1'),
    candidatePoolSha256: sha256Schema,
    policy: z
      .object({
        clipLicenseAllowlist: z.tuple([z.literal('cc0-1.0')]),
        metadataRiskFlagsAllowed: z.literal(false),
        uploaderMetadataOnlyAllowed: z.literal(false),
        publicationAllowed: z.literal(false),
      })
      .passthrough(),
    entries: z
      .array(
        z
          .object({
            assignedRole: roleSchema,
            evidenceKind: z.literal('ground-truth-label'),
            candidate: z
              .object({
                sourceId: z.string().regex(SOURCE_ID),
                title: z.string().trim().min(1),
                labels: z.array(z.string().trim().min(1)).min(1),
                uploaderTags: z.array(z.string().trim().min(1)),
                metadataRiskFlags: z.array(z.never()).length(0),
                provenance: z
                  .object({
                    provider: z.literal('fsd50k'),
                    upstreamProvider: z.literal('freesound'),
                    providerAssetId: z.string().regex(SOURCE_ID),
                    clipLicenseId: z.literal('cc0-1.0'),
                    clipLicenseUrl: z.string().url(),
                    clipAttributionRequired: z.literal(false),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const acceptedSampleEntrySchema = z
  .object({
    sourceId: z.string().regex(SOURCE_ID),
    assignedRole: roleSchema,
    status: z.literal('accepted'),
    title: z.string().trim().min(1),
    audioPath: z.string().trim().min(1),
    measurement: z
      .object({
        sourceHashSha256: sha256Schema,
        durationMs: z.number().int().positive(),
      })
      .passthrough(),
    audioRights: z
      .object({
        mediaRole: z.literal('sfx'),
        source: z.literal('library'),
        userChoice: z.literal('attested'),
        licensed: z.literal(true),
        evidence: z
          .object({
            kind: z.literal('library-license'),
            sourceAssetId: z.string().trim().min(1),
            licenseId: z.string().trim().min(1),
          })
          .strict(),
      })
      .strict(),
    providerTags: z.array(z.string().trim().min(1)),
  })
  .passthrough();

const sampleReportSchema = z
  .object({
    version: z.literal('editron-fsd50k-audio-sample-v1'),
    candidatePoolSha256: sha256Schema,
    policy: z
      .object({
        purpose: z.literal('internal-acoustic-and-embedding-screening'),
        publicationAllowed: z.literal(false),
        productionCatalogMutationAllowed: z.literal(false),
        providerLicenseReverified: z.literal(true),
        acousticGate: z.literal('production-controlled-freesound-ingest'),
      })
      .strict(),
    counts: z
      .object({
        requested: z.number().int().positive(),
        accepted: z.number().int().positive(),
        rejected: z.number().int().nonnegative(),
        downloadedBytes: z.number().int().nonnegative(),
      })
      .strict(),
    entries: z.array(z.unknown()).min(1),
  })
  .passthrough();

const semanticRoleSchema = z
  .object({
    role: z.enum([
      'whoosh',
      'impact',
      'tick',
      'pop',
      'riser',
      'logo-sting',
      'ambience',
      'foley',
      'shimmer',
    ]),
    prompt: z.string().trim().min(1),
    cosineSimilarity: scoreSchema,
  })
  .strict();

const screeningEntrySchema = z
  .object({
    sourceId: z.string().regex(SOURCE_ID),
    assignedRole: roleSchema,
    title: z.string().trim().min(1),
    audioPath: z.string().trim().min(1),
    sourceHashSha256: sha256Schema,
    providerTags: z.array(z.string().trim().min(1)),
    segmentCount: z.number().int().positive(),
    embedding: z
      .object({
        encoding: z.literal('base64-f32le'),
        dimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
        value: z.string().min(1),
      })
      .strict(),
    semanticRoles: z.array(semanticRoleSchema).length(9),
    topRole: semanticRoleSchema.shape.role,
    topRoleScore: scoreSchema,
    assignedRoleScore: scoreSchema,
    assignedRoleRank: z.number().int().min(1).max(9),
    roleAgreement: z.boolean(),
    nearestNeighbor: z
      .object({
        sourceId: z.string().regex(SOURCE_ID),
        cosineSimilarity: scoreSchema,
      })
      .strict()
      .optional(),
    clusterId: z.string().regex(/^sfx_cluster_[a-f0-9]{16}$/),
    representative: z.boolean(),
  })
  .strict();

const clusterSchema = z
  .object({
    clusterId: z.string().regex(/^sfx_cluster_[a-f0-9]{16}$/),
    duplicateCandidate: z.boolean(),
    memberSourceIds: z.array(z.string().regex(SOURCE_ID)).min(1),
    assignedRoles: z.array(roleSchema).min(1),
    representativeSourceId: z.string().regex(SOURCE_ID),
    representativeRule: z.literal('highest-assigned-role-similarity-then-source-id'),
    minimumPairwiseSimilarity: scoreSchema,
    maximumPairwiseSimilarity: scoreSchema,
  })
  .strict();

const screeningReportSchema = z
  .object({
    version: z.literal('editron-sfx-clap-screening-v1'),
    generatedAt: z.string().datetime(),
    sourceCandidatePoolSha256: sha256Schema,
    sourceReceiptSha256: sha256Schema,
    policy: z
      .object({
        purpose: z.literal('internal-semantic-and-near-duplicate-screening'),
        publicationAllowed: z.literal(false),
        productionCatalogMutationAllowed: z.literal(false),
        humanReviewRequired: z.literal(true),
      })
      .strict(),
    model: z
      .object({
        provider: z.literal('huggingface-transformers-js'),
        packageVersion: z.literal(SFX_CLAP_TRANSFORMERS_VERSION),
        modelId: z.literal(SFX_CLAP_MODEL_ID),
        revision: z.literal(SFX_CLAP_MODEL_REVISION),
        dtype: z.literal('q8'),
        sampleRateHz: z.literal(SFX_CLAP_SAMPLE_RATE_HZ),
        embeddingDimension: z.literal(SFX_CLAP_EMBEDDING_DIMENSION),
        windowing: z.literal('non-overlapping-10s-duration-weighted-mean'),
      })
      .strict(),
    rolePrompts: z
      .array(
        z
          .object({
            role: semanticRoleSchema.shape.role,
            prompt: z.string().trim().min(1),
          })
          .strict(),
      )
      .length(9),
    duplicateSimilarityThreshold: z
      .number()
      .finite()
      .min(DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD)
      .max(1),
    counts: z
      .object({
        acceptedInput: z.number().int().positive(),
        embedded: z.number().int().positive(),
        roleAgreement: z.number().int().nonnegative(),
        clusters: z.number().int().positive(),
        duplicateCandidateClusters: z.number().int().nonnegative(),
        duplicateCandidateEntries: z.number().int().nonnegative(),
        representatives: z.number().int().positive(),
      })
      .strict(),
    entries: z.array(screeningEntrySchema).min(1),
    clusters: z.array(clusterSchema).min(1),
    analysisDigestSha256: sha256Schema,
  })
  .passthrough();

type Plan = z.infer<typeof planSchema>;
type SampleEntry = z.infer<typeof acceptedSampleEntrySchema>;
type ScreeningReport = z.infer<typeof screeningReportSchema>;
type ScreeningEntry = z.infer<typeof screeningEntrySchema>;

export interface Fsd50kRepresentativeReviewReceipt {
  version: 'editron-fsd50k-representative-review-bridge-v1';
  generatedAt: string;
  policy: {
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    autoApprovalAllowed: false;
    clusterDecisionPropagationAllowed: false;
    humanReviewRequired: true;
  };
  sourceEvidence: SfxCatalogReviewSourceEvidence;
  counts: {
    acceptedSources: number;
    clusters: number;
    queuedRepresentatives: number;
    deferredClusterMembers: number;
  };
  deferredClusterMembers: Array<{
    sourceId: string;
    clusterId: string;
    representativeSourceId: string;
    status: 'not-reviewed-not-approved';
  }>;
  receiptDigestSha256: string;
}

export interface BuildFsd50kRepresentativeReviewInput {
  samplePlan: unknown;
  sampleReport: unknown;
  screeningReport: unknown;
  generatedAt?: Date;
}

export interface BuiltFsd50kRepresentativeReview {
  seed: SfxCatalogReviewSeed;
  receipt: Fsd50kRepresentativeReviewReceipt;
}

export interface PrepareFsd50kRepresentativeReviewOptions {
  sampleRoot: string;
  screeningReportPath?: string;
  outDir: string;
  now?: Date;
}

export interface PreparedFsd50kRepresentativeReview {
  review: PreparedSfxCatalogReview;
  receipt: Fsd50kRepresentativeReviewReceipt;
  evidenceDirectory: string;
}

export class Fsd50kRepresentativeReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kRepresentativeReviewError';
  }
}

type RoleProfile = Omit<
  SfxCatalogReviewMetadata,
  'title' | 'eventRoles' | 'tags' | 'negativeTags' | 'trendTag'
>;

const ROLE_PROFILES: Record<(typeof FSD50K_SAMPLEABLE_ROLES)[number], RoleProfile> = {
  whoosh: profile(
    ['transition', 'motion-graphic'],
    'oneshot',
    0.58,
    0.58,
    0.28,
    0.55,
    'air',
    'fast',
  ),
  impact: profile(
    ['transition', 'motion-graphic', 'scene'],
    'impact',
    0.78,
    0.35,
    0.82,
    0.88,
    'physical',
    'fast',
  ),
  tick: profile(
    ['motion-graphic', 'ui', 'caption'],
    'oneshot',
    0.25,
    0.68,
    0.14,
    0.93,
    'recorded',
    'fast',
  ),
  pop: profile(
    ['motion-graphic', 'ui', 'caption'],
    'oneshot',
    0.42,
    0.58,
    0.32,
    0.8,
    'recorded',
    'fast',
  ),
  ambience: profile(['scene', 'chapter'], 'bed', 0.32, 0.45, 0.4, 0.18, 'environmental', 'still'),
  foley: profile(
    ['scene', 'motion-graphic'],
    'oneshot',
    0.45,
    0.45,
    0.5,
    0.64,
    'physical',
    'medium',
  ),
  shimmer: profile(
    ['motion-graphic', 'logo', 'transition'],
    'oneshot',
    0.4,
    0.88,
    0.12,
    0.55,
    'tonal',
    'medium',
  ),
};

export function buildFsd50kRepresentativeReview(
  input: BuildFsd50kRepresentativeReviewInput,
): BuiltFsd50kRepresentativeReview {
  const plan = parse(planSchema, input.samplePlan, 'sample plan');
  const sampleReport = parse(sampleReportSchema, input.sampleReport, 'sample report');
  const screening = parse(screeningReportSchema, input.screeningReport, 'CLAP screening report');
  const generatedAt = input.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime()))
    fail('INVALID_CLOCK', 'Review bridge timestamp is invalid');
  if (
    plan.candidatePoolSha256 !== sampleReport.candidatePoolSha256 ||
    plan.candidatePoolSha256 !== screening.sourceCandidatePoolSha256
  ) {
    fail(
      'SOURCE_SET_MISMATCH',
      'Sample plan, sample report, and CLAP report identify different source pools',
    );
  }

  if (JSON.stringify(screening.rolePrompts) !== JSON.stringify(SFX_SEMANTIC_ROLE_PROMPTS)) {
    fail('MODEL_PROMPT_MISMATCH', 'CLAP semantic prompts do not match the pinned review contract');
  }

  const accepted = sampleReport.entries.map((entry, index) =>
    parse(acceptedSampleEntrySchema, entry, `accepted sample entry ${index}`),
  );
  if (
    sampleReport.counts.rejected !== 0 ||
    sampleReport.counts.accepted !== accepted.length ||
    sampleReport.counts.requested !== accepted.length
  ) {
    fail('INCOMPLETE_SAMPLE', 'Representative review requires a fully accepted conditioned sample');
  }
  const planById = uniqueMap(
    plan.entries,
    (entry) => entry.candidate.sourceId,
    'sample plan source ID',
  );
  const sampleById = uniqueMap(accepted, (entry) => entry.sourceId, 'sample report source ID');
  const screeningById = uniqueMap(screening.entries, (entry) => entry.sourceId, 'CLAP source ID');
  if (
    planById.size !== sampleById.size ||
    sampleById.size !== screeningById.size ||
    screening.counts.acceptedInput !== accepted.length ||
    screening.counts.embedded !== screening.entries.length
  ) {
    fail('SOURCE_SET_MISMATCH', 'Representative evidence omits or adds source candidates');
  }

  verifyScreeningDigest(screening);
  verifySourceReceipt(screening, accepted);
  verifyScreeningCounts(screening);
  const clusterById = verifyClusters(screening, screeningById);

  for (const entry of screening.entries) {
    const sample = sampleById.get(entry.sourceId);
    const planEntry = planById.get(entry.sourceId);
    if (!sample || !planEntry)
      fail('SOURCE_SET_MISMATCH', `Missing source evidence for ${entry.sourceId}`);
    verifySource(entry, sample, planEntry);
  }

  const sourceEvidence: SfxCatalogReviewSourceEvidence = {
    version: 'sfx-clap-review-source-v1',
    sourceCandidatePoolSha256: screening.sourceCandidatePoolSha256,
    sourceReceiptSha256: screening.sourceReceiptSha256,
    analysisDigestSha256: screening.analysisDigestSha256,
    model: { ...screening.model },
  };
  const representatives = screening.entries
    .filter((entry) => entry.representative)
    .sort(compareScreeningEntries);
  const seed: SfxCatalogReviewSeed = {
    version: 'sfx-catalog-review-seed-v1',
    requiredRoles: FSD50K_SAMPLEABLE_ROLES.filter((role) =>
      representatives.some((entry) => entry.assignedRole === role),
    ),
    collections: [
      {
        id: COLLECTION_ID,
        provider: 'freesound',
        licenseId: 'cc0-1.0',
        licenseUrl: FSD50K_CC0_LICENSE_URL,
        attributionRequired: false,
        licenseEvidencePath: SAMPLE_REPORT_FILENAME,
      },
    ],
    candidates: representatives.map((entry) => {
      const planEntry = planById.get(entry.sourceId)!;
      const cluster = clusterById.get(entry.clusterId)!;
      return {
        collectionId: COLLECTION_ID,
        sourcePath: entry.audioPath,
        providerAssetId: entry.sourceId,
        metadata: buildMetadata(entry, planEntry),
        reviewEvidence: {
          version: 'sfx-clap-review-candidate-v1',
          evidenceKind: 'ground-truth-role-plus-clap-screening',
          sourceId: entry.sourceId,
          sourceHashSha256: entry.sourceHashSha256,
          assignedRole: entry.assignedRole,
          topRole: entry.topRole,
          topRoleScore: entry.topRoleScore,
          assignedRoleScore: entry.assignedRoleScore,
          assignedRoleRank: entry.assignedRoleRank,
          roleAgreement: entry.roleAgreement,
          semanticRoles: entry.semanticRoles.map((item) => ({
            role: item.role,
            cosineSimilarity: item.cosineSimilarity,
          })),
          nearestNeighbor: entry.nearestNeighbor,
          cluster: {
            clusterId: cluster.clusterId,
            duplicateCandidate: cluster.duplicateCandidate,
            memberSourceIds: [...cluster.memberSourceIds],
            representativeSourceId: cluster.representativeSourceId,
          },
          metadataBasis: 'role-prior-pending-human-approval',
        },
      };
    }),
    sourceEvidence,
  };

  const deferredClusterMembers = screening.clusters.flatMap((cluster) =>
    cluster.memberSourceIds
      .filter((sourceId) => sourceId !== cluster.representativeSourceId)
      .map((sourceId) => ({
        sourceId,
        clusterId: cluster.clusterId,
        representativeSourceId: cluster.representativeSourceId,
        status: 'not-reviewed-not-approved' as const,
      })),
  );
  const receiptWithoutDigest = {
    version: 'editron-fsd50k-representative-review-bridge-v1' as const,
    generatedAt: generatedAt.toISOString(),
    policy: {
      publicationAllowed: false as const,
      productionCatalogMutationAllowed: false as const,
      autoApprovalAllowed: false as const,
      clusterDecisionPropagationAllowed: false as const,
      humanReviewRequired: true as const,
    },
    sourceEvidence,
    counts: {
      acceptedSources: accepted.length,
      clusters: screening.clusters.length,
      queuedRepresentatives: representatives.length,
      deferredClusterMembers: deferredClusterMembers.length,
    },
    deferredClusterMembers,
  };
  return {
    seed,
    receipt: {
      ...receiptWithoutDigest,
      receiptDigestSha256: hashJson(receiptWithoutDigest),
    },
  };
}

export async function prepareFsd50kRepresentativeReview(
  options: PrepareFsd50kRepresentativeReviewOptions,
): Promise<PreparedFsd50kRepresentativeReview> {
  const sampleRoot = path.resolve(options.sampleRoot);
  const outDir = path.resolve(options.outDir);
  const screeningPath = path.resolve(
    options.screeningReportPath ?? path.join(sampleRoot, DEFAULT_SCREENING_FILENAME),
  );
  await assertMissing(outDir);
  const [planBytes, sampleBytes, screeningBytes] = await Promise.all([
    readFile(path.join(sampleRoot, SAMPLE_PLAN_FILENAME)),
    readFile(path.join(sampleRoot, SAMPLE_REPORT_FILENAME)),
    readFile(screeningPath),
  ]);
  const built = buildFsd50kRepresentativeReview({
    samplePlan: parseJson(planBytes, SAMPLE_PLAN_FILENAME),
    sampleReport: parseJson(sampleBytes, SAMPLE_REPORT_FILENAME),
    screeningReport: parseJson(screeningBytes, path.basename(screeningPath)),
    generatedAt: options.now,
  });

  const parent = path.dirname(outDir);
  await mkdir(parent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(parent, `.${path.basename(outDir)}.bridge-`));
  const stagingReview = path.join(stagingRoot, 'review');
  try {
    const review = await prepareSfxCatalogReview({
      sourceRoot: sampleRoot,
      outDir: stagingReview,
      seed: built.seed,
      now: options.now,
    });
    const evidenceDirectory = path.join(stagingReview, 'evidence');
    await mkdir(evidenceDirectory);
    await Promise.all([
      writeFile(path.join(evidenceDirectory, SAMPLE_PLAN_FILENAME), planBytes, {
        flag: 'wx',
      }),
      writeFile(path.join(evidenceDirectory, SAMPLE_REPORT_FILENAME), sampleBytes, { flag: 'wx' }),
      writeFile(path.join(evidenceDirectory, 'clap-screening-report.json'), screeningBytes, {
        flag: 'wx',
      }),
      writeFile(
        path.join(evidenceDirectory, 'representative-review-bridge.json'),
        `${JSON.stringify(built.receipt, null, 2)}\n`,
        { flag: 'wx' },
      ),
    ]);
    await rename(stagingReview, outDir);
    return {
      review: {
        ...review,
        outDir,
        indexPath: path.join(outDir, 'index.html'),
        reportPath: path.join(outDir, 'review.json'),
      },
      receipt: built.receipt,
      evidenceDirectory: path.join(outDir, 'evidence'),
    };
  } catch (error) {
    throw new Fsd50kRepresentativeReviewError(
      'REPRESENTATIVE_REVIEW_PREPARATION_FAILED',
      `Representative review pack could not be prepared: ${errorMessage(error)}`,
      { cause: error },
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

function verifySource(
  entry: ScreeningEntry,
  sample: SampleEntry,
  planEntry: Plan['entries'][number],
): void {
  if (
    entry.assignedRole !== sample.assignedRole ||
    entry.assignedRole !== planEntry.assignedRole ||
    entry.title !== sample.title ||
    entry.title !== planEntry.candidate.title ||
    entry.audioPath !== sample.audioPath ||
    entry.sourceHashSha256 !== sample.measurement.sourceHashSha256 ||
    planEntry.candidate.provenance.providerAssetId !== entry.sourceId ||
    sample.audioRights.evidence.licenseId !== `freesound:${entry.sourceId}:creative-commons-0`
  ) {
    fail(
      'SOURCE_EVIDENCE_MISMATCH',
      `Rights, role, title, path, or hash differs for ${entry.sourceId}`,
    );
  }
  if (!/^audio\/[0-9]+\.wav$/.test(entry.audioPath)) {
    fail('UNSAFE_AUDIO_PATH', `Representative audio path is not canonical: ${entry.audioPath}`);
  }
  const bytes = Buffer.from(entry.embedding.value, 'base64');
  if (bytes.byteLength !== SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT) {
    fail('INVALID_EMBEDDING', `CLAP embedding bytes are invalid for ${entry.sourceId}`);
  }
  const assignedIndex = entry.semanticRoles.findIndex((item) => item.role === entry.assignedRole);
  if (
    assignedIndex + 1 !== entry.assignedRoleRank ||
    entry.semanticRoles[assignedIndex]?.cosineSimilarity !== entry.assignedRoleScore ||
    entry.semanticRoles[0]?.role !== entry.topRole ||
    entry.semanticRoles[0]?.cosineSimilarity !== entry.topRoleScore ||
    entry.roleAgreement !== (entry.topRole === entry.assignedRole)
  ) {
    fail(
      'SEMANTIC_EVIDENCE_MISMATCH',
      `CLAP role ranking is internally inconsistent for ${entry.sourceId}`,
    );
  }
}

function verifySourceReceipt(screening: ScreeningReport, entries: SampleEntry[]): void {
  const digest = createHash('sha256')
    .update(
      [...entries]
        .sort((left, right) => compareSourceIds(left.sourceId, right.sourceId))
        .map(
          (entry) =>
            `${entry.sourceId}:${entry.measurement.sourceHashSha256}:${entry.assignedRole}`,
        )
        .join('\n'),
    )
    .digest('hex');
  if (digest !== screening.sourceReceiptSha256) {
    fail('SOURCE_RECEIPT_MISMATCH', 'CLAP source receipt does not match accepted sample evidence');
  }
}

function verifyScreeningDigest(screening: ScreeningReport): void {
  const digest = hashJson({
    model: screening.model,
    threshold: screening.duplicateSimilarityThreshold,
    entries: screening.entries.map((entry) => ({
      sourceId: entry.sourceId,
      sourceHashSha256: entry.sourceHashSha256,
      embedding: entry.embedding.value,
      semanticRoles: entry.semanticRoles,
      clusterId: entry.clusterId,
      representative: entry.representative,
    })),
    clusters: screening.clusters,
  });
  if (digest !== screening.analysisDigestSha256) {
    fail(
      'ANALYSIS_DIGEST_MISMATCH',
      'CLAP analysis digest does not match its entries and clusters',
    );
  }
}

function verifyScreeningCounts(screening: ScreeningReport): void {
  const duplicateClusters = screening.clusters.filter((cluster) => cluster.duplicateCandidate);
  const representatives = screening.entries.filter((entry) => entry.representative);
  if (
    screening.counts.roleAgreement !==
      screening.entries.filter((entry) => entry.roleAgreement).length ||
    screening.counts.clusters !== screening.clusters.length ||
    screening.counts.duplicateCandidateClusters !== duplicateClusters.length ||
    screening.counts.duplicateCandidateEntries !==
      duplicateClusters.reduce((total, cluster) => total + cluster.memberSourceIds.length, 0) ||
    screening.counts.representatives !== representatives.length
  ) {
    fail('SCREENING_COUNT_MISMATCH', 'CLAP report counters do not match its evidence');
  }
}

function verifyClusters(
  screening: ScreeningReport,
  entriesById: Map<string, ScreeningEntry>,
): Map<string, ScreeningReport['clusters'][number]> {
  const clusters = uniqueMap(screening.clusters, (cluster) => cluster.clusterId, 'CLAP cluster ID');
  const coveredSources = new Set<string>();
  for (const cluster of screening.clusters) {
    if (
      cluster.duplicateCandidate !== cluster.memberSourceIds.length > 1 ||
      cluster.minimumPairwiseSimilarity > cluster.maximumPairwiseSimilarity ||
      !cluster.memberSourceIds.includes(cluster.representativeSourceId)
    ) {
      fail('INVALID_CLUSTER', `CLAP cluster ${cluster.clusterId} is internally inconsistent`);
    }
    for (const sourceId of cluster.memberSourceIds) {
      const entry = entriesById.get(sourceId);
      if (
        !entry ||
        coveredSources.has(sourceId) ||
        entry.clusterId !== cluster.clusterId ||
        entry.representative !== (sourceId === cluster.representativeSourceId)
      ) {
        fail('INVALID_CLUSTER', `CLAP cluster membership is invalid for source ${sourceId}`);
      }
      coveredSources.add(sourceId);
    }
  }
  if (coveredSources.size !== entriesById.size) {
    fail('INVALID_CLUSTER', 'CLAP clusters do not cover every screened source exactly once');
  }
  return clusters;
}

function buildMetadata(
  entry: ScreeningEntry,
  planEntry: Plan['entries'][number],
): SfxCatalogReviewMetadata {
  const roleProfile = ROLE_PROFILES[entry.assignedRole];
  const tags = uniqueStrings([
    entry.assignedRole,
    ...planEntry.candidate.labels.map(normalizeTag),
    ...entry.providerTags.map(normalizeTag),
  ])
    .filter(Boolean)
    .slice(0, 32);
  return {
    title: entry.title,
    eventRoles: [entry.assignedRole],
    tags,
    negativeTags: [],
    ...roleProfile,
  };
}

function profile(
  surfaces: RoleProfile['surfaces'],
  layerRole: RoleProfile['layerRole'],
  energy: number,
  brightness: number,
  weight: number,
  transientSharpness: number,
  material: string,
  motionSpeed: RoleProfile['motionSpeed'],
): RoleProfile {
  return {
    surfaces,
    layerRole,
    energy,
    brightness,
    weight,
    transientSharpness,
    material,
    tailMs: 0,
    loopable: false,
    direction: 'neutral',
    motionSpeed,
  };
}

function compareScreeningEntries(left: ScreeningEntry, right: ScreeningEntry): number {
  return (
    FSD50K_SAMPLEABLE_ROLES.indexOf(left.assignedRole) -
      FSD50K_SAMPLEABLE_ROLES.indexOf(right.assignedRole) ||
    compareSourceIds(left.sourceId, right.sourceId)
  );
}

function compareSourceIds(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right);
}

function uniqueMap<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyFor(value);
    if (result.has(key)) fail('DUPLICATE_EVIDENCE', `Duplicate ${label}: ${key}`);
    result.set(key, value);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', '-').replace(/\s+/g, '-');
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  fail(
    'INVALID_REPRESENTATIVE_EVIDENCE',
    `${label} is invalid: ${parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || label}: ${issue.message}`)
      .join('; ')}`,
  );
}

function parseJson(buffer: Buffer, label: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    fail('INVALID_JSON', `${label} is not valid JSON`);
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS', `Representative review output already exists: ${target}`);
}

function fail(code: string, message: string): never {
  throw new Fsd50kRepresentativeReviewError(code, message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CliArguments {
  sampleRoot: string;
  screeningReportPath?: string;
  outDir: string;
}

function parseCliArguments(argv: string[]): CliArguments {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--(sample-root|screening-report|out-dir)=(.+)$/.exec(argument);
    if (!match || values.has(match[1])) throw cliUsageError();
    values.set(match[1], match[2]);
  }
  const sampleRoot = values.get('sample-root');
  const outDir = values.get('out-dir');
  if (!sampleRoot || !outDir) throw cliUsageError();
  const screeningReportPath = values.get('screening-report');
  return {
    sampleRoot: path.resolve(sampleRoot),
    ...(screeningReportPath ? { screeningReportPath: path.resolve(screeningReportPath) } : {}),
    outDir: path.resolve(outDir),
  };
}

function cliUsageError(): Fsd50kRepresentativeReviewError {
  return new Fsd50kRepresentativeReviewError(
    'INVALID_ARGUMENTS',
    'Usage: npx tsx scripts/prepare-fsd50k-representative-review.ts ' +
      '--sample-root=<conditioned-sample-dir> [--screening-report=<json>] --out-dir=<new-dir>',
  );
}

async function main(): Promise<void> {
  const prepared = await prepareFsd50kRepresentativeReview(
    parseCliArguments(process.argv.slice(2)),
  );
  console.log(
    JSON.stringify(
      {
        queuedRepresentatives: prepared.receipt.counts.queuedRepresentatives,
        deferredClusterMembers: prepared.receipt.counts.deferredClusterMembers,
        indexPath: prepared.review.indexPath,
        policy: prepared.receipt.policy,
        nextGate: 'human-review-before-curation-or-publication',
      },
      null,
      2,
    ),
  );
}

const isMain = Boolean(
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isMain) {
  main().catch((error) => {
    console.error(
      `[SFXRepresentativeReview] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
