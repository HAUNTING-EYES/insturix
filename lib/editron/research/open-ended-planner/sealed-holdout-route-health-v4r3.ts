import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildSealedHoldoutBenchmarkRoutesV2R,
  inspectSealedHoldoutRouteModelMetadataV2R,
  type SealedHoldoutRouteModelMetadataObservationV2R,
} from './sealed-holdout-credential-preflight-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  type SealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';
import {
  assertSealedHoldoutGeneralisationManifestV4R3,
  type SealedHoldoutGeneralisationManifestV4R3,
} from './sealed-holdout-generalisation-cohort-v4r3';
import { resolveProviderNativeCredentialsV2R } from './provider-native-live-transport-v2r';
import type { ProviderNativeRouteV2R } from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_ROUTE_HEALTH_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_ROUTE_HEALTH_V4R3_1' as const;

export interface SealedHoldoutRouteHealthV4R3 {
  routeId: ProviderNativeRouteV2R['routeId'];
  provider: ProviderNativeRouteV2R['provider'];
  requestedModel: ProviderNativeRouteV2R['model'];
  returnedModelIdentity: string | null;
  responseStatus: number | null;
  responseSha256: string | null;
  networkRequestSha256: string;
  transportError: 'NONE' | 'NETWORK_FAILURE';
  availability:
    | 'AVAILABLE_MODEL_IDENTITY_CONFIRMED'
    | 'UNAVAILABLE_RATE_LIMITED'
    | 'UNAVAILABLE_CREDENTIAL_OR_ACCESS'
    | 'UNAVAILABLE_MODEL_OR_IDENTITY'
    | 'UNAVAILABLE_TRANSIENT_PROVIDER'
    | 'UNAVAILABLE_TRANSPORT'
    | 'UNAVAILABLE_PROVIDER_RESPONSE';
  retryDisposition:
    | 'NO_RETRY_REQUIRED'
    | 'RETRY_LATER_WITH_FRESH_HEALTH_CHECK'
    | 'REPAIR_CREDENTIAL_OR_ROUTE_THEN_RECHECK'
    | 'INVESTIGATE_PROVIDER_RESPONSE_THEN_RECHECK';
}

export interface SealedHoldoutRouteHealthReceiptV4R3 {
  version: typeof SEALED_HOLDOUT_ROUTE_HEALTH_VERSION_V4R3;
  authority: 'RESEARCH_V4R3_ROUTE_HEALTH_NO_INFERENCE_NO_PROJECT_AUTHORITY';
  manifestSha256: string;
  baseManifestSha256: string;
  predecessorManifestSha256: string;
  operatorCatalogIdentitySha256: string;
  routeRosterSha256: string;
  routeHealth: readonly Readonly<SealedHoldoutRouteHealthV4R3>[];
  availableRouteIds: readonly string[];
  unavailableRouteIds: readonly string[];
  googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY';
  networkCalls: Readonly<{ modelMetadataGets: 3; inferenceCalls: 0 }>;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  dispatchAuthorized: false;
  assessment:
    | 'PASS_ALL_ROUTES_HEALTHY_NO_DISPATCH'
    | 'UNAVAILABLE_ROUTES_NO_DISPATCH';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function preflightSealedHoldoutRouteHealthV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}>): Promise<Readonly<SealedHoldoutRouteHealthReceiptV4R3>> {
  const baseManifest = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessorManifest = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest,
    baseManifest,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest,
    baseManifest,
    predecessorManifest,
  });
  assertV4R3Bindings({ manifest, baseManifest, predecessorManifest });
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    fail('PAID_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const observations = await Promise.all(routes.map((route) =>
    inspectSealedHoldoutRouteModelMetadataV2R({
      route,
      credential: route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey,
      fetchImpl: input.fetchImpl,
    })));
  const routeHealth = observations.map(classifyRouteHealth);
  const availableRouteIds = routeHealth
    .filter(({ availability }) => availability === 'AVAILABLE_MODEL_IDENTITY_CONFIRMED')
    .map(({ routeId }) => routeId);
  const unavailableRouteIds = routeHealth
    .filter(({ availability }) => availability !== 'AVAILABLE_MODEL_IDENTITY_CONFIRMED')
    .map(({ routeId }) => routeId);
  const material = {
    version: SEALED_HOLDOUT_ROUTE_HEALTH_VERSION_V4R3,
    authority: 'RESEARCH_V4R3_ROUTE_HEALTH_NO_INFERENCE_NO_PROJECT_AUTHORITY' as const,
    manifestSha256: manifest.manifestSha256,
    baseManifestSha256: baseManifest.manifestSha256,
    predecessorManifestSha256: predecessorManifest.manifestSha256,
    operatorCatalogIdentitySha256: hashCanonicalJsonV1(manifest.operatorCatalogIdentity),
    routeRosterSha256: hashCanonicalJsonV1(routes),
    routeHealth,
    availableRouteIds,
    unavailableRouteIds,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: { modelMetadataGets: 3 as const, inferenceCalls: 0 as const },
    secretsPersisted: false as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: unavailableRouteIds.length === 0
      ? 'PASS_ALL_ROUTES_HEALTHY_NO_DISPATCH' as const
      : 'UNAVAILABLE_ROUTES_NO_DISPATCH' as const,
    stateEffects: [] as const,
  };
  const serialized = JSON.stringify(material);
  if ([credentials.openAiKey, credentials.googleKey].some((key) => serialized.includes(key))) {
    fail('SECRET_LEAK');
  }
  return assertSealedHoldoutRouteHealthReceiptV4R3({
    manifest,
    baseManifest,
    predecessorManifest,
    value: { ...material, receiptSha256: hashCanonicalJsonV1(material) },
  });
}

export function assertSealedHoldoutRouteHealthReceiptV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  value: unknown;
}>): Readonly<SealedHoldoutRouteHealthReceiptV4R3> {
  const baseManifest = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessorManifest = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest,
    baseManifest,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest,
    baseManifest,
    predecessorManifest,
  });
  assertV4R3Bindings({ manifest, baseManifest, predecessorManifest });
  if (!isRecord(input.value)) fail('RECEIPT_MISSING');
  const candidate = input.value as unknown as SealedHoldoutRouteHealthReceiptV4R3;
  const { receiptSha256, ...material } = candidate;
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const rawHealth = Array.isArray(candidate.routeHealth) ? candidate.routeHealth : [];
  const health = rawHealth.filter(isRecord)
    .map((entry) => entry as unknown as Readonly<SealedHoldoutRouteHealthV4R3>);
  const availableRouteIds = strings(candidate.availableRouteIds);
  const unavailableRouteIds = strings(candidate.unavailableRouteIds);
  const networkCalls = record(candidate.networkCalls);
  const expectedAvailable = health
    .filter((entry) => entry.availability === 'AVAILABLE_MODEL_IDENTITY_CONFIRMED')
    .map((entry) => entry.routeId);
  const expectedUnavailable = health
    .filter((entry) => entry.availability !== 'AVAILABLE_MODEL_IDENTITY_CONFIRMED')
    .map((entry) => entry.routeId);
  const allAvailable = expectedUnavailable.length === 0;
  if (candidate.version !== SEALED_HOLDOUT_ROUTE_HEALTH_VERSION_V4R3
    || candidate.authority !== 'RESEARCH_V4R3_ROUTE_HEALTH_NO_INFERENCE_NO_PROJECT_AUTHORITY'
    || candidate.manifestSha256 !== manifest.manifestSha256
    || candidate.baseManifestSha256 !== baseManifest.manifestSha256
    || candidate.predecessorManifestSha256 !== predecessorManifest.manifestSha256
    || candidate.operatorCatalogIdentitySha256 !== hashCanonicalJsonV1(manifest.operatorCatalogIdentity)
    || candidate.routeRosterSha256 !== hashCanonicalJsonV1(routes)
    || health.length !== rawHealth.length || health.length !== routes.length
    || !sameArray(health.map((entry) => entry.routeId), routes.map((route) => route.routeId))
    || routes.some((route) => !health.some((entry) => validHealthEntry(entry, route)))
    || !sameArray(availableRouteIds, expectedAvailable)
    || !sameArray(unavailableRouteIds, expectedUnavailable)
    || candidate.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY'
    || networkCalls.modelMetadataGets !== 3
    || networkCalls.inferenceCalls !== 0
    || candidate.secretsPersisted !== false
    || candidate.projectReads !== 0
    || candidate.projectMutations !== 0
    || candidate.dispatchAuthorized !== false
    || candidate.assessment !== (allAvailable
      ? 'PASS_ALL_ROUTES_HEALTHY_NO_DISPATCH'
      : 'UNAVAILABLE_ROUTES_NO_DISPATCH')
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('RECEIPT_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function assertV4R3Bindings(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
}>): void {
  const frozenTask = record(input.manifest.frozenTaskPacketBinding);
  const predecessor = record(input.manifest.predecessorManifestBinding);
  const policy = record(input.manifest.executionPolicy);
  if (text(frozenTask.manifestSha256) !== input.baseManifest.manifestSha256
    || text(predecessor.manifestSha256) !== input.predecessorManifest.manifestSha256
    || text(predecessor.role) !== 'IMMUTABLE_V4R2_PREDECESSOR_NOT_DISPATCH_AUTHORITY'
    || policy.v4r2ManifestAcceptedForV4R3Dispatch !== false
    || policy.v4r3OwnerEvidencePolicyRequired !== true
    || policy.dispatchAuthorized !== false) {
    fail('STALE_OR_FORGED_AUTHORITY');
  }
}

function classifyRouteHealth(
  observation: Readonly<SealedHoldoutRouteModelMetadataObservationV2R>,
): Readonly<SealedHoldoutRouteHealthV4R3> {
  const availability = observation.assessment === 'MODEL_IDENTITY_ACCESS_PASS'
    ? 'AVAILABLE_MODEL_IDENTITY_CONFIRMED' as const
    : unavailableAvailability(observation);
  return deepFreezeV1({
    routeId: observation.routeId,
    provider: observation.provider,
    requestedModel: observation.requestedModel,
    returnedModelIdentity: observation.returnedModelIdentity,
    responseStatus: observation.responseStatus,
    responseSha256: observation.responseSha256,
    networkRequestSha256: observation.networkRequestSha256,
    transportError: observation.transportError,
    availability,
    retryDisposition: retryDisposition(availability),
  });
}

function unavailableAvailability(
  observation: Readonly<Pick<SealedHoldoutRouteHealthV4R3,
    'transportError' | 'responseStatus' | 'returnedModelIdentity'>>,
): Exclude<SealedHoldoutRouteHealthV4R3['availability'], 'AVAILABLE_MODEL_IDENTITY_CONFIRMED'> {
  if (observation.transportError !== 'NONE') return 'UNAVAILABLE_TRANSPORT';
  if (observation.responseStatus === 429) return 'UNAVAILABLE_RATE_LIMITED';
  if (observation.responseStatus === 401 || observation.responseStatus === 403) {
    return 'UNAVAILABLE_CREDENTIAL_OR_ACCESS';
  }
  if (observation.responseStatus === 404
    || observation.returnedModelIdentity !== null) return 'UNAVAILABLE_MODEL_OR_IDENTITY';
  if (observation.responseStatus !== null && observation.responseStatus >= 500) {
    return 'UNAVAILABLE_TRANSIENT_PROVIDER';
  }
  return 'UNAVAILABLE_PROVIDER_RESPONSE';
}

function retryDisposition(
  availability: SealedHoldoutRouteHealthV4R3['availability'],
): SealedHoldoutRouteHealthV4R3['retryDisposition'] {
  if (availability === 'AVAILABLE_MODEL_IDENTITY_CONFIRMED') return 'NO_RETRY_REQUIRED';
  if (availability === 'UNAVAILABLE_RATE_LIMITED'
    || availability === 'UNAVAILABLE_TRANSIENT_PROVIDER'
    || availability === 'UNAVAILABLE_TRANSPORT') {
    return 'RETRY_LATER_WITH_FRESH_HEALTH_CHECK';
  }
  if (availability === 'UNAVAILABLE_CREDENTIAL_OR_ACCESS'
    || availability === 'UNAVAILABLE_MODEL_OR_IDENTITY') {
    return 'REPAIR_CREDENTIAL_OR_ROUTE_THEN_RECHECK';
  }
  return 'INVESTIGATE_PROVIDER_RESPONSE_THEN_RECHECK';
}

function validHealthEntry(
  entry: Readonly<SealedHoldoutRouteHealthV4R3>,
  route: Readonly<Pick<ProviderNativeRouteV2R, 'routeId' | 'provider' | 'model'>>,
): boolean {
  if (entry.routeId !== route.routeId || entry.provider !== route.provider
    || entry.requestedModel !== route.model
    || (entry.transportError !== 'NONE' && entry.transportError !== 'NETWORK_FAILURE')
    || (entry.responseStatus !== null && (!Number.isSafeInteger(entry.responseStatus)
      || entry.responseStatus < 100 || entry.responseStatus > 599))
    || !/^[a-f0-9]{64}$/.test(entry.networkRequestSha256)
    || (entry.responseSha256 !== null && !/^[a-f0-9]{64}$/.test(entry.responseSha256))
    || (entry.transportError === 'NETWORK_FAILURE' && (entry.responseStatus !== null
      || entry.responseSha256 !== null || entry.returnedModelIdentity !== null))
    || (entry.transportError === 'NONE' && (entry.responseStatus === null
      || entry.responseSha256 === null))) {
    return false;
  }
  const expectedAvailability = entry.responseStatus !== null
    && entry.responseStatus >= 200 && entry.responseStatus < 300
    && entry.transportError === 'NONE'
    && entry.returnedModelIdentity === (entry.provider === 'google'
      ? `models/${entry.requestedModel}` : entry.requestedModel)
    ? 'AVAILABLE_MODEL_IDENTITY_CONFIRMED'
    : unavailableAvailability(entry);
  return entry.availability === expectedAvailability
    && entry.retryDisposition === retryDisposition(expectedAvailability);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
function fail(code: string): never { throw new Error(`SEALED_V4R3_ROUTE_HEALTH_${code}`); }
