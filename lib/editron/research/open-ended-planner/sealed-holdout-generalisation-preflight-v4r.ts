import { Buffer } from 'node:buffer';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOpenAiGpt56InputTokensV2,
  OPENAI_INPUT_ESTIMATOR_VERSION_V2,
} from './openai-input-token-counter-v2';
import { resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import type { ProviderNativeRouteV2R, SerializedProviderNativeTurnV2R }
  from './provider-native-tool-codecs-v2r';
import { assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import {
  buildSealedHoldoutBenchmarkRoutesV2R,
  SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R,
} from './sealed-holdout-credential-preflight-v2r';
import { runBudgetedSealedHoldoutEpisodeV3R2 }
  from './sealed-holdout-episode-v3r';
import { assertSealedHoldoutGeneralisationManifestV4R,
  type SealedHoldoutGeneralisationManifestV4R }
  from './sealed-holdout-generalisation-cohort-v4r';
import { bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R }
  from './sealed-holdout-runtime-budget-v2r';
import { findSealedHoldoutRuntimeRouteFactV2R }
  from './sealed-holdout-runtime-route-facts-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type TokenCount = Readonly<{ boundedInputTokens: number;
  providerCountedTokens: number | null; method: string;
  countResponseSha256: string | null }>;

export const SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R =
  'EDITRON_OE_STAGE25_GENERALISATION_CREDENTIAL_PREFLIGHT_V4R_1' as const;

export interface SealedHoldoutGeneralisationEgressAuthorizationV4R {
  operatorId: string; generalisationManifestSha256: string;
  permittedNetworkActions: readonly ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'];
  inferenceCalls: 0;
}

export interface SealedHoldoutGeneralisationRequestCaptureV4R {
  captureId: string; rowId: string; rowPlanSha256: string; caseId: string;
  routeId: ProviderNativeRouteV2R['routeId']; model: ProviderNativeRouteV2R['model'];
  handoffMode: ProviderNativeArgumentHandoffModeV2R;
  operatorOrderSha256: string; request: Readonly<SerializedProviderNativeTurnV2R>;
}

export interface SealedHoldoutGeneralisationPreflightReceiptV4R {
  version: typeof SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R;
  authority: 'RESEARCH_V4R_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS';
  generalisationManifestSha256: string; baseManifestSha256: string;
  cap2CurrentTruthManifestSha256: string; rowSetSha256: string; routeSetSha256: string;
  egressAuthorizationSha256: string; modelMetadata: readonly Readonly<JsonRecord>[];
  checks: readonly Readonly<JsonRecord>[]; requestCaptureSetSha256: string;
  googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY';
  networkCalls: Readonly<{ modelMetadataGets: 3; googleCountTokensPosts: 15;
    providerContextEgressCalls: 15; inferenceCalls: 0 }>;
  secretsPersisted: false; projectReads: 0; projectMutations: 0;
  runtimePerTurnTokenGuardRequired: true; realProofAdapterGate: 'PASS_CURRENT_PROOFS';
  dispatchAuthorized: false; assessment: 'PASS_V4R_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE';
  stateEffects: readonly []; receiptSha256: string;
}

export async function preflightSealedHoldoutGeneralisationV4R(input: {
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  authorization: Readonly<SealedHoldoutGeneralisationEgressAuthorizationV4R>;
  environment: Readonly<Record<string, string | undefined>>; fetchImpl?: typeof fetch;
}): Promise<Readonly<{ receipt: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  requestCaptures: readonly Readonly<SealedHoldoutGeneralisationRequestCaptureV4R>[] }>> {
  const general = assertSealedHoldoutGeneralisationManifestV4R(input.generalisationManifest);
  const base = assertBase(general, input.baseManifest);
  assertAuthorization(general, input.authorization);
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    fail('SEALED_V4R_PREFLIGHT_PAID_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const fetchImpl = input.fetchImpl ?? fetch;
  const modelMetadata = await Promise.all(routes.map((route) => verifyModel(route,
    route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey, fetchImpl)));
  const captures: SealedHoldoutGeneralisationRequestCaptureV4R[] = [];
  const checks: JsonRecord[] = [];
  for (const row of general.rows) {
    const route = requireRoute(routes, row); const caseId = text(row.caseId);
    const taskCase = base.cases.find((entry) => entry.caseId === caseId)
      ?? fail(`SEALED_V4R_PREFLIGHT_CASE_MISSING:${caseId}`);
    const operatorOrder = strings(row.operatorOrder);
    const handoffMode = requireHandoff(row.handoffMode);
    const request = await captureInitialRequest({ base, caseId, route, handoffMode,
      operatorOrder });
    assertPublicRequest(taskCase, row, route, request);
    const tokenCount = route.provider === 'openai'
      ? openAiTokenCount(request)
      : await countGoogleRequest(request, route.model, credentials.googleKey, fetchImpl);
    if (tokenCount.boundedInputTokens > SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R) {
      fail(`SEALED_V4R_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${text(row.rowId)}`);
    }
    const captureId = text(row.rowId);
    captures.push({ captureId, rowId: text(row.rowId), rowPlanSha256: text(row.rowPlanSha256),
      caseId, routeId: route.routeId, model: route.model, handoffMode,
      operatorOrderSha256: text(row.operatorOrderSha256), request });
    checks.push({ captureId, rowId: row.rowId, rowPlanSha256: row.rowPlanSha256,
      caseId, routeId: route.routeId, model: route.model, handoffMode,
      publicCaseSha256: taskCase.publicCaseSha256,
      operatorOrderSha256: row.operatorOrderSha256, requestSha256: request.requestHash,
      requestBytes: Buffer.byteLength(JSON.stringify(request), 'utf8'), ...tokenCount,
      initialInputTokenLimit: SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R,
      requestModalities: ['TEXT', 'FUNCTION_DECLARATIONS'], mediaBytesEmbedded: 0 });
  }
  if (checks.length !== 45 || captures.length !== 45
    || new Set(checks.map(({ requestSha256 }) => requestSha256)).size !== 45) {
    fail('SEALED_V4R_PREFLIGHT_CAPTURE_SET_INVALID');
  }
  const material = {
    version: SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R,
    authority: 'RESEARCH_V4R_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS' as const,
    generalisationManifestSha256: general.manifestSha256, baseManifestSha256: base.manifestSha256,
    cap2CurrentTruthManifestSha256: text(record(general.cap2CurrentTruthBinding).manifestSha256),
    rowSetSha256: general.rowSetSha256, routeSetSha256: general.routeSetSha256,
    egressAuthorizationSha256: hashCanonicalJsonV1(input.authorization), modelMetadata, checks,
    requestCaptureSetSha256: hashCanonicalJsonV1(captures),
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: { modelMetadataGets: 3 as const, googleCountTokensPosts: 15 as const,
      providerContextEgressCalls: 15 as const, inferenceCalls: 0 as const },
    secretsPersisted: false as const, projectReads: 0 as const, projectMutations: 0 as const,
    runtimePerTurnTokenGuardRequired: true as const,
    realProofAdapterGate: 'PASS_CURRENT_PROOFS' as const, dispatchAuthorized: false as const,
    assessment: 'PASS_V4R_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  const serialized = JSON.stringify({ material, captures });
  if ([credentials.openAiKey, credentials.googleKey].some((key) => serialized.includes(key))) {
    fail('SEALED_V4R_PREFLIGHT_SECRET_LEAK');
  }
  const receipt = assertSealedHoldoutGeneralisationPreflightReceiptV4R({
    manifest: general, value: { ...material, receiptSha256: hashCanonicalJsonV1(material) },
  });
  return deepFreezeV1({ receipt, requestCaptures: captures });
}

export function assertSealedHoldoutGeneralisationPreflightReceiptV4R(input: {
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>; value: unknown;
}): Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R> {
  const manifest = assertSealedHoldoutGeneralisationManifestV4R(input.manifest);
  if (!isRecord(input.value)) fail('SEALED_V4R_PREFLIGHT_RECEIPT_MISSING');
  const candidate = input.value as unknown as SealedHoldoutGeneralisationPreflightReceiptV4R;
  const { receiptSha256, ...material } = candidate; const network = record(candidate.networkCalls);
  const checks = records(candidate.checks); const rows = manifest.rows;
  if (candidate.version !== SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R
    || candidate.authority !== 'RESEARCH_V4R_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS'
    || candidate.generalisationManifestSha256 !== manifest.manifestSha256
    || candidate.baseManifestSha256 !== text(record(manifest.baseCohortIdentity).manifestSha256)
    || candidate.cap2CurrentTruthManifestSha256
      !== text(record(manifest.cap2CurrentTruthBinding).manifestSha256)
    || candidate.rowSetSha256 !== manifest.rowSetSha256
    || candidate.routeSetSha256 !== manifest.routeSetSha256 || checks.length !== 45
    || rows.some((row) => !checks.some((check) => check.rowPlanSha256 === row.rowPlanSha256
      && check.requestSha256 && check.caseId === row.caseId))
    || network.modelMetadataGets !== 3 || network.googleCountTokensPosts !== 15
    || network.providerContextEgressCalls !== 15 || network.inferenceCalls !== 0
    || candidate.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY'
    || candidate.secretsPersisted !== false || candidate.projectReads !== 0
    || candidate.projectMutations !== 0 || candidate.runtimePerTurnTokenGuardRequired !== true
    || candidate.realProofAdapterGate !== 'PASS_CURRENT_PROOFS'
    || candidate.dispatchAuthorized !== false
    || candidate.assessment !== 'PASS_V4R_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE'
    || candidate.stateEffects.length || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_V4R_PREFLIGHT_RECEIPT_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

async function captureInitialRequest(input: { base: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string; route: Readonly<ProviderNativeRouteV2R>;
  handoffMode: ProviderNativeArgumentHandoffModeV2R; operatorOrder: readonly string[] }) {
  const taskCase = input.base.cases.find(({ caseId }) => caseId === input.caseId)!;
  const fact = findSealedHoldoutRuntimeRouteFactV2R(input.route.routeId)
    ?? fail(`SEALED_V4R_PREFLIGHT_ROUTE_FACT_MISSING:${input.route.routeId}`);
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined; let calls = 0;
  await runBudgetedSealedHoldoutEpisodeV3R2({ manifest: input.base, caseId: input.caseId,
    route: input.route, argumentHandoffMode: input.handoffMode,
    operatorPresentationOrder: input.operatorOrder,
    authorization: { version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256: input.base.manifestSha256, caseId: input.caseId,
      publicCaseSha256: taskCase.publicCaseSha256, routeId: input.route.routeId,
      claimedModelIdentity: input.route.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(input.route), approvedBy: 'v4r-preflight',
      approvedAt: '2026-08-22T00:00:00.000Z', maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 6_000_000, pricing: fact.pricing },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({ request,
      inputTokensUpperBound: 0, method: 'V4R_CAPTURE_ONLY_ZERO_INFERENCE_V1' }),
    invoke: async (request) => { if (++calls > 1) fail('SEALED_V4R_PREFLIGHT_CAPTURE_CALLED_TWICE');
      captured = request; return { status: 418, body: { preflight: true } }; },
  });
  if (!captured || calls !== 1) fail('SEALED_V4R_PREFLIGHT_REQUEST_CAPTURE_FAILED');
  return captured;
}

function assertBase(general: Readonly<SealedHoldoutGeneralisationManifestV4R>,
  value: Readonly<SealedHoldoutCohortManifestV3R2>) {
  const base = assertSealedHoldoutCohortManifestV3R2(value);
  if (text(record(general.baseCohortIdentity).manifestSha256) !== base.manifestSha256) {
    fail('SEALED_V4R_PREFLIGHT_BASE_BINDING_INVALID');
  }
  return base;
}
function assertAuthorization(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>,
  value: Readonly<SealedHoldoutGeneralisationEgressAuthorizationV4R>) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value.operatorId)
    || value.generalisationManifestSha256 !== manifest.manifestSha256 || value.inferenceCalls !== 0
    || hashCanonicalJsonV1(value.permittedNetworkActions)
      !== hashCanonicalJsonV1(['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'])) {
    fail('SEALED_V4R_PREFLIGHT_EGRESS_AUTHORIZATION_INVALID');
  }
}
function assertPublicRequest(taskCase: SealedHoldoutCohortManifestV3R2['cases'][number],
  row: Readonly<JsonRecord>, route: Readonly<ProviderNativeRouteV2R>,
  request: Readonly<SerializedProviderNativeTurnV2R>) {
  assertNoEvaluatorLeakV2(request.body); const tools = records(request.body.tools);
  if (request.requestHash !== hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body })
    || request.body.model !== route.model || tools.length !== 34
    || hashCanonicalJsonV1(tools.slice(0, -1).map(({ name }) => name))
      !== hashCanonicalJsonV1(row.operatorOrder)
    || text(tools.at(-1)?.name) !== 'finish_editron_research_episode') {
    fail('SEALED_V4R_PREFLIGHT_REQUEST_IDENTITY_DRIFT');
  }
  const serialized = JSON.stringify(request.body);
  if (serialized.includes(taskCase.ownerOnlySha256)
    || serialized.includes(taskCase.evaluatorOnlySha256)
    || /data:image\/|"inline_data"|"input_image"|"input_audio"/.test(serialized)) {
    fail(`SEALED_V4R_PREFLIGHT_PRIVATE_OR_MEDIA_LEAK:${taskCase.caseId}`);
  }
}
async function verifyModel(route: Readonly<ProviderNativeRouteV2R>, key: string,
  fetchImpl: typeof fetch) {
  const openAi = route.provider === 'openai'; const endpoint = openAi
    ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, { method: 'GET', headers: openAi
    ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key } });
  const body = await safeJson(response); const identity = openAi ? text(record(body).id)
    : text(record(body).name); const expected = openAi ? route.model : `models/${route.model}`;
  if (!response.ok || identity !== expected) {
    fail(`SEALED_V4R_PREFLIGHT_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  }
  return deepFreezeV1({ routeId: route.routeId, requestedModel: route.model,
    returnedModelIdentity: identity, responseStatus: response.status,
    responseSha256: hashCanonicalJsonV1(body) });
}
async function countGoogleRequest(request: Readonly<SerializedProviderNativeTurnV2R>,
  model: string, key: string, fetchImpl: typeof fetch): Promise<TokenCount> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text:
        JSON.stringify(request.body) }] }] }),
    });
  const body = await safeJson(response); const counted = Number(record(body).totalTokens);
  if (!response.ok || !Number.isSafeInteger(counted) || counted < 1) {
    fail(`SEALED_V4R_PREFLIGHT_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return deepFreezeV1({ providerCountedTokens: counted,
    boundedInputTokens: Math.ceil(counted * 1.15) + 512,
    method: 'GOOGLE_COUNT_TOKENS_JSON_ENVELOPE_MARGIN_115_PLUS_512_V1',
    countResponseSha256: hashCanonicalJsonV1(body) });
}
function openAiTokenCount(request: Readonly<SerializedProviderNativeTurnV2R>): TokenCount {
  return { boundedInputTokens: estimateOpenAiGpt56InputTokensV2(
    request as unknown as SerializedProviderRequestV2), providerCountedTokens: null,
  method: OPENAI_INPUT_ESTIMATOR_VERSION_V2, countResponseSha256: null };
}
function requireRoute(routes: readonly Readonly<ProviderNativeRouteV2R>[], row: Readonly<JsonRecord>) {
  const route = routes.find(({ routeId }) => routeId === text(record(row.route).routeId));
  if (!route || hashCanonicalJsonV1(route) !== row.routeSha256) {
    fail(`SEALED_V4R_PREFLIGHT_ROUTE_DRIFT:${text(row.rowId)}`);
  }
  return route;
}
function requireHandoff(value: unknown): ProviderNativeArgumentHandoffModeV2R {
  if (value !== 'DIRECT_ARGUMENTS' && value !== 'OPAQUE_RESULT_REFERENCES') {
    fail('SEALED_V4R_PREFLIGHT_HANDOFF_INVALID');
  }
  return value;
}
async function safeJson(response: Response): Promise<unknown> {
  const value = await response.text(); if (!value) return {};
  try { return JSON.parse(value) as unknown; } catch { return { nonJson: value.slice(0, 4_000) }; }
}
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value)
  && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value)
  ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
