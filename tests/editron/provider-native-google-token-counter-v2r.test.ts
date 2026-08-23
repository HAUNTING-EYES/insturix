import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { createProviderNativeGoogleInputTokenCounterV2R }
  from '@/lib/editron/services/provider-native-google-token-counter-v2r';

const SECRET = 'google-secret-for-test';

describe('provider-native Google token counter V2R', () => {
  it('adds conservative margin and structural allowance to the official count', async () => {
    const fetchImpl = vi.fn(async (
      _url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1],
    ) => new Response(JSON.stringify({ totalTokens: 1_000,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000 }] }),
    { status: 200 }));
    const counter = createProviderNativeGoogleInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) }, fetchImpl,
    });
    const route = googleRoute(); const request = googleRequest();
    const receipt = await counter.count({ route,
      routeSha256: hashCanonicalJsonV1(route), request });

    expect(receipt.inputTokensUpperBound).toBeGreaterThan(1_150);
    expect(receipt.method).toBe(
      'GOOGLE_EQUIVALENT_COUNT_TOKENS_MARGIN_115_STRUCTURAL_V1');
    expect(receipt.requestHash).toBe(request.requestHash);
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('gemini-3.7-flash:countTokens');
    expect(init?.headers).toEqual({ 'content-type': 'application/json',
      'x-goog-api-key': SECRET });
    const countBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(countBody).toHaveProperty('generateContentRequest');
    expect(JSON.stringify(countBody)).not.toContain('"input":[{"type"');
  });

  it('fails before egress on invalid shape or missing credentials', async () => {
    const fetchImpl = vi.fn(); const route = googleRoute();
    const counter = createProviderNativeGoogleInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) }, fetchImpl,
    });
    await expect(counter.count({ route, routeSha256: hashCanonicalJsonV1(route),
      request: googleRequest({ extra: true }) })).rejects.toThrow(
      'GOOGLE_COUNT_SOURCE_BODY_FIELDS_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();

    const missing = createProviderNativeGoogleInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => '') }, fetchImpl,
    });
    await expect(missing.count({ route, routeSha256: hashCanonicalJsonV1(route),
      request: googleRequest() })).rejects.toThrow(
      'GOOGLE_TOKEN_COUNTER_CREDENTIAL_MISSING');
  });

  it('rejects malformed and HTTP-error count responses', async () => {
    const route = googleRoute(); const request = googleRequest();
    const malformed = createProviderNativeGoogleInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) },
      fetchImpl: vi.fn(async () => new Response('{"totalTokens":1.5}', { status: 200 })),
    });
    await expect(malformed.count({ route, routeSha256: hashCanonicalJsonV1(route),
      request })).rejects.toThrow('GOOGLE_TOKEN_COUNTER_RESPONSE_COUNT_INVALID');
    const denied = createProviderNativeGoogleInputTokenCounterV2R({
      credentialOwner: { credentialFor: vi.fn(() => SECRET) },
      fetchImpl: vi.fn(async () => new Response('{"totalTokens":10}', { status: 403 })),
    });
    await expect(denied.count({ route, routeSha256: hashCanonicalJsonV1(route),
      request })).rejects.toThrow('GOOGLE_TOKEN_COUNTER_RESPONSE_INVALID:403');
  });
});

function googleRoute(): Readonly<ProviderNativeRouteV2R> {
  return Object.freeze({ routeId: 'GOOGLE_FLASH', provider: 'google',
    model: 'gemini-3.7-flash', claimedModelIdentity: 'gemini-3.7-flash',
    reasoningMode: 'medium' });
}
function googleRequest(extra: Readonly<Record<string, unknown>> = {}):
Readonly<SerializedProviderNativeTurnV2R> {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = { model: 'gemini-3.7-flash', store: false,
    input: [{ type: 'user_input', content: [{ type: 'text', text: 'Plan.' }] }],
    tools: [{ type: 'function', name: 'read_project', description: 'Read project.',
      parameters: { type: 'object', properties: {}, additionalProperties: false } }],
    generation_config: { max_output_tokens: 512, thinking_level: 'medium',
      tool_choice: 'auto' }, ...extra };
  return Object.freeze({ provider: 'google', endpoint, authMode: 'X_GOOG_API_KEY',
    body: Object.freeze(body), requestHash: hashCanonicalJsonV1({ endpoint, body }) });
}
