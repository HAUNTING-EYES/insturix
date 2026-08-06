import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapEmbeddingRuntime,
} from '../../lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../../lib/pipeline/sfx-catalog';
import {
  buildReviewedSfxSemanticRelease,
} from '../../lib/pipeline/sfx-catalog-reviewed-semantic-release';
import {
  loadSfxCatalogSemanticIndex,
} from '../../lib/pipeline/sfx-catalog-semantic-index';

const NOW = new Date('2026-07-29T18:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('reviewed SFX semantic release v2', () => {
  it('excludes quarantined assets, writes immutable artifacts, and loads in the index', async () => {
    const fixture = await makeFixture();
    const { runtime, embedAudio } = makeRuntime();
    const result = await buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'release-1'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });

    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0]).toEqual(expect.objectContaining({
      assetId: fixture.accepted.assetId,
      semanticEvidence: expect.objectContaining({
        selectedRole: 'impact',
      }),
    }));
    expect(result.manifest.entries.some(
      entry => entry.assetId === fixture.rejected.assetId,
    )).toBe(false);
    expect(result.receipt.counts).toEqual({
      sourceAssets: 2,
      approvedAssets: 1,
      quarantinedAssets: 1,
      semanticVectors: 1,
      reusedCheckpoints: 0,
      newCheckpoints: 1,
    });
    expect(result.metadata.entries[0]).toEqual(expect.objectContaining({
      assetId: fixture.accepted.assetId,
      provider: 'freesound',
      providerAssetId: 'accepted-101',
      reviewDisposition: 'direct-agreement',
      approvalReviewerId: 'audio-reviewer',
    }));
    expect(embedAudio).toHaveBeenCalledTimes(1);

    const index = loadSfxCatalogSemanticIndex({
      metadataBuffer: await readFile(result.metadataPath),
      vectorsBuffer: await readFile(result.vectorsPath),
      receiptBuffer: await readFile(result.receiptPath),
    });
    expect(index.assertCompatibleManifest(result.manifest)).toEqual(result.manifest);
    expect(index.searchEmbedding(unitVector())).toEqual([{
      assetId: fixture.accepted.assetId,
      cosineSimilarity: 1,
    }]);
    expect(index.releaseReceiptDigestSha256).toBe(result.receipt.receiptDigestSha256);
    expect(index.promotedManifestDigestSha256).toBe(hashJson(result.manifest));

    const resumed = await buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'release-2'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: new Date('2026-07-29T18:01:00.000Z'),
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });
    expect(resumed.receipt.counts.reusedCheckpoints).toBe(1);
    expect(resumed.receipt.counts.newCheckpoints).toBe(0);
    expect(await readFile(resumed.vectorsPath)).toEqual(await readFile(result.vectorsPath));
    expect(embedAudio).toHaveBeenCalledTimes(1);
  });

  it('rejects changed reviewed bytes even when a valid checkpoint exists', async () => {
    const fixture = await makeFixture();
    const { runtime, embedAudio } = makeRuntime();
    await buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'release-before-tamper'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });
    await writeFile(fixture.accepted.audioPath, Buffer.from('changed-reviewed-audio'));

    await expect(buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'release-after-tamper'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'APPROVED_AUDIO_MISMATCH' });
    expect(embedAudio).toHaveBeenCalledTimes(1);
  });

  it('fails if a rejected review asset is reintroduced into resolved curation', async () => {
    const fixture = await makeFixture();
    const curationPath = path.join(
      fixture.options.resolutionDirectory,
      'resolved-curation-spec.json',
    );
    const curation = JSON.parse(await readFile(curationPath, 'utf8'));
    curation.assets.push(fixture.rejected.curationAsset);
    await writeJson(curationPath, curation);
    await rewriteApplicationDigest(
      fixture.options.resolutionDirectory,
      hashJson(curation),
    );

    await expect(buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'unsafe-release'),
      generatedAt: NOW,
    }, {
      runtime: makeRuntime().runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'REVIEW_ASSET_SET_MISMATCH' });
  });

  it('fails on source manifest drift and refuses to overwrite release output', async () => {
    const fixture = await makeFixture();
    const manifest = JSON.parse(await readFile(
      fixture.options.sourceManifestPath,
      'utf8',
    ));
    manifest.entries[0].title = 'Drifted after migration';
    await writeJson(fixture.options.sourceManifestPath, manifest);

    await expect(buildReviewedSfxSemanticRelease({
      ...fixture.options,
      outputDirectory: path.join(fixture.root, 'drifted-release'),
      generatedAt: NOW,
    }, {
      runtime: makeRuntime().runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'REVIEW_EVIDENCE_CHAIN_MISMATCH' });

    const cleanFixture = await makeFixture();
    const outputDirectory = path.join(cleanFixture.root, 'existing-release');
    await mkdir(outputDirectory);
    await expect(buildReviewedSfxSemanticRelease({
      ...cleanFixture.options,
      outputDirectory,
      generatedAt: NOW,
    }, {
      runtime: makeRuntime().runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-reviewed-sfx-release-'));
  temporaryDirectories.push(root);
  const migrationDirectory = path.join(root, 'migration');
  const reviewDirectory = path.join(root, 'review');
  const resolutionDirectory = path.join(root, 'resolution');
  const sourceAudioDirectory = path.join(root, 'source-audio');
  const sourceManifestPath = path.join(root, 'source-manifest.json');
  const workingDirectory = path.join(root, 'work');
  await Promise.all([
    mkdir(migrationDirectory),
    mkdir(reviewDirectory),
    mkdir(resolutionDirectory),
    mkdir(path.join(sourceAudioDirectory, 'audio'), { recursive: true }),
  ]);

  const accepted = makeAsset('accepted-101', Buffer.from('accepted-reviewed-audio'), {
    selectedRole: 'impact',
    topRole: 'impact',
    roleAgreement: true,
  });
  const rejected = makeAsset('rejected-202', Buffer.from('rejected-reviewed-audio'), {
    selectedRole: 'tick',
    topRole: 'shimmer',
    roleAgreement: false,
  });
  await Promise.all([
    writeFile(path.join(sourceAudioDirectory, accepted.sourcePath), accepted.audio),
    writeFile(path.join(sourceAudioDirectory, rejected.sourcePath), rejected.audio),
  ]);
  const sourceManifest = makeManifest([
    accepted.sourceEntry,
    rejected.sourceEntry,
  ]);
  await writeJson(sourceManifestPath, sourceManifest);

  const resolvedCuration = {
    version: 'sfx-catalog-curation-spec-v1',
    assets: [accepted.curationAsset],
  };
  const enrichedCurationSpecDigestSha256 = hashJson(['enriched-curation']);
  const migrationBody = {
    version: 'approved-sfx-semantic-migration-receipt-v1',
    generatedAt: NOW.toISOString(),
    source: {
      curationSpecDigestSha256: hashJson(['source-curation']),
      liveManifestDigestSha256: hashJson(sourceManifest),
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
      approvedAssets: 2,
      embeddedAssets: 2,
      roleAgreement: 1,
      semanticDisagreements: 1,
    },
    promotionEligible: false,
    embeddingAnalysisDigestSha256: hashJson(['embedding-analysis']),
    enrichedCurationSpecDigestSha256,
    entries: [
      accepted.migrationEntry,
      rejected.migrationEntry,
    ],
  };
  const migrationReceipt = {
    ...migrationBody,
    receiptDigestSha256: hashJson(migrationBody),
  };
  const reviewCandidateDigest = hashJson(['review-candidate', rejected.assetId]);
  const reviewReportBody = {
    version: 'approved-sfx-semantic-review-v1',
    generatedAt: NOW.toISOString(),
    migration: {
      receiptDigestSha256: migrationReceipt.receiptDigestSha256,
      embeddingAnalysisDigestSha256: migrationBody.embeddingAnalysisDigestSha256,
      enrichedCurationSpecDigestSha256,
    },
    counts: {
      migrationAssets: 2,
      directRoleAgreement: 1,
      reviewCandidates: 1,
    },
    policy: {
      disagreementOnly: true,
      exactAudioBytesRequired: true,
      explicitDecisionPerCandidateRequired: true,
      productionCatalogMutationAllowed: false,
      modelMayNotOverrideHumanWithoutDecision: true,
    },
    candidates: [{
      assetId: rejected.assetId,
      candidateDigestSha256: reviewCandidateDigest,
      semanticEvidenceDigestSha256: hashJson(rejected.semanticEvidence),
      contentHashSha256: rejected.contentHashSha256,
      sourceAudioPath: `audio/${rejected.assetId}.wav`,
      title: rejected.sourceEntry.title,
      tags: rejected.sourceEntry.tags,
      currentRole: 'tick',
      currentRoleScore: 0.2,
      currentRoleRank: 2,
      suggestedRole: 'shimmer',
      suggestedRoleScore: 0.7,
      originalApproval: rejected.curationAsset.approval,
    }],
  };
  const reviewReportDigestSha256 = hashJson(reviewReportBody);
  const reviewReport = {
    ...reviewReportBody,
    reportDigestSha256: reviewReportDigestSha256,
  };
  const resolutionBody = {
    version: 'approved-sfx-semantic-review-resolution-v1',
    reviewedAt: NOW.toISOString(),
    reviewerId: 'human-reviewer',
    reviewReportDigestSha256,
    migrationReceiptDigestSha256: migrationReceipt.receiptDigestSha256,
    policy: {
      everyDisagreementResolved: true,
      staleDecisionsRejected: true,
      productionCatalogMutationPerformed: false,
    },
    counts: {
      keepCurrent: 0,
      useModelSuggestion: 0,
      rejected: 1,
    },
    catalogMutationRequired: true,
    entries: [{
      assetId: rejected.assetId,
      candidateDigestSha256: reviewCandidateDigest,
      decision: 'reject',
      resolvedRole: null,
      note: 'Description is accurate; editorial role is not.',
    }],
  };
  const resolution = {
    ...resolutionBody,
    resolutionDigestSha256: hashJson(resolutionBody),
  };
  const applicationBody = {
    version: 'approved-sfx-semantic-review-application-v1',
    appliedAt: NOW.toISOString(),
    source: {
      migrationReceiptDigestSha256: migrationReceipt.receiptDigestSha256,
      reviewReportDigestSha256,
      reviewResolutionDigestSha256: resolution.resolutionDigestSha256,
      enrichedCurationSpecDigestSha256,
    },
    policy: {
      exactDecisionSetApplied: true,
      relabelsUseCanonicalRoleProfiles: true,
      rejectedAssetsQuarantinedNotDeleted: true,
      originalHumanApprovalRetained: true,
      productionCatalogMutationPerformed: false,
    },
    counts: {
      sourceAssets: 2,
      directRoleAgreement: 1,
      keptHumanOverrides: 0,
      relabelled: 0,
      quarantined: 1,
      resolvedAssets: 1,
    },
    resolvedCurationSpecDigestSha256: hashJson(resolvedCuration),
    entries: [{
      assetId: rejected.assetId,
      contentHashSha256: rejected.contentHashSha256,
      decision: 'reject',
      previousRole: 'tick',
      resolvedRole: null,
      previousSemanticEvidenceDigestSha256: hashJson(rejected.semanticEvidence),
      resolvedSemanticEvidenceDigestSha256: null,
      note: 'Description is accurate; editorial role is not.',
    }],
  };
  const application = {
    ...applicationBody,
    receiptDigestSha256: hashJson(applicationBody),
  };
  await Promise.all([
    writeJson(
      path.join(migrationDirectory, 'semantic-migration-receipt.json'),
      migrationReceipt,
    ),
    writeJson(path.join(reviewDirectory, 'review-report.json'), reviewReport),
    writeJson(
      path.join(resolutionDirectory, 'semantic-review-resolution.json'),
      resolution,
    ),
    writeJson(
      path.join(resolutionDirectory, 'semantic-review-application-receipt.json'),
      application,
    ),
    writeJson(
      path.join(resolutionDirectory, 'resolved-curation-spec.json'),
      resolvedCuration,
    ),
  ]);
  return {
    root,
    workingDirectory,
    accepted: {
      ...accepted,
      audioPath: path.join(sourceAudioDirectory, accepted.sourcePath),
    },
    rejected,
    options: {
      migrationDirectory,
      reviewDirectory,
      resolutionDirectory,
      sourceManifestPath,
      sourceAudioDirectory,
      outputDirectory: '',
    },
  };
}

function makeAsset(
  providerAssetId: string,
  audio: Buffer,
  roles: {
    selectedRole: 'impact' | 'tick';
    topRole: 'impact' | 'shimmer';
    roleAgreement: boolean;
  },
) {
  const contentHashSha256 = hashBuffer(audio);
  const assetId = `sfx_catalog_${contentHashSha256.slice(0, 24)}`;
  const semanticEvidence = sfxCatalogSemanticEvidenceSchema.parse({
    version: 'sfx-catalog-semantic-evidence-v2',
    provider: 'clap-audio-classifier',
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    embeddingAnalysisDigestSha256: hashJson(['analysis', providerAssetId]),
    candidateDigestSha256: hashJson(['candidate', providerAssetId]),
    embeddingSourceHashSha256: contentHashSha256,
    catalogContentHashSha256: contentHashSha256,
    selectedRole: roles.selectedRole,
    selectedRoleCosineSimilarity: roles.roleAgreement ? 0.8 : 0.2,
    selectedRoleRank: roles.roleAgreement ? 1 : 2,
    topRole: roles.topRole,
    topRoleCosineSimilarity: roles.roleAgreement ? 0.8 : 0.7,
    roleAgreement: roles.roleAgreement,
    riskScores: [],
  });
  const sourceEntry = makeSourceEntry(
    assetId,
    providerAssetId,
    contentHashSha256,
    roles.selectedRole,
  );
  const sourcePath = `audio/${assetId}.wav`;
  const curationAsset = {
    sourcePath,
    title: sourceEntry.title,
    eventRoles: [roles.selectedRole],
    surfaces: ['transition'],
    layerRole: roles.selectedRole === 'impact' ? 'impact' : 'oneshot',
    tags: [roles.selectedRole, 'fixture'],
    negativeTags: [],
    energy: 0.7,
    brightness: 0.5,
    weight: 0.8,
    transientSharpness: 0.9,
    material: 'designed',
    tailMs: 100,
    loopable: false,
    direction: 'neutral',
    motionSpeed: 'fast',
    semanticEvidence,
    provenance: sourceEntry.provenance,
    approval: {
      status: 'approved',
      reviewerId: 'audio-reviewer',
      reviewedAt: NOW.toISOString(),
    },
  };
  return {
    assetId,
    audio,
    contentHashSha256,
    sourcePath,
    sourceEntry,
    semanticEvidence,
    curationAsset,
    migrationEntry: {
      assetId,
      sourcePath,
      contentHashSha256,
      candidateDigestSha256: semanticEvidence.candidateDigestSha256,
      selectedRole: roles.selectedRole,
      selectedRoleCosineSimilarity: semanticEvidence.selectedRoleCosineSimilarity,
      selectedRoleRank: semanticEvidence.selectedRoleRank,
      topRole: roles.topRole,
      topRoleCosineSimilarity: semanticEvidence.topRoleCosineSimilarity,
      roleAgreement: roles.roleAgreement,
      semanticEvidenceDigestSha256: hashJson(semanticEvidence),
    },
  };
}

function makeSourceEntry(
  assetId: string,
  providerAssetId: string,
  contentHashSha256: string,
  role: 'impact' | 'tick',
): SfxCatalogEntry {
  return {
    assetId,
    title: `Reviewed sound ${providerAssetId}`,
    audioUrl: `/sfx/catalog/${assetId}.wav`,
    durationMs: 1_000,
    contentHashSha256,
    mimeType: 'audio/wav',
    eventRoles: [role],
    surfaces: ['transition'],
    layerRole: role === 'impact' ? 'impact' : 'oneshot',
    tags: [role, 'fixture'],
    negativeTags: [],
    energy: 0.7,
    brightness: 0.5,
    weight: 0.8,
    transientSharpness: 0.9,
    material: 'designed',
    tailMs: 100,
    loopable: false,
    direction: 'neutral',
    motionSpeed: 'fast',
    measurement: {
      version: 'sfx-acoustic-measurement-v1',
      algorithm: 'ffmpeg-ebur128-v1',
      loudnessMetric: 'integrated-lufs',
      loudnessDb: -18,
      integratedLufs: -18,
      truePeakDbtp: -3,
      sampleRateHz: 48_000,
      channelCount: 1,
      durationMs: 1_000,
      measuredAt: NOW.toISOString(),
      sourceHashSha256: contentHashSha256,
    },
    provenance: {
      provider: 'freesound',
      providerAssetId,
      licenseId: 'cc0-1.0',
      licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
    },
    audioRights: {
      mediaRole: 'sfx',
      source: 'library',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: assetId,
        licenseId: 'cc0-1.0',
      },
    },
  };
}

function makeManifest(entries: SfxCatalogEntry[]): SfxCatalogManifest {
  return parseSfxCatalogManifest({
    version: 'sfx-catalog-v1',
    generatedAt: NOW.toISOString(),
    knowledgeGraphRefs: ['transition-sfx-pairing'],
    qualityPolicy: {
      minimumSelectionScore: 0.6,
      silenceFloorLufs: -60,
      maxTruePeakDbtp: -1,
      minSampleRateHz: 44_100,
      allowedChannelCounts: [1, 2],
      blockedTags: ['vocal'],
    },
    entries,
  });
}

function makeRuntime() {
  const embedAudio = vi.fn(async () => unitVector());
  const runtime: SfxClapEmbeddingRuntime = {
    descriptor: {
      provider: 'huggingface-transformers-js',
      packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
      modelId: SFX_CLAP_MODEL_ID,
      revision: SFX_CLAP_MODEL_REVISION,
      dtype: 'q8',
      sampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
      windowing: 'non-overlapping-10s-duration-weighted-mean',
    },
    embedTexts: vi.fn(async () => []),
    embedAudio,
  };
  return { runtime, embedAudio };
}

async function decodeFixtureAudio() {
  return {
    sampleRate: SFX_CLAP_SAMPLE_RATE_HZ,
    channelData: [new Float32Array(4_800).fill(0.1)],
  };
}

async function rewriteApplicationDigest(
  resolutionDirectory: string,
  resolvedCurationSpecDigestSha256: string,
): Promise<void> {
  const filePath = path.join(
    resolutionDirectory,
    'semantic-review-application-receipt.json',
  );
  const current = JSON.parse(await readFile(filePath, 'utf8'));
  const {
    receiptDigestSha256: _receiptDigestSha256,
    ...body
  } = current;
  body.resolvedCurationSpecDigestSha256 = resolvedCurationSpecDigestSha256;
  await writeJson(filePath, {
    ...body,
    receiptDigestSha256: hashJson(body),
  });
}

function unitVector(): Float32Array {
  const embedding = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  embedding[0] = 1;
  return embedding;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
