import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EncodedSfxInspection } from '../../lib/pipeline/audio-conditioning';
import type { SfxCatalogManifest } from '../../lib/pipeline/sfx-catalog';
import {
  FSD50K_REVIEW_ROLE_PROFILES,
  type Fsd50kReviewBatchCandidate,
  type Fsd50kReviewBatchReport,
} from '../../lib/pipeline/sfx-fsd50k-review-batches';
import { gateFsd50kPublication } from '../../lib/pipeline/sfx-fsd50k-publication-gate';
import {
  aggregateFsd50kPublicationGates,
  prepareFsd50kCatalogMerge,
  reconcileFsd50kPublicationGate,
} from '../../lib/pipeline/sfx-fsd50k-publication-aggregate';
import { curateSfxCatalog } from '../../scripts/curate-sfx-catalog';

const NOW = new Date('2026-08-01T08:00:00.000Z');
const LATER = new Date('2026-08-01T09:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('FSD50K superseding review reconciliation', () => {
  it('stages only the newly approved asset and preserves merge evidence', async () => {
    const fixture = await makeFixture();
    const aggregate = await reconcileFsd50kPublicationGate({
      previousGateDirectory: fixture.previousGate,
      supersedingGateDirectory: fixture.supersedingGate,
      baseManifest: fixture.baseManifest,
      outputDirectory: path.join(fixture.root, 'incremental'),
      generatedAt: LATER,
    });

    expect(aggregate.receipt.version)
      .toBe('editron-fsd50k-incremental-publication-aggregate-v1');
    if (aggregate.receipt.version !== 'editron-fsd50k-incremental-publication-aggregate-v1') {
      throw new Error('Expected incremental receipt');
    }
    expect(aggregate.receipt.counts).toEqual({
      sourceGates: 1,
      approvedAssets: 1,
      previousApprovedAssets: 1,
      supersedingApprovedAssets: 2,
      reusedExistingAssets: 1,
    });
    expect(aggregate.receipt.reconciliation.reusedExisting[0].canonicalSourceId).toBe('101');
    expect(aggregate.receipt.assets.map(asset => asset.canonicalSourceId)).toEqual(['202']);
    expect(aggregate.curationSpec.assets.map(asset => asset.provenance.providerAssetId))
      .toEqual(['202']);

    const delta = await curateDirectory(aggregate.outputDirectory);
    const merge = await prepareFsd50kCatalogMerge({
      aggregateDirectory: aggregate.outputDirectory,
      baseManifest: fixture.baseManifest,
      deltaManifest: delta.manifest,
      deltaUploadPlan: delta.uploadPlan,
      outputDirectory: path.join(fixture.root, 'merge'),
      mergedAt: LATER,
    });
    expect(merge.receipt.counts).toEqual({
      existingAssets: 1,
      deltaAssets: 1,
      mergedAssets: 2,
    });
  });

  it('rejects a superseding gate that removes a prior approval', async () => {
    const fixture = await makeFixture({ removePreviousApproval: true });

    await expect(reconcileFsd50kPublicationGate({
      previousGateDirectory: fixture.previousGate,
      supersedingGateDirectory: fixture.supersedingGate,
      baseManifest: fixture.baseManifest,
      outputDirectory: path.join(fixture.root, 'unsafe-removed'),
    })).rejects.toMatchObject({ code: 'PREVIOUS_APPROVAL_REMOVED' });
  });

  it('rejects live manifest evidence that differs from the prior gate', async () => {
    const fixture = await makeFixture();
    const changedManifest: SfxCatalogManifest = structuredClone(fixture.baseManifest);
    changedManifest.entries[0].title = 'Changed after publication.wav';

    await expect(reconcileFsd50kPublicationGate({
      previousGateDirectory: fixture.previousGate,
      supersedingGateDirectory: fixture.supersedingGate,
      baseManifest: changedManifest,
      outputDirectory: path.join(fixture.root, 'unsafe-evidence'),
    })).rejects.toMatchObject({ code: 'PREVIOUS_APPROVAL_EVIDENCE_MISMATCH' });
  });

  it('rejects a newly approved asset that is already present in the base catalog', async () => {
    const fixture = await makeFixture();
    const supersedingCatalog = await curateDirectory(fixture.supersedingGate);
    const alreadyLive: SfxCatalogManifest = {
      ...fixture.baseManifest,
      entries: supersedingCatalog.manifest.entries,
    };

    await expect(reconcileFsd50kPublicationGate({
      previousGateDirectory: fixture.previousGate,
      supersedingGateDirectory: fixture.supersedingGate,
      baseManifest: alreadyLive,
      outputDirectory: path.join(fixture.root, 'unsafe-duplicate'),
    })).rejects.toMatchObject({ code: 'NEW_APPROVAL_ALREADY_LIVE' });
  });
});

async function makeFixture(options: { removePreviousApproval?: boolean } = {}) {
  const root = await makeTemporaryDirectory();
  const reviewDirectory = path.join(root, 'review');
  await mkdir(path.join(reviewDirectory, 'audio'), { recursive: true });
  const candidates = [
    makeCandidate('101', 'impact', createWav(440)),
    makeCandidate('202', 'tick', createWav(880)),
    makeCandidate('303', 'ambience', createWav(220)),
  ];
  for (const candidate of candidates) {
    await writeFile(
      path.join(reviewDirectory, candidate.value.conditionedAudioPath),
      candidate.audio,
    );
  }
  const report = makeReport(candidates.map(candidate => candidate.value));
  await writeFile(path.join(reviewDirectory, 'review-batch.json'), JSON.stringify(report));
  const previousGate = await makeGate(
    reviewDirectory,
    report,
    candidates,
    ['approved', 'pending', 'pending'],
    path.join(root, 'previous-gate'),
    NOW,
  );
  const supersedingGate = await makeGate(
    reviewDirectory,
    report,
    candidates,
    options.removePreviousApproval
      ? ['rejected', 'approved', 'approved']
      : ['approved', 'approved', 'pending'],
    path.join(root, 'superseding-gate'),
    LATER,
  );
  const previousAggregate = await aggregateFsd50kPublicationGates({
    gateDirectories: [previousGate],
    outputDirectory: path.join(root, 'previous-aggregate'),
    generatedAt: NOW,
  });
  const baseManifest = (await curateDirectory(previousAggregate.outputDirectory)).manifest;
  return { root, previousGate, supersedingGate, baseManifest };
}

async function makeGate(
  reviewDirectory: string,
  report: Fsd50kReviewBatchReport,
  candidates: CandidateFixture[],
  statuses: Array<'approved' | 'rejected' | 'pending'>,
  outputDirectory: string,
  gatedAt: Date,
): Promise<string> {
  await gateFsd50kPublication({
    reviewDirectory,
    decisionReceipt: {
      version: 'editron-fsd50k-review-decisions-v1',
      batchId: report.batch.batchId,
      reviewReportDigestSha256: report.reportDigestSha256,
      reviewerId: 'audio-lead',
      reviewedAt: gatedAt.toISOString(),
      decisions: candidates.map((candidate, index) => ({
        reviewId: candidate.value.reviewId,
        candidateDigestSha256: candidate.value.candidateDigestSha256,
        status: statuses[index],
        selectedRole: candidate.value.suggestedRole,
        note: statuses[index] === 'approved' ? 'Approved fixture' : '',
      })),
    },
    outputDirectory,
    gatedAt,
    inspectAudio: async () => encodedInspection(),
  });
  return outputDirectory;
}

function makeReport(candidates: Fsd50kReviewBatchCandidate[]): Fsd50kReviewBatchReport {
  const withoutDigest = {
    version: 'editron-fsd50k-review-batch-v1' as const,
    generatedAt: NOW.toISOString(),
    source: {
      candidatePoolSha256: hashJson(['pool', ...candidates.map(item => item.canonicalSourceId)]),
      inspectionAnalysisDigestSha256: hashJson(['inspection']),
      embeddingAnalysisDigestSha256: hashJson(['embedding']),
    },
    batch: {
      batchId: `fsd50k_review_batch_${hashJson(candidates).slice(0, 24)}`,
      batchNumber: 1,
      batchSize: candidates.length,
      totalBatches: 1,
      totalRepresentatives: candidates.length,
      firstRepresentativeOffset: 0,
    },
    policy: {
      publicationAllowed: false as const,
      productionCatalogMutationAllowed: false as const,
      humanReviewRequired: true as const,
      explicitPerAssetApprovalRequired: true as const,
      representativeApprovalPropagatesToClusterMembers: false as const,
    },
    roleProfiles: FSD50K_REVIEW_ROLE_PROFILES,
    candidates,
  };
  return { ...withoutDigest, reportDigestSha256: hashJson(withoutDigest) };
}

interface CandidateFixture {
  value: Fsd50kReviewBatchCandidate;
  audio: Buffer;
}

function makeCandidate(
  canonicalSourceId: string,
  role: 'impact' | 'tick' | 'ambience',
  audio: Buffer,
): CandidateFixture {
  const inspection = encodedInspection();
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
    suggestedRoleScore: 0.8,
    semanticRoles: [{ role, prompt: role, cosineSimilarity: 0.8 }],
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
    audio,
    value: { ...withoutDigest, candidateDigestSha256: hashJson(withoutDigest) },
  };
}

async function curateDirectory(directory: string) {
  const curationSpec = JSON.parse(
    await readFile(path.join(directory, 'curation-spec.json'), 'utf8'),
  );
  return curateSfxCatalog(curationSpec, {
    sourceRoot: directory,
    publicAssetBaseUrl: '/sfx/catalog',
    now: NOW,
    detectFileType: async () => ({ ext: 'wav', mime: 'audio/wav' }),
    inspectAudio: async () => encodedInspection(),
  });
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
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-fsd50k-reconcile-'));
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
