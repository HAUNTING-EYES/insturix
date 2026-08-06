import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  SFX_SEMANTIC_ROLE_PROMPTS,
} from '../../lib/pipeline/sfx-audio-embedding';
import type { SfxCatalogEventRole } from '../../lib/pipeline/sfx-catalog';
import {
  buildFsd50kRepresentativeReview,
  prepareFsd50kRepresentativeReview,
} from '../../scripts/prepare-fsd50k-representative-review';
import type { SfxCatalogReviewReport } from '../../scripts/prepare-sfx-catalog-review';

const temporaryDirectories: string[] = [];
const FIXED_NOW = new Date('2026-07-28T04:00:00.000Z');
const POOL_HASH = 'a'.repeat(64);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FSD50K representative review bridge', () => {
  it('creates a pending representative-only pack and defers duplicate members', async () => {
    const fixture = await makeFixture();
    const outDir = path.join(fixture.root, 'representative-review');

    const prepared = await prepareFsd50kRepresentativeReview({
      sampleRoot: fixture.sampleRoot,
      outDir,
      now: FIXED_NOW,
    });
    const report = JSON.parse(
      await readFile(prepared.review.reportPath, 'utf8'),
    ) as SfxCatalogReviewReport;
    const html = await readFile(prepared.review.indexPath, 'utf8');

    expect(prepared.receipt.policy).toEqual({
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      autoApprovalAllowed: false,
      clusterDecisionPropagationAllowed: false,
      humanReviewRequired: true,
    });
    expect(prepared.receipt.counts).toEqual({
      acceptedSources: 3,
      clusters: 2,
      queuedRepresentatives: 2,
      deferredClusterMembers: 1,
    });
    expect(prepared.receipt.deferredClusterMembers).toEqual([
      {
        sourceId: '1',
        clusterId: 'sfx_cluster_1111111111111111',
        representativeSourceId: '2',
        status: 'not-reviewed-not-approved',
      },
    ]);
    expect(report.candidates).toHaveLength(2);
    expect(
      report.candidates.map((candidate) => candidate.curation.provenance.providerAssetId),
    ).toEqual(['2', '3']);
    expect(report.candidates.every((candidate) => candidate.status === 'pending')).toBe(true);
    expect(JSON.stringify(report)).not.toContain('"approval"');
    expect(report.candidates[0].reviewEvidence).toMatchObject({
      sourceId: '2',
      sourceHashSha256: fixture.sourceHashes['2'],
      cluster: {
        memberSourceIds: ['1', '2'],
        representativeSourceId: '2',
      },
      metadataBasis: 'role-prior-pending-human-approval',
    });
    expect(html).toContain(SFX_CLAP_MODEL_ID);
    expect(html).toContain(SFX_CLAP_MODEL_REVISION);
    expect(html).toContain('cluster ${item.cluster.memberSourceIds.length}');
    expect(html).toContain('reviewEvidence: candidate.reviewEvidence');
    expect(html).toContain("decisions[candidate.reviewId].status === 'approved'");

    await Promise.all([
      access(path.join(prepared.evidenceDirectory, 'sample-plan.json')),
      access(path.join(prepared.evidenceDirectory, 'sample-report.json')),
      access(path.join(prepared.evidenceDirectory, 'clap-screening-report.json')),
      access(path.join(prepared.evidenceDirectory, 'representative-review-bridge.json')),
    ]);
  }, 30_000);

  it('fails closed when the CLAP analysis digest is tampered', async () => {
    const fixture = await makeFixture();
    fixture.screeningReport.analysisDigestSha256 = 'f'.repeat(64);

    expect(() =>
      buildFsd50kRepresentativeReview({
        samplePlan: fixture.samplePlan,
        sampleReport: fixture.sampleReport,
        screeningReport: fixture.screeningReport,
        generatedAt: FIXED_NOW,
      }),
    ).toThrow(expect.objectContaining({ code: 'ANALYSIS_DIGEST_MISMATCH' }));
  });

  it('fails before publishing a review directory when audition bytes do not match evidence', async () => {
    const fixture = await makeFixture();
    const outDir = path.join(fixture.root, 'tampered-review');
    await writeFile(path.join(fixture.sampleRoot, 'audio', '2.wav'), createWav(930));

    await expect(
      prepareFsd50kRepresentativeReview({
        sampleRoot: fixture.sampleRoot,
        outDir,
        now: FIXED_NOW,
      }),
    ).rejects.toMatchObject({
      code: 'REPRESENTATIVE_REVIEW_PREPARATION_FAILED',
      cause: {
        code: 'SFX_REVIEW_EVIDENCE_HASH_MISMATCH',
      },
    });
    await expect(access(outDir)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 30_000);
});

interface Fixture {
  root: string;
  sampleRoot: string;
  samplePlan: Record<string, unknown>;
  sampleReport: {
    entries: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  screeningReport: {
    analysisDigestSha256: string;
    [key: string]: unknown;
  };
  sourceHashes: Record<string, string>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-sfx-representatives-'));
  temporaryDirectories.push(root);
  const sampleRoot = path.join(root, 'sample');
  const audioDirectory = path.join(sampleRoot, 'audio');
  await mkdir(audioDirectory, { recursive: true });

  const sources = [
    {
      sourceId: '1',
      role: 'whoosh' as const,
      title: 'First whoosh',
      frequency: 420,
    },
    {
      sourceId: '2',
      role: 'whoosh' as const,
      title: 'Best whoosh',
      frequency: 520,
    },
    {
      sourceId: '3',
      role: 'impact' as const,
      title: 'Clean impact',
      frequency: 620,
    },
  ];
  const sourceHashes: Record<string, string> = {};
  const sourceBytes: Record<string, Buffer> = {};
  for (const source of sources) {
    const bytes = createWav(source.frequency);
    sourceBytes[source.sourceId] = bytes;
    sourceHashes[source.sourceId] = hashBuffer(bytes);
    await writeFile(path.join(audioDirectory, `${source.sourceId}.wav`), bytes);
  }

  const samplePlan = {
    version: 'editron-fsd50k-sample-plan-v1',
    candidatePoolSha256: POOL_HASH,
    policy: {
      clipLicenseAllowlist: ['cc0-1.0'],
      metadataRiskFlagsAllowed: false,
      uploaderMetadataOnlyAllowed: false,
      publicationAllowed: false,
    },
    entries: sources.map((source) => ({
      assignedRole: source.role,
      evidenceKind: 'ground-truth-label',
      candidate: {
        sourceId: source.sourceId,
        title: source.title,
        labels: [source.role === 'whoosh' ? 'Whoosh_and_swoosh_and_swish' : 'Boom'],
        uploaderTags: [source.role, 'clean'],
        metadataRiskFlags: [],
        provenance: {
          provider: 'fsd50k',
          upstreamProvider: 'freesound',
          providerAssetId: source.sourceId,
          clipLicenseId: 'cc0-1.0',
          clipLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          clipAttributionRequired: false,
        },
      },
    })),
  };
  const sampleEntries = sources.map((source) => ({
    sourceId: source.sourceId,
    assignedRole: source.role,
    status: 'accepted',
    title: source.title,
    audioPath: `audio/${source.sourceId}.wav`,
    contentType: 'audio/wav',
    byteLength: sourceBytes[source.sourceId].byteLength,
    measurement: {
      sourceHashSha256: sourceHashes[source.sourceId],
      durationMs: 120,
    },
    audioRights: {
      mediaRole: 'sfx',
      source: 'library',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: `sfx_fs_${source.sourceId}_fixture`,
        licenseId: `freesound:${source.sourceId}:creative-commons-0`,
      },
    },
    providerTags: [source.role, 'clean'],
  }));
  const sampleReport = {
    version: 'editron-fsd50k-audio-sample-v1',
    generatedAt: FIXED_NOW.toISOString(),
    candidatePoolSha256: POOL_HASH,
    policy: {
      purpose: 'internal-acoustic-and-embedding-screening',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      providerLicenseReverified: true,
      acousticGate: 'production-controlled-freesound-ingest',
    },
    counts: {
      requested: sampleEntries.length,
      accepted: sampleEntries.length,
      rejected: 0,
      downloadedBytes: Object.values(sourceBytes).reduce(
        (total, bytes) => total + bytes.byteLength,
        0,
      ),
    },
    entries: sampleEntries,
  };

  const screeningEntries = sources.map((source, index) => {
    const semanticRoles = roleScores(source.role, 0.9 - index * 0.05);
    return {
      sourceId: source.sourceId,
      assignedRole: source.role,
      title: source.title,
      audioPath: `audio/${source.sourceId}.wav`,
      sourceHashSha256: sourceHashes[source.sourceId],
      providerTags: [source.role, 'clean'],
      segmentCount: 1,
      embedding: {
        encoding: 'base64-f32le',
        dimension: SFX_CLAP_EMBEDDING_DIMENSION,
        value: Buffer.alloc(
          SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT,
          index + 1,
        ).toString('base64'),
      },
      semanticRoles,
      topRole: source.role,
      topRoleScore: semanticRoles[0].cosineSimilarity,
      assignedRoleScore: semanticRoles[0].cosineSimilarity,
      assignedRoleRank: 1,
      roleAgreement: true,
      nearestNeighbor:
        index === 0
          ? { sourceId: '2', cosineSimilarity: 0.99 }
          : index === 1
            ? { sourceId: '1', cosineSimilarity: 0.99 }
            : { sourceId: '1', cosineSimilarity: 0.2 },
      clusterId: index < 2 ? 'sfx_cluster_1111111111111111' : 'sfx_cluster_3333333333333333',
      representative: index !== 0,
    };
  });
  const clusters = [
    {
      clusterId: 'sfx_cluster_1111111111111111',
      duplicateCandidate: true,
      memberSourceIds: ['1', '2'],
      assignedRoles: ['whoosh'],
      representativeSourceId: '2',
      representativeRule: 'highest-assigned-role-similarity-then-source-id',
      minimumPairwiseSimilarity: 0.99,
      maximumPairwiseSimilarity: 0.99,
    },
    {
      clusterId: 'sfx_cluster_3333333333333333',
      duplicateCandidate: false,
      memberSourceIds: ['3'],
      assignedRoles: ['impact'],
      representativeSourceId: '3',
      representativeRule: 'highest-assigned-role-similarity-then-source-id',
      minimumPairwiseSimilarity: 1,
      maximumPairwiseSimilarity: 1,
    },
  ];
  const model = {
    provider: 'huggingface-transformers-js',
    packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
    modelId: SFX_CLAP_MODEL_ID,
    revision: SFX_CLAP_MODEL_REVISION,
    dtype: 'q8',
    sampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
    embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    windowing: 'non-overlapping-10s-duration-weighted-mean',
  };
  const duplicateSimilarityThreshold = 0.985;
  const screeningReport = {
    version: 'editron-sfx-clap-screening-v1',
    generatedAt: FIXED_NOW.toISOString(),
    sourceCandidatePoolSha256: POOL_HASH,
    sourceReceiptSha256: createHash('sha256')
      .update(
        sampleEntries
          .map(
            (entry) =>
              `${entry.sourceId}:${entry.measurement.sourceHashSha256}:${entry.assignedRole}`,
          )
          .join('\n'),
      )
      .digest('hex'),
    policy: {
      purpose: 'internal-semantic-and-near-duplicate-screening',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      humanReviewRequired: true,
    },
    model,
    rolePrompts: SFX_SEMANTIC_ROLE_PROMPTS,
    duplicateSimilarityThreshold,
    counts: {
      acceptedInput: 3,
      embedded: 3,
      roleAgreement: 3,
      clusters: 2,
      duplicateCandidateClusters: 1,
      duplicateCandidateEntries: 2,
      representatives: 2,
    },
    entries: screeningEntries,
    clusters,
    analysisDigestSha256: hashJson({
      model,
      threshold: duplicateSimilarityThreshold,
      entries: screeningEntries.map((entry) => ({
        sourceId: entry.sourceId,
        sourceHashSha256: entry.sourceHashSha256,
        embedding: entry.embedding.value,
        semanticRoles: entry.semanticRoles,
        clusterId: entry.clusterId,
        representative: entry.representative,
      })),
      clusters,
    }),
  };

  await Promise.all([
    writeFile(path.join(sampleRoot, 'sample-plan.json'), JSON.stringify(samplePlan)),
    writeFile(path.join(sampleRoot, 'sample-report.json'), JSON.stringify(sampleReport)),
    writeFile(
      path.join(sampleRoot, 'clap-screening-report-v1.json'),
      JSON.stringify(screeningReport),
    ),
  ]);
  return {
    root,
    sampleRoot,
    samplePlan,
    sampleReport,
    screeningReport,
    sourceHashes,
  };
}

function roleScores(assignedRole: SfxCatalogEventRole, assignedScore: number) {
  const assigned = SFX_SEMANTIC_ROLE_PROMPTS.find((item) => item.role === assignedRole)!;
  return [
    {
      ...assigned,
      cosineSimilarity: assignedScore,
    },
    ...SFX_SEMANTIC_ROLE_PROMPTS.filter((item) => item.role !== assignedRole).map(
      (item, index) => ({
        ...item,
        cosineSimilarity: Number((0.7 - index * 0.05).toFixed(2)),
      }),
    ),
  ];
}

function createWav(frequency: number): Buffer {
  const sampleRate = 48_000;
  const samples = Math.round(sampleRate * 0.12);
  const wav = Buffer.allocUnsafe(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
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
  wav.writeUInt32LE(samples * 2, 40);
  for (let frame = 0; frame < samples; frame += 1) {
    const sample = 0.2 * Math.sin((2 * Math.PI * frequency * frame) / sampleRate);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  return wav;
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
