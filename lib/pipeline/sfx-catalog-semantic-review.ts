import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION,
} from '@/lib/pipeline/sfx-catalog-semantic-migration';
import {
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEventRole,
} from '@/lib/pipeline/sfx-catalog';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const SAFE_AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg']);

export const APPROVED_SFX_SEMANTIC_REVIEW_VERSION =
  'approved-sfx-semantic-review-v1' as const;
export const APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION =
  'approved-sfx-semantic-review-decisions-v1' as const;
export const APPROVED_SFX_SEMANTIC_REVIEW_RESOLUTION_VERSION =
  'approved-sfx-semantic-review-resolution-v1' as const;

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
const approvalSchema = z.object({
  status: z.literal('approved'),
  reviewerId: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
}).strict();
const enrichedCurationAssetSchema = z.object({
  sourcePath: z.string().trim().min(1),
  title: z.string().trim().min(1),
  eventRoles: z.array(eventRoleSchema).length(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  semanticEvidence: sfxCatalogSemanticEvidenceSchema,
  approval: approvalSchema,
}).passthrough();
const enrichedCurationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(enrichedCurationAssetSchema).min(1),
}).strict();
const migrationReceiptEntrySchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  sourcePath: z.string().min(1),
  contentHashSha256: z.string().regex(SHA256_PATTERN),
  candidateDigestSha256: z.string().regex(SHA256_PATTERN),
  selectedRole: eventRoleSchema,
  selectedRoleCosineSimilarity: z.number().min(-1).max(1),
  selectedRoleRank: z.number().int().min(1).max(eventRoleSchema.options.length),
  topRole: eventRoleSchema,
  topRoleCosineSimilarity: z.number().min(-1).max(1),
  roleAgreement: z.boolean(),
  semanticEvidenceDigestSha256: z.string().regex(SHA256_PATTERN),
}).strict();
const migrationReceiptSchema = z.object({
  version: z.literal(APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION),
  generatedAt: z.string().datetime(),
  counts: z.object({
    approvedAssets: z.number().int().positive(),
    embeddedAssets: z.number().int().positive(),
    roleAgreement: z.number().int().nonnegative(),
    semanticDisagreements: z.number().int().positive(),
  }).strict(),
  promotionEligible: z.boolean(),
  embeddingAnalysisDigestSha256: z.string().regex(SHA256_PATTERN),
  enrichedCurationSpecDigestSha256: z.string().regex(SHA256_PATTERN),
  entries: z.array(migrationReceiptEntrySchema).min(1),
  receiptDigestSha256: z.string().regex(SHA256_PATTERN),
}).passthrough();

const reviewCandidateSchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  candidateDigestSha256: z.string().regex(SHA256_PATTERN),
  semanticEvidenceDigestSha256: z.string().regex(SHA256_PATTERN),
  contentHashSha256: z.string().regex(SHA256_PATTERN),
  sourceAudioPath: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)),
  currentRole: eventRoleSchema,
  currentRoleScore: z.number().min(-1).max(1),
  currentRoleRank: z.number().int().min(2).max(eventRoleSchema.options.length),
  suggestedRole: eventRoleSchema,
  suggestedRoleScore: z.number().min(-1).max(1),
  originalApproval: approvalSchema,
}).strict();
const reviewReportSchema = z.object({
  version: z.literal(APPROVED_SFX_SEMANTIC_REVIEW_VERSION),
  generatedAt: z.string().datetime(),
  migration: z.object({
    receiptDigestSha256: z.string().regex(SHA256_PATTERN),
    embeddingAnalysisDigestSha256: z.string().regex(SHA256_PATTERN),
    enrichedCurationSpecDigestSha256: z.string().regex(SHA256_PATTERN),
  }).strict(),
  policy: z.object({
    disagreementOnly: z.literal(true),
    exactAudioBytesRequired: z.literal(true),
    explicitDecisionPerCandidateRequired: z.literal(true),
    productionCatalogMutationAllowed: z.literal(false),
    modelMayNotOverrideHumanWithoutDecision: z.literal(true),
  }).strict(),
  counts: z.object({
    migrationAssets: z.number().int().positive(),
    directRoleAgreement: z.number().int().nonnegative(),
    reviewCandidates: z.number().int().positive(),
  }).strict(),
  candidates: z.array(reviewCandidateSchema).min(1),
  reportDigestSha256: z.string().regex(SHA256_PATTERN),
}).strict();
const reviewDecisionSchema = z.object({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  candidateDigestSha256: z.string().regex(SHA256_PATTERN),
  status: z.enum(['keep-current', 'use-model-suggestion', 'reject', 'pending']),
  note: z.string(),
}).strict();
const reviewDecisionsSchema = z.object({
  version: z.literal(APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION),
  reviewReportDigestSha256: z.string().regex(SHA256_PATTERN),
  migrationReceiptDigestSha256: z.string().regex(SHA256_PATTERN),
  reviewerId: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
  decisions: z.array(reviewDecisionSchema).min(1),
}).strict();

type EnrichedCurationSpec = z.infer<typeof enrichedCurationSpecSchema>;
type MigrationReceipt = z.infer<typeof migrationReceiptSchema>;
export type ApprovedSfxSemanticReviewReport = z.infer<typeof reviewReportSchema>;
export type ApprovedSfxSemanticReviewDecisions = z.infer<typeof reviewDecisionsSchema>;

export type ApprovedSfxSemanticReviewErrorCode =
  | 'INVALID_INPUT'
  | 'MIGRATION_RECEIPT_MISMATCH'
  | 'CURATION_DIGEST_MISMATCH'
  | 'DISAGREEMENT_SET_MISMATCH'
  | 'SEMANTIC_EVIDENCE_MISMATCH'
  | 'UNSAFE_SOURCE_PATH'
  | 'SOURCE_HASH_MISMATCH'
  | 'OUTPUT_EXISTS'
  | 'REVIEW_REPORT_MISMATCH'
  | 'DECISION_SET_MISMATCH'
  | 'STALE_DECISION'
  | 'REVIEW_INCOMPLETE'
  | 'REVIEW_NOTE_REQUIRED';

export class ApprovedSfxSemanticReviewError extends Error {
  constructor(
    public readonly code: ApprovedSfxSemanticReviewErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApprovedSfxSemanticReviewError';
  }
}

export interface PrepareApprovedSfxSemanticReviewInput {
  sourceRoot: string;
  enrichedCurationSpec: unknown;
  migrationReceipt: unknown;
  outputDirectory: string;
  generatedAt?: Date;
}

export interface ApprovedSfxSemanticReviewArtifacts {
  outputDirectory: string;
  reportPath: string;
  decisionsTemplatePath: string;
  htmlPath: string;
  report: ApprovedSfxSemanticReviewReport;
}

export interface ApprovedSfxSemanticReviewResolution {
  version: typeof APPROVED_SFX_SEMANTIC_REVIEW_RESOLUTION_VERSION;
  reviewedAt: string;
  reviewerId: string;
  reviewReportDigestSha256: string;
  migrationReceiptDigestSha256: string;
  policy: {
    everyDisagreementResolved: true;
    staleDecisionsRejected: true;
    productionCatalogMutationPerformed: false;
  };
  counts: {
    keepCurrent: number;
    useModelSuggestion: number;
    rejected: number;
  };
  catalogMutationRequired: boolean;
  entries: Array<{
    assetId: string;
    candidateDigestSha256: string;
    decision: 'keep-current' | 'use-model-suggestion' | 'reject';
    resolvedRole: SfxCatalogEventRole | null;
    note: string;
  }>;
  resolutionDigestSha256: string;
}

interface PreparedCandidate {
  report: ApprovedSfxSemanticReviewReport['candidates'][number];
  audio: Buffer;
}

export async function prepareApprovedSfxSemanticReview(
  input: PrepareApprovedSfxSemanticReviewInput,
): Promise<ApprovedSfxSemanticReviewArtifacts> {
  await assertOutputMissing(input.outputDirectory);
  const curationDigestSha256 = hashJson(input.enrichedCurationSpec);
  const curation = parseInput(
    enrichedCurationSpecSchema,
    input.enrichedCurationSpec,
    'enriched curation spec',
  );
  const migration = parseAndVerifyMigrationReceipt(input.migrationReceipt);
  if (curationDigestSha256 !== migration.enrichedCurationSpecDigestSha256) {
    fail('CURATION_DIGEST_MISMATCH', 'Enriched curation does not match the migration receipt');
  }
  const disagreements = migration.entries.filter(entry => !entry.roleAgreement);
  if (
    disagreements.length !== migration.counts.semanticDisagreements
    || disagreements.length === 0
    || migration.promotionEligible
  ) {
    fail('DISAGREEMENT_SET_MISMATCH', 'Migration disagreement counts or eligibility are invalid');
  }

  const curationByHash = uniqueCurationByHash(curation);
  const sourceRoot = await realpath(path.resolve(input.sourceRoot));
  const prepared: PreparedCandidate[] = [];
  for (const disagreement of disagreements) {
    const asset = curationByHash.get(disagreement.contentHashSha256);
    if (!asset || asset.sourcePath !== disagreement.sourcePath) {
      fail(
        'DISAGREEMENT_SET_MISMATCH',
        `No enriched curation asset matches ${disagreement.assetId}`,
      );
    }
    const evidence = asset.semanticEvidence;
    if (
      hashJson(evidence) !== disagreement.semanticEvidenceDigestSha256
      || evidence.candidateDigestSha256 !== disagreement.candidateDigestSha256
      || evidence.selectedRole !== disagreement.selectedRole
      || evidence.topRole !== disagreement.topRole
      || evidence.roleAgreement
    ) {
      fail(
        'SEMANTIC_EVIDENCE_MISMATCH',
        `Semantic evidence differs for ${disagreement.assetId}`,
      );
    }
    const sourcePath = await resolveSafeSourcePath(sourceRoot, asset.sourcePath);
    const audio = await readFile(sourcePath);
    if (hashBuffer(audio) !== disagreement.contentHashSha256) {
      fail('SOURCE_HASH_MISMATCH', `Review audio changed for ${disagreement.assetId}`);
    }
    const extension = path.extname(sourcePath).toLowerCase();
    if (!SAFE_AUDIO_EXTENSIONS.has(extension)) {
      fail('UNSAFE_SOURCE_PATH', `Unsupported review audio type for ${disagreement.assetId}`);
    }
    const sourceAudioPath = `audio/${disagreement.assetId}${extension}`;
    const candidateWithoutDigest = {
      assetId: disagreement.assetId,
      semanticEvidenceDigestSha256: disagreement.semanticEvidenceDigestSha256,
      contentHashSha256: disagreement.contentHashSha256,
      sourceAudioPath,
      title: asset.title,
      tags: asset.tags,
      currentRole: disagreement.selectedRole,
      currentRoleScore: disagreement.selectedRoleCosineSimilarity,
      currentRoleRank: disagreement.selectedRoleRank,
      suggestedRole: disagreement.topRole,
      suggestedRoleScore: disagreement.topRoleCosineSimilarity,
      originalApproval: asset.approval,
    };
    prepared.push({
      report: {
        ...candidateWithoutDigest,
        candidateDigestSha256: hashJson({
          migrationReceiptDigestSha256: migration.receiptDigestSha256,
          migrationCandidateDigestSha256: disagreement.candidateDigestSha256,
          ...candidateWithoutDigest,
        }),
      },
      audio,
    });
  }

  const sorted = prepared.sort((left, right) =>
    left.report.assetId.localeCompare(right.report.assetId));
  const reportWithoutDigest = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    migration: {
      receiptDigestSha256: migration.receiptDigestSha256,
      embeddingAnalysisDigestSha256: migration.embeddingAnalysisDigestSha256,
      enrichedCurationSpecDigestSha256: migration.enrichedCurationSpecDigestSha256,
    },
    policy: {
      disagreementOnly: true,
      exactAudioBytesRequired: true,
      explicitDecisionPerCandidateRequired: true,
      productionCatalogMutationAllowed: false,
      modelMayNotOverrideHumanWithoutDecision: true,
    },
    counts: {
      migrationAssets: migration.counts.approvedAssets,
      directRoleAgreement: migration.counts.roleAgreement,
      reviewCandidates: sorted.length,
    },
    candidates: sorted.map(candidate => candidate.report),
  } as const;
  const canonicalReport = parseInput(reviewReportSchema, {
    ...reportWithoutDigest,
    reportDigestSha256: '0'.repeat(64),
  }, 'semantic review report');
  const {
    reportDigestSha256: _placeholderDigest,
    ...canonicalReportBody
  } = canonicalReport;
  const report = parseInput(reviewReportSchema, {
    ...canonicalReportBody,
    reportDigestSha256: hashJson(canonicalReportBody),
  }, 'semantic review report');
  const decisionsTemplate: ApprovedSfxSemanticReviewDecisions = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
    reviewReportDigestSha256: report.reportDigestSha256,
    migrationReceiptDigestSha256: report.migration.receiptDigestSha256,
    reviewerId: '',
    reviewedAt: '',
    decisions: report.candidates.map(candidate => ({
      assetId: candidate.assetId,
      candidateDigestSha256: candidate.candidateDigestSha256,
      status: 'pending',
      note: '',
    })),
  };
  await writeReviewArtifacts(input.outputDirectory, report, decisionsTemplate, sorted);
  return {
    outputDirectory: input.outputDirectory,
    reportPath: path.join(input.outputDirectory, 'review-report.json'),
    decisionsTemplatePath: path.join(input.outputDirectory, 'review-decisions-template.json'),
    htmlPath: path.join(input.outputDirectory, 'index.html'),
    report,
  };
}

export function finalizeApprovedSfxSemanticReview(
  reportValue: unknown,
  decisionsValue: unknown,
): ApprovedSfxSemanticReviewResolution {
  const report = parseAndVerifyReviewReport(reportValue);
  const decisions = parseInput(
    reviewDecisionsSchema,
    decisionsValue,
    'semantic review decisions',
  );
  if (
    decisions.reviewReportDigestSha256 !== report.reportDigestSha256
    || decisions.migrationReceiptDigestSha256 !== report.migration.receiptDigestSha256
  ) {
    fail('STALE_DECISION', 'Review decisions belong to another report or migration');
  }
  const decisionByAssetId = new Map(
    decisions.decisions.map(decision => [decision.assetId, decision] as const),
  );
  if (
    decisionByAssetId.size !== decisions.decisions.length
    || decisionByAssetId.size !== report.candidates.length
  ) {
    fail('DECISION_SET_MISMATCH', 'Every disagreement requires exactly one decision');
  }
  const entries: ApprovedSfxSemanticReviewResolution['entries'] = [];
  for (const candidate of report.candidates) {
    const decision = decisionByAssetId.get(candidate.assetId);
    if (!decision) {
      fail('DECISION_SET_MISMATCH', `Missing decision for ${candidate.assetId}`);
    }
    if (decision.candidateDigestSha256 !== candidate.candidateDigestSha256) {
      fail('STALE_DECISION', `Decision evidence changed for ${candidate.assetId}`);
    }
    if (decision.status === 'pending') {
      fail('REVIEW_INCOMPLETE', `Review remains pending for ${candidate.assetId}`);
    }
    const note = decision.note.trim();
    if (decision.status === 'reject' && !note) {
      fail('REVIEW_NOTE_REQUIRED', `Rejected asset ${candidate.assetId} requires a note`);
    }
    entries.push({
      assetId: candidate.assetId,
      candidateDigestSha256: candidate.candidateDigestSha256,
      decision: decision.status,
      resolvedRole: decision.status === 'reject'
        ? null
        : decision.status === 'keep-current'
          ? candidate.currentRole
          : candidate.suggestedRole,
      note,
    });
  }
  const resolutionWithoutDigest = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_RESOLUTION_VERSION,
    reviewedAt: decisions.reviewedAt,
    reviewerId: decisions.reviewerId,
    reviewReportDigestSha256: report.reportDigestSha256,
    migrationReceiptDigestSha256: report.migration.receiptDigestSha256,
    policy: {
      everyDisagreementResolved: true,
      staleDecisionsRejected: true,
      productionCatalogMutationPerformed: false,
    },
    counts: {
      keepCurrent: entries.filter(entry => entry.decision === 'keep-current').length,
      useModelSuggestion: entries.filter(
        entry => entry.decision === 'use-model-suggestion',
      ).length,
      rejected: entries.filter(entry => entry.decision === 'reject').length,
    },
    catalogMutationRequired: entries.some(entry => entry.decision !== 'keep-current'),
    entries,
  } satisfies Omit<ApprovedSfxSemanticReviewResolution, 'resolutionDigestSha256'>;
  return {
    ...resolutionWithoutDigest,
    resolutionDigestSha256: hashJson(resolutionWithoutDigest),
  };
}

function parseAndVerifyMigrationReceipt(value: unknown): MigrationReceipt {
  if (!isRecord(value) || typeof value.receiptDigestSha256 !== 'string') {
    fail('INVALID_INPUT', 'Migration receipt is malformed');
  }
  const { receiptDigestSha256, ...body } = value;
  if (hashJson(body) !== receiptDigestSha256) {
    fail('MIGRATION_RECEIPT_MISMATCH', 'Migration receipt digest does not match its contents');
  }
  return parseInput(migrationReceiptSchema, value, 'semantic migration receipt');
}

function parseAndVerifyReviewReport(value: unknown): ApprovedSfxSemanticReviewReport {
  if (!isRecord(value) || typeof value.reportDigestSha256 !== 'string') {
    fail('INVALID_INPUT', 'Semantic review report is malformed');
  }
  const { reportDigestSha256, ...body } = value;
  if (hashJson(body) !== reportDigestSha256) {
    fail('REVIEW_REPORT_MISMATCH', 'Semantic review report digest does not match its contents');
  }
  return parseInput(reviewReportSchema, value, 'semantic review report');
}

function uniqueCurationByHash(
  curation: EnrichedCurationSpec,
): Map<string, EnrichedCurationSpec['assets'][number]> {
  const result = new Map<string, EnrichedCurationSpec['assets'][number]>();
  for (const asset of curation.assets) {
    const contentHash = asset.semanticEvidence.catalogContentHashSha256;
    if (result.has(contentHash)) {
      fail('DISAGREEMENT_SET_MISMATCH', 'Enriched curation contains duplicate audio content');
    }
    result.set(contentHash, asset);
  }
  return result;
}

async function assertOutputMissing(outputDirectory: string): Promise<void> {
  try {
    await lstat(outputDirectory);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS', `Review output already exists: ${outputDirectory}`);
}

async function resolveSafeSourcePath(sourceRoot: string, sourcePath: string): Promise<string> {
  const candidate = path.resolve(sourceRoot, sourcePath);
  if (!isPathInside(sourceRoot, candidate)) {
    fail('UNSAFE_SOURCE_PATH', `Review source escapes its root: ${sourcePath}`);
  }
  let resolved: string;
  try {
    resolved = await realpath(candidate);
  } catch (error) {
    fail('UNSAFE_SOURCE_PATH', `Review source cannot be resolved: ${sourcePath}`, error);
  }
  if (!isPathInside(sourceRoot, resolved)) {
    fail('UNSAFE_SOURCE_PATH', `Review source resolves outside its root: ${sourcePath}`);
  }
  return resolved;
}

async function writeReviewArtifacts(
  outputDirectory: string,
  report: ApprovedSfxSemanticReviewReport,
  decisionsTemplate: ApprovedSfxSemanticReviewDecisions,
  prepared: readonly PreparedCandidate[],
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  const staging = path.join(parent, `.${path.basename(outputDirectory)}.tmp-${randomUUID()}`);
  await mkdir(parent, { recursive: true });
  await mkdir(path.join(staging, 'audio'), { recursive: true });
  try {
    await Promise.all([
      writeJson(path.join(staging, 'review-report.json'), report),
      writeJson(path.join(staging, 'review-decisions-template.json'), decisionsTemplate),
      writeFile(path.join(staging, 'index.html'), buildReviewHtml(report), {
        encoding: 'utf8',
        flag: 'wx',
      }),
      ...prepared.map(candidate => writeFile(
        path.join(staging, candidate.report.sourceAudioPath),
        candidate.audio,
        { flag: 'wx' },
      )),
    ]);
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function buildReviewHtml(report: ApprovedSfxSemanticReviewReport): string {
  const data = JSON.stringify(report).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Editron SFX Semantic Review</title><style>
*{box-sizing:border-box}body{margin:0;background:#101110;color:#f1f1ec;font:14px system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:20px}header{position:sticky;top:0;z-index:2;background:#101110;border-bottom:1px solid #3a3b37;padding:12px 0}
h1{font-size:20px;margin:0 0 5px;letter-spacing:0}.meta,.evidence{color:#a7a99f}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
input,button{background:#191a18;color:#f1f1ec;border:1px solid #55574f;padding:8px}button{cursor:pointer}button:hover{border-color:#d8b755}
article{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,1fr);gap:18px;padding:18px 0;border-bottom:1px solid #343530}
.title{font-size:16px;font-weight:700}.labels{display:flex;gap:8px;align-items:center;margin:9px 0;flex-wrap:wrap}.label{border:1px solid #55574f;padding:4px 7px}
.arrow{color:#d8b755}.tags{color:#aaa;font-size:12px;margin-top:8px}.decision{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.decision button[data-active=true]{border-color:#d8b755;color:#f4d26f}.note{width:100%;margin-top:8px}audio{width:100%;margin-top:10px}
#message{color:#f4d26f}@media(max-width:760px){article{grid-template-columns:1fr}}
</style></head><body><main><header><h1>SFX semantic disagreement review</h1>
<div class="meta">${report.counts.reviewCandidates} sounds only / ${report.counts.directRoleAgreement} direct agreements excluded</div>
<div class="controls"><label>Reviewer <input id="reviewer" autocomplete="off"></label>
<span id="counts"></span><button id="export">Export completed decisions</button><span id="message"></span></div></header>
<section id="list"></section></main><script type="application/json" id="data">${data}</script><script>
const report=JSON.parse(document.getElementById('data').textContent);
const key='editron-approved-sfx-semantic-review:'+report.reportDigestSha256;
const saved=JSON.parse(localStorage.getItem(key)||'{}');const decisions=saved.decisions||{};
const reviewer=document.getElementById('reviewer');reviewer.value=saved.reviewer||'';const rows=[];
function persist(){localStorage.setItem(key,JSON.stringify({reviewer:reviewer.value.trim(),decisions}))}
function refresh(){const counts={'keep-current':0,'use-model-suggestion':0,reject:0,pending:0};
for(const row of rows){const d=decisions[row.c.assetId];counts[d.status]++;row.buttons.forEach(b=>b.dataset.active=String(b.dataset.value===d.status))}
document.getElementById('counts').textContent=counts['keep-current']+' kept / '+counts['use-model-suggestion']+' relabelled / '+counts.reject+' rejected / '+counts.pending+' pending'}
for(const c of report.candidates){decisions[c.assetId]||={status:'pending',note:''};
const article=document.createElement('article');const info=document.createElement('div');const title=document.createElement('div');title.className='title';title.textContent=c.title;
const labels=document.createElement('div');labels.className='labels';const current=document.createElement('span');current.className='label';current.textContent='Human: '+c.currentRole;
const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='versus';const suggested=document.createElement('span');suggested.className='label';suggested.textContent='CLAP: '+c.suggestedRole;labels.append(current,arrow,suggested);
const evidence=document.createElement('div');evidence.className='evidence';evidence.textContent='human rank '+c.currentRoleRank+' / scores '+c.currentRoleScore.toFixed(3)+' vs '+c.suggestedRoleScore.toFixed(3);
const tags=document.createElement('div');tags.className='tags';tags.textContent=c.tags.slice(0,12).join(' / ');
const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=c.sourceAudioPath;info.append(title,labels,evidence,tags,audio);
const review=document.createElement('div');const prompt=document.createElement('div');prompt.textContent='Which label should the selector trust?';
const dc=document.createElement('div');dc.className='decision';const choices=[['keep-current','Keep human label'],['use-model-suggestion','Use CLAP label'],['reject','Reject sound'],['pending','Clear']];
const buttons=choices.map(([value,label])=>{const b=document.createElement('button');b.type='button';b.dataset.value=value;b.textContent=label;b.onclick=()=>{decisions[c.assetId].status=value;persist();refresh()};dc.append(b);return b});
const note=document.createElement('input');note.className='note';note.placeholder='Note required only when rejecting';note.value=decisions[c.assetId].note;note.oninput=()=>{decisions[c.assetId].note=note.value;persist()};
review.append(prompt,dc,note);article.append(info,review);document.getElementById('list').append(article);rows.push({c,buttons})}
reviewer.oninput=persist;document.addEventListener('play',event=>{if(!(event.target instanceof HTMLAudioElement))return;document.querySelectorAll('audio').forEach(audio=>{if(audio!==event.target)audio.pause()})},true);
document.getElementById('export').onclick=()=>{const message=document.getElementById('message');const reviewerId=reviewer.value.trim();
if(!reviewerId){message.textContent='Reviewer ID required';reviewer.focus();return}const pending=report.candidates.filter(c=>decisions[c.assetId].status==='pending');
if(pending.length){message.textContent=pending.length+' decisions still pending';return}const invalidReject=report.candidates.find(c=>decisions[c.assetId].status==='reject'&&!decisions[c.assetId].note.trim());
if(invalidReject){message.textContent='Rejected sounds require a note';return}const value={version:'${APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION}',reviewReportDigestSha256:report.reportDigestSha256,migrationReceiptDigestSha256:report.migration.receiptDigestSha256,reviewerId,reviewedAt:new Date().toISOString(),decisions:report.candidates.map(c=>({assetId:c.assetId,candidateDigestSha256:c.candidateDigestSha256,status:decisions[c.assetId].status,note:decisions[c.assetId].note.trim()}))};
const blob=new Blob([JSON.stringify(value,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='approved-sfx-semantic-review-decisions.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);message.textContent='Decision receipt exported'};refresh();
</script></body></html>`;
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function fail(
  code: ApprovedSfxSemanticReviewErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new ApprovedSfxSemanticReviewError(code, message, cause ? { cause } : undefined);
}
