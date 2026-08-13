import { describe, expect, it } from 'vitest';

import { runDevelopmentSmokeV2 } from '@/lib/editron/research/open-ended-planner/provider-smoke-runner-v2';
import { buildDevelopmentSmokePreflightV2 } from '@/lib/editron/research/open-ended-planner/smoke-preflight-v2';

describe('open-ended planner V2 provider smoke runner', () => {
  it('counts exact Google requests and excludes credentials and media bytes from receipts', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as { planHash: string };
    let countCalls = 0;
    let generationCalls = 0;
    const receipt = await runDevelopmentSmokeV2({
      expectedPlanHash: plan.planHash,
      maxAuthorizedSpendUsd: 4,
      operatorId: 'admin',
      confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-secret-sentinel', GEMINI_API_KEY: 'google-secret-sentinel' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) {
          countCalls += 1;
          return response({ totalTokens: 2_000 });
        }
        generationCalls += 1;
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string'
          ? request.model
          : decodeURIComponent(endpoint.match(/models\/([^:]+):generateContent/)?.[1] ?? 'google-test');
        return endpoint.includes('api.openai.com')
          ? response(openAI(model))
          : response(google(model));
      },
    });

    expect(countCalls).toBe(4);
    expect(generationCalls).toBe(6);
    expect(receipt.rows).toHaveLength(6);
    expect(receipt.rows.filter(({ comparisonPurpose }) => comparisonPurpose === 'FAIR_ORDERED_IMAGE_SEQUENCE_COMPARISON')).toHaveLength(4);
    expect(receipt.rows.filter(({ comparisonPurpose }) => comparisonPurpose === 'NATIVE_REFERENCE_VIDEO_COMPARISON')).toHaveLength(2);
    expect(receipt.rows.every(({ run }) => run.disposition === 'ARTIFACT_ACCEPTED')).toBe(true);
    expect(receipt.rows.flatMap(({ preflightCounts }) => preflightCounts)
      .filter(({ method }) => method === 'GOOGLE_COUNT_TOKENS')).toHaveLength(4);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.actualProviderCostUsd).toBeGreaterThan(0);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('openai-secret-sentinel');
    expect(serialized).not.toContain('google-secret-sentinel');
    expect(serialized).not.toContain('data:image/');
  });

  it('recounts the exact repair request before a second provider attempt', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as { planHash: string };
    let generationCalls = 0;
    const receipt = await runDevelopmentSmokeV2({
      expectedPlanHash: plan.planHash,
      maxAuthorizedSpendUsd: 4,
      operatorId: 'admin',
      confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) return response({ totalTokens: 2_000 });
        generationCalls += 1;
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string' ? request.model : 'google-test';
        if (generationCalls === 1) return response(openAI(model, 'not-json'));
        return endpoint.includes('api.openai.com') ? response(openAI(model)) : response(google(model));
      },
    });
    expect(receipt.rows[0].run.attempts.map(({ disposition }) => disposition))
      .toEqual(['MALFORMED_JSON', 'ARTIFACT_ACCEPTED']);
    expect(receipt.rows[0].preflightCounts).toHaveLength(2);
    expect(receipt.rows[0].preflightCounts[1].method).toBe('OFFLINE_REPAIR_DELTA_UPPER_BOUND');
    expect(receipt.rows[0].preflightCounts[1].generationRequestHash)
      .not.toBe(receipt.rows[0].preflightCounts[0].generationRequestHash);
    expect(generationCalls).toBe(7);
  });
});

function artifact() {
  return {
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-02',
    globalEditorialLanguage: [], recurringDesignGrammar: [], uniqueMoments: [], targetClaims: [],
    temporalStructure: [], uncertainties: [], evidenceIds: [],
  };
}

function openAI(model: string, text = JSON.stringify(artifact())) {
  return {
    id: `resp-${model}`, model, status: 'completed',
    output: [{ content: [{ type: 'output_text', text }] }],
    usage: {
      input_tokens: 2_000, output_tokens: 120,
      output_tokens_details: { reasoning_tokens: 20 }, total_tokens: 2_120,
    },
  };
}

function google(model: string) {
  return {
    responseId: `resp-${model}`, modelVersion: model,
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(artifact()) }] } }],
    usageMetadata: {
      promptTokenCount: 2_000, candidatesTokenCount: 100,
      thoughtsTokenCount: 20, totalTokenCount: 2_120,
    },
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
