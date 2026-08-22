import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { buildV2RNextBenchmarkRouteRosterV2 } from './development-cohort-routes-v2';
import {
  estimateOpenAiGpt56InputTokensV2,
  OPENAI_INPUT_ESTIMATOR_VERSION_V2,
} from './openai-input-token-counter-v2';
import { resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { runSealedHoldoutEpisodeV2R } from './sealed-holdout-episode-v2r';
import type { SealedHoldoutPreflightReceiptV2R }
  from './sealed-holdout-preflight-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type InputTokenCountV2R = Readonly<{
  boundedInputTokens: number;
  providerCountedTokens: number | null;
  method: string;
  countResponseSha256: string | null;
}>;

export const SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_V2R_1' as const;
export const SEALED_HOLDOUT_PRESENTATION_ORDER_SEED_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PRESENTATION_ORDER_20260822_V1' as const;
export const SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R = 85_000 as const;
export const SEALED_HOLDOUT_HANDOFF_ARMS_V2R = [
  'DIRECT_ARGUMENTS', 'OPAQUE_RESULT_REFERENCES',
] as const satisfies readonly ProviderNativeArgumentHandoffModeV2R[];

export interface SealedHoldoutBenchmarkEgressAuthorizationV2R {
  operatorId: string;
  manifestSha256: string;
  permittedNetworkActions: readonly ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'];
  inferenceCalls: 0;
}

export interface SealedHoldoutRequestCaptureV2R {
  captureId: string;
  caseId: string;
  routeId: ProviderNativeRouteV2R['routeId'];
  model: ProviderNativeRouteV2R['model'];
  handoffMode: ProviderNativeArgumentHandoffModeV2R;
  operatorOrderSha256: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
}

export interface SealedHoldoutCredentialPreflightReceiptV2R {
  version: typeof SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R;
  authority: 'RESEARCH_CREDENTIAL_PREFLIGHT_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS';
  manifestSha256: string;
  localPreflightReceiptSha256: string;
  cap2CurrentTruthManifestSha256: string;
  routeRosterSha256: string;
  egressAuthorizationSha256: string;
  modelMetadata: readonly Readonly<JsonRecord>[];
  checks: readonly Readonly<JsonRecord>[];
  requestCaptureSetSha256: string;
  googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY';
  networkCalls: Readonly<{
    modelMetadataGets: 3;
    googleCountTokensPosts: 32;
    providerContextEgressCalls: 32;
    inferenceCalls: 0;
  }>;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  runtimePerTurnTokenGuardRequired: true;
  realProofAdapterGate: 'PENDING';
  dispatchAuthorized: false;
  assessment: 'PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING';
  stateEffects: readonly [];
  receiptSha256: string;
}

export function assertSealedHoldoutCredentialPreflightReceiptV2R(
  value: unknown,
): Readonly<SealedHoldoutCredentialPreflightReceiptV2R> {
  if (!isRecord(value)) fail('SEALED_CREDENTIAL_PREFLIGHT_RECEIPT_MISSING');
  const candidate = value as unknown as SealedHoldoutCredentialPreflightReceiptV2R;
  const { receiptSha256, ...material } = candidate;
  const networkCalls = record(candidate.networkCalls);
  const expectedRoutes = buildSealedHoldoutBenchmarkRoutesV2R();
  const expectedModels = expectedRoutes.map(({ model }) => model);
  const returnedModels = records(candidate.modelMetadata)
    .map(({ requestedModel }) => text(requestedModel));
  const checks = records(candidate.checks);
  const requestHashes = checks.map(({ requestSha256 }) => text(requestSha256));
  const modelRowCounts = Object.fromEntries(expectedModels.map((model) => [
    model,
    checks.filter((check) => text(check.model) === model).length,
  ]));
  if (candidate.version !== SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R
    || candidate.authority !== 'RESEARCH_CREDENTIAL_PREFLIGHT_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS'
    || !/^[a-f0-9]{64}$/.test(candidate.manifestSha256)
    || !/^[a-f0-9]{64}$/.test(candidate.localPreflightReceiptSha256)
    || !/^[a-f0-9]{64}$/.test(candidate.cap2CurrentTruthManifestSha256)
    || candidate.routeRosterSha256 !== hashCanonicalJsonV1(expectedRoutes)
    || !/^[a-f0-9]{64}$/.test(candidate.egressAuthorizationSha256)
    || !/^[a-f0-9]{64}$/.test(candidate.requestCaptureSetSha256)
    || !sameArray(returnedModels, expectedModels)
    || checks.length !== 96
    || requestHashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
    || new Set(requestHashes).size !== 96
    || expectedModels.some((model) => modelRowCounts[model] !== 32)
    || candidate.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY'
    || networkCalls.modelMetadataGets !== 3
    || networkCalls.googleCountTokensPosts !== 32
    || networkCalls.providerContextEgressCalls !== 32
    || networkCalls.inferenceCalls !== 0
    || candidate.secretsPersisted !== false
    || candidate.projectReads !== 0 || candidate.projectMutations !== 0
    || candidate.runtimePerTurnTokenGuardRequired !== true
    || candidate.realProofAdapterGate !== 'PENDING'
    || candidate.dispatchAuthorized !== false
    || candidate.assessment !== 'PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_CREDENTIAL_PREFLIGHT_RECEIPT_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

export async function preflightSealedHoldoutCredentialsV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  localPreflight: Readonly<SealedHoldoutPreflightReceiptV2R>;
  authorization: Readonly<SealedHoldoutBenchmarkEgressAuthorizationV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<{
  receipt: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>;
  requestCaptures: readonly Readonly<SealedHoldoutRequestCaptureV2R>[];
}>> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  assertLocalPreflight(manifest, input.localPreflight);
  assertAuthorization(manifest, input.authorization);
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    fail('SEALED_CREDENTIAL_PREFLIGHT_PAID_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const fetchImpl = input.fetchImpl ?? fetch;
  const modelMetadata = await Promise.all(routes.map((route) => verifyModel(
    route,
    route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey,
    fetchImpl,
  )));
  const callableOperatorIds = strings(record(manifest.sharedModelContext).callableOperatorIds);
  if (callableOperatorIds.length !== 33) fail('SEALED_CREDENTIAL_PREFLIGHT_CALLABLE_SET_DRIFT');
  const requestCaptures: SealedHoldoutRequestCaptureV2R[] = [];
  const checks: JsonRecord[] = [];
  for (const taskCase of manifest.cases) {
    const operatorOrder = buildSealedHoldoutPresentationOrderV2R(
      taskCase.caseId,
      callableOperatorIds,
    );
    for (const route of routes) for (const handoffMode of SEALED_HOLDOUT_HANDOFF_ARMS_V2R) {
      const request = await captureInitialRequest({
        manifest, caseId: taskCase.caseId, route, handoffMode, operatorOrder,
      });
      assertPublicRequest(taskCase, route, operatorOrder, request);
      const tokenCount: InputTokenCountV2R = route.provider === 'openai'
        ? {
            boundedInputTokens: estimateOpenAiGpt56InputTokensV2(
              request as unknown as SerializedProviderRequestV2,
            ),
            providerCountedTokens: null,
            method: OPENAI_INPUT_ESTIMATOR_VERSION_V2,
            countResponseSha256: null,
          }
        : await countGoogleRequest(request, route.model, credentials.googleKey, fetchImpl);
      if (tokenCount.boundedInputTokens > SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R) {
        fail(`SEALED_CREDENTIAL_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${taskCase.caseId}:${route.routeId}:${handoffMode}`);
      }
      const captureId = `${taskCase.caseId}:${route.routeId}:${handoffMode}`;
      requestCaptures.push({
        captureId, caseId: taskCase.caseId, routeId: route.routeId,
        model: route.model, handoffMode,
        operatorOrderSha256: hashCanonicalJsonV1(operatorOrder), request,
      });
      checks.push({
        captureId, caseId: taskCase.caseId, routeId: route.routeId,
        model: route.model, handoffMode,
        publicCaseSha256: taskCase.publicCaseSha256,
        operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
        requestSha256: request.requestHash,
        requestBytes: Buffer.byteLength(JSON.stringify(request), 'utf8'),
        ...tokenCount,
        initialInputTokenLimit: SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R,
        requestModalities: ['TEXT', 'FUNCTION_DECLARATIONS'],
        mediaBytesEmbedded: 0,
        modalityAssessment: 'REQUEST_SHAPE_ONLY_PRIOR_SAME_CODEC_TOOL_CALL_EVIDENCE',
      });
    }
  }
  if (checks.length !== 96 || requestCaptures.length !== 96) {
    fail('SEALED_CREDENTIAL_PREFLIGHT_ROW_COUNT_INVALID');
  }
  const requestCaptureSetSha256 = hashCanonicalJsonV1(requestCaptures);
  const material = {
    version: SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_CREDENTIAL_PREFLIGHT_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS' as const,
    manifestSha256: manifest.manifestSha256,
    localPreflightReceiptSha256: input.localPreflight.receiptSha256,
    cap2CurrentTruthManifestSha256: text(record(manifest.cap2CurrentTruthBinding).manifestSha256),
    routeRosterSha256: hashCanonicalJsonV1(routes),
    egressAuthorizationSha256: hashCanonicalJsonV1(input.authorization),
    modelMetadata, checks, requestCaptureSetSha256,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: {
      modelMetadataGets: 3 as const, googleCountTokensPosts: 32 as const,
      providerContextEgressCalls: 32 as const, inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    projectReads: 0 as const, projectMutations: 0 as const,
    runtimePerTurnTokenGuardRequired: true as const,
    realProofAdapterGate: 'PENDING' as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING' as const,
    stateEffects: [] as const,
  };
  const artifacts = JSON.stringify({ material, requestCaptures });
  if ([credentials.openAiKey, credentials.googleKey].some((secret) => artifacts.includes(secret))) {
    fail('SEALED_CREDENTIAL_PREFLIGHT_SECRET_LEAK');
  }
  const receipt = assertSealedHoldoutCredentialPreflightReceiptV2R({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
  return deepFreezeV1({ receipt, requestCaptures });
}

export function buildSealedHoldoutBenchmarkRoutesV2R():
readonly Readonly<ProviderNativeRouteV2R>[] {
  const roster = buildV2RNextBenchmarkRouteRosterV2();
  const routes = roster.map((entry): ProviderNativeRouteV2R => {
    if (entry.routeId === 'OPENAI_LUNA' && entry.claimedModelIdentity === 'gpt-5.6-luna') {
      return { routeId: entry.routeId, provider: 'openai', model: 'gpt-5.6-luna', claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium' };
    }
    if (entry.routeId === 'OPENAI_TERRA' && entry.claimedModelIdentity === 'gpt-5.6-terra') {
      return { routeId: entry.routeId, provider: 'openai', model: 'gpt-5.6-terra', claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium' };
    }
    if (entry.routeId === 'GOOGLE_FLASH' && entry.claimedModelIdentity === 'gemini-3.7-flash') {
      return { routeId: entry.routeId, provider: 'google', model: 'gemini-3.7-flash', claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium' };
    }
    return fail(`SEALED_CREDENTIAL_PREFLIGHT_ROUTE_ROSTER_DRIFT:${entry.routeId}`);
  });
  if (routes.length !== 3) fail('SEALED_CREDENTIAL_PREFLIGHT_ROUTE_COUNT_INVALID');
  return deepFreezeV1(routes);
}

async function captureInitialRequest(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  handoffMode: ProviderNativeArgumentHandoffModeV2R;
  operatorOrder: readonly string[];
}): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  let calls = 0;
  await runSealedHoldoutEpisodeV2R({
    ...input,
    argumentHandoffMode: input.handoffMode,
    operatorPresentationOrder: input.operatorOrder,
    invoke: async (request) => {
      calls += 1;
      if (calls > 1) fail('SEALED_CREDENTIAL_PREFLIGHT_CAPTURE_CALLED_TWICE');
      captured = request;
      return { status: 418, body: { preflight: true } };
    },
    executeIsolated: async () => fail('SEALED_CREDENTIAL_PREFLIGHT_OWNER_EXECUTION_FORBIDDEN'),
  });
  if (!captured || calls !== 1) fail('SEALED_CREDENTIAL_PREFLIGHT_REQUEST_CAPTURE_FAILED');
  return captured;
}

function assertPublicRequest(
  taskCase: SealedHoldoutCohortManifestV2R['cases'][number],
  route: Readonly<ProviderNativeRouteV2R>,
  operatorOrder: readonly string[],
  request: Readonly<SerializedProviderNativeTurnV2R>,
): void {
  assertNoEvaluatorLeakV2(request.body);
  if (request.requestHash !== hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body })
    || request.body.model !== route.model) fail('SEALED_CREDENTIAL_PREFLIGHT_REQUEST_IDENTITY_DRIFT');
  const tools = records(request.body.tools);
  const presented = tools.slice(0, -1).map(({ name }) => text(name));
  if (tools.length !== 34 || !sameArray(presented, operatorOrder)
    || text(tools.at(-1)?.name) !== 'finish_editron_research_episode') {
    fail('SEALED_CREDENTIAL_PREFLIGHT_TOOL_PRESENTATION_DRIFT');
  }
  const serialized = JSON.stringify(request.body);
  const sourceConditionId = text(record(taskCase.ownerOnly).sourceConditionId);
  if (serialized.includes(sourceConditionId)
    || serialized.includes(taskCase.ownerOnlySha256)
    || serialized.includes(taskCase.evaluatorOnlySha256)
    || /data:image\/|"inline_data"|"input_image"|"input_audio"/.test(serialized)) {
    fail(`SEALED_CREDENTIAL_PREFLIGHT_PRIVATE_OR_MEDIA_LEAK:${taskCase.caseId}`);
  }
}

export function buildSealedHoldoutPresentationOrderV2R(
  caseId: string,
  operatorIds: readonly string[],
): string[] {
  const ordered = operatorIds.map((operatorId) => ({
    operatorId,
    key: hashCanonicalJsonV1({
      version: SEALED_HOLDOUT_PRESENTATION_ORDER_SEED_V2R, caseId, operatorId,
    }),
  })).sort((left, right) => compareUtf16(left.key, right.key));
  const result = ordered.map(({ operatorId }) => operatorId);
  if (new Set(result).size !== operatorIds.length) fail('SEALED_CREDENTIAL_PREFLIGHT_ORDER_INVALID');
  return result;
}

async function verifyModel(
  route: Readonly<ProviderNativeRouteV2R>, key: string, fetchImpl: typeof fetch,
): Promise<Readonly<JsonRecord>> {
  const openAi = route.provider === 'openai';
  const endpoint = openAi ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, {
    method: 'GET', headers: openAi
      ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key },
  });
  const body = await safeJson(response);
  const identity = openAi ? text(record(body).id) : text(record(body).name);
  const expected = openAi ? route.model : `models/${route.model}`;
  if (!response.ok || identity !== expected) {
    fail(`SEALED_CREDENTIAL_PREFLIGHT_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  }
  return deepFreezeV1({
    routeId: route.routeId, provider: route.provider, requestedModel: route.model,
    returnedModelIdentity: identity, responseStatus: response.status,
    responseSha256: hashCanonicalJsonV1(body),
    networkRequestSha256: hashCanonicalJsonV1({ method: 'GET', endpoint, provider: route.provider }),
    assessment: 'MODEL_IDENTITY_ACCESS_PASS',
  });
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>, model: string,
  key: string, fetchImpl: typeof fetch,
): Promise<InputTokenCountV2R> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.body) }] }],
      }),
    },
  );
  const body = await safeJson(response);
  const providerCountedTokens = Number(record(body).totalTokens);
  if (!response.ok || !Number.isSafeInteger(providerCountedTokens) || providerCountedTokens < 1) {
    fail(`SEALED_CREDENTIAL_PREFLIGHT_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return deepFreezeV1({
    providerCountedTokens,
    boundedInputTokens: Math.ceil(providerCountedTokens * 1.15) + 512,
    method: 'GOOGLE_COUNT_TOKENS_JSON_ENVELOPE_MARGIN_115_PLUS_512_V1',
    countResponseSha256: hashCanonicalJsonV1(body),
  });
}

function assertLocalPreflight(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  receipt: Readonly<SealedHoldoutPreflightReceiptV2R>,
): void {
  const { receiptSha256, ...material } = receipt;
  if (receipt.manifestSha256 !== manifest.manifestSha256
    || receipt.assessment !== 'PASS_READY_FOR_CREDENTIAL_PREFLIGHT'
    || receipt.dispatchAuthorized !== false
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_CREDENTIAL_PREFLIGHT_LOCAL_RECEIPT_INVALID');
  }
}

function assertAuthorization(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  authorization: Readonly<SealedHoldoutBenchmarkEgressAuthorizationV2R>,
): void {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(authorization.operatorId)
    || authorization.manifestSha256 !== manifest.manifestSha256
    || authorization.inferenceCalls !== 0
    || !sameArray(authorization.permittedNetworkActions, [
      'MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS',
    ])) fail('SEALED_CREDENTIAL_PREFLIGHT_EGRESS_AUTHORIZATION_INVALID');
}

async function safeJson(response: Response): Promise<unknown> {
  const value = await response.text();
  if (!value) return {};
  try { return JSON.parse(value) as unknown; } catch { return { nonJson: value.slice(0, 4_000) }; }
}
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
