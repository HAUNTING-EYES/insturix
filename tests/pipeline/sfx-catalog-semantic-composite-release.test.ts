import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapModelDescriptor,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  buildCompositeSfxSemanticRelease,
  CompositeSfxSemanticReleaseError,
} from '@/lib/pipeline/sfx-catalog-semantic-composite-release';
import {
  loadSfxCatalogSemanticIndex,
} from '@/lib/pipeline/sfx-catalog-semantic-index';
import {
  SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
  SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
  type SfxCatalogSemanticReleaseMetadata,
  type SfxCatalogSemanticReleaseReceipt,
} from '@/lib/pipeline/sfx-catalog-semantic-release';

const GENERATED_AT = '2026-07-30T00:00:00.000Z';
const ROW_BYTES = SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('composite SFX semantic release', () => {
  it('combines disjoint verified releases and remains searchable', async () => {
    const fixture = await makeFixture();
    const built = await buildCompositeSfxSemanticRelease({
      baseReleaseDirectory: fixture.base.releaseDirectory,
      baseManifestPath: fixture.base.manifestPath,
      deltaReleaseDirectory: fixture.delta.releaseDirectory,
      deltaManifestPath: fixture.delta.manifestPath,
      runtimeManifestPath: fixture.runtimeManifestPath,
      outputDirectory: fixture.outputDirectory,
      generatedAt: new Date(GENERATED_AT),
    });

    expect(built.receipt.counts).toMatchObject({
      approvedAssets: 2,
      semanticVectors: 2,
      baseAssets: 1,
      deltaAssets: 1,
      reusedCheckpoints: 2,
      newCheckpoints: 0,
    });
    expect(built.metadata.entries.map(entry => ({
      assetId: entry.assetId,
      sourceRelease: entry.sourceRelease,
    }))).toEqual([
      { assetId: 'sfx_catalog_alpha', sourceRelease: 'reviewed-base' },
      { assetId: 'sfx_catalog_beta', sourceRelease: 'gate-delta' },
    ]);

    const index = loadSfxCatalogSemanticIndex({
      metadataBuffer: await readFile(built.metadataPath),
      vectorsBuffer: await readFile(built.vectorsPath),
      receiptBuffer: await readFile(built.receiptPath),
    });
    index.assertCompatibleManifest(fixture.runtimeManifest);
    expect(index.indexedAssetCount).toBe(2);
    expect(index.searchEmbedding(unitVector(1)).map(match => match.assetId)).toEqual([
      'sfx_catalog_beta',
      'sfx_catalog_alpha',
    ]);
  });

  it('rejects constituent overlap instead of inheriting approval', async () => {
    const root = await makeRoot();
    const base = await writeConstituent(root, 'base', 'sfx_catalog_alpha', 'a', 0);
    const delta = await writeConstituent(root, 'delta', 'sfx_catalog_alpha', 'a', 1);
    const runtimeManifestPath = path.join(root, 'runtime-manifest.json');
    await writeJson(runtimeManifestPath, base.manifest);

    await expect(buildCompositeSfxSemanticRelease({
      baseReleaseDirectory: base.releaseDirectory,
      baseManifestPath: base.manifestPath,
      deltaReleaseDirectory: delta.releaseDirectory,
      deltaManifestPath: delta.manifestPath,
      runtimeManifestPath,
      outputDirectory: path.join(root, 'output'),
    })).rejects.toMatchObject({
      code: 'COMPOSITE_ASSET_OVERLAP',
    });
  });

  it('rejects an incomplete runtime manifest and tampered vectors', async () => {
    const fixture = await makeFixture();
    await writeJson(fixture.runtimeManifestPath, fixture.base.manifest);
    await expect(buildCompositeSfxSemanticRelease({
      baseReleaseDirectory: fixture.base.releaseDirectory,
      baseManifestPath: fixture.base.manifestPath,
      deltaReleaseDirectory: fixture.delta.releaseDirectory,
      deltaManifestPath: fixture.delta.manifestPath,
      runtimeManifestPath: fixture.runtimeManifestPath,
      outputDirectory: fixture.outputDirectory,
    })).rejects.toBeInstanceOf(CompositeSfxSemanticReleaseError);

    const tampered = await makeFixture();
    const vectorsPath = path.join(tampered.delta.releaseDirectory, 'vectors.f32');
    const vectors = await readFile(vectorsPath);
    vectors.writeFloatLE(0.5, 0);
    await writeFile(vectorsPath, vectors);
    await expect(buildCompositeSfxSemanticRelease({
      baseReleaseDirectory: tampered.base.releaseDirectory,
      baseManifestPath: tampered.base.manifestPath,
      deltaReleaseDirectory: tampered.delta.releaseDirectory,
      deltaManifestPath: tampered.delta.manifestPath,
      runtimeManifestPath: tampered.runtimeManifestPath,
      outputDirectory: tampered.outputDirectory,
    })).rejects.toMatchObject({
      code: 'RELEASE_VECTOR_DIGEST_MISMATCH',
    });
  });
});

async function makeFixture() {
  const root = await makeRoot();
  const base = await writeConstituent(root, 'base', 'sfx_catalog_alpha', 'a', 0);
  const delta = await writeConstituent(root, 'delta', 'sfx_catalog_beta', 'b', 1);
  const runtimeManifest = manifestWithEntries([
    base.manifest.entries[0],
    delta.manifest.entries[0],
  ]);
  const runtimeManifestPath = path.join(root, 'runtime-manifest.json');
  await writeJson(runtimeManifestPath, runtimeManifest);
  return {
    root,
    base,
    delta,
    runtimeManifest,
    runtimeManifestPath,
    outputDirectory: path.join(root, 'composite-release'),
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-sfx-composite-'));
  temporaryDirectories.push(root);
  return root;
}

async function writeConstituent(
  root: string,
  label: string,
  assetId: string,
  contentPrefix: string,
  activeVectorIndex: number,
) {
  const releaseDirectory = path.join(root, `${label}-release`);
  await mkdir(releaseDirectory, { recursive: true });
  const manifest = manifestWithEntries([
    makeCatalogEntry(assetId, contentPrefix.repeat(64)),
  ]);
  const manifestPath = path.join(root, `${label}-manifest.json`);
  await writeJson(manifestPath, manifest);
  const vectorsBuffer = Buffer.alloc(ROW_BYTES);
  vectorsBuffer.writeFloatLE(1, activeVectorIndex * Float32Array.BYTES_PER_ELEMENT);
  const vectors = {
    filename: 'vectors.f32' as const,
    encoding: 'f32le-row-major' as const,
    dimension: SFX_CLAP_EMBEDDING_DIMENSION,
    count: 1,
    byteLength: vectorsBuffer.byteLength,
    sha256: hashBuffer(vectorsBuffer),
  };
  const source = {
    aggregateReceiptDigestSha256: hashJson([label, 'aggregate']),
    aggregateCurationSpecDigestSha256: hashJson([label, 'curation']),
    promotionReceiptDigestSha256: hashJson([label, 'promotion']),
    promotedManifestDigestSha256: hashJson(manifest),
  };
  const policy = {
    explicitPerAssetApprovalRequired: true as const,
    promotionReceiptRequired: true as const,
    conditionedCatalogBytesReembedded: true as const,
    approvedSourceBytesVerifiedEveryBuild: true as const,
    unreviewedCorpusIncluded: false as const,
    exactCosineSearchCompatible: true as const,
    runtimeSelectionPerformed: false as const,
    manifestMutationPerformed: false as const,
  };
  const entry = manifest.entries[0];
  const metadata: SfxCatalogSemanticReleaseMetadata = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
    generatedAt: GENERATED_AT,
    model: MODEL_DESCRIPTOR,
    source,
    policy,
    vectors,
    entries: [{
      rowIndex: 0,
      vectorOffsetBytes: 0,
      vectorByteLength: ROW_BYTES,
      assetId,
      canonicalSourceId: `${label}:source`,
      reviewId: `sfx_review_${hashJson(assetId).slice(0, 20)}`,
      selectedRole: 'tick',
      catalogContentHashSha256: entry.contentHashSha256,
      embeddingSourceHashSha256: entry.semanticEvidence!.embeddingSourceHashSha256,
      candidateDigestSha256: entry.semanticEvidence!.candidateDigestSha256,
      gateBatchId: `${label}-gate`,
      gateReceiptDigestSha256: hashJson([label, 'gate']),
      catalogEntryDigestSha256: hashJson(entry),
      semanticEvidenceDigestSha256: hashJson(entry.semanticEvidence),
      segmentCount: 1,
    }],
  };
  const metadataBuffer = encodeJson(metadata);
  const receiptWithoutDigest: Omit<
    SfxCatalogSemanticReleaseReceipt,
    'receiptDigestSha256'
  > = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
    generatedAt: GENERATED_AT,
    source,
    policy,
    counts: {
      approvedAssets: 1,
      semanticVectors: 1,
      sourceGates: 1,
      reusedCheckpoints: 0,
      newCheckpoints: 1,
    },
    artifacts: {
      metadata: {
        filename: 'metadata.json',
        byteLength: metadataBuffer.byteLength,
        sha256: hashBuffer(metadataBuffer),
      },
      vectors,
    },
  };
  const receipt: SfxCatalogSemanticReleaseReceipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  await Promise.all([
    writeFile(path.join(releaseDirectory, 'metadata.json'), metadataBuffer),
    writeFile(path.join(releaseDirectory, 'vectors.f32'), vectorsBuffer),
    writeJson(path.join(releaseDirectory, 'semantic-release-receipt.json'), receipt),
  ]);
  return { releaseDirectory, manifestPath, manifest };
}

function manifestWithEntries(entries: SfxCatalogEntry[]): SfxCatalogManifest {
  return parseSfxCatalogManifest({
    version: 'sfx-catalog-v1',
    generatedAt: GENERATED_AT,
    knowledgeGraphRefs: ['transition-sfx-pairing'],
    qualityPolicy: {
      minimumSelectionScore: 0.45,
      silenceFloorLufs: -60,
      maxTruePeakDbtp: -1,
      minSampleRateHz: 44_100,
      allowedChannelCounts: [1, 2],
      blockedTags: ['vocal', 'speech', 'music', 'meme', 'noisy', 'comedic'],
    },
    entries,
  });
}

function makeCatalogEntry(assetId: string, contentHashSha256: string): SfxCatalogEntry {
  const semanticEvidence = sfxCatalogSemanticEvidenceSchema.parse({
    version: 'sfx-catalog-semantic-evidence-v2',
    provider: 'clap-audio-classifier',
    model: {
      modelId: SFX_CLAP_MODEL_ID,
      modelRevision: SFX_CLAP_MODEL_REVISION,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
    },
    embeddingAnalysisDigestSha256: hashJson(['analysis', assetId]),
    candidateDigestSha256: hashJson(['candidate', assetId]),
    embeddingSourceHashSha256: hashJson(['source', assetId]),
    catalogContentHashSha256: contentHashSha256,
    selectedRole: 'tick',
    selectedRoleCosineSimilarity: 0.8,
    selectedRoleRank: 1,
    topRole: 'tick',
    topRoleCosineSimilarity: 0.8,
    roleAgreement: true,
    riskScores: [],
  });
  return {
    assetId,
    title: `Tick ${assetId}`,
    audioUrl: `/sfx/${assetId}`,
    durationMs: 500,
    contentHashSha256,
    mimeType: 'audio/wav',
    eventRoles: ['tick'],
    surfaces: ['motion-graphic', 'ui'],
    layerRole: 'oneshot',
    tags: ['tick', 'clean'],
    negativeTags: [],
    energy: 0.3,
    brightness: 0.7,
    weight: 0.2,
    transientSharpness: 0.9,
    material: 'recorded',
    tailMs: 0,
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
      durationMs: 500,
      measuredAt: GENERATED_AT,
      sourceHashSha256: contentHashSha256,
    },
    semanticEvidence,
    provenance: {
      provider: 'fsd50k',
      providerAssetId: assetId,
      licenseId: 'cc0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
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

const MODEL_DESCRIPTOR: SfxClapModelDescriptor = {
  provider: 'huggingface-transformers-js',
  packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
  modelId: SFX_CLAP_MODEL_ID,
  revision: SFX_CLAP_MODEL_REVISION,
  dtype: 'q8',
  sampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
  embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
  windowing: 'non-overlapping-10s-duration-weighted-mean',
};

function unitVector(activeIndex: number): Float32Array {
  const vector = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  vector[activeIndex] = 1;
  return vector;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, encodeJson(value));
}

function encodeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
