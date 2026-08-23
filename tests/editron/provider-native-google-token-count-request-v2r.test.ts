import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { buildProviderNativeGoogleCountRequestV2R }
  from '@/lib/editron/services/provider-native-google-token-count-request-v2r';

describe('provider-native Google count request V2R', () => {
  it('maps multimodal stateless Interactions history and tools without flattening media', () => {
    const route = googleRoute();
    const request = googleRequest([
      { type: 'user_input', status: 'done', content: [
        { type: 'text', text: 'Inspect this.' },
        { type: 'image', data: 'YWJj', mime_type: 'image/png', resolution: 'high' },
      ] },
      { type: 'thought', signature: 'signed-thought', summary: [
        { type: 'text', text: 'Need evidence.' },
      ] },
      { type: 'function_call', id: 'call-1', name: 'read_project',
        arguments: { projectId: 'p1' }, status: 'waiting' },
      { type: 'function_result', call_id: 'call-1', name: 'read_project',
        result: [{ type: 'text', text: '{"revision":"r1"}' }], status: 'done' },
      { type: 'model_output', content: [{ type: 'text', text: 'Ready.' }], status: 'done' },
    ]);
    const counted = buildProviderNativeGoogleCountRequestV2R({
      route, routeSha256: hashCanonicalJsonV1(route), request,
    });
    const generated = counted.body.generateContentRequest;
    const contents = generated.contents as Array<Record<string, unknown>>;

    expect(counted.endpoint).toContain('gemini-3.7-flash:countTokens');
    expect(counted.generationRequestHash).toBe(request.requestHash);
    expect(contents).toHaveLength(4);
    expect(contents[0]).toEqual({ role: 'user', parts: [
      { text: 'Inspect this.' },
      { inlineData: { mimeType: 'image/png', data: 'YWJj' },
        mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } },
    ] });
    expect(contents[1]).toEqual({ role: 'model', parts: [
      { text: 'Need evidence.', thought: true, thoughtSignature: 'signed-thought' },
      { functionCall: { id: 'call-1', name: 'read_project', args: { projectId: 'p1' } } },
    ] });
    expect(contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: {
      id: 'call-1', name: 'read_project', response: { output: { revision: 'r1' } },
    } }] });
    expect(contents[3]).toEqual({ role: 'model', parts: [{ text: 'Ready.' }] });
    expect(JSON.stringify(generated)).toContain('functionDeclarations');
    expect(counted.protocolOverheadTokenAllowance).toBeGreaterThan(512);
  });

  it('rejects unsupported steps, hidden fields and copied routes', () => {
    const route = googleRoute();
    expect(() => buildProviderNativeGoogleCountRequestV2R({
      route, routeSha256: hashCanonicalJsonV1(route),
      request: googleRequest([{ type: 'google_search_call', id: 'x' }]),
    })).toThrow('GOOGLE_COUNT_STEP_UNSUPPORTED');
    expect(() => buildProviderNativeGoogleCountRequestV2R({
      route, routeSha256: hashCanonicalJsonV1(route),
      request: googleRequest([{ type: 'user_input', content: [
        { type: 'text', text: 'x', hidden: true },
      ] }]),
    })).toThrow('GOOGLE_COUNT_TEXT_CONTENT_FIELDS_INVALID');
    expect(() => buildProviderNativeGoogleCountRequestV2R({
      route: { ...route, claimedModelIdentity: 'copied-model' },
      routeSha256: hashCanonicalJsonV1({ ...route, claimedModelIdentity: 'copied-model' }),
      request: googleRequest([{ type: 'user_input', content: [{ type: 'text', text: 'x' }] }]),
    })).toThrow('GOOGLE_COUNT_ROUTE_OR_REQUEST_INVALID');
  });
});

function googleRoute(): Readonly<ProviderNativeRouteV2R> {
  return Object.freeze({ routeId: 'GOOGLE_FLASH', provider: 'google',
    model: 'gemini-3.7-flash', claimedModelIdentity: 'gemini-3.7-flash',
    reasoningMode: 'medium' });
}

function googleRequest(input: readonly unknown[]): Readonly<SerializedProviderNativeTurnV2R> {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = { model: 'gemini-3.7-flash', store: false, input: [...input], tools: [{
    type: 'function', name: 'read_project', description: 'Read the project.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }], generation_config: { max_output_tokens: 512, thinking_level: 'medium',
    tool_choice: 'auto' } };
  return Object.freeze({ provider: 'google', endpoint, authMode: 'X_GOOG_API_KEY',
    body: Object.freeze(body), requestHash: hashCanonicalJsonV1({ endpoint, body }) });
}
