import { describe, expect, it, vi } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  buildDevelopmentModelRoutesV2,
  buildQwenDevelopmentModelRouteV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import type { QwenProviderExecutorV2 } from '@/lib/editron/research/open-ended-planner/qwen-direct-provider-v2';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

const packet = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
const canonical = getCanonicalDev01Stage123V2().referenceBlueprints.BASELINE;

describe('open-ended planner V2 development cohort provider routes', () => {
  it('binds the intended current four-route cohort without silently pricing Qwen at zero', () => {
    const routes = routesWithFakes();
    expect(routes.map(({ routeId, claimedModelIdentity, costBasis }) => ({
      routeId, claimedModelIdentity, costBasis,
    }))).toEqual([
      { routeId: 'OPENAI_LUNA', claimedModelIdentity: 'gpt-5.6-luna', costBasis: 'USD_METERED' },
      { routeId: 'OPENAI_TERRA', claimedModelIdentity: 'gpt-5.6-terra', costBasis: 'USD_METERED' },
      { routeId: 'GOOGLE_FLASH', claimedModelIdentity: 'gemini-3.6-flash', costBasis: 'USD_METERED' },
      { routeId: 'QWEN_3_8_MAX', claimedModelIdentity: 'qwen3.8-max', costBasis: 'TOKEN_PLAN_CREDITS_UNPRICED' },
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
    expect(run.attempts[0].providerModel).toBe('gemini-3.6-flash-2026-08');
  });

  it('keeps Qwen on its isolated direct-provider adapter', async () => {
    const qwenExecuteMock = vi.fn(async ({ apiKey, prompt }: Parameters<QwenProviderExecutorV2>[0]) => {
      expect(apiKey).toBe('qwen-test');
      expect(prompt).not.toContain('qwen-test');
      return {
        stdout: qwenEvents(canonical), stderr: '', exitCode: 0, timedOut: false, latencyMs: 900,
      };
    });
    const qwenExecute = qwenExecuteMock as QwenProviderExecutorV2;
    const routes = routesWithFakes({ qwenExecute });
    const run = await requiredRoute(routes, 'QWEN_3_8_MAX').runStage(packet);
    expect(run.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(run.attempts[0]).toMatchObject({
      provider: 'alibaba-token-plan-direct', providerCostUsd: null,
    });
    expect(qwenExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('builds a Qwen-only diagnostic route without unrelated provider credentials', async () => {
    const qwenExecuteMock = vi.fn(async (input: Parameters<QwenProviderExecutorV2>[0]) => {
      expect(input.timeoutMs).toBe(900_000);
      return { stdout: qwenEvents(canonical), stderr: '', exitCode: 0, timedOut: false, latencyMs: 900 };
    });
    const route = buildQwenDevelopmentModelRouteV2({
      environment: { QWEN_API_KEY: 'qwen-test' },
      qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC', diagnosticTimeoutOverrideMs: 900_000,
      qwenExecute: qwenExecuteMock as QwenProviderExecutorV2,
    });
    expect((await route.runStage(packet)).disposition).toBe('ARTIFACT_ACCEPTED');
    expect(qwenExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('fails before dispatch when any required credential is absent', () => {
    expect(() => buildDevelopmentModelRoutesV2({
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      qwenBudgetMode: 'FAIR_STAGE_BUDGET',
    })).toThrow(/QWEN/);
  });
});

function routesWithFakes(overrides: {
  fetchImpl?: typeof fetch;
  qwenExecute?: QwenProviderExecutorV2;
} = {}) {
  return buildDevelopmentModelRoutesV2({
    environment: {
      OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test', QWEN_API_KEY: 'qwen-test',
    },
    qwenBudgetMode: 'FAIR_STAGE_BUDGET',
    fetchImpl: overrides.fetchImpl ?? fakeFetch,
    qwenExecute: overrides.qwenExecute ?? (() => Promise.resolve({
      stdout: qwenEvents(canonical), stderr: '', exitCode: 0, timedOut: false, latencyMs: 900,
    })),
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
      responseId: 'gemini-test', modelVersion: 'gemini-3.6-flash-2026-08',
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

function qwenEvents(artifact: unknown): string {
  return [
    JSON.stringify({ type: 'text', sessionID: 'qwen-test-session', part: { text: JSON.stringify(artifact) } }),
    JSON.stringify({
      type: 'step_finish', sessionID: 'qwen-test-session',
      part: {
        tokens: { input: 1_000, output: 500, reasoning: 100, total: 1_600, cache: { read: 0, write: 0 } },
        reason: 'stop',
      },
    }),
  ].join('\n');
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
