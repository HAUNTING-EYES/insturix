import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  createProviderNativeProductInputTokenCountReceiptV2R,
  type ProviderNativeProductInputTokenCounterV2R,
} from './provider-native-product-runtime-guard-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_V2R_1' as const;
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_INPUT_TOKENS_ENDPOINT =
  'https://api.openai.com/v1/responses/input_tokens';
const EXPECTED_BODY_KEYS = Object.freeze([
  'input',
  'max_output_tokens',
  'model',
  'parallel_tool_calls',
  'reasoning',
  'store',
  'tool_choice',
  'tools',
]);

export interface ProviderNativeOpenAiCredentialOwnerV2R {
  credentialFor(
    route: Readonly<ProviderNativeRouteV2R>,
  ): string | Promise<string>;
}

export function createProviderNativeOpenAiInputTokenCounterV2R(
  input: Readonly<{
    credentialOwner: Readonly<ProviderNativeOpenAiCredentialOwnerV2R>;
    fetchImpl?: typeof fetch;
    timeoutMilliseconds?: number;
  }>,
): Readonly<ProviderNativeProductInputTokenCounterV2R> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMilliseconds = positiveInteger(
    input.timeoutMilliseconds ?? 30_000,
    'OPENAI_TOKEN_COUNTER_TIMEOUT',
  );
  return Object.freeze({
    count: async (
      value: Parameters<ProviderNativeProductInputTokenCounterV2R['count']>[0],
    ) => {
      assertRouteAndRequest(value.route, value.routeSha256, value.request);
      const countBody = toCountRequestBody(value.request.body, value.route);
      const credential = String(
        await input.credentialOwner.credentialFor(value.route),
      ).trim();
      if (!credential) fail('OPENAI_TOKEN_COUNTER_CREDENTIAL_MISSING');
      const countRequestHash = hashCanonicalJsonV1({
        endpoint: OPENAI_INPUT_TOKENS_ENDPOINT,
        body: countBody,
      });
      const response = await fetchImpl(OPENAI_INPUT_TOKENS_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(countBody),
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      const body = await parseResponse(response);
      const inputTokens = nonNegativeInteger(
        body.input_tokens,
        'OPENAI_TOKEN_COUNTER_RESPONSE_COUNT',
      );
      if (!response.ok || body.object !== 'response.input_tokens') {
        fail(`OPENAI_TOKEN_COUNTER_RESPONSE_INVALID:${response.status}`);
      }
      const evidence = {
        version: PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_VERSION_V2R,
        endpoint: OPENAI_INPUT_TOKENS_ENDPOINT,
        routeSha256: value.routeSha256,
        generationRequestHash: value.request.requestHash,
        countRequestHash,
        responseStatus: response.status,
        response: { object: body.object, input_tokens: inputTokens },
      };
      return createProviderNativeProductInputTokenCountReceiptV2R({
        ownerId: 'ProviderNativeOpenAiInputTokenCounter',
        ownerVersion: PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_VERSION_V2R,
        routeSha256: value.routeSha256,
        requestHash: value.request.requestHash,
        inputTokensUpperBound: inputTokens,
        method: 'OPENAI_RESPONSES_INPUT_TOKENS_EXACT_V1',
        counterEvidenceSha256: hashEditronCanonicalJsonV1(evidence),
      });
    },
  });
}

function assertRouteAndRequest(
  route: Readonly<ProviderNativeRouteV2R>,
  routeSha256: string,
  request: Readonly<SerializedProviderNativeTurnV2R>,
): void {
  const expectedModel = route.routeId === 'OPENAI_LUNA'
    ? 'gpt-5.6-luna'
    : route.routeId === 'OPENAI_TERRA'
      ? 'gpt-5.6-terra'
      : null;
  if (!expectedModel
    || route.provider !== 'openai'
    || route.model !== expectedModel
    || route.claimedModelIdentity !== expectedModel
    || routeSha256 !== hashCanonicalJsonV1(route)
    || request.provider !== 'openai'
    || request.endpoint !== OPENAI_RESPONSES_ENDPOINT
    || request.authMode !== 'BEARER'
    || request.requestHash !== hashCanonicalJsonV1({
      endpoint: request.endpoint,
      body: request.body,
    })) {
    fail('OPENAI_TOKEN_COUNTER_ROUTE_OR_REQUEST_INVALID');
  }
}

function toCountRequestBody(
  value: unknown,
  route: Readonly<ProviderNativeRouteV2R>,
): Readonly<JsonRecord> {
  const body = record(value, 'OPENAI_TOKEN_COUNTER_BODY');
  const reasoning = body.reasoning && typeof body.reasoning === 'object'
    && !Array.isArray(body.reasoning)
    ? body.reasoning as JsonRecord
    : null;
  if (Object.keys(body).sort().join('\n') !== EXPECTED_BODY_KEYS.join('\n')
    || body.store !== false
    || body.tool_choice !== 'auto'
    || body.parallel_tool_calls !== false
    || !Array.isArray(body.input)
    || body.input.length === 0
    || !Array.isArray(body.tools)
    || !body.tools.length
    || body.model !== route.model
    || !Number.isSafeInteger(body.max_output_tokens)
    || Number(body.max_output_tokens) < 64
    || !reasoning
    || reasoning.effort !== route.reasoningMode) {
    fail('OPENAI_TOKEN_COUNTER_REQUEST_SHAPE_UNSUPPORTED');
  }
  return Object.freeze({
    model: body.model,
    input: body.input,
    tools: body.tools,
    tool_choice: body.tool_choice,
    parallel_tool_calls: body.parallel_tool_calls,
    reasoning: body.reasoning,
  });
}

async function parseResponse(response: Response): Promise<JsonRecord> {
  const raw = await response.text();
  try {
    return record(JSON.parse(raw) as unknown, 'OPENAI_TOKEN_COUNTER_RESPONSE');
  } catch {
    fail(`OPENAI_TOKEN_COUNTER_RESPONSE_NON_JSON:${response.status}`);
  }
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as JsonRecord;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(`${label}_INVALID`);
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}

function fail(code: string): never {
  throw new Error(code);
}
