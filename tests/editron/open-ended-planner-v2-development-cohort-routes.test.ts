import { describe, expect, it, vi } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  buildDevelopmentModelRoutesV2,
  buildV2RNextBenchmarkModelRoutesV2,
  buildV2RNextBenchmarkRouteRosterV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

const packet = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
const canonical = getCanonicalDev01Stage123V2().referenceBlueprints.BASELINE;

describe('open-ended planner V2 development cohort provider routes', () => {
  it('binds the intended future cohort to Luna, Terra, and Gemini 3.7 only', () => {
    const routes = routesWithFakes();
    expect(routes.map(({ routeId, claimedModelIdentity, costBasis }) => ({
      routeId, claimedModelIdentity, costBasis,
    }))).toEqual([
      { routeId: 'OPENAI_LUNA', claimedModelIdentity: 'gpt-5.6-luna', costBasis: 'USD_METERED' },
      { routeId: 'OPENAI_TERRA', claimedModelIdentity: 'gpt-5.6-terra', costBasis: 'USD_METERED' },
      { routeId: 'GOOGLE_FLASH', claimedModelIdentity: 'gemini-3.7-flash', costBasis: 'USD_METERED' },
    ]);
  });

  it('uses the shared direct transport for Luna and preserves native provider identity', async () => {
    const routes = routesWithFakes();
    const run = await requiredRoute(routes, 'OPENAI_LUNA').runStage(packet);
    expect(run).toMatchObject({
      disposition: 'ARTIFACT_ACCEPTED',
      packetHash: packet.packetHash,
      artifact: canonical,
    });
    expect(run.attempts[0]).toMatchObject({
      providerModel: 'gpt-5.6-luna-2026-08-07',
      providerRequestId: 'resp-luna-test',
    });
    expect(run.attempts[0].providerCostUsd).toBeGreaterThan(0);
  });

  it('uses Google countTokens before the Gemini generation request', async () => {
    const fetchImpl = vi.fn(fakeFetch);
    const routes = routesWithFakes({ fetchImpl });
    const run = await requiredRoute(routes, 'GOOGLE_FLASH').runStage(packet);
    expect(run.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining(':countTokens'),
      expect.stringContaining(':generateContent'),
    ]);
    expect(run.attempts[0].providerModel).toBe('3.7-flash-08-2026');
  });

  it('builds the exact next V2R roster and excludes retired providers', () => {
    expect(buildV2RNextBenchmarkRouteRosterV2().map(({ routeId, structuredOutputMode }) => ({
      routeId, structuredOutputMode,
    }))).toEqual([
      { routeId: 'OPENAI_LUNA', structuredOutputMode: 'NATIVE_JSON_SCHEMA_NON_STRICT' },
      { routeId: 'OPENAI_TERRA', structuredOutputMode: 'NATIVE_JSON_SCHEMA_NON_STRICT' },
      { routeId: 'GOOGLE_FLASH', structuredOutputMode: 'NATIVE_JSON_SCHEMA' },
    ]);
    const routes = buildV2RNextBenchmarkModelRoutesV2({
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      fetchImpl: fakeFetch,
    });
    expect(routes.map(({ routeId, claimedModelIdentity }) => ({ routeId, claimedModelIdentity })))
      .toEqual([
        { routeId: 'OPENAI_LUNA', claimedModelIdentity: 'gpt-5.6-luna' },
        { routeId: 'OPENAI_TERRA', claimedModelIdentity: 'gpt-5.6-terra' },
        { routeId: 'GOOGLE_FLASH', claimedModelIdentity: 'gemini-3.7-flash' },
      ]);
  });

  it('fails before dispatch when any required credential is absent', () => {
    expect(() => buildDevelopmentModelRoutesV2({
      environment: { OPENAI_API_KEY: 'openai-test' },
    })).toThrow(/GEMINI_API_KEY_OR_GOOGLE_API_KEY/);
  });
});

function routesWithFakes(overrides: {
  fetchImpl?: typeof fetch;
} = {}) {
  return buildDevelopmentModelRoutesV2({
    environment: {
      OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test',
    },
    fetchImpl: overrides.fetchImpl ?? fakeFetch,
  });
}

function requiredRoute(routes: ReturnType<typeof routesWithFakes>, routeId: string) {
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`TEST_ROUTE_MISSING:${routeId}`);
  return route;
}

async function fakeFetch(url: string | URL | Request): Promise<Response> {
  const endpoint = String(url);
  if (endpoint.includes(':countTokens')) return jsonResponse({ totalTokens: 1_000 });
  if (endpoint.includes('generativelanguage.googleapis.com')) {
    return jsonResponse({
      responseId: 'gemini-test', modelVersion: '3.7-flash-08-2026',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(canonical) }] } }],
      usageMetadata: {
        promptTokenCount: 1_000, candidatesTokenCount: 500,
        thoughtsTokenCount: 100, totalTokenCount: 1_600,
      },
    });
  }
  return jsonResponse({
    id: 'resp-luna-test', model: 'gpt-5.6-luna-2026-08-07', system_fingerprint: 'fp-test',
    status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(canonical) }] }],
    usage: {
      input_tokens: 1_000, output_tokens: 600,
      output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 1_600,
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
