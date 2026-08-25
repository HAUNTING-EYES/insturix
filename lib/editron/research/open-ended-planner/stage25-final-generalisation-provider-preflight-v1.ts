import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOpenAiGpt56InputTokensV2,
  OPENAI_INPUT_ESTIMATOR_VERSION_V2,
} from './openai-input-token-counter-v2';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import { providerNativeCohortRoutesV2R }
  from './provider-native-cohort-manifest-v2r';
import { resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import {
  STAGE25_FINAL_GENERALISATION_COHORT_V1,
} from './stage25-final-generalisation-cohort-v1';
import {
  STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
  STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
  captureStage25FinalGeneralisationInitialRequestV1,
} from './stage25-final-generalisation-protocol-v1';
import { runStage25FinalGeneralisationZeroSpendPreflightV1 }
  from './stage25-final-generalisation-zero-spend-preflight-v1';

type JsonRecord = Record<string, unknown>;
type RouteEntry = ReturnType<typeof providerNativeCohortRoutesV2R>[number];

export const STAGE25_FINAL_GENERALISATION_PROVIDER_PREFLIGHT_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PROVIDER_PREFLIGHT_V1_1' as const;

const PRICING_EVIDENCE = deepFreezeV1([
  price('OPENAI_LUNA', 'gpt-5.6-luna', 0.20, 0.02, 0.25, 1.20,
    'https://developers.openai.com/api/docs/models/gpt-5.6-luna', null),
  price('OPENAI_TERRA', 'gpt-5.6-terra', 2.00, 0.20, 2.50, 12.00,
    'https://developers.openai.com/api/docs/models/gpt-5.6-terra', null),
  price('GOOGLE_FLASH', 'gemini-3.7-flash', 0.75, 0.075, 0.75, 3.75,
    'https://ai.google.dev/gemini-api/docs/pricing',
    '2026-12-31T23:59:59.999Z'),
]);

export interface Stage25FinalGeneralisationProviderCaptureV1 {
  rowId: string;
  taskId: string;
  routeId: string;
  provider: 'openai' | 'google';
  model: string;
  requestSha256: string;
  boundedInputTokens: number;
  tokenCountMethod: string;
  countResponseSha256: string | null;
  initialAttemptCostUpperBoundUsd: number;
}

export interface Stage25FinalGeneralisationProviderBundleV1 {
  receipt: Readonly<JsonRecord>;
  captures: readonly Readonly<Stage25FinalGeneralisationProviderCaptureV1>[];
}

export async function preflightStage25FinalGeneralisationProvidersV1(input: {
  confirmedCohortSha256: string;
  operatorId: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now?: string;
}) {
  const cohort = STAGE25_FINAL_GENERALISATION_COHORT_V1;
  if (input.confirmedCohortSha256 !== cohort.cohortSha256
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.operatorId)) fail('AUTHORIZATION_INVALID');
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    fail('PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const now = input.now ?? new Date().toISOString();
  assertPricing(now);
  const routes = providerNativeCohortRoutesV2R();
  const fetchImpl = guardedFetch(input.fetchImpl ?? fetch);
  const metadata = await Promise.all(routes.map((entry) => verifyModel(
    entry, entry.route.provider === 'openai'
      ? credentials.openAiKey : credentials.googleKey, fetchImpl,
  )));
  const zeroSpend = await runStage25FinalGeneralisationZeroSpendPreflightV1();
  const captures: Stage25FinalGeneralisationProviderCaptureV1[] = [];
  for (const row of cohort.rows) {
    const task = cohort.tasks.find(({ taskId }) => taskId === row.taskId)
      ?? fail(`TASK_MISSING:${row.rowId}`);
    const route = routes.find(({ route: candidate }) =>
      candidate.routeId === row.route.routeId) ?? fail(`ROUTE_MISSING:${row.rowId}`);
    const request = await captureStage25FinalGeneralisationInitialRequestV1({
      route: row.route, task,
    });
    assertRequest(request, row.rowId, row.route.provider, row.route.model);
    const count = row.route.provider === 'openai'
      ? {
          boundedInputTokens: estimateOpenAiGpt56InputTokensV2(
            request as unknown as SerializedProviderRequestV2,
          ),
          tokenCountMethod: OPENAI_INPUT_ESTIMATOR_VERSION_V2,
          countResponseSha256: null,
        }
      : await countGoogle(request.body, row.route.model, credentials.googleKey, fetchImpl);
    if (count.boundedInputTokens > STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1) {
      fail(`INPUT_BUDGET_EXCEEDED:${row.rowId}:${count.boundedInputTokens}`);
    }
    captures.push({
      rowId: row.rowId, taskId: row.taskId, routeId: row.route.routeId,
      provider: row.route.provider, model: row.route.model,
      requestSha256: request.requestHash, ...count,
      initialAttemptCostUpperBoundUsd: upperBoundCost(
        count.boundedInputTokens, STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
        route,
      ),
    });
  }
  if (captures.length !== 24 || new Set(captures.map(({ rowId }) => rowId)).size !== 24) {
    fail('CAPTURE_SET_INVALID');
  }
  const requestCaptureSetSha256 = hashCanonicalJsonV1(captures);
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PROVIDER_PREFLIGHT_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationProviderPreflightReceiptV1' as const,
    authority: 'RESEARCH_PROVIDER_ACCESS_AND_TOKEN_COUNT_NO_INFERENCE' as const,
    operatorId: input.operatorId,
    cohortSha256: cohort.cohortSha256,
    zeroSpendPreflightReceiptSha256: zeroSpend.receiptSha256,
    pricingEvidence: PRICING_EVIDENCE,
    pricingEvidenceSha256: hashCanonicalJsonV1(PRICING_EVIDENCE),
    pricingVerificationMethod: 'SOURCE_BOUND_OFFICIAL_DOCUMENT_SNAPSHOT_2026_08_26' as const,
    modelMetadata: metadata,
    requestCaptureSetSha256,
    checks: captures,
    googleCredentialSource: credentials.googleCredentialSource,
    googleContextEgress: 'OFFICIAL_COUNT_TOKENS_SERIALIZED_RESEARCH_REQUEST_ONLY' as const,
    networkCalls: { modelMetadataGets: 3 as const, googleCountTokensPosts: 8 as const,
      pricingDocumentNetworkCalls: 0 as const, inferenceCalls: 0 as const },
    initialAttemptCostUpperBoundUsd: round(captures.reduce(
      (sum, capture) => sum + capture.initialAttemptCostUpperBoundUsd, 0,
    )),
    absoluteTwoAttemptMaxSpendUsd: absoluteMaxSpend(routes),
    secretsPersisted: false as const,
    projectReads: 0 as const, projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_24_REQUESTS_PROVIDER_ACCESS_AND_TOKEN_BOUNDS_NO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  const persisted = JSON.stringify({ material, captures });
  if ([credentials.openAiKey, credentials.googleKey].some((secret) =>
    persisted.includes(secret))) fail('SECRET_LEAK');
  const receipt = { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  return assertStage25FinalGeneralisationProviderPreflightBundleV1({ receipt, captures });
}

export function assertStage25FinalGeneralisationProviderPreflightBundleV1(input: {
  receipt: Readonly<JsonRecord>;
  captures: readonly Readonly<Stage25FinalGeneralisationProviderCaptureV1>[];
}): Stage25FinalGeneralisationProviderBundleV1 {
  const receipt = input.receipt;
  const hash = text(receipt.receiptSha256);
  const { receiptSha256: _hash, ...material } = receipt;
  const calls = record(receipt.networkCalls);
  const checks = records(receipt.checks);
  const metadata = records(receipt.modelMetadata);
  if (receipt.version !== STAGE25_FINAL_GENERALISATION_PROVIDER_PREFLIGHT_VERSION_V1
    || receipt.authority !== 'RESEARCH_PROVIDER_ACCESS_AND_TOKEN_COUNT_NO_INFERENCE'
    || receipt.cohortSha256 !== STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256
    || receipt.pricingEvidenceSha256 !== hashCanonicalJsonV1(PRICING_EVIDENCE)
    || hashCanonicalJsonV1(receipt.pricingEvidence) !== hashCanonicalJsonV1(PRICING_EVIDENCE)
    || receipt.requestCaptureSetSha256 !== hashCanonicalJsonV1(input.captures)
    || hashCanonicalJsonV1(checks) !== hashCanonicalJsonV1(input.captures)
    || checks.length !== 24 || metadata.length !== 3 || input.captures.length !== 24
    || new Set(input.captures.map(({ rowId }) => rowId)).size !== 24
    || new Set(metadata.map(({ routeId }) => text(routeId))).size !== 3
    || number(calls.modelMetadataGets) !== 3 || number(calls.googleCountTokensPosts) !== 8
    || number(calls.pricingDocumentNetworkCalls) !== 0 || number(calls.inferenceCalls) !== 0
    || receipt.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY'
    || receipt.googleContextEgress !== 'OFFICIAL_COUNT_TOKENS_SERIALIZED_RESEARCH_REQUEST_ONLY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(text(receipt.operatorId))
    || number(receipt.initialAttemptCostUpperBoundUsd) < 0
    || number(receipt.absoluteTwoAttemptMaxSpendUsd)
      !== absoluteMaxSpend(providerNativeCohortRoutesV2R())
    || receipt.dispatchAuthorized !== false || number(receipt.projectReads) !== 0
    || number(receipt.projectMutations) !== 0 || receipt.secretsPersisted !== false
    || !Array.isArray(receipt.stateEffects) || receipt.stateEffects.length !== 0
    || receipt.assessment !== 'PASS_24_REQUESTS_PROVIDER_ACCESS_AND_TOKEN_BOUNDS_NO_INFERENCE'
    || hash !== hashCanonicalJsonV1(material)) fail('BUNDLE_INVALID');
  return deepFreezeV1(structuredClone(input));
}

async function verifyModel(entry: RouteEntry, key: string, fetchImpl: typeof fetch) {
  const route = entry.route;
  const endpoint = route.provider === 'openai'
    ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, { method: 'GET', headers: route.provider === 'openai'
    ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key },
    signal: AbortSignal.timeout(30_000) });
  const body = record(await safeJson(response));
  const identity = route.provider === 'openai' ? text(body.id) : text(body.name);
  const expected = route.provider === 'openai' ? route.model : `models/${route.model}`;
  if (!response.ok || identity !== expected) fail(`MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  return { routeId: route.routeId, requestedModel: route.model,
    returnedModelIdentity: identity, responseStatus: response.status,
    responseSha256: hashCanonicalJsonV1(body) };
}

async function countGoogle(body: JsonRecord, model: string, key: string, fetchImpl: typeof fetch) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`;
  const response = await fetchImpl(endpoint, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: JSON.stringify(body) }] }] }),
    signal: AbortSignal.timeout(30_000) });
  const responseBody = record(await safeJson(response));
  const tokens = number(responseBody.totalTokens);
  if (!response.ok || !Number.isSafeInteger(tokens) || tokens < 1) fail(`GOOGLE_COUNT_FAILED:${response.status}`);
  return { boundedInputTokens: Math.ceil(tokens * 1.15) + 512,
    tokenCountMethod: 'GOOGLE_OFFICIAL_SERIALIZED_INTERACTIONS_REQUEST_MARGIN_115_PLUS_512_V1',
    countResponseSha256: hashCanonicalJsonV1(responseBody) };
}

function guardedFetch(fetchImpl: typeof fetch): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url); const method = init?.method ?? 'GET';
    const allowed = (method === 'GET' && (/\/v1\/models\/gpt-5\.6-(luna|terra)$/.test(target)
      || /\/v1beta\/models\/gemini-3\.7-flash$/.test(target)))
      || (method === 'POST' && /\/v1beta\/models\/gemini-3\.7-flash:countTokens$/.test(target));
    if (!allowed) fail(`NETWORK_ENDPOINT_FORBIDDEN:${method}:${target}`);
    return fetchImpl(url, init);
  }) as typeof fetch;
}

function assertPricing(now: string): void {
  if (!Number.isFinite(Date.parse(now))) fail('NOW_INVALID');
  for (const entry of providerNativeCohortRoutesV2R()) {
    const evidence = PRICING_EVIDENCE.find(({ routeId }) => routeId === entry.route.routeId)
      ?? fail(`PRICING_MISSING:${entry.route.routeId}`);
    if (evidence.model !== entry.route.model
      || hashCanonicalJsonV1(evidence.pricing) !== hashCanonicalJsonV1(entry.pricing)
      || (evidence.validThrough && Date.parse(now) > Date.parse(evidence.validThrough))) {
      fail(`PRICING_DRIFT_OR_EXPIRED:${entry.route.routeId}`);
    }
  }
}
function assertRequest(request: { provider: string; body: JsonRecord; endpoint: string; requestHash: string },
  rowId: string, provider: string, model: string): void {
  if (request.provider !== provider || request.body.model !== model
    || request.requestHash !== hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body })) {
    fail(`REQUEST_DRIFT:${rowId}`);
  }
}
function absoluteMaxSpend(routes: readonly RouteEntry[]): number {
  return round(STAGE25_FINAL_GENERALISATION_COHORT_V1.rows.reduce((sum, row) => {
    const route = routes.find(({ route: value }) => value.routeId === row.route.routeId)
      ?? fail(`ROUTE_MISSING:${row.rowId}`);
    return sum + 2 * upperBoundCost(STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
      STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1, route);
  }, 0));
}
function upperBoundCost(input: number, output: number, route: RouteEntry): number {
  const inputRate = Math.max(route.pricing.inputUsdPerMillion,
    route.pricing.cacheWriteUsdPerMillion);
  return round((input * inputRate + output * route.pricing.outputUsdPerMillion) / 1_000_000);
}
function price(routeId: string, model: string, input: number, cached: number,
  write: number, output: number, source: string, validThrough: string | null) {
  return { routeId, model, verifiedAt: '2026-08-26', validThrough, source,
    pricing: { inputUsdPerMillion: input, cachedInputUsdPerMillion: cached,
      cacheWriteUsdPerMillion: write, outputUsdPerMillion: output } };
}
async function safeJson(response: Response): Promise<unknown> {
  const body = await response.text();
  try { return body ? JSON.parse(body) as unknown : {}; }
  catch { return { nonJson: body.slice(0, 4_000) }; }
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' ? value : NaN; }
function round(value: number): number { return Math.round(value * 1e9) / 1e9; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_PROVIDER_PREFLIGHT_${code}`); }
