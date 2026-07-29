import { createHash, createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SFX_CATALOG_SEMANTIC_QUERY_VERSION,
  SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV,
  SFX_SEMANTIC_RETRIEVAL_URL_ENV,
  retrieveConfiguredSfxCatalogSemantics,
  type SfxCatalogSemanticQueryRequest,
} from '../../lib/pipeline/sfx-catalog-semantic-client';
import {
  createSfxCatalogSemanticWorker,
  SFX_SEMANTIC_WORKER_HEALTH_PATH,
  SFX_SEMANTIC_WORKER_QUERY_PATH,
} from '../../lib/pipeline/sfx-catalog-semantic-worker';
import {
  SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
  type SfxCatalogSemanticRetriever,
} from '../../lib/pipeline/sfx-catalog-semantic-index';
import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../../lib/pipeline/sfx-catalog';

const TOKEN = 'semantic-worker-test-token-with-32-characters';
const GENERATED_AT = '2026-07-29T00:00:00.000Z';
const MODEL = {
  provider: 'huggingface-transformers-js',
  packageVersion: '3.8.1',
  modelId: 'Xenova/clap-htsat-unfused',
  revision: 'c28f2883575e590e04d3146ff0713c2448d691ba',
  dtype: 'q8',
  sampleRateHz: 48_000,
  embeddingDimension: 512,
  windowing: 'non-overlapping-10s-duration-weighted-mean',
} as const;

afterEach(() => {
  delete process.env[SFX_SEMANTIC_RETRIEVAL_URL_ENV];
  delete process.env[SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV];
  vi.restoreAllMocks();
});

describe('SFX catalog semantic worker', () => {
  it('serves a signed response accepted by the production client', async () => {
    const manifest = makeManifest();
    const retriever = makeRetriever(manifest, [
      ['sfx_catalog_alpha', 0.612_345_49],
      ['sfx_catalog_beta', 0.912_345_49],
    ]);
    const worker = createSfxCatalogSemanticWorker({
      token: TOKEN,
      manifest,
      retriever,
    });
    process.env[SFX_SEMANTIC_RETRIEVAL_URL_ENV] =
      `http://localhost${SFX_SEMANTIC_WORKER_QUERY_PATH}`;
    process.env[SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV] = TOKEN;
    const result = await retrieveConfiguredSfxCatalogSemantics(
      'directional whoosh',
      manifest,
      {
        fetch: async (_input, init) => {
          const headers = new Headers(init?.headers);
          const response = await worker.handle({
            method: init?.method ?? 'GET',
            path: SFX_SEMANTIC_WORKER_QUERY_PATH,
            headers: Object.fromEntries(headers.entries()),
            body: String(init?.body ?? ''),
          });
          return new Response(response.body, {
            status: response.status,
            headers: response.headers,
          });
        },
      },
    );

    expect(result?.similarityByAssetId).toEqual(new Map([
      ['sfx_catalog_beta', 0.912345],
      ['sfx_catalog_alpha', 0.612345],
    ]));
    expect(result?.report.candidates).toEqual([
      { assetId: 'sfx_catalog_beta', cosineSimilarity: 0.912345 },
      { assetId: 'sfx_catalog_alpha', cosineSimilarity: 0.612345 },
    ]);
    await worker.dispose();
  });

  it('rejects a tampered signature before invoking the retriever', async () => {
    const manifest = makeManifest();
    const retrieve = vi.fn();
    const worker = createSfxCatalogSemanticWorker({
      token: TOKEN,
      manifest,
      retriever: { retrieve },
    });
    const body = JSON.stringify(makeRequest(manifest));
    const response = await worker.handle({
      method: 'POST',
      path: SFX_SEMANTIC_WORKER_QUERY_PATH,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-editron-sfx-request-signature': sign(`${body}tampered`),
      },
      body,
    });

    expect(response.status).toBe(401);
    expect(response.body).toBe('{"error":"unauthorized"}');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rejects manifest drift before invoking the retriever', async () => {
    const manifest = makeManifest();
    const retrieve = vi.fn();
    const worker = createSfxCatalogSemanticWorker({
      token: TOKEN,
      manifest,
      retriever: { retrieve },
    });
    const request = makeRequest(manifest);
    request.promotedManifestDigestSha256 = 'f'.repeat(64);
    const body = JSON.stringify(request);
    const response = await worker.handle({
      method: 'POST',
      path: SFX_SEMANTIC_WORKER_QUERY_PATH,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-editron-sfx-request-signature': sign(body),
      },
      body,
    });

    expect(response.status).toBe(409);
    expect(response.body).toBe('{"error":"request_binding_mismatch"}');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('does not expose model, release, manifest, or token details on health', async () => {
    const manifest = makeManifest();
    const worker = createSfxCatalogSemanticWorker({
      token: TOKEN,
      manifest,
      retriever: makeRetriever(manifest, [
        ['sfx_catalog_alpha', 0.5],
        ['sfx_catalog_beta', 0.4],
      ]),
    });
    const response = await worker.handle({
      method: 'GET',
      path: SFX_SEMANTIC_WORKER_HEALTH_PATH,
      headers: {},
      body: '',
    });

    expect(response).toMatchObject({
      status: 200,
      body: '{"status":"ok"}',
    });
    expect(response.body).not.toContain(TOKEN);
    expect(response.body).not.toContain(MODEL.modelId);
    expect(response.body).not.toContain(hashJson(manifest));
    await worker.dispose();
  });

  it('fails closed when the retriever report is not bound to the request', async () => {
    const manifest = makeManifest();
    const onError = vi.fn();
    const retriever = makeRetriever(manifest, [
      ['sfx_catalog_alpha', 0.5],
      ['sfx_catalog_beta', 0.4],
    ], 'f'.repeat(64));
    const worker = createSfxCatalogSemanticWorker({
      token: TOKEN,
      manifest,
      retriever,
      onError,
    });
    const body = JSON.stringify(makeRequest(manifest));
    const response = await worker.handle({
      method: 'POST',
      path: SFX_SEMANTIC_WORKER_QUERY_PATH,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-editron-sfx-request-signature': sign(body),
      },
      body,
    });

    expect(response.status).toBe(500);
    expect(response.body).toBe('{"error":"semantic_retrieval_failed"}');
    expect(onError).toHaveBeenCalledOnce();
    expect(response.body).not.toContain('unbound audit report');
    await worker.dispose();
  });
});

function makeRetriever(
  manifest: SfxCatalogManifest,
  similarities: ReadonlyArray<readonly [string, number]>,
  manifestDigest = hashJson(manifest),
): SfxCatalogSemanticRetriever {
  return {
    async retrieve(query) {
      const candidates = [...similarities]
        .map(([assetId, cosineSimilarity]) => ({
          assetId,
          cosineSimilarity: round6(cosineSimilarity),
        }))
        .sort((left, right) => (
          right.cosineSimilarity - left.cosineSimilarity
          || left.assetId.localeCompare(right.assetId)
        ));
      return {
        similarityByAssetId: new Map(similarities),
        report: {
          version: SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
          releaseReceiptDigestSha256: 'e'.repeat(64),
          promotedManifestDigestSha256: manifestDigest,
          queryDigestSha256: sha256(query),
          model: MODEL,
          indexedAssetCount: similarities.length,
          candidates,
        },
      };
    },
  };
}

function makeRequest(
  manifest: SfxCatalogManifest,
): SfxCatalogSemanticQueryRequest {
  const query = 'directional whoosh';
  return {
    version: SFX_CATALOG_SEMANTIC_QUERY_VERSION,
    query,
    queryDigestSha256: sha256(query),
    promotedManifestDigestSha256: hashJson(manifest),
    semanticAssetIds: manifest.entries.map(entry => entry.assetId).sort(),
  };
}

function makeManifest(): SfxCatalogManifest {
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
    entries: [
      makeCatalogEntry('sfx_catalog_alpha', 'a'.repeat(64)),
      makeCatalogEntry('sfx_catalog_beta', 'b'.repeat(64)),
    ],
  });
}

function makeCatalogEntry(
  assetId: string,
  contentHashSha256: string,
): SfxCatalogEntry {
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
    semanticEvidence: sfxCatalogSemanticEvidenceSchema.parse({
      version: 'sfx-catalog-semantic-evidence-v2',
      provider: 'clap-audio-classifier',
      model: {
        modelId: MODEL.modelId,
        modelRevision: MODEL.revision,
        embeddingDimension: MODEL.embeddingDimension,
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
    }),
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

function sign(body: string): string {
  return `sha256=${createHmac('sha256', TOKEN).update(body).digest('hex')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
