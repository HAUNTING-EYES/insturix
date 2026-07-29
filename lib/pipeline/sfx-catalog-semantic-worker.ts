import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION,
  SFX_CATALOG_SEMANTIC_QUERY_VERSION,
  type SfxCatalogSemanticQueryRequest,
  type SfxCatalogSemanticQueryResponse,
} from '@/lib/pipeline/sfx-catalog-semantic-client';
import {
  createFilesystemSfxCatalogSemanticRetriever,
  type SfxCatalogSemanticRetriever,
} from '@/lib/pipeline/sfx-catalog-semantic-index';
import {
  parseSfxCatalogManifest,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const REQUEST_SIGNATURE_HEADER = 'x-editron-sfx-request-signature';
const RESPONSE_SIGNATURE_HEADER = 'x-editron-sfx-response-signature';
const RESULT_LIMIT = 12;
const MAX_QUERY_CHARACTERS = 1_000;
const DEFAULT_MAX_PENDING_REQUESTS = 16;

export const SFX_SEMANTIC_WORKER_QUERY_PATH = '/v1/query' as const;
export const SFX_SEMANTIC_WORKER_HEALTH_PATH = '/healthz' as const;
export const SFX_SEMANTIC_WORKER_MAX_BODY_BYTES = 64 * 1024;
export const SFX_SEMANTIC_WORKER_MANIFEST_PATH_ENV =
  'SFX_CATALOG_PROMOTED_MANIFEST_PATH' as const;

export interface SfxCatalogSemanticWorkerRequest {
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  body: string;
}

export interface SfxCatalogSemanticWorkerResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface SfxCatalogSemanticWorker {
  handle(
    request: SfxCatalogSemanticWorkerRequest,
  ): Promise<SfxCatalogSemanticWorkerResponse>;
  dispose(): Promise<void>;
}

export interface CreateSfxCatalogSemanticWorkerOptions {
  token: string;
  manifest: SfxCatalogManifest;
  retriever: SfxCatalogSemanticRetriever;
  maxPendingRequests?: number;
  onError?: (error: unknown) => void;
}

export interface CreateFilesystemSfxCatalogSemanticWorkerOptions {
  token: string;
  manifestPath: string;
  releaseDirectory: string;
  modelCacheDirectory: string;
  maxPendingRequests?: number;
  onError?: (error: unknown) => void;
}

class WorkerRequestError extends Error {
  constructor(
    readonly status: number,
    readonly publicCode: string,
  ) {
    super(publicCode);
    this.name = 'WorkerRequestError';
  }
}

export async function createFilesystemSfxCatalogSemanticWorker(
  options: CreateFilesystemSfxCatalogSemanticWorkerOptions,
): Promise<SfxCatalogSemanticWorker> {
  const manifest = parseSfxCatalogManifest(
    JSON.parse(await readFile(options.manifestPath, 'utf8')) as unknown,
  );
  const retriever = await createFilesystemSfxCatalogSemanticRetriever({
    releaseDirectory: options.releaseDirectory,
    modelCacheDirectory: options.modelCacheDirectory,
  });
  try {
    return createSfxCatalogSemanticWorker({
      token: options.token,
      manifest,
      retriever,
      ...(options.maxPendingRequests === undefined
        ? {}
        : { maxPendingRequests: options.maxPendingRequests }),
      ...(options.onError ? { onError: options.onError } : {}),
    });
  } catch (error) {
    await retriever.dispose?.();
    throw error;
  }
}

export function createSfxCatalogSemanticWorker(
  options: CreateSfxCatalogSemanticWorkerOptions,
): SfxCatalogSemanticWorker {
  const token = options.token.trim();
  if (token.length < 32) {
    throw new Error('Semantic SFX worker token must contain at least 32 characters');
  }
  const maxPendingRequests = options.maxPendingRequests
    ?? DEFAULT_MAX_PENDING_REQUESTS;
  if (!Number.isSafeInteger(maxPendingRequests) || maxPendingRequests <= 0) {
    throw new Error('Semantic SFX worker max pending requests must be positive');
  }

  const manifest = parseSfxCatalogManifest(options.manifest);
  const manifestDigest = hashJson(manifest);
  const semanticAssetIds = manifest.entries
    .filter(entry => Boolean(entry.semanticEvidence))
    .map(entry => entry.assetId)
    .sort();
  if (semanticAssetIds.length === 0) {
    throw new Error('Semantic SFX worker manifest contains no semantic assets');
  }

  let pendingRequests = 0;
  let retrievalTail: Promise<void> = Promise.resolve();

  async function retrieve(
    request: SfxCatalogSemanticQueryRequest,
  ): Promise<SfxCatalogSemanticQueryResponse> {
    if (pendingRequests >= maxPendingRequests) {
      throw new WorkerRequestError(503, 'semantic_worker_busy');
    }
    pendingRequests += 1;
    const task = retrievalTail.then(async () => {
      const result = await options.retriever.retrieve(request.query, manifest);
      const matches = semanticAssetIds
        .map(assetId => {
          const similarity = result.similarityByAssetId.get(assetId);
          if (similarity === undefined || !Number.isFinite(similarity)) {
            throw new Error(`Semantic retriever omitted configured asset ${assetId}`);
          }
          return {
            assetId,
            cosineSimilarity: round6(Math.max(-1, Math.min(1, similarity))),
          };
        })
        .sort(compareMatches);
      const candidates = matches.slice(0, RESULT_LIMIT);
      if (
        result.similarityByAssetId.size !== semanticAssetIds.length
        || result.report.promotedManifestDigestSha256 !== manifestDigest
        || result.report.queryDigestSha256 !== request.queryDigestSha256
        || result.report.indexedAssetCount !== matches.length
        || JSON.stringify(result.report.candidates) !== JSON.stringify(candidates)
      ) {
        throw new Error('Semantic retriever returned an unbound audit report');
      }
      return {
        version: SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION,
        matches,
        report: {
          ...result.report,
          candidates,
        },
      };
    });
    retrievalTail = task.then(() => undefined, () => undefined);
    try {
      return await task;
    } finally {
      pendingRequests -= 1;
    }
  }

  return {
    async handle(request) {
      const baseHeaders = {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      };
      if (
        request.path === SFX_SEMANTIC_WORKER_HEALTH_PATH
        && request.method.toUpperCase() === 'GET'
      ) {
        return {
          status: 200,
          headers: baseHeaders,
          body: JSON.stringify({ status: 'ok' }),
        };
      }
      try {
        if (request.path !== SFX_SEMANTIC_WORKER_QUERY_PATH) {
          throw new WorkerRequestError(404, 'not_found');
        }
        if (request.method.toUpperCase() !== 'POST') {
          throw new WorkerRequestError(405, 'method_not_allowed');
        }
        const contentType = header(request.headers, 'content-type');
        if (!contentType?.toLowerCase().startsWith('application/json')) {
          throw new WorkerRequestError(415, 'unsupported_media_type');
        }
        if (Buffer.byteLength(request.body) > SFX_SEMANTIC_WORKER_MAX_BODY_BYTES) {
          throw new WorkerRequestError(413, 'request_too_large');
        }
        authenticate(request.headers, request.body, token);
        const parsed = parseRequest(
          request.body,
          manifestDigest,
          semanticAssetIds,
        );
        const responseBody = JSON.stringify(await retrieve(parsed));
        return {
          status: 200,
          headers: {
            ...baseHeaders,
            [RESPONSE_SIGNATURE_HEADER]: signature(token, responseBody),
          },
          body: responseBody,
        };
      } catch (error) {
        if (error instanceof WorkerRequestError) {
          return {
            status: error.status,
            headers: baseHeaders,
            body: JSON.stringify({ error: error.publicCode }),
          };
        }
        options.onError?.(error);
        return {
          status: 500,
          headers: baseHeaders,
          body: JSON.stringify({ error: 'semantic_retrieval_failed' }),
        };
      }
    },
    async dispose() {
      await retrievalTail;
      await options.retriever.dispose?.();
    },
  };
}

function authenticate(
  headers: Readonly<Record<string, string | undefined>>,
  body: string,
  token: string,
): void {
  const authorization = header(headers, 'authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const suppliedSignature = header(headers, REQUEST_SIGNATURE_HEADER) ?? '';
  if (
    !constantTimeStringEqual(bearer, token)
    || !constantTimeStringEqual(suppliedSignature, signature(token, body))
  ) {
    throw new WorkerRequestError(401, 'unauthorized');
  }
}

function parseRequest(
  body: string,
  manifestDigest: string,
  semanticAssetIds: readonly string[],
): SfxCatalogSemanticQueryRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new WorkerRequestError(400, 'invalid_request');
  }
  if (!isRecord(raw)) throw new WorkerRequestError(400, 'invalid_request');
  if (
    !hasExactKeys(raw, [
      'version',
      'query',
      'queryDigestSha256',
      'promotedManifestDigestSha256',
      'semanticAssetIds',
    ])
    || raw.version !== SFX_CATALOG_SEMANTIC_QUERY_VERSION
    || typeof raw.query !== 'string'
    || typeof raw.queryDigestSha256 !== 'string'
    || typeof raw.promotedManifestDigestSha256 !== 'string'
    || !Array.isArray(raw.semanticAssetIds)
  ) {
    throw new WorkerRequestError(400, 'invalid_request');
  }
  const query = raw.query.trim().replace(/\s+/g, ' ');
  const assetIds = raw.semanticAssetIds;
  if (
    !query
    || query !== raw.query
    || query.length > MAX_QUERY_CHARACTERS
    || !SHA256_PATTERN.test(raw.queryDigestSha256)
    || raw.queryDigestSha256 !== hashBuffer(Buffer.from(query))
    || raw.promotedManifestDigestSha256 !== manifestDigest
    || assetIds.length !== semanticAssetIds.length
    || assetIds.some((assetId, index) => (
      typeof assetId !== 'string'
      || !ASSET_ID_PATTERN.test(assetId)
      || assetId !== semanticAssetIds[index]
    ))
  ) {
    throw new WorkerRequestError(409, 'request_binding_mismatch');
  }
  return {
    version: SFX_CATALOG_SEMANTIC_QUERY_VERSION,
    query,
    queryDigestSha256: raw.queryDigestSha256,
    promotedManifestDigestSha256: raw.promotedManifestDigestSha256,
    semanticAssetIds: [...assetIds] as string[],
  };
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  return actual.length === expected.size && actual.every(key => expected.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareMatches(
  left: { assetId: string; cosineSimilarity: number },
  right: { assetId: string; cosineSimilarity: number },
): number {
  return (
    right.cosineSimilarity - left.cosineSimilarity
    || left.assetId.localeCompare(right.assetId)
  );
}

function signature(token: string, body: string): string {
  return `sha256=${createHmac('sha256', token).update(body).digest('hex')}`;
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
