import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import {
  assertStage25FinalGeneralisationProviderPreflightBundleV1,
  preflightStage25FinalGeneralisationProvidersV1,
} from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';

const environment = {
  OPENAI_API_KEY: 'unit-openai-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'unit-google-production-secret',
};
const now = '2026-08-26T12:00:00.000Z';

describe('Stage 2.5 final generalisation provider preflight V1', () => {
  it('binds current official price facts to the exact frozen route roster', async () => {
    const result = await run();
    expect(result.receipt.pricingEvidence).toEqual([
      expect.objectContaining({
        routeId: 'OPENAI_LUNA', model: 'gpt-5.6-luna',
        pricing: { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02,
          cacheWriteUsdPerMillion: 0.25, outputUsdPerMillion: 1.2 },
      }),
      expect.objectContaining({
        routeId: 'OPENAI_TERRA', model: 'gpt-5.6-terra',
        pricing: { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2,
          cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 12 },
      }),
      expect.objectContaining({
        routeId: 'GOOGLE_FLASH', model: 'gemini-3.7-flash',
        validThrough: '2026-12-31T23:59:59.999Z',
        pricing: { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075,
          cacheWriteUsdPerMillion: 0.75, outputUsdPerMillion: 3.75 },
      }),
    ]);
    expect(result.receipt.absoluteTwoAttemptMaxSpendUsd).toBe(9.2463104);
  });

  it('checks three model identities and eight official Google token counts without inference', async () => {
    const fetchImpl = vi.fn(mockFetch);
    const result = await run(fetchImpl);
    expect(result.captures).toHaveLength(24);
    expect(new Set(result.captures.map(({ rowId }) => rowId)).size).toBe(24);
    expect(result.captures.filter(({ provider }) => provider === 'openai')).toHaveLength(16);
    expect(result.captures.filter(({ provider }) => provider === 'google')).toHaveLength(8);
    expect(result.captures.filter(({ provider }) => provider === 'openai')
      .every(({ maxBillableGeneratedTokensPerAttempt }) =>
        maxBillableGeneratedTokensPerAttempt === 8_192)).toBe(true);
    expect(result.captures.filter(({ provider }) => provider === 'google')
      .every(({ maxBillableGeneratedTokensPerAttempt }) =>
        maxBillableGeneratedTokensPerAttempt === 65_536)).toBe(true);
    expect(result.receipt).toMatchObject({
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 8,
        pricingDocumentNetworkCalls: 0, inferenceCalls: 0 },
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      projectReads: 0, projectMutations: 0, dispatchAuthorized: false,
      assessment: 'PASS_24_REQUESTS_PROVIDER_ACCESS_AND_TOKEN_BOUNDS_NO_INFERENCE',
    });
    const calls = fetchImpl.mock.calls.map(([url, init]) => ({
      url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''),
    }));
    expect(calls.filter(({ method }) => method === 'GET')).toHaveLength(3);
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(8);
    expect(calls.some(({ url }) => url.endsWith('/responses')
      || url.endsWith('/interactions'))).toBe(false);
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))
      .every(({ body }) => body.includes('finish_editron_research_episode'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(environment.OPENAI_API_KEY);
    expect(JSON.stringify(result)).not.toContain(environment.GOOGLE_GENERATIVE_AI_API_KEY);
    expect(() => assertStage25FinalGeneralisationProviderPreflightBundleV1(result)).not.toThrow();
  });

  it('rejects stale confirmation, fallback Google credentials, expired pricing and wrong identity', async () => {
    await expect(preflightStage25FinalGeneralisationProvidersV1({
      confirmedCohortSha256: '0'.repeat(64), operatorId: 'admin', environment,
      fetchImpl: mockFetch, now,
    })).rejects.toThrow('AUTHORIZATION_INVALID');
    await expect(preflightStage25FinalGeneralisationProvidersV1({
      confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
      operatorId: 'admin', environment: { OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'fallback' },
      fetchImpl: mockFetch, now,
    })).rejects.toThrow('PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
    await expect(preflightStage25FinalGeneralisationProvidersV1({
      confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
      operatorId: 'admin', environment, fetchImpl: mockFetch,
      now: '2027-01-01T00:00:00.000Z',
    })).rejects.toThrow('PRICING_DRIFT_OR_EXPIRED:GOOGLE_FLASH');
    await expect(preflightStage25FinalGeneralisationProvidersV1({
      confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
      operatorId: 'admin', environment, now,
      fetchImpl: async (url, init) => String(url).endsWith('/gpt-5.6-luna')
        ? json({ id: 'wrong-model' }) : mockFetch(url, init),
    })).rejects.toThrow('MODEL_ACCESS_FAILED:OPENAI_LUNA');
    await expect(run(async (url, init) => String(url).endsWith('/gemini-3.7-flash')
      ? json({ name: 'models/gemini-3.7-flash', outputTokenLimit: 8_192 })
      : mockFetch(url, init)))
      .rejects.toThrow('MODEL_OUTPUT_LIMIT_DRIFT:GOOGLE_FLASH');
  });

  it('rejects provider count failure and token overflow', async () => {
    await expect(run(async (url, init) => String(url).endsWith(':countTokens')
      ? json({ error: 'unavailable' }, 503) : mockFetch(url, init)))
      .rejects.toThrow('GOOGLE_COUNT_FAILED:503');
    await expect(run(async (url, init) => String(url).endsWith(':countTokens')
      ? json({ totalTokens: 100_000 }) : mockFetch(url, init)))
      .rejects.toThrow('INPUT_BUDGET_EXCEEDED');
  });

  it('rejects rehashed forged metadata, captures, state effects and spend', async () => {
    const result = await run();
    for (const mutate of [
      (value: Record<string, unknown>) => { value.modelMetadata = []; },
      (value: Record<string, unknown>) => { value.checks = []; },
      (value: Record<string, unknown>) => { value.stateEffects = {}; },
      (value: Record<string, unknown>) => { value.absoluteTwoAttemptMaxSpendUsd = 1; },
    ]) {
      const receipt = structuredClone(result.receipt) as unknown as Record<string, unknown>;
      mutate(receipt);
      const { receiptSha256: _hash, ...material } = receipt;
      receipt.receiptSha256 = hashCanonicalJsonV1(material);
      expect(() => assertStage25FinalGeneralisationProviderPreflightBundleV1({
        receipt, captures: result.captures,
      })).toThrow('BUNDLE_INVALID');
    }
    const captures = result.captures.map((capture) => ({ ...capture }));
    captures[0] = { ...captures[0], boundedInputTokens: 1 };
    expect(() => assertStage25FinalGeneralisationProviderPreflightBundleV1({
      receipt: result.receipt, captures,
    })).toThrow('BUNDLE_INVALID');
  });
});

function run(fetchImpl: typeof fetch = mockFetch) {
  return preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: 'admin', environment, fetchImpl, now,
  });
}
async function mockFetch(url: URL | RequestInfo, _init?: RequestInit): Promise<Response> {
  const target = String(url);
  if (target.endsWith('/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (target.endsWith('/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (target.endsWith('/gemini-3.7-flash')) return json({
    name: 'models/gemini-3.7-flash', version: 'gemini-3.7-flash',
    inputTokenLimit: 1_048_576, outputTokenLimit: 65_536,
  });
  if (target.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected network endpoint' }, 500);
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json' },
  });
}
