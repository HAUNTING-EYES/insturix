import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION,
} from '../../lib/pipeline/sfx-catalog-semantic-migration';
import {
  APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
  finalizeApprovedSfxSemanticReview,
  prepareApprovedSfxSemanticReview,
} from '../../lib/pipeline/sfx-catalog-semantic-review';
import {
  SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
} from '../../lib/pipeline/sfx-catalog';
import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
} from '../../lib/pipeline/sfx-audio-embedding';

const NOW = new Date('2026-07-29T20:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('approved SFX semantic disagreement review', () => {
  it('writes an immutable disagreement-only listening bundle with exact audio', async () => {
    const fixture = await makeFixture();
    const result = await prepareApprovedSfxSemanticReview({
      ...fixture.input,
      generatedAt: NOW,
    });

    expect(result.report.counts).toEqual({
      migrationAssets: 1,
      directRoleAgreement: 0,
      reviewCandidates: 1,
    });
    expect(result.report.candidates[0]).toMatchObject({
      assetId: fixture.assetId,
      currentRole: 'impact',
      suggestedRole: 'foley',
      currentRoleRank: 2,
    });
    expect(await readFile(
      path.join(result.outputDirectory, result.report.candidates[0].sourceAudioPath),
    )).toEqual(fixture.audio);
    expect(await readFile(result.htmlPath, 'utf8')).toContain(
      'SFX semantic disagreement review',
    );
    await expect(prepareApprovedSfxSemanticReview(fixture.input))
      .rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });

  it('rejects a modified migration receipt before copying audio', async () => {
    const fixture = await makeFixture();
    const migrationReceipt = structuredClone(fixture.input.migrationReceipt);
    migrationReceipt.entries[0].topRoleCosineSimilarity = 0.5;

    await expect(prepareApprovedSfxSemanticReview({
      ...fixture.input,
      migrationReceipt,
    })).rejects.toMatchObject({ code: 'MIGRATION_RECEIPT_MISMATCH' });
  });

  it('rejects review audio that differs from the approved content hash', async () => {
    const fixture = await makeFixture();
    await writeFile(fixture.audioPath, Buffer.from('changed review audio'));

    await expect(prepareApprovedSfxSemanticReview(fixture.input))
      .rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' });
  });

  it('finalizes exact keep, model-label, and rejection decisions deterministically', async () => {
    const fixture = await makeFixture();
    const prepared = await prepareApprovedSfxSemanticReview({
      ...fixture.input,
      generatedAt: NOW,
    });
    const candidate = prepared.report.candidates[0];
    const base = {
      version: APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
      reviewReportDigestSha256: prepared.report.reportDigestSha256,
      migrationReceiptDigestSha256: prepared.report.migration.receiptDigestSha256,
      reviewerId: 'audio-lead',
      reviewedAt: NOW.toISOString(),
    } as const;

    const kept = finalizeApprovedSfxSemanticReview(prepared.report, {
      ...base,
      decisions: [{
        assetId: candidate.assetId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        status: 'keep-current',
        note: 'Audition confirms the editorial impact role.',
      }],
    });
    expect(kept).toMatchObject({
      counts: { keepCurrent: 1, useModelSuggestion: 0, rejected: 0 },
      catalogMutationRequired: false,
      entries: [{ resolvedRole: 'impact' }],
    });

    const relabelled = finalizeApprovedSfxSemanticReview(prepared.report, {
      ...base,
      decisions: [{
        assetId: candidate.assetId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        status: 'use-model-suggestion',
        note: '',
      }],
    });
    expect(relabelled).toMatchObject({
      counts: { keepCurrent: 0, useModelSuggestion: 1, rejected: 0 },
      catalogMutationRequired: true,
      entries: [{ resolvedRole: 'foley' }],
    });

    const rejected = finalizeApprovedSfxSemanticReview(prepared.report, {
      ...base,
      decisions: [{
        assetId: candidate.assetId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        status: 'reject',
        note: 'Not editorially useful.',
      }],
    });
    expect(rejected).toMatchObject({
      counts: { keepCurrent: 0, useModelSuggestion: 0, rejected: 1 },
      catalogMutationRequired: true,
      entries: [{ resolvedRole: null }],
    });
  });

  it('rejects pending and stale decisions', async () => {
    const fixture = await makeFixture();
    const prepared = await prepareApprovedSfxSemanticReview({
      ...fixture.input,
      generatedAt: NOW,
    });
    const candidate = prepared.report.candidates[0];
    const decisions = {
      version: APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
      reviewReportDigestSha256: prepared.report.reportDigestSha256,
      migrationReceiptDigestSha256: prepared.report.migration.receiptDigestSha256,
      reviewerId: 'audio-lead',
      reviewedAt: NOW.toISOString(),
      decisions: [{
        assetId: candidate.assetId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        status: 'pending',
        note: '',
      }],
    };
    expect(() => finalizeApprovedSfxSemanticReview(prepared.report, decisions))
      .toThrowError(expect.objectContaining({ code: 'REVIEW_INCOMPLETE' }));
    decisions.decisions[0].status = 'keep-current';
    decisions.decisions[0].candidateDigestSha256 = 'f'.repeat(64);
    expect(() => finalizeApprovedSfxSemanticReview(prepared.report, decisions))
      .toThrowError(expect.objectContaining({ code: 'STALE_DECISION' }));
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-sfx-semantic-review-'));
  temporaryDirectories.push(root);
  const sourceRoot = path.join(root, 'source');
  const outputDirectory = path.join(root, 'review');
  const audio = Buffer.from('approved disagreement audio');
  const contentHashSha256 = hashBuffer(audio);
  const sourcePath = 'audio/disagreement.wav';
  const audioPath = path.join(sourceRoot, sourcePath);
  const assetId = `sfx_catalog_${contentHashSha256.slice(0, 24)}`;
  await mkdir(path.dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);
  const semanticEvidence = {
    version: SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
    provider: 'clap-audio-classifier',
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    embeddingAnalysisDigestSha256: hashJson(['analysis']),
    candidateDigestSha256: hashJson(['candidate']),
    embeddingSourceHashSha256: contentHashSha256,
    catalogContentHashSha256: contentHashSha256,
    selectedRole: 'impact' as const,
    selectedRoleCosineSimilarity: 0.2,
    selectedRoleRank: 2,
    topRole: 'foley' as const,
    topRoleCosineSimilarity: 0.4,
    roleAgreement: false,
    riskScores: [
      { risk: 'speech' as const, cosineSimilarity: -0.2 },
      { risk: 'music' as const, cosineSimilarity: -0.1 },
      { risk: 'noise' as const, cosineSimilarity: 0.1 },
    ],
  };
  const enrichedCurationSpec = {
    version: 'sfx-catalog-curation-spec-v1',
    assets: [{
      sourcePath,
      title: 'Door impact',
      eventRoles: ['impact'],
      tags: ['door', 'impact'],
      semanticEvidence,
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: NOW.toISOString(),
      },
    }],
  };
  const receiptEntry = {
    assetId,
    sourcePath,
    contentHashSha256,
    candidateDigestSha256: semanticEvidence.candidateDigestSha256,
    selectedRole: semanticEvidence.selectedRole,
    selectedRoleCosineSimilarity: semanticEvidence.selectedRoleCosineSimilarity,
    selectedRoleRank: semanticEvidence.selectedRoleRank,
    topRole: semanticEvidence.topRole,
    topRoleCosineSimilarity: semanticEvidence.topRoleCosineSimilarity,
    roleAgreement: false,
    semanticEvidenceDigestSha256: hashJson(semanticEvidence),
  };
  const receiptWithoutDigest = {
    version: APPROVED_SFX_SEMANTIC_MIGRATION_RECEIPT_VERSION,
    generatedAt: NOW.toISOString(),
    source: {
      curationSpecDigestSha256: hashJson(['original-curation']),
      liveManifestDigestSha256: hashJson(['manifest']),
      publicationManifestDigestSha256: hashJson(['publication-manifest']),
      publicationReceiptDigestSha256: hashJson(['publication-receipt']),
      uploadPlanDigestSha256: hashJson(['upload-plan']),
    },
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    policy: {
      exactPublishedAssetSetRequired: true,
      exactPublishedBytesRequired: true,
      existingHumanApprovalRetained: true,
      providerApiCallsPerformed: false,
      productionCatalogMutationPerformed: false,
      semanticDisagreementsRequireReviewBeforePromotion: true,
    },
    counts: {
      approvedAssets: 1,
      embeddedAssets: 1,
      roleAgreement: 0,
      semanticDisagreements: 1,
    },
    promotionEligible: false,
    embeddingAnalysisDigestSha256: semanticEvidence.embeddingAnalysisDigestSha256,
    enrichedCurationSpecDigestSha256: hashJson(enrichedCurationSpec),
    entries: [receiptEntry],
  };
  const migrationReceipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  return {
    assetId,
    audio,
    audioPath,
    input: {
      sourceRoot,
      enrichedCurationSpec,
      migrationReceipt,
      outputDirectory,
    },
  };
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
