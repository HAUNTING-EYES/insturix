import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  createProviderNativeOpenAiInputTokenCounterV2R,
  PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_VERSION_V2R,
} from '@/lib/editron/services/provider-native-openai-token-counter-v2r';

const SECRET = 'openai-secret-for-test';

describe('provider-native OpenAI token counter V2R', () => {
  it('counts the exact Responses input and emits a request-bound receipt', async () => {
    const fetchImpl = vi.fn(async (
      _url: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => new Response(JSON.stringify({
      object: 'response.input_tokens', input_tokens: 12_345,
    }), { status: 200 }));
    const counter = createProviderNativeOpenAiInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) },
      fetchImpl,
    });
    const route = openAiRoute();
    const request = openAiRequest();
    const receipt = await counter.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request,
    });

    expect(receipt).toMatchObject({
      ownerVersion: PROVIDER_NATIVE_OPENAI_TOKEN_COUNTER_VERSION_V2R,
      routeSha256: hashCanonicalJsonV1(route),
      requestHash: request.requestHash,
      inputTokensUpperBound: 12_345,
      method: 'OPENAI_RESPONSES_INPUT_TOKENS_EXACT_V1',
    });
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses/input_tokens');
    expect(init?.headers).toEqual({
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-5.6-terra',
      input: request.body.input,
      tools: request.body.tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      reasoning: { effort: 'medium' },
    });
  });

  it('rejects route, model and request-shape drift before egress', async () => {
    const fetchImpl = vi.fn();
    const credentialFor = vi.fn(() => SECRET);
    const counter = createProviderNativeOpenAiInputTokenCounterV2R({
      credentialOwner: { credentialFor },
      fetchImpl,
    });
    const route = openAiRoute();
    const wrongRoute = { ...route, routeId: 'GOOGLE_FLASH' as const };
    await expect(counter.count({
      route: wrongRoute,
      routeSha256: hashCanonicalJsonV1(wrongRoute),
      request: openAiRequest(),
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_ROUTE_OR_REQUEST_INVALID');

    const request = openAiRequest({ hidden_prompt: 'not-counted' });
    await expect(counter.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request,
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_REQUEST_SHAPE_UNSUPPORTED');
    const wrongModel = openAiRequest({ model: 'gpt-5.6-luna' });
    await expect(counter.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request: wrongModel,
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_REQUEST_SHAPE_UNSUPPORTED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(credentialFor).not.toHaveBeenCalled();
  });

  it('fails closed on missing credentials or unverifiable provider output', async () => {
    const route = openAiRoute();
    const request = openAiRequest();
    const missing = createProviderNativeOpenAiInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => ' ') },
      fetchImpl: vi.fn(),
    });
    await expect(missing.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request,
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_CREDENTIAL_MISSING');

    const malformed = createProviderNativeOpenAiInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        object: 'response.input_tokens', input_tokens: 2.5,
      }), { status: 200 })),
    });
    await expect(malformed.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request,
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_RESPONSE_COUNT_INVALID');
  });

  it('does not accept an HTTP error that happens to contain a token count', async () => {
    const counter = createProviderNativeOpenAiInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        object: 'response.input_tokens', input_tokens: 12,
      }), { status: 429 })),
    });
    const route = openAiRoute();
    await expect(counter.count({
      route,
      routeSha256: hashCanonicalJsonV1(route),
      request: openAiRequest(),
    })).rejects.toThrow('OPENAI_TOKEN_COUNTER_RESPONSE_INVALID:429');
  });
});

function openAiRoute(): Readonly<ProviderNativeRouteV2R> {
  return Object.freeze({
    routeId: 'OPENAI_TERRA',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra',
    reasoningMode: 'medium',
  });
}

function openAiRequest(
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<SerializedProviderNativeTurnV2R> {
  const endpoint = 'https://api.openai.com/v1/responses';
  const body = {
    model: 'gpt-5.6-terra',
    store: false,
    input: [{ role: 'user', content: [{
      type: 'input_text', text: 'Plan the next bounded edit.',
    }] }],
    tools: [{
      type: 'function', name: 'read_project', description: 'Read project.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    }],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    reasoning: { effort: 'medium' },
    max_output_tokens: 512,
    ...extra,
  };
  return Object.freeze({
    provider: 'openai',
    endpoint,
    authMode: 'BEARER',
    body: Object.freeze(body),
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  });
}
