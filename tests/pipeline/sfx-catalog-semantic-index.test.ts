import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { resolveAtomicSfxForm } from '@/lib/editron/services/sfx-form';
import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapEmbeddingRuntime,
  type SfxClapModelDescriptor,
} from '@/lib/pipeline/sfx-audio-embedding';
import {
  parseSfxCatalogManifest,
  selectSfxCatalogEntry,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  createSfxCatalogSemanticRetriever,
  loadSfxCatalogSemanticIndex,
  SfxCatalogSemanticIndexError,
} from '@/lib/pipeline/sfx-catalog-semantic-index';
import {
  SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
  SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
  type SfxCatalogSemanticReleaseMetadata,
  type SfxCatalogSemanticReleaseReceipt,
} from '@/lib/pipeline/sfx-catalog-semantic-release';

const GENERATED_AT = '2026-07-29T00:00:00.000Z';
const VECTOR_ROW_BYTES = SFX_CLAP_EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT;

describe('SFX catalog semantic index', () => {
  it('verifies the release and performs exact cosine retrieval with audit evidence', async () => {
    const fixture = makeReleaseFixture();
    const index = loadSfxCatalogSemanticIndex(fixture.artifacts);
    const queryVector = unitVector(1);
    const embedTexts = vi.fn(async () => [queryVector]);
    const retriever = createSfxCatalogSemanticRetriever(
      index,
      makeRuntime(embedTexts),
    );

    const result = await retriever.retrieve('  directional   whoosh  ', fixture.manifest);

    expect(embedTexts).toHaveBeenCalledWith(['directional whoosh']);
    expect(result.similarityByAssetId.get('sfx_catalog_beta')).toBe(1);
    expect(result.similarityByAssetId.get('sfx_catalog_alpha')).toBe(0);
    expect(result.report).toEqual(expect.objectContaining({
      version: 'editron-sfx-catalog-semantic-retrieval-v1',
      releaseReceiptDigestSha256: fixture.receipt.receiptDigestSha256,
      promotedManifestDigestSha256: hashJson(fixture.manifest),
      queryDigestSha256: hashBuffer(Buffer.from('directional whoosh')),
      indexedAssetCount: 2,
      candidates: [
        { assetId: 'sfx_catalog_beta', cosineSimilarity: 1 },
        { assetId: 'sfx_catalog_alpha', cosineSimilarity: 0 },
      ],
    }));
  });

  it('rejects vector bytes that do not match the immutable release receipt', () => {
    const fixture = makeReleaseFixture();
    const tamperedVectors = Buffer.from(fixture.artifacts.vectorsBuffer);
    tamperedVectors.writeFloatLE(0.5, 0);

    expectIndexError(
      () => loadSfxCatalogSemanticIndex({
        ...fixture.artifacts,
        vectorsBuffer: tamperedVectors,
      }),
      'RELEASE_VECTOR_DIGEST_MISMATCH',
    );
  });

  it('rejects invalid row offsets even when artifact digests are recomputed', () => {
    const fixture = makeReleaseFixture();
    const metadata = structuredClone(fixture.metadata);
    metadata.entries[1].vectorOffsetBytes += Float32Array.BYTES_PER_ELEMENT;
    const artifacts = encodeRelease(metadata, fixture.artifacts.vectorsBuffer);

    expectIndexError(
      () => loadSfxCatalogSemanticIndex(artifacts),
      'RELEASE_VECTOR_ROW_MISMATCH',
    );
  });

  it('fails before embedding when the active catalog drifts from the promoted manifest', async () => {
    const fixture = makeReleaseFixture();
    const embedTexts = vi.fn(async () => [unitVector(0)]);
    const retriever = createSfxCatalogSemanticRetriever(
      loadSfxCatalogSemanticIndex(fixture.artifacts),
      makeRuntime(embedTexts),
    );
    const driftedManifest = structuredClone(fixture.manifest);
    driftedManifest.entries[0].title = 'Mutated after semantic release';

    await expect(retriever.retrieve('whoosh', driftedManifest)).rejects.toMatchObject({
      code: 'SEMANTIC_MANIFEST_DIGEST_MISMATCH',
    });
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('rejects a query runtime that differs from the release model', () => {
    const fixture = makeReleaseFixture();
    const index = loadSfxCatalogSemanticIndex(fixture.artifacts);
    const mismatchedDescriptor: SfxClapModelDescriptor = {
      ...MODEL_DESCRIPTOR,
      revision: 'different-revision' as SfxClapModelDescriptor['revision'],
    };

    expectIndexError(
      () => createSfxCatalogSemanticRetriever(index, {
        ...makeRuntime(vi.fn(async () => [unitVector(0)])),
        descriptor: mismatchedDescriptor,
      }),
      'SEMANTIC_QUERY_MODEL_MISMATCH',
    );
  });

  it('uses similarity only between accepted candidates and preserves hard rejection', () => {
    const fixture = makeReleaseFixture();
    const form = resolveAtomicSfxForm({
      params: {
        sfxCue: 'fast directional whoosh',
        sfxAnchor: 'transition',
        transitionFrame: 30,
      },
      frame: 30,
      sceneRemainingFrames: 90,
    });
    const similarityByAssetId = new Map([
      ['sfx_catalog_alpha', 0.1],
      ['sfx_catalog_beta', 0.95],
    ]);

    const reordered = selectSfxCatalogEntry(fixture.manifest, {
      query: 'fast directional whoosh',
      maxDurationSec: 2,
      form,
      semanticSimilarityByAssetId: similarityByAssetId,
    });
    expect(reordered.entry?.assetId).toBe('sfx_catalog_beta');
    expect(reordered.report.candidates[0]).toEqual(expect.objectContaining({
      assetId: 'sfx_catalog_beta',
      accepted: true,
      semanticQuerySimilarity: 0.95,
    }));

    const blockedManifest = structuredClone(fixture.manifest);
    blockedManifest.entries[1].negativeTags = ['music'];
    const guarded = selectSfxCatalogEntry(blockedManifest, {
      query: 'fast directional whoosh',
      maxDurationSec: 2,
      form,
      semanticSimilarityByAssetId: similarityByAssetId,
    });
    expect(guarded.entry?.assetId).toBe('sfx_catalog_alpha');
    expect(guarded.report.candidates.find(
      candidate => candidate.assetId === 'sfx_catalog_beta',
    )).toEqual(expect.objectContaining({
      accepted: false,
      semanticQuerySimilarity: 0.95,
      reasons: expect.arrayContaining(['blocked-tags:music']),
    }));
  });
});

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

function makeReleaseFixture(): {
  manifest: SfxCatalogManifest;
  metadata: SfxCatalogSemanticReleaseMetadata;
  receipt: SfxCatalogSemanticReleaseReceipt;
  artifacts: {
    metadataBuffer: Buffer;
    vectorsBuffer: Buffer;
    receiptBuffer: Buffer;
  };
} {
  const entries = [
    makeCatalogEntry('sfx_catalog_alpha', 'a'.repeat(64)),
    makeCatalogEntry('sfx_catalog_beta', 'b'.repeat(64)),
  ];
  const manifest = parseSfxCatalogManifest({
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
  const vectorsBuffer = Buffer.alloc(VECTOR_ROW_BYTES * entries.length);
  vectorsBuffer.writeFloatLE(1, 0);
  vectorsBuffer.writeFloatLE(1, VECTOR_ROW_BYTES + Float32Array.BYTES_PER_ELEMENT);
  const vectorArtifact = {
    filename: 'vectors.f32' as const,
    encoding: 'f32le-row-major' as const,
    dimension: SFX_CLAP_EMBEDDING_DIMENSION,
    count: entries.length,
    byteLength: vectorsBuffer.byteLength,
    sha256: hashBuffer(vectorsBuffer),
  };
  const source = {
    aggregateReceiptDigestSha256: hashJson(['aggregate']),
    aggregateCurationSpecDigestSha256: hashJson(['curation']),
    promotionReceiptDigestSha256: hashJson(['promotion']),
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
  const metadata: SfxCatalogSemanticReleaseMetadata = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_VERSION,
    generatedAt: GENERATED_AT,
    model: MODEL_DESCRIPTOR,
    source,
    policy,
    vectors: vectorArtifact,
    entries: manifest.entries.map((entry, rowIndex) => ({
      rowIndex,
      vectorOffsetBytes: rowIndex * VECTOR_ROW_BYTES,
      vectorByteLength: VECTOR_ROW_BYTES,
      assetId: entry.assetId,
      canonicalSourceId: `fsd50k:${rowIndex + 1}`,
      reviewId: `sfx_review_${hashJson(entry.assetId).slice(0, 20)}`,
      selectedRole: 'whoosh',
      catalogContentHashSha256: entry.contentHashSha256,
      embeddingSourceHashSha256: entry.semanticEvidence!.embeddingSourceHashSha256,
      candidateDigestSha256: entry.semanticEvidence!.candidateDigestSha256,
      gateBatchId: 'fsd50k-gate-fixture',
      gateReceiptDigestSha256: hashJson(['gate']),
      catalogEntryDigestSha256: hashJson(entry),
      semanticEvidenceDigestSha256: hashJson(entry.semanticEvidence),
      segmentCount: 1,
    })),
  };
  const artifacts = encodeRelease(metadata, vectorsBuffer);
  const receipt = JSON.parse(
    artifacts.receiptBuffer.toString('utf8'),
  ) as SfxCatalogSemanticReleaseReceipt;
  return { manifest, metadata, receipt, artifacts };
}

function makeCatalogEntry(
  assetId: string,
  contentHashSha256: string,
): SfxCatalogEntry {
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
    selectedRole: 'whoosh',
    selectedRoleCosineSimilarity: 0.8,
    selectedRoleRank: 1,
    topRole: 'whoosh',
    topRoleCosineSimilarity: 0.8,
    roleAgreement: true,
    riskScores: [],
  });
  return {
    assetId,
    title: `Directional whoosh ${assetId}`,
    audioUrl: `/sfx/catalog/${assetId}.wav`,
    durationMs: 800,
    contentHashSha256,
    mimeType: 'audio/wav',
    eventRoles: ['whoosh'],
    surfaces: ['transition', 'motion-graphic'],
    layerRole: 'oneshot',
    tags: ['whoosh', 'directional', 'clean'],
    negativeTags: [],
    energy: 0.7,
    brightness: 0.6,
    weight: 0.3,
    transientSharpness: 0.5,
    material: 'air',
    tailMs: 180,
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
      channelCount: 2,
      durationMs: 800,
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

function encodeRelease(
  metadata: SfxCatalogSemanticReleaseMetadata,
  vectorsBuffer: Buffer,
): {
  metadataBuffer: Buffer;
  vectorsBuffer: Buffer;
  receiptBuffer: Buffer;
} {
  const metadataBuffer = encodeJson(metadata);
  const receiptWithoutDigest: Omit<
    SfxCatalogSemanticReleaseReceipt,
    'receiptDigestSha256'
  > = {
    version: SFX_CATALOG_SEMANTIC_RELEASE_RECEIPT_VERSION,
    generatedAt: metadata.generatedAt,
    source: metadata.source,
    policy: metadata.policy,
    counts: {
      approvedAssets: metadata.entries.length,
      semanticVectors: metadata.entries.length,
      sourceGates: 1,
      reusedCheckpoints: 0,
      newCheckpoints: metadata.entries.length,
    },
    artifacts: {
      metadata: {
        filename: 'metadata.json',
        byteLength: metadataBuffer.byteLength,
        sha256: hashBuffer(metadataBuffer),
      },
      vectors: metadata.vectors,
    },
  };
  const receipt: SfxCatalogSemanticReleaseReceipt = {
    ...receiptWithoutDigest,
    receiptDigestSha256: hashJson(receiptWithoutDigest),
  };
  return {
    metadataBuffer,
    vectorsBuffer,
    receiptBuffer: encodeJson(receipt),
  };
}

function makeRuntime(
  embedTexts: SfxClapEmbeddingRuntime['embedTexts'],
): SfxClapEmbeddingRuntime {
  return {
    descriptor: MODEL_DESCRIPTOR,
    embedTexts,
    embedAudio: vi.fn(async () => unitVector(0)),
  };
}

function unitVector(activeIndex: number): Float32Array {
  const vector = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  vector[activeIndex] = 1;
  return vector;
}

function expectIndexError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SfxCatalogSemanticIndexError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected SfxCatalogSemanticIndexError ${code}`);
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
