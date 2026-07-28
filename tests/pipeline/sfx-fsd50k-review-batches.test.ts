import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ConditionSfxCatalogAssetResult } from '../../lib/pipeline/audio-conditioning';
import {
  prepareFsd50kReviewBatch,
  validateFsd50kReviewBatchReport,
} from '../../lib/pipeline/sfx-fsd50k-review-batches';

const temporaryDirectories: string[] = [];
const NOW = new Date('2026-07-29T08:00:00.000Z');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

describe('FSD50K production review batches', () => {
  it('conditions only deterministic representatives and defers every cluster member', async () => {
    const fixture = await makeFixture();
    const outputDirectory = path.join(fixture.root, 'review-1');
    const prepared = await prepareFsd50kReviewBatch({
      ...fixture.inputs,
      outputDirectory,
      batchNumber: 1,
      batchSize: 1,
      generatedAt: NOW,
      conditionAsset: fakeCondition,
    });

    expect(prepared.report.batch).toMatchObject({
      batchNumber: 1,
      batchSize: 1,
      totalBatches: 2,
      totalRepresentatives: 2,
    });
    expect(prepared.report.candidates).toHaveLength(1);
    expect(prepared.report.candidates[0]).toMatchObject({
      canonicalSourceId: '1',
      suggestedRole: 'whoosh',
      cluster: {
        representativeCanonicalSourceId: '1',
        deferredCanonicalSourceIds: ['2'],
        deferredSourceIds: ['2', '20'],
      },
      rights: {
        licenseId: 'cc0-1.0',
        attributionRequired: false,
      },
    });
    expect(prepared.report.policy.representativeApprovalPropagatesToClusterMembers).toBe(false);
    expect(validateFsd50kReviewBatchReport(
      JSON.parse(await readFile(prepared.reportPath, 'utf8')),
    ).reportDigestSha256).toBe(prepared.report.reportDigestSha256);
    expect(await readFile(
      path.join(outputDirectory, prepared.report.candidates[0].conditionedAudioPath),
    )).toEqual(Buffer.from('conditioned:source-1'));
    expect(await readFile(prepared.indexPath, 'utf8')).toContain(
      'no cluster approval inheritance',
    );
  });

  it('fails closed when P3 evidence or corpus rights are modified', async () => {
    const fixture = await makeFixture();
    fixture.inputs.embeddingReport.counts.representatives = 9;
    await expect(prepareFsd50kReviewBatch({
      ...fixture.inputs,
      outputDirectory: path.join(fixture.root, 'tampered-p3'),
      batchNumber: 1,
      conditionAsset: fakeCondition,
    })).rejects.toMatchObject({ code: 'EMBEDDING_DIGEST_MISMATCH' });

    const rightsFixture = await makeFixture();
    rightsFixture.inputs.corpusPlan.entries[0].provenance.clipLicenseId = 'cc-by-4.0';
    rightsFixture.inputs.corpusPlan.candidatePoolSha256 = hashJson(
      rightsFixture.inputs.corpusPlan.entries,
    );
    rightsFixture.inputs.inspectionIndex.source.candidatePoolSha256 =
      rightsFixture.inputs.corpusPlan.candidatePoolSha256;
    refreshAnalysisDigest(rightsFixture.inputs.inspectionIndex);
    rightsFixture.inputs.embeddingReport.source.candidatePoolSha256 =
      rightsFixture.inputs.corpusPlan.candidatePoolSha256;
    rightsFixture.inputs.embeddingReport.source.inspectionAnalysisDigestSha256 =
      rightsFixture.inputs.inspectionIndex.analysisDigestSha256;
    refreshAnalysisDigest(rightsFixture.inputs.embeddingReport);
    await expect(prepareFsd50kReviewBatch({
      ...rightsFixture.inputs,
      outputDirectory: path.join(rightsFixture.root, 'bad-rights'),
      batchNumber: 1,
      conditionAsset: fakeCondition,
    })).rejects.toMatchObject({ code: 'INVALID_RIGHTS_EVIDENCE' });
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-fsd50k-review-batch-'));
  temporaryDirectories.push(root);
  const extractionDirectory = path.join(root, 'extracted');
  await mkdir(path.join(extractionDirectory, 'FSD50K.dev_audio'), { recursive: true });
  const sources = [
    { sourceId: '1', canonicalSourceId: '1', bytes: Buffer.from('source-1'), role: 'whoosh' },
    { sourceId: '2', canonicalSourceId: '2', bytes: Buffer.from('source-2'), role: 'impact' },
    { sourceId: '20', canonicalSourceId: '2', bytes: Buffer.from('source-2'), role: 'impact' },
    { sourceId: '3', canonicalSourceId: '3', bytes: Buffer.from('source-3'), role: 'tick' },
  ] as const;
  for (const source of sources.filter(item => item.sourceId === item.canonicalSourceId)) {
    await writeFile(
      path.join(extractionDirectory, 'FSD50K.dev_audio', `${source.sourceId}.wav`),
      source.bytes,
    );
  }
  const entries = sources.map(source => corpusEntry(source.sourceId, source.role));
  const corpusPlan = {
    version: 'editron-fsd50k-corpus-plan-v1',
    generatedAt: NOW.toISOString(),
    candidatePoolSha256: hashJson(entries),
    archiveSetSha256: 'b'.repeat(64),
    dataset: { version: '1.0', zenodoRecordId: '4060432', clipLicenseAllowlist: ['cc0-1.0'] },
    policy: {
      purpose: 'offline-audio-inspection-embedding-and-curation',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyCandidateRequiresAudioInspection: true,
      everyCandidateRequiresEmbeddingClassification: true,
    },
    counts: {
      candidates: entries.length,
      devCandidates: entries.length,
      evalCandidates: 0,
      metadataRiskFlagged: 0,
      provisionallyRoleMapped: entries.length,
      groundTruthRoleMapped: entries.length,
      archiveParts: 1,
      archiveDownloadBytes: 1,
    },
    archives: [],
    entries,
  };
  const queue = ['1', '2', '3'].map(sourceId => {
    const source = sources.find(item => item.sourceId === sourceId)!;
    return {
      canonicalSourceId: sourceId,
      sourceAudioPath: `FSD50K.dev_audio/${sourceId}.wav`,
      sourceHashSha256: hashBuffer(source.bytes),
      memberSourceIds: sourceId === '2' ? ['2', '20'] : [sourceId],
      measurement: measurement(hashBuffer(source.bytes)),
    };
  });
  const inspectionWithoutDigest = {
    version: 'editron-fsd50k-inspection-index-v1',
    completedAt: NOW.toISOString(),
    source: {
      candidatePoolSha256: corpusPlan.candidatePoolSha256,
      archiveSetSha256: corpusPlan.archiveSetSha256,
      extractionDigestSha256: 'c'.repeat(64),
    },
    selection: {
      mode: 'full-corpus',
      requestedLimit: null,
      selectionSha256: 'd'.repeat(64),
    },
    policy: {
      version: 'editron-fsd50k-inspection-policy-v1',
      purpose: 'offline-acoustic-screening-and-exact-dedup',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      acoustic: {
        silenceFloorLufs: -60,
        maxTruePeakDbtp: -1,
        minSampleRateHz: 44_100,
        allowedChannelCounts: [1, 2],
        maxDurationMs: 30_000,
      },
      metadata: { definitiveRejectFlags: [], quarantineFlags: [] },
      policySha256: 'e'.repeat(64),
    },
    counts: {
      plannedCandidates: 4,
      selectedCandidates: 4,
      completedCheckpoints: 4,
      uniqueContentHashes: 3,
      exactDuplicateGroups: 1,
      exactDuplicateEntries: 2,
      exactDuplicatesBeyondCanonical: 1,
      acceptedForEmbedding: 4,
      quarantinedMetadata: 0,
      rejectedMetadata: 0,
      rejectedAcoustic: 0,
      embeddingQueueUniqueAudio: 3,
    },
    entries: [],
    exactDuplicateGroups: [],
    embeddingQueue: queue,
  };
  const inspectionIndex = {
    ...inspectionWithoutDigest,
    analysisDigestSha256: digestWithoutCompleted(inspectionWithoutDigest),
  };
  const embeddingEntries = [
    embeddingEntry('1', sources[0].bytes, ['1'], 'whoosh', 'cluster-a', true),
    embeddingEntry('2', sources[1].bytes, ['2', '20'], 'impact', 'cluster-a', false),
    embeddingEntry('3', sources[3].bytes, ['3'], 'tick', 'cluster-b', true),
  ];
  const clusters = [
    {
      clusterId: 'cluster-a',
      duplicateCandidate: true,
      canonicalSourceIds: ['1', '2'],
      allSourceIds: ['1', '2', '20'],
      representativeCanonicalSourceId: '1',
      representativeRule: 'accepted-metadata-then-highest-role-score-then-source-id',
      verifiedEdgeCount: 1,
      minimumVerifiedEdgeSimilarity: 0.99,
      maximumVerifiedEdgeSimilarity: 0.99,
    },
    {
      clusterId: 'cluster-b',
      duplicateCandidate: false,
      canonicalSourceIds: ['3'],
      allSourceIds: ['3'],
      representativeCanonicalSourceId: '3',
      representativeRule: 'accepted-metadata-then-highest-role-score-then-source-id',
      verifiedEdgeCount: 0,
      minimumVerifiedEdgeSimilarity: 0,
      maximumVerifiedEdgeSimilarity: 0,
    },
  ];
  const embeddingWithoutDigest = {
    version: 'editron-fsd50k-clap-ann-v1',
    completedAt: NOW.toISOString(),
    source: {
      inspectionAnalysisDigestSha256: inspectionIndex.analysisDigestSha256,
      candidatePoolSha256: corpusPlan.candidatePoolSha256,
      extractionDigestSha256: inspectionIndex.source.extractionDigestSha256,
    },
    selection: {
      mode: 'full-embedding-queue',
      requestedLimit: null,
      selectedUniqueAudio: 3,
      selectionSha256: 'f'.repeat(64),
    },
    policy: {
      purpose: 'offline-semantic-screening-and-near-duplicate-candidate-discovery',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      humanReviewRequired: true,
      representativeApprovalPropagatesToClusterMembers: false,
    },
    model: {},
    preprocessing: {},
    prompts: {},
    ann: {},
    duplicateSimilarityThreshold: 0.98,
    counts: {
      queuedUniqueAudio: 3,
      embeddedUniqueAudio: 3,
      sourceIdsRepresented: 4,
      clusters: 2,
      duplicateCandidateClusters: 1,
      duplicateCandidateCanonicalEntries: 2,
      representatives: 2,
      acceptedMetadataEntries: 3,
      quarantinedMetadataEntries: 0,
    },
    entries: embeddingEntries,
    clusters,
  };
  const embeddingReport = {
    ...embeddingWithoutDigest,
    analysisDigestSha256: digestWithoutCompleted(embeddingWithoutDigest),
  };
  return {
    root,
    inputs: {
      corpusPlan,
      inspectionIndex,
      embeddingReport,
      extractionDirectory,
    },
  };
}

function corpusEntry(sourceId: string, role: string) {
  return {
    sourceId,
    sourceSplit: 'dev',
    sourceTrainingSplit: 'train',
    sourceAudioPath: `FSD50K.dev_audio/${sourceId}.wav`,
    title: `${role}-${sourceId}.wav`,
    uploader: 'fixture',
    labels: [role],
    mids: ['/m/fixture'],
    uploaderTags: [role],
    provisionalEditorialRoles: [role],
    provisionalRoleEvidence: [`${role}:ground-truth-label:${role}`],
    metadataRiskFlags: [],
    provenance: {
      provider: 'fsd50k',
      upstreamProvider: 'freesound',
      providerAssetId: sourceId,
      datasetVersion: '1.0',
      zenodoRecordId: '4060432',
      clipLicenseId: 'cc0-1.0',
      clipLicenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
      clipAttributionRequired: false,
      datasetLicense: {
        id: 'cc-by-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attributionRequired: true,
        citation: 'FSD50K',
      },
    },
  };
}

function embeddingEntry(
  sourceId: string,
  bytes: Buffer,
  memberSourceIds: string[],
  role: 'whoosh' | 'impact' | 'tick',
  clusterId: string,
  representative: boolean,
) {
  return {
    canonicalSourceId: sourceId,
    sourceAudioPath: `FSD50K.dev_audio/${sourceId}.wav`,
    sourceHashSha256: hashBuffer(bytes),
    memberSourceIds,
    checkpointPath: `checkpoints/${sourceId}.json`,
    segmentCount: 1,
    topRole: role,
    topRoleScore: 0.8,
    semanticRoles: [{ role, prompt: role, cosineSimilarity: 0.8 }],
    semanticRisks: [],
    sourceEvidence: memberSourceIds.map(id => ({
      sourceId: id,
      status: 'accepted-for-embedding',
      labels: [role],
      provisionalEditorialRoles: [role],
      provisionalRoleEvidence: [`${role}:ground-truth-label:${role}`],
      metadataRiskFlags: [],
    })),
    annNeighbours: [],
    clusterId,
    representative,
  };
}

function measurement(sourceHashSha256: string) {
  return {
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
    sourceHashSha256,
  };
}

async function fakeCondition(buffer: Buffer): Promise<ConditionSfxCatalogAssetResult> {
  const output = Buffer.from(`conditioned:${buffer.toString()}`);
  return {
    buffer: output,
    contentType: 'audio/wav',
    filenameExtension: 'wav',
    gainDb: -2,
    targetTruePeakDbtp: -1,
    source: inspection(-1),
    output: inspection(-3),
  };
}

function inspection(truePeakDbtp: number) {
  return {
    durationMs: 1_000,
    sampleRate: 48_000,
    channels: 1,
    loudness: { metric: 'integrated-lufs' as const, valueDb: -18 },
    truePeakDbtp,
    clippingRisk: false,
  };
}

function digestWithoutCompleted(value: Record<string, unknown>): string {
  const { completedAt: _completedAt, ...payload } = value;
  return hashJson(payload);
}

function refreshAnalysisDigest(
  value: Record<string, unknown> & { analysisDigestSha256: string },
): void {
  const {
    analysisDigestSha256: _analysisDigestSha256,
    completedAt: _completedAt,
    ...payload
  } = value;
  value.analysisDigestSha256 = hashJson(payload);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
