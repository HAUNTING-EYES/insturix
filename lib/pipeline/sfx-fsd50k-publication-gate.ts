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

import {
  inspectEncodedSfxAudio,
  type EncodedSfxInspection,
} from '@/lib/pipeline/audio-conditioning';
import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEventRole,
  type SfxCatalogSemanticEvidence,
} from '@/lib/pipeline/sfx-catalog';
import {
  buildFsd50kApprovedCuration,
  FSD50K_REVIEW_DECISIONS_VERSION,
  validateFsd50kReviewBatchReport,
  type Fsd50kReviewBatchCandidate,
  type Fsd50kReviewBatchReport,
} from '@/lib/pipeline/sfx-fsd50k-review-batches';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVIEW_STATUSES = new Set(['approved', 'rejected', 'pending']);
const EVENT_ROLES = new Set<SfxCatalogEventRole>([
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

export const FSD50K_PUBLICATION_GATE_VERSION =
  'editron-fsd50k-publication-gate-v2' as const;

export interface Fsd50kReviewDecision {
  reviewId: string;
  candidateDigestSha256: string;
  status: 'approved' | 'rejected' | 'pending';
  selectedRole: SfxCatalogEventRole;
  note: string;
}

export interface Fsd50kReviewDecisionReceipt {
  version: typeof FSD50K_REVIEW_DECISIONS_VERSION;
  batchId: string;
  reviewReportDigestSha256: string;
  reviewerId: string;
  reviewedAt: string;
  decisions: Fsd50kReviewDecision[];
}

type CurationMetadata = ReturnType<typeof buildFsd50kApprovedCuration>;

export interface Fsd50kGatedCurationAsset extends CurationMetadata {
  sourcePath: string;
  semanticEvidence: SfxCatalogSemanticEvidence;
  provenance: {
    provider: 'fsd50k';
    providerAssetId: string;
    licenseId: 'cc0-1.0';
    licenseUrl: string;
    attributionRequired: false;
  };
  approval: {
    status: 'approved';
    reviewerId: string;
    reviewedAt: string;
  };
}

export interface Fsd50kGatedCurationSpec {
  version: 'sfx-catalog-curation-spec-v1';
  assets: Fsd50kGatedCurationAsset[];
}

export interface Fsd50kPublicationGateReceipt {
  version: typeof FSD50K_PUBLICATION_GATE_VERSION;
  gatedAt: string;
  source: {
    batchId: string;
    reviewReportDigestSha256: string;
    decisionReceiptDigestSha256: string;
    candidatePoolSha256: string;
    inspectionAnalysisDigestSha256: string;
    embeddingAnalysisDigestSha256: string;
    curationSpecDigestSha256: string;
  };
  policy: {
    explicitPerAssetApprovalRequired: true;
    representativeApprovalPropagatesToClusterMembers: false;
    rightsValidationRequired: true;
    acousticReinspectionRequired: true;
    manifestMutationPerformed: false;
  };
  counts: {
    candidates: number;
    approved: number;
    rejected: number;
    pending: number;
    deferredCanonicalClusterMembers: number;
    deferredSourceIds: number;
  };
  approved: Array<{
    reviewId: string;
    canonicalSourceId: string;
    candidateDigestSha256: string;
    conditionedHashSha256: string;
    selectedRole: SfxCatalogEventRole;
    stagedAudioPath: string;
  }>;
  receiptDigestSha256: string;
}

export interface GateFsd50kPublicationOptions {
  reviewDirectory: string;
  decisionReceipt: unknown;
  outputDirectory: string;
  gatedAt?: Date;
  inspectAudio?: (buffer: Buffer) => Promise<EncodedSfxInspection>;
}

export interface GatedFsd50kPublication {
  curationSpec: Fsd50kGatedCurationSpec;
  receipt: Fsd50kPublicationGateReceipt;
  outputDirectory: string;
  curationSpecPath: string;
  receiptPath: string;
}

export class Fsd50kPublicationGateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kPublicationGateError';
  }
}

export async function gateFsd50kPublication(
  options: GateFsd50kPublicationOptions,
): Promise<GatedFsd50kPublication> {
  const reviewDirectory = path.resolve(options.reviewDirectory);
  const report = validateFsd50kReviewBatchReport(
    JSON.parse(await readFile(path.join(reviewDirectory, 'review-batch.json'), 'utf8')),
  );
  const decisions = validateDecisionReceipt(options.decisionReceipt, report);
  const outputDirectory = path.resolve(options.outputDirectory);
  const gatedAt = options.gatedAt ?? new Date();
  if (Number.isNaN(gatedAt.getTime())) {
    fail('INVALID_GATE_CLOCK', 'FSD50K publication gate timestamp is invalid');
  }
  await assertMissing(outputDirectory);
  const inspectAudio = options.inspectAudio ?? inspectEncodedSfxAudio;
  const candidateByReviewId = new Map(
    report.candidates.map(candidate => [candidate.reviewId, candidate]),
  );
  const approvedDecisions = decisions.decisions.filter(decision => decision.status === 'approved');
  if (approvedDecisions.length === 0) {
    fail('NO_APPROVED_ASSETS', 'Publication gate requires at least one explicitly approved asset');
  }

  const approved = await Promise.all(approvedDecisions.map(async decision => {
    const candidate = candidateByReviewId.get(decision.reviewId)!;
    assertCandidateRights(candidate);
    const sourcePath = resolveInsideRoot(reviewDirectory, candidate.conditionedAudioPath);
    const buffer = await readFile(sourcePath);
    if (hashBuffer(buffer) !== candidate.conditionedHashSha256) {
      fail(
        'REVIEW_AUDIO_HASH_MISMATCH',
        `Reviewed audio changed for ${candidate.canonicalSourceId}`,
      );
    }
    let inspection: EncodedSfxInspection;
    try {
      inspection = await inspectAudio(buffer);
    } catch (error) {
      throw new Fsd50kPublicationGateError(
        'APPROVED_AUDIO_REINSPECTION_FAILED',
        `Approved audio failed reinspection for ${candidate.canonicalSourceId}`,
        { cause: error },
      );
    }
    assertInspectionMatches(candidate, inspection);
    const stagedAudioPath = `audio/${candidate.reviewId}.wav`;
    return {
      buffer,
      curation: {
        sourcePath: stagedAudioPath,
        ...buildFsd50kApprovedCuration(candidate, decision.selectedRole),
        semanticEvidence: buildCatalogSemanticEvidence(
          candidate,
          decision.selectedRole,
          report.source.embeddingAnalysisDigestSha256,
        ),
        provenance: {
          provider: 'fsd50k' as const,
          providerAssetId: candidate.canonicalSourceId,
          licenseId: 'cc0-1.0' as const,
          licenseUrl: candidate.rights.licenseUrl,
          attributionRequired: false as const,
        },
        approval: {
          status: 'approved' as const,
          reviewerId: decisions.reviewerId,
          reviewedAt: decisions.reviewedAt,
        },
      },
      receipt: {
        reviewId: candidate.reviewId,
        canonicalSourceId: candidate.canonicalSourceId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        conditionedHashSha256: candidate.conditionedHashSha256,
        selectedRole: decision.selectedRole,
        stagedAudioPath,
      },
    };
  }));
  const curationSpec: Fsd50kGatedCurationSpec = {
    version: 'sfx-catalog-curation-spec-v1',
    assets: approved.map(item => item.curation),
  };
  const counts = countDecisions(decisions, report);
  const receiptWithoutDigest = {
    version: FSD50K_PUBLICATION_GATE_VERSION,
    gatedAt: gatedAt.toISOString(),
    source: {
      batchId: report.batch.batchId,
      reviewReportDigestSha256: report.reportDigestSha256,
      decisionReceiptDigestSha256: hashJson(decisions),
      candidatePoolSha256: report.source.candidatePoolSha256,
      inspectionAnalysisDigestSha256: report.source.inspectionAnalysisDigestSha256,
      embeddingAnalysisDigestSha256: report.source.embeddingAnalysisDigestSha256,
      curationSpecDigestSha256: hashJson(curationSpec),
    },
    policy: {
      explicitPerAssetApprovalRequired: true as const,
      representativeApprovalPropagatesToClusterMembers: false as const,
      rightsValidationRequired: true as const,
      acousticReinspectionRequired: true as const,
      manifestMutationPerformed: false as const,
    },
    counts,
    approved: approved.map(item => item.receipt),
  };
  const receipt: Fsd50kPublicationGateReceipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  await writeGateOutput(outputDirectory, curationSpec, receipt, approved);
  return {
    curationSpec,
    receipt,
    outputDirectory,
    curationSpecPath: path.join(outputDirectory, 'curation-spec.json'),
    receiptPath: path.join(outputDirectory, 'publication-gate-receipt.json'),
  };
}

export function validateDecisionReceipt(
  value: unknown,
  report: Fsd50kReviewBatchReport,
): Fsd50kReviewDecisionReceipt {
  if (
    !isRecord(value)
    || value.version !== FSD50K_REVIEW_DECISIONS_VERSION
    || value.batchId !== report.batch.batchId
    || value.reviewReportDigestSha256 !== report.reportDigestSha256
    || typeof value.reviewerId !== 'string'
    || !value.reviewerId.trim()
    || typeof value.reviewedAt !== 'string'
    || Number.isNaN(Date.parse(value.reviewedAt))
    || !Array.isArray(value.decisions)
    || value.decisions.length !== report.candidates.length
  ) {
    fail('INVALID_DECISION_RECEIPT', 'Review decisions are incomplete or belong to another batch');
  }
  const candidateByReviewId = new Map(
    report.candidates.map(candidate => [candidate.reviewId, candidate]),
  );
  const seen = new Set<string>();
  for (const rawDecision of value.decisions) {
    if (
      !isRecord(rawDecision)
      || typeof rawDecision.reviewId !== 'string'
      || typeof rawDecision.candidateDigestSha256 !== 'string'
      || !SHA256_PATTERN.test(rawDecision.candidateDigestSha256)
      || typeof rawDecision.status !== 'string'
      || !REVIEW_STATUSES.has(rawDecision.status)
      || typeof rawDecision.selectedRole !== 'string'
      || !EVENT_ROLES.has(rawDecision.selectedRole as SfxCatalogEventRole)
      || typeof rawDecision.note !== 'string'
      || seen.has(rawDecision.reviewId)
    ) {
      fail('INVALID_DECISION', 'Every review candidate requires one explicit valid decision');
    }
    const candidate = candidateByReviewId.get(rawDecision.reviewId);
    if (!candidate || rawDecision.candidateDigestSha256 !== candidate.candidateDigestSha256) {
      fail('DECISION_EVIDENCE_MISMATCH', `Decision evidence differs for ${rawDecision.reviewId}`);
    }
    seen.add(rawDecision.reviewId);
  }
  return {
    ...(value as unknown as Fsd50kReviewDecisionReceipt),
    reviewerId: value.reviewerId.trim(),
  };
}

function buildCatalogSemanticEvidence(
  candidate: Fsd50kReviewBatchCandidate,
  selectedRole: SfxCatalogEventRole,
  embeddingAnalysisDigestSha256: string,
): SfxCatalogSemanticEvidence {
  const selectedRoleIndex = candidate.semanticRoles.findIndex(score => score.role === selectedRole);
  const selected = candidate.semanticRoles[selectedRoleIndex];
  const top = candidate.semanticRoles[0];
  if (!selected || !top) {
    fail(
      'APPROVED_SEMANTIC_ROLE_MISSING',
      `Reviewed semantic evidence does not score ${selectedRole} for ${candidate.canonicalSourceId}`,
    );
  }
  const parsed = sfxCatalogSemanticEvidenceSchema.safeParse({
    version: SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
    provider: 'clap-audio-classifier',
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    embeddingAnalysisDigestSha256,
    candidateDigestSha256: candidate.candidateDigestSha256,
    sourceHashSha256: candidate.conditionedHashSha256,
    selectedRole,
    selectedRoleCosineSimilarity: selected.cosineSimilarity,
    selectedRoleRank: selectedRoleIndex + 1,
    topRole: top.role,
    topRoleCosineSimilarity: top.cosineSimilarity,
    roleAgreement: selectedRole === top.role,
    riskScores: candidate.semanticRisks.map(score => ({
      risk: score.risk,
      cosineSimilarity: score.cosineSimilarity,
    })),
  });
  if (!parsed.success) {
    fail(
      'APPROVED_SEMANTIC_EVIDENCE_INVALID',
      `Reviewed semantic evidence is invalid for ${candidate.canonicalSourceId}: ${parsed.error.issues
        .map(issue => `${issue.path.join('.') || 'evidence'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

function countDecisions(
  decisions: Fsd50kReviewDecisionReceipt,
  report: Fsd50kReviewBatchReport,
): Fsd50kPublicationGateReceipt['counts'] {
  return {
    candidates: decisions.decisions.length,
    approved: decisions.decisions.filter(decision => decision.status === 'approved').length,
    rejected: decisions.decisions.filter(decision => decision.status === 'rejected').length,
    pending: decisions.decisions.filter(decision => decision.status === 'pending').length,
    deferredCanonicalClusterMembers: report.candidates.reduce(
      (total, candidate) => total + candidate.cluster.deferredCanonicalSourceIds.length,
      0,
    ),
    deferredSourceIds: report.candidates.reduce(
      (total, candidate) => total + candidate.cluster.deferredSourceIds.length,
      0,
    ),
  };
}

function assertCandidateRights(candidate: Fsd50kReviewBatchCandidate): void {
  if (
    candidate.rights.provider !== 'fsd50k'
    || candidate.rights.upstreamProvider !== 'freesound'
    || candidate.rights.providerAssetId !== candidate.canonicalSourceId
    || candidate.rights.licenseId !== 'cc0-1.0'
    || candidate.rights.attributionRequired
  ) {
    fail('APPROVED_ASSET_RIGHTS_INVALID', `Rights are invalid for ${candidate.canonicalSourceId}`);
  }
}

function assertInspectionMatches(
  candidate: Fsd50kReviewBatchCandidate,
  inspection: EncodedSfxInspection,
): void {
  const expected = candidate.outputInspection;
  if (
    inspection.clippingRisk
    || inspection.sampleRate !== expected.sampleRate
    || inspection.channels !== expected.channels
    || inspection.loudness.metric !== expected.loudness.metric
    || Math.abs(inspection.durationMs - expected.durationMs) > 1
    || Math.abs(inspection.loudness.valueDb - expected.loudness.valueDb) > 0.05
    || Math.abs(inspection.truePeakDbtp - expected.truePeakDbtp) > 0.05
  ) {
    fail(
      'APPROVED_AUDIO_EVIDENCE_MISMATCH',
      `Approved audio evidence differs for ${candidate.canonicalSourceId}`,
    );
  }
}

async function writeGateOutput(
  outputDirectory: string,
  curationSpec: Fsd50kGatedCurationSpec,
  receipt: Fsd50kPublicationGateReceipt,
  approved: Array<{
    buffer: Buffer;
    receipt: Fsd50kPublicationGateReceipt['approved'][number];
  }>,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.tmp-`));
  try {
    await mkdir(path.join(staging, 'audio'));
    await Promise.all([
      writeFile(path.join(staging, 'curation-spec.json'), `${JSON.stringify(curationSpec, null, 2)}\n`, {
        flag: 'wx',
      }),
      writeFile(
        path.join(staging, 'publication-gate-receipt.json'),
        `${JSON.stringify(receipt, null, 2)}\n`,
        { flag: 'wx' },
      ),
      ...approved.map(item => writeFile(
        path.join(staging, item.receipt.stagedAudioPath),
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

function resolveInsideRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('UNSAFE_REVIEW_AUDIO_PATH', `Review audio path escapes its batch: ${relativePath}`);
  }
  return resolved;
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS', `FSD50K publication gate output already exists: ${target}`);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new Fsd50kPublicationGateError(code, message);
}
