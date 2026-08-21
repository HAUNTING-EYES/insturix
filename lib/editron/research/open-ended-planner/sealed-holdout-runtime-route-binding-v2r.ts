import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOpenAiGpt56InputTokensV2,
  OPENAI_INPUT_ESTIMATOR_VERSION_V2,
} from './openai-input-token-counter-v2';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
  type SealedHoldoutInputTokenBoundV2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
  type SealedHoldoutRuntimePricingV2R,
} from './sealed-holdout-runtime-budget-v2r';
import {
  findSealedHoldoutRuntimeRouteFactV2R,
  SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
  type SealedHoldoutCounterActionV2R,
  type SealedHoldoutRuntimeRouteFactV2R,
} from './sealed-holdout-runtime-route-facts-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_V2R_1' as const;

export interface SealedHoldoutRuntimeAccountingApprovalV2R {
  version: typeof SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R;
  pricingSnapshotVersion: typeof SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R;
  operatorId: string;
  approvedAt: string;
  manifestSha256: string;
  caseId: string;
  publicCaseSha256: string;
  routeSha256: string;
  counterAction: SealedHoldoutCounterActionV2R;
  providerContextEgress: 'DENY' | 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY';
  maxInputTokensPerTurn: number;
  absoluteMaxSpendMicroUsd: number;
  inferenceCallsAuthorized: 0;
}

export interface SealedHoldoutRuntimeRouteBindingReceiptV2R {
  version: typeof SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R;
  authority: 'RESEARCH_ACCOUNTING_BINDING_NO_INFERENCE_NO_PROJECT_MUTATION';
  manifestSha256: string;
  caseId: string;
  publicCaseSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  pricingSnapshotVersion: typeof SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R;
  pricing: Readonly<SealedHoldoutRuntimePricingV2R>;
  pricingSource: string;
  pricingVerifiedAt: string;
  pricingValidThrough: string | null;
  approvalSha256: string;
  counterAction: SealedHoldoutCounterActionV2R;
  providerContextEgress: 'DENY' | 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY';
  inferenceCallsAuthorized: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
  assessment: 'PASS_ACCOUNTING_BINDING_NO_INFERENCE';
  receiptSha256: string;
}

export function buildSealedHoldoutRuntimeAccountingBindingV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  approval: Readonly<SealedHoldoutRuntimeAccountingApprovalV2R>;
  googleApiKey?: string;
  fetchImpl?: typeof fetch;
  now?: string;
}): Readonly<{
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
  countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
  receipt: Readonly<SealedHoldoutRuntimeRouteBindingReceiptV2R>;
}> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) fail(`SEALED_ROUTE_BINDING_CASE_MISSING:${input.caseId}`);
  const routeFactValue = findSealedHoldoutRuntimeRouteFactV2R(input.route.routeId);
  if (!routeFactValue
    || routeFactValue.provider !== input.route.provider
    || routeFactValue.model !== input.route.model
    || routeFactValue.claimedModelIdentity !== input.route.claimedModelIdentity) {
    fail('SEALED_ROUTE_BINDING_ROUTE_UNSUPPORTED_OR_DRIFTED');
  }
  const routeSha256 = hashCanonicalJsonV1(input.route);
  assertApproval(input.approval, {
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    publicCaseSha256: taskCase.publicCaseSha256,
    routeSha256,
    routeFact: routeFactValue,
  });
  assertPriceValidity(routeFactValue, input.now ?? new Date().toISOString());
  const googleApiKey = input.googleApiKey?.trim() ?? '';
  if (routeFactValue.provider === 'google' && !googleApiKey) {
    fail('SEALED_ROUTE_BINDING_GOOGLE_COUNTER_KEY_MISSING');
  }
  const authorization = deepFreezeV1({
    version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    publicCaseSha256: taskCase.publicCaseSha256,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    routeSha256,
    approvedBy: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    maxInputTokensPerTurn: input.approval.maxInputTokensPerTurn,
    absoluteMaxSpendMicroUsd: input.approval.absoluteMaxSpendMicroUsd,
    pricing: routeFactValue.pricing,
  } satisfies SealedHoldoutRuntimeAuthorizationV2R);
  const receiptMaterial = {
    version: SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
    authority: 'RESEARCH_ACCOUNTING_BINDING_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    publicCaseSha256: taskCase.publicCaseSha256,
    route: structuredClone(input.route),
    routeSha256,
    pricingSnapshotVersion: SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
    pricing: routeFactValue.pricing,
    pricingSource: routeFactValue.pricingSource,
    pricingVerifiedAt: routeFactValue.verifiedAt,
    pricingValidThrough: routeFactValue.validThrough,
    approvalSha256: hashCanonicalJsonV1(input.approval),
    counterAction: routeFactValue.counterAction,
    providerContextEgress: input.approval.providerContextEgress,
    inferenceCallsAuthorized: 0 as const,
    secretsPersisted: false as const,
    stateEffects: [] as const,
    assessment: 'PASS_ACCOUNTING_BINDING_NO_INFERENCE' as const,
  };
  const receipt = deepFreezeV1({
    ...receiptMaterial,
    receiptSha256: hashCanonicalJsonV1(receiptMaterial),
  });
  if (googleApiKey && JSON.stringify(receipt).includes(googleApiKey)) {
    fail('SEALED_ROUTE_BINDING_SECRET_LEAK');
  }
  const countInputTokens = async (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ): Promise<Readonly<SealedHoldoutInputTokenBoundV2R>> => {
    assertRequestBinding(request, input.route);
    if (input.route.provider === 'openai') {
      const inputTokensUpperBound = estimateOpenAiGpt56InputTokensV2(
        request as unknown as SerializedProviderRequestV2,
      );
      return bindSealedHoldoutInputTokenBoundV2R({
        request,
        inputTokensUpperBound,
        method: OPENAI_INPUT_ESTIMATOR_VERSION_V2,
      });
    }
    const counted = await countGoogleRequest(
      request,
      googleApiKey,
      input.fetchImpl ?? fetch,
    );
    return bindSealedHoldoutInputTokenBoundV2R({
      request,
      inputTokensUpperBound: Math.ceil(counted.totalTokens * 1.15) + 512,
      method: `GOOGLE_COUNT_TOKENS_MARGIN_115_PLUS_512_V1:${counted.responseSha256}`,
    });
  };
  return deepFreezeV1({ authorization, countInputTokens, receipt });
}

function assertApproval(
  approval: Readonly<SealedHoldoutRuntimeAccountingApprovalV2R>,
  expected: Readonly<{
    manifestSha256: string;
    caseId: string;
    publicCaseSha256: string;
    routeSha256: string;
    routeFact: Readonly<SealedHoldoutRuntimeRouteFactV2R>;
  }>,
): void {
  const expectedEgress = expected.routeFact.provider === 'google'
    ? 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY' : 'DENY';
  if (approval.version !== SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R
    || approval.pricingSnapshotVersion !== SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R
    || !/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || !Number.isFinite(Date.parse(approval.approvedAt))
    || approval.manifestSha256 !== expected.manifestSha256
    || approval.caseId !== expected.caseId
    || approval.publicCaseSha256 !== expected.publicCaseSha256
    || approval.routeSha256 !== expected.routeSha256
    || approval.counterAction !== expected.routeFact.counterAction
    || approval.providerContextEgress !== expectedEgress
    || approval.inferenceCallsAuthorized !== 0
    || !Number.isSafeInteger(approval.maxInputTokensPerTurn)
    || approval.maxInputTokensPerTurn < 1
    || !Number.isSafeInteger(approval.absoluteMaxSpendMicroUsd)
    || approval.absoluteMaxSpendMicroUsd < 1) {
    fail('SEALED_ROUTE_BINDING_APPROVAL_INVALID');
  }
}

function assertPriceValidity(
  fact: Readonly<SealedHoldoutRuntimeRouteFactV2R>,
  now: string,
): void {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) fail('SEALED_ROUTE_BINDING_NOW_INVALID');
  if (fact.validThrough && nowMs > Date.parse(fact.validThrough)) {
    fail(`SEALED_ROUTE_BINDING_PRICE_SNAPSHOT_EXPIRED:${fact.routeId}`);
  }
}

function assertRequestBinding(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  route: Readonly<ProviderNativeRouteV2R>,
): void {
  if (request.provider !== route.provider
    || request.body.model !== route.model
    || request.requestHash !== hashCanonicalJsonV1({
      endpoint: request.endpoint,
      body: request.body,
    })) {
    fail('SEALED_ROUTE_BINDING_REQUEST_DRIFT');
  }
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  googleApiKey: string,
  fetchImpl: typeof fetch,
): Promise<Readonly<{ totalTokens: number; responseSha256: string }>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${String(request.body.model)}:countTokens`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': googleApiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.body) }] }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body: JsonRecord;
  try { body = raw ? record(JSON.parse(raw) as unknown) : {}; }
  catch { body = { nonJson: raw.slice(0, 4_000) }; }
  const totalTokens = Number(body.totalTokens);
  if (!response.ok || !Number.isSafeInteger(totalTokens) || totalTokens < 1) {
    fail(`SEALED_ROUTE_BINDING_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return deepFreezeV1({ totalTokens, responseSha256: hashCanonicalJsonV1(body) });
}

function fail(code: string): never { throw new Error(code); }
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
