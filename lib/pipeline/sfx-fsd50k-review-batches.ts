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

import {
  conditionSfxCatalogAsset,
  type ConditionSfxCatalogAssetResult,
} from '@/lib/pipeline/audio-conditioning';
import {
  SFX_SEMANTIC_ROLE_PROMPTS,
  type SfxSemanticRoleScore,
} from '@/lib/pipeline/sfx-audio-embedding';
import type { SfxAcousticMeasurement } from '@/lib/pipeline/sfx-acoustic-measurement';
import type {
  SfxCatalogEntry,
  SfxCatalogEventRole,
  SfxCatalogSurface,
} from '@/lib/pipeline/sfx-catalog';
import type { Fsd50kCorpusPlan, Fsd50kCorpusPlanEntry } from '@/lib/pipeline/sfx-fsd50k-corpus';
import type {
  Fsd50kEmbeddingCluster,
  Fsd50kEmbeddingIndexEntry,
  Fsd50kEmbeddingIndexReport,
  Fsd50kSemanticRiskScore,
} from '@/lib/pipeline/sfx-fsd50k-embedding-index';
import {
  FSD50K_CC0_LICENSE_URL,
  FSD50K_VERSION,
  FSD50K_ZENODO_RECORD_ID,
} from '@/lib/pipeline/sfx-fsd50k-harvest';
import type {
  Fsd50kEmbeddingQueueEntry,
  Fsd50kInspectionIndex,
} from '@/lib/pipeline/sfx-fsd50k-inspection';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^[0-9]+$/;
const REVIEW_ID_PATTERN = /^sfx_review_[a-f0-9]{20}$/;
const BATCH_ID_PATTERN = /^fsd50k_review_batch_[a-f0-9]{24}$/;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;
const DEFAULT_CONCURRENCY = 2;

export const FSD50K_REVIEW_BATCH_VERSION = 'editron-fsd50k-review-batch-v1' as const;
export const FSD50K_REVIEW_DECISIONS_VERSION =
  'editron-fsd50k-review-decisions-v1' as const;

type CatalogLayerRole = SfxCatalogEntry['layerRole'];
type CatalogDirection = SfxCatalogEntry['direction'];
type CatalogMotionSpeed = SfxCatalogEntry['motionSpeed'];

export interface Fsd50kReviewRoleProfile {
  surfaces: SfxCatalogSurface[];
  layerRole: CatalogLayerRole;
  energy: number;
  brightness: number;
  weight: number;
  transientSharpness: number;
  material: string;
  tailMs: number;
  loopable: boolean;
  direction: CatalogDirection;
  motionSpeed: CatalogMotionSpeed;
}

export const FSD50K_REVIEW_ROLE_PROFILES: Record<
  SfxCatalogEventRole,
  Fsd50kReviewRoleProfile
> = {
  whoosh: profile(['transition', 'motion-graphic'], 'oneshot', 0.58, 0.58, 0.28, 0.55, 'air', 'fast'),
  impact: profile(['transition', 'motion-graphic', 'scene'], 'impact', 0.78, 0.35, 0.82, 0.88, 'physical', 'fast'),
  tick: profile(['motion-graphic', 'ui', 'caption'], 'oneshot', 0.25, 0.68, 0.14, 0.93, 'recorded', 'fast'),
  pop: profile(['motion-graphic', 'ui', 'caption'], 'oneshot', 0.42, 0.58, 0.32, 0.8, 'recorded', 'fast'),
  riser: profile(['transition', 'chapter', 'scene'], 'riser', 0.72, 0.58, 0.46, 0.35, 'mixed', 'medium'),
  'logo-sting': profile(['logo', 'chapter', 'motion-graphic'], 'sting', 0.66, 0.67, 0.5, 0.58, 'musical', 'medium'),
  ambience: profile(['scene', 'chapter'], 'bed', 0.32, 0.45, 0.4, 0.18, 'environmental', 'still'),
  foley: profile(['scene', 'motion-graphic'], 'oneshot', 0.45, 0.45, 0.5, 0.64, 'physical', 'medium'),
  shimmer: profile(['motion-graphic', 'logo', 'transition'], 'oneshot', 0.4, 0.88, 0.12, 0.55, 'tonal', 'medium'),
};

export interface Fsd50kReviewSourceEvidence {
  sourceId: string;
  status: 'accepted-for-embedding' | 'quarantined-metadata';
  labels: string[];
  provisionalEditorialRoles: SfxCatalogEventRole[];
  provisionalRoleEvidence: string[];
  metadataRiskFlags: string[];
}

export interface Fsd50kReviewBatchCandidate {
  reviewId: string;
  candidateDigestSha256: string;
  canonicalSourceId: string;
  sourceAudioPath: string;
  sourceHashSha256: string;
  conditionedAudioPath: string;
  conditionedHashSha256: string;
  gainDb: number;
  sourceInspection: ConditionSfxCatalogAssetResult['source'];
  outputInspection: ConditionSfxCatalogAssetResult['output'];
  acousticMeasurement: SfxAcousticMeasurement;
  title: string;
  tags: string[];
  negativeTags: string[];
  suggestedRole: SfxCatalogEventRole;
  suggestedRoleScore: number;
  semanticRoles: SfxSemanticRoleScore[];
  semanticRisks: Fsd50kSemanticRiskScore[];
  sourceEvidence: Fsd50kReviewSourceEvidence[];
  cluster: {
    clusterId: string;
    duplicateCandidate: boolean;
    canonicalSourceIds: string[];
    allSourceIds: string[];
    representativeCanonicalSourceId: string;
    deferredCanonicalSourceIds: string[];
    deferredSourceIds: string[];
  };
  rights: {
    provider: 'fsd50k';
    upstreamProvider: 'freesound';
    providerAssetId: string;
    datasetVersion: typeof FSD50K_VERSION;
    zenodoRecordId: typeof FSD50K_ZENODO_RECORD_ID;
    licenseId: 'cc0-1.0';
    licenseUrl: typeof FSD50K_CC0_LICENSE_URL;
    attributionRequired: false;
  };
}

export interface Fsd50kReviewBatchReport {
  version: typeof FSD50K_REVIEW_BATCH_VERSION;
  generatedAt: string;
  source: {
    candidatePoolSha256: string;
    inspectionAnalysisDigestSha256: string;
    embeddingAnalysisDigestSha256: string;
  };
  batch: {
    batchId: string;
    batchNumber: number;
    batchSize: number;
    totalBatches: number;
    totalRepresentatives: number;
    firstRepresentativeOffset: number;
  };
  policy: {
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    humanReviewRequired: true;
    explicitPerAssetApprovalRequired: true;
    representativeApprovalPropagatesToClusterMembers: false;
  };
  roleProfiles: typeof FSD50K_REVIEW_ROLE_PROFILES;
  candidates: Fsd50kReviewBatchCandidate[];
  reportDigestSha256: string;
}

export interface PrepareFsd50kReviewBatchOptions {
  corpusPlan: unknown;
  inspectionIndex: unknown;
  embeddingReport: unknown;
  extractionDirectory: string;
  outputDirectory: string;
  batchNumber: number;
  batchSize?: number;
  concurrency?: number;
  generatedAt?: Date;
  conditionAsset?: (buffer: Buffer) => Promise<ConditionSfxCatalogAssetResult>;
}

export interface PreparedFsd50kReviewBatch {
  report: Fsd50kReviewBatchReport;
  outputDirectory: string;
  reportPath: string;
  indexPath: string;
}

interface ValidatedReviewInput {
  plan: Fsd50kCorpusPlan;
  inspection: Fsd50kInspectionIndex;
  embedding: Fsd50kEmbeddingIndexReport;
  representatives: Fsd50kEmbeddingIndexEntry[];
  planBySourceId: Map<string, Fsd50kCorpusPlanEntry>;
  queueByCanonicalSourceId: Map<string, Fsd50kEmbeddingQueueEntry>;
  clusterById: Map<string, Fsd50kEmbeddingCluster>;
}

export class Fsd50kReviewBatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kReviewBatchError';
  }
}

export async function prepareFsd50kReviewBatch(
  options: PrepareFsd50kReviewBatchOptions,
): Promise<PreparedFsd50kReviewBatch> {
  const validated = validateReviewInput(
    options.corpusPlan,
    options.inspectionIndex,
    options.embeddingReport,
  );
  const batchSize = boundedInteger(
    options.batchSize ?? DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
    'batchSize',
  );
  const totalBatches = Math.ceil(validated.representatives.length / batchSize);
  const batchNumber = boundedInteger(options.batchNumber, 1, totalBatches, 'batchNumber');
  const concurrency = boundedInteger(options.concurrency ?? DEFAULT_CONCURRENCY, 1, 8, 'concurrency');
  const generatedAt = options.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    fail('INVALID_REVIEW_CLOCK', 'FSD50K review batch timestamp is invalid');
  }

  const outputDirectory = path.resolve(options.outputDirectory);
  const extractionDirectory = await realpath(path.resolve(options.extractionDirectory));
  await assertMissing(outputDirectory);
  const firstRepresentativeOffset = (batchNumber - 1) * batchSize;
  const selected = validated.representatives.slice(
    firstRepresentativeOffset,
    firstRepresentativeOffset + batchSize,
  );
  const conditionAsset = options.conditionAsset ?? conditionSfxCatalogAsset;
  const prepared = await mapWithConcurrency(selected, concurrency, async (entry) => {
    const queue = required(
      validated.queueByCanonicalSourceId.get(entry.canonicalSourceId),
      'MISSING_ACOUSTIC_EVIDENCE',
      `Representative ${entry.canonicalSourceId} is absent from the P2 embedding queue`,
    );
    const cluster = required(
      validated.clusterById.get(entry.clusterId),
      'MISSING_CLUSTER',
      `Representative ${entry.canonicalSourceId} has no P3 cluster`,
    );
    const planEntry = required(
      validated.planBySourceId.get(entry.canonicalSourceId),
      'MISSING_RIGHTS_EVIDENCE',
      `Representative ${entry.canonicalSourceId} is absent from the CC0 corpus plan`,
    );
    const sourcePath = await resolveVerifiedSourcePath(
      extractionDirectory,
      entry.sourceAudioPath,
    );
    const sourceBuffer = await readFile(sourcePath);
    if (hashBuffer(sourceBuffer) !== entry.sourceHashSha256) {
      fail(
        'SOURCE_HASH_MISMATCH',
        `Representative ${entry.canonicalSourceId} changed after P3 embedding`,
      );
    }

    let conditioned: ConditionSfxCatalogAssetResult;
    try {
      conditioned = await conditionAsset(sourceBuffer);
    } catch (error) {
      throw new Fsd50kReviewBatchError(
        'REVIEW_AUDIO_CONDITIONING_FAILED',
        `Representative ${entry.canonicalSourceId} could not be conditioned for review`,
        { cause: error },
      );
    }
    if (conditioned.output.clippingRisk) {
      fail(
        'CONDITIONED_AUDIO_CLIPS',
        `Representative ${entry.canonicalSourceId} still clips after conditioning`,
      );
    }

    const reviewId = `sfx_review_${entry.sourceHashSha256.slice(0, 20)}`;
    const candidateWithoutDigest = buildCandidateWithoutDigest(
      entry,
      cluster,
      queue,
      planEntry,
      conditioned,
      reviewId,
    );
    return {
      candidate: {
        ...candidateWithoutDigest,
        candidateDigestSha256: hashJson(candidateWithoutDigest),
      },
      buffer: conditioned.buffer,
    };
  });
  const candidateIds = prepared.map(item => item.candidate.canonicalSourceId);
  const batchId = `fsd50k_review_batch_${hashJson({
    embeddingAnalysisDigestSha256: validated.embedding.analysisDigestSha256,
    batchSize,
    batchNumber,
    candidateIds,
  }).slice(0, 24)}`;
  const reportWithoutDigest = {
    version: FSD50K_REVIEW_BATCH_VERSION,
    generatedAt: generatedAt.toISOString(),
    source: {
      candidatePoolSha256: validated.plan.candidatePoolSha256,
      inspectionAnalysisDigestSha256: validated.inspection.analysisDigestSha256,
      embeddingAnalysisDigestSha256: validated.embedding.analysisDigestSha256,
    },
    batch: {
      batchId,
      batchNumber,
      batchSize,
      totalBatches,
      totalRepresentatives: validated.representatives.length,
      firstRepresentativeOffset,
    },
    policy: {
      publicationAllowed: false as const,
      productionCatalogMutationAllowed: false as const,
      humanReviewRequired: true as const,
      explicitPerAssetApprovalRequired: true as const,
      representativeApprovalPropagatesToClusterMembers: false as const,
    },
    roleProfiles: FSD50K_REVIEW_ROLE_PROFILES,
    candidates: prepared.map(item => item.candidate),
  };
  const report: Fsd50kReviewBatchReport = {
    ...reportWithoutDigest,
    reportDigestSha256: hashJson(reportWithoutDigest),
  };
  await writeReviewBatch(outputDirectory, report, prepared);
  return {
    report,
    outputDirectory,
    reportPath: path.join(outputDirectory, 'review-batch.json'),
    indexPath: path.join(outputDirectory, 'index.html'),
  };
}

export function validateFsd50kReviewBatchReport(value: unknown): Fsd50kReviewBatchReport {
  if (!isRecord(value) || value.version !== FSD50K_REVIEW_BATCH_VERSION) {
    fail('INVALID_REVIEW_BATCH', 'Expected an editron-fsd50k-review-batch-v1 report');
  }
  const report = value as unknown as Fsd50kReviewBatchReport;
  if (
    !isRecord(report.source)
    || !isRecord(report.batch)
    || !isRecord(report.policy)
    || !Array.isArray(report.candidates)
    || !SHA256_PATTERN.test(report.reportDigestSha256)
    || !SHA256_PATTERN.test(report.source.candidatePoolSha256)
    || !SHA256_PATTERN.test(report.source.inspectionAnalysisDigestSha256)
    || !SHA256_PATTERN.test(report.source.embeddingAnalysisDigestSha256)
    || !BATCH_ID_PATTERN.test(report.batch.batchId)
    || hashJson(report.roleProfiles) !== hashJson(FSD50K_REVIEW_ROLE_PROFILES)
  ) {
    fail('INVALID_REVIEW_BATCH', 'FSD50K review batch is structurally incomplete');
  }
  const { reportDigestSha256, ...payload } = report;
  if (hashJson(payload) !== reportDigestSha256) {
    fail('REVIEW_BATCH_DIGEST_MISMATCH', 'FSD50K review batch evidence was modified');
  }
  if (
    report.policy.publicationAllowed
    || report.policy.productionCatalogMutationAllowed
    || !report.policy.humanReviewRequired
    || !report.policy.explicitPerAssetApprovalRequired
    || report.policy.representativeApprovalPropagatesToClusterMembers
  ) {
    fail('INVALID_REVIEW_POLICY', 'FSD50K review batch weakens the locked approval policy');
  }
  const reviewIds = new Set<string>();
  const canonicalIds = new Set<string>();
  for (const candidate of report.candidates) {
    if (
      !isRecord(candidate)
      || !isRecord(candidate.cluster)
      || !isRecord(candidate.rights)
      || !REVIEW_ID_PATTERN.test(candidate.reviewId)
      || !SOURCE_ID_PATTERN.test(candidate.canonicalSourceId)
      || !SHA256_PATTERN.test(candidate.candidateDigestSha256)
      || !SHA256_PATTERN.test(candidate.sourceHashSha256)
      || !SHA256_PATTERN.test(candidate.conditionedHashSha256)
      || candidate.conditionedAudioPath !== `audio/${candidate.reviewId}.wav`
      || (
        candidate.sourceAudioPath !==
          `FSD50K.dev_audio/${candidate.canonicalSourceId}.wav`
        && candidate.sourceAudioPath !==
          `FSD50K.eval_audio/${candidate.canonicalSourceId}.wav`
      )
      || !Array.isArray(candidate.cluster.canonicalSourceIds)
      || !Array.isArray(candidate.cluster.allSourceIds)
      || !Array.isArray(candidate.cluster.deferredCanonicalSourceIds)
      || !Array.isArray(candidate.cluster.deferredSourceIds)
      || reviewIds.has(candidate.reviewId)
      || canonicalIds.has(candidate.canonicalSourceId)
      || candidate.cluster.representativeCanonicalSourceId !== candidate.canonicalSourceId
      || candidate.cluster.deferredCanonicalSourceIds.includes(candidate.canonicalSourceId)
      || candidate.cluster.deferredSourceIds.includes(candidate.canonicalSourceId)
      || candidate.rights.provider !== 'fsd50k'
      || candidate.rights.upstreamProvider !== 'freesound'
      || candidate.rights.providerAssetId !== candidate.canonicalSourceId
      || candidate.rights.licenseId !== 'cc0-1.0'
      || candidate.rights.licenseUrl !== FSD50K_CC0_LICENSE_URL
      || candidate.rights.attributionRequired
    ) {
      fail('INVALID_REVIEW_CANDIDATE', 'FSD50K review candidate evidence is inconsistent');
    }
    const { candidateDigestSha256, ...candidatePayload } = candidate;
    if (hashJson(candidatePayload) !== candidateDigestSha256) {
      fail(
        'REVIEW_CANDIDATE_DIGEST_MISMATCH',
        `FSD50K candidate ${candidate.reviewId} was modified`,
      );
    }
    reviewIds.add(candidate.reviewId);
    canonicalIds.add(candidate.canonicalSourceId);
  }
  return report;
}

export function buildFsd50kApprovedCuration(
  candidate: Fsd50kReviewBatchCandidate,
  selectedRole: SfxCatalogEventRole,
): Pick<
  SfxCatalogEntry,
  | 'title'
  | 'eventRoles'
  | 'surfaces'
  | 'layerRole'
  | 'tags'
  | 'negativeTags'
  | 'energy'
  | 'brightness'
  | 'weight'
  | 'transientSharpness'
  | 'material'
  | 'tailMs'
  | 'loopable'
  | 'direction'
  | 'motionSpeed'
> {
  const roleProfile = FSD50K_REVIEW_ROLE_PROFILES[selectedRole];
  if (!roleProfile) {
    fail('INVALID_SELECTED_ROLE', `Unsupported FSD50K review role: ${selectedRole}`);
  }
  return {
    title: candidate.title,
    eventRoles: [selectedRole],
    tags: uniqueStrings([selectedRole, ...candidate.tags]),
    // Human listening supersedes untrusted uploader text, not ground-truth risk labels.
    negativeTags: candidate.negativeTags.filter(
      tag => !tag.startsWith('uploader-metadata-'),
    ),
    ...roleProfile,
  };
}

function validateReviewInput(
  planValue: unknown,
  inspectionValue: unknown,
  embeddingValue: unknown,
): ValidatedReviewInput {
  if (
    !isRecord(planValue)
    || planValue.version !== 'editron-fsd50k-corpus-plan-v1'
    || !Array.isArray(planValue.entries)
    || typeof planValue.candidatePoolSha256 !== 'string'
    || hashJson(planValue.entries) !== planValue.candidatePoolSha256
  ) {
    fail('INVALID_CORPUS_PLAN', 'FSD50K corpus plan or candidate-pool digest is invalid');
  }
  if (
    !isRecord(inspectionValue)
    || inspectionValue.version !== 'editron-fsd50k-inspection-index-v1'
    || !Array.isArray(inspectionValue.embeddingQueue)
    || !Array.isArray(inspectionValue.entries)
  ) {
    fail('INVALID_INSPECTION_INDEX', 'Expected a complete P2 FSD50K inspection index');
  }
  if (
    !isRecord(embeddingValue)
    || embeddingValue.version !== 'editron-fsd50k-clap-ann-v1'
    || !Array.isArray(embeddingValue.entries)
    || !Array.isArray(embeddingValue.clusters)
  ) {
    fail('INVALID_EMBEDDING_REPORT', 'Expected a complete P3 FSD50K embedding report');
  }
  const plan = planValue as unknown as Fsd50kCorpusPlan;
  const inspection = inspectionValue as unknown as Fsd50kInspectionIndex;
  const embedding = embeddingValue as unknown as Fsd50kEmbeddingIndexReport;
  verifyInspectionDigest(inspection);
  verifyEmbeddingDigest(embedding);
  if (
    inspection.selection.mode !== 'full-corpus'
    || embedding.selection.mode !== 'full-embedding-queue'
  ) {
    fail('INCOMPLETE_CORPUS', 'Production review requires complete P2 and P3 corpus receipts');
  }
  if (
    inspection.source.candidatePoolSha256 !== plan.candidatePoolSha256
    || embedding.source.candidatePoolSha256 !== plan.candidatePoolSha256
    || embedding.source.inspectionAnalysisDigestSha256 !== inspection.analysisDigestSha256
  ) {
    fail('SOURCE_RECEIPT_MISMATCH', 'P2, P3, and corpus source receipts do not reconcile');
  }
  if (
    embedding.policy.publicationAllowed
    || embedding.policy.productionCatalogMutationAllowed
    || !embedding.policy.humanReviewRequired
    || embedding.policy.representativeApprovalPropagatesToClusterMembers
  ) {
    fail('INVALID_EMBEDDING_POLICY', 'P3 report weakens the locked human-review policy');
  }

  const planBySourceId = uniqueMap(plan.entries, entry => entry.sourceId, 'corpus source ID');
  const queueByCanonicalSourceId = uniqueMap(
    inspection.embeddingQueue,
    entry => entry.canonicalSourceId,
    'P2 canonical source ID',
  );
  const clusterById = uniqueMap(embedding.clusters, cluster => cluster.clusterId, 'P3 cluster ID');
  const entriesByCanonicalId = uniqueMap(
    embedding.entries,
    entry => entry.canonicalSourceId,
    'P3 canonical source ID',
  );
  for (const entry of embedding.entries) {
    const queue = required(
      queueByCanonicalSourceId.get(entry.canonicalSourceId),
      'MISSING_ACOUSTIC_EVIDENCE',
      `P3 entry ${entry.canonicalSourceId} has no P2 acoustic evidence`,
    );
    if (
      queue.sourceHashSha256 !== entry.sourceHashSha256
      || queue.sourceAudioPath !== entry.sourceAudioPath
      || hashJson(queue.memberSourceIds) !== hashJson(entry.memberSourceIds)
    ) {
      fail('SOURCE_RECEIPT_MISMATCH', `P2/P3 source evidence differs for ${entry.canonicalSourceId}`);
    }
  }
  for (const cluster of embedding.clusters) {
    if (
      !cluster.canonicalSourceIds.includes(cluster.representativeCanonicalSourceId)
      || cluster.duplicateCandidate !== (cluster.canonicalSourceIds.length > 1)
    ) {
      fail('INVALID_CLUSTER', `P3 cluster ${cluster.clusterId} is internally inconsistent`);
    }
    for (const canonicalSourceId of cluster.canonicalSourceIds) {
      const entry = required(
        entriesByCanonicalId.get(canonicalSourceId),
        'INVALID_CLUSTER',
        `P3 cluster ${cluster.clusterId} references unknown ${canonicalSourceId}`,
      );
      if (
        entry.clusterId !== cluster.clusterId
        || entry.representative !== (canonicalSourceId === cluster.representativeCanonicalSourceId)
      ) {
        fail('INVALID_CLUSTER', `P3 cluster ownership differs for ${canonicalSourceId}`);
      }
    }
    for (const sourceId of cluster.allSourceIds) {
      assertCc0PlanEntry(
        required(
          planBySourceId.get(sourceId),
          'MISSING_RIGHTS_EVIDENCE',
          `P3 cluster source ${sourceId} is absent from the corpus plan`,
        ),
      );
    }
  }
  const representatives = embedding.entries
    .filter(entry => entry.representative)
    .sort(compareReviewEntries);
  if (
    representatives.length !== embedding.counts.representatives
    || representatives.length !== embedding.clusters.length
  ) {
    fail('REPRESENTATIVE_COUNT_MISMATCH', 'P3 representative counters do not reconcile');
  }
  representatives.forEach(entry => {
    assertCc0PlanEntry(
      required(
        planBySourceId.get(entry.canonicalSourceId),
        'MISSING_RIGHTS_EVIDENCE',
        `Representative ${entry.canonicalSourceId} has no corpus rights record`,
      ),
    );
    if (
      entry.sourceEvidence.some(source => (
        source.status !== 'accepted-for-embedding'
        && source.status !== 'quarantined-metadata'
      ))
    ) {
      fail(
        'INVALID_REPRESENTATIVE_STATUS',
        `Representative ${entry.canonicalSourceId} contains a rejected source`,
      );
    }
  });
  return {
    plan,
    inspection,
    embedding,
    representatives,
    planBySourceId,
    queueByCanonicalSourceId,
    clusterById,
  };
}

function buildCandidateWithoutDigest(
  entry: Fsd50kEmbeddingIndexEntry,
  cluster: Fsd50kEmbeddingCluster,
  queue: Fsd50kEmbeddingQueueEntry,
  planEntry: Fsd50kCorpusPlanEntry,
  conditioned: ConditionSfxCatalogAssetResult,
  reviewId: string,
): Omit<Fsd50kReviewBatchCandidate, 'candidateDigestSha256'> {
  const sourceEvidence = entry.sourceEvidence as Fsd50kReviewSourceEvidence[];
  const labels = sourceEvidence.flatMap(source => source.labels);
  const riskFlags = sourceEvidence.flatMap(source => source.metadataRiskFlags);
  return {
    reviewId,
    canonicalSourceId: entry.canonicalSourceId,
    sourceAudioPath: entry.sourceAudioPath,
    sourceHashSha256: entry.sourceHashSha256,
    conditionedAudioPath: `audio/${reviewId}.wav`,
    conditionedHashSha256: hashBuffer(conditioned.buffer),
    gainDb: conditioned.gainDb,
    sourceInspection: conditioned.source,
    outputInspection: conditioned.output,
    acousticMeasurement: queue.measurement,
    title: planEntry.title.trim() || `FSD50K ${entry.canonicalSourceId}`,
    tags: uniqueStrings([entry.topRole, ...labels.map(normalizeTag)]).filter(Boolean).slice(0, 32),
    negativeTags: uniqueStrings(riskFlags.map(normalizeTag)).filter(Boolean).slice(0, 16),
    suggestedRole: entry.topRole,
    suggestedRoleScore: entry.topRoleScore,
    semanticRoles: entry.semanticRoles,
    semanticRisks: entry.semanticRisks,
    sourceEvidence,
    cluster: {
      clusterId: cluster.clusterId,
      duplicateCandidate: cluster.duplicateCandidate,
      canonicalSourceIds: [...cluster.canonicalSourceIds],
      allSourceIds: [...cluster.allSourceIds],
      representativeCanonicalSourceId: cluster.representativeCanonicalSourceId,
      deferredCanonicalSourceIds: cluster.canonicalSourceIds.filter(
        sourceId => sourceId !== entry.canonicalSourceId,
      ),
      deferredSourceIds: cluster.allSourceIds.filter(
        sourceId => sourceId !== entry.canonicalSourceId,
      ),
    },
    rights: {
      provider: 'fsd50k',
      upstreamProvider: 'freesound',
      providerAssetId: entry.canonicalSourceId,
      datasetVersion: FSD50K_VERSION,
      zenodoRecordId: FSD50K_ZENODO_RECORD_ID,
      licenseId: 'cc0-1.0',
      licenseUrl: FSD50K_CC0_LICENSE_URL,
      attributionRequired: false,
    },
  };
}

async function writeReviewBatch(
  outputDirectory: string,
  report: Fsd50kReviewBatchReport,
  prepared: Array<{ candidate: Fsd50kReviewBatchCandidate; buffer: Buffer }>,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    await mkdir(path.join(staging, 'audio'));
    await Promise.all([
      writeFile(path.join(staging, 'review-batch.json'), `${JSON.stringify(report, null, 2)}\n`, {
        flag: 'wx',
      }),
      writeFile(path.join(staging, 'index.html'), buildReviewHtml(report), { flag: 'wx' }),
      ...prepared.map(item => writeFile(
        path.join(staging, item.candidate.conditionedAudioPath),
        item.buffer,
        { flag: 'wx' },
      )),
    ]);
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function buildReviewHtml(report: Fsd50kReviewBatchReport): string {
  const data = JSON.stringify(report).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Editron FSD50K Review</title><style>
body{margin:0;background:#111;color:#eee;font:14px system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:24px}
header{position:sticky;top:0;background:#111;padding:12px 0;border-bottom:1px solid #444;z-index:2}
h1{font-size:20px;margin:0 0 8px}.meta,.evidence{color:#aaa}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
input,select,button{background:#1d1d1d;color:#eee;border:1px solid #555;padding:8px}button{cursor:pointer}
article{display:grid;grid-template-columns:2fr 1fr 1.3fr;gap:16px;padding:16px 0;border-bottom:1px solid #333}
.title{font-weight:700}.tags{margin-top:8px}.tag{display:inline-block;border:1px solid #555;padding:2px 5px;margin:2px}
.decision button[data-active=true]{border-color:#eabf52}.decision button[data-value=approved][data-active=true]{color:#71dc91}
.decision button[data-value=rejected][data-active=true]{color:#ff7d7d}audio{width:100%}.note{width:100%;box-sizing:border-box}
@media(max-width:800px){article{grid-template-columns:1fr}}
</style></head><body><main><header><h1>FSD50K representative review</h1>
<div class="meta">Batch ${report.batch.batchNumber}/${report.batch.totalBatches} / ${report.batch.batchId} / no cluster approval inheritance</div>
<div class="controls"><label>Reviewer <input id="reviewer" autocomplete="off"></label>
<span id="counts"></span><button id="export">Export decision receipt</button><span id="message"></span></div></header>
<section id="list"></section></main><script type="application/json" id="data">${data}</script><script>
const report=JSON.parse(document.getElementById('data').textContent);
const key='editron-fsd50k-review:'+report.reportDigestSha256;
const saved=JSON.parse(localStorage.getItem(key)||'{}');const decisions=saved.decisions||{};
const reviewer=document.getElementById('reviewer');reviewer.value=saved.reviewer||'';
const roles=Object.keys(report.roleProfiles);const rows=[];
function persist(){localStorage.setItem(key,JSON.stringify({reviewer:reviewer.value.trim(),decisions}))}
function refresh(){const counts={approved:0,rejected:0,pending:0};for(const row of rows){const d=decisions[row.c.reviewId];counts[d.status]++;row.buttons.forEach(b=>b.dataset.active=String(b.dataset.value===d.status))}
document.getElementById('counts').textContent=counts.approved+' approved / '+counts.rejected+' rejected / '+counts.pending+' pending'}
for(const c of report.candidates){decisions[c.reviewId]||={status:'pending',selectedRole:c.suggestedRole,note:''};
const a=document.createElement('article');const info=document.createElement('div');const title=document.createElement('div');title.className='title';title.textContent=c.title;
const ev=document.createElement('div');ev.className='evidence';ev.textContent='source '+c.canonicalSourceId+' / cluster '+c.cluster.canonicalSourceIds.length+' canonical / '+c.cluster.allSourceIds.length+' source IDs / top '+c.suggestedRole+' '+c.suggestedRoleScore.toFixed(3);
const tags=document.createElement('div');tags.className='tags';[...new Set(c.tags.slice(0,10))].forEach(v=>{const t=document.createElement('span');t.className='tag';t.textContent=v;tags.append(t)});info.append(title,ev,tags);
const audition=document.createElement('div');const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=c.conditionedAudioPath;const metrics=document.createElement('div');metrics.className='evidence';metrics.textContent=Math.round(c.outputInspection.durationMs)+'ms / '+c.outputInspection.truePeakDbtp.toFixed(1)+' dBTP';audition.append(audio,metrics);
const review=document.createElement('div');const select=document.createElement('select');roles.forEach(role=>{const o=document.createElement('option');o.value=role;o.textContent=role;select.append(o)});select.value=decisions[c.reviewId].selectedRole;select.onchange=()=>{decisions[c.reviewId].selectedRole=select.value;persist()};
const dc=document.createElement('div');dc.className='decision';const buttons=['approved','rejected','pending'].map(value=>{const b=document.createElement('button');b.type='button';b.dataset.value=value;b.textContent=value;b.onclick=()=>{decisions[c.reviewId].status=value;persist();refresh()};dc.append(b);return b});
const note=document.createElement('input');note.className='note';note.placeholder='Review note';note.value=decisions[c.reviewId].note;note.oninput=()=>{decisions[c.reviewId].note=note.value;persist()};review.append(select,dc,note);a.append(info,audition,review);document.getElementById('list').append(a);rows.push({c,buttons})}
reviewer.oninput=persist;document.addEventListener('play',e=>{if(!(e.target instanceof HTMLAudioElement))return;document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true);
document.getElementById('export').onclick=()=>{const id=reviewer.value.trim();if(!id){document.getElementById('message').textContent='Reviewer ID required';reviewer.focus();return}
const value={version:'${FSD50K_REVIEW_DECISIONS_VERSION}',batchId:report.batch.batchId,reviewReportDigestSha256:report.reportDigestSha256,reviewerId:id,reviewedAt:new Date().toISOString(),decisions:report.candidates.map(c=>({reviewId:c.reviewId,candidateDigestSha256:c.candidateDigestSha256,status:decisions[c.reviewId].status,selectedRole:decisions[c.reviewId].selectedRole,note:decisions[c.reviewId].note.trim()}))};
const blob=new Blob([JSON.stringify(value,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='fsd50k-review-decisions-'+report.batch.batchNumber+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};refresh();
</script></body></html>`;
}

function verifyInspectionDigest(index: Fsd50kInspectionIndex): void {
  if (!SHA256_PATTERN.test(index.analysisDigestSha256)) {
    fail('INVALID_INSPECTION_INDEX', 'P2 inspection digest is missing');
  }
  const { analysisDigestSha256, completedAt: _completedAt, ...payload } = index;
  if (hashJson(payload) !== analysisDigestSha256) {
    fail('INSPECTION_DIGEST_MISMATCH', 'P2 inspection index was modified');
  }
}

function verifyEmbeddingDigest(report: Fsd50kEmbeddingIndexReport): void {
  if (!SHA256_PATTERN.test(report.analysisDigestSha256)) {
    fail('INVALID_EMBEDDING_REPORT', 'P3 embedding digest is missing');
  }
  const { analysisDigestSha256, completedAt: _completedAt, ...payload } = report;
  if (hashJson(payload) !== analysisDigestSha256) {
    fail('EMBEDDING_DIGEST_MISMATCH', 'P3 embedding report was modified');
  }
}

function assertCc0PlanEntry(entry: Fsd50kCorpusPlanEntry): void {
  if (
    entry.provenance.provider !== 'fsd50k'
    || entry.provenance.upstreamProvider !== 'freesound'
    || entry.provenance.providerAssetId !== entry.sourceId
    || entry.provenance.datasetVersion !== FSD50K_VERSION
    || entry.provenance.zenodoRecordId !== FSD50K_ZENODO_RECORD_ID
    || entry.provenance.clipLicenseId !== 'cc0-1.0'
    || entry.provenance.clipLicenseUrl !== FSD50K_CC0_LICENSE_URL
    || entry.provenance.clipAttributionRequired
  ) {
    fail('INVALID_RIGHTS_EVIDENCE', `FSD50K source ${entry.sourceId} is not verified CC0`);
  }
}

function profile(
  surfaces: SfxCatalogSurface[],
  layerRole: CatalogLayerRole,
  energy: number,
  brightness: number,
  weight: number,
  transientSharpness: number,
  material: string,
  motionSpeed: CatalogMotionSpeed,
): Fsd50kReviewRoleProfile {
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

function compareReviewEntries(
  left: Fsd50kEmbeddingIndexEntry,
  right: Fsd50kEmbeddingIndexEntry,
): number {
  return (
    SFX_SEMANTIC_ROLE_PROMPTS.findIndex(item => item.role === left.topRole)
      - SFX_SEMANTIC_ROLE_PROMPTS.findIndex(item => item.role === right.topRole)
    || compareSourceIds(left.canonicalSourceId, right.canonicalSourceId)
  );
}

function compareSourceIds(left: string, right: string): number {
  return Number(left) - Number(right) || left.localeCompare(right);
}

async function resolveVerifiedSourcePath(
  root: string,
  relativePath: string,
): Promise<string> {
  const resolved = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('UNSAFE_SOURCE_PATH', `FSD50K source path escapes extraction root: ${relativePath}`);
  }
  const details = await lstat(resolved);
  if (!details.isFile()) {
    fail('INVALID_SOURCE_FILE', `FSD50K review source is not a regular file: ${relativePath}`);
  }
  const canonical = await realpath(resolved);
  const canonicalRelative = path.relative(root, canonical);
  if (
    !canonicalRelative
    || canonicalRelative.startsWith('..')
    || path.isAbsolute(canonicalRelative)
  ) {
    fail('UNSAFE_SOURCE_PATH', `FSD50K source resolves outside extraction root: ${relativePath}`);
  }
  return canonical;
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

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
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
  fail('OUTPUT_EXISTS', `FSD50K review output already exists: ${target}`);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(values[index]);
    }
  }));
  return output;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('INVALID_REVIEW_OPTION', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function required<T>(value: T | undefined, code: string, message: string): T {
  if (value === undefined) fail(code, message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new Fsd50kReviewBatchError(code, message);
}
