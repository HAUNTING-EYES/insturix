import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  buildProviderNativeGoogleCountRequestV2R,
  type ProviderNativeGoogleCountRequestV2R,
} from './provider-native-google-token-count-request-v2r';
import {
  createProviderNativeProductInputTokenCountReceiptV2R,
  type ProviderNativeProductInputTokenCounterV2R,
} from './provider-native-product-runtime-guard-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_GOOGLE_TOKEN_COUNTER_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_GOOGLE_TOKEN_COUNTER_V2R_1' as const;

export interface ProviderNativeGoogleCredentialOwnerV2R {
  credentialFor(
    route: Readonly<ProviderNativeRouteV2R>,
  ): string | Promise<string>;
}

export function createProviderNativeGoogleInputTokenCounterV2R(input: Readonly<{
  credentialOwner: Readonly<ProviderNativeGoogleCredentialOwnerV2R>;
  fetchImpl?: typeof fetch;
  timeoutMilliseconds?: number;
}>): Readonly<ProviderNativeProductInputTokenCounterV2R> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMilliseconds = positiveInteger(
    input.timeoutMilliseconds ?? 30_000,
    'GOOGLE_TOKEN_COUNTER_TIMEOUT',
  );
  return Object.freeze({
    count: async (
      value: Parameters<ProviderNativeProductInputTokenCounterV2R['count']>[0],
    ) => {
      const countRequest = buildProviderNativeGoogleCountRequestV2R(value);
      const credential = String(
        await input.credentialOwner.credentialFor(value.route),
      ).trim();
      if (!credential) fail('GOOGLE_TOKEN_COUNTER_CREDENTIAL_MISSING');
      const response = await fetchImpl(countRequest.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': credential,
        },
        body: JSON.stringify(countRequest.body),
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      const responseBody = await parseResponse(response);
      const measured = nonNegativeInteger(
        responseBody.totalTokens,
        'GOOGLE_TOKEN_COUNTER_RESPONSE_COUNT',
      );
      if (!response.ok) fail(`GOOGLE_TOKEN_COUNTER_RESPONSE_INVALID:${response.status}`);
      const upperBound = checkedUpperBound(measured, countRequest);
      return createProviderNativeProductInputTokenCountReceiptV2R({
        ownerId: 'ProviderNativeGoogleInputTokenCounter',
        ownerVersion: PROVIDER_NATIVE_GOOGLE_TOKEN_COUNTER_VERSION_V2R,
        routeSha256: value.routeSha256,
        requestHash: value.request.requestHash,
        inputTokensUpperBound: upperBound,
        method: 'GOOGLE_EQUIVALENT_COUNT_TOKENS_MARGIN_115_STRUCTURAL_V1',
        counterEvidenceSha256: hashEditronCanonicalJsonV1({
          version: PROVIDER_NATIVE_GOOGLE_TOKEN_COUNTER_VERSION_V2R,
          routeSha256: value.routeSha256,
          generationRequestHash: value.request.requestHash,
          countRequestHash: countRequest.requestHash,
          translationSha256: countRequest.translationSha256,
          measuredTokens: measured,
          protocolOverheadTokenAllowance:
            countRequest.protocolOverheadTokenAllowance,
          upperBound,
          responseStatus: response.status,
          responseSha256: hashEditronCanonicalJsonV1(responseBody),
        }),
      });
    },
  });
}

function checkedUpperBound(
  measured: number,
  request: Readonly<ProviderNativeGoogleCountRequestV2R>,
): number {
  const margin = Math.ceil(measured * 15 / 100);
  const result = measured + margin + request.protocolOverheadTokenAllowance;
  if (!Number.isSafeInteger(result)) fail('GOOGLE_TOKEN_COUNTER_BOUND_UNSAFE');
  return result;
}

async function parseResponse(response: Response): Promise<JsonRecord> {
  const raw = await response.text();
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(`GOOGLE_TOKEN_COUNTER_RESPONSE_INVALID:${response.status}`);
    }
    return value as JsonRecord;
  } catch {
    fail(`GOOGLE_TOKEN_COUNTER_RESPONSE_NON_JSON:${response.status}`);
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(`${label}_INVALID`);
  return Number(value);
}
function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}
function fail(code: string): never { throw new Error(code); }
