import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  buildSfxCatalogSemanticRelease,
  type SfxCatalogSemanticReleaseReceipt,
} from '../../lib/pipeline/sfx-catalog-semantic-release';
import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../../lib/pipeline/sfx-catalog';
import {
  FSD50K_CATALOG_PROMOTION_VERSION,
  FSD50K_PUBLICATION_AGGREGATE_VERSION,
} from '../../lib/pipeline/sfx-fsd50k-publication-aggregate';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('approved-only SFX semantic releases', () => {
  it('writes immutable vectors and resumes without rerunning CLAP', async () => {
    const fixture = await makeFixture();
    const { runtime, embedAudio } = makeRuntime();
    const progress: boolean[] = [];
    const first = await buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory: path.join(fixture.root, 'release-1'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
      onProgress: event => {
        progress.push(event.reusedCheckpoint);
      },
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });

    const vectors = await readFile(first.vectorsPath);
    const metadata = JSON.parse(await readFile(first.metadataPath, 'utf8'));
    const receipt = JSON.parse(
      await readFile(first.receiptPath, 'utf8'),
    ) as SfxCatalogSemanticReleaseReceipt;
    expect(vectors.byteLength).toBe(SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT);
    expect(vectors.readFloatLE(0)).toBe(1);
    expect(metadata.entries).toEqual([expect.objectContaining({
      rowIndex: 0,
      vectorOffsetBytes: 0,
      vectorByteLength: vectors.byteLength,
      assetId: fixture.entry.assetId,
      catalogContentHashSha256: fixture.audioHash,
      segmentCount: 1,
    })]);
    expect(receipt.policy).toMatchObject({
      explicitPerAssetApprovalRequired: true,
      conditionedCatalogBytesReembedded: true,
      approvedSourceBytesVerifiedEveryBuild: true,
      unreviewedCorpusIncluded: false,
      runtimeSelectionPerformed: false,
    });
    expect(receipt.counts).toEqual({
      approvedAssets: 1,
      semanticVectors: 1,
      sourceGates: 1,
      reusedCheckpoints: 0,
      newCheckpoints: 1,
    });
    expect(receipt.artifacts.metadata.sha256).toBe(hashBuffer(
      await readFile(first.metadataPath),
    ));
    expect(receipt.artifacts.vectors.sha256).toBe(hashBuffer(vectors));
    expect(receipt.receiptDigestSha256).toBe(hashJson(withoutReceiptDigest(receipt)));
    expect(progress).toEqual([false]);
    expect(embedAudio).toHaveBeenCalledTimes(1);

    const second = await buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory: path.join(fixture.root, 'release-2'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });
    expect(second.receipt.counts.reusedCheckpoints).toBe(1);
    expect(second.receipt.counts.newCheckpoints).toBe(0);
    expect(embedAudio).toHaveBeenCalledTimes(1);
    expect(await readFile(second.vectorsPath)).toEqual(vectors);
  });

  it('rejects changed approved bytes even when a valid checkpoint exists', async () => {
    const fixture = await makeFixture();
    const { runtime, embedAudio } = makeRuntime();
    await buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory: path.join(fixture.root, 'release-before-tamper'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, { runtime, decodeAudio: decodeFixtureAudio });
    const changed = Buffer.from(fixture.audio);
    changed[0] ^= 0xff;
    await writeFile(fixture.audioPath, changed);

    await expect(buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory: path.join(fixture.root, 'release-after-tamper'),
      workingDirectory: fixture.workingDirectory,
      generatedAt: NOW,
    }, { runtime, decodeAudio: decodeFixtureAudio }))
      .rejects.toMatchObject({ code: 'APPROVED_AUDIO_MISMATCH' });
    expect(embedAudio).toHaveBeenCalledTimes(1);
  });

  it('rejects a promoted semantic asset absent from the approval aggregate', async () => {
    const fixture = await makeFixture();
    const extraAudioHash = hashBuffer(Buffer.from('unapproved-conditioned-audio'));
    const extraEntry = makeEntry('202', extraAudioHash);
    await writePromotion(
      fixture.promotionDirectory,
      parseSfxCatalogManifest({
        ...fixture.manifest,
        entries: [...fixture.manifest.entries, extraEntry],
      }),
    );

    await expect(buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory: path.join(fixture.root, 'unsafe-release'),
      generatedAt: NOW,
    }, { runtime: makeRuntime().runtime, decodeAudio: decodeFixtureAudio }))
      .rejects.toMatchObject({ code: 'SEMANTIC_ASSET_SET_MISMATCH' });
  });

  it('never overwrites an existing release directory', async () => {
    const fixture = await makeFixture();
    const outputDirectory = path.join(fixture.root, 'existing-release');
    await mkdir(outputDirectory);

    await expect(buildSfxCatalogSemanticRelease({
      aggregateDirectory: fixture.aggregateDirectory,
      promotionDirectory: fixture.promotionDirectory,
      outputDirectory,
      generatedAt: NOW,
    }, { runtime: makeRuntime().runtime, decodeAudio: decodeFixtureAudio }))
      .rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-sfx-semantic-release-'));
  temporaryDirectories.push(root);
  const aggregateDirectory = path.join(root, 'aggregate');
  const promotionDirectory = path.join(root, 'promotion');
  const workingDirectory = path.join(root, 'work');
  const audio = Buffer.from('approved-conditioned-audio');
  const audioHash = hashBuffer(audio);
  const entry = makeEntry('101', audioHash);
  const audioPath = path.join(aggregateDirectory, 'audio', `${entry.assetId}.wav`);
  await mkdir(path.dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);
  const sourcePath = `audio/${entry.assetId}.wav`;
  const curationSpec = {
    version: 'sfx-catalog-curation-spec-v1',
    assets: [{
      sourcePath,
      eventRoles: ['impact'],
      semanticEvidence: entry.semanticEvidence,
      provenance: {
        provider: 'fsd50k',
        providerAssetId: '101',
        licenseId: 'cc0-1.0',
        licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
      },
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: NOW.toISOString(),
      },
    }],
  };
  const reviewId = `sfx_review_${hashBuffer(Buffer.from('review-101')).slice(0, 20)}`;
  const aggregateWithoutDigest = {
    version: FSD50K_PUBLICATION_AGGREGATE_VERSION,
    generatedAt: NOW.toISOString(),
    sourceGates: [{
      batchId: 'fsd50k_review_batch_fixture',
      gateReceiptDigestSha256: hashJson(['gate', '101']),
      curationSpecDigestSha256: hashJson(['gate-curation', '101']),
    }],
    policy: {
      everyAssetBoundToExplicitGate: true,
      everyCurationSpecDigestVerified: true,
      duplicateReviewIdsRejected: true,
      duplicateCanonicalSourceIdsRejected: true,
      duplicateAudioContentRejected: true,
      manifestMutationPerformed: false,
    },
    counts: { sourceGates: 1, approvedAssets: 1 },
    curationSpecDigestSha256: hashJson(curationSpec),
    assets: [{
      gateBatchId: 'fsd50k_review_batch_fixture',
      reviewId,
      canonicalSourceId: '101',
      candidateDigestSha256: entry.semanticEvidence?.candidateDigestSha256,
      embeddingSourceHashSha256: entry.semanticEvidence?.embeddingSourceHashSha256,
      conditionedHashSha256: audioHash,
      selectedRole: 'impact',
      stagedAudioPath: sourcePath,
      byteLength: audio.byteLength,
    }],
  };
  await writeJson(path.join(aggregateDirectory, 'curation-spec.json'), curationSpec);
  await writeJson(path.join(aggregateDirectory, 'publication-aggregate-receipt.json'), {
    ...aggregateWithoutDigest,
    receiptDigestSha256: hashJson(aggregateWithoutDigest),
  });
  const manifest = makeManifest([entry]);
  await writePromotion(promotionDirectory, manifest);
  return {
    root,
    aggregateDirectory,
    promotionDirectory,
    workingDirectory,
    audio,
    audioHash,
    audioPath,
    entry,
    manifest,
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

function makeEntry(providerAssetId: string, contentHashSha256: string): SfxCatalogEntry {
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
    embeddingSourceHashSha256: hashJson(['source', providerAssetId]),
    catalogContentHashSha256: contentHashSha256,
    selectedRole: 'impact',
    selectedRoleCosineSimilarity: 0.82,
    selectedRoleRank: 1,
    topRole: 'impact',
    topRoleCosineSimilarity: 0.82,
    roleAgreement: true,
    riskScores: [],
  });
  return makeManifestEntry({
    assetId,
    providerAssetId,
    contentHashSha256,
    semanticEvidence,
  });
}

function makeManifestEntry(input: {
  assetId: string;
  providerAssetId: string;
  contentHashSha256: string;
  semanticEvidence: NonNullable<SfxCatalogEntry['semanticEvidence']>;
}): SfxCatalogEntry {
  return {
    assetId: input.assetId,
    title: `Impact ${input.providerAssetId}`,
    audioUrl: `/sfx/catalog/${input.assetId}.wav`,
    durationMs: 1_000,
    contentHashSha256: input.contentHashSha256,
    mimeType: 'audio/wav',
    eventRoles: ['impact'],
    surfaces: ['transition'],
    layerRole: 'impact',
    tags: ['impact', 'fixture'],
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
      sourceHashSha256: input.contentHashSha256,
    },
    semanticEvidence: input.semanticEvidence,
    provenance: {
      provider: 'fsd50k',
      providerAssetId: input.providerAssetId,
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
        sourceAssetId: input.assetId,
        licenseId: 'cc0-1.0',
      },
    },
  };
}

async function writePromotion(directory: string, manifest: SfxCatalogManifest): Promise<void> {
  await mkdir(directory, { recursive: true });
  const receiptWithoutDigest = {
    version: FSD50K_CATALOG_PROMOTION_VERSION,
    promotedAt: NOW.toISOString(),
    source: {
      mergeReceiptDigestSha256: hashJson(['merge', manifest.entries.length]),
      publicationReceiptDigestSha256: hashJson(['publication', manifest.entries.length]),
    },
    policy: {
      allDeltaObjectsVerified: true,
      existingCatalogEntriesPreserved: true,
      liveManifestMutationPerformed: false,
    },
    counts: {
      existingAssets: 0,
      deltaAssets: manifest.entries.length,
      promotedAssets: manifest.entries.length,
    },
    promotedManifestDigestSha256: hashJson(manifest),
  };
  await writeJson(path.join(directory, 'manifest.json'), manifest);
  await writeJson(path.join(directory, 'catalog-promotion-receipt.json'), {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  });
}

function makeRuntime() {
  const embedAudio = vi.fn(async () => {
    const embedding = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
    embedding[0] = 1;
    return embedding;
  });
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function withoutReceiptDigest(receipt: SfxCatalogSemanticReleaseReceipt) {
  const { receiptDigestSha256: _receiptDigestSha256, ...payload } = receipt;
  return payload;
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
