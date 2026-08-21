import { describe, expect, it } from 'vitest';

import { createProviderNativeLiveTransportV2R } from '@/lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

describe('provider-native live transport V2R', () => {
  it('uses exact provider auth while keeping secrets out of receipts', async () => {
    const observed: RequestInit[] = [];
    const transport = createProviderNativeLiveTransportV2R({
      environment: { OPENAI_API_KEY: 'openai-secret', GEMINI_API_KEY: 'google-secret' },
      fetchImpl: (async (_url, init) => {
        observed.push(init ?? {});
        return new Response(JSON.stringify({ id: 'r1', model: 'gpt-5.6-luna', usage: { input_tokens: 10 } }), { status: 200 });
      }) as typeof fetch,
    });
    await transport.invoke(request('openai'));
    expect(new Headers(observed[0].headers).get('authorization')).toBe('Bearer openai-secret');
    const receipt = transport.snapshot();
    expect(receipt.calls).toHaveLength(1);
    expect(receipt.calls[0]).toMatchObject({ returnedModelIdentity: 'gpt-5.6-luna', usage: { input_tokens: 10 } });
    expect(JSON.stringify(receipt)).not.toContain('openai-secret');
    expect(JSON.stringify(receipt)).not.toContain('google-secret');
  });

  it('rejects endpoint substitution before network access', async () => {
    let called = false;
    const transport = createProviderNativeLiveTransportV2R({
      environment: { OPENAI_API_KEY: 'openai-secret', GEMINI_API_KEY: 'google-secret' },
      fetchImpl: (async () => { called = true; return new Response('{}'); }) as typeof fetch,
    });
    await expect(transport.invoke({ ...request('openai'), endpoint: 'https://example.com/steal' }))
      .rejects.toThrow('PROVIDER_NATIVE_LIVE_ENDPOINT_INVALID');
    expect(called).toBe(false);
  });

  it('retries an identical transient request and records every attempt', async () => {
    let attempt = 0;
    const transport = createProviderNativeLiveTransportV2R({
      environment: { OPENAI_API_KEY: 'openai-secret', GEMINI_API_KEY: 'google-secret' },
      maxTransientAttempts: 2,
      fetchImpl: (async () => {
        attempt += 1;
        return attempt === 1
          ? new Response(JSON.stringify({ error: { message: 'retry in 0s' } }), {
              status: 429, headers: { 'retry-after': '0' },
            })
          : new Response(JSON.stringify({ id: 'r2', model: 'gemini-3.7-flash' }), { status: 200 });
      }) as typeof fetch,
    });
    const response = await transport.invoke(request('google'));
    const receipt = transport.snapshot();
    expect(response.status).toBe(200);
    expect(receipt.calls.map((call) => ({ attempt: call.attempt, status: call.responseStatus })))
      .toEqual([{ attempt: 1, status: 429 }, { attempt: 2, status: 200 }]);
    expect(new Set(receipt.calls.map((call) => call.requestHash)).size).toBe(1);
  });
});

function request(provider: 'openai' | 'google'): SerializedProviderNativeTurnV2R {
  return {
    provider,
    endpoint: provider === 'openai'
      ? 'https://api.openai.com/v1/responses'
      : 'https://generativelanguage.googleapis.com/v1beta/interactions',
    authMode: provider === 'openai' ? 'BEARER' : 'X_GOOG_API_KEY',
    body: { model: provider === 'openai' ? 'gpt-5.6-luna' : 'gemini-3.7-flash' },
    requestHash: 'a'.repeat(64),
  };
}
