import {
  createHash,
  createHmac,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  retrieveConfiguredSfxCatalogSemantics,
  SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION,
  SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
  SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID_ENV,
  SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET_ENV,
  SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS_ENV,
  SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV,
  SFX_SEMANTIC_RETRIEVAL_URL_ENV,
  type SfxCatalogSemanticQueryRequest,
  type SfxCatalogSemanticQueryResponse,
} from '@/lib/pipeline/sfx-catalog-semantic-client';

const TOKEN = 'semantic-worker-shared-secret-32-bytes';
const ENDPOINT = 'http://127.0.0.1:4567/query';
const MODAL_ENDPOINT = 'https://jainnimit728--editron-sfx-semantic-canary-serve.modal.run/v1/query';
const MODAL_PROXY_TOKEN_ID = 'wk-semanticcanary';
const MODAL_PROXY_TOKEN_SECRET = 'ws-semanticcanarysecret';
const GENERATED_AT = '2026-07-29T00:00:00.000Z';
const RESPONSE_BODY_LIMIT_BYTES = 1_048_576;
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

describe('SFX catalog semantic client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env[SFX_SEMANTIC_RETRIEVAL_URL_ENV];
    delete process.env[SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV];
    delete process.env[SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS_ENV];
    delete process.env[SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID_ENV];
    delete process.env[SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET_ENV];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not call the network when semantic retrieval is unconfigured', async () => {
    const fetchMock = vi.fn();

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'directional whoosh',
        makeManifest(),
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects partial configuration instead of silently dropping semantic retrieval', async () => {
    vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_URL_ENV, ENDPOINT);

    await expect(
      retrieveConfiguredSfxCatalogSemantics('directional whoosh', makeManifest()),
    ).rejects.toMatchObject({
      name: 'SfxCatalogSemanticClientError',
      code: 'SEMANTIC_CLIENT_CONFIGURATION_INCOMPLETE',
    });
  });

  it('authenticates the request and accepts a signed, manifest-bound response', async () => {
    configureClient();
    const manifest = makeManifest();
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      expect(String(input)).toBe(ENDPOINT);
      expect(init?.method).toBe('POST');
      expect(init?.cache).toBe('no-store');
      const body = String(init?.body);
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(headers.get('x-editron-sfx-request-signature')).toBe(sign(body));
      expect(headers.get('modal-key')).toBeNull();
      expect(headers.get('modal-secret')).toBeNull();
      const request = JSON.parse(body) as SfxCatalogSemanticQueryRequest;
      expect(request).toMatchObject({
        query: 'directional whoosh',
        queryDigestSha256: sha256('directional whoosh'),
        promotedManifestDigestSha256: hashJson(manifest),
        semanticAssetIds: ['sfx_catalog_alpha', 'sfx_catalog_beta'],
      });
      return signedResponse(makeResponse(request));
    });

    const result = await retrieveConfiguredSfxCatalogSemantics(
      '  directional   whoosh  ',
      manifest,
      { fetch: fetchMock as unknown as typeof fetch },
    );

    expect(result?.similarityByAssetId).toEqual(new Map([
      ['sfx_catalog_alpha', 0.8],
      ['sfx_catalog_beta', 0.6],
    ]));
    expect(result?.report).toMatchObject({
      version: SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
      indexedAssetCount: 2,
      candidates: [
        { assetId: 'sfx_catalog_alpha', cosineSimilarity: 0.8 },
        { assetId: 'sfx_catalog_beta', cosineSimilarity: 0.6 },
      ],
    });
  });

  it('requires valid Modal proxy credentials and sends both auth layers', async () => {
    vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_URL_ENV, MODAL_ENDPOINT);
    vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV, TOKEN);

    await expect(
      retrieveConfiguredSfxCatalogSemantics('whoosh', makeManifest()),
    ).rejects.toMatchObject({
      code: 'SEMANTIC_CLIENT_CONFIGURATION_INCOMPLETE',
    });

    vi.stubEnv(SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID_ENV, 'ak-api-token');
    vi.stubEnv(SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET_ENV, 'as-api-secret');
    await expect(
      retrieveConfiguredSfxCatalogSemantics('whoosh', makeManifest()),
    ).rejects.toMatchObject({
      code: 'SEMANTIC_CLIENT_INVALID_MODAL_PROXY_TOKEN',
    });

    vi.stubEnv(SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID_ENV, MODAL_PROXY_TOKEN_ID);
    vi.stubEnv(
      SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET_ENV,
      MODAL_PROXY_TOKEN_SECRET,
    );
    const manifest = makeManifest();
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      expect(String(input)).toBe(MODAL_ENDPOINT);
      const headers = new Headers(init?.headers);
      expect(headers.get('modal-key')).toBe(MODAL_PROXY_TOKEN_ID);
      expect(headers.get('modal-secret')).toBe(MODAL_PROXY_TOKEN_SECRET);
      expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      const body = String(init?.body);
      expect(headers.get('x-editron-sfx-request-signature')).toBe(sign(body));
      return signedResponse(
        makeResponse(JSON.parse(body) as SfxCatalogSemanticQueryRequest),
      );
    });

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        manifest,
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).resolves.toBeDefined();
  });

  it('never sends Modal proxy credentials to a non-Modal endpoint', async () => {
    vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_URL_ENV, 'https://example.com/v1/query');
    vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV, TOKEN);
    vi.stubEnv(SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID_ENV, MODAL_PROXY_TOKEN_ID);
    vi.stubEnv(
      SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET_ENV,
      MODAL_PROXY_TOKEN_SECRET,
    );
    const fetchMock = vi.fn();

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        makeManifest(),
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: 'SEMANTIC_CLIENT_INVALID_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsigned and tampered responses', async () => {
    configureClient();
    const manifest = makeManifest();
    const unsignedFetch = responseFetch(request => {
      const body = JSON.stringify(makeResponse(request));
      return new Response(body, { status: 200 });
    });
    const tamperedFetch = responseFetch(request => {
      const body = JSON.stringify(makeResponse(request));
      return new Response(`${body} `, {
        status: 200,
        headers: { 'x-editron-sfx-response-signature': sign(body) },
      });
    });

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        manifest,
        { fetch: unsignedFetch },
      ),
    ).rejects.toMatchObject({ code: 'SEMANTIC_CLIENT_RESPONSE_UNSIGNED' });
    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        manifest,
        { fetch: tamperedFetch },
      ),
    ).rejects.toMatchObject({ code: 'SEMANTIC_CLIENT_RESPONSE_SIGNATURE_MISMATCH' });
  });

  it.each([
    ['another query', 'queryDigestSha256'],
    ['another manifest', 'promotedManifestDigestSha256'],
  ])('rejects a signed response bound to %s', async (_label, field) => {
    configureClient();
    const fetchImpl = validResponseFetch(response => {
      response.report[field as 'queryDigestSha256'] = 'f'.repeat(64);
    });

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        makeManifest(),
        { fetch: fetchImpl },
      ),
    ).rejects.toMatchObject({ code: 'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH' });
  });

  it.each([
    [
      'duplicate assets',
      (response: SfxCatalogSemanticQueryResponse) => {
        response.matches[1] = {
          assetId: 'sfx_catalog_alpha',
          cosineSimilarity: 0.6,
        };
        response.report.candidates = response.matches.slice();
      },
      'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH',
    ],
    [
      'unknown assets',
      (response: SfxCatalogSemanticQueryResponse) => {
        response.matches[1] = {
          assetId: 'sfx_catalog_rogue',
          cosineSimilarity: 0.6,
        };
        response.report.candidates = response.matches.slice();
      },
      'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH',
    ],
    [
      'missing assets',
      (response: SfxCatalogSemanticQueryResponse) => {
        response.matches = response.matches.slice(0, 1);
        response.report.indexedAssetCount = 1;
        response.report.candidates = response.matches.slice();
      },
      'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH',
    ],
    [
      'out-of-range similarity',
      (response: SfxCatalogSemanticQueryResponse) => {
        response.matches[0].cosineSimilarity = 2;
        response.report.candidates = response.matches.slice();
      },
      'SEMANTIC_CLIENT_INVALID_RESPONSE',
    ],
    [
      'non-deterministic ordering',
      (response: SfxCatalogSemanticQueryResponse) => {
        response.matches.reverse();
        response.report.candidates = response.matches.slice();
      },
      'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH',
    ],
  ])('rejects %s', async (_label, mutate, code) => {
    configureClient();
    const fetchImpl = validResponseFetch(mutate);

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        makeManifest(),
        { fetch: fetchImpl },
      ),
    ).rejects.toMatchObject({ code });
  });

  it('aborts oversized response bodies before parsing them', async () => {
    configureClient();
    const body = 'x'.repeat(RESPONSE_BODY_LIMIT_BYTES + 1);
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(body, {
      status: 200,
      headers: { 'x-editron-sfx-response-signature': sign(body) },
    }));

    await expect(
      retrieveConfiguredSfxCatalogSemantics(
        'whoosh',
        makeManifest(),
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: 'SEMANTIC_CLIENT_RESPONSE_TOO_LARGE' });
  });

  it('keeps model and vector code outside the Vercel import graph', async () => {
    const librarySource = await readFile(
      path.join(process.cwd(), 'lib/pipeline/sfx-library-service.ts'),
      'utf8',
    );
    const clientSource = await readFile(
      path.join(process.cwd(), 'lib/pipeline/sfx-catalog-semantic-client.ts'),
      'utf8',
    );

    expect(librarySource).toContain("from '@/lib/pipeline/sfx-catalog-semantic-client'");
    expect(librarySource).not.toContain("from '@/lib/pipeline/sfx-catalog-semantic-index'");
    expect(clientSource).not.toContain('sfx-catalog-semantic-index');
    expect(clientSource).not.toContain('sfx-audio-embedding');
    expect(clientSource).not.toContain('@huggingface/transformers');
  });
});

function configureClient(): void {
  vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_URL_ENV, ENDPOINT);
  vi.stubEnv(SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV, TOKEN);
}

function responseFetch(
  build: (request: SfxCatalogSemanticQueryRequest) => Response,
): typeof fetch {
  const fetchMock = vi.fn(async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => (
    build(JSON.parse(String(init?.body)) as SfxCatalogSemanticQueryRequest)
  ));
  return fetchMock as unknown as typeof fetch;
}

function validResponseFetch(
  mutate: (response: SfxCatalogSemanticQueryResponse) => void,
): typeof fetch {
  return responseFetch(request => {
    const response = makeResponse(request);
    mutate(response);
    return signedResponse(response);
  });
}

function signedResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: { 'x-editron-sfx-response-signature': sign(body) },
  });
}

function makeResponse(
  request: SfxCatalogSemanticQueryRequest,
): SfxCatalogSemanticQueryResponse {
  const similarities = [0.8, 0.6];
  const matches = request.semanticAssetIds.map((assetId, index) => ({
    assetId,
    cosineSimilarity: similarities[index] ?? 0,
  }));
  return {
    version: SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION,
    matches,
    report: {
      version: SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
      releaseReceiptDigestSha256: 'e'.repeat(64),
      promotedManifestDigestSha256: request.promotedManifestDigestSha256,
      queryDigestSha256: request.queryDigestSha256,
      model: MODEL,
      indexedAssetCount: matches.length,
      candidates: matches.slice(0, 12),
    },
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
