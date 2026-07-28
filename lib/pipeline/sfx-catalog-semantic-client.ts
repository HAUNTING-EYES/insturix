import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import type { SfxCatalogManifest } from '@/lib/pipeline/sfx-catalog';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSET_ID_PATTERN = /^sfx_catalog_[a-z0-9_-]+$/;
const RESPONSE_BODY_LIMIT_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const RESULT_LIMIT = 12;

export const SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION =
  'editron-sfx-catalog-semantic-retrieval-v1' as const;
export const SFX_CATALOG_SEMANTIC_QUERY_VERSION =
  'editron-sfx-catalog-semantic-query-v1' as const;
export const SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION =
  'editron-sfx-catalog-semantic-query-response-v1' as const;
export const SFX_SEMANTIC_RETRIEVAL_URL_ENV =
  'SFX_SEMANTIC_RETRIEVAL_URL' as const;
export const SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV =
  'SFX_SEMANTIC_RETRIEVAL_TOKEN' as const;
export const SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS_ENV =
  'SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS' as const;

export interface SfxCatalogSemanticModelDescriptor {
  provider: 'huggingface-transformers-js';
  packageVersion: '3.8.1';
  modelId: 'Xenova/clap-htsat-unfused';
  revision: 'c28f2883575e590e04d3146ff0713c2448d691ba';
  dtype: 'q8';
  sampleRateHz: number;
  embeddingDimension: number;
  windowing: 'non-overlapping-10s-duration-weighted-mean';
}

export interface SfxCatalogSemanticMatch {
  assetId: string;
  cosineSimilarity: number;
}

export interface SfxCatalogSemanticRetrievalReport {
  version: typeof SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION;
  releaseReceiptDigestSha256: string;
  promotedManifestDigestSha256: string;
  queryDigestSha256: string;
  model: SfxCatalogSemanticModelDescriptor;
  indexedAssetCount: number;
  candidates: SfxCatalogSemanticMatch[];
}

export interface SfxCatalogSemanticRetrieval {
  similarityByAssetId: ReadonlyMap<string, number>;
  report: SfxCatalogSemanticRetrievalReport;
}

export interface SfxCatalogSemanticQueryRequest {
  version: typeof SFX_CATALOG_SEMANTIC_QUERY_VERSION;
  query: string;
  queryDigestSha256: string;
  promotedManifestDigestSha256: string;
  semanticAssetIds: string[];
}

export interface SfxCatalogSemanticQueryResponse {
  version: typeof SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION;
  matches: SfxCatalogSemanticMatch[];
  report: SfxCatalogSemanticRetrievalReport;
}

export type SfxCatalogSemanticClientErrorCode =
  | 'SEMANTIC_CLIENT_CONFIGURATION_INCOMPLETE'
  | 'SEMANTIC_CLIENT_INVALID_URL'
  | 'SEMANTIC_CLIENT_INVALID_TOKEN'
  | 'SEMANTIC_CLIENT_INVALID_TIMEOUT'
  | 'SEMANTIC_CLIENT_EMPTY_QUERY'
  | 'SEMANTIC_CLIENT_TIMEOUT'
  | 'SEMANTIC_CLIENT_TRANSPORT_ERROR'
  | 'SEMANTIC_CLIENT_REMOTE_ERROR'
  | 'SEMANTIC_CLIENT_RESPONSE_TOO_LARGE'
  | 'SEMANTIC_CLIENT_RESPONSE_UNSIGNED'
  | 'SEMANTIC_CLIENT_RESPONSE_SIGNATURE_MISMATCH'
  | 'SEMANTIC_CLIENT_INVALID_RESPONSE'
  | 'SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH';

export class SfxCatalogSemanticClientError extends Error {
  constructor(
    public readonly code: SfxCatalogSemanticClientErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SfxCatalogSemanticClientError';
  }
}

export interface SfxCatalogSemanticClientDependencies {
  fetch?: typeof fetch;
}

export async function retrieveConfiguredSfxCatalogSemantics(
  query: string,
  manifest: SfxCatalogManifest,
  dependencies: SfxCatalogSemanticClientDependencies = {},
): Promise<SfxCatalogSemanticRetrieval | undefined> {
  const config = configuredClient();
  if (!config) return undefined;
  const semanticAssetIds = manifest.entries
    .filter(entry => Boolean(entry.semanticEvidence))
    .map(entry => entry.assetId)
    .sort();
  if (semanticAssetIds.length === 0) return undefined;

  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) {
    fail('SEMANTIC_CLIENT_EMPTY_QUERY', 'Semantic SFX retrieval requires a non-empty query');
  }
  const request: SfxCatalogSemanticQueryRequest = {
    version: SFX_CATALOG_SEMANTIC_QUERY_VERSION,
    query: normalizedQuery,
    queryDigestSha256: hashBuffer(Buffer.from(normalizedQuery)),
    promotedManifestDigestSha256: hashJson(manifest),
    semanticAssetIds,
  };
  const requestBody = JSON.stringify(request);
  const response = await fetchSemanticResponse(
    config,
    requestBody,
    dependencies.fetch ?? fetch,
  );
  return parseAndVerifyResponse(response, request, config.token);
}

interface SemanticClientConfig {
  url: URL;
  token: string;
  timeoutMs: number;
}

interface SignedSemanticResponse {
  body: string;
  signature: string;
}

async function fetchSemanticResponse(
  config: SemanticClientConfig,
  body: string,
  fetchImpl: typeof fetch,
): Promise<SignedSemanticResponse> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        'x-editron-sfx-request-signature': signature(config.token, body),
      },
      body,
      cache: 'no-store',
      signal: abortController.signal,
    });
    if (!response.ok) {
      fail(
        'SEMANTIC_CLIENT_REMOTE_ERROR',
        `Semantic SFX retrieval returned HTTP ${response.status}`,
      );
    }
    const responseSignature = response.headers.get('x-editron-sfx-response-signature');
    if (!responseSignature) {
      fail('SEMANTIC_CLIENT_RESPONSE_UNSIGNED', 'Semantic SFX response is not signed');
    }
    return {
      body: await readBoundedResponseBody(response),
      signature: responseSignature,
    };
  } catch (error) {
    if (error instanceof SfxCatalogSemanticClientError) throw error;
    if (abortController.signal.aborted) {
      throw new SfxCatalogSemanticClientError(
        'SEMANTIC_CLIENT_TIMEOUT',
        `Semantic SFX retrieval exceeded ${config.timeoutMs}ms`,
        { cause: error },
      );
    }
    throw new SfxCatalogSemanticClientError(
      'SEMANTIC_CLIENT_TRANSPORT_ERROR',
      'Semantic SFX retrieval request failed',
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function parseAndVerifyResponse(
  response: SignedSemanticResponse,
  request: SfxCatalogSemanticQueryRequest,
  token: string,
): Promise<SfxCatalogSemanticRetrieval> {
  if (!signaturesEqual(response.signature, signature(token, response.body))) {
    fail(
      'SEMANTIC_CLIENT_RESPONSE_SIGNATURE_MISMATCH',
      'Semantic SFX response signature does not match its body',
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(response.body);
  } catch (error) {
    throw new SfxCatalogSemanticClientError(
      'SEMANTIC_CLIENT_INVALID_RESPONSE',
      'Semantic SFX response is not valid JSON',
      { cause: error },
    );
  }
  const parsed = parseResponse(raw);
  verifyResponseBinding(parsed, request);
  return {
    similarityByAssetId: new Map(
      parsed.matches.map(match => [match.assetId, match.cosineSimilarity]),
    ),
    report: parsed.report,
  };
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const bytes = Buffer.from(chunk.value);
    totalBytes += bytes.byteLength;
    if (totalBytes > RESPONSE_BODY_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined);
      fail(
        'SEMANTIC_CLIENT_RESPONSE_TOO_LARGE',
        `Semantic SFX response exceeds ${RESPONSE_BODY_LIMIT_BYTES} bytes`,
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function parseResponse(value: unknown): SfxCatalogSemanticQueryResponse {
  const root = recordValue(value, 'response');
  exactKeys(root, ['version', 'matches', 'report'], 'response');
  if (root.version !== SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION) {
    invalid('response.version is unsupported');
  }
  const matches = matchArray(root.matches, 'response.matches');
  const reportValue = recordValue(root.report, 'response.report');
  exactKeys(reportValue, [
    'version',
    'releaseReceiptDigestSha256',
    'promotedManifestDigestSha256',
    'queryDigestSha256',
    'model',
    'indexedAssetCount',
    'candidates',
  ], 'response.report');
  if (reportValue.version !== SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION) {
    invalid('response.report.version is unsupported');
  }
  const indexedAssetCount = integerValue(
    reportValue.indexedAssetCount,
    'response.report.indexedAssetCount',
  );
  if (indexedAssetCount <= 0) invalid('response.report.indexedAssetCount must be positive');
  return {
    version: SFX_CATALOG_SEMANTIC_QUERY_RESPONSE_VERSION,
    matches,
    report: {
      version: SFX_CATALOG_SEMANTIC_RETRIEVAL_VERSION,
      releaseReceiptDigestSha256: sha256Value(
        reportValue.releaseReceiptDigestSha256,
        'response.report.releaseReceiptDigestSha256',
      ),
      promotedManifestDigestSha256: sha256Value(
        reportValue.promotedManifestDigestSha256,
        'response.report.promotedManifestDigestSha256',
      ),
      queryDigestSha256: sha256Value(
        reportValue.queryDigestSha256,
        'response.report.queryDigestSha256',
      ),
      model: modelDescriptor(reportValue.model),
      indexedAssetCount,
      candidates: matchArray(reportValue.candidates, 'response.report.candidates'),
    },
  };
}

function verifyResponseBinding(
  response: SfxCatalogSemanticQueryResponse,
  request: SfxCatalogSemanticQueryRequest,
): void {
  if (
    response.report.queryDigestSha256 !== request.queryDigestSha256
    || response.report.promotedManifestDigestSha256
      !== request.promotedManifestDigestSha256
  ) {
    bindingMismatch('Semantic SFX response belongs to another query or manifest');
  }
  if (
    response.report.indexedAssetCount !== response.matches.length
    || response.report.candidates.length !== Math.min(RESULT_LIMIT, response.matches.length)
  ) {
    bindingMismatch('Semantic SFX response counts are inconsistent');
  }
  const expectedAssetIds = new Set(request.semanticAssetIds);
  const seenAssetIds = new Set<string>();
  for (const [index, match] of response.matches.entries()) {
    if (!expectedAssetIds.has(match.assetId) || seenAssetIds.has(match.assetId)) {
      bindingMismatch(`Semantic SFX response contains an invalid asset: ${match.assetId}`);
    }
    if (index > 0 && compareMatches(response.matches[index - 1], match) > 0) {
      bindingMismatch('Semantic SFX matches are not deterministically ordered');
    }
    seenAssetIds.add(match.assetId);
  }
  if (
    seenAssetIds.size !== expectedAssetIds.size
    || request.semanticAssetIds.some(assetId => !seenAssetIds.has(assetId))
  ) {
    bindingMismatch('Semantic SFX response asset set differs from the active manifest');
  }
  response.report.candidates.forEach((candidate, index) => {
    const expected = response.matches[index];
    if (
      !expected
      || candidate.assetId !== expected.assetId
      || candidate.cosineSimilarity !== expected.cosineSimilarity
    ) {
      bindingMismatch('Semantic SFX audit candidates differ from ranked matches');
    }
  });
}

function configuredClient(): SemanticClientConfig | undefined {
  const rawUrl = process.env[SFX_SEMANTIC_RETRIEVAL_URL_ENV]?.trim();
  const token = process.env[SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV]?.trim();
  if (!rawUrl && !token) return undefined;
  if (!rawUrl || !token) {
    fail(
      'SEMANTIC_CLIENT_CONFIGURATION_INCOMPLETE',
      `${SFX_SEMANTIC_RETRIEVAL_URL_ENV} and ${SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV} must be configured together`,
    );
  }
  if (token.length < 32) {
    fail(
      'SEMANTIC_CLIENT_INVALID_TOKEN',
      `${SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV} must contain at least 32 characters`,
    );
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new SfxCatalogSemanticClientError(
      'SEMANTIC_CLIENT_INVALID_URL',
      `${SFX_SEMANTIC_RETRIEVAL_URL_ENV} is not a valid URL`,
      { cause: error },
    );
  }
  const localDevelopmentUrl = process.env.NODE_ENV !== 'production'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopmentUrl) {
    fail(
      'SEMANTIC_CLIENT_INVALID_URL',
      `${SFX_SEMANTIC_RETRIEVAL_URL_ENV} must use HTTPS`,
    );
  }
  return {
    url,
    token,
    timeoutMs: configuredTimeoutMs(),
  };
}

function configuredTimeoutMs(): number {
  const raw = process.env[SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS_ENV]?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value)
    || value < MIN_TIMEOUT_MS
    || value > MAX_TIMEOUT_MS
  ) {
    fail(
      'SEMANTIC_CLIENT_INVALID_TIMEOUT',
      `${SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS_ENV} must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
    );
  }
  return value;
}

function matchArray(value: unknown, label: string): SfxCatalogSemanticMatch[] {
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must be a non-empty array`);
  return value.map((item, index) => {
    const match = recordValue(item, `${label}[${index}]`);
    exactKeys(match, ['assetId', 'cosineSimilarity'], `${label}[${index}]`);
    const assetId = stringValue(match.assetId, `${label}[${index}].assetId`);
    if (!ASSET_ID_PATTERN.test(assetId)) invalid(`${label}[${index}].assetId is invalid`);
    const cosineSimilarity = numberValue(
      match.cosineSimilarity,
      `${label}[${index}].cosineSimilarity`,
    );
    if (cosineSimilarity < -1 || cosineSimilarity > 1) {
      invalid(`${label}[${index}].cosineSimilarity must be between -1 and 1`);
    }
    return { assetId, cosineSimilarity };
  });
}

function modelDescriptor(value: unknown): SfxCatalogSemanticModelDescriptor {
  const model = recordValue(value, 'response.report.model');
  const expected: SfxCatalogSemanticModelDescriptor = {
    provider: 'huggingface-transformers-js',
    packageVersion: '3.8.1',
    modelId: 'Xenova/clap-htsat-unfused',
    revision: 'c28f2883575e590e04d3146ff0713c2448d691ba',
    dtype: 'q8',
    sampleRateHz: 48_000,
    embeddingDimension: 512,
    windowing: 'non-overlapping-10s-duration-weighted-mean',
  };
  exactKeys(model, Object.keys(expected), 'response.report.model');
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (model[key] !== expectedValue) invalid(`response.report.model.${key} is invalid`);
  }
  return expected;
}

function compareMatches(
  left: SfxCatalogSemanticMatch,
  right: SfxCatalogSemanticMatch,
): number {
  return (
    right.cosineSimilarity - left.cosineSimilarity
    || left.assetId.localeCompare(right.assetId)
  );
}

function signature(token: string, body: string): string {
  return `sha256=${createHmac('sha256', token).update(body).digest('hex')}`;
}

function signaturesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size
    || actual.some(key => !expected.has(key))
  ) {
    invalid(`${label} contains unexpected or missing fields`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(`${label} must be a string`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${label} must be finite`);
  }
  return value;
}

function integerValue(value: unknown, label: string): number {
  const parsed = numberValue(value, label);
  if (!Number.isSafeInteger(parsed)) invalid(`${label} must be an integer`);
  return parsed;
}

function sha256Value(value: unknown, label: string): string {
  const parsed = stringValue(value, label);
  if (!SHA256_PATTERN.test(parsed)) invalid(`${label} must be a SHA-256 digest`);
  return parsed;
}

function invalid(message: string): never {
  fail('SEMANTIC_CLIENT_INVALID_RESPONSE', message);
}

function bindingMismatch(message: string): never {
  fail('SEMANTIC_CLIENT_RESPONSE_BINDING_MISMATCH', message);
}

function fail(
  code: SfxCatalogSemanticClientErrorCode,
  message: string,
): never {
  throw new SfxCatalogSemanticClientError(code, message);
}
