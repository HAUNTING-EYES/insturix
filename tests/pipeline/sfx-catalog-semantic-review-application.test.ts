import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  applyApprovedSfxSemanticReview,
} from '../../lib/pipeline/sfx-catalog-semantic-review-application';
import {
  APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
  APPROVED_SFX_SEMANTIC_REVIEW_VERSION,
} from '../../lib/pipeline/sfx-catalog-semantic-review';
import {
  parseSfxCatalogCurationSpec,
} from '../../scripts/curate-sfx-catalog';
import {
  SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
} from '../../lib/pipeline/sfx-catalog';
import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
} from '../../lib/pipeline/sfx-audio-embedding';

const NOW = new Date('2026-07-29T22:00:00.000Z');

describe('approved SFX semantic review application', () => {
  it('keeps direct agreements, applies canonical relabel profiles, and quarantines rejects', () => {
    const fixture = makeFixture();
    const result = applyApprovedSfxSemanticReview({
      ...fixture.input,
      appliedAt: NOW,
    });

    expect(result.applicationReceipt.counts).toEqual({
      sourceAssets: 3,
      directRoleAgreement: 1,
      keptHumanOverrides: 0,
      relabelled: 1,
      quarantined: 1,
      resolvedAssets: 2,
    });
    expect(result.resolvedCurationSpec.assets.map(asset => asset.title)).toEqual([
      'Direct whoosh',
      'Door slam',
    ]);
    const relabelled = result.resolvedCurationSpec.assets[1];
    expect(relabelled).toMatchObject({
      eventRoles: ['foley'],
      surfaces: ['scene', 'motion-graphic'],
      layerRole: 'oneshot',
      material: 'physical',
      semanticEvidence: {
        selectedRole: 'foley',
        selectedRoleRank: 1,
        roleAgreement: true,
      },
    });
    expect(relabelled.tags[0]).toBe('foley');
    expect(parseSfxCatalogCurationSpec(result.resolvedCurationSpec).assets).toHaveLength(2);
    expect(result.applicationReceipt.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetId: fixture.relabelAssetId,
        decision: 'use-model-suggestion',
        previousRole: 'impact',
        resolvedRole: 'foley',
      }),
      expect.objectContaining({
        assetId: fixture.rejectAssetId,
        decision: 'reject',
        resolvedRole: null,
      }),
    ]));
  });

  it('rejects changed curation after the review was prepared', () => {
    const fixture = makeFixture();
    const enrichedCurationSpec = structuredClone(fixture.input.enrichedCurationSpec);
    enrichedCurationSpec.assets[1].title = 'Changed title';

    expect(() => applyApprovedSfxSemanticReview({
      ...fixture.input,
      enrichedCurationSpec,
    })).toThrowError(expect.objectContaining({ code: 'CURATION_DIGEST_MISMATCH' }));
  });

  it('rejects a tampered migration receipt', () => {
    const fixture = makeFixture();
    const migrationReceipt = structuredClone(fixture.input.migrationReceipt);
    migrationReceipt.enrichedCurationSpecDigestSha256 = 'f'.repeat(64);

    expect(() => applyApprovedSfxSemanticReview({
      ...fixture.input,
      migrationReceipt,
    })).toThrowError(expect.objectContaining({ code: 'MIGRATION_RECEIPT_MISMATCH' }));
  });

  it('rejects review candidates whose semantic evidence changed', () => {
    const fixture = makeFixture();
    const enrichedCurationSpec = structuredClone(fixture.input.enrichedCurationSpec);
    enrichedCurationSpec.assets[1].semanticEvidence.selectedRoleCosineSimilarity = 0.3;
    const newDigest = hashJson(enrichedCurationSpec);
    const migrationBody = {
      ...fixture.migrationBody,
      enrichedCurationSpecDigestSha256: newDigest,
    };
    const migrationReceipt = {
      ...migrationBody,
      receiptDigestSha256: hashJson(migrationBody),
    };
    const reviewReport = structuredClone(fixture.input.reviewReport);
    reviewReport.migration.enrichedCurationSpecDigestSha256 = newDigest;
    reviewReport.migration.receiptDigestSha256 = migrationReceipt.receiptDigestSha256;
    const { reportDigestSha256: _oldDigest, ...reportBody } = reviewReport;
    reviewReport.reportDigestSha256 = hashJson(reportBody);
    const reviewDecisions = structuredClone(fixture.input.reviewDecisions);
    reviewDecisions.reviewReportDigestSha256 = reviewReport.reportDigestSha256;
    reviewDecisions.migrationReceiptDigestSha256 = migrationReceipt.receiptDigestSha256;

    expect(() => applyApprovedSfxSemanticReview({
      enrichedCurationSpec,
      migrationReceipt,
      reviewReport,
      reviewDecisions,
    })).toThrowError(expect.objectContaining({ code: 'SEMANTIC_EVIDENCE_MISMATCH' }));
  });
});

function makeFixture() {
  const direct = makeAsset('direct', 'Direct whoosh', 'whoosh', 'whoosh', true);
  const relabel = makeAsset('relabel', 'Door slam', 'impact', 'foley', false);
  const reject = makeAsset('reject', 'Odd coins', 'tick', 'ambience', false);
  const enrichedCurationSpec = {
    version: 'sfx-catalog-curation-spec-v1',
    assets: [direct.asset, relabel.asset, reject.asset],
  };
  const migrationBody = {
    version: 'approved-sfx-semantic-migration-receipt-v1',
    enrichedCurationSpecDigestSha256: hashJson(enrichedCurationSpec),
    receiptDigestSha256: undefined,
  };
  delete migrationBody.receiptDigestSha256;
  const migrationReceipt = {
    ...migrationBody,
    receiptDigestSha256: hashJson(migrationBody),
  };
  const candidates = [
    makeReviewCandidate(relabel, 'review-relabel'),
    makeReviewCandidate(reject, 'review-reject'),
  ];
  const reportBody = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_VERSION,
    generatedAt: NOW.toISOString(),
    migration: {
      receiptDigestSha256: migrationReceipt.receiptDigestSha256,
      embeddingAnalysisDigestSha256: hashJson(['analysis']),
      enrichedCurationSpecDigestSha256: migrationBody.enrichedCurationSpecDigestSha256,
    },
    policy: {
      disagreementOnly: true,
      exactAudioBytesRequired: true,
      explicitDecisionPerCandidateRequired: true,
      productionCatalogMutationAllowed: false,
      modelMayNotOverrideHumanWithoutDecision: true,
    },
    counts: {
      migrationAssets: 3,
      directRoleAgreement: 1,
      reviewCandidates: 2,
    },
    candidates,
  };
  const reviewReport = {
    ...reportBody,
    reportDigestSha256: hashJson(reportBody),
  };
  const reviewDecisions = {
    version: APPROVED_SFX_SEMANTIC_REVIEW_DECISIONS_VERSION,
    reviewReportDigestSha256: reviewReport.reportDigestSha256,
    migrationReceiptDigestSha256: migrationReceipt.receiptDigestSha256,
    reviewerId: 'audio-lead',
    reviewedAt: NOW.toISOString(),
    decisions: [
      {
        assetId: relabel.assetId,
        candidateDigestSha256: candidates[0].candidateDigestSha256,
        status: 'use-model-suggestion',
        note: '',
      },
      {
        assetId: reject.assetId,
        candidateDigestSha256: candidates[1].candidateDigestSha256,
        status: 'reject',
        note: 'Does not fit the available taxonomy.',
      },
    ],
  };
  return {
    relabelAssetId: relabel.assetId,
    rejectAssetId: reject.assetId,
    migrationBody,
    input: {
      enrichedCurationSpec,
      migrationReceipt,
      reviewReport,
      reviewDecisions,
    },
  };
}

function makeAsset(
  id: string,
  title: string,
  selectedRole: 'whoosh' | 'impact' | 'tick',
  topRole: 'whoosh' | 'foley' | 'ambience',
  roleAgreement: boolean,
) {
  const contentHash = hashJson(['audio', id]);
  const candidateDigest = hashJson(['candidate', id]);
  const selectedRank = roleAgreement ? 1 : 2;
  const semanticEvidence = {
    version: SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION,
    provider: 'clap-audio-classifier',
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    embeddingAnalysisDigestSha256: hashJson(['analysis']),
    candidateDigestSha256: candidateDigest,
    embeddingSourceHashSha256: contentHash,
    catalogContentHashSha256: contentHash,
    selectedRole,
    selectedRoleCosineSimilarity: roleAgreement ? 0.4 : 0.2,
    selectedRoleRank: selectedRank,
    topRole,
    topRoleCosineSimilarity: 0.4,
    roleAgreement,
    riskScores: [],
  };
  const profile = selectedRole === 'whoosh'
    ? {
        surfaces: ['transition', 'motion-graphic'],
        layerRole: 'oneshot',
        material: 'air',
      }
    : selectedRole === 'impact'
      ? {
          surfaces: ['transition', 'motion-graphic', 'scene'],
          layerRole: 'impact',
          material: 'physical',
        }
      : {
          surfaces: ['motion-graphic', 'ui', 'caption'],
          layerRole: 'oneshot',
          material: 'recorded',
        };
  const assetId = `sfx_catalog_${contentHash.slice(0, 24)}`;
  return {
    assetId,
    contentHash,
    semanticEvidence,
    asset: {
      sourcePath: `audio/${id}.wav`,
      title,
      eventRoles: [selectedRole],
      surfaces: profile.surfaces,
      layerRole: profile.layerRole,
      tags: [selectedRole, id],
      negativeTags: [],
      energy: 0.5,
      brightness: 0.5,
      weight: 0.5,
      transientSharpness: 0.5,
      material: profile.material,
      tailMs: 0,
      loopable: false,
      direction: 'neutral',
      motionSpeed: 'fast',
      semanticEvidence,
      provenance: {
        provider: 'freesound',
        providerAssetId: id,
        licenseId: 'cc0-1.0',
        licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
      },
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: NOW.toISOString(),
      },
    },
  };
}

function makeReviewCandidate(
  fixture: ReturnType<typeof makeAsset>,
  id: string,
) {
  const body = {
    assetId: fixture.assetId,
    semanticEvidenceDigestSha256: hashJson(fixture.semanticEvidence),
    contentHashSha256: fixture.contentHash,
    sourceAudioPath: `audio/${fixture.assetId}.wav`,
    title: fixture.asset.title,
    tags: fixture.asset.tags,
    currentRole: fixture.semanticEvidence.selectedRole,
    currentRoleScore: fixture.semanticEvidence.selectedRoleCosineSimilarity,
    currentRoleRank: fixture.semanticEvidence.selectedRoleRank,
    suggestedRole: fixture.semanticEvidence.topRole,
    suggestedRoleScore: fixture.semanticEvidence.topRoleCosineSimilarity,
    originalApproval: fixture.asset.approval,
  };
  return {
    ...body,
    candidateDigestSha256: hashJson([id, body]),
  };
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
