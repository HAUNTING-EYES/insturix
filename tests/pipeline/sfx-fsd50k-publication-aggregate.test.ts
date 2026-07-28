import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EncodedSfxInspection } from '../../lib/pipeline/audio-conditioning';
import {
  BUNDLED_SFX_CATALOG,
  selectSfxCatalogEntry,
  type SfxCatalogEventRole,
} from '../../lib/pipeline/sfx-catalog';
import {
  FSD50K_REVIEW_ROLE_PROFILES,
  type Fsd50kReviewBatchCandidate,
  type Fsd50kReviewBatchReport,
} from '../../lib/pipeline/sfx-fsd50k-review-batches';
import { gateFsd50kPublication } from '../../lib/pipeline/sfx-fsd50k-publication-gate';
import {
  aggregateFsd50kPublicationGates,
  prepareFsd50kCatalogMerge,
  promoteFsd50kMergedCatalog,
} from '../../lib/pipeline/sfx-fsd50k-publication-aggregate';
import { curateSfxCatalog } from '../../scripts/curate-sfx-catalog';

const NOW = new Date('2026-07-29T10:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

describe('FSD50K merge-safe publication', () => {
  it('preserves the live catalog while promoting only a fully published delta', async () => {
    const root = await makeTemporaryDirectory();
    const first = await makeGate(root, '101', 1, 'impact', createWav(440));
    const second = await makeGate(root, '202', 2, 'tick', createWav(880));
    const aggregate = await aggregateFsd50kPublicationGates({
      gateDirectories: [second, first],
      outputDirectory: path.join(root, 'aggregate'),
      generatedAt: NOW,
    });
    const curated = await curateAggregate(aggregate.outputDirectory);
    for (const curation of aggregate.curationSpec.assets) {
      const entry = curated.manifest.entries.find(
        candidate => candidate.provenance.providerAssetId === curation.provenance.providerAssetId,
      );
      const aggregateAsset = aggregate.receipt.assets.find(
        candidate => candidate.canonicalSourceId === curation.provenance.providerAssetId,
      );
      expect(entry?.semanticEvidence).toEqual(curation.semanticEvidence);
      expect(curation.semanticEvidence.embeddingSourceHashSha256)
        .toBe(hashBuffer(Buffer.from(`source-${curation.provenance.providerAssetId}`)));
      expect(curation.semanticEvidence.catalogContentHashSha256).toBe(entry?.contentHashSha256);
      expect(curation.semanticEvidence.embeddingSourceHashSha256)
        .not.toBe(curation.semanticEvidence.catalogContentHashSha256);
      expect(aggregateAsset?.embeddingSourceHashSha256)
        .toBe(curation.semanticEvidence.embeddingSourceHashSha256);
    }
    const merge = await prepareFsd50kCatalogMerge({
      aggregateDirectory: aggregate.outputDirectory,
      baseManifest: BUNDLED_SFX_CATALOG,
      deltaManifest: curated.manifest,
      deltaUploadPlan: curated.uploadPlan,
      outputDirectory: path.join(root, 'merge'),
      mergedAt: NOW,
    });

    expect(merge.receipt.counts).toEqual({
      existingAssets: BUNDLED_SFX_CATALOG.entries.length,
      deltaAssets: 2,
      mergedAssets: BUNDLED_SFX_CATALOG.entries.length + 2,
    });
    for (const current of BUNDLED_SFX_CATALOG.entries) {
      expect(merge.manifest.entries.find(entry => entry.assetId === current.assetId))
        .toEqual(current);
    }

    const publicationReceipt = buildPublicationReceipt(
      curated.manifest,
      curated.uploadPlan,
    );
    const promotion = await promoteFsd50kMergedCatalog({
      mergeDirectory: merge.outputDirectory,
      publicationReceipt,
      outputDirectory: path.join(root, 'promotion'),
      promotedAt: NOW,
    });
    expect(promotion.manifest).toEqual(merge.manifest);
    expect(promotion.receipt.policy).toEqual({
      allDeltaObjectsVerified: true,
      existingCatalogEntriesPreserved: true,
      liveManifestMutationPerformed: false,
    });
    expect(JSON.parse(await readFile(promotion.manifestPath, 'utf8')))
      .toEqual(merge.manifest);
  });

  it('rejects semantic evidence changed after its gate receipt was issued', async () => {
    const root = await makeTemporaryDirectory();
    const gateDirectory = await makeGate(root, '303', 1, 'whoosh', createWav(330));
    const curationPath = path.join(gateDirectory, 'curation-spec.json');
    const curation = JSON.parse(await readFile(curationPath, 'utf8')) as {
      assets: Array<{ semanticEvidence: { embeddingSourceHashSha256: string } }>;
    };
    curation.assets[0].semanticEvidence.embeddingSourceHashSha256 = 'f'.repeat(64);
    await writeFile(curationPath, JSON.stringify(curation));

    await expect(aggregateFsd50kPublicationGates({
      gateDirectories: [gateDirectory],
      outputDirectory: path.join(root, 'tampered-aggregate'),
    })).rejects.toMatchObject({ code: 'CURATION_SPEC_DIGEST_MISMATCH' });
  });

  it('rejects duplicate audio content across separately approved batches', async () => {
    const root = await makeTemporaryDirectory();
    const audio = createWav(550);
    const first = await makeGate(root, '404', 1, 'impact', audio);
    const second = await makeGate(root, '505', 2, 'pop', audio);

    await expect(aggregateFsd50kPublicationGates({
      gateDirectories: [first, second],
      outputDirectory: path.join(root, 'duplicate-aggregate'),
    })).rejects.toMatchObject({ code: 'DUPLICATE_AUDIO_CONTENT' });
  });

  it('rejects promotion when even one delta object lacks publication evidence', async () => {
    const root = await makeTemporaryDirectory();
    const first = await makeGate(root, '606', 1, 'impact', createWav(660));
    const second = await makeGate(root, '707', 2, 'tick', createWav(770));
    const aggregate = await aggregateFsd50kPublicationGates({
      gateDirectories: [first, second],
      outputDirectory: path.join(root, 'aggregate'),
      generatedAt: NOW,
    });
    const curated = await curateAggregate(aggregate.outputDirectory);
    const merge = await prepareFsd50kCatalogMerge({
      aggregateDirectory: aggregate.outputDirectory,
      baseManifest: BUNDLED_SFX_CATALOG,
      deltaManifest: curated.manifest,
      deltaUploadPlan: curated.uploadPlan,
      outputDirectory: path.join(root, 'merge'),
      mergedAt: NOW,
    });
    const incomplete = buildPublicationReceipt(curated.manifest, curated.uploadPlan);
    incomplete.assets.pop();

    await expect(promoteFsd50kMergedCatalog({
      mergeDirectory: merge.outputDirectory,
      publicationReceipt: incomplete,
      outputDirectory: path.join(root, 'unsafe-promotion'),
    })).rejects.toMatchObject({ code: 'PUBLICATION_RECEIPT_MISMATCH' });
  });

  it('ranks otherwise-equivalent approved sounds by reviewed audio role evidence', async () => {
    const root = await makeTemporaryDirectory();
    const lower = await makeGate(root, '808', 1, 'impact', createWav(480), 0.34);
    const higher = await makeGate(root, '909', 2, 'impact', createWav(960), 0.76);
    const aggregate = await aggregateFsd50kPublicationGates({
      gateDirectories: [lower, higher],
      outputDirectory: path.join(root, 'semantic-ranking-aggregate'),
      generatedAt: NOW,
    });
    const curated = await curateAggregate(aggregate.outputDirectory);

    const selection = selectSfxCatalogEntry(curated.manifest, {
      query: 'impact fixture',
      surface: 'scene',
      maxDurationSec: 2,
    });

    expect(selection.entry?.provenance.providerAssetId).toBe('909');
    expect(selection.report.candidates.map(candidate => ({
      providerAssetId: curated.manifest.entries.find(entry => entry.assetId === candidate.assetId)
        ?.provenance.providerAssetId,
      semanticRoleSimilarity: candidate.semanticRoleSimilarity,
    }))).toEqual([
      { providerAssetId: '909', semanticRoleSimilarity: 0.76 },
      { providerAssetId: '808', semanticRoleSimilarity: 0.34 },
    ]);
    expect(selection.report.candidates[0].reasons)
      .toContain('semantic-role-similarity:0.7600');
  });
});

async function curateAggregate(aggregateDirectory: string) {
  const curationSpec = JSON.parse(
    await readFile(path.join(aggregateDirectory, 'curation-spec.json'), 'utf8'),
  );
  return curateSfxCatalog(curationSpec, {
    sourceRoot: aggregateDirectory,
    publicAssetBaseUrl: '/sfx/catalog',
    now: NOW,
    detectFileType: async () => ({ ext: 'wav', mime: 'audio/wav' }),
    inspectAudio: async () => encodedInspection(),
  });
}

function buildPublicationReceipt(
  manifest: Awaited<ReturnType<typeof curateAggregate>>['manifest'],
  uploadPlan: Awaited<ReturnType<typeof curateAggregate>>['uploadPlan'],
) {
  return {
    version: 'sfx-catalog-publication-receipt-v1',
    manifestVersion: manifest.version,
    manifestGeneratedAt: manifest.generatedAt,
    manifestHashSha256: hashStableJson(manifest),
    publishedAt: NOW.toISOString(),
    bucketName: 'test-bucket',
    assets: uploadPlan.assets.map(asset => ({
      assetId: asset.assetId,
      r2Key: asset.r2Key,
      status: 'verified-existing',
      byteLength: asset.byteLength,
      contentHashSha256: asset.contentHashSha256,
    })),
  };
}

async function makeGate(
  root: string,
  canonicalSourceId: string,
  batchNumber: number,
  role: SfxCatalogEventRole,
  audio: Buffer,
  semanticRoleSimilarity = 0.8,
): Promise<string> {
  const reviewDirectory = path.join(root, `review-${batchNumber}`);
  await mkdir(path.join(reviewDirectory, 'audio'), { recursive: true });
  const inspection = encodedInspection();
  const candidate = makeCandidate(
    canonicalSourceId,
    role,
    audio,
    inspection,
    semanticRoleSimilarity,
  );
  await writeFile(
    path.join(reviewDirectory, candidate.conditionedAudioPath),
    audio,
  );
  const batchHash = hashJson({ canonicalSourceId, batchNumber });
  const reportWithoutDigest = {
    version: 'editron-fsd50k-review-batch-v1' as const,
    generatedAt: NOW.toISOString(),
    source: {
      candidatePoolSha256: hashJson(['pool', canonicalSourceId]),
      inspectionAnalysisDigestSha256: hashJson(['inspection', canonicalSourceId]),
      embeddingAnalysisDigestSha256: hashJson(['embedding', canonicalSourceId]),
    },
    batch: {
      batchId: `fsd50k_review_batch_${batchHash.slice(0, 24)}`,
      batchNumber,
      batchSize: 1,
      totalBatches: 2,
      totalRepresentatives: 2,
      firstRepresentativeOffset: batchNumber - 1,
    },
    policy: {
      publicationAllowed: false as const,
      productionCatalogMutationAllowed: false as const,
      humanReviewRequired: true as const,
      explicitPerAssetApprovalRequired: true as const,
      representativeApprovalPropagatesToClusterMembers: false as const,
    },
    roleProfiles: FSD50K_REVIEW_ROLE_PROFILES,
    candidates: [candidate],
  };
  const report: Fsd50kReviewBatchReport = {
    ...reportWithoutDigest,
    reportDigestSha256: hashJson(reportWithoutDigest),
  };
  await writeFile(
    path.join(reviewDirectory, 'review-batch.json'),
    JSON.stringify(report),
  );
  const gateDirectory = path.join(root, `gate-${batchNumber}`);
  await gateFsd50kPublication({
    reviewDirectory,
    decisionReceipt: {
      version: 'editron-fsd50k-review-decisions-v1',
      batchId: report.batch.batchId,
      reviewReportDigestSha256: report.reportDigestSha256,
      reviewerId: 'audio-lead',
      reviewedAt: NOW.toISOString(),
      decisions: [{
        reviewId: candidate.reviewId,
        candidateDigestSha256: candidate.candidateDigestSha256,
        status: 'approved',
        selectedRole: role,
        note: 'Approved fixture',
      }],
    },
    outputDirectory: gateDirectory,
    gatedAt: NOW,
    inspectAudio: async () => inspection,
  });
  return gateDirectory;
}

function makeCandidate(
  canonicalSourceId: string,
  role: SfxCatalogEventRole,
  audio: Buffer,
  inspection: EncodedSfxInspection,
  semanticRoleSimilarity: number,
): Fsd50kReviewBatchCandidate {
  const sourceHashSha256 = hashBuffer(Buffer.from(`source-${canonicalSourceId}`));
  const reviewId = `sfx_review_${sourceHashSha256.slice(0, 20)}`;
  const withoutDigest = {
    reviewId,
    canonicalSourceId,
    sourceAudioPath: `FSD50K.dev_audio/${canonicalSourceId}.wav`,
    sourceHashSha256,
    conditionedAudioPath: `audio/${reviewId}.wav`,
    conditionedHashSha256: hashBuffer(audio),
    gainDb: -2,
    sourceInspection: { ...inspection, truePeakDbtp: -1 },
    outputInspection: inspection,
    acousticMeasurement: {
      version: 'sfx-acoustic-measurement-v1' as const,
      algorithm: 'ffmpeg-ebur128-v1' as const,
      loudnessMetric: 'integrated-lufs' as const,
      loudnessDb: -18,
      integratedLufs: -18,
      truePeakDbtp: -3,
      sampleRateHz: 48_000,
      channelCount: 1,
      durationMs: 1_000,
      measuredAt: NOW.toISOString(),
      sourceHashSha256,
    },
    title: `fixture-${canonicalSourceId}.wav`,
    tags: [role, 'fixture'],
    negativeTags: [],
    suggestedRole: role,
    suggestedRoleScore: semanticRoleSimilarity,
    semanticRoles: [{ role, prompt: role, cosineSimilarity: semanticRoleSimilarity }],
    semanticRisks: [],
    sourceEvidence: [{
      sourceId: canonicalSourceId,
      status: 'accepted-for-embedding' as const,
      labels: [role],
      provisionalEditorialRoles: [role],
      provisionalRoleEvidence: [`${role}:ground-truth-label:${role}`],
      metadataRiskFlags: [],
    }],
    cluster: {
      clusterId: `cluster-${canonicalSourceId}`,
      duplicateCandidate: false,
      canonicalSourceIds: [canonicalSourceId],
      allSourceIds: [canonicalSourceId],
      representativeCanonicalSourceId: canonicalSourceId,
      deferredCanonicalSourceIds: [],
      deferredSourceIds: [],
    },
    rights: {
      provider: 'fsd50k' as const,
      upstreamProvider: 'freesound' as const,
      providerAssetId: canonicalSourceId,
      datasetVersion: '1.0' as const,
      zenodoRecordId: '4060432' as const,
      licenseId: 'cc0-1.0' as const,
      licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/' as const,
      attributionRequired: false as const,
    },
  };
  return {
    ...withoutDigest,
    candidateDigestSha256: hashJson(withoutDigest),
  };
}

function encodedInspection(): EncodedSfxInspection {
  return {
    durationMs: 1_000,
    sampleRate: 48_000,
    channels: 1,
    loudness: { metric: 'integrated-lufs', valueDb: -18 },
    truePeakDbtp: -3,
    clippingRisk: false,
  };
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-fsd50k-aggregate-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createWav(frequencyHz: number): Buffer {
  const sampleRate = 48_000;
  const samples = Math.round(sampleRate * 0.08);
  const dataBytes = samples * 2;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < samples; frame += 1) {
    const sample = 0.08 * Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  return wav;
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashStableJson(value: unknown): string {
  return hashBuffer(Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}
