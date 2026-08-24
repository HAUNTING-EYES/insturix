import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createProviderNativeDurableLiveTransportOwnerV2R,
  createProviderNativeLiveTransportV2R,
  createProviderNativeRouteLiveTransportV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

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

  it.each([
    {
      route: LUNA_ROUTE,
      environment: { OPENAI_API_KEY: 'openai-only' },
      expectedHeader: ['authorization', 'Bearer openai-only'],
    },
    {
      route: GOOGLE_ROUTE,
      environment: { GEMINI_API_KEY: 'google-only' },
      expectedHeader: ['x-goog-api-key', 'google-only'],
    },
  ] as const)('resolves $route.routeId with only its provider credential', async ({
    route, environment, expectedHeader,
  }) => {
    const observed: RequestInit[] = [];
    const owner = createProviderNativeDurableLiveTransportOwnerV2R({
      environment,
      fetchImpl: (async (_url, init) => {
        observed.push(init ?? {});
        return new Response(JSON.stringify({ id: 'route-bound', model: route.model }), {
          status: 200,
        });
      }) as typeof fetch,
    });
    const invoke = await owner.resolve({ route, episodeId: 'episode-route-bound' });
    await expect(invoke(boundRequest(route))).resolves.toMatchObject({ status: 200 });
    expect(new Headers(observed[0].headers).get(expectedHeader[0])).toBe(expectedHeader[1]);
  });

  it('rejects route, model, and request-hash substitution before network access', async () => {
    let called = false;
    const owner = createProviderNativeDurableLiveTransportOwnerV2R({
      environment: { OPENAI_API_KEY: 'openai-only' },
      fetchImpl: (async () => {
        called = true;
        return new Response(JSON.stringify({ model: LUNA_ROUTE.model }), { status: 200 });
      }) as typeof fetch,
    });
    const invoke = await owner.resolve({ route: LUNA_ROUTE, episodeId: 'episode-bound' });
    const substituted = boundRequest(TERRA_ROUTE);
    await expect(invoke(substituted)).rejects.toThrow('REQUEST_ROUTE_MISMATCH');
    await expect(invoke({ ...boundRequest(LUNA_ROUTE), requestHash: 'f'.repeat(64) }))
      .rejects.toThrow('REQUEST_HASH_MISMATCH');
    expect(called).toBe(false);
    await expect(owner.resolve({
      route: { ...LUNA_ROUTE, claimedModelIdentity: TERRA_ROUTE.model },
      episodeId: 'episode-forged-route',
    })).rejects.toThrow('ROUTE_IDENTITY_INVALID');
    await expect(owner.resolve({
      route: {
        ...TERRA_ROUTE, model: 'gpt-unregistered',
        claimedModelIdentity: 'gpt-unregistered',
      } as unknown as ProviderNativeRouteV2R,
      episodeId: 'episode-unregistered-model',
    })).rejects.toThrow('ROUTE_IDENTITY_INVALID');
    await expect(owner.resolve({
      route: { ...LUNA_ROUTE, routeId: 'UNKNOWN_ROUTE' } as unknown as ProviderNativeRouteV2R,
      episodeId: 'episode-unknown-route',
    })).rejects.toThrow('ROUTE_IDENTITY_INVALID');
  });

  it('rejects a successful response issued by a different model', async () => {
    const owner = createProviderNativeDurableLiveTransportOwnerV2R({
      environment: { OPENAI_API_KEY: 'openai-only' },
      fetchImpl: (async () => new Response(JSON.stringify({
        id: 'wrong-model', model: TERRA_ROUTE.model,
      }), { status: 200 })) as typeof fetch,
    });
    const invoke = await owner.resolve({ route: LUNA_ROUTE, episodeId: 'episode-model-check' });
    await expect(invoke(boundRequest(LUNA_ROUTE)))
      .rejects.toThrow('RETURNED_MODEL_IDENTITY_MISMATCH');
  });

  it('never hides a transient retry inside one durable provider attempt', async () => {
    let calls = 0;
    const owner = createProviderNativeDurableLiveTransportOwnerV2R({
      environment: { OPENAI_API_KEY: 'openai-only' },
      fetchImpl: (async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: 'retry in 0s' } }), {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }) as typeof fetch,
    });
    const invoke = await owner.resolve({
      route: LUNA_ROUTE,
      episodeId: 'episode-no-hidden-retry',
    });

    await expect(invoke(boundRequest(LUNA_ROUTE)))
      .resolves.toMatchObject({ status: 429 });
    expect(calls).toBe(1);
  });

  it.each([
    {
      route: LUNA_ROUTE,
      environment: { OPENAI_API_KEY: 'openai-route-only' },
      expectedHeader: ['authorization', 'Bearer openai-route-only'],
    },
    {
      route: GOOGLE_ROUTE,
      environment: { GEMINI_API_KEY: 'google-route-only' },
      expectedHeader: ['x-goog-api-key', 'google-route-only'],
    },
  ] as const)('receipts one attempt for independently healthy $route.routeId', async ({
    route, environment, expectedHeader,
  }) => {
    let calls = 0;
    const transport = createProviderNativeRouteLiveTransportV2R({
      route,
      environment,
      fetchImpl: (async (_url, init) => {
        calls += 1;
        expect(new Headers(init?.headers).get(expectedHeader[0])).toBe(expectedHeader[1]);
        return new Response(JSON.stringify({
          id: 'route-receipt', model: route.model,
          usage: { input_tokens: 10, output_tokens: 2 },
        }), { status: 200 });
      }) as typeof fetch,
    });
    await expect(transport.invoke(boundRequest(route))).resolves.toMatchObject({ status: 200 });
    const receipt = transport.snapshot();
    expect(calls).toBe(1);
    expect(receipt.calls).toHaveLength(1);
    expect(receipt.calls[0]).toMatchObject({
      attempt: 1, provider: route.provider, returnedModelIdentity: route.model,
    });
    expect(receipt.secretsPersisted).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(Object.values(environment)[0]);
  });

  it('does not retry a transient response on the route-scoped transport', async () => {
    let calls = 0;
    const transport = createProviderNativeRouteLiveTransportV2R({
      route: LUNA_ROUTE,
      environment: { OPENAI_API_KEY: 'openai-route-only' },
      fetchImpl: (async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: 'retry in 0s' } }), {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }) as typeof fetch,
    });
    await expect(transport.invoke(boundRequest(LUNA_ROUTE)))
      .resolves.toMatchObject({ status: 429 });
    expect(calls).toBe(1);
    expect(transport.snapshot().calls).toHaveLength(1);
  });
});

const LUNA_ROUTE = route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna');
const TERRA_ROUTE = route('OPENAI_TERRA', 'openai', 'gpt-5.6-terra');
const GOOGLE_ROUTE = route('GOOGLE_FLASH', 'google', 'gemini-3.7-flash');

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

function route(
  routeId: ProviderNativeRouteV2R['routeId'],
  provider: ProviderNativeRouteV2R['provider'],
  model: ProviderNativeRouteV2R['model'],
): Readonly<ProviderNativeRouteV2R> {
  return { routeId, provider, model, claimedModelIdentity: model, reasoningMode: 'medium' };
}

function boundRequest(
  selectedRoute: Readonly<ProviderNativeRouteV2R>,
): SerializedProviderNativeTurnV2R {
  const endpoint = selectedRoute.provider === 'openai'
    ? 'https://api.openai.com/v1/responses'
    : 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = { model: selectedRoute.model, input: [] };
  return {
    provider: selectedRoute.provider,
    endpoint,
    authMode: selectedRoute.provider === 'openai' ? 'BEARER' : 'X_GOOG_API_KEY',
    body,
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  };
}
