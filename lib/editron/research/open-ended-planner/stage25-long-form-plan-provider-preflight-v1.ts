import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { estimateOpenAiGpt56InputTokensV2, OPENAI_INPUT_ESTIMATOR_VERSION_V2 }
  from './openai-input-token-counter-v2';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import {
  resolveProviderNativeCredentialsV2R,
} from './provider-native-live-transport-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  assertStage25LongFormProviderCohortManifestV1,
  type Stage25LongFormProviderCohortManifestV1,
} from './stage25-long-form-plan-provider-cohort-v1';
import {
  captureStage25LongFormProviderInitialRequestV1,
} from './stage25-long-form-plan-provider-protocol-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_ZERO_INFERENCE_PREFLIGHT_V1_1' as const;

export interface Stage25LongFormProviderRequestCaptureV1 {
  rowId: string;
  routeId: ProviderNativeRouteV2R['routeId'];
  model: ProviderNativeRouteV2R['model'];
  presentationOrdinal: number;
  request: Readonly<SerializedProviderNativeTurnV2R>;
  boundedInputTokens: number;
  tokenCountMethod: string;
  countResponseSha256: string | null;
  initialAttemptCostUpperBoundUsd: number;
}

export async function preflightStage25LongFormProvidersV1(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV1>;
  confirmedManifestSha256: string;
  operatorId: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  durableMode?: boolean;
}): Promise<Readonly<{
  receipt: Readonly<JsonRecord>;
  requestCaptures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
}>> {
  const manifest = assertStage25LongFormProviderCohortManifestV1(input.manifest);
  if (input.confirmedManifestSha256 !== manifest.manifestSha256
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.operatorId)) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_OPERATOR_AUTHORIZATION_INVALID');
  }
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const modelMetadata = await Promise.all(manifest.routeRoster.map((entry) =>
    verifyModel(entry.route, entry.route.provider === 'openai'
      ? credentials.openAiKey : credentials.googleKey, fetchImpl)));
  const captures: Stage25LongFormProviderRequestCaptureV1[] = [];
  let googleCountTokensPosts = 0;
  for (const row of manifest.rows) {
    const routeEntry = manifest.routeRoster.find(({ route }) => (
      route.routeId === row.routeId
    ));
    const presentation = manifest.presentations.find(({ ordinal }) => (
      ordinal === row.presentationOrdinal
    ));
    if (!routeEntry || !presentation || routeEntry.route.model !== row.model) {
      throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_ROW_BINDING_INVALID:${row.rowId}`);
    }
    const request = await captureStage25LongFormProviderInitialRequestV1({
      route: routeEntry.route,
      presentationOrdinal: row.presentationOrdinal,
      ...(input.durableMode ? { durableMode: true } : {}),
    });
    assertPublicRequest(request, routeEntry.route, manifest);
    const tokenCount = routeEntry.route.provider === 'openai'
      ? {
          boundedInputTokens: estimateOpenAiGpt56InputTokensV2(
            request as unknown as SerializedProviderRequestV2,
          ),
          tokenCountMethod: OPENAI_INPUT_ESTIMATOR_VERSION_V2,
          countResponseSha256: null,
        }
      : await countGoogleRequest(
          request, routeEntry.route.model, credentials.googleKey, fetchImpl,
        );
    if (routeEntry.route.provider === 'google') googleCountTokensPosts += 1;
    if (tokenCount.boundedInputTokens > manifest.maxInputTokensPerRow) {
      throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${row.rowId}`);
    }
    const initialAttemptCostUpperBoundUsd = upperBoundCost(
      tokenCount.boundedInputTokens,
      manifest.maxOutputTokensPerRow,
      routeEntry.pricing,
    );
    if (initialAttemptCostUpperBoundUsd > row.absoluteMaxRowSpendUsd) {
      throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_COST_BUDGET_EXCEEDED:${row.rowId}`);
    }
    captures.push({
      rowId: row.rowId,
      routeId: routeEntry.route.routeId,
      model: routeEntry.route.model,
      presentationOrdinal: row.presentationOrdinal,
      request,
      ...tokenCount,
      initialAttemptCostUpperBoundUsd,
    });
  }
  if (captures.length !== manifest.rowCount
    || new Set(captures.map(({ rowId }) => rowId)).size !== manifest.rowCount) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_CAPTURE_SET_INVALID');
  }
  const checks = captures.map((capture) => ({
    rowId: capture.rowId,
    routeId: capture.routeId,
    model: capture.model,
    presentationOrdinal: capture.presentationOrdinal,
    requestSha256: capture.request.requestHash,
    requestBytes: Buffer.byteLength(JSON.stringify(capture.request.body), 'utf8'),
    boundedInputTokens: capture.boundedInputTokens,
    tokenCountMethod: capture.tokenCountMethod,
    countResponseSha256: capture.countResponseSha256,
    initialAttemptCostUpperBoundUsd: capture.initialAttemptCostUpperBoundUsd,
  }));
  const requestCaptureSetSha256 = hashCanonicalJsonV1(captures);
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V1,
    authority: 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS' as const,
    operatorId: input.operatorId,
    manifestSha256: manifest.manifestSha256,
    routeRosterSha256: manifest.routeRosterSha256,
    modelMetadata,
    checks,
    requestCaptureSetSha256,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: {
      modelMetadataGets: 3 as const,
      googleCountTokensPosts,
      inferenceCalls: 0 as const,
    },
    initialAttemptCostUpperBoundUsd: roundUsd(captures.reduce(
      (sum, capture) => sum + capture.initialAttemptCostUpperBoundUsd, 0,
    )),
    absoluteMaxSpendUsd: manifest.absoluteMaxSpendUsd,
    secretsPersisted: false as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_9_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  const persisted = JSON.stringify({ material, captures });
  if ([credentials.openAiKey, credentials.googleKey].some((secret) => (
    persisted.includes(secret)
  ))) throw new Error('STAGE25_LONG_FORM_PREFLIGHT_SECRET_LEAK');
  return deepFreezeV1({
    receipt: { ...material, receiptSha256: hashCanonicalJsonV1(material) },
    requestCaptures: captures,
  });
}

function assertPublicRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  route: Readonly<ProviderNativeRouteV2R>,
  manifest: Readonly<Stage25LongFormProviderCohortManifestV1>,
): void {
  const serialized = JSON.stringify(request.body);
  if (request.body.model !== route.model
    || request.requestHash !== hashCanonicalJsonV1({
      endpoint: request.endpoint, body: request.body,
    })
    || !serialized.includes(manifest.canonicalContextSha256)
    || !serialized.includes('finish_editron_research_episode')
    || serialized.includes('PASS_STRUCTURAL_ONLY')
    || serialized.includes('RENDERED_AUDIOVISUAL_QUALITY')
    || serialized.includes('expectedPolicy')) {
    throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_PUBLIC_REQUEST_INVALID:${route.routeId}`);
  }
}

async function verifyModel(
  route: Readonly<ProviderNativeRouteV2R>, key: string, fetchImpl: typeof fetch,
): Promise<Readonly<JsonRecord>> {
  const openAi = route.provider === 'openai';
  const endpoint = openAi
    ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: openAi
      ? { authorization: `Bearer ${key}` }
      : { 'x-goog-api-key': key },
  });
  const body = record(await safeJson(response));
  const identity = openAi ? text(body.id) : text(body.name);
  const expected = openAi ? route.model : `models/${route.model}`;
  if (!response.ok || identity !== expected) {
    throw new Error(
      `STAGE25_LONG_FORM_PREFLIGHT_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`,
    );
  }
  return deepFreezeV1({
    routeId: route.routeId,
    requestedModel: route.model,
    returnedModelIdentity: identity,
    responseStatus: response.status,
    responseSha256: hashCanonicalJsonV1(body),
    networkRequestSha256: hashCanonicalJsonV1({ method: 'GET', endpoint }),
  });
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>, model: string,
  key: string, fetchImpl: typeof fetch,
): Promise<Readonly<{
  boundedInputTokens: number;
  tokenCountMethod: string;
  countResponseSha256: string;
}>> {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: JSON.stringify(request.body) }],
      }],
    }),
  });
  const body = record(await safeJson(response));
  const providerCountedTokens = Number(body.totalTokens);
  if (!response.ok || !Number.isSafeInteger(providerCountedTokens)
    || providerCountedTokens < 1) {
    throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return {
    boundedInputTokens: Math.ceil(providerCountedTokens * 1.15) + 512,
    tokenCountMethod: 'GOOGLE_COUNT_TOKENS_INTERACTIONS_JSON_MARGIN_115_PLUS_512_V1',
    countResponseSha256: hashCanonicalJsonV1(body),
  };
}

function upperBoundCost(
  inputTokens: number,
  outputTokens: number,
  pricing: Readonly<{
    inputUsdPerMillion: number;
    cacheWriteUsdPerMillion: number;
    outputUsdPerMillion: number;
  }>,
): number {
  const inputRate = Math.max(
    pricing.inputUsdPerMillion, pricing.cacheWriteUsdPerMillion,
  );
  return roundUsd((
    inputTokens * inputRate + outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000);
}

async function safeJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as unknown; }
  catch { return { nonJson: body.slice(0, 4_000) }; }
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function roundUsd(value: number): number {
  return Math.ceil(value * 1_000_000_000) / 1_000_000_000;
}
