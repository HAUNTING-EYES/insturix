import { describe, expect, it, vi } from 'vitest';

import {
  buildStage25RouteAblationProviderManifestV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1';
import {
  assertStage25RouteAblationPreflightReceiptV1,
  preflightStage25RouteAblationProvidersV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1';

const environment = {
  OPENAI_API_KEY: 'unit-openai-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'unit-google-secret',
};

describe('Stage 2.5 route-ablation provider zero-inference preflight V1', () => {
  it('freezes 24 current-route rows with a truthful two-attempt ceiling', () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    expect(manifest.rows).toHaveLength(24);
    expect(new Set(manifest.rows.map(({ rowId }) => rowId)).size).toBe(24);
    expect(manifest.routeRoster.map(({ model }) => model)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash',
    ]);
    expect(manifest.absoluteMaxSpendUsd).toBe(33.6);
  });

  it('captures all requests, uses official Google counting, and performs no inference', async () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    const fetchImpl = vi.fn(mockFetch);
    const result = await preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl,
    });
    expect(result.requestCaptures).toHaveLength(24);
    expect(new Set(result.requestCaptures.map(({ captureId }) => captureId)).size).toBe(24);
    expect(result.receipt).toMatchObject({
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 8, inferenceCalls: 0 },
      projectReads: 0, projectMutations: 0, secretsPersisted: false,
      dispatchAuthorized: false,
      assessment: 'PASS_24_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE',
    });
    const calls = fetchImpl.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method }));
    expect(calls.filter(({ method }) => method === 'GET')).toHaveLength(3);
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(8);
    expect(calls.some(({ url }) => url.endsWith(':generateContent') || url.endsWith('/responses'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain(environment.OPENAI_API_KEY);
    expect(JSON.stringify(result)).not.toContain(environment.GOOGLE_GENERATIVE_AI_API_KEY);
    expect(() => assertStage25RouteAblationPreflightReceiptV1(result.receipt, manifest)).not.toThrow();
  });

  it('rejects stale approval, fallback Google credentials, wrong model identity and token overflow', async () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    await expect(preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: '0'.repeat(64), operatorId: 'admin',
      environment, fetchImpl: mockFetch,
    })).rejects.toThrow('STAGE25_ROUTE_PREFLIGHT_OPERATOR_AUTHORIZATION_INVALID');
    await expect(preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256, operatorId: 'admin',
      environment: { OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'fallback' }, fetchImpl: mockFetch,
    })).rejects.toThrow('STAGE25_ROUTE_PREFLIGHT_PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
    await expect(preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256, operatorId: 'admin',
      environment, fetchImpl: async (url, init) => String(url).includes('/models/gpt-5.6-luna')
        ? json({ id: 'wrong-model' }) : mockFetch(url, init),
    })).rejects.toThrow('STAGE25_ROUTE_PREFLIGHT_MODEL_ACCESS_FAILED:OPENAI_LUNA');
    await expect(preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256, operatorId: 'admin',
      environment, fetchImpl: async (url, init) => String(url).endsWith(':countTokens')
        ? json({ totalTokens: 100_000 }) : mockFetch(url, init),
    })).rejects.toThrow('STAGE25_ROUTE_PREFLIGHT_INPUT_BUDGET_EXCEEDED');
  });

  it('rejects a forged receipt', async () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    const result = await preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: mockFetch,
    });
    expect(() => assertStage25RouteAblationPreflightReceiptV1({
      ...result.receipt, projectReads: 1,
    }, manifest)).toThrow('STAGE25_ROUTE_PREFLIGHT_RECEIPT_INVALID');
  });
});

async function mockFetch(url: URL | RequestInfo, _init?: RequestInit): Promise<Response> {
  const target = String(url);
  if (target.includes('/v1/models/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (target.includes('/v1/models/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (target.includes('/v1beta/models/gemini-3.7-flash') && !target.endsWith(':countTokens')) {
    return json({ name: 'models/gemini-3.7-flash' });
  }
  if (target.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected inference endpoint' }, 500);
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
