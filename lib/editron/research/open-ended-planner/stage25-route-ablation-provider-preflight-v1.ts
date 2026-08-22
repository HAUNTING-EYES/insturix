import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { estimateOpenAiGpt56InputTokensV2, OPENAI_INPUT_ESTIMATOR_VERSION_V2 }
  from './openai-input-token-counter-v2';
import {
  serializeGoogleCountTokensRequestV2,
  serializeProviderRequestV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { resolveProviderNativeCredentialsV2R } from './provider-native-live-transport-v2r';
import {
  assertStage25RouteAblationProviderManifestV1,
  stage25RouteAblationProviderRouteV1,
  type Stage25RouteAblationProviderManifestV1,
  type Stage25RouteAblationProviderRouteV1,
} from './stage25-route-ablation-provider-manifest-v1';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';
import { buildStage25RouteAblationProviderManifestV1 as buildBaseManifest }
  from './stage25-route-ablation-v1';

type PublicRequest = Omit<SerializedProviderRequestV2, 'headers'>;
type JsonRecord = Record<string, unknown>;

export const STAGE25_ROUTE_ABLATION_PREFLIGHT_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_PREFLIGHT_V1_1' as const;

export interface Stage25RouteAblationRequestCaptureV1 {
  captureId: string;
  rowId: string;
  routeId: Stage25RouteAblationProviderRouteV1['routeId'];
  packetHash: string;
  request: Readonly<PublicRequest>;
  boundedInputTokens: number;
  tokenCountMethod: string;
  countResponseSha256: string | null;
  initialAttemptCostUpperBoundUsd: number;
}

export interface Stage25RouteAblationPreflightReceiptV1 {
  version: typeof STAGE25_ROUTE_ABLATION_PREFLIGHT_VERSION_V1;
  authority: 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS';
  operatorId: string;
  providerManifestSha256: string;
  routeRosterSha256: string;
  modelMetadata: readonly Readonly<JsonRecord>[];
  checks: readonly Readonly<JsonRecord>[];
  requestCaptureSetSha256: string;
  googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY';
  networkCalls: Readonly<{
    modelMetadataGets: 3;
    googleCountTokensPosts: 8;
    inferenceCalls: 0;
  }>;
  initialAttemptCostUpperBoundUsd: number;
  absoluteTwoAttemptMaxSpendUsd: number;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  dispatchAuthorized: false;
  assessment: 'PASS_24_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function preflightStage25RouteAblationProvidersV1(input: {
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>;
  confirmedManifestSha256: string;
  operatorId: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<{
  receipt: Readonly<Stage25RouteAblationPreflightReceiptV1>;
  requestCaptures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
}>> {
  const manifest = assertStage25RouteAblationProviderManifestV1(input.manifest);
  if (input.confirmedManifestSha256 !== manifest.manifestSha256
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.operatorId)) {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_OPERATOR_AUTHORIZATION_INVALID');
  }
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const modelMetadata = await Promise.all(manifest.routeRoster.map((route) => verifyModel(
    route, route.kind === 'openai' ? credentials.openAiKey : credentials.googleKey, fetchImpl,
  )));
  const baseRows = buildBaseManifest().rows;
  const requestCaptures: Stage25RouteAblationRequestCaptureV1[] = [];
  const checks: JsonRecord[] = [];
  for (const row of manifest.rows) {
    const route = manifest.routeRoster.find((entry) => entry.routeId === row.routeId);
    const baseRow = baseRows.find((entry) => entry.scopeId === row.scopeId && entry.arm === row.arm);
    if (!route || !baseRow || baseRow.artifact.packetHash !== row.packetHash) {
      throw new Error(`STAGE25_ROUTE_PREFLIGHT_ROW_BINDING_INVALID:${row.rowId}`);
    }
    const providerRoute = stage25RouteAblationProviderRouteV1(
      route, route.kind === 'openai' ? credentials.openAiKey : credentials.googleKey,
    );
    const request = await serializeProviderRequestV2({
      route: providerRoute, artifact: baseRow.artifact, attempt: 1,
      outputBudget: {
        visible: baseRow.artifact.packet.stageBudget.maxVisibleOutputTokens,
        reasoning: baseRow.artifact.packet.stageBudget.maxReasoningTokens,
      },
    });
    assertPublicRequest(request, route, baseRow.artifact.packet.stageBudget.maxInputTokens);
    const tokenCount = route.kind === 'openai'
      ? {
          boundedInputTokens: estimateOpenAiGpt56InputTokensV2(request),
          tokenCountMethod: OPENAI_INPUT_ESTIMATOR_VERSION_V2,
          countResponseSha256: null,
        }
      : await countGoogleRequest(providerRoute, request, fetchImpl);
    if (tokenCount.boundedInputTokens > baseRow.artifact.packet.stageBudget.maxInputTokens) {
      throw new Error(`STAGE25_ROUTE_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${row.rowId}`);
    }
    const initialAttemptCostUpperBoundUsd = upperBoundCost(
      tokenCount.boundedInputTokens,
      baseRow.artifact.packet.stageBudget.maxVisibleOutputTokens
        + baseRow.artifact.packet.stageBudget.maxReasoningTokens,
      route,
    );
    if (initialAttemptCostUpperBoundUsd > baseRow.artifact.packet.stageBudget.maxProviderCostUsd) {
      throw new Error(`STAGE25_ROUTE_PREFLIGHT_COST_BUDGET_EXCEEDED:${row.rowId}`);
    }
    const { headers: _headers, ...publicRequest } = request;
    const capture = {
      captureId: row.rowId, rowId: row.rowId, routeId: row.routeId,
      packetHash: row.packetHash, request: publicRequest,
      ...tokenCount, initialAttemptCostUpperBoundUsd,
    } satisfies Stage25RouteAblationRequestCaptureV1;
    requestCaptures.push(capture);
    checks.push({
      rowId: row.rowId, routeId: row.routeId, packetHash: row.packetHash,
      requestSha256: request.requestHash,
      requestBytes: Buffer.byteLength(JSON.stringify(request.body), 'utf8'),
      boundedInputTokens: tokenCount.boundedInputTokens,
      tokenCountMethod: tokenCount.tokenCountMethod,
      countResponseSha256: tokenCount.countResponseSha256,
      initialAttemptCostUpperBoundUsd,
    });
  }
  if (requestCaptures.length !== 24 || new Set(requestCaptures.map(({ captureId }) => captureId)).size !== 24) {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_CAPTURE_SET_INVALID');
  }
  const requestCaptureSetSha256 = hashCanonicalJsonV1(requestCaptures);
  const material = {
    version: STAGE25_ROUTE_ABLATION_PREFLIGHT_VERSION_V1,
    authority: 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS' as const,
    operatorId: input.operatorId,
    providerManifestSha256: manifest.manifestSha256,
    routeRosterSha256: manifest.routeRosterSha256,
    modelMetadata, checks, requestCaptureSetSha256,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: { modelMetadataGets: 3 as const, googleCountTokensPosts: 8 as const, inferenceCalls: 0 as const },
    initialAttemptCostUpperBoundUsd: roundUsd(requestCaptures.reduce(
      (sum, capture) => sum + capture.initialAttemptCostUpperBoundUsd, 0,
    )),
    absoluteTwoAttemptMaxSpendUsd: manifest.absoluteMaxSpendUsd,
    secretsPersisted: false as const,
    projectReads: 0 as const, projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_24_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  const persisted = JSON.stringify({ material, requestCaptures });
  if ([credentials.openAiKey, credentials.googleKey].some((secret) => persisted.includes(secret))) {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_SECRET_LEAK');
  }
  const receipt = assertStage25RouteAblationPreflightReceiptV1({
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  }, manifest);
  return deepFreezeV1({ receipt, requestCaptures });
}

export function assertStage25RouteAblationPreflightReceiptV1(
  value: unknown,
  manifestValue: unknown,
): Readonly<Stage25RouteAblationPreflightReceiptV1> {
  const manifest = assertStage25RouteAblationProviderManifestV1(manifestValue);
  const candidate = record(value) as unknown as Stage25RouteAblationPreflightReceiptV1;
  const { receiptSha256, ...material } = candidate;
  const checks = records(candidate.checks);
  const metadata = records(candidate.modelMetadata);
  if (candidate.version !== STAGE25_ROUTE_ABLATION_PREFLIGHT_VERSION_V1
    || candidate.authority !== 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS'
    || candidate.providerManifestSha256 !== manifest.manifestSha256
    || candidate.routeRosterSha256 !== manifest.routeRosterSha256
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || metadata.length !== 3 || checks.length !== 24
    || new Set(checks.map((check) => text(check.rowId))).size !== 24
    || candidate.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY'
    || candidate.networkCalls?.modelMetadataGets !== 3
    || candidate.networkCalls?.googleCountTokensPosts !== 8
    || candidate.networkCalls?.inferenceCalls !== 0
    || candidate.absoluteTwoAttemptMaxSpendUsd !== manifest.absoluteMaxSpendUsd
    || candidate.secretsPersisted !== false || candidate.projectReads !== 0
    || candidate.projectMutations !== 0 || candidate.dispatchAuthorized !== false
    || candidate.assessment !== 'PASS_24_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_RECEIPT_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function assertPublicRequest(
  request: Readonly<SerializedProviderRequestV2>,
  route: Readonly<Stage25RouteAblationProviderRouteV1>,
  inputLimit: number,
): void {
  assertNoEvaluatorLeakV2(request.body);
  const serialized = JSON.stringify(request.body);
  const modelBound = route.kind === 'openai'
    ? request.body.model === route.model
    : request.endpoint === `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent`;
  if (!modelBound
    || request.requestHash !== hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body })
    || !Number.isSafeInteger(inputLimit) || inputLimit < 1
    || /freeChoiceGold|HIDDEN_EVALUATOR|ROUTE_ABLATION_EVALUATOR/.test(serialized)) {
    throw new Error(`STAGE25_ROUTE_PREFLIGHT_PUBLIC_REQUEST_INVALID:${route.routeId}`);
  }
}

async function verifyModel(
  route: Readonly<Stage25RouteAblationProviderRouteV1>, key: string, fetchImpl: typeof fetch,
): Promise<Readonly<JsonRecord>> {
  const endpoint = route.kind === 'openai'
    ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, {
    method: 'GET', headers: route.kind === 'openai'
      ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key },
  });
  const body = record(await safeJson(response));
  const identity = route.kind === 'openai' ? text(body.id) : text(body.name);
  const expected = route.kind === 'openai' ? route.model : `models/${route.model}`;
  if (!response.ok || identity !== expected) {
    throw new Error(`STAGE25_ROUTE_PREFLIGHT_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  }
  return deepFreezeV1({
    routeId: route.routeId, requestedModel: route.model, returnedModelIdentity: identity,
    responseStatus: response.status, responseSha256: hashCanonicalJsonV1(body),
    networkRequestSha256: hashCanonicalJsonV1({ method: 'GET', endpoint, provider: route.kind }),
  });
}

async function countGoogleRequest(
  route: ReturnType<typeof stage25RouteAblationProviderRouteV1>,
  request: Readonly<SerializedProviderRequestV2>,
  fetchImpl: typeof fetch,
): Promise<{ boundedInputTokens: number; tokenCountMethod: string; countResponseSha256: string }> {
  const count = serializeGoogleCountTokensRequestV2({ route, generationRequest: request });
  const response = await fetchImpl(count.endpoint, {
    method: 'POST', headers: count.headers, body: JSON.stringify(count.body),
  });
  const body = record(await safeJson(response));
  const providerCountedTokens = Number(body.totalTokens);
  if (!response.ok || !Number.isSafeInteger(providerCountedTokens) || providerCountedTokens < 1) {
    throw new Error(`STAGE25_ROUTE_PREFLIGHT_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return {
    boundedInputTokens: Math.ceil(providerCountedTokens * 1.15) + 512,
    tokenCountMethod: 'GOOGLE_COUNT_TOKENS_GENERATION_REQUEST_MARGIN_115_PLUS_512_V1',
    countResponseSha256: hashCanonicalJsonV1(body),
  };
}

function upperBoundCost(inputTokens: number, outputTokens: number,
  route: Readonly<Stage25RouteAblationProviderRouteV1>): number {
  const inputRate = Math.max(route.pricing.inputUsdPerMillion,
    route.pricing.cacheWriteUsdPerMillion ?? route.pricing.inputUsdPerMillion);
  return roundUsd((inputTokens * inputRate + outputTokens * route.pricing.outputUsdPerMillion) / 1_000_000);
}
async function safeJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as unknown; } catch { return { nonJson: body.slice(0, 4_000) }; }
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function roundUsd(value: number): number { return Math.round(value * 1e9) / 1e9; }
