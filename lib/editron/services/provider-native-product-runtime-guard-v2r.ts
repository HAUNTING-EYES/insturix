import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  bindProviderNativeRuntimeInputTokenBoundV2R,
  ProviderNativeRuntimeBudgetControllerV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
  type ProviderNativeProductBudgetAuthorizationV2R,
} from './provider-native-product-budget-v2r';
import type { ProviderNativeProductRuntimeGuardFactoryV2R }
  from './provider-native-product-budget-owner-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_COUNT_RECEIPT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_COUNT_RECEIPT_V2R_1' as const;
const PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_BOUND_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_BOUND_V2R_1' as const;

export interface ProviderNativeProductInputTokenCountReceiptV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_COUNT_RECEIPT_VERSION_V2R;
  authority: 'PRODUCT_INPUT_TOKEN_COUNT_NO_INFERENCE_NO_PROJECT_MUTATION';
  ownerId: string;
  ownerVersion: string;
  routeSha256: string;
  requestHash: string;
  inputTokensUpperBound: number;
  method: string;
  counterEvidenceSha256: string;
  receiptSha256: string;
}

export interface ProviderNativeProductInputTokenCounterV2R {
  count(input: Readonly<{
    route: Readonly<ProviderNativeRouteV2R>;
    routeSha256: string;
    request: Readonly<SerializedProviderNativeTurnV2R>;
  }>): Promise<Readonly<ProviderNativeProductInputTokenCountReceiptV2R>>;
}

export function createProviderNativeProductInputTokenCountReceiptV2R(
  input: Readonly<{
    ownerId: string;
    ownerVersion: string;
    routeSha256: string;
    requestHash: string;
    inputTokensUpperBound: number;
    method: string;
    counterEvidenceSha256: string;
  }>,
): Readonly<ProviderNativeProductInputTokenCountReceiptV2R> {
  const material = {
    version: PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_COUNT_RECEIPT_VERSION_V2R,
    authority: 'PRODUCT_INPUT_TOKEN_COUNT_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    ownerId: identity(input.ownerId, 'TOKEN_COUNTER_OWNER'),
    ownerVersion: identity(input.ownerVersion, 'TOKEN_COUNTER_OWNER_VERSION'),
    routeSha256: sha256(input.routeSha256, 'TOKEN_COUNTER_ROUTE'),
    requestHash: sha256(input.requestHash, 'TOKEN_COUNTER_REQUEST'),
    inputTokensUpperBound: nonNegativeInteger(
      input.inputTokensUpperBound,
      'TOKEN_COUNTER_BOUND',
    ),
    method: identity(input.method, 'TOKEN_COUNTER_METHOD'),
    counterEvidenceSha256: sha256(
      input.counterEvidenceSha256,
      'TOKEN_COUNTER_EVIDENCE',
    ),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProviderNativeProductInputTokenCountReceiptV2R(
  value: unknown,
): Readonly<ProviderNativeProductInputTokenCountReceiptV2R> {
  const candidate = record(value, 'TOKEN_COUNTER_RECEIPT');
  const rebound = createProviderNativeProductInputTokenCountReceiptV2R({
    ownerId: text(candidate.ownerId, 'TOKEN_COUNTER_OWNER'),
    ownerVersion: text(candidate.ownerVersion, 'TOKEN_COUNTER_OWNER_VERSION'),
    routeSha256: text(candidate.routeSha256, 'TOKEN_COUNTER_ROUTE'),
    requestHash: text(candidate.requestHash, 'TOKEN_COUNTER_REQUEST'),
    inputTokensUpperBound: nonNegativeInteger(
      candidate.inputTokensUpperBound,
      'TOKEN_COUNTER_BOUND',
    ),
    method: text(candidate.method, 'TOKEN_COUNTER_METHOD'),
    counterEvidenceSha256: text(
      candidate.counterEvidenceSha256,
      'TOKEN_COUNTER_EVIDENCE',
    ),
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('PRODUCT_TOKEN_COUNTER_RECEIPT_INVALID');
  }
  return rebound;
}

/**
 * Converts one CreditsService-owned reservation into the existing runtime
 * guard. The injected counter owns measurement; this factory only binds its
 * receipt to the accepted route and exact serialized provider request.
 */
export function createProviderNativeProductRuntimeGuardFactoryV2R(
  input: Readonly<{
    tokenCounter: Readonly<ProviderNativeProductInputTokenCounterV2R>;
  }>,
): Readonly<ProviderNativeProductRuntimeGuardFactoryV2R> {
  return {
    create: async (value) => {
      const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
        value.authorization,
      );
      const reservation = assertProviderNativeProductBudgetReservationV2R(
        value.reservation,
        authorization,
      );
      const runtimeGuard = new ProviderNativeRuntimeBudgetControllerV2R({
        guardKind: PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
        guardIdentitySha256: reservation.guardIdentitySha256,
        authorizationSha256: authorization.authorizationSha256,
        inputTokenBoundVersion:
          PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_BOUND_VERSION_V2R,
        limits: {
          maxProviderTurns: authorization.limits.maxProviderTurns,
          maxSelectedOperations: authorization.limits.maxSelectedOperations,
          maxCandidatesPerOperation:
            authorization.limits.maxCandidatesPerOperation,
          maxCumulativeOutputTokens:
            authorization.limits.maxCumulativeOutputTokens,
          maxInputTokensPerTurn: authorization.limits.maxInputTokensPerTurn,
          absoluteMaxSpendNanoUsd:
            authorization.limits.absoluteMaxProviderSpendNanoUsd,
        },
        pricing: authorization.providerPricing.tokenPricing,
        countInputTokens: async (request) => {
          assertRequestBinding(request, authorization);
          const counted = assertProviderNativeProductInputTokenCountReceiptV2R(
            await input.tokenCounter.count({
              route: authorization.route,
              routeSha256: authorization.routeSha256,
              request,
            }),
          );
          if (counted.routeSha256 !== authorization.routeSha256
            || counted.requestHash !== request.requestHash) {
            fail('PRODUCT_TOKEN_COUNTER_RECEIPT_BINDING_MISMATCH');
          }
          return bindProviderNativeRuntimeInputTokenBoundV2R({
            version: PROVIDER_NATIVE_PRODUCT_INPUT_TOKEN_BOUND_VERSION_V2R,
            request,
            inputTokensUpperBound: counted.inputTokensUpperBound,
            method: `${counted.method}:${counted.receiptSha256}`,
          });
        },
      });
      return Object.freeze({
        guardKind: PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
        guardIdentitySha256: reservation.guardIdentitySha256,
        authorizationSha256: authorization.authorizationSha256,
        reservationSha256: reservation.reservationSha256,
        runtimeGuard,
      });
    },
  };
}

function assertRequestBinding(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
): void {
  const route = authorization.route;
  const expectedEndpoint = route.provider === 'openai'
    ? 'https://api.openai.com/v1/responses'
    : 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const expectedAuthMode = route.provider === 'openai'
    ? 'BEARER' : 'X_GOOG_API_KEY';
  if (request.provider !== route.provider
    || request.endpoint !== expectedEndpoint
    || request.authMode !== expectedAuthMode
    || request.body.model !== route.model
    || request.requestHash !== hashCanonicalJsonV1({
      endpoint: request.endpoint,
      body: request.body,
    })) {
    fail('PRODUCT_TOKEN_COUNTER_REQUEST_BINDING_INVALID');
  }
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`PRODUCT_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`PRODUCT_${label}_INVALID`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(result)) {
    fail(`PRODUCT_${label}_INVALID`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`PRODUCT_${label}_HASH_INVALID`);
  return result;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`PRODUCT_${label}_INVALID`);
  }
  return Number(value);
}

function fail(code: string): never {
  throw new Error(code);
}
