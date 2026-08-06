import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EncodedSfxInspection } from '../../lib/pipeline/audio-conditioning';
import {
  FSD50K_REVIEW_ROLE_PROFILES,
  type Fsd50kReviewBatchCandidate,
  type Fsd50kReviewBatchReport,
} from '../../lib/pipeline/sfx-fsd50k-review-batches';
import {
  gateFsd50kPublication,
} from '../../lib/pipeline/sfx-fsd50k-publication-gate';

const NOW = new Date('2026-07-29T09:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

describe('FSD50K publication gate', () => {
  it('stages only explicitly approved representatives and never their cluster members', async () => {
    const fixture = await makeFixture();
    const outputDirectory = path.join(fixture.root, 'gated');
    const gated = await gateFsd50kPublication({
      reviewDirectory: fixture.reviewDirectory,
      decisionReceipt: fixture.decisions,
      outputDirectory,
      gatedAt: NOW,
      inspectAudio: async () => fixture.inspection,
    });

    expect(gated.curationSpec.assets).toHaveLength(1);
    expect(gated.curationSpec.assets[0]).toMatchObject({
      sourcePath: `audio/${fixture.candidates[0].reviewId}.wav`,
      eventRoles: ['impact'],
      negativeTags: ['primary-label-music'],
      provenance: {
        providerAssetId: '1',
        licenseId: 'cc0-1.0',
      },
      approval: {
        reviewerId: 'audio-lead',
      },
    });
    expect(gated.receipt.counts).toEqual({
      candidates: 2,
      approved: 1,
      rejected: 1,
      pending: 0,
      deferredCanonicalClusterMembers: 1,
      deferredSourceIds: 2,
    });
    expect(gated.receipt.approved.map(item => item.canonicalSourceId)).toEqual(['1']);
    expect(gated.receipt.source.curationSpecDigestSha256).toBe(
      hashJson(gated.curationSpec),
    );
    expect(JSON.stringify(gated.curationSpec)).not.toContain('"2"');
    expect(await readFile(
      path.join(outputDirectory, `audio/${fixture.candidates[0].reviewId}.wav`),
    )).toEqual(fixture.audio[0]);
  });

  it('rejects unbound decisions and reviewed audio changed after approval', async () => {
    const fixture = await makeFixture();
    fixture.decisions.decisions[0].candidateDigestSha256 = 'f'.repeat(64);
    await expect(gateFsd50kPublication({
      reviewDirectory: fixture.reviewDirectory,
      decisionReceipt: fixture.decisions,
      outputDirectory: path.join(fixture.root, 'bad-decision'),
      inspectAudio: async () => fixture.inspection,
    })).rejects.toMatchObject({ code: 'DECISION_EVIDENCE_MISMATCH' });

    const audioFixture = await makeFixture();
    await writeFile(
      path.join(
        audioFixture.reviewDirectory,
        audioFixture.candidates[0].conditionedAudioPath,
      ),
      Buffer.from('changed'),
    );
    await expect(gateFsd50kPublication({
      reviewDirectory: audioFixture.reviewDirectory,
      decisionReceipt: audioFixture.decisions,
      outputDirectory: path.join(audioFixture.root, 'changed-audio'),
      inspectAudio: async () => audioFixture.inspection,
    })).rejects.toMatchObject({ code: 'REVIEW_AUDIO_HASH_MISMATCH' });
  });

  it('rejects a receipt that omits any candidate decision', async () => {
    const fixture = await makeFixture();
    fixture.decisions.decisions.pop();
    await expect(gateFsd50kPublication({
      reviewDirectory: fixture.reviewDirectory,
      decisionReceipt: fixture.decisions,
      outputDirectory: path.join(fixture.root, 'missing-decision'),
      inspectAudio: async () => fixture.inspection,
    })).rejects.toMatchObject({ code: 'INVALID_DECISION_RECEIPT' });
  });

  it('rejects a rehashed review report with a path-bearing review ID', async () => {
    const fixture = await makeFixture();
    const reportPath = path.join(fixture.reviewDirectory, 'review-batch.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as Fsd50kReviewBatchReport;
    const candidate = report.candidates[0];
    candidate.reviewId = '../escape';
    candidate.conditionedAudioPath = 'audio/../escape.wav';
    const {
      candidateDigestSha256: _candidateDigestSha256,
      ...candidatePayload
    } = candidate;
    candidate.candidateDigestSha256 = hashJson(candidatePayload);
    const { reportDigestSha256: _reportDigestSha256, ...reportPayload } = report;
    report.reportDigestSha256 = hashJson(reportPayload);
    fixture.decisions.reviewReportDigestSha256 = report.reportDigestSha256;
    fixture.decisions.decisions[0].reviewId = candidate.reviewId;
    fixture.decisions.decisions[0].candidateDigestSha256 = candidate.candidateDigestSha256;
    await writeFile(reportPath, JSON.stringify(report));

    await expect(gateFsd50kPublication({
      reviewDirectory: fixture.reviewDirectory,
      decisionReceipt: fixture.decisions,
      outputDirectory: path.join(fixture.root, 'unsafe-review-id'),
      inspectAudio: async () => fixture.inspection,
    })).rejects.toMatchObject({ code: 'INVALID_REVIEW_CANDIDATE' });
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-fsd50k-gate-'));
  temporaryDirectories.push(root);
  const reviewDirectory = path.join(root, 'review');
  await mkdir(path.join(reviewDirectory, 'audio'), { recursive: true });
  const audio = [Buffer.from('conditioned-one'), Buffer.from('conditioned-three')];
  const inspection = encodedInspection();
  const candidates = [
    candidate(
      '1',
      audio[0],
      'cluster-a',
      ['2'],
      ['2', '20'],
      inspection,
      ['uploader-metadata-noisy', 'primary-label-music'],
    ),
    candidate('3', audio[1], 'cluster-b', [], [], inspection),
  ];
  await Promise.all(candidates.map((item, index) => writeFile(
    path.join(reviewDirectory, item.conditionedAudioPath),
    audio[index],
  )));
  const reportWithoutDigest = {
    version: 'editron-fsd50k-review-batch-v1' as const,
    generatedAt: NOW.toISOString(),
    source: {
      candidatePoolSha256: 'a'.repeat(64),
      inspectionAnalysisDigestSha256: 'b'.repeat(64),
      embeddingAnalysisDigestSha256: 'c'.repeat(64),
    },
    batch: {
      batchId: `fsd50k_review_batch_${'d'.repeat(24)}`,
      batchNumber: 1,
      batchSize: 2,
      totalBatches: 1,
      totalRepresentatives: 2,
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
  const report: Fsd50kReviewBatchReport = {
    ...reportWithoutDigest,
    reportDigestSha256: hashJson(reportWithoutDigest),
  };
  await writeFile(
    path.join(reviewDirectory, 'review-batch.json'),
    JSON.stringify(report),
  );
  const decisions = {
    version: 'editron-fsd50k-review-decisions-v1',
    batchId: report.batch.batchId,
    reviewReportDigestSha256: report.reportDigestSha256,
    reviewerId: 'audio-lead',
    reviewedAt: NOW.toISOString(),
    decisions: [
      {
        reviewId: candidates[0].reviewId,
        candidateDigestSha256: candidates[0].candidateDigestSha256,
        status: 'approved',
        selectedRole: 'impact',
        note: 'Clean impact',
      },
      {
        reviewId: candidates[1].reviewId,
        candidateDigestSha256: candidates[1].candidateDigestSha256,
        status: 'rejected',
        selectedRole: 'tick',
        note: 'Noisy',
      },
    ],
  };
  return { root, reviewDirectory, audio, candidates, inspection, decisions };
}

function candidate(
  canonicalSourceId: string,
  audio: Buffer,
  clusterId: string,
  deferredCanonicalSourceIds: string[],
  deferredSourceIds: string[],
  inspection: EncodedSfxInspection,
  negativeTags: string[] = [],
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
    tags: ['impact', 'fixture'],
    negativeTags,
    suggestedRole: 'impact' as const,
    suggestedRoleScore: 0.8,
    semanticRoles: [{ role: 'impact' as const, prompt: 'impact', cosineSimilarity: 0.8 }],
    semanticRisks: [],
    sourceEvidence: [{
      sourceId: canonicalSourceId,
      status: 'accepted-for-embedding' as const,
      labels: ['Impact'],
      provisionalEditorialRoles: ['impact' as const],
      provisionalRoleEvidence: ['impact:ground-truth-label:Impact'],
      metadataRiskFlags: [],
    }],
    cluster: {
      clusterId,
      duplicateCandidate: deferredCanonicalSourceIds.length > 0,
      canonicalSourceIds: [canonicalSourceId, ...deferredCanonicalSourceIds],
      allSourceIds: [canonicalSourceId, ...deferredSourceIds],
      representativeCanonicalSourceId: canonicalSourceId,
      deferredCanonicalSourceIds,
      deferredSourceIds,
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

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
